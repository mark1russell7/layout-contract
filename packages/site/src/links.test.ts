// The tests of the links to the sites of the engines: each page has the mark, and the build gives each page both links.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_SITES, ENGINE_SITES_MARK, withEngineLinks } from "./links.ts";

const root = new URL("../", import.meta.url);
const pages = readdirSync(root).filter((f) => f.endsWith(".html"));

describe("the links to the sites of the engines", () => {
  it("finds the pages of the site", () => {
    expect(pages.sort()).toEqual(["compare.html", "index.html", "playground.html"]);
  });

  it("puts both links in the navigation of each page", () => {
    for (const page of pages) {
      const html = readFileSync(new URL(page, root), "utf8");
      const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
      expect(nav, page).toContain(ENGINE_SITES_MARK);
      const built = withEngineLinks(html, page);
      for (const s of ENGINE_SITES) {
        expect(html, `${page} keeps the address of ${s.name} in links.ts only`).not.toContain(s.href);
        expect(built, page).toContain(`<a class="ext-link" href="${s.href}">${s.name}</a>`);
      }
    }
  });

  it("has the two engines, each with an address of https", () => {
    expect(ENGINE_SITES.map((s) => s.name)).toEqual(["highways", "packing"]);
    for (const s of ENGINE_SITES) expect(s.href).toMatch(/^https:\/\/mark1russell7\.github\.io\/[a-z]+\/$/);
  });

  it("refuses a page without the mark", () => {
    expect(() => withEngineLinks("<nav></nav>", "x.html")).toThrow(/0 marks/);
  });
});
