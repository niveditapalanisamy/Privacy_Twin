# PrivacyTwin presentation package

1. Open **PrivacyTwin-Pitch.pdf** for the seven-slide presentation.
2. Rehearse with **../PITCH.md**, the timed five-minute speaker script.
3. Read **PrivacyTwin-Technical-Report-Draft.pdf** for architecture, pseudocode, methodology, results and limitations. Adapt it to the organizer's separate report template before submission.
4. Inspect **challenge-results.json** and **evaluation-results.json** for the actual generated measurements.
5. Verify **synthetic-evidence.zip** using `python tools/verify_evidence.py docs/submission/synthetic-evidence.zip` from the repository root. The included verifier can also be run separately from the repository.
6. Complete the human annotation and organizer actions in **../EVALUATION_PROTOCOL.md**.

These artifacts use a freshly scanned, disposable synthetic workspace. No human approvals are fabricated in the demonstration inventory. The challenge uses explicitly scripted synthetic reviewer actions. No independent human-labelled validation, team identity, repository ownership transfer or official-template compliance is claimed by this package.

Regenerate measurements and HTML with `.\.venv\Scripts\python.exe tools/build_pitch.py`. Render PDFs with `node scripts/render-pitch.cjs` from `web` (installed Microsoft Edge required). No network/model call is needed.
