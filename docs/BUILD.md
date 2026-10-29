# Build, run and verify PrivacyTwin

[README](../README.md) · [User guide](USER_MANUAL.md) · [Judge guide](JUDGES_GUIDE.md)

## Requirements

| Component | Requirement                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Python    | 3.11 or later                                                                                                    |
| Node.js   | 20.9 or later, with npm                                                                                          |
| Browser   | Any current browser to use the app; installed Microsoft Edge for the documented automated browser tests          |
| Network   | Needed to install packages and for optional real Gemini calls; the installed deterministic workflow runs locally |
| API key   | Optional; unnecessary for scanning, human review, challenges, evaluation or exports                              |

The tested setup is Windows with PowerShell. `requirements-lock.txt` and `web/package-lock.json` freeze the dependency versions used for this build. The runtime is Python/FastAPI plus Next.js/React; no Streamlit, GPU, container or model service is needed for the core.

## First installation on Windows

```powershell
git clone https://github.com/niveditapalanisamy/Privacy_Twin.git
cd Privacy_Twin
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
cd web
npm ci
cd ..
powershell -ExecutionPolicy Bypass -File .\Start-PrivacyTwin.ps1 -Build
```

Open **http://127.0.0.1:3000**. Backend health is **http://127.0.0.1:8000/api/health**; interactive API documentation is **http://127.0.0.1:8000/docs**. The frontend proxies `/api` to the local backend.

The startup script launches hidden background processes. It records their identities and writes logs to `data/runtime/`. On a fresh workspace the app creates its own evidence database; the synthetic workspace is loaded only when you choose that action.

## Start, stop and update

```powershell
# Start the current production build
.\Start-PrivacyTwin.ps1

# Stop only the tracked PrivacyTwin processes
.\Stop-PrivacyTwin.ps1

# After pulling or editing application code
git pull --ff-only
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
cd web
npm ci
cd ..
.\Start-PrivacyTwin.ps1 -Build
```

Stop the app **before** pulling/building an update. `Start-PrivacyTwin.ps1 -Build` builds the frontend but does not replace an already-running server. Stop/start is also required after changing backend environment variables. Existing workspace data remains in `data/`.

## Development

From the repository root, run the backend in one terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Run the frontend in a second terminal:

```powershell
cd web
npm run dev
```

Open http://127.0.0.1:3000. Stop the production launcher first if those ports are already in use. The frontend backend-URL override is `PRIVACYTWIN_API_URL`; the default is `http://127.0.0.1:8000`.

On macOS/Linux, create a Python virtual environment with `python3 -m venv .venv`, install the same lock file using `.venv/bin/python`, and start the two development commands manually. The included PowerShell launchers and browser-test server commands target Windows; the documented end-to-end results were measured there.

## Optional Gemini setup

The deterministic core needs no provider key. To enable real AI review, either set `GEMINI_API_KEY` in the backend's process environment or create `data/gemini-key.txt` containing the key. The file and runtime data are ignored by Git. A `.env` file is not automatically loaded by this backend.

For an environment-based setup in the current PowerShell session:

```powershell
$env:GEMINI_API_KEY = '<your-server-key>'
.\Start-PrivacyTwin.ps1
```

Restart any existing backend first. The key remains on the server; never use a `NEXT_PUBLIC_` variable for it. In the UI, open **Results → Review automation** and check **Key configured**.

Choose draft or automatic mode, source, scopes, maximum fields and minimum model confidence. Supported UI thresholds are 70%, 80%, 90%, 95% and 100%; the default is 95%. The chosen value is stored with each run. The [documented actual review](ai-live/REVIEW.md) explicitly selected 70%.

The configured model is `gemini-3.1-flash-lite`. Provider calls consume quota and use the project's billing/data terms. The app has no model fallback or automatic provider retry. Quota/connection failures preserve the run for a deliberate resume or cancellation. Raw rows and declaration text are excluded from model input; aggregate evidence can still carry information.

## Tests and verification

The pinned Python lock file includes the test dependencies. If maintaining a different environment, `requirements-dev.txt` lists the development requirements.

```powershell
# Repository root
.\.venv\Scripts\python.exe -m pytest -q

cd web
npm run typecheck
npm run build
npm run test:e2e
```

The standard browser suite runs on ports **3001/8001**, uses installed Microsoft Edge, and creates a fresh database in `data/test-runs/`. It does not write approvals into the normal workspace. It skips the opt-in live-provider test. Screenshots and failure traces are generated under `web/test-results/`.

### Capture the full local walkthrough

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

Capture uses **3002/8002**, a separate database and synthetic data. It creates 42 screenshots and their explanations without a provider call. The final packaging command creates an ignored combined ZIP; screenshots, PDF and source documents remain committed.

### Explicitly run the real Gemini screenshot test

This command makes an actual provider request and consumes quota. It uses three synthetic fields, two review scopes and a 70% threshold. It then tests actual proposal actions and a rescan without a second AI call for that rescan.

```powershell
cd web
$env:PRIVACYTWIN_LIVE_AI = '1'
npm run test:e2e -- --config=playwright.liveguide.config.ts
cd ..
.\.venv\Scripts\python.exe tools/build_ai_live_guide.py
cd web
node scripts/render-ai-live.cjs
cd ..
.\.venv\Scripts\python.exe tools/package_ai_live.py
```

This uses **3003/8003** and `data/live-guide-runs/`. A key must already be configured. Successful output is saved under `docs/ai-live/`. Model responses can vary; inspect the recorded result rather than assuming the same number of automatically applied proposals. Preserve any prior captures you need before regenerating them. The guide builder requires a completed run and verified actions; it does not substitute success for a provider failure.

### Generate the pitch and verify evidence

```powershell
.\.venv\Scripts\python.exe tools/build_pitch.py
.\.venv\Scripts\python.exe tools/verify_evidence.py docs/submission/synthetic-evidence.zip
cd web
node scripts/render-pitch.cjs
```

The pitch builder uses a fresh synthetic workspace. The standalone verifier requires only Python's standard library. It checks manifest hashes, references and candidate-score replay; it does not establish authenticity or legal validity.

## Storage and configuration

| Location / setting                       | Purpose                                                           |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `data/workspace.sqlite3`                 | Normal workspace, snapshots, reviews, declarations and AI history |
| `data/uploads/`                          | Controlled local copies of uploaded sources                       |
| `data/runtime/`                          | Launcher process records and logs                                 |
| `PRIVACYTWIN_DB`                         | Optional backend database-path override for isolated workspaces   |
| `PRIVACYTWIN_API_URL`                    | Frontend proxy backend address                                    |
| `GEMINI_API_KEY` / `data/gemini-key.txt` | Optional backend-only provider credential                         |
| Rules screen                             | Versioned detector configuration and metadata checklist           |

`data/`, environment files, Python/Node dependencies, build outputs and browser traces are ignored. Committed reports and screenshots were generated from synthetic demonstration data. The earlier legacy database is not migrated into field-specific approvals.

## Troubleshooting

| Symptom                             | Action                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Missing virtual environment         | Create `.venv` and install `requirements-lock.txt`.                                                          |
| Missing frontend packages           | Run `npm ci` from `web`.                                                                                     |
| PowerShell blocks a script          | Use `powershell -ExecutionPolicy Bypass -File .\Start-PrivacyTwin.ps1`.                                      |
| Port already in use                 | Stop the tracked app or the process that owns the conflicting port; check `data/runtime/` logs.              |
| Old interface after a code update   | Stop the app, rebuild, start again, then reload the browser.                                                 |
| Edge cannot launch in browser tests | Install Microsoft Edge or deliberately adapt the Playwright channel/server commands to your environment.     |
| Key not configured                  | Set the backend key, restart the backend, and recheck the status indicator.                                  |
| Provider failure or quota state     | Inspect the actual error; resume deliberately when available, or cancel. No fabricated response is inserted. |
| No eligible AI fields               | Scan under the current rules. Current reviews are skipped; failed sources and stale scans need attention.    |
| New rule has not changed results    | Save the configuration and rescan the relevant source.                                                       |

For using the product, continue with the [user guide](USER_MANUAL.md). For the judging demonstration, use the [judge guide](JUDGES_GUIDE.md).
