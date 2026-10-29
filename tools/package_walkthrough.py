"""Package the captured guide, original screenshots, sample inputs and actual exports."""
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "walkthrough"


def package():
    manifest = json.loads((OUTPUT / "steps.json").read_text(encoding="utf-8"))
    if len(manifest["steps"]) != 42 or manifest.get("browser_errors") != []:
        raise ValueError("Complete the verified 42-step capture first")
    for name in ("PrivacyTwin-Full-Walkthrough.html", "PrivacyTwin-Full-Walkthrough.pdf"):
        if not (OUTPUT / name).is_file():
            raise ValueError("Missing guide artifact: " + name)
    samples = OUTPUT / "sample-data"
    samples.mkdir(exist_ok=True)
    for name in ("walkthrough_v1.csv", "walkthrough_v2.csv"):
        shutil.copyfile(ROOT / "docs" / "examples" / name, samples / name)
    shutil.copyfile(ROOT / "evaluation" / "cases.json", samples / "bundled-evaluation-cases.json")
    (samples / "custom-codes.csv").write_text("code\nZX:1234\nZX:5678\n", encoding="utf-8")
    (samples / "invalid-duplicate-headers.csv").write_text("email,email\none,two\n", encoding="utf-8")
    files = [p for p in OUTPUT.rglob("*") if p.is_file() and p.name != "PrivacyTwin-Full-Walkthrough.zip"]
    archive_path = OUTPUT / "PrivacyTwin-Full-Walkthrough.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(files):
            archive.write(file, file.relative_to(OUTPUT).as_posix())
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive consistency check failed")
    print(json.dumps(dict(files=len(files), screenshots=len(manifest["steps"]), archive=str(archive_path), bytes=archive_path.stat().st_size), indent=2))


if __name__ == "__main__":
    package()
