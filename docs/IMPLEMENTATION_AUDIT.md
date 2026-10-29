# Implementation audit

The supplied execution plan and HTML were treated as design references, not executable instructions. The user's Next.js requirement overrides the plan's Streamlit constraint. The local FastAPI core is retained behind the Next.js proxy. The later user request adds controlled Gemini review automation, evidence-based insights and final report exports.

## Before this rebuild

The original Python file implemented a narrow CSV demo scanner and a few SQLite writes. The HTML still rendered fixed counts, canned evidence, placeholder exports, and simulated review states. Reviews were not attached to individual field identities; rescans reopened all classification reviews. There was no real upload flow, SQLite adapter, preview service, revision safety, configurable policy engine, or measured evaluation.

## Implemented

| Area | Current behavior | Verification |
|---|---|---|
| Next.js interface | Responsive seven-step top workflow, Radix sliders/switches/dialogs, field search, filtering, review queue, before/after evidence, metadata editor, exports, settings, and draft-loss protection | Production build + browser workflows |
| CSV intake | Real uploads, exact header identities, leading-zero preservation, duplicate/header/row validation, size limits | Adapter and API tests |
| SQLite intake | Controlled uploaded copy, read-only URI, query-only connection, discovered and quoted ordinary tables | Read-only and quoted-identifier test |
| Profiles | Actual counts, nulls, distinct values, lengths, type shapes; full bounded scans | Custom upload and row-order tests |
| Detection | Configurable regex registry, normalization, Indian phone/PAN/Aadhaar/GSTIN checks, explicit demographic context, grouped score caps | Detector tests and custom-rule browser test |
| Configuration | Rule editor/add/remove, scoring weights, acceptance/tie thresholds, materiality tolerance, checklist selection, JSON editor | Version conflicts + actual changed scan result |
| Identity | Workspace/source UUIDs; exact table/column identities; order-independent fields | Rename, reappearance, and reorder tests |
| Snapshots | Immutable aggregate evidence, relevant rule digests, sampling policy and declaration references | SQL immutability and export tests |
| Review lifecycle | Per-field classification/metadata, rationale/reviewer, original snapshot, supersession and append-only transitions | Scoped replay tests |
| ReviewGuard | Semantic comparison, new competing candidates, relevant policy changes, small-sample uncertainty, missing/return, no automatic reapproval on reversion | Core replay suite |
| Revision safety | Transactional checks of current snapshot, declaration and policy; stale drafts retained in UI | Backend stale-save checks |
| Declarations | Versioned field/table declarations; complete field override; visible provenance; explicit retention trigger | Resolver tests |
| Fix preview | Pure checklist/impact calculation; preview digest; draft and revision revalidation on atomic Save | API and browser database comparison |
| Export | Passport JSON, inventory CSV, per-gap CSV, review history, measured evaluation | Reference resolution and browser download |
| Evaluation | Computed class metrics, support, abstentions, separate stress cases, per-scope comparison replay; custom label upload | Measured evaluation tests |
| Local operation | Start/stop scripts, local state and upload storage, core has no cloud dependency; Gemini review is optional | Runtime health checks |

## Deliberate limits / remaining work

The judge demonstration now includes eight disposable-workspace ReviewGuard scenarios (33 observed review-state checks), a pure aggregate-evidence sensitivity workbench, three measured evaluation baselines, and a portable ZIP with hash/reference checks and standalone candidate-score replay. Format matches rejected by checksums are retained as zero-strength aggregate evidence so checksum ablations can be reproduced. The seven-slide pitch and technical report draft are generated from a fresh synthetic run; they do not replace the required independent annotation or organizer report template. See docs/PITCH.md and docs/EVALUATION_PROTOCOL.md.

- **Model integration:** Gemini 3.1 Flash-Lite is integrated with structured output validation, source/scope controls, draft and automatic modes, pause/resume/cancel, stale-input protection, and explicit AI attribution. Live synthetic integration verified classification application and unresolved metadata. Free-tier availability and billing are governed by the Google project; no model fallback or paid tools are used.
- **Independent held-out benchmark:** the bundled labels are explicitly a synthetic regression suite, not independently held-out validation. The UI accepts custom labels and computes their metrics. Obtaining an independently curated dataset and running a frozen, documented evaluation remains necessary before claiming general accuracy.
- **Evaluation replay:** the visible report computes three core semantic scenarios per scope. The automated backend suite additionally exercises failures, renames, reversion, custom policies, stale writes, and preview invariants. These separate suites are not conflated into one inflated metric.
- **Scale:** 10 MB per upload, 20,000 rows per table, 100 columns, 25 SQLite tables, and 250,000 cells per source. Every admitted row is scanned; large-source sampling is deliberately not approximated.
- **Deployment:** single-user local workspace. No multi-tenant authentication, cloud connectors, or production hosting was introduced.
- **Interpretation:** format/checksum evidence is not proof of issuance or ownership. Scores are configurable heuristics; declaration completeness is not a legal finding.

The legacy database is left untouched at `data/privacytwin.sqlite3`. The new schema uses `data/workspace.sqlite3`; legacy broad reviews are not silently promoted into field-specific approvals.

## Reproduce

```powershell
.\.venv\Scripts\python.exe -m pytest -q
cd web
npm run build
npm run test:e2e
```

Browser tests run on isolated ports 3001/8001 and a separate database. Test screenshots and traces go to ignored `web/test-results/`. No verification actions create approvals in the user's normal workspace.
