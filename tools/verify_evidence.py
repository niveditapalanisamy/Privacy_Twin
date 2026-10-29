"""Verify archive consistency and independently replay aggregate candidate scores. Standard library only."""
import hashlib
import json
import sys
import zipfile


def verify(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries")
        if sum(info.file_size for info in archive.infolist()) > 100 * 1024 * 1024:
            raise ValueError("Package exceeds the 100 MB verification limit")
        manifest = json.loads(archive.read("manifest.json"))
        listed = [item["path"] for item in manifest["files"]]
        if len(listed) != len(set(listed)) or set(names) != set(listed) | {"manifest.json"}:
            raise ValueError("Archive entries do not match the manifest")
        for item in manifest["files"]:
            data = archive.read(item["path"])
            if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError("File changed: " + item["path"])
        passport = json.loads(archive.read("passport.json"))
    replayed = 0
    snapshots = {s["id"]: s for s in passport["snapshots"]}
    declarations = {d["id"] for d in passport["declarations"]}
    policies = {p["id"] for p in passport["policies"]}
    scans = {s["id"]: s for s in passport["scans"]}
    for policy in passport["policies"]:
        canonical = json.dumps(policy["content"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if hashlib.sha256(canonical.encode()).hexdigest() != policy["id"]:
            raise ValueError("Policy content does not match its identifier")
    for snapshot in snapshots.values():
        scan = scans.get(snapshot["scan_id"])
        if not scan or scan["policy_id"] not in policies:
            raise ValueError("Missing scan or policy reference")
        p = snapshot["payload"]
        labels = {e["candidate_class"] for e in p["evidence"]}
        candidates = []
        for label in labels:
            contributions = {group: round(max([e["strength"] for e in p["evidence"] if e["candidate_class"] == label and e["group"] == group] or [0]) * weight, 6)
                             for group, weight in p["scoring"]["weights"].items()}
            score = round(sum(contributions.values()), 6)
            if score:
                candidates.append(dict(label=label, score=score, contributions=contributions))
        candidates.sort(key=lambda c: (-c["score"], c["label"]))
        suggested = candidates[0]["label"] if candidates and candidates[0]["score"] >= p["scoring"]["acceptance"] else None
        ambiguous = len(candidates) > 1 and candidates[0]["score"] - candidates[1]["score"] <= p["scoring"]["near_tie"]
        if candidates != p["candidates"] or suggested != p["suggested"] or ambiguous != p["ambiguous"]:
            raise ValueError("Candidate replay differs: " + snapshot["id"])
        replayed += 1
    for review in passport["reviews"]:
        if review["snapshot_id"] not in snapshots or review["declaration_id"] and review["declaration_id"] not in declarations:
            raise ValueError("Missing review dependency reference")
    return dict(files=len(manifest["files"]), snapshots_replayed=replayed, reviews=len(passport["reviews"]),
                verification="Consistency and score replay passed. Authenticity and legal validity are not established.")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python verify_evidence.py privacytwin-bundle.zip")
        print(json.dumps(verify(sys.argv[1]), indent=2))
    except (ValueError, KeyError, zipfile.BadZipFile, OSError) as error:
        print("Verification failed: " + str(error), file=sys.stderr)
        sys.exit(1)
