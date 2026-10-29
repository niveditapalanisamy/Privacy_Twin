// Render the measured presentation with the same installed Edge used by browser tests.
const { chromium } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const output = resolve(__dirname, "../../docs/submission");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.goto(
      pathToFileURL(resolve(output, "PrivacyTwin-Pitch.html")).href,
    );
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.locator(".slide").evaluateAll((slides) =>
      slides
        .map((slide, i) => {
          const footer = slide.querySelector("footer").getBoundingClientRect();
          const children = [...slide.children].filter(
            (child) => child.tagName !== "FOOTER",
          );
          return {
            slide: i + 1,
            overlapsFooter: children.some(
              (child) => child.getBoundingClientRect().bottom > footer.top - 8,
            ),
          };
        })
        .filter((slide) => slide.overlapsFooter),
    );
    if (overflow.length)
      throw new Error(
        "Pitch content overlaps footer: " + JSON.stringify(overflow),
      );
    await page
      .locator(".slide")
      .first()
      .screenshot({ path: resolve(output, "pitch-preview.png") });
    await page
      .locator(".slide")
      .nth(4)
      .screenshot({ path: resolve(output, "results-preview.png") });
    await page.pdf({
      path: resolve(output, "PrivacyTwin-Pitch.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.goto(
      pathToFileURL(resolve(output, "PrivacyTwin-Technical-Report-Draft.html"))
        .href,
    );
    await page.pdf({
      path: resolve(output, "PrivacyTwin-Technical-Report-Draft.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    console.log(
      "Rendered seven slides to docs/submission/PrivacyTwin-Pitch.pdf; no footer overlaps.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
