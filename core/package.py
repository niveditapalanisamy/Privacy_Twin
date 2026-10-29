"""One-transaction portable evidence package, with a consistency manifest."""
import hashlib
import io
import json
import zipfile

from .storage import now


def evidence_package(service, connection):
    files = {}
    for kind in ("passport", "inventory", "gaps", "history"):
        payload, _, extension = service.export(kind, connection)
        files[kind + extension] = payload.encode("utf-8")
    policy_id, config = service.store.config(connection)
    files["configuration.json"] = json.dumps(config, ensure_ascii=False, indent=2).encode("utf-8")
    evaluation = connection.execute("SELECT payload FROM evaluations ORDER BY rowid DESC LIMIT 1").fetchone()
    if evaluation:
        files["evaluation.json"] = evaluation[0].encode("utf-8")
    files["README.txt"] = (
        "PrivacyTwin evidence package\n\n"
        "All database records in this archive were read in one transaction.\n"
        "passport.json contains aggregate evidence, original review dependencies, declarations and policies.\n"
        "configuration.json is the current policy; snapshots and evaluations may reference older policies.\n"
        "Replay candidate scores from stored evidence with the repository verifier:\n"
        "  python tools/verify_evidence.py privacytwin-bundle.zip\n\n"
        "Raw source rows and provider credentials are excluded. Field names, declarations and reviewer text remain.\n"
        "Evaluation labels are identified by their digest; the separately retained input cases are needed to rerun detection.\n"
        "The bundled benchmark is synthetic regression data, not independently labelled held-out validation.\n"
        "Manifest hashes check file consistency, not authenticity or the truth of a finding.\n"
        "Technical evidence for human review. No legal compliance determination.\n"
    ).encode("utf-8")
    # The verifier is self-contained and can travel with the evidence.
    from pathlib import Path
    files["verify_evidence.py"] = (Path(__file__).resolve().parent.parent / "tools" / "verify_evidence.py").read_bytes()
    manifest = dict(format_version="1.0", generated_at=now(), workspace_id=service.store.workspace_id, active_policy=policy_id,
                    evaluation_present=bool(evaluation), verification="SHA-256 consistency only; no trusted signature.",
                    files=[dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()) for name, data in sorted(files.items())])
    files["manifest.json"] = json.dumps(manifest, indent=2).encode("utf-8")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return out.getvalue(), "application/zip", ".zip"
