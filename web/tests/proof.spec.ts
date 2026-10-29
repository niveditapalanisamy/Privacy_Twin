import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("judge challenge executes real scoped lifecycles without changing workspace", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/export/passport")).json();
  await page.goto("/");
  await page.getByRole("button", { name: "ReviewGuard", exact: true }).click();
  const panel = page.locator(".challenge-panel");
  await expect(panel.getByLabel("Challenge scenario")).toHaveText(
    /Change values/,
  );
  await panel
    .getByRole("button", { name: "Run challenge", exact: true })
    .click();
  await expect(panel.locator(".proof-stats")).toContainText("33 / 33");
  await expect(panel.locator(".challenge-case")).toHaveCount(8);
  await panel.getByLabel("Challenge scenario").selectOption("values");
  await panel
    .getByRole("button", { name: "Run challenge", exact: true })
    .click();
  await expect(panel.locator(".proof-stats")).toContainText("4 / 4");
  const affected = panel
    .getByRole("row")
    .filter({ hasText: "loyalty_id" })
    .filter({ hasText: "classification" });
  await expect(affected).toContainText("reopened");
  await expect(
    panel
      .getByRole("row")
      .filter({ hasText: "loyalty_id" })
      .filter({ hasText: "metadata" }),
  ).toContainText("current");
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download challenge results" })
    .click();
  const saved = await download;
  const report = JSON.parse(await readFile((await saved.path())!, "utf-8"));
  expect(report.false_reopenings).toBe(0);
  const after = await (await request.get("/api/export/passport")).json();
  delete before.generated_at;
  delete after.generated_at;
  expect(after).toEqual(before);
  await page.screenshot({
    path: "test-results/reviewguard-challenge-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBeFalsy();
  await page.screenshot({
    path: "test-results/reviewguard-challenge-mobile.png",
    fullPage: true,
  });
});

test("evidence experiment, measured baselines and portable package are accessible", async ({
  page,
  request,
}) => {
  const source = await (
    await request.post("/api/sources", {
      multipart: {
        name: "Sensitivity source",
        kind: "CSV",
        file: {
          name: "proof.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("email\none@example.test\ntwo@example.test\n"),
        },
      },
    })
  ).json();
  expect(
    (
      await request.post(`/api/sources/${source.id}/scan`, {
        multipart: { request_id: crypto.randomUUID() },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("button", { name: "email Sensitivity source", exact: true })
    .click();
  const panel = page.locator(".experiment-panel");
  await panel.getByLabel("Header hints", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Compare evidence" }).click();
  await expect(panel.locator(".experiment-results")).toContainText("0.500");
  await expect(panel.locator(".proof-comparison")).toContainText("Contact");
  await panel.getByLabel("Value patterns", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Compare evidence" }).click();
  await expect(panel.locator(".proof-comparison")).toContainText("Abstained");
  await page.screenshot({
    path: "test-results/evidence-experiment-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBeFalsy();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page
    .getByRole("button", { name: "Exports & evaluation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run evaluation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Does validation help?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Headers + patterns", exact: true }).first(),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .locator(".export-card")
    .filter({ hasText: "Reproducible evidence package" })
    .getByRole("link")
    .click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("privacytwin-bundle.zip");
  const bytes = await readFile((await saved.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
});
