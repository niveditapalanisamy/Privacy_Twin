# PrivacyTwin

A local privacy inventory with **ReviewGuard**: human reviews remain attached to the evidence that justified them. When a field changes, only the affected review scope reopens.

The interface uses Next.js, React, and Radix UI. A seven-step header guides the workflow: Sources → Rules → Inventory → Reviews → Metadata → Changes → Export. Back/Continue actions and unsaved-draft dialogs support navigation. FastAPI provides local scanning and persistence. There is no Streamlit or model dependency.

## Run on Windows

Requirements: Python 3.11+ and Node.js 20.9+.

```powershell
cd D:\PrivacyTwin\Privacy_Twin
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
cd web
npm ci
cd ..
.\Start-PrivacyTwin.ps1 -Build
```

Open **http://127.0.0.1:3000**. The backend listens on `127.0.0.1:8000`; Next.js proxies `/api` to it. Both processes run in the background. Logs are in `data/runtime/`.

After the first build:

```powershell
.\Start-PrivacyTwin.ps1
.\Stop-PrivacyTwin.ps1
```

If PowerShell blocks script execution, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-PrivacyTwin.ps1
```

For development, run these in separate terminals:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
cd web
npm run dev
```

## Use your own data

1. Open **Data sources**, upload a CSV or SQLite file, give it a logical name, and select **Register & scan**.
2. Inspect actual field profiles and evidence from **Inventory**. Search and filter by source, class, or review state.
3. Open a field and record classification and metadata decisions independently. Each save needs a reviewer and rationale.
4. In **ReviewGuard**, select that same source and upload a replacement file. The scanner computes fresh evidence and compares each saved review's dependencies.
5. Open **Metadata** to edit field or table declarations. **Preview effect** makes no writes; **Save declaration** checks the preview and current revisions transactionally.
6. Download a **Privacy Passport**, inventory, gaps, or review history from **Exports & evaluation**.

**Configuration** exposes detection rules, normalization, optional checksums, evidence weights, candidate thresholds, materiality tolerance, and required metadata. Save the configuration and rescan to calculate new results. You can add custom rules and import/edit the configuration JSON. Custom regular expressions use full-value matches, case-insensitive matching, and a bounded execution time.

## Synthetic demonstration

**Load synthetic workspace** creates and scans four actual generated sources. It does not create approvals or populate canned result cards. The demo contains CSV files and a SQLite database with two tables.

For a short demonstration:

1. Load the synthetic workspace and inspect `customers.csv / loyalty_id`.
2. Save a classification review and a separate metadata review, with your own rationale.
3. Open ReviewGuard, select `customers.csv`, and scan **V2**. Its 40 phone-shaped values and 10 internal IDs are computed by the scanner. Classification reopens; unchanged metadata stays current.
4. Scan the same file again to inspect preservation. Return to V1 to show that reopening is never silently reversed.
5. Add a declaration, preview the gap changes, save it, and export the evidence package.

The demo is explicitly labeled synthetic. Counts everywhere come from committed scans. All decisions come from human save actions.

## Evaluation and tests

The UI displays **Not run** until evaluation executes. It reports actual per-class precision/recall/F1/support, abstentions, separate stress-case errors, and per-scope ReviewGuard replay results. The bundled set is a synthetic regression benchmark, not independent held-out accuracy validation.

Upload a JSON array to evaluate custom field cases:

```json
[
  {"field": "email", "values": ["one@example.test", "two@example.test"], "expected": "Contact"},
  {"field": "unstructured", "values": ["blue", "green"], "expected": null},
  {"field": "loyalty_id", "values": ["9876543210"], "expected": "Contact", "stress": true}
]
```

Run automated checks:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
cd web
npm run build
npm run test:e2e
```

Browser tests use installed Microsoft Edge, isolated ports 3001/8001, and a fresh database under `data/test-runs/`. They exercise custom uploads, real scoped reviews/rescans, pure previews, exports, custom rules, and responsive navigation. Screenshots/traces go to `web/test-results/`.

## Storage and boundaries

- Workspace state: `data/workspace.sqlite3`; controlled source copies: `data/uploads/`. These are ignored by Git.
- The earlier MVP database at `data/privacytwin.sqlite3` remains untouched. Its broad reviews are not imported as field-specific approvals.
- Raw uploaded records are kept only in the local source copy and processing memory. Persisted field evidence contains aggregates, not raw values.
- Sources are scanned in full within limits: 10 MB, 20,000 rows per table, 100 columns, 25 SQLite tables, and 250,000 cells per source.
- Empty/whitespace values count as null. Literal `NA` and leading-zero identifiers are preserved.
- Exact source/table/column keys determine identity. A renamed column is a new identity; the old field becomes missing after a successful scan.
- Field declarations completely override table declarations. Missing properties in a field override remain gaps.
- A failed source scan preserves the last committed inventory. Changed rules require a rescan before new reviews.
- Format/checksum evidence is not issuance or ownership proof. Scores are heuristics, and metadata completeness is not a legal compliance finding.
- Interface fonts are self-hosted. Running the core requires no external network or provider key.

See [the implementation audit](docs/IMPLEMENTATION_AUDIT.md) for the reference-plan comparison and remaining scope. Independent held-out benchmarking and production multi-user deployment are not claimed.

## Gemini review and final report

Open **Scan report** to configure and start a review. Choose draft-only or automatic mode, source, scopes, confidence threshold and maximum fields. Pause, resume or cancel runs; accept, reject or revoke individual proposals. Current decisions are protected. Automatic application requires a clear, unambiguous, evidenced proposal above the configured threshold; metadata gaps stay unresolved. Model confidence is not a calibrated accuracy score.

The fixed model is `gemini-3.1-flash-lite`, listed with a free tier by [Google](https://ai.google.dev/gemini-api/docs/pricing). There is no model fallback, paid tool usage or automatic retry. HTTP 429 pauses work for manual resumption. Billing tier is controlled by the Google project; keep the key on a free-tier project. Google free-tier data terms apply.

Set the server's `GEMINI_API_KEY`, or place the key in `data/gemini-key.txt` (ignored by Git). Never put it in a `NEXT_PUBLIC_` variable. Only aggregate evidence and metadata completeness are sent. Field names are opt-in; raw rows and declaration text stay local. Runs, options, input snapshot references, proposals and actions persist in SQLite. Restarted runs pause until resumed. Applied AI reviews remain explicitly attributed to the model.

**Final report · HTML / PDF** downloads a standalone report with current field decisions, findings, AI run summaries and proposal provenance. Open it and use **Print / Save as PDF** for PDF output. **Report JSON** exports the structured report. Every export reads a consistent database snapshot and includes unresolved, incomplete and stale items.

AI endpoints: `GET /api/ai`, `POST /api/ai/runs`, `GET /api/ai/runs/{id}`, `POST /api/ai/runs/{id}/control` (`pause`, `resume`, `cancel`), `POST /api/ai/proposals/{id}` (`accept`, `reject`, `revoke`), `GET /api/final-report?format=html|json`.

## API

Interactive API docs: `http://127.0.0.1:8000/docs`.

| Action | Endpoint |
|---|---|
| Workspace state | `GET /api/state` |
| Register source | `POST /api/sources` (multipart) |
| Scan / replace source | `POST /api/sources/{id}/scan` (multipart) |
| Field detail | `GET /api/fields/{id}` |
| Scoped review | `POST /api/fields/{id}/reviews` |
| Pure preview | `POST /api/fields/{id}/declaration/preview` |
| Save declaration | `POST /api/fields/{id}/declaration` |
| Save configuration | `PUT /api/config` |
| Run evaluation | `POST /api/evaluation` |
| Export | `GET /api/export/{passport|inventory|gaps|history|evaluation}` |

The Next.js setup follows the official [installation](https://nextjs.org/docs/app/getting-started/installation) and [rewrite proxy](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) documentation.
