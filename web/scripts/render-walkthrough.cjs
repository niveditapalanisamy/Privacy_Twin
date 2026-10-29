const { chromium } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const output = resolve(__dirname, "../../docs/walkthrough");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1300, height: 1000 },
    });
    await page.goto(
      pathToFileURL(resolve(output, "PrivacyTwin-Full-Walkthrough.html")).href,
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.querySelectorAll(".step img")].map((image) =>
          image.decode(),
        ),
      );
    });
    const count = await page.locator(".step img").count();
    if (count !== 42)
      throw new Error(`Expected 42 screenshots; found ${count}`);
    await page.locator(".step img").first().click();
    if (!(await page.locator("dialog").evaluate((dialog) => dialog.open)))
      throw new Error("Image zoom did not open");
    await page.keyboard.press("Escape");
    await page.pdf({
      path: resolve(output, "PrivacyTwin-Full-Walkthrough.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: resolve(output, "guide-preview.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error("Learning guide overflows on mobile");
    console.log(
      "Rendered PDF; all 42 images decoded; screenshot zoom and mobile layout passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
