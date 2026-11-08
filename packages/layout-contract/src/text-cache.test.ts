import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { createMeasurer, createTextCharset, createTextLayoutCache, fontKey, layoutText, textMeasures, type AdvanceFn, type TextLayout, type TextLayoutCache, type TextLayoutOptions, type TextMeasurer } from "./text.ts";

/** A fake font: each code point has a width of 7.3 px and a space 3.1 px. A font that starts with "24px" is two times as wide. */
const fake: AdvanceFn = (text, font) => Array.from(text).reduce((s, c) => s + (c === " " ? 3.1 : 7.3), 0) * (font.startsWith("24px") ? 2 : 1);
const FONT = "12px sans-serif";

/** The options of a test without the measurer. */
type Plain = Omit<TextLayoutOptions, "measurer">;

/** This function gives a text that shows each difference of two layouts, also -0 and a field that a layout does not have. */
const exact = (layout: TextLayout): string => JSON.stringify(Object.entries(layout), (_key, value: unknown) => (Object.is(value, -0) ? "-0" : value));

/** This function gives the layout with no cache, from a new measurer, so no state of a test touches it. */
const plain = (text: string, options: Plain): TextLayout => layoutText(text, { ...options, measurer: createMeasurer(fake) });

const TEXTS = [
  "",
  "   ",
  "plain label",
  "a  run \t of\nwhite space",
  "Grüße aus Köln, naïve café",
  // Han, kana and Hangul.
  "混合 scripts と日本語のテキスト 한국어 문장",
  // Thai has no space between its words.
  "ไทยไม่มีช่องว่างระหว่างคำ",
  // Devanagari with conjuncts.
  "देवनागरी संयुक्त अक्षर",
  // Combining marks, in the two normal forms: they are different texts.
  "é ä Z̧͙͑",
  "é ä",
  // Emoji: a sequence with joiners, a flag, a skin tone and a keycap.
  "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466} family \u{1F1EB}\u{1F1F7} flag \u{1F44D}\u{1F3FD} tone 1️⃣ key",
  // Hebrew and Arabic in a Latin text.
  "abc שלום עולם def مرحبا بالعالم",
  // The bidirectional marks and isolates.
  "‮abc‬ ⁧שלום⁩ ‏x‎",
  "supercalifragilisticexpialidocious_and_more_of_the_same_long_word",
];

const OPTION_SETS: readonly Plain[] = [
  { font: FONT, lineHeight: 16 },
  { font: "24px sans-serif", lineHeight: 20.5 },
  { font: FONT, lineHeight: 16, wrapWidth: 80 },
  { font: FONT, lineHeight: 16, wrapWidth: 80, padding: 8, minWidth: 40 },
  { font: FONT, lineHeight: 16, wrapWidth: 60, maxLines: 2 },
  { font: FONT, lineHeight: 16, wrapWidth: 60, maxLines: 2, ellipsis: "..." },
  { font: FONT, lineHeight: 16, maxChars: 6 },
  { font: FONT, lineHeight: 16, maxChars: 6, ellipsis: "" },
  { font: FONT, lineHeight: 16, wrapWidth: 50, wordBreak: "anywhere" },
  { font: FONT, lineHeight: 16, wrapWidth: 90, breaker: "total-fit" },
  { font: FONT, lineHeight: 16, wrapWidth: 90, breaker: "balanced", maxLines: 3 },
  { font: FONT, lineHeight: 16, wrapWidth: 70, maxWidth: 300 },
  { font: FONT, lineHeight: 16, maxWidth: 30 },
];

describe("createTextLayoutCache: a result is the result of layoutText", () => {
  it("gives the same layout for each text and option set, on a miss and on a hit", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    for (const text of TEXTS) {
      for (const options of OPTION_SETS) {
        const want = exact(plain(text, options));
        expect(exact(cache.layout(text, { ...options, measurer }))).toBe(want);
        expect(exact(cache.layout(text, { ...options, measurer }))).toBe(want);
      }
    }
    const count = TEXTS.length * OPTION_SETS.length;
    expect(cache.stats()).toEqual({ requests: 2 * count, hits: count, calls: count, size: count });
  });

  it("gives the same layout for a seeded sequence through a small cache that removes entries", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 16 });
    const r = mulberry32(70);
    for (let i = 0; i < 2000; i++) {
      const text = TEXTS[Math.floor(r() * TEXTS.length)]!;
      const options = OPTION_SETS[Math.floor(r() * OPTION_SETS.length)]!;
      expect(exact(cache.layout(text, { ...options, measurer }))).toBe(exact(plain(text, options)));
    }
    const { requests, hits, calls, size } = cache.stats();
    expect(hits).toBeGreaterThan(0);
    expect(hits + calls).toBe(requests);
    expect(size).toBe(16);
  });

  it("gives the same object on a hit, and the measurer sees no request", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const first = cache.layout("a label", { font: FONT, measurer, lineHeight: 16 });
    const before = measurer.stats();
    expect(cache.layout("a label", { font: FONT, measurer, lineHeight: 16 })).toBe(first);
    expect(measurer.stats()).toEqual(before);
  });

  it("gives the hit share of the layouts to textMeasures", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    let layout = cache.layout("a", { font: FONT, measurer, lineHeight: 16 });
    for (let i = 0; i < 3; i++) layout = cache.layout("a", { font: FONT, measurer, lineHeight: 16 });
    expect(textMeasures(layout, cache.stats())["text.cacheHit"]).toBe(0.75);
  });

  it("keeps no entry for a call that throws, and throws the error of layoutText again", () => {
    const cache = createTextLayoutCache();
    const measurer = createMeasurer(fake);
    for (let i = 0; i < 2; i++) {
      expect(() => cache.layout("a", { font: FONT, measurer, lineHeight: 0 })).toThrow(RangeError);
      expect(() => cache.layout("a", { font: FONT, measurer, lineHeight: 16, breaker: "unknown" as "greedy" })).toThrow(RangeError);
    }
    expect(() => cache.layout("a", { font: FONT, measurer: createMeasurer(() => Number.NaN), lineHeight: 16 })).toThrow(RangeError);
    expect(cache.stats().size).toBe(0);
  });
});

describe("createTextLayoutCache: two different options do not share an entry", () => {
  const WORDS = "aaaa aaaa aaaa aaaa aaaa aaaa";

  // The type of this table is a Record, so a new option of `TextLayoutOptions` is a type error here until it has a case.
  const CASES: Record<keyof Plain, { readonly text: string; readonly a: Partial<Plain>; readonly b: Partial<Plain> }> = {
    font: { text: WORDS, a: { font: "12px A" }, b: { font: "24px A" } },
    lineHeight: { text: WORDS, a: { lineHeight: 16 }, b: { lineHeight: 20 } },
    wrapWidth: { text: WORDS, a: { wrapWidth: 100 }, b: { wrapWidth: 50 } },
    maxLines: { text: WORDS, a: { wrapWidth: 50, maxLines: 1 }, b: { wrapWidth: 50, maxLines: 2 } },
    maxChars: { text: WORDS, a: { maxChars: 5 }, b: { maxChars: 6 } },
    ellipsis: { text: WORDS, a: { maxChars: 5, ellipsis: "…" }, b: { maxChars: 5, ellipsis: "--" } },
    padding: { text: WORDS, a: { padding: 0 }, b: { padding: 8 } },
    minWidth: { text: "a", a: { minWidth: 0 }, b: { minWidth: 50 } },
    maxWidth: { text: WORDS, a: { maxWidth: 1000 }, b: { maxWidth: 10 } },
    wordBreak: { text: "a".repeat(30), a: { wrapWidth: 50, wordBreak: "keep" }, b: { wrapWidth: 50, wordBreak: "anywhere" } },
    breaker: { text: "aaa aaa aaa aaa a", a: { wrapWidth: 100, breaker: "greedy" }, b: { wrapWidth: 100, breaker: "balanced" } },
    sizing: { text: "aaaa", a: { sizing: "exact", charset: createTextCharset("a") }, b: { sizing: "bound", charset: createTextCharset("a") } },
    charset: { text: "aaaa", a: { sizing: "bound", charset: createTextCharset("a") }, b: { sizing: "bound", charset: createTextCharset("a", { pairMargin: 0.5 }) } },
  };

  for (const [field, { text, a, b }] of Object.entries(CASES)) {
    it(`keeps a separate entry for each value of ${field}`, () => {
      const left = { font: FONT, lineHeight: 16, ...a };
      const right = { font: FONT, lineHeight: 16, ...b };
      expect(exact(plain(text, left))).not.toBe(exact(plain(text, right)));
      const measurer = createMeasurer(fake);
      const cache = createTextLayoutCache();
      expect(exact(cache.layout(text, { ...left, measurer }))).toBe(exact(plain(text, left)));
      expect(exact(cache.layout(text, { ...right, measurer }))).toBe(exact(plain(text, right)));
      expect(cache.stats()).toMatchObject({ hits: 0, calls: 2, size: 2 });
    });
  }

  it("gives each pair that a joined key can confuse its own entry", () => {
    const measurer = createMeasurer(fake);
    const pairs: readonly (readonly [string, Plain, string, Plain])[] = [
      // The border between the font and the ellipsis.
      ["x", { font: "ab", lineHeight: 16, ellipsis: "c" }, "x", { font: "a", lineHeight: 16, ellipsis: "bc" }],
      // The border between the ellipsis and the text.
      ["cx", { font: "a", lineHeight: 16, ellipsis: "b" }, "x", { font: "a", lineHeight: 16, ellipsis: "bc" }],
      // The border between the font and the text, with no ellipsis.
      ["bx", { font: "a", lineHeight: 16 }, "x", { font: "ab", lineHeight: 16 }],
      // An empty ellipsis is a value, not the default.
      ["x", { font: "a", lineHeight: 16 }, "x", { font: "a", lineHeight: 16, ellipsis: "" }],
      // A text that looks like a part of a key.
      ["\u0000,1", { font: "a", lineHeight: 16 }, "\u0000,1,", { font: "a", lineHeight: 16 }],
      // A number and its neighbor in the key.
      ["x", { font: "a", lineHeight: 1, wrapWidth: 23 }, "x", { font: "a", lineHeight: 12, wrapWidth: 3 }],
      // The same number in two fields.
      ["x", { font: "a", lineHeight: 16, maxLines: 5 }, "x", { font: "a", lineHeight: 16, maxChars: 5 }],
      ["x", { font: "a", lineHeight: 16, minWidth: 5 }, "x", { font: "a", lineHeight: 16, padding: 5 }],
      // Zero and negative zero: `Object.is` shows the difference in the result.
      ["long text", { font: "a", lineHeight: 16, wrapWidth: 0 }, "long text", { font: "a", lineHeight: 16, wrapWidth: -0 }],
    ];
    for (const [t1, o1, t2, o2] of pairs) {
      const cache = createTextLayoutCache();
      const one = cache.layout(t1, { ...o1, measurer });
      const two = cache.layout(t2, { ...o2, measurer });
      expect(one).not.toBe(two);
      expect(cache.stats().size).toBe(2);
      expect(exact(one)).toBe(exact(plain(t1, o1)));
      expect(exact(two)).toBe(exact(plain(t2, o2)));
    }
  });

  it("keeps the two spellings of a font apart, although fontKey makes them equal", () => {
    // A measurer with no cache gives each raw font string to the advance function, so the two spellings can differ.
    const measurer = createMeasurer((text, font) => (font.includes("  ") ? 2 : 1) * text.length, { maxEntries: 0 });
    const cache = createTextLayoutCache();
    expect(fontKey("12px  A")).toBe(fontKey("12px A"));
    expect(cache.layout("abc", { font: "12px A", measurer, lineHeight: 16 }).width).toBe(3);
    expect(cache.layout("abc", { font: "12px  A", measurer, lineHeight: 16 }).width).toBe(6);
  });

  it("keeps two measurers apart, also with equal options", () => {
    const cache = createTextLayoutCache();
    const narrow = createMeasurer(() => 1);
    const wide = createMeasurer(() => 10);
    expect(cache.layout("abc", { font: FONT, measurer: narrow, lineHeight: 16 }).width).toBe(1);
    expect(cache.layout("abc", { font: FONT, measurer: wide, lineHeight: 16 }).width).toBe(10);
    expect(cache.layout("abc", { font: FONT, measurer: narrow, lineHeight: 16 }).width).toBe(1);
    expect(cache.stats()).toMatchObject({ hits: 1, calls: 2 });
  });

  it("sees a change of an option object between two calls", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const options = { font: FONT, measurer, lineHeight: 16, padding: 0 };
    expect(cache.layout("a", options).width).toBe(plain("a", options).width);
    options.padding = 8;
    expect(cache.layout("a", options).width).toBe(plain("a", options).width);
    expect(cache.stats()).toMatchObject({ hits: 0, calls: 2, size: 2 });
  });

  it("finds the entries of a set of options again after a different set", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const one = cache.layout("a", { font: FONT, measurer, lineHeight: 16 });
    const two = cache.layout("a", { font: FONT, measurer, lineHeight: 20 });
    expect(cache.layout("a", { font: FONT, measurer, lineHeight: 16 })).toBe(one);
    expect(cache.layout("a", { font: FONT, measurer, lineHeight: 20 })).toBe(two);
    expect(cache.stats()).toEqual({ requests: 4, hits: 2, calls: 2, size: 2 });
  });

  it("gives one entry to equal options in two different objects", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const options = { font: FONT, measurer, lineHeight: 16 };
    const first = cache.layout("a", options);
    expect(cache.layout("a", { ...options })).toBe(first);
    expect(cache.stats().size).toBe(1);
  });
});

describe("createTextLayoutCache: the old advances do not stay", () => {
  it("does not give a layout from before a reset of the measurer", () => {
    let scale = 1;
    const measurer = createMeasurer((text) => text.length * scale);
    const cache = createTextLayoutCache();
    expect(cache.layout("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(3);
    scale = 2;
    expect(cache.layout("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(3);
    measurer.reset();
    expect(cache.layout("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(6);
  });

  it("counts the resets of a measurer in generation", () => {
    const measurer = createMeasurer(fake);
    expect(measurer.generation?.()).toBe(0);
    measurer.reset();
    measurer.reset();
    expect(measurer.generation?.()).toBe(2);
  });

  it("needs a reset of the cache for a measurer without generation", () => {
    let scale = 1;
    const inner = createMeasurer((text) => text.length * scale);
    const measurer: TextMeasurer = { advance: inner.advance, stats: inner.stats, reset: inner.reset };
    const cache = createTextLayoutCache();
    expect(cache.layout("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(3);
    scale = 2;
    measurer.reset();
    expect(cache.layout("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(3);
    cache.reset();
    expect(cache.layout("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(6);
  });

  it("clears the entries and the counts in reset", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const first = cache.layout("a", { font: FONT, measurer, lineHeight: 16 });
    cache.reset();
    expect(cache.stats()).toEqual({ requests: 0, hits: 0, calls: 0, size: 0 });
    expect(cache.layout("a", { font: FONT, measurer, lineHeight: 16 })).not.toBe(first);
  });
});

describe("createTextLayoutCache: the bound and the eviction rule", () => {
  const call = (cache: TextLayoutCache, measurer: TextMeasurer, text: string): TextLayout => cache.layout(text, { font: FONT, measurer, lineHeight: 16 });

  it("keeps at most maxEntries entries at each step", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 8 });
    for (let i = 0; i < 100; i++) {
      call(cache, measurer, `label ${i}`);
      expect(cache.stats().size).toBe(Math.min(8, i + 1));
    }
  });

  it("has a default bound of 4096 entries", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    for (let i = 0; i < 4100; i++) call(cache, measurer, String(i));
    expect(cache.stats().size).toBe(4096);
    expect(cache.stats().hits).toBe(0);
  });

  it("removes the least recently used entry, and a hit counts as a use", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 2 });
    const a = call(cache, measurer, "a");
    const b = call(cache, measurer, "b");
    // The hit on "a" makes "b" the least recently used entry.
    expect(call(cache, measurer, "a")).toBe(a);
    call(cache, measurer, "c");
    expect(call(cache, measurer, "a")).toBe(a);
    expect(call(cache, measurer, "b")).not.toBe(b);
    expect(cache.stats()).toEqual({ requests: 6, hits: 2, calls: 4, size: 2 });
  });

  it("removes from the set of options with the oldest use first, and a set with no entry goes", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 3 });
    const small = (text: string): TextLayout => cache.layout(text, { font: FONT, measurer, lineHeight: 16 });
    const large = (text: string): TextLayout => cache.layout(text, { font: FONT, measurer, lineHeight: 20 });
    const a = small("a");
    const b = small("b");
    const c = large("c");
    // The hit on "a" makes the set of "c" the set with the oldest use, although "b" has an older use than "c".
    expect(small("a")).toBe(a);
    small("d");
    expect(cache.stats().size).toBe(3);
    expect(small("b")).toBe(b);
    expect(large("c")).not.toBe(c);
    // The new entry "c" removed "a": the small set had the oldest use, and "a" had the oldest use in it.
    expect(cache.stats()).toEqual({ requests: 7, hits: 2, calls: 5, size: 3 });
    expect(small("a")).not.toBe(a);
  });

  it("holds the bound over a seeded sequence of many option sets", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 5 });
    const r = mulberry32(71);
    for (let i = 0; i < 2000; i++) {
      const text = `label ${Math.floor(r() * 8)}`;
      const options = { font: FONT, lineHeight: 10 + Math.floor(r() * 4) };
      expect(exact(cache.layout(text, { ...options, measurer }))).toBe(exact(plain(text, options)));
      expect(cache.stats().size).toBeLessThanOrEqual(5);
    }
    expect(cache.stats().size).toBe(5);
  });

  it("removes the entries from before a reset of the measurer first", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 2 });
    call(cache, measurer, "old");
    measurer.reset();
    const a = call(cache, measurer, "a");
    call(cache, measurer, "b");
    expect(call(cache, measurer, "a")).toBe(a);
    expect(cache.stats().size).toBe(2);
  });

  it("counts the entries of all measurers in one bound", () => {
    const cache = createTextLayoutCache({ maxEntries: 4 });
    for (let i = 0; i < 20; i++) call(cache, createMeasurer(fake), "a");
    expect(cache.stats().size).toBe(4);
  });

  it("keeps no entry with maxEntries 0, and gives a frozen layout", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache({ maxEntries: 0 });
    const one = call(cache, measurer, "a");
    const two = call(cache, measurer, "a");
    expect(one).not.toBe(two);
    expect(Object.isFrozen(one)).toBe(true);
    expect(cache.stats()).toEqual({ requests: 2, hits: 0, calls: 2, size: 0 });
  });

  it("refuses a bad bound", () => {
    for (const maxEntries of [-1, 1.5, Number.NaN, Infinity]) expect(() => createTextLayoutCache({ maxEntries })).toThrow(RangeError);
  });
});

describe("createTextLayoutCache: a caller cannot change a shared result", () => {
  /** This function tries each change of a layout. A test module is in strict mode, so each change of a frozen object throws. */
  const attack = (layout: TextLayout): void => {
    const open = layout as unknown as { lines: string[]; widths: number[]; width: number; extra: number };
    expect(() => {
      open.width = 1;
    }).toThrow(TypeError);
    expect(() => {
      open.extra = 1;
    }).toThrow(TypeError);
    expect(() => open.lines.push("x")).toThrow(TypeError);
    expect(() => {
      open.lines[0] = "x";
    }).toThrow(TypeError);
    expect(() => open.widths.pop()).toThrow(TypeError);
    expect(() => {
      open.widths[0] = 1;
    }).toThrow(TypeError);
    expect(() => {
      open.lines.length = 0;
    }).toThrow(TypeError);
  };

  it("freezes the layout and its two arrays, on a miss and on a hit, for the two kinds of result", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const cases: readonly (readonly [string, Plain])[] = [
      ["a label", { font: FONT, lineHeight: 16 }],
      ["aaaa aaaa aaaa aaaa", { font: FONT, lineHeight: 16, wrapWidth: 50 }],
    ];
    for (const [text, options] of cases) {
      const want = exact(plain(text, options));
      for (let i = 0; i < 2; i++) {
        const layout = cache.layout(text, { ...options, measurer });
        expect(Object.isFrozen(layout) && Object.isFrozen(layout.lines) && Object.isFrozen(layout.widths)).toBe(true);
        attack(layout);
        expect(exact(layout)).toBe(want);
      }
    }
  });

  it("gives a copy that a caller can change, from structuredClone", () => {
    const measurer = createMeasurer(fake);
    const cache = createTextLayoutCache();
    const layout = cache.layout("a", { font: FONT, measurer, lineHeight: 16 });
    const copy = structuredClone(layout);
    (copy.lines as string[]).push("x");
    expect(layout.lines).toEqual(["a"]);
  });
});

describe("layoutText without a cache", () => {
  it("still gives a new object with no freeze for each call", () => {
    const options = { font: FONT, measurer: createMeasurer(fake), lineHeight: 16 };
    const one = layoutText("a label", options);
    const two = layoutText("a label", options);
    expect(one).not.toBe(two);
    expect(one.lines).not.toBe(two.lines);
    expect(one.widths).not.toBe(two.widths);
    expect(Object.isFrozen(one) || Object.isFrozen(one.lines) || Object.isFrozen(one.widths)).toBe(false);
    (one.lines as string[]).push("x");
    expect(layoutText("a label", options).lines).toEqual(["a label"]);
  });

  it("keeps no layout between calls, so a reset of the measurer has an effect at once", () => {
    let scale = 1;
    const measurer = createMeasurer((text) => text.length * scale);
    expect(layoutText("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(3);
    scale = 2;
    measurer.reset();
    expect(layoutText("abc", { font: FONT, measurer, lineHeight: 16 }).width).toBe(6);
  });
});
