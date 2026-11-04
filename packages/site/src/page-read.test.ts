import { describe, expect, it } from "vitest";
import { EXCEPTION_TAG, type PageRead, pageUrl, readLine, screenshotName, WAITING_TAG } from "./page-read.ts";

const tag = (text: string) => ({ text, title: "", row: "" });

describe("the read of a page", () => {
  it("gives a file name with no dot or slash from the page", () => {
    expect(screenshotName("compare.html", 390, "dark")).toBe("compare-html-390-dark.png");
    expect(screenshotName("docs/a.html", 1280, "light")).toBe("docs-a-html-1280-light.png");
  });

  it("joins the base and the page with one slash", () => {
    expect(pageUrl("https://example.test/site/", "compare.html")).toBe("https://example.test/site/compare.html");
    expect(pageUrl("https://example.test/site", "compare.html")).toBe("https://example.test/site/compare.html");
  });

  it("counts each tag only by its full text", () => {
    const read: PageRead = {
      page: "compare.html",
      width: 1280,
      colorScheme: "light",
      tags: [tag(WAITING_TAG), tag(WAITING_TAG), tag(EXCEPTION_TAG), tag(`${WAITING_TAG} soon`), tag("kept")],
      overflow: 0,
      errors: ["one"],
    };
    expect(readLine(read)).toBe("compare.html 1280 light: 2 waiting, 1 with no joint input, 5 tags, overflow 0, errors 1");
  });
});
