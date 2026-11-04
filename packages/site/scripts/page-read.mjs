// This script reads pages of the live site in a browser. It writes a screenshot of each page at each width and color scheme,
// and the text of the tags of each page. The workflow page-read.yml starts it and keeps the files as an artifact.
//   node scripts/page-read.mjs <base url> <out dir> <page>...
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const WIDTHS = [1280, 390];
const SCHEMES = ["light", "dark"];
const WAITING_TAG = "waiting for the first cover run";
const EXCEPTION_TAG = "no joint input";

const [base, out, ...pages] = process.argv.slice(2);
if (base === undefined || out === undefined || pages.length === 0) throw new RangeError("The arguments are <base url> <out dir> <page>...");
const dir = process.env["PLAYWRIGHT_DIR"];
if (dir === undefined) throw new RangeError("Set PLAYWRIGHT_DIR to the folder that holds the package playwright.");
const { chromium } = createRequire(join(dir, "package.json"))("playwright");

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const page of pages) {
  const name = page.replace(/\W+/g, "-");
  for (const width of WIDTHS) {
    for (const colorScheme of SCHEMES) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const tab = await context.newPage();
      const errors = [];
      tab.on("pageerror", (e) => errors.push(String(e)));
      await tab.goto(`${base.replace(/\/$/, "")}/${page}`, { waitUntil: "networkidle" });
      await tab.screenshot({ path: join(out, `${name}-${width}-${colorScheme}.png`), fullPage: true });
      const tags = await tab.locator(".tag").evaluateAll((all) => all.map((e) => ({ text: (e.textContent ?? "").trim(), title: e.getAttribute("title") ?? "", row: (e.parentElement?.textContent ?? "").trim().slice(0, 60) })));
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ page, width, colorScheme, tags, overflow, errors });
      await context.close();
    }
  }
}
await browser.close();

const lines = results.map((r) => {
  const count = (text) => r.tags.filter((t) => t.text === text).length;
  return `${r.page} ${r.width} ${r.colorScheme}: ${count(WAITING_TAG)} waiting, ${count(EXCEPTION_TAG)} with no joint input, ${r.tags.length} tags, overflow ${r.overflow}, errors ${r.errors.length}`;
});
writeFileSync(join(out, "tags.json"), `${JSON.stringify(results, null, 1)}\n`);
writeFileSync(join(out, "tags.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
