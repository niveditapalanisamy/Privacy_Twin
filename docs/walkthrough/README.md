# Start here — PrivacyTwin screenshot walkthrough

Open **PrivacyTwin-Full-Walkthrough.html** for the easiest reading experience. It is self-contained, includes all 42 screenshots and lets you click each screenshot to enlarge it. **PrivacyTwin-Full-Walkthrough.pdf** is the printable 48-page version. **WALKTHROUGH.md** provides the same step explanations with relative image links.

Read in this order:

1. Overview and glossary: understand sources, fields, evidence, snapshots and the two review scopes.
2. Screenshots 01–20: upload → scan → evidence → sensitivity → scoped reviews → metadata preview/save → ready → replacement scan → reopened classification.
3. Screenshots 21–29: all eight ReviewGuard challenge scenarios and the combined result.
4. Screenshots 30–42: metrics/baselines, exports, the final report, optional AI controls, stale-save protection, failed scans, CSV/SQLite sources, mixed evidence, checksums and custom rules.

Every screenshot comes from the actual application with a separate synthetic workspace on ports 3002/8002. Browser capture completed with no page errors. Persistent navigation and transient notifications are hidden only while capturing focused screenshots so they do not cover the content. No business result is edited. AI controls are shown idle; no provider request is made.

The normal workflow uses 20 synthetic records and four fields from sample-data/walkthrough_v1.csv. V2 changes only employee_id to phone-shaped values. Later examples add the built-in sources and a custom-code source, so combined totals increase. Challenge scenarios each run independently under the frozen reference policy.

The downloads directory contains actual exports taken just after the V2 scan: 4 present fields, 8 stored snapshots, 9 review records including a superseded decision, 3 ready fields, 0 metadata gaps and 1 reopened classification review. The evidence ZIP's standalone verifier checks 8 manifest-listed files and independently replays all 8 snapshots. Later error/custom-rule demonstrations happen after these exports are captured.

Sample files include both main CSV versions, the custom-code CSV, the bundled synthetic evaluation inputs, and an intentionally invalid duplicate-header CSV used to demonstrate rejection. All inputs are synthetic. Metadata completeness and readiness are technical workflow states, not legal compliance decisions.

To reproduce from the repository:

```powershell
cd web
npm run test:e2e -- --config=playwright.walkthrough.config.ts
cd ..
.\.venv\Scripts\python.exe tools/build_walkthrough.py
cd web
node scripts/render-walkthrough.cjs
cd ..
.\.venv\Scripts\python.exe tools/package_walkthrough.py
```

Installed Microsoft Edge and the existing project dependencies are required. Capture uses fresh isolated databases; it does not change your normal workspace. The ZIP bundles this guide, screenshots, samples and exported evidence for offline reading.
