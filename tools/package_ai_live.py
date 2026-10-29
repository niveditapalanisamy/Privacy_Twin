"""Package only the documented live-review artifacts, excluding stale captures and credentials."""
import json
import os
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "ai-live"


def package():
    summary = json.loads((OUTPUT / "run-summary.json").read_text(encoding="utf-8"))
    if summary.get("outcome") != "completed_and_actions_verified":
        raise ValueError("A completed actual run is required")
    names = ["Actual-AI-Review-70-Percent.html", "Actual-AI-Review-70-Percent.pdf", "REVIEW.md", "run-summary.json", "synthetic-live-input.csv"]
    names += [step["screenshot"] for step in summary["steps"]]
    names += [p.relative_to(OUTPUT).as_posix() for p in (OUTPUT / "downloads").iterdir() if p.is_file()]
    files = {name: (OUTPUT / name).read_bytes() for name in names}
    for path in sorted((OUTPUT / "references").glob("*")):
        if path.is_file():
            files[path.relative_to(OUTPUT).as_posix()] = path.read_bytes()
    key_path = ROOT / "data" / "gemini-key.txt"
    key = os.environ.get("GEMINI_API_KEY") or (key_path.read_text(encoding="utf-8").strip() if key_path.exists() else "")
    if key and any(key.encode() in contents for contents in files.values()):
        raise ValueError("Credential found in an artifact; archive not created")
    target = OUTPUT / "Actual-AI-Review-70-Percent.zip"
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, contents in sorted(files.items()):
            archive.writestr(name, contents)
    print(json.dumps(dict(files=len(files), screenshots=len(summary["steps"]), threshold=summary["confidence_threshold"],
                          credential_check="No configured credential found in packaged artifacts", archive=str(target)), indent=2))


if __name__ == "__main__":
    package()
