# PrivacyTwin user manual

This walkthrough covers uploading data, inspecting evidence, running Gemini reviews, supplying metadata, detecting changes, and exporting the final report.

## 1. Open the application

Open **http://127.0.0.1:3000**.

If the app is stopped, run from PowerShell:

```powershell
# From the cloned repository root
.\Start-PrivacyTwin.ps1
```

After changing application code, stop the app, then run `Start-PrivacyTwin.ps1 -Build`. First-time installation instructions are in [BUILD.md](BUILD.md).

The top navigation contains **Sources → Rules → Inventory → Reviews → Metadata → Changes → Results**. You can jump directly between steps. **Scan report** in the header opens Results.

## 2. Sample input files

Use these provided files; they contain synthetic data:

- [walkthrough_v1.csv](examples/walkthrough_v1.csv): initial dataset, 20 records and 4 columns.
- [walkthrough_v2.csv](examples/walkthrough_v2.csv): same dataset, with only `employee_id` values replaced by phone-shaped numbers.
- [expected-results.json](examples/expected-results.json): verified results under the default detection policy.

The beginning of V1 is:

```csv
employee_id,email,postal_code,age
EMP-1001,person01@example.test,600001,25
EMP-1002,person02@example.test,600002,26
EMP-1003,person03@example.test,600001,27
```

Use the full supplied file for the exact counts below. This walkthrough's results were checked in an isolated workspace without changing your existing data or making additional AI requests.

**Scope matters:** if your workspace already contains other sources, its overall totals will be larger. Select **Manual walkthrough** in both the automation **Source** selector and the scan report's **Source** selector. They are independent filters. The final report export includes the whole workspace.

## 3. Register and scan

Open **Sources** and enter:

| Input       | Value                |
| ----------- | -------------------- |
| File        | `walkthrough_v1.csv` |
| Source name | `Manual walkthrough` |
| File format | `CSV`                |
| Action      | **Register & scan**  |

Expected result for this source:

- 20 records scanned and 4 fields discovered.
- Every field has 20 non-empty values and zero null values.
- No reviews are created by the scan itself.
- 20 missing metadata items: 5 requirements for each of 4 fields.
- 0 of 4 fields ready.

For your own data, CSV files need a header row. SQLite sources scan ordinary tables. Supported limits are 10 MB per source, 20,000 rows per table, 100 columns, 25 SQLite tables, and 250,000 cells per source. Empty or whitespace-only values count as null; literal `NA` is retained as a value.

## 4. Understand the detection results

Open **Inventory**, find your source, and select a field to inspect its evidence.

| Field         | Example input           | Expected candidate | Evidence score | Distinct values |
| ------------- | ----------------------- | ------------------ | -------------: | --------------: |
| `employee_id` | `EMP-1001`              | Identity           |          0.700 |              20 |
| `email`       | `person01@example.test` | Contact            |          0.700 |              20 |
| `postal_code` | `600001`                | Location           |          0.700 |               2 |
| `age`         | `25`                    | Demographic        |          0.700 |              20 |

Each matching detector has 20 matches out of 20 non-empty values. The score combines 0.20 header evidence and 0.50 format evidence. It is **not a 70% probability**. A candidate is not yet an accepted review decision.

These exact results assume the enabled built-in detection rules and default settings:

| Setting in Rules               | Default |
| ------------------------------ | ------: |
| Name hint weight               |    0.20 |
| Value format weight            |    0.50 |
| Declared context weight        |    0.30 |
| Acceptance threshold           |    0.25 |
| Near-tie threshold             |    0.12 |
| Pattern-rate change threshold  |    0.10 |
| Minimum comparable sample size |      10 |

Weights must total 1. Changing rules or thresholds can change results. Rule configuration is workspace-wide; saving it can require sources to be rescanned. Do not replace an intentional custom policy just to reproduce the example.

## 5. Run an automated review

Open **Scan report → Review automation**. The key indicator should read **Key configured**.

| Control                       | Example value                                                  |
| ----------------------------- | -------------------------------------------------------------- |
| Review mode                   | **Apply eligible decisions automatically**                     |
| Source                        | **Manual walkthrough**                                         |
| Minimum model confidence      | **70%** for the documented example; the general default is 95% |
| Maximum fields per run        | **4**                                                          |
| Classification review         | Checked                                                        |
| Metadata completeness review  | Checked                                                        |
| Share field names with Gemini | Unchecked                                                      |

Click **Start review**. On a new source with no current reviews, a successful run analyzes 4 fields and creates 8 proposals: classification and metadata for each field.

Expected behavior:

- The model supplies a rationale, suggested next step, and confidence for each proposal.
- Supported clear classifications can apply automatically if confidence is at least the selected threshold and local validation passes. Exactly 70% qualifies when the threshold is 70%.
- Missing metadata stays unresolved. The app will not automatically approve it merely because the model reports high confidence.
- Some classifications can remain pending because the model abstains or reports confidence below the threshold.
- The source remains at **0/4 ready** while metadata is missing, even if classification reviews were applied.

AI wording, confidence, and the number of automatically applied proposals are not fixed expected values. The scanner's evidence score and the model's confidence are separate measurements.

The [actual 70% review record](ai-live/REVIEW.md) uses a separate three-field synthetic input. It returned six proposals: two classifications applied automatically and four remained unresolved/pending. Its 14 screenshots and reports document the observed run; do not assume a fresh provider call returns identical wording or confidence.

The fixed provider model is **Gemini 3.1 Flash-Lite**. The app sends aggregate evidence and metadata completeness checks. Raw rows and declaration text stay local; field names are shared only if you enable the option.

### Control AI actions

| Control                         | Effect                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Draft proposals for my approval | Generates proposals without applying reviews automatically.                                                         |
| Accept decision                 | Applies a still-valid proposal after checking its snapshot, policy, declaration and previous review.                |
| Accept as unresolved            | Records an unresolved decision; it does not make the field ready.                                                   |
| Reject                          | Rejects a pending proposal without changing field reviews.                                                          |
| Pause                           | Stops new calls and automatic application; an in-flight result can finish as drafts.                                |
| Resume                          | Continues the same saved run.                                                                                       |
| Cancel                          | Stops the run and discards the in-flight response. Completed work remains.                                          |
| Revoke                          | Removes an applied AI decision from the active reviews. A new review is required; older decisions are not restored. |
| Inspect field                   | Opens the field's review page so you can inspect evidence and make your own decision.                               |

Current reviews are protected from automatic replacement, including current unresolved human decisions. To revise such a decision, open the field and save a new manual review. Reopened reviews can be considered by a new AI run.

Run settings are captured when you click Start. To use different settings, finish or cancel the current run, change the settings, and start another. A run that reaches its maximum-field limit only covers that subset; increase the limit or review remaining sources separately.

## 6. Supply metadata

The model cannot know your organization's purpose, retention period or ownership from format evidence. Enter these details yourself.

For this synthetic example, open any of the four fields and choose **Declaration & preview**:

| Input                   | Example value                                              |
| ----------------------- | ---------------------------------------------------------- |
| Apply declaration to    | **Entire table (csv)**                                     |
| Purpose                 | `Manage employee contact details for internal operations.` |
| Retention duration      | `12`                                                       |
| Retention unit          | `months`                                                   |
| Retention start trigger | `Employee account closure`                                 |
| Owner / data fiduciary  | `People Operations`                                        |
| Provenance              | `Synthetic CSV created for the PrivacyTwin walkthrough`    |
| Declared meaning        | Leave unset                                                |

The retention value above is a demonstration input, not a recommended legal retention period. Leaving meaning unset avoids assigning one meaning to four different field types.

1. Click **Preview effect**. Inspect the before/after checklist and affected fields. Preview makes no saved changes.
2. Click **Save declaration**.

Expected result: all 5 required metadata items are present for all 4 fields, so this source's gap count falls from **20 to 0**. Filling the details does not itself create clear metadata reviews.

For a fresh walkthrough, there are no field-level declarations. In an existing workspace, a field-level declaration completely overrides table-level metadata; missing field properties do not inherit from the table. Check the effective declaration if a table update does not remove a field's gaps.

After saving, start a **new** AI run to review the updated evidence. Pending proposals from before the declaration change are stale and cannot be applied as current decisions. Existing current classification reviews are skipped. Current unresolved metadata reviews need manual revision.

## 7. Complete or override reviews manually

For a predictable walkthrough, ensure each of the four fields has a current, clear classification review and a current, clear metadata review. You may accept valid clear AI proposals or record your own decisions.

Open the field → **Review decision**:

| Input              | Classification example for `employee_id`                                  |
| ------------------ | ------------------------------------------------------------------------- |
| Scope              | Classification                                                            |
| Review outcome     | **Clear · reviewed and accepted**                                         |
| Accepted class     | **Identity**                                                              |
| Reviewer name      | `Walkthrough reviewer`                                                    |
| Decision rationale | `Verified the synthetic employee identifier format and its intended use.` |
| Action             | **Save classification review**                                            |

Then switch to **metadata**:

| Input              | Metadata example                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Review outcome     | **Clear · reviewed and accepted**                                                                |
| Reviewer name      | `Walkthrough reviewer`                                                                           |
| Decision rationale | `Verified the declared purpose, retention, ownership and provenance for this synthetic dataset.` |
| Action             | **Save metadata review**                                                                         |

Rationales must contain 20–2,000 characters. For the other fields, select their evidenced class from the table in step 4. If you cannot justify a clear decision, record **Unresolved** or **None** instead.

After all eight review scopes are current and clear, with complete metadata and an up-to-date scan, the source-filtered report should show:

| Metric             | Expected |
| ------------------ | -------: |
| Fields ready       |    4 / 4 |
| Readiness          |     100% |
| Metadata gaps      |        0 |
| Reopened decisions |        0 |

Readiness describes review completion under the active policy. It is not a compliance certification. AI-applied reviews are explicitly attributed to the model and can count toward readiness when all criteria are met.

## 8. Demonstrate change detection

First finish step 7. Then open **Changes**:

| Input             | Value                  |
| ----------------- | ---------------------- |
| Registered source | **Manual walkthrough** |
| Replacement file  | `walkthrough_v2.csv`   |
| Action            | **Scan & compare**     |

Use the existing registered source. Registering V2 as a separate source would create a separate inventory rather than compare it with V1.

V2 changes `employee_id` from values such as `EMP-1001` to phone-shaped values such as `9000000000`. Headers and all other columns stay unchanged.

Expected results under the default policy:

| Item                                | Before   | After        |
| ----------------------------------- | -------- | ------------ |
| `employee_id` candidate             | Identity | Contact      |
| Top candidate score                 | 0.700    | 0.500        |
| `employee_id` classification review | Current  | **Reopened** |
| `employee_id` metadata review       | Current  | **Current**  |
| Other three fields' reviews         | Current  | Current      |
| Ready fields                        | 4 / 4    | **3 / 4**    |
| Readiness                           | 100%     | **75%**      |
| Reopened decisions                  | 0        | **1**        |
| Metadata gaps                       | 0        | 0            |

The original Identity review remains in history, but it no longer counts as a current clear classification. The new Contact candidate is still only a suggestion until reviewed.

Inspect the changed evidence and decide whether the values are actually telephone numbers or the source is malformed. Either correct the source or record a justified new review. Scanning V1 again does not silently restore an earlier review: reopened decisions remain open until reviewed again.

## 9. Read the insights and export

In **Scan report**, choose the source under the report's own Source selector. Review:

- **Review readiness:** fields meeting all current review and metadata requirements.
- **Detected categories:** suggested classes, not a count of confirmed personal records.
- **Missing usage details:** fields missing each configured metadata requirement.
- **Where to focus:** evidence-backed findings and suggested actions. Filter by priority and open the relevant field.
- **Model findings by batch:** generated observations from a particular AI run. New scans or decisions can make that run's observations historical; current field states take precedence.

Downloads:

| Export                            | Contents / expected file                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Final report · HTML / PDF**     | `privacytwin-final-report.html`: readable workspace-wide summary, current decisions, findings, AI runs, proposals and limitations. Open the downloaded file and select **Print / Save as PDF** for a PDF. |
| **Report JSON**                   | `privacytwin-final-report.json`: structured final report with provenance.                                                                                                                                 |
| **Privacy Passport**              | JSON inventory, snapshots, policies, declarations and review dependencies.                                                                                                                                |
| **Field inventory**               | CSV containing one row per field.                                                                                                                                                                         |
| **Metadata gap report**           | CSV of missing requirements.                                                                                                                                                                              |
| **Review history**                | JSON record of decisions and transitions.                                                                                                                                                                 |
| **Reproducible evidence package** | ZIP of aggregate evidence, original review dependencies, policies, inventory/gaps/history, latest evaluation when present and a standalone score verifier.                                                |

After the V2 step, the final report should show the reopened classification and remaining work, not claim that everything passed. If other sources exist, their results are also included. Exports represent the state at download time; download again after making changes.

## 10. Optional evaluation

For a visual explanation of every screen, use the [42-screenshot walkthrough](walkthrough/WALKTHROUGH.md). For all eight isolated change scenarios, open **Changes → Challenge ReviewGuard**, choose a scenario, and run it. The challenge shows expected/observed states and preserves your normal workspace. The field evidence workbench can temporarily remove header, value, declared-meaning or checksum signals without changing saved decisions.

In Results, select **Run evaluation** to run the bundled synthetic regression set. Results appear only after execution. For custom labels, upload a JSON file such as:

```json
[
  {
    "field": "email",
    "values": ["one@example.test", "two@example.test"],
    "expected": "Contact"
  },
  {
    "field": "employee_id",
    "values": ["EMP-1001", "EMP-1002"],
    "expected": "Identity"
  }
]
```

With the default detection policy, both examples should receive their expected class. This evaluates deterministic detection on the supplied labels, not Gemini's accuracy on arbitrary real data. The bundled benchmark is synthetic, not independent held-out validation.

## 11. Troubleshooting

| What you see                            | What to do / expected behavior                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key not configured                      | Set `GEMINI_API_KEY` on the backend or place the key in `data/gemini-key.txt`. Never use a browser `NEXT_PUBLIC_` variable. Restart the backend after changing its environment. |
| Gemini quota reached                    | Progress is preserved. Resume after your free quota resets. There is no automatic model fallback.                                                                               |
| Gemini temporarily unavailable          | Resume later on the same model. No fabricated result is substituted.                                                                                                            |
| Start review disabled                   | Finish, resume or cancel an active run; ensure a key, at least one scope, and a field limit from 1 to 250 are configured.                                                       |
| No eligible fields                      | Scan sources under the active policy. Current reviews are protected and skipped. Failed sources and stale scans cannot be automatically reviewed.                               |
| Proposal becomes stale                  | Its snapshot, policy, declaration or review changed. Generate a fresh proposal or review the latest field manually.                                                             |
| Configuration changed / rescan needed   | Rescan the affected source before reviewing the new evidence.                                                                                                                   |
| Declared meaning changed                | Rescan so the detector can incorporate the updated meaning.                                                                                                                     |
| Metadata complete but readiness is low  | Check for missing, unresolved, reopened or outdated reviews in both scopes.                                                                                                     |
| Field remains missing after replacement | Check exact column/table names. A rename creates a new field identity; it does not transfer approval.                                                                           |
| Results differ from this manual         | Check policy settings, file contents, selected source, prior declarations and existing reviews. AI wording/confidence can also vary.                                            |

The application is a local, single-workspace tool. The core scanner works without Gemini. Gemini uses a free-tier-eligible model, but Google controls the project's billing tier and data terms; keep the supplied key on its free-tier project.

## Quick demonstration sequence

1. Upload V1: show **4 fields, 20 gaps, 0 ready**.
2. Open evidence: show actual counts and category suggestions.
3. Run Gemini: show generated explanations, applied decisions and unresolved metadata.
4. Supply table metadata and complete reviews: show **4/4 ready**.
5. Replace with V2: show **1 reopened classification**, metadata still current, **3/4 ready**.
6. Download the final report: show the evidence, decision authors, changes and next steps.
