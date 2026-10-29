# PrivacyTwin — judge guide

[README](../README.md) · [Pitch PDF](submission/PrivacyTwin-Pitch.pdf) · [Technical report draft](submission/PrivacyTwin-Technical-Report-Draft.pdf)

**Question to test:** can we still rely on yesterday's review after the data changes?

PrivacyTwin discovers candidate personal-data fields in CSV/SQLite sources, links declared purpose and retention, and produces a technical inventory for human review. ReviewGuard stores different dependencies for classification and metadata decisions, so a change reopens the affected scope with a reason.

## Start in one minute

Follow [BUILD.md](BUILD.md) to launch the app, then open http://127.0.0.1:3000. No model key is needed for the main demonstration. Choose **Sources → Load synthetic workspace** to scan three generated CSVs and a SQLite database with two tables.

For immediate verification without installing, open the [42-screenshot walkthrough](walkthrough/WALKTHROUGH.md), [pitch PDF](submission/PrivacyTwin-Pitch.pdf), [actual AI review](ai-live/REVIEW.md), or [verification record](submission/VERIFICATION.md).

## Five-minute live demonstration

| Time      | Action                                                                                      | What it proves                                                                        |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0:00–0:40 | Sources → Load synthetic workspace → Inventory                                              | Actual CSV and SQLite scans; field-level inventory                                    |
| 0:40–1:20 | Open `customers.csv / contact_value`                                                        | Separate counts for 32 email and 18 mobile matches out of 50 non-empty values         |
| 1:20–2:00 | Evidence experiment → remove header hints → compare; then remove value patterns             | Computed sensitivity and abstention; saved state stays unchanged                      |
| 2:00–3:20 | Changes → Challenge ReviewGuard → Change values, keep the header → run                      | Classification reopens; metadata and unrelated reviews stay current                   |
| 3:20–4:10 | Field → Declaration & preview → add retention without a start trigger, then add the trigger | Missing documentation remains explicit; read-only preview shows gap and review impact |
| 4:10–5:00 | Results → Run evaluation → download evidence package                                        | Measured class metrics, baseline comparison and portable evidence                     |

The challenge uses real scans and saved scripted reviews in a disposable workspace. To demonstrate a person recording decisions, use [V1](examples/walkthrough_v1.csv), complete the two review scopes, then replace that same registered source with [V2](examples/walkthrough_v2.csv). The [user guide](USER_MANUAL.md) gives the exact steps.

## Inspect the signature result

![Actual replacement scan: one classification review reopens while metadata and unrelated field reviews remain current](walkthrough/screenshots/17-scoped-reopening.png)

The classification and metadata reviews keep their original rationale and evidence references. The new candidate does not silently replace a reviewed class. Restoring old values does not silently reapprove a reopened decision.

## Challenge all eight change scenarios

| Change                                                    | Affected classification                 | Affected metadata | Unrelated reviews |
| --------------------------------------------------------- | --------------------------------------- | ----------------- | ----------------- |
| IDs become phone-shaped values                            | Reopened                                | Current           | Current           |
| Declared purpose removed                                  | Current                                 | Reopened          | Current           |
| Relied-on detector rule edited                            | Reopened                                | Current           | Current           |
| Unrelated detector rule edited                            | Current                                 | Current           | Current           |
| Identical rescan/new timestamp                            | Current                                 | Current           | Current           |
| Rename without mapping                                    | Old field missing; new field unreviewed | Old field missing | Current           |
| Change values, then restore them                          | Still reopened                          | Current           | Current           |
| 2-percentage-point rate change within reference tolerance | Current                                 | Current           | Current           |

The generated reference run matched **33/33 expected states**, preserving 26 current states with 0 false and 0 missed reopenings. These are explicit scripted checks, not estimates over all real-world changes. [Measured JSON](submission/challenge-results.json) · [Screenshots 21–29](walkthrough/WALKTHROUGH.md)

## What has been measured

| Evidence                            | Result / interpretation                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Software tests                      | 42 backend tests, 9 standard browser workflows, production build passed                                               |
| Detection regression set            | 12 benchmark fields and 7 separate stress fields; per-class precision/recall/support reported                         |
| Baseline stress errors              | Header rules 4/7; headers + patterns 2/7; full validation 0/7 on this constructed set                                 |
| Actual Gemini run at 70%            | 3 fields → 6 proposals; 2 classifications applied automatically at exactly 70%; 4 unresolved proposals stayed pending |
| Documentation checks in that AI run | All 15 missing metadata items remained flagged                                                                        |
| Portable evidence                   | A generated 22-field source set replays through the standalone score verifier                                         |

**Independent manual annotation remains necessary.** The bundled set is developer-authored synthetic regression data. Its small support counts do not establish general accuracy. The actual Gemini run verifies integration and review behavior, not calibrated model accuracy.

The [real AI review guide](ai-live/REVIEW.md) includes 14 actual screenshots, actions and reports. It documents an earlier connection failure and the original 95% run; those are not hidden or relabelled as successful 70% results. Optional provider availability is unnecessary for the main live demo.

## PS-019 coverage

| Problem-statement outcome                 | Where to inspect it                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| CSV and one SQL database                  | Sources; controlled CSV and read-only SQLite adapters                        |
| Five data classes                         | Configured Identity, Contact, Location, Official ID and Demographic registry |
| Configurable rules and evidence checklist | Rules screen, rule editor, enabled metadata requirements                     |
| Purpose/retention mapping                 | Field/table declarations, provenance and complete field override behavior    |
| Missing metadata and gap report           | Metadata screen, preview and exported gaps CSV                               |
| Per-class precision/recall                | Results → measured evaluation; support and baseline method included          |
| Human technical review                    | Two scoped decisions, original dependencies and change history               |
| Final report and demo                     | Report export, pitch, pseudocode and documented workflow                     |

PS-019.pdf requires five predefined classes without naming them; the team should confirm the selected taxonomy with the mentor. It also refers to a separate report template. This repository's report is a draft to adapt to that template. Organizer-specific repository ownership/collaboration and independent manual annotation remain team deliverables; see [the checklist](EVALUATION_PROTOCOL.md).

## Architecture and boundaries

Next.js → FastAPI → modular Python core → SQLite evidence store. [Architecture and data flow](ARCHITECTURE.md) explain the modules, read-only experiments and review dependencies. Exports contain aggregate evidence rather than raw source rows; declarations, field names and reviewer text remain visible.

The prototype produces technical evidence for human review. It does not decide lawful basis, legal compliance or universal data flow. Identifier shape/checksum matches do not establish issuance or ownership. A complete checklist is not a compliance certificate. Hashes check package consistency without establishing authenticity.
