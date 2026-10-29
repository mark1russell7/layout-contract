import { describe, expect, it } from "vitest";
import { canvasAdvance, createMeasurer, fontKey, graphemesOf, layoutText, TEXT_MEASURES, TEXT_UNITS, textMeasures, type AdvanceFn } from "./text.ts";

/** A fake font: each character has a width of 7.3 px, a space 3.1 px, and "W" 11.9 px. The widths are not whole units, so the tests see the rounding. */
const fake: AdvanceFn = (text) => Array.from(text).reduce((s, c) => s + (c === " " ? 3.1 : c === "W" ? 11.9 : 7.3), 0);
const FONT = "12px sans-serif";
const base = (extra: object = {}) => ({ font: FONT, measurer: createMeasurer(fake), lineHeight: 16, ...extra });

/** A small seeded generator, so each run tests the same values. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOCAB = ["node", "edge", "Graph", "layout", "W", "a", "contract", "measure", "supercalifragilistic", "of", "the", "box"];
const sentence = (r: () => number): string => Array.from({ length: 1 + Math.floor(r() * 14) }, () => VOCAB[Math.floor(r() * VOCAB.length)]).join(r() < 0.2 ? "  " : " ");

describe("createMeasurer", () => {
  it("rounds to whole units and counts the cache hits", () => {
    const m = createMeasurer(fake);
    expect(m.advance("ab", FONT)).toBe(Math.round(14.6 * TEXT_UNITS));
    expect(m.advance("ab", "  12px   sans-serif ")).toBe(Math.round(14.6 * TEXT_UNITS));
    expect(m.stats()).toEqual({ requests: 2, hits: 1, calls: 1 });
    m.reset();
    expect(m.stats()).toEqual({ requests: 0, hits: 0, calls: 0 });
  });

  it("keeps at most maxEntries entries, and refuses a bad advance", () => {
    const m = createMeasurer(fake, { maxEntries: 2 });
    for (const s of ["a", "b", "c", "a"]) m.advance(s, FONT);
    expect(m.stats().hits).toBe(0);
    expect(() => createMeasurer(() => Number.NaN).advance("a", FONT)).toThrow(RangeError);
    expect(() => createMeasurer(fake, { maxEntries: -1 })).toThrow(RangeError);
  });

  it("gives the font key with collapsed white space", () => {
    expect(fontKey(" bold  12px\tInter ")).toBe("bold 12px Inter");
  });
});

describe("canvasAdvance", () => {
  it("sets the font only when it changes", () => {
    let sets = 0;
    let font = "";
    const context = {
      get font() {
        return font;
      },
      set font(f: string) {
        sets++;
        font = f;
      },
      measureText: (t: string) => ({ width: t.length }),
    };
    const advance = canvasAdvance(context);
    advance("a", "12px A");
    advance("bb", "12px A");
    advance("c", "12px B");
    expect(sets).toBe(2);
    expect(advance("ccc", "12px B")).toBe(3);
  });
});

describe("layoutText", () => {
  it("keeps a short text on one line, with the padding and the min width", () => {
    const l = layoutText("a b", base({ padding: 8, minWidth: 40 }));
    expect(l.lines).toEqual(["a b"]);
    // The width is the sum of the rounded advances of the segments, not the rounded sum.
    expect(l.widths[0]).toBe((2 * Math.round(7.3 * TEXT_UNITS) + Math.round(3.1 * TEXT_UNITS)) / TEXT_UNITS);
    expect(l.width).toBe(40);
    expect(l.height).toBe(16);
    expect(l.truncated).toBe(false);
  });

  it("collapses white space and breaks greedily at the wrap width", () => {
    // Each word "aaaa" is 29.2 px and a space 3.1 px, so 3 words take 93.8 px and 4 words take 126.1 px.
    const l = layoutText("aaaa  aaaa aaaa\naaaa aaaa", base({ wrapWidth: 100 }));
    expect(l.lines).toEqual(["aaaa aaaa aaaa", "aaaa aaaa"]);
    expect(l.lineCount).toBe(2);
    expect(l.height).toBe(32);
    expect(l.width).toBe(100);
  });

  it("keeps a long word whole by default, and breaks it with wordBreak anywhere", () => {
    const word = "a".repeat(20);
    const kept = layoutText(`x ${word}`, base({ wrapWidth: 50 }));
    expect(kept.lines).toEqual(["x", word]);
    expect(textMeasures(kept)["text.overflow"]).toBeGreaterThan(1);
    const broken = layoutText(`x ${word}`, base({ wrapWidth: 50, wordBreak: "anywhere" }));
    expect(broken.lines.slice(1).join("")).toBe(word);
    expect(Math.max(...broken.widths)).toBeLessThanOrEqual(50);
    expect(textMeasures(broken)["text.overflow"]).toBe(0);
  });

  it("cuts the text to maxChars grapheme clusters with the ellipsis", () => {
    const l = layoutText("abcdefghij", base({ maxChars: 5 }));
    expect(l.lines).toEqual(["abcd…"]);
    expect(l.truncated).toBe(true);
    expect(graphemesOf("é\u{1F44D}\u{1F3FD}")).toHaveLength(2);
  });

  it("cuts to maxLines and puts the ellipsis in the width of the last line", () => {
    const l = layoutText("aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa", base({ wrapWidth: 100, maxLines: 2 }));
    expect(l.lineCount).toBe(2);
    expect(l.lines[1]!.endsWith("…")).toBe(true);
    expect(l.lines[1]!.includes(" …")).toBe(false);
    expect(l.widths[1]).toBeLessThanOrEqual(100);
    expect(l.truncated).toBe(true);
  });

  it("gives the same lines with the cache and without it (T1), and each line width is the sum of its parts", () => {
    const r = rng(5);
    for (let t = 0; t < 300; t++) {
      const text = sentence(r);
      const opts = { wrapWidth: 20 + r() * 200, maxLines: r() < 0.3 ? 2 : undefined, wordBreak: r() < 0.5 ? ("anywhere" as const) : ("keep" as const) };
      const cached = layoutText(text, base(opts));
      const plain = layoutText(text, base({ ...opts, measurer: createMeasurer(fake, { maxEntries: 0 }) }));
      expect(JSON.stringify(cached)).toBe(JSON.stringify(plain));
      for (const w of cached.widths) expect(Number.isInteger(w * TEXT_UNITS)).toBe(true);
    }
  });

  it("refuses a bad line height", () => {
    expect(() => layoutText("a", base({ lineHeight: 0 }))).toThrow(RangeError);
  });
});

describe("textMeasures", () => {
  it("gives the raggedness of the lines before the last, and the cache hit share", () => {
    const m = createMeasurer(fake);
    const l = layoutText("aaaa aaaa aaaa aaaa aaaa", { font: FONT, measurer: m, lineHeight: 16, wrapWidth: 100 });
    const v = textMeasures(l, m.stats());
    const gap = (100 - l.widths[0]!) / 100;
    expect(v["text.raggedness"]).toBeCloseTo(gap * gap, 12);
    expect(v["text.lines"]).toBe(2);
    expect(v["text.cacheHit"]).toBeGreaterThan(0.5);
    expect(textMeasures(layoutText("a", base()))).toEqual({ "text.lines": 1, "text.raggedness": 0, "text.overflow": 0 });
  });

  it("has a spec for each measure", () => {
    expect(TEXT_MEASURES.map((s) => s.id)).toEqual(["text.lines", "text.raggedness", "text.overflow", "text.cacheHit", "text.ms"]);
  });
});
