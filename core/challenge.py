"""Executable ReviewGuard demonstrations using disposable, real Service workspaces."""
import copy
import tempfile
import uuid
from pathlib import Path

from .demo import csv_bytes
from .engine import DEFAULT_CONFIG, digest
from .service import Service
from .storage import Store, now


SCENARIOS = [
    dict(id="values", title="Change values, keep the header", description="Internal IDs become mobile-shaped values.", expected="Only the classification review reopens."),
    dict(id="purpose", title="Remove the declared purpose", description="Values stay the same; the owner removes a purpose.", expected="Only the metadata review reopens."),
    dict(id="relevant_rule", title="Change a relied-on rule", description="Edit the internal-ID detector used by the review.", expected="Only the classification review reopens."),
    dict(id="unrelated_rule", title="Change an unrelated rule", description="Edit the birth-date detector; this source has no birth dates.", expected="All four reviews stay current."),
    dict(id="identical", title="Rescan identical data", description="A fresh scan ID and timestamp carry the same evidence.", expected="All four reviews stay current."),
    dict(id="rename", title="Rename without a mapping", description="member_reference replaces loyalty_id.", expected="Old reviews become missing; the new field has no reviews."),
    dict(id="reversion", title="Change values, then restore them", description="A reopened decision needs a new human review even after reversion.", expected="Classification stays reopened; metadata stays current."),
    dict(id="small_change", title="Stay within the rate tolerance", description="One of 50 internal IDs becomes unrecognised; no new candidate appears.", expected="All four reviews stay current."),
]


def _run(scenario):
    with tempfile.TemporaryDirectory(prefix="privacytwin-challenge-") as directory:
        service = Service(Store(Path(directory) / "workspace.sqlite3"))
        def data(version="base"):
            header = "member_reference" if version == "rename" else "loyalty_id"
            return csv_bytes([header, "email"], [
                [(f"910000{i:04d}" if version == "values" else "unknown" if version == "small_change" and i == 0 else f"LOY-{1000+i}"),
                 f"person{i}@example.test"] for i in range(50)])
        sid = service.register("Challenge synthetic data", "CSV", data())["id"]
        service.scan(sid, str(uuid.uuid4()))
        fields = {f["name"]: f["id"] for f in service.state()["fields"]}
        fid = fields["loyalty_id"]
        draft = dict(purpose="Synthetic loyalty operations", retention_duration=2, retention_unit="years",
                     retention_start_trigger="Account closure", owner="Synthetic owner", provenance="Challenge fixture")
        def declare(payload):
            body = dict(**service.detail(fid)["token"], draft=payload)
            preview = service.preview_declaration(fid, body)
            service.save_declaration(fid, body | {"preview_digest": preview["preview_digest"]})
        declare(draft)
        for field_id in fields.values():
            for scope in ("classification", "metadata"):
                detail = service.detail(field_id)
                service.save_review(field_id, dict(**detail["token"], scope=scope, outcome="clear",
                    selected_class=detail["snapshots"][0]["payload"]["suggested"], reviewer="Synthetic challenge reviewer",
                    rationale="Scripted review for an isolated synthetic lifecycle demonstration."))
        expected = {"classification": "current", "metadata": "current"}
        if scenario in ("values", "reversion", "small_change", "rename", "identical"):
            service.scan(sid, str(uuid.uuid4()), data("values" if scenario == "reversion" else scenario))
            if scenario == "reversion":
                service.scan(sid, str(uuid.uuid4()), data())
            if scenario in ("values", "reversion"):
                expected["classification"] = "reopened"
            if scenario == "rename":
                expected = {s: "missing" for s in expected}
        elif scenario == "purpose":
            declare(draft | {"purpose": ""})
            expected["metadata"] = "reopened"
        elif scenario in ("relevant_rule", "unrelated_rule"):
            state = service.state()
            config = copy.deepcopy(state["config"])
            rule_id = "internal_id" if scenario == "relevant_rule" else "birth_date"
            next(r for r in config["rules"] if r["id"] == rule_id)["pattern"] = r"LOY-\d{8}" if scenario == "relevant_rule" else r"19\d{2}-\d{2}-\d{2}"
            service.save_config(config, state["policy_id"])
            service.scan(sid, str(uuid.uuid4()))
            if scenario == "relevant_rule":
                expected["classification"] = "reopened"
        rows = []
        for name, field_id in fields.items():
            detail = service.detail(field_id)
            for review in detail["reviews"]:
                if review["state"] == "superseded":
                    continue
                scope = review["scope"]
                target = expected[scope] if name == "loyalty_id" else "current"
                events = [e for e in detail["events"] if e["review_id"] == review["id"] and e["type"] != "review_saved"]
                rows.append(dict(field=name, scope=scope, expected=target, observed=review["state"], passed=target == review["state"],
                                 reason=events[0]["reason"] if events else "No dependency changed.",
                                 dependencies=events[0]["comparisons"] if events else []))
        if scenario == "rename":
            new = next(f for f in service.state()["fields"] if f["name"] == "member_reference")
            rows.append(dict(field="member_reference", scope="both", expected="unreviewed", observed="unreviewed" if not new["reviews"] else "reviewed",
                             passed=not new["reviews"], reason="Exact column identity changed; no approval was copied.", dependencies=[]))
        return dict(**next(s for s in SCENARIOS if s["id"] == scenario), checks=rows, passed=all(r["passed"] for r in rows))


def run_challenge(scenario="all"):
    if scenario != "all" and scenario not in {s["id"] for s in SCENARIOS}:
        raise ValueError("Unknown challenge scenario")
    results = [_run(s["id"]) for s in SCENARIOS if scenario in ("all", s["id"])]
    checks = [r for result in results for r in result["checks"]]
    return dict(created_at=now(), policy_id=digest(DEFAULT_CONFIG), scenarios=results,
                correct=sum(r["passed"] for r in checks), total=len(checks),
                preserved=sum(r["observed"] == "current" for r in checks),
                false_reopenings=sum(r["expected"] == "current" and r["observed"] == "reopened" for r in checks),
                missed_reopenings=sum(r["expected"] == "reopened" and r["observed"] != "reopened" for r in checks),
                basis="Real scans, declarations and saved synthetic reviews in disposable workspaces using the frozen reference configuration. Your workspace is unchanged. This is a scripted regression challenge, not independent accuracy validation.")
