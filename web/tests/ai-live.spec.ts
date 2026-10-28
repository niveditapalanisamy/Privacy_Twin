import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ actionTimeout: 15000 });

test("live Gemini: upload, scan, review, export and revoke", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.PRIVACYTWIN_LIVE_AI !== "1",
    "Opt-in live provider test; consumes free-tier quota.",
  );
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const rows = Array.from(
    { length: 20 },
    (_, i) => `synthetic${i}@example.test`,
  ).join("\n");
  await page.getByLabel("Upload source file").setInputFiles({
    name: "live-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`email\n${rows}\n`),
  });
  await page
    .getByLabel("Source name", { exact: true })
    .fill("Live Gemini synthetic test");
  await page
    .getByRole("button", { name: "Register & scan", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "registered and scanned",
  );
  const workspace = await (await request.get("/api/state")).json();
  const source = workspace.sources.find(
    (s: any) => s.name === "Live Gemini synthetic test",
  );
  await page.getByRole("button", { name: "Scan report", exact: true }).click();
  const controls = page.getByRole("region", { name: "AI review controls" });
  await expect(
    controls.getByText("Key configured", { exact: true }),
  ).toBeVisible();
  await controls
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption(source.id);
  await controls.getByLabel("Maximum fields per run").fill("1");
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/ai/runs") && r.request().method() === "POST",
  );
  await controls
    .getByRole("button", { name: "Start review", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const started = await response.json();
  let completed: any;
  async function waitForTerminal() {
    await expect
      .poll(
        async () => {
          completed = await (
            await request.get(`/api/ai/runs/${started.id}`)
          ).json();
          return ["completed", "failed", "quota"].includes(completed.status);
        },
        { timeout: 110000, intervals: [1000, 2000] },
      )
      .toBeTruthy();
  }
  try {
    await waitForTerminal();
    if (
      completed.status === "failed" &&
      completed.error ===
        "Gemini is temporarily unavailable. Resume this run later."
    ) {
      // Exercise one explicit user Resume after a transient outage; never retry quota failures.
      const resumed = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/ai/runs/${started.id}/control`) &&
          r.request().method() === "POST",
      );
      await controls
        .getByRole("button", { name: "Resume", exact: true })
        .click();
      expect((await resumed).ok()).toBeTruthy();
      await waitForTerminal();
    }
    expect(
      completed.status,
      completed.error || "Live run did not complete",
    ).toBe("completed");
    expect(completed.proposals).toHaveLength(2);
    const classification = completed.proposals.find(
      (p: any) => p.scope === "classification",
    );
    const metadata = completed.proposals.find(
      (p: any) => p.scope === "metadata",
    );
    expect(classification.payload.model).toBe("gemini-3.1-flash-lite");
    expect(classification.payload.decision.outcome).toBe("clear");
    expect(metadata.payload.decision.outcome).toBe("unresolved");
    expect(metadata.status).toBe("pending");
    const card = controls
      .locator(".ai-proposal")
      .filter({ hasText: "email · classification" });
    await expect(card).toBeVisible();
    if (classification.status === "pending") {
      await card
        .getByRole("button", { name: "Accept decision", exact: true })
        .click();
    }
    await expect(card).toContainText("applied / current");
    const reportDownload = page.waitForEvent("download");
    await controls
      .getByRole("link", { name: "Report JSON", exact: true })
      .click();
    const reportPath = await (await reportDownload).path();
    expect(reportPath).toBeTruthy();
    const report = JSON.parse(await readFile(reportPath!, "utf-8"));
    const reviewed = report.fields.find((f: any) => f.source_id === source.id);
    expect(reviewed.reviews.classification.reviewer).toContain("AI");
    expect(reviewed.gap_count).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain("synthetic0@example.test");
    expect(
      report.ai_proposals.some(
        (p: any) => p.run_id === started.id && p.status === "applied",
      ),
    ).toBeTruthy();
    const htmlDownload = page.waitForEvent("download");
    await controls
      .getByRole("link", { name: "Final report · HTML / PDF", exact: true })
      .click();
    expect((await htmlDownload).suggestedFilename()).toBe(
      "privacytwin-final-report.html",
    );
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/live-gemini-review.png",
      animations: "disabled",
    });
    await card.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(card).toContainText("revoked / superseded");
    const after = await (await request.get("/api/state")).json();
    expect(
      after.fields.find((f: any) => f.source_id === source.id).reviews
        .classification,
    ).toBeUndefined();
    expect(errors).toEqual([]);
  } finally {
    const current = await (
      await request.get(`/api/ai/runs/${started.id}`)
    ).json();
    if (["running", "paused", "quota", "failed"].includes(current.status)) {
      await request.post(`/api/ai/runs/${started.id}/control`, {
        data: { action: "cancel" },
      });
    }
  }
});
