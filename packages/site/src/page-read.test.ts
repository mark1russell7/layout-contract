import { describe, expect, it } from "vitest";
import { CROP_HEIGHT, cropName, cropTiles, EXCEPTION_TAG, type PageRead, pageUrl, readLine, screenshotName, sectionName, WAITING_TAG } from "./page-read.ts";

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
      crops: ["a.png", "b.png"],
    };
    expect(readLine(read)).toBe("compare.html 1280 light: 2 waiting, 1 with no joint input, 5 tags, overflow 0, errors 1, crops 2");
  });

  it("gives each crop a name that holds its page, its window, its section and its number", () => {
    expect(cropName("compare.html", 390, "dark", "bench", 2)).toBe("compare-html-390-dark-bench-02.png");
    expect(cropName("index.html", 1280, "light", sectionName("", 3), 1)).toBe("index-html-1280-light-section-3-01.png");
    expect(sectionName("spaces", 2)).toBe("spaces");
  });

  it("cuts a tall box into crops with no gap and no crop past the height", () => {
    const tiles = cropTiles({ x: 16, y: 300, width: 358, height: 2500 });
    expect(tiles.map((t) => [t.y, t.height])).toEqual([
      [300, CROP_HEIGHT],
      [1300, CROP_HEIGHT],
      [2300, 500],
    ]);
    expect(tiles.every((t) => t.x === 16 && t.width === 358)).toBe(true);
  });

  it("keeps each partial pixel of a box", () => {
    expect(cropTiles({ x: 10.5, y: 20.25, width: 100, height: 100 }, 1000)).toEqual([{ x: 10, y: 20, width: 101, height: 101 }]);
  });

  it("gives no crop for a box with no area, and refuses a height that is not positive", () => {
    expect(cropTiles({ x: 0, y: 0, width: 0, height: 100 })).toEqual([]);
    expect(cropTiles({ x: 0, y: 0, width: 100, height: 0 })).toEqual([]);
    expect(() => cropTiles({ x: 0, y: 0, width: 100, height: 100 }, 0)).toThrow(RangeError);
  });
});
