const { chromium } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const output = resolve(__dirname, "../../docs/ai-live");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1300, height: 1000 },
    });
    await page.goto(
      pathToFileURL(resolve(output, "Actual-AI-Review-70-Percent.html")).href,
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
    if (count !== 14)
      throw new Error(`Expected 14 actual screenshots; found ${count}`);
    await page.pdf({
      path: resolve(output, "Actual-AI-Review-70-Percent.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.screenshot({ path: resolve(output, "guide-preview.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("Guide overflows on mobile");
    console.log(
      "Rendered actual AI review PDF; all 14 screenshots decoded; mobile layout passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
