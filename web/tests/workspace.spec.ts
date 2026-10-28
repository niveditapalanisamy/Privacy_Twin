import { test, expect } from "@playwright/test";

test("scan report explains uploaded evidence and fits desktop and mobile", async ({ page, request }) => {
  const created = await request.post('/api/sources', { multipart: { name: 'Insight proof', kind: 'CSV', file: { name: 'proof.csv', mimeType: 'text/csv', buffer: Buffer.from('email\none@example.test\ntwo@example.test\n""\n') } } });
  expect(created.ok()).toBeTruthy();
  const source = await created.json();
  expect((await request.post(`/api/sources/${source.id}/scan`, { multipart: { request_id: crypto.randomUUID() } })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 1884, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Scan report', exact: true }).click();
  await page.getByLabel('Insights source').selectOption(source.id);
  await expect(page.locator('.result-hero')).toContainText('Analyzed 1 present field across 1 source');
  await expect(page.locator('.findings-grid')).toContainText('2/2 non-empty values');
  await expect(page.locator('.findings-grid')).toContainText('1 of 3 values are empty');
  await page.screenshot({ path: 'test-results/scan-report-desktop.png', fullPage: true, animations: 'disabled' });
  const bounds = await page.locator('main').boundingBox();
  expect(bounds!.width).toBeGreaterThan(1800);
  await page.getByLabel('Insight priority').selectOption('high');
  await expect(page.getByText('No findings match this priority.')).toBeVisible();
  await page.getByLabel('Insight priority').selectOption('all');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/scan-report-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBeFalsy();
  await page.locator('.finding-card').filter({ hasText: 'Missing usage details' }).getByRole('button', { name: 'Open metadata' }).click();
  await expect(page.getByRole('heading', { name: 'email', exact: true })).toBeVisible();
});

test("custom upload → review → rescan → scoped reopening → pure preview → export", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Data sources" }),
  ).toBeVisible();

  const rows = Array.from(
    { length: 20 },
    (_, i) => `EMP-${1000 + i},person${i}@example.test`,
  ).join("\n");
  await page.getByLabel("Upload source file").setInputFiles({
    name: "team-data.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`employee_id,email\n${rows}\n`),
  });
  await page
    .getByLabel("Source name", { exact: true })
    .fill("Browser custom source");
  await page
    .getByRole("button", { name: "Register & scan", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "registered and scanned",
  );
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const row = page.locator("tr").filter({
    has: page.getByRole("button", {
      name: "employee_id Browser custom source",
      exact: true,
    }),
  });
  await expect(row).toContainText("Identity");
  await expect(row).toContainText("20");
  await page
    .getByRole("button", {
      name: "employee_id Browser custom source",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "employee_id", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
  await page.getByLabel("Reviewer name").fill("Browser test reviewer");
  await page
    .getByLabel("Decision rationale")
    .fill("Verified the employee identifier patterns and their context.");
  await page
    .getByRole("button", { name: "Save classification review", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Classification review saved",
  );
  await page
    .getByRole("button", {
      name: "metadata Review declared context",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Decision rationale")
    .fill("Reviewed the missing metadata requirements with the source owner.");
  await page
    .getByRole("button", { name: "Save metadata review", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Metadata review saved",
  );
  await page.getByRole("button", { name: "ReviewGuard", exact: true }).click();
  await page
    .getByLabel("Registered source")
    .selectOption({ label: "Browser custom source" });
  const changed = Array.from(
    { length: 20 },
    (_, i) => `910000${String(i).padStart(4, "0")},person${i}@example.test`,
  ).join("\n");
  await page.getByLabel("Replacement file").setInputFiles({
    name: "team-data-v2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`employee_id,email\n${changed}\n`),
  });
  await page
    .getByRole("button", { name: "Scan & compare", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText("scanned");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const changedRow = page.locator("tr").filter({
    has: page.getByRole("button", {
      name: "employee_id Browser custom source",
      exact: true,
    }),
  });
  await expect(changedRow).toContainText("Contact");
  await expect(changedRow).toContainText("reopened");
  await expect(changedRow).toContainText("current");
  await page
    .getByRole("button", {
      name: "employee_id Browser custom source",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Declaration & preview", exact: true })
    .click();
  await page
    .getByLabel("Purpose", { exact: true })
    .fill("Employee directory operations");
  await page.getByLabel("Retention duration", { exact: true }).fill("2");
  await page
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("years");
  await page
    .getByLabel("Retention start trigger", { exact: true })
    .fill("End of employment");
  await page
    .getByLabel("Owner / data fiduciary", { exact: true })
    .fill("People operations");
  await page
    .getByLabel("Provenance", { exact: true })
    .fill("Owner-confirmed policy v1");
  const before = await (await request.get("/api/export/passport")).json();
  await page
    .getByRole("button", { name: "Preview effect", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save declaration", exact: true }),
  ).toBeEnabled();
  const after = await (await request.get("/api/export/passport")).json();
  delete before.generated_at;
  delete after.generated_at;
  expect(after).toEqual(before);
  await page
    .getByRole("button", { name: "Save declaration", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Declaration version saved",
  );
  await page
    .getByRole("button", { name: "Exports & evaluation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run evaluation", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Evaluation completed",
  );
  await expect(
    page.getByRole("heading", { name: "ReviewGuard replay" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .locator(".export-card")
    .filter({ has: page.getByRole("heading", { name: "Privacy Passport" }) })
    .getByRole("link")
    .click();
  expect((await download).suggestedFilename()).toBe(
    "privacytwin-passport.json",
  );
  expect(errors).toEqual([]);
});

test("custom detection rule changes actual scan results", async ({
  page,
  request,
}) => {
  const registration = await request.post("/api/sources", {
    multipart: {
      name: "Custom rule source",
      kind: "CSV",
      file: {
        name: "codes.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("code\nZX:1234\nZX:5678\n"),
      },
    },
  });
  expect(registration.ok()).toBeTruthy();
  const source = await registration.json();
  await request.post(`/api/sources/${source.id}/scan`, {
    multipart: { request_id: crypto.randomUUID() },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page
    .getByLabel("Rule identifier", { exact: true })
    .fill("custom_browser_code");
  await page
    .getByLabel("Display label", { exact: true })
    .fill("Custom customer code");
  await page
    .getByLabel("Full-value regular expression", { exact: true })
    .fill("ZX:[0-9]{4}");
  await page
    .getByLabel("Header context expression", { exact: true })
    .fill("code");
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .first()
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Configuration saved",
  );
  await page.getByRole("button", { name: "Data sources", exact: true }).click();
  await page
    .locator(".source-card")
    .filter({ has: page.getByRole("heading", { name: "Custom rule source" }) })
    .getByRole("button", { name: "Scan", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText("scanned");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const row = page.locator("tr").filter({
    has: page.getByRole("button", {
      name: "code Custom rule source",
      exact: true,
    }),
  });
  await expect(row).toContainText("Identity");
});

test("responsive navigation, search, and visual checkpoints", async ({
  page,
  request,
}) => {
  expect(
    (await request.post("/api/demo/load", { data: {} })).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Field inventory" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/inventory-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Search workspace", exact: true })
    .click();
  await page
    .getByPlaceholder("Search fields, sources, or pages")
    .fill("loyalty_id");
  await page
    .getByRole("dialog")
    .getByRole("button")
    .filter({ hasText: "loyalty_id" })
    .click();
  await expect(
    page.getByRole("heading", { name: "loyalty_id", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/evidence-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole("button", { name: "Data sources", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Data sources" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/sources-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBeFalsy();
  await expect(page.getByText("AI Assist", { exact: false })).toHaveCount(0);
});

test("stale browser review retains rationale and requires latest evidence", async ({
  page,
  request,
}) => {
  const registered = await request.post("/api/sources", {
    multipart: {
      name: "Concurrent source",
      kind: "CSV",
      file: {
        name: "concurrent.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("employee_id\nEMP-7001\nEMP-7002\n"),
      },
    },
  });
  const source = await registered.json();
  await request.post(`/api/sources/${source.id}/scan`, {
    multipart: { request_id: crypto.randomUUID() },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("button", { name: "employee_id Concurrent source", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
  await page.getByLabel("Reviewer name").fill("Concurrent reviewer");
  const rationale = "I reviewed the original identifier patterns and context.";
  await page.getByLabel("Decision rationale").fill(rationale);
  await request.post(`/api/sources/${source.id}/scan`, {
    multipart: {
      request_id: crypto.randomUUID(),
      file: {
        name: "changed.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("employee_id\n9876543210\n9123456789\n"),
      },
    },
  });
  await page
    .getByRole("button", { name: "Save classification review", exact: true })
    .click();
  await expect(page.locator(".error-banner[role=alert]")).toContainText(
    "changed",
  );
  await expect(page.getByLabel("Decision rationale")).toHaveValue(rationale);
  await page.getByRole("button", { name: "Reload data", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use latest evidence", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use latest evidence", exact: true })
    .click();
  await expect(page.getByLabel("Decision rationale")).toHaveValue(rationale);
  await page
    .getByRole("button", { name: "Save classification review", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText(
    "Classification review saved",
  );
});

test("top workflow and Radix controls preserve unsaved edits", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/load", { data: {} });
  await page.goto("/");
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Workflow steps" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to rules", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Detection settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Local workspace", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Your data changes.", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("slider", { name: "value format", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("slider", { name: "name hint", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await page
    .getByRole("button", { name: "Continue to inventory", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "value format", exact: true }),
  ).toHaveAttribute("aria-valuenow", "0.55");
  const toggle = page.getByRole("switch", {
    name: "Enable Email address",
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .first()
    .click();
  await expect(page.locator(".toast")).toContainText("Configuration saved");
  await page.screenshot({
    path: "test-results/settings-workflow-desktop.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Continue to inventory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inventory", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await page.getByLabel("Acceptance threshold", { exact: true }).fill("0.3");
  await page
    .getByRole("button", { name: "Continue to inventory", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard & continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inventory", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/settings-workflow-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBeFalsy();
});
