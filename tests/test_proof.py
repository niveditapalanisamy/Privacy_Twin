import copy
import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from core.challenge import run_challenge
from core.engine import DEFAULT_CONFIG, analyze, sensitivity
from core.evaluation import evaluate
from core.service import Service
from core.storage import Store
from main import create_app
from tools.verify_evidence import verify


def test_sensitivity_removes_signals_and_preserves_group_caps():
    config = copy.deepcopy(DEFAULT_CONFIG)
    config["rules"].append(config["rules"][0] | {"id": "email_duplicate"})
    snapshot = analyze("email", ["one@example.test"] * 20, config)
    original = copy.deepcopy(snapshot)
    experiment = sensitivity(snapshot, ["name_hint"])
    assert experiment["before"]["candidates"][0]["score"] == .7
    assert experiment["after"]["candidates"][0]["score"] == .5
    assert experiment["after"]["suggested"] == "Contact"
    assert sensitivity(snapshot, ["name_hint", "value_format"])["after"]["suggested"] is None
    assert snapshot == original
    with pytest.raises(ValueError, match="Unknown evidence"):
        sensitivity(snapshot, ["not-a-signal"])


def test_checksum_experiment_retains_rejected_format_evidence():
    snapshot = analyze("unlabelled", ["27AAPFU0939F1Z0"] * 20, DEFAULT_CONFIG)
    assert snapshot["suggested"] is None
    evidence = next(e for e in snapshot["evidence"] if e["detector_id"] == "gstin")
    assert evidence["matches"] == 0 and evidence["format_matches"] == 20
    experiment = sensitivity(snapshot, [], without_checksums=True)
    assert experiment["after"]["suggested"] == "Official ID"
    assert experiment["complete_validation_evidence"]
    assert sensitivity(snapshot, ["value_format"], True)["after"]["suggested"] is None


def test_challenge_uses_real_lifecycle_and_reports_negative_cases():
    report = run_challenge()
    assert report["correct"] == report["total"] == 33
    assert report["false_reopenings"] == report["missed_reopenings"] == 0
    scenarios = {s["id"]: s for s in report["scenarios"]}
    assert all(c["observed"] == "current" for c in scenarios["unrelated_rule"]["checks"])
    assert any(c["observed"] == "unreviewed" for c in scenarios["rename"]["checks"])
    assert next(c for c in scenarios["values"]["checks"] if c["field"] == "loyalty_id" and c["scope"] == "classification")["dependencies"]


def test_api_experiments_do_not_mutate_workspace_and_reject_wrong_snapshot(tmp_path):
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        source = client.post("/api/sources", data={"name": "Private source", "kind": "CSV"}, files={"file": ("email.csv", b"email\nprivate@example.test\n")}).json()
        client.post(f"/api/sources/{source['id']}/scan", data={"request_id": "proof"})
        field = client.get("/api/state").json()["fields"][0]
        before = client.get("/api/export/passport").json()
        response = client.post(f"/api/fields/{field['id']}/sensitivity", json={"snapshot_id": field["snapshot_id"], "disabled_groups": ["name_hint", "value_format"]})
        assert response.status_code == 200 and response.json()["after"]["suggested"] is None
        assert "private@example.test" not in response.text
        assert client.post(f"/api/fields/{field['id']}/sensitivity", json={"snapshot_id": "wrong"}).status_code == 400
        assert client.post("/api/challenge", json={"scenario": "purpose"}).json()["correct"] == 4
        assert client.post("/api/challenge", json={"scenario": "invalid"}).status_code == 400
        after = client.get("/api/export/passport").json()
        before.pop("generated_at"); after.pop("generated_at")
        assert before == after


def test_baselines_expose_checksum_failures_without_inventing_improvement(tmp_path):
    service = Service(Store(tmp_path / "db.sqlite3"))
    cases = [{"field": "opaque", "values": ["27AAPFU0939F1Z0"], "expected": None}]
    report = evaluate(service, cases)
    baselines = {b["name"]: b for b in report["baselines"]}
    assert baselines["Headers + patterns"]["metrics"][3]["predicted"] == 1
    assert baselines["Full validation"]["metrics"][3]["predicted"] == 0
    assert report["metrics"] == baselines["Full validation"]["metrics"]
    assert report["independent_heldout"] is False


def test_package_replays_scores_and_detects_modified_files(tmp_path):
    service = Service(Store(tmp_path / "workspace.sqlite3"))
    source = service.register("Local", "CSV", b"email\nprivate@example.test\n")
    service.scan(source["id"], "package")
    field = service.state()["fields"][0]
    service.save_review(field["id"], dict(**service.detail(field["id"])["token"], scope="classification", outcome="clear", selected_class="Contact", reviewer="Reviewer", rationale="Checked the aggregate evidence for this field."))
    evaluate(service)
    payload, media, extension = service.export("bundle")
    assert media == "application/zip" and extension == ".zip"
    path = tmp_path / "evidence.zip"; path.write_bytes(payload)
    assert verify(path)["snapshots_replayed"] == 1
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    assert b"private@example.test" not in b"".join(files.values())
    files["inventory.csv"] += b"modified"
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    with pytest.raises(ValueError, match="File changed"):
        verify(path)
