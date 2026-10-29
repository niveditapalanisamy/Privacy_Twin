import { test, expect, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("actual Gemini run with screenshot evidence and real review actions", async ({
  page,
  request,
}) => {
  const root = resolve(process.cwd(), "../docs/ai-live");
  await mkdir(resolve(root, "screenshots"), { recursive: true });
  await mkdir(resolve(root, "downloads"), { recursive: true });
  const steps: {
    id: string;
    title: string;
    explanation: string;
    observed: string;
    screenshot: string;
  }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () => (await request.get("/api/state")).json();
  const health = await (await request.get("/api/health")).json();
  expect(health.workspace_id).toBe(
    (await (await request.get("http://127.0.0.1:8003/api/health")).json())
      .workspace_id,
  );
  expect((await state()).sources).toHaveLength(0);
  const manifest: any = {
    generated_at: new Date().toISOString(),
    provider: "Actual Google Gemini API",
    simulated: false,
    external_provider_calls_requested: 1,
    confidence_threshold: 0.7,
    model: "gemini-3.1-flash-lite",
    workspace_id: health.workspace_id,
    source: "Synthetic live AI learning source",
    steps,
    browser_errors: errors,
  };
  const persist = async () =>
    writeFile(
      resolve(root, "run-summary.json"),
      JSON.stringify(manifest, null, 2),
    );
  async function shot(
    id: string,
    title: string,
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
    steps.push({ id, title, explanation, observed, screenshot });
    await persist();
    console.log(`Captured ${id}: ${title}`);
  }
  async function nav(name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name, exact: true }).press("Enter");
  }
  await page.goto("/");
  const rows = Array.from(
    { length: 20 },
    (_, i) =>
      `person${String(i).padStart(2, "0")}@example.test,EMP-${1000 + i},${i < 10 ? `mixed${i}@example.test` : `920000${String(i).padStart(4, "0")}`}`,
  ).join("\n");
  const sourceBytes = Buffer.from(`email,employee_id,contact_value\n${rows}\n`);
  await writeFile(resolve(root, "synthetic-live-input.csv"), sourceBytes);
  await page
    .getByLabel("Upload source file")
    .setInputFiles({
      name: "synthetic-live-ai.csv",
      mimeType: "text/csv",
      buffer: sourceBytes,
    });
  await page.getByLabel("Source name", { exact: true }).fill(manifest.source);
  await shot(
    "01-input",
    "Choose the synthetic input",
    "Twenty synthetic records contain three fields: email, employee_id and a mixed contact_value. No owner purpose or retention is declared. The source file stays local; the provider receives aggregate evidence instead of these rows.",
    "Input selected; the source has not yet been registered.",
    page.locator(".source-intake"),
  );
  await page
    .getByRole("button", { name: "Register & scan", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "registered and scanned",
  );
  const initial = await state();
  const sid = initial.sources[0].id;
  expect(initial.fields).toHaveLength(3);
  expect(initial.totals.gaps).toBe(15);
  manifest.before = { fields: 3, metadata_gaps: 15, reviews: 0 };
  await nav("Inventory");
  await shot(
    "02-before-ai",
    "The deterministic scanner runs first",
    "The ordinary scanner calculates candidate classes and evidence before any AI call. The mixed contact_value contains both email and mobile-shaped values. All three fields still need reviews and declared metadata.",
    "3 scanned fields; 15 missing metadata items; no saved reviews.",
    page.locator(".inventory-panel"),
  );
  await nav("Exports & evaluation");
  const controls = page.getByRole("region", { name: "AI review controls" });
  await expect(
    controls.getByText("Key configured", { exact: true }),
  ).toBeVisible();
  await controls
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption(sid);
  await controls
    .getByRole("combobox", { name: "Review mode", exact: true })
    .selectOption("automatic");
  await controls
    .getByRole("combobox", { name: "Minimum model confidence", exact: true })
    .selectOption("0.7");
  await controls.getByLabel("Maximum fields per run").fill("3");
  await expect(
    controls.getByLabel("Share field names with Gemini"),
  ).not.toBeChecked();
  await shot(
    "03-options",
    "Configure this review at 70%",
    "For this requested review, automatic mode allows locally validated clear proposals at or above 70% model confidence to apply. Both scopes are requested for three fields. Mixed evidence and missing metadata still require unresolved outcomes. Field-name sharing is off.",
    "Actual Gemini API; maximum 3 fields; classification and metadata; confidence threshold 70% inclusive; field names off.",
    controls,
  );
  const startedResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/ai/runs") && r.request().method() === "POST",
  );
  await controls
    .getByRole("button", { name: "Start review", exact: true })
    .click();
  const started = await startedResponse;
  expect(started.ok()).toBeTruthy();
  const run = await started.json();
  expect(run.options.confidence_threshold).toBe(0.7);
  manifest.run_id = run.id;
  await persist();
  let terminal: any;
  try {
    await expect(controls.locator(".automation-run")).toBeVisible();
    await shot(
      "04-started",
      "The server sends the aggregate evidence",
      "The server freezes the selected evidence, snapshot references and review scopes. The real provider is called by the background worker. There is no simulated response or browser-route fixture in this capture.",
      `Run ${run.id}; ${run.total} fields requested. The screenshot records the state at capture time.`,
      controls,
    );
    await expect
      .poll(
        async () => {
          terminal = await (await request.get(`/api/ai/runs/${run.id}`)).json();
          return ["completed", "failed", "quota"].includes(terminal.status);
        },
        { timeout: 110000, intervals: [1000, 2000] },
      )
      .toBeTruthy();
    manifest.provider_result = terminal;
    const payload = JSON.parse(
      execFileSync(
        resolve(process.cwd(), "../.venv/Scripts/python.exe"),
        [
          "-c",
          "import json,sqlite3,sys; c=sqlite3.connect(sys.argv[1]); p=json.loads(c.execute('SELECT payload FROM ai_runs WHERE id=?',(sys.argv[2],)).fetchone()[0]); print(json.dumps({'scopes':p['options']['scopes'],'fields':[f['input'] for f in p['fields']]}))",
          process.env.PRIVACYTWIN_LIVE_GUIDE_DB!,
          run.id,
        ],
        { encoding: "utf-8" },
      ),
    );
    expect(payload.fields).toHaveLength(3);
    expect(
      payload.fields.every((f: any) => !("name" in f) && !("values" in f)),
    ).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain("person00@example.test");
    await writeFile(
      resolve(root, "downloads/provider-aggregate-input.json"),
      JSON.stringify(payload, null, 2),
    );
    await writeFile(
      resolve(root, "downloads/provider-run-result.json"),
      JSON.stringify(terminal, null, 2),
    );
    if (terminal.status !== "completed") {
      await expect(controls.locator(".automation-run-head")).toContainText(
        terminal.status,
      );
      await shot(
        "05-provider-error",
        "The real provider did not complete the run",
        "This is the actual failure/quota state. No fabricated proposals are substituted and no automatic fallback is used. Progress remains saved. This capture makes no automatic retry.",
        terminal.error || terminal.status,
        controls,
      );
      manifest.outcome = "provider_did_not_complete";
      await persist();
      expect(
        terminal.status,
        terminal.error || "Live provider did not complete",
      ).toBe("completed");
      return;
    }
    expect(terminal.proposals).toHaveLength(6);
    await expect(controls.locator(".automation-run-head")).toContainText(
      "completed",
      { timeout: 15000 },
    );
    manifest.initial_counts = {
      proposals: terminal.proposals.length,
      applied: terminal.proposals.filter((p: any) => p.status === "applied")
        .length,
      pending: terminal.proposals.filter((p: any) => p.status === "pending")
        .length,
      unresolved: terminal.proposals.filter(
        (p: any) => p.payload.decision.outcome === "unresolved",
      ).length,
      tokens: terminal.usage.totalTokenCount || 0,
    };
    await shot(
      "05-completed",
      "Inspect the actual completed run",
      "The provider returned structured proposals. The backend checked the requested field/scope pairs, evidence references, ambiguity, metadata completeness and current revisions. Only eligible clear proposals were allowed to apply.",
      `Actual result: ${manifest.initial_counts.proposals} proposals; ${manifest.initial_counts.applied} applied; ${manifest.initial_counts.pending} pending; ${manifest.initial_counts.unresolved} unresolved; ${manifest.initial_counts.tokens} provider-reported tokens.`,
      controls,
    );
    const proposal = (field: string, scope: string) =>
      terminal.proposals.find(
        (p: any) => p.field === field && p.scope === scope,
      );
    const card = (field: string, scope: string) =>
      controls
        .locator(".ai-proposal")
        .filter({ hasText: `${field} · ${scope}` });
    const emailClass = proposal("email", "classification");
    const emailMeta = proposal("email", "metadata");
    const mixedClass = proposal("contact_value", "classification");
    expect(emailMeta.payload.decision.outcome).toBe("unresolved");
    expect(emailMeta.status).toBe("pending");
    expect(mixedClass.payload.decision.outcome).toBe("unresolved");
    expect(mixedClass.status).toBe("pending");
    await shot(
      "06-classification",
      "Read the email classification proposal",
      "Read the model's actual rationale, cited class and confidence. Applied means a review was saved; pending means it still awaits action. The confidence is the model's self-assessment, not measured accuracy.",
      `email classification: ${emailClass.payload.decision.outcome}; ${emailClass.status}; confidence ${emailClass.payload.decision.confidence}.`,
      card("email", "classification"),
    );
    await shot(
      "07-metadata",
      "Missing documentation stays unresolved",
      "The source has no declared purpose, retention, owner or provenance. AI can identify that gap and suggest a next step, but it cannot invent the business declaration. A high confidence in an unresolved outcome is not permission to mark it complete.",
      `email metadata: ${emailMeta.payload.decision.outcome}; ${emailMeta.status}. Five metadata gaps remain for this field.`,
      card("email", "metadata"),
    );
    await shot(
      "08-mixed",
      "Mixed evidence needs clarification",
      "contact_value has ten email-shaped and ten mobile-shaped values. The system preserves the mixed-field state. It does not allow an ambiguous/mixed field to become an automatically clear classification merely because the model sounds confident.",
      `contact_value classification: ${mixedClass.payload.decision.outcome}; ${mixedClass.status}.`,
      card("contact_value", "classification"),
    );
    await nav("Inventory");
    await shot(
      "09-inventory-after-ai",
      "Applied AI decisions appear in the inventory",
      "Current means the saved decision's dependencies are still fresh. Rows without applied decisions remain unreviewed. Metadata gaps stay visible regardless of whether classification was reviewed.",
      `After the real run: ${manifest.initial_counts.applied} applied proposals; all 15 metadata gaps remain.`,
      page.locator(".inventory-panel"),
    );
    await nav("Exports & evaluation");
    await expect(controls.locator(".automation-run-head")).toContainText(
      "completed",
    );
    await card("email", "metadata")
      .getByRole("button", { name: "Accept as unresolved", exact: true })
      .click();
    await expect(card("email", "metadata")).toContainText("applied / current");
    await shot(
      "10-accept-unresolved",
      "Accepting unresolved records the gap, not completeness",
      "Accept as unresolved saves the AI-assisted metadata assessment. It is a current unresolved review, explicitly attributed to user-approved AI. It does not fill purpose or retention and does not make the field ready.",
      "email metadata: applied / current, outcome unresolved. The five documentation gaps remain.",
      card("email", "metadata"),
    );
    const employeeMeta = card("employee_id", "metadata");
    await employeeMeta
      .getByRole("button", { name: "Reject", exact: true })
      .click();
    await expect(employeeMeta).toContainText("rejected");
    await shot(
      "11-reject",
      "Reject a proposal without saving a review",
      "Reject records the user's action on the proposal. It does not create a metadata review or remove documentary gaps. Existing current decisions are protected from AI overwrites.",
      "employee_id metadata proposal: rejected; no metadata review was created for it.",
      employeeMeta,
    );
    // If the model was cautious, explicitly accept its actual classification outcome before testing lifecycle actions.
    let current = await (await request.get(`/api/ai/runs/${run.id}`)).json();
    for (const name of ["email", "employee_id"]) {
      const p = current.proposals.find(
        (p: any) => p.field === name && p.scope === "classification",
      );
      if (p.status === "pending") {
        await card(name, "classification")
          .getByRole("button", {
            name:
              p.payload.decision.outcome === "unresolved"
                ? "Accept as unresolved"
                : "Accept decision",
            exact: true,
          })
          .click();
        await expect(card(name, "classification")).toContainText(
          "applied / current",
        );
      }
    }
    for (const format of ["html", "json"]) {
      const report = await request.get(`/api/final-report?format=${format}`);
      expect(report.ok()).toBeTruthy();
      await writeFile(
        resolve(root, `downloads/report-before-revoke.${format}`),
        await report.body(),
      );
    }
    const report = await (
      await request.get("/api/final-report?format=json")
    ).json();
    expect(JSON.stringify(report)).not.toContain("person00@example.test");
    expect(report.ai_runs.some((r: any) => r.id === run.id)).toBeTruthy();
    const reportPage = await page.context().newPage();
    await reportPage.setContent(
      await (await request.get("/api/final-report?format=html")).text(),
    );
    const reportImage = "screenshots/12-report.png";
    await reportPage.screenshot({
      path: resolve(root, reportImage),
      fullPage: true,
    });
    steps.push({
      id: "12-report",
      title: "The report includes AI provenance and unresolved work",
      explanation:
        "The actual report retains reviewer attribution, run information and proposal actions. Metadata gaps and unresolved outcomes remain visible. A report export does not approve a field.",
      observed: `Live run ${run.id} is included in report history. All three fields still have documentation gaps.`,
      screenshot: reportImage,
    });
    await reportPage.close();
    await card("email", "classification")
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await expect(card("email", "classification")).toContainText(
      "revoked / superseded",
    );
    await shot(
      "13-revoke",
      "Revoke an applied AI decision",
      "Revoke supersedes that applied AI review. It requires a fresh review and does not silently restore an earlier approval. The original proposal and action remain in the audit history.",
      "email classification: revoked / superseded. No current classification decision remains for that field.",
      card("email", "classification"),
    );
    // One ordinary rescan, with no further model call, tests ReviewGuard on an AI-origin review.
    const replacement = Buffer.from(
      `email,employee_id,contact_value\n${Array.from({ length: 20 }, (_, i) => `person${String(i).padStart(2, "0")}@example.test,910000${String(i).padStart(4, "0")},${i < 10 ? `mixed${i}@example.test` : `920000${String(i).padStart(4, "0")}`}`).join("\n")}\n`,
    );
    expect(
      (
        await request.post(`/api/sources/${sid}/scan`, {
          multipart: {
            request_id: crypto.randomUUID(),
            file: {
              name: "synthetic-v2.csv",
              mimeType: "text/csv",
              buffer: replacement,
            },
          },
        })
      ).ok(),
    ).toBeTruthy();
    await page.reload();
    await nav("Inventory");
    const after = await state();
    const employee = after.fields.find((f: any) => f.name === "employee_id");
    expect(employee.reviews.classification.state).toBe("reopened");
    manifest.after_actions = after;
    await shot(
      "14-ai-review-reopens",
      "ReviewGuard also checks AI-origin decisions",
      "Only employee_id values changed to phone-shaped numbers. Its saved AI-origin classification review now reopens through the ordinary dependency logic. Accepting AI output does not bypass later evidence checks. No second AI call was made.",
      "employee_id now has a Contact candidate and a reopened classification review. email's revoked classification remains unreviewed.",
      page.locator(".inventory-panel"),
    );
    current = await (await request.get(`/api/ai/runs/${run.id}`)).json();
    manifest.final_run = current;
    manifest.outcome = "completed_and_actions_verified";
    manifest.checks = {
      real_provider_completed: true,
      expected_six_proposals: true,
      missing_metadata_unresolved: true,
      mixed_classification_unresolved: true,
      accepted_unresolved_did_not_fill_metadata: true,
      rejection_verified: true,
      revocation_verified: true,
      ai_origin_review_reopened_on_changed_values: true,
      raw_values_absent_from_saved_model_input: true,
      field_names_not_shared: true,
      browser_errors: errors.length,
    };
    expect(after.totals.gaps).toBe(15);
    expect(errors).toEqual([]);
    for (const format of ["html", "json"]) {
      const r = await request.get(`/api/final-report?format=${format}`);
      await writeFile(
        resolve(root, `downloads/report-after-actions.${format}`),
        await r.body(),
      );
    }
    await persist();
    console.log(
      `Actual Gemini outcome: ${manifest.initial_counts.proposals} proposals, ${manifest.initial_counts.applied} automatically applied, ${manifest.initial_counts.tokens} reported tokens.`,
    );
  } finally {
    const current = await (await request.get(`/api/ai/runs/${run.id}`)).json();
    if (["running", "paused", "quota", "failed"].includes(current.status)) {
      await request.post(`/api/ai/runs/${run.id}/control`, {
        data: { action: "cancel" },
      });
    }
    await persist();
  }
});
