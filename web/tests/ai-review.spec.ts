import { test, expect } from "@playwright/test";

test("AI controls submit scope, pause, resume, cancel and export without a browser key", async ({
  page,
}) => {
  // UI contract fixture only. Backend automation and provider calls are tested separately.
  let current: any = null;
  await page.route("**/api/ai", (route) =>
    route.fulfill({
      json: {
        configured: true,
        model: "gemini-3.1-flash-lite",
        runs: current ? [current] : [],
      },
    }),
  );
  await page.route("**/api/ai/runs", async (route) => {
    const options = route.request().postDataJSON();
    expect(options.mode).toBe("draft");
    expect(options.share_field_names).toBe(false);
    expect(options.confidence_threshold).toBe(0.7);
    expect(JSON.stringify(options)).not.toContain("key");
    current = {
      id: "test-run",
      status: "running",
      processed: 0,
      total: 2,
      options,
      created_at: new Date().toISOString(),
      error: "",
      summaries: [],
      usage: {},
      proposals: [],
    };
    await route.fulfill({ json: current });
  });
  await page.route("**/api/ai/runs/test-run", (route) =>
    route.fulfill({ json: current }),
  );
  await page.route("**/api/ai/runs/test-run/control", async (route) => {
    const action = route.request().postDataJSON().action;
    current.status = {
      pause: "paused",
      resume: "running",
      cancel: "cancelled",
    }[action as "pause" | "resume" | "cancel"];
    await route.fulfill({ json: current });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Scan report", exact: true }).click();
  const controls = page.getByRole("region", { name: "AI review controls" });
  await expect(
    controls.getByText("Key configured", { exact: true }),
  ).toBeVisible();
  await controls.getByLabel("Review mode").selectOption("draft");
  await expect(controls.getByLabel("Minimum model confidence")).toHaveValue(
    "0.95",
  );
  await controls.getByLabel("Minimum model confidence").selectOption("0.7");
  await controls
    .getByRole("button", { name: "Start review", exact: true })
    .click();
  await expect(
    controls.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await controls.getByRole("button", { name: "Pause", exact: true }).click();
  await controls.getByRole("button", { name: "Resume", exact: true }).click();
  await controls.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    controls.getByRole("button", { name: "Start review", exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent("download");
  await controls
    .getByRole("link", { name: "Final report · HTML / PDF" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "privacytwin-final-report.html",
  );
  await page.screenshot({
    path: "test-results/ai-controls-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBeFalsy();
  await page.screenshot({
    path: "test-results/ai-controls-mobile.png",
    animations: "disabled",
  });
});
