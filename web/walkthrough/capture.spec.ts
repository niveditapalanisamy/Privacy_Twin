import { test, expect, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

test("capture the complete learning walkthrough in an isolated workspace", async ({
  page,
  request,
}) => {
  const root = resolve(process.cwd(), "../docs/walkthrough");
  await mkdir(resolve(root, "screenshots"), { recursive: true });
  await mkdir(resolve(root, "downloads"), { recursive: true });
  const steps: {
    id: string;
    group: string;
    title: string;
    clicks: string;
    explanation: string;
    observed: string;
    screenshot: string;
  }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () => (await request.get("/api/state")).json();
  const health = await (await request.get("/api/health")).json();
  const backendHealth = await (
    await request.get("http://127.0.0.1:8002/api/health")
  ).json();
  expect(health.workspace_id).toBe(backendHealth.workspace_id);
  expect((await state()).fields).toHaveLength(0);
  expect((await state()).sources).toHaveLength(0);
  async function shot(
    id: string,
    group: string,
    title: string,
    clicks: string,
    explanation: string,
    observed: string,
    target?: Locator,
  ) {
    const screenshot = `screenshots/${id}.png`;
    const options = {
      path: resolve(root, screenshot),
      animations: "disabled" as const,
      style:
        ".workflow-shell,.workflow-actions,.toast,nextjs-portal{visibility:hidden!important}*{scroll-behavior:auto!important}",
    };
    await page.evaluate(() => document.fonts.ready);
    if (target) await target.screenshot(options);
    else {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot(options);
    }
    steps.push({ id, group, title, clicks, explanation, observed, screenshot });
    console.log(`Captured ${id}: ${title}`);
    await writeFile(
      resolve(root, "steps.json"),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          workspace_id: health.workspace_id,
          steps,
        },
        null,
        2,
      ),
    );
  }
  async function nav(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name, exact: true }).press("Enter");
  }
  async function toast(text: string) {
    await expect(page.locator(".toast[role=status]")).toContainText(text);
  }
  async function inspect(field: string, source = "Learning walkthrough") {
    await nav("Inventory");
    await page
      .getByRole("button", { name: `${field} ${source}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: field, exact: true }),
    ).toBeVisible();
  }
  async function fillReview(scope: string, outcome = "clear") {
    if (scope === "metadata")
      await page
        .getByRole("button", {
          name: "metadata Review declared context",
          exact: true,
        })
        .click();
    await page
      .getByRole("combobox", { name: "Review outcome", exact: true })
      .selectOption(outcome);
    await page.getByLabel("Reviewer name").fill("Learning demo reviewer");
    await page
      .getByLabel("Decision rationale")
      .fill(
        scope === "classification"
          ? "I inspected the observed value patterns, their counts and the synthetic employee context."
          : outcome === "unresolved"
            ? "The purpose and retention are missing; owner clarification is still required."
            : "I reviewed the owner-supplied synthetic purpose, retention trigger and provenance.",
      );
  }
  async function saveReview(scope: string) {
    await page
      .getByRole("button", { name: `Save ${scope} review`, exact: true })
      .click();
    await toast(
      scope === "classification"
        ? "Classification review saved"
        : "Metadata review saved",
    );
  }
  const v1 = resolve(process.cwd(), "../docs/examples/walkthrough_v1.csv");
  const v2 = resolve(process.cwd(), "../docs/examples/walkthrough_v2.csv");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Data sources", exact: true }),
  ).toBeVisible();
  await shot(
    "01-start",
    "A · The main workflow",
    "Start with an empty workspace",
    "Open PrivacyTwin → Sources.",
    "PrivacyTwin builds an inventory of fields, not just files. You supply synthetic CSV or SQLite data. No approvals or scan results exist until an action creates them.",
    "This isolated workspace has 0 sources and 0 discovered fields.",
  );
  await page.getByLabel("Upload source file").setInputFiles(v1);
  await page
    .getByLabel("Source name", { exact: true })
    .fill("Learning walkthrough");
  await shot(
    "02-upload",
    "A · The main workflow",
    "Choose a real input file",
    "Sources → Upload source file → walkthrough_v1.csv → name it Learning walkthrough.",
    "The sample contains 20 synthetic employees and four columns: employee_id, email, postal_code and age. Selecting a file is a draft; Register & scan commits the source and calculates evidence.",
    "The chosen file is ready to register. It has not been scanned yet.",
    page.locator(".source-intake"),
  );
  await page
    .getByRole("button", { name: "Register & scan", exact: true })
    .click();
  await toast("registered and scanned");
  const initial = await state();
  const sid = initial.sources[0].id;
  expect(initial.fields).toHaveLength(4);
  expect(initial.totals.gaps).toBe(20);
  await shot(
    "03-source-scanned",
    "A · The main workflow",
    "Registration produces a committed scan",
    "Click Register & scan.",
    "The scanner reads the actual source and stores aggregate counts and versioned evidence. It keeps a controlled local copy of the input. Twenty records produce four field profiles, not twenty findings.",
    "Observed: 1 CSV source, 20 rows, 4 discovered fields and no preloaded approvals.",
    page.locator(".source-card").first(),
  );
  await nav("Configuration");
  await expect(
    page.getByRole("heading", { name: "Detection settings", exact: true }),
  ).toBeVisible();
  await shot(
    "04-rules",
    "A · The main workflow",
    "Rules explain how findings are calculated",
    "Rules / Configuration → inspect weights and thresholds.",
    "The reference policy weights value patterns at 0.50, header hints at 0.20 and declared meaning at 0.30. A 0.25 acceptance threshold determines whether a candidate is suggested. These are configurable evidence weights, not probabilities.",
    "The walkthrough uses the saved reference policy. No configuration change is made here.",
    page.locator(".two-columns").first(),
  );
  await shot(
    "05-checklist",
    "A · The main workflow",
    "The checklist defines the required documentation",
    "Configuration → Required metadata.",
    "The checklist asks for purpose, retention duration/unit, a start trigger, an owner and provenance. Each is independently present or missing. A declaration can be complete without being a legal compliance finding.",
    "Five enabled requirements × four fields initially produce 20 metadata gaps.",
    page.locator(".checklist-settings").locator("..").first(),
  );
  await nav("Inventory");
  await expect(page.locator(".inventory-panel")).toContainText("employee_id");
  await shot(
    "06-inventory",
    "A · The main workflow",
    "Read the field inventory",
    "Inventory → inspect the four rows.",
    "employee_id is an Identity candidate, email is Contact, postal_code is Location and age is Demographic. The candidate is a scanner suggestion; the separate classification and metadata columns show human-review state.",
    "All four fields are unreviewed. Each has five missing metadata requirements.",
    page.locator(".inventory-panel"),
  );
  await inspect("employee_id");
  await shot(
    "07-evidence",
    "A · The main workflow",
    "Open the evidence behind one candidate",
    "Inventory → employee_id → Evidence.",
    "The internal-identifier rule matches all 20 non-empty values and the header provides a supporting hint. Grouped scoring yields 0.50 + 0.20 = 0.70. The interface shows counts and denominators, not raw rows.",
    "employee_id: Identity candidate, score 0.700, 20/20 identifier matches.",
    page.locator(".two-columns").first(),
  );
  const experiment = page.locator(".experiment-panel");
  await experiment.getByLabel("Header hints", { exact: true }).uncheck();
  await experiment.getByRole("button", { name: "Compare evidence" }).click();
  await expect(experiment.locator(".experiment-results")).toContainText(
    "0.500",
  );
  await shot(
    "08-without-header",
    "A · The main workflow",
    "Remove the header hint",
    "Evidence → What supports this finding? → uncheck Header hints → Compare evidence.",
    "The identifier values still support Identity after the name hint is removed. The score falls from 0.700 to 0.500 and remains above 0.25. This is a temporary calculation; no policy, snapshot or review is changed.",
    "Original Identity 0.700 → experiment Identity 0.500.",
    experiment,
  );
  await experiment.getByLabel("Value patterns", { exact: true }).uncheck();
  await experiment.getByRole("button", { name: "Compare evidence" }).click();
  await expect(experiment.locator(".proof-comparison")).toContainText(
    "Abstained",
  );
  await shot(
    "09-abstain",
    "A · The main workflow",
    "Remove enough support and the scanner abstains",
    "Also uncheck Value patterns → Compare evidence.",
    "There is no declared meaning in this example. Removing headers and value patterns leaves no positive support. Abstained means there is insufficient evidence for a suggested class; it does not mean the field is safe or non-personal.",
    "Original Identity → experiment Abstained. The saved finding remains Identity.",
    experiment,
  );
  await nav("Review decision");
  await fillReview("classification");
  await shot(
    "10-review-form",
    "A · The main workflow",
    "A human records a classification decision",
    "Field → Review decision → Classification → enter reviewer and rationale.",
    "The reviewer accepts an evidenced class and explains why. The saved decision records its original snapshot, policy and dependencies. This is a human judgement attached to evidence, not an automatic approval.",
    "The form is ready to save Identity for employee_id.",
    page.locator(".two-columns").first(),
  );
  await saveReview("classification");
  await fillReview("metadata", "unresolved");
  await saveReview("metadata");
  await shot(
    "11-unresolved-metadata",
    "A · The main workflow",
    "Current and clear are different",
    "Save classification → choose Metadata → mark Unresolved → save.",
    "Current means the decision still matches its dependencies. An unresolved metadata decision can be current while saying that documentation is missing. Clear describes the review outcome; current describes freshness.",
    "Classification: current / clear. Metadata: current / unresolved. Five documentation gaps remain for this field.",
    page.locator(".two-columns").first(),
  );
  await nav("Declaration & preview");
  await page.getByLabel("Apply declaration to").selectOption("table");
  await page
    .getByLabel("Purpose", { exact: true })
    .fill("Maintain the synthetic employee directory");
  await page.getByLabel("Retention duration", { exact: true }).fill("2");
  await page
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("years");
  await page
    .getByLabel("Owner / data fiduciary", { exact: true })
    .fill("Synthetic People Operations");
  await page
    .getByLabel("Provenance", { exact: true })
    .fill("Synthetic owner statement v1 for this walkthrough");
  const beforePreview = await (
    await request.get("/api/export/passport")
  ).json();
  await page
    .getByRole("button", { name: "Preview effect", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save declaration", exact: true }),
  ).toBeEnabled();
  const afterPreview = await (await request.get("/api/export/passport")).json();
  delete beforePreview.generated_at;
  delete afterPreview.generated_at;
  expect(afterPreview).toEqual(beforePreview);
  await shot(
    "12-incomplete-retention",
    "A · The main workflow",
    "A duration without a start trigger stays incomplete",
    "Declaration & preview → Entire table → enter purpose, 2 years, owner and provenance → Preview effect.",
    "Two years from when? Leaving the start trigger blank leaves one requirement open for each field. A table declaration supplies a shared default to all four fields. A field-specific declaration would completely override that default.",
    "Preview: employee_id gaps 5 → 1. The database export before and after preview is identical.",
    page.locator(".declaration-layout"),
  );
  await page
    .getByLabel("Retention start trigger", { exact: true })
    .fill("End of employment");
  await page
    .getByRole("button", { name: "Preview effect", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save declaration", exact: true }),
  ).toBeEnabled();
  await shot(
    "13-complete-preview",
    "A · The main workflow",
    "Complete the declaration and inspect the review impact",
    "Add Retention start trigger = End of employment → Preview effect.",
    "The projected checklist is now complete. The preview identifies the metadata review affected by the proposed declaration change. Classification does not depend on purpose or retention in this example.",
    "Preview: gaps 5 → 0 for employee_id. The employee_id metadata decision will reopen; its classification decision will stay current.",
    page.locator(".declaration-layout"),
  );
  await page
    .getByRole("button", { name: "Save declaration", exact: true })
    .click();
  await toast("Declaration version saved");
  const declared = await state();
  expect(declared.totals.gaps).toBe(0);
  await nav("Inventory");
  await shot(
    "14-metadata-save",
    "A · The main workflow",
    "Saving changes the metadata dependency",
    "Save declaration → Inventory.",
    "The shared table declaration closes all 20 gaps. The previously saved employee_id metadata review reopens because its declaration changed. The classification review stays current. The other fields still need human reviews.",
    "Four fields now have zero gaps. Exactly the saved metadata review reopens.",
    page.locator(".inventory-panel"),
  );
  for (const name of ["employee_id", "email", "postal_code", "age"]) {
    await inspect(name);
    await nav("Review decision");
    if (name !== "employee_id") {
      await fillReview("classification");
      await saveReview("classification");
    }
    await fillReview("metadata");
    await saveReview("metadata");
  }
  await nav("Exports & evaluation");
  await expect(page.locator(".result-hero")).toBeVisible();
  const ready = await (await request.get("/api/insights")).json();
  expect(ready.ready).toBe(4);
  await shot(
    "15-ready",
    "A · The main workflow",
    "Complete reviews and documentation before calling a field ready",
    "Review each field's classification and metadata → Results / Scan report.",
    "All four fields now have current clear reviews and complete configured metadata. Ready describes this technical workflow state. It does not establish lawful purpose, lawful retention or legal compliance.",
    "Observed: 4 of 4 fields ready, 0 metadata gaps, 0 reopened decisions.",
    page.locator(".scan-results"),
  );
  await nav("ReviewGuard");
  await page.getByLabel("Registered source").selectOption(sid);
  await page.getByLabel("Replacement file").setInputFiles(v2);
  await shot(
    "16-replacement",
    "A · The main workflow",
    "Replace values while keeping field identity",
    "Changes / ReviewGuard → Learning walkthrough → Replacement file = walkthrough_v2.csv.",
    "V2 has the same headers and unchanged email, postal and age values. Only employee_id changes: internal IDs are replaced with mobile-shaped numbers. The exact field identity survives, so ReviewGuard can compare against its saved reviews.",
    "Replacement selected. No rescan has been committed yet.",
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Run a comparison",
          exact: true,
        }),
      }),
  );
  await page
    .getByRole("button", { name: "Scan & compare", exact: true })
    .click();
  await toast("scanned");
  await nav("Inventory");
  const changedRow = page
    .locator("tr")
    .filter({
      has: page.getByRole("button", {
        name: "employee_id Learning walkthrough",
        exact: true,
      }),
    });
  await expect(changedRow).toContainText("reopened");
  await shot(
    "17-scoped-reopening",
    "A · The main workflow",
    "Only the affected classification review reopens",
    "Scan & compare → Inventory.",
    "The new values support Contact despite the employee_id name. That changes the evidence behind the classification review. Its metadata declaration is unchanged, so that review stays current. Reviews on email, age and postal_code are preserved.",
    "employee_id: Contact candidate, classification reopened, metadata current. One of eight saved scoped reviews reopens.",
    page.locator(".inventory-panel"),
  );
  await inspect("employee_id");
  await shot(
    "18-before-after",
    "A · The main workflow",
    "Compare actual old and new evidence",
    "employee_id → Evidence → Snapshot comparison.",
    "The previous snapshot has 20 internal-ID matches. The new snapshot has 20 Indian-mobile matches. Snapshots preserve the evidence that existed at scan time; opening an older snapshot does not restore its old approval.",
    "Previous Identity → selected Contact; both scans contain 20 non-empty values.",
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Snapshot comparison",
          exact: true,
        }),
      }),
  );
  await shot(
    "19-history",
    "A · The main workflow",
    "Read why a decision reopened",
    "Field → Field history → expand changed dependencies.",
    "History records the original decision and later state transitions. Changed candidate interpretations, relevant rules and detector counts explain this reopening. The original rationale and evidence reference remain attached to the review.",
    "A classification reopening event includes explicit before/after dependencies.",
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", { name: "Field history", exact: true }),
      }),
  );
  await nav("Exports & evaluation");
  await expect(page.locator(".result-hero")).toBeVisible();
  expect((await (await request.get("/api/insights")).json()).ready).toBe(3);
  await shot(
    "20-ready-after-change",
    "A · The main workflow",
    "Readiness falls for a specific reason",
    "Results / Scan report after V2.",
    "Three fields remain ready. employee_id needs a fresh classification decision because its evidence changed. Missing metadata and reopened reviews are different issues: this example has no metadata gaps.",
    "Observed: 3 of 4 fields ready; 1 reopened classification review; 0 metadata gaps.",
    page.locator(".scan-results"),
  );

  await nav("ReviewGuard");
  const challenge = page.locator(".challenge-panel");
  await expect(challenge.getByLabel("Challenge scenario")).toHaveText(
    /Change values/,
  );
  const explanations: Record<string, [string, string]> = {
    values: [
      "Internal-ID values become phone-shaped values. Classification depends on that evidence and reopens. Metadata remains current because its declaration is unchanged. Both email reviews are unrelated and remain current.",
      "4/4 expected review states matched: one classification reopened, three reviews current.",
    ],
    purpose: [
      "The synthetic owner removes the declared purpose. This changes the metadata dependency, so the metadata review reopens. The field's observed values and classification evidence stay the same.",
      "4/4 matched: loyalty metadata reopened; loyalty classification and both email reviews current.",
    ],
    relevant_rule: [
      "The rule the classification relied on is edited so the original identifiers no longer satisfy it. Reusing the old classification decision would rely on changed logic. Metadata is unaffected.",
      "4/4 matched: loyalty classification reopened; three other reviews current.",
    ],
    unrelated_rule: [
      "The birth-date detector is edited. Neither of these fields relied on that detector. A global policy version change alone should not reopen their classification or metadata reviews.",
      "4/4 matched: all four reviews remain current.",
    ],
    identical: [
      "A rescan produces new scan identifiers and timestamps, but the semantic evidence is identical. Fresh timestamps alone do not invalidate a review.",
      "4/4 matched: all four reviews remain current.",
    ],
    rename: [
      "loyalty_id is replaced by member_reference without an explicit mapping. The old field becomes missing. The new name is a new field identity with no copied approvals. Unrelated email reviews stay current.",
      "5/5 matched: two old reviews missing, new field unreviewed, two email reviews current.",
    ],
    reversion: [
      "Values change and reopen classification, then the original values are restored. ReviewGuard does not silently reapprove a reopened decision. A human must inspect and save a fresh review. Metadata and unrelated email reviews remain current.",
      "4/4 matched: classification remains reopened after restoration; other reviews current.",
    ],
    small_change: [
      "One of 50 identifiers becomes unrecognised, reducing the match rate from 100% to 98%. There is no new competing candidate, the denominator is sufficient and the rate change stays below the reference tolerance of 10 percentage points.",
      "4/4 matched: all reviews remain current. This is a configured tolerance, not a claim that every small change is harmless.",
    ],
  };
  const options = await (await request.get("/api/challenge")).json();
  for (let i = 0; i < options.scenarios.length; i++) {
    const scenario = options.scenarios[i];
    await challenge.getByLabel("Challenge scenario").selectOption(scenario.id);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/challenge") && r.request().method() === "POST",
    );
    await challenge
      .getByRole("button", { name: "Run challenge", exact: true })
      .click();
    expect((await response).ok()).toBeTruthy();
    await expect(challenge.locator(".challenge-case")).toHaveCount(1);
    await expect(challenge.locator(".proof-stats")).toContainText(
      scenario.id === "rename" ? "5 / 5" : "4 / 4",
    );
    await shot(
      `${21 + i}-challenge-${scenario.id}`,
      "B · All eight ReviewGuard scenarios",
      scenario.title,
      `Changes → Challenge ReviewGuard → ${scenario.title} → Run challenge.`,
      explanations[scenario.id][0],
      explanations[scenario.id][1],
      challenge,
    );
  }
  await challenge.getByLabel("Challenge scenario").selectOption("all");
  await challenge
    .getByRole("button", { name: "Run challenge", exact: true })
    .click();
  await expect(challenge.locator(".proof-stats")).toContainText("33 / 33");
  await shot(
    "29-challenge-summary",
    "B · All eight ReviewGuard scenarios",
    "Compare the complete challenge results",
    "Select Run all 8 scenarios → Run challenge.",
    "Each scenario runs real Service scans, declarations and scripted saved reviews inside a disposable workspace. Its fixed reference policy is separate from your workspace configuration. The results are regression checks, not an independent accuracy estimate.",
    "Observed: 33/33 states matched, 26 reviews stayed current, 0 false reopenings and 0 missed reopenings.",
    challenge,
  );

  await nav("Exports & evaluation");
  await page
    .getByRole("button", { name: "Run evaluation", exact: true })
    .click();
  await toast("Evaluation completed");
  const evaluation = (await state()).evaluation;
  await shot(
    "30-evaluation",
    "C · Evaluation, exports and extra cases",
    "Read precision, recall and support",
    "Results → Measured evaluation → Run evaluation.",
    "Precision asks how many predicted positives were correct. Recall asks how many labelled positives were found. Support is the number of labelled positive fields. The bundled benchmark has just two positive fields per class; perfect scores here do not establish real-world accuracy.",
    `Observed: ${evaluation.cases} benchmark fields, ${evaluation.stress_cases} separate stress fields. This is developer-authored synthetic regression data, not independent human-labelled validation.`,
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Measured evaluation",
          exact: true,
        }),
      }),
  );
  await shot(
    "31-baselines",
    "C · Evaluation, exports and extra cases",
    "Measure what checksums contribute",
    "Measured evaluation → Does validation help?.",
    "All variants use the same labelled fields. The header-only baseline assigns weight 1 to headers. The pattern baseline removes Aadhaar/GSTIN checksum checks. Full validation uses the saved configuration. Stress errors reveal differences hidden by the easy benchmark.",
    "Measured stress errors: headers 4/7; headers + patterns 2/7; full validation 0/7. These are results on this small constructed set.",
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Measured evaluation",
          exact: true,
        }),
      }),
  );
  await shot(
    "32-exports",
    "C · Evaluation, exports and extra cases",
    "Download evidence and gap reports",
    "Results → Exports.",
    "Inventory CSV lists fields and scoped review states. Gaps CSV lists missing requirements. Passport JSON includes snapshots and dependencies. History preserves decisions and transitions. The ZIP combines these with a manifest and standalone verifier; raw source rows are excluded.",
    "These exports reflect the current isolated walkthrough workspace, including the reopened employee_id review.",
    page.locator(".export-grid"),
  );
  for (const kind of [
    "bundle",
    "gaps",
    "inventory",
    "passport",
    "history",
    "evaluation",
  ]) {
    const response = await request.get(`/api/export/${kind}`);
    expect(response.ok()).toBeTruthy();
    const ext =
      kind === "bundle"
        ? "zip"
        : ["gaps", "inventory"].includes(kind)
          ? "csv"
          : "json";
    await writeFile(
      resolve(root, `downloads/privacytwin-${kind}.${ext}`),
      await response.body(),
    );
  }
  const finalReport = await request.get("/api/final-report?format=html");
  await writeFile(
    resolve(root, "downloads/final-report.html"),
    await finalReport.body(),
  );
  const reportPage = await page.context().newPage();
  await reportPage.setContent(await finalReport.text());
  await reportPage.screenshot({
    path: resolve(root, "screenshots/33-final-report.png"),
    fullPage: true,
    animations: "disabled",
  });
  steps.push({
    id: "33-final-report",
    group: "C · Evaluation, exports and extra cases",
    title: "Open the final human-review report",
    clicks: "Results → Final report · HTML / PDF → open the downloaded file.",
    explanation:
      "The report contains actual field decisions, gaps, findings and AI provenance when present. Print / Save as PDF exports the report. A reopened review remains visible in the report; export does not approve it.",
    observed:
      "The report shows three ready fields and the reopened employee_id classification. No AI review was run.",
    screenshot: "screenshots/33-final-report.png",
  });
  await reportPage.close();
  await shot(
    "34-optional-ai",
    "C · Evaluation, exports and extra cases",
    "Understand optional AI assistance",
    "Results → AI review controls → inspect review mode, scopes and threshold.",
    "Draft mode creates proposals for acceptance or rejection. Automatic mode can apply locally validated, sufficiently confident proposals while protecting current decisions. Pause, resume and cancel control a run; revoke supersedes an applied AI review. Model confidence is not calibrated accuracy. Missing owner declarations remain gaps.",
    "This screenshot shows idle controls only. No provider request, quota consumption or AI-generated decision is used in this walkthrough.",
    page.getByRole("region", { name: "AI review controls" }),
  );

  // A stale form is opened, then a concurrent isolated API scan changes its evidence.
  await inspect("employee_id");
  await nav("Review decision");
  await fillReview("classification");
  await request.post(`/api/sources/${sid}/scan`, {
    multipart: {
      request_id: crypto.randomUUID(),
      file: {
        name: "v1.csv",
        mimeType: "text/csv",
        buffer: await (await import("node:fs/promises")).readFile(v1),
      },
    },
  });
  await page
    .getByRole("button", { name: "Save classification review", exact: true })
    .click();
  await expect(page.locator(".error-banner")).toContainText("changed");
  await shot(
    "35-stale-form",
    "C · Evaluation, exports and extra cases",
    "A stale review form cannot overwrite newer evidence",
    "Open a review form → another scan changes its field → try Save classification review.",
    "Another browser or action may change evidence while you are typing. Revision checks reject a save based on an old snapshot. The rationale is preserved. Reload data, inspect the changes, then explicitly choose Use latest evidence before saving.",
    "Observed: the stale save is rejected; the reviewer's rationale remains in the form.",
  );
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use latest evidence", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use latest evidence", exact: true })
    .click();
  await saveReview("classification");
  await nav("ReviewGuard");
  await page.getByLabel("Registered source").selectOption(sid);
  await page
    .getByLabel("Replacement file")
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("email,email\none,two\n"),
    });
  await page
    .getByRole("button", { name: "Scan & compare", exact: true })
    .click();
  await expect(page.locator(".error-banner")).toContainText("Duplicate");
  await shot(
    "36-failed-scan",
    "C · Evaluation, exports and extra cases",
    "A failed scan preserves committed evidence",
    "Changes → select Learning walkthrough → upload a CSV with duplicate headers → Scan & compare.",
    "Malformed replacement input is rejected instead of replacing the last valid inventory. The source is marked failed, and its prior committed snapshots and reviews remain available. Fix the input and rescan before treating the source as healthy.",
    "Observed: duplicate-header error. The previous four fields are preserved.",
  );
  await nav("Data sources");
  // Clear the persistent error banner without discarding saved state.
  if (
    await page
      .getByRole("button", { name: "Dismiss error", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Dismiss error", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Load synthetic workspace", exact: true })
    .click();
  await toast("Sample sources ready");
  await shot(
    "37-csv-and-sqlite",
    "C · Evaluation, exports and extra cases",
    "The same scanner also handles SQLite and mixed fields",
    "Sources → Load synthetic workspace.",
    "The built-in demo adds three generated CSVs and one SQLite database with two tables. They pass through ordinary scanning. This is additional data: the earlier four-field learning source remains, so combined workspace totals increase.",
    "The workspace now contains the learning CSV plus four built-in synthetic sources. The SQLite source has contacts and offices tables.",
    page.locator(".sources-grid"),
  );
  await inspect("contact_value", "customers.csv");
  await shot(
    "38-mixed-values",
    "C · Evaluation, exports and extra cases",
    "A single field can contain several value types",
    "Inventory → customers.csv / contact_value → Evidence.",
    "A column does not always contain one uniform type. Here email and mobile detectors both contribute to the Contact class. The evidence retains their separate counts, while grouped scoring caps correlated evidence instead of adding every rule as independent support.",
    "Measured on this synthetic source: 32/50 email matches and 18/50 mobile matches.",
    page.locator(".two-columns").first(),
  );
  await inspect("ref_no", "customers.csv");
  const checks = page.locator(".experiment-panel");
  await checks.getByLabel("Checksum validation", { exact: true }).uncheck();
  await checks.getByRole("button", { name: "Compare evidence" }).click();
  await shot(
    "39-checksum",
    "C · Evaluation, exports and extra cases",
    "A checksum is stronger evidence than shape alone",
    "customers.csv / ref_no → What supports this finding? → uncheck Checksum validation → Compare evidence.",
    "A twelve-digit shape alone can create false positives. This synthetic field has 50 shape matches, of which 40 pass the configured Verhoeff check. Removing validation increases its evidence score. A checksum pass still does not prove issuance or identify a person.",
    "Official ID score 0.400 with checksum evidence → 0.500 using format matches alone.",
    checks,
  );
  // Demonstrate a new pattern through the actual configuration editor.
  const custom = await (
    await request.post("/api/sources", {
      multipart: {
        name: "Custom codes",
        kind: "CSV",
        file: {
          name: "codes.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("code\nZX:1234\nZX:5678\n"),
        },
      },
    })
  ).json();
  await request.post(`/api/sources/${custom.id}/scan`, {
    multipart: { request_id: crypto.randomUUID() },
  });
  await page.reload();
  await inspect("code", "Custom codes");
  await shot(
    "40-custom-before",
    "C · Evaluation, exports and extra cases",
    "An unknown pattern stays unknown",
    "Upload codes.csv with ZX:1234 and ZX:5678 → Inventory → code.",
    "The reference registry does not know this synthetic customer-code convention. The scanner leaves it without a suggested class. An owner or reviewer must supply context rather than treating every unfamiliar code as personal data.",
    "Before adding a rule: no supported candidate.",
    page.locator(".two-columns").first(),
  );
  await nav("Configuration");
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page
    .getByLabel("Rule identifier", { exact: true })
    .fill("walkthrough_customer_code");
  await page
    .getByLabel("Display label", { exact: true })
    .fill("Synthetic customer code");
  await page
    .getByLabel("Full-value regular expression", { exact: true })
    .fill("ZX:[0-9]{4}");
  await page
    .getByLabel("Header context expression", { exact: true })
    .fill("code");
  await shot(
    "41-custom-rule",
    "C · Evaluation, exports and extra cases",
    "Add a domain-specific rule",
    "Configuration → Add rule → set Identity, pattern ZX:[0-9]{4}, header code.",
    "Rules describe the organisation's declared conventions. Full-value matching prevents a substring from accidentally matching. Saving a rule versions the policy; existing sources must be rescanned before new findings can be reviewed under it.",
    "The synthetic custom rule is prepared in the editor; it has not yet changed scan results.",
    page.locator(".rule-item").last(),
  );
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .first()
    .click();
  await toast("Configuration saved");
  await nav("Data sources");
  await page
    .locator(".source-card")
    .filter({
      has: page.getByRole("heading", { name: "Custom codes", exact: true }),
    })
    .getByRole("button", { name: "Scan", exact: true })
    .click();
  await toast("scanned");
  await inspect("code", "Custom codes");
  await shot(
    "42-custom-after",
    "C · Evaluation, exports and extra cases",
    "A rescan applies the saved rule",
    "Save configuration → Sources → Custom codes / Scan → Inventory → code.",
    "The rescan now observes two value matches and the supporting header. The field becomes an Identity candidate under the explicit synthetic rule. It still needs a human review and declared purpose/retention; a detector match is not an approval.",
    "After the saved rule and rescan: Identity candidate, 2/2 matches, score 0.700.",
    page.locator(".two-columns").first(),
  );
  expect(errors).toEqual([]);
  await writeFile(
    resolve(root, "steps.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        workspace_id: health.workspace_id,
        scenario_count: 8,
        steps,
        browser_errors: errors,
      },
      null,
      2,
    ),
  );
});
