// This script reads pages of the live site in a browser. It writes a screenshot of each page at each width and color scheme,
// crops of each section at the native scale, and the text of the tags of each page. The workflow page-read.yml starts it and keeps the files as an artifact.
//   node scripts/page-read.ts <base url> <out dir> <page>...
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  type CropBox,
  cropName,
  cropTiles,
  type PageRead,
  pageUrl,
  READ_SCHEMES,
  READ_WIDTHS,
  type ReadScheme,
  type ReadSection,
  readLine,
  type ReadTag,
  screenshotName,
  sectionName,
} from "../src/page-read.ts";

/** The part of the API of Playwright that this script uses. The workflow installs the package outside the repository. */
interface Tab {
  on(event: "pageerror", listener: (error: Error) => void): void;
  goto(url: string, options: { waitUntil: "networkidle" }): Promise<unknown>;
  screenshot(options: { path: string; fullPage: boolean; clip?: CropBox }): Promise<unknown>;
  locator(selector: string): { evaluateAll<T>(read: (all: Element[]) => T): Promise<T> };
  evaluate<T>(read: () => T): Promise<T>;
}
interface Context {
  newPage(): Promise<Tab>;
  close(): Promise<void>;
}
interface Browser {
  newContext(options: { viewport: { width: number; height: number }; colorScheme: ReadScheme }): Promise<Context>;
  close(): Promise<void>;
}

const [base, out, ...pages] = process.argv.slice(2);
if (base === undefined || out === undefined || pages.length === 0) throw new RangeError("The arguments are <base url> <out dir> <page>...");
const dir = process.env["PLAYWRIGHT_DIR"];
if (dir === undefined) throw new RangeError("Set PLAYWRIGHT_DIR to the folder that holds the package playwright.");
const { chromium } = createRequire(join(dir, "package.json"))("playwright") as { chromium: { launch(): Promise<Browser> } };

const tagsOf = (all: Element[]): ReadTag[] =>
  all.map((e) => ({ text: (e.textContent ?? "").trim(), title: e.getAttribute("title") ?? "", row: (e.parentElement?.textContent ?? "").trim().slice(0, 60) }));

const sectionsOf = (all: Element[]): ReadSection[] =>
  all.map((e) => {
    const r = e.getBoundingClientRect();
    return { id: e.id, box: { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height } };
  });

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results: PageRead[] = [];
for (const page of pages) {
  for (const width of READ_WIDTHS) {
    for (const colorScheme of READ_SCHEMES) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const tab = await context.newPage();
      const errors: string[] = [];
      tab.on("pageerror", (e) => errors.push(String(e)));
      await tab.goto(pageUrl(base, page), { waitUntil: "networkidle" });
      await tab.screenshot({ path: join(out, screenshotName(page, width, colorScheme)), fullPage: true });
      const crops: string[] = [];
      const sections = await tab.locator("section").evaluateAll(sectionsOf);
      for (const [index, { id, box }] of sections.entries()) {
        for (const [tile, clip] of cropTiles(box).entries()) {
          const name = cropName(page, width, colorScheme, sectionName(id, index + 1), tile + 1);
          await tab.screenshot({ path: join(out, name), fullPage: true, clip });
          crops.push(name);
        }
      }
      const tags = await tab.locator(".tag").evaluateAll(tagsOf);
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ page, width, colorScheme, tags, overflow, errors, crops });
      await context.close();
    }
  }
}
await browser.close();

const lines = results.map(readLine);
writeFileSync(join(out, "tags.json"), `${JSON.stringify(results, null, 1)}\n`);
writeFileSync(join(out, "tags.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
