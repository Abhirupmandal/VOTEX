/**
 * Ad-hoc visual QA harness (Phase 5 §26).
 *
 * Captures full-page screenshots of every route at desktop and mobile widths so
 * the UI can be reviewed without a live backend. Not part of the Playwright
 * suite (the filename does not match the *.spec.ts test glob).
 *
 * Usage: node qa/visual-qa.mjs [electionId]
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const electionId = process.argv[2] ?? "1";

const routes = [
  ["landing", "/"],
  ["elections", "/elections"],
  ["election-detail", `/elections/${electionId}`],
  ["results", `/elections/${electionId}/results`],
  ["audit", "/audit"],
];

const outDir = "qa/screenshots";
mkdirSync(outDir, { recursive: true });

const viewports = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["mobile", devices["iPhone 13"]],
];

const browser = await chromium.launch();
for (const [name, path] of routes) {
  for (const [vp, opts] of viewports) {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${outDir}/${name}-${vp}.png`,
      fullPage: true,
    });
    console.log(`captured ${name}-${vp} (console errors: ${errors.length})`);
    if (errors.length) errors.forEach((e) => console.log(`  ! ${e}`));
    await context.close();
  }
}
await browser.close();
console.log("visual QA screenshots written to", outDir);
