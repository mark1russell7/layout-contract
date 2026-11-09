import { describe, expect, it } from "vitest";
import { canvasAdvance, createMeasurer, createTextCharset, createTextLayoutCache, layoutText, PRINTABLE_ASCII, type AdvanceFn, type TextLayoutOptions } from "./text.ts";

/**
 * A CSS font with a list of families. A host with font stacks (`@mark1russell7/typeset` 0.4.0) picks one family of this list
 * for each grapheme cluster. Thus the contract gives the list to the host as it is. This test uses no font file.
 */
const FONT_LIST = '14px "Noto Sans", "Noto Sans JP", "Noto Emoji", sans-serif';

/** Latin, Japanese, an emoji, and the bidi controls LRM and RLI ... PDI: each cluster can need another family of the list. */
const TEXT = "Layout 日本語 \u{1F600} a‎b ⁧שלום⁩ supercalifragilistic";

/** This function gives a stub advance function that keeps the font of each request. */
function recording(): { advance: AdvanceFn; fonts: string[] } {
  const fonts: string[] = [];
  const advance: AdvanceFn = (text, font) => {
    fonts.push(font);
    return Array.from(text).length * 7.5;
  };
  return { advance, fonts };
}

const MODES: Record<string, Omit<TextLayoutOptions, "font" | "measurer" | "lineHeight">> = {
  "one line": {},
  "a wrap with a line limit and an ellipsis": { wrapWidth: 90, maxLines: 2 },
  "a break anywhere in a word": { wrapWidth: 60, wordBreak: "anywhere" },
  "the breaker total-fit": { wrapWidth: 90, breaker: "total-fit" },
  "the breaker balanced": { wrapWidth: 90, breaker: "balanced" },
  "a cluster limit": { maxChars: 12 },
  "the sizing bound-first": { wrapWidth: 90, sizing: "bound-first", charset: createTextCharset(PRINTABLE_ASCII) },
  "the sizing bound": { wrapWidth: 90, sizing: "bound", charset: createTextCharset(PRINTABLE_ASCII) },
};

describe("the font of a measure request", () => {
  for (const [name, mode] of Object.entries(MODES)) {
    it(`is the full family list, unchanged, with ${name}`, () => {
      const { advance, fonts } = recording();
      layoutText(TEXT, { font: FONT_LIST, measurer: createMeasurer(advance, { maxEntries: 0 }), lineHeight: 18, ...mode });
      expect(fonts.length).toBeGreaterThan(0);
      expect(new Set(fonts)).toEqual(new Set([FONT_LIST]));
    });
  }

  it("is the full family list, unchanged, through createTextLayoutCache", () => {
    const { advance, fonts } = recording();
    const cache = createTextLayoutCache();
    const options = { font: FONT_LIST, measurer: createMeasurer(advance), lineHeight: 18, wrapWidth: 90 };
    cache.layout(TEXT, options);
    cache.layout(`${TEXT} again`, options);
    expect(fonts.length).toBeGreaterThan(0);
    expect(new Set(fonts)).toEqual(new Set([FONT_LIST]));
  });

  it("is the full family list on the canvas context of canvasAdvance", () => {
    const set: string[] = [];
    let font = "";
    const context = {
      get font() {
        return font;
      },
      set font(value: string) {
        set.push(value);
        font = value;
      },
      measureText: (text: string) => ({ width: Array.from(text).length * 7.5 }),
    };
    layoutText(TEXT, { font: FONT_LIST, measurer: createMeasurer(canvasAdvance(context)), lineHeight: 18, wrapWidth: 90 });
    expect(set).toEqual([FONT_LIST]);
  });
});
