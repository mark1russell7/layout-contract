import fc from "fast-check";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import * as released from "layout-contract-0221/text";
import { describe, expect, it } from "vitest";
import { DIGIT_LABELS, helveticaAdvance, LETTER_LABELS } from "../scripts/text-labels.ts";
import {
  createMeasurer,
  createTextCharset,
  createTextLayoutCache,
  DIGITS,
  layoutText,
  PRINTABLE_ASCII,
  TEXT_UNITS,
  type AdvanceFn,
  type TextCharset,
  type TextLayout,
  type TextLayoutOptions,
  type TextMeasurer,
  type TextSizing,
} from "./text.ts";

const FONT = "12px sans-serif";
type Plain = Omit<TextLayoutOptions, "measurer" | "font" | "lineHeight">;
const ASCII = createTextCharset(PRINTABLE_ASCII);
const DIGIT_SET = createTextCharset(DIGITS);

/** This function gives a text that shows each difference of two layouts, also a field that a layout does not have. */
const fields = (layout: TextLayout): string => JSON.stringify(Object.entries(layout));

/** This function gives the layout from a new measurer, so no state of a test touches it. */
const fresh = (text: string, options: Plain, advance: AdvanceFn = helveticaAdvance): TextLayout => layoutText(text, { font: FONT, lineHeight: 16, ...options, measurer: createMeasurer(advance) });

/** This function gives an advance function from a table of the code points, with a seeded width for each ASCII character. */
function seededWidths(seed: number): Map<string, number> {
  const r = mulberry32(seed);
  return new Map(Array.from(PRINTABLE_ASCII, (c) => [c, 2 + r() * 14] as const));
}

const sum = (text: string, widths: ReadonlyMap<string, number>): number => Array.from(text).reduce((s, c) => s + widths.get(c)!, 0);

/** This function gives the sum of a function of each pair of neighbor characters. */
function pairSum(text: string, pair: (a: string, b: string) => number): number {
  const c = Array.from(text);
  return c.slice(1).reduce((s, b, i) => s + pair(c[i]!, b), 0);
}

const WIDTHS = seededWidths(71);
const LARGEST = Math.max(...WIDTHS.values());
/** This function picks the kerning pairs from their codes, so each text has some and the pairs do not depend on the table of widths. */
const kernPair = (a: string, b: string): number => ((a.charCodeAt(0) * 31 + b.charCodeAt(0)) % 7 === 0 ? 1 : 0);

/** The hosts of the true-bound claim. Each one has a font behavior from the hard cases, and the `pairMargin` that its behavior needs. */
const HOSTS: readonly { readonly name: string; readonly advance: AdvanceFn; readonly pairMargin?: number }[] = [
  { name: "the table of Helvetica", advance: helveticaAdvance },
  { name: "seeded widths", advance: (text) => sum(text, WIDTHS) },
  // Each sum of 7.3 px has a larger rounded value than the sum of the rounded advances: 5 characters give 2336 units, and 5 times 467 is 2335.
  { name: "a width that rounds down", advance: (text) => Array.from(text).length * 7.3 },
  { name: "kerning that makes pairs narrower", advance: (text) => Math.max(0, sum(text, WIDTHS) - 1.5 * pairSum(text, kernPair)) },
  { name: "kerning that makes pairs wider, with a margin", advance: (text) => sum(text, WIDTHS) + 0.05 * LARGEST * pairSum(text, kernPair), pairMargin: 0.05 },
  // A canvas adds `letterSpacing` after each character, so the advance of one character holds it.
  { name: "letter spacing in each advance", advance: (text) => sum(text, WIDTHS) + 2.5 * Array.from(text).length },
  { name: "negative letter spacing in each advance", advance: (text) => sum(text, WIDTHS) - 0.5 * Array.from(text).length },
  // The spacing of a host that adds it only between two characters is a pair margin.
  { name: "letter spacing between characters, with a margin", advance: (text) => sum(text, WIDTHS) + 2 * Math.max(0, Array.from(text).length - 1), pairMargin: 2 / LARGEST },
  { name: "word spacing in the advance of the space", advance: (text) => sum(text, WIDTHS) + 6 * (text.match(/ /g)?.length ?? 0) },
];

const asciiText = fc.string({ unit: fc.constantFrom(...PRINTABLE_ASCII), maxLength: 48 });
const digitText = fc.string({ unit: fc.constantFrom(...DIGITS), maxLength: 48 });
const FAST_CHECK = { seed: 71, numRuns: 300 } as const;

describe("createTextCharset", () => {
  it("refuses each character that is not a plain advance", () => {
    const refused = [
      "\t", "\n", "\r", "\u000b", "\u000c", " ", " ", "\u0085",
      " ", " ", "　",
      "­",
      "​", "‌", "‍", "⁠", "﻿",
      "́", "️", "⃣",
      "\u{1f600}", "\u{1f1eb}", "\u{1f3fd}",
      "‎", "‏", "‪", "‮", "⁦",
      "א", "ا", "क", "ก", "ᄀ",
      "\ud800",
    ];
    for (const c of refused) expect(() => createTextCharset(`abc${c}`), `U+${c.codePointAt(0)!.toString(16)}`).toThrow(RangeError);
  });

  it("takes the characters of simple scripts, and refuses an empty set or a bad margin", () => {
    expect(createTextCharset("aéωжあ漢%").covers("漢%aé")).toBe(true);
    expect(() => createTextCharset("")).toThrow(RangeError);
    expect(() => createTextCharset("a", { pairMargin: -0.1 })).toThrow(RangeError);
    expect(() => createTextCharset("a", { pairMargin: Number.NaN })).toThrow(RangeError);
  });

  it("gives a frozen set, and covers a text by code points", () => {
    expect(Object.isFrozen(ASCII)).toBe(true);
    expect(DIGIT_SET.covers("")).toBe(true);
    expect(DIGIT_SET.covers("0123")).toBe(true);
    expect(DIGIT_SET.covers("01 23")).toBe(false);
    expect(ASCII.covers("café")).toBe(false);
    expect(createTextCharset("a\u{20000}").covers("\u{20000}a")).toBe(true);
    expect(createTextCharset("a\u{20000}").covers("\ud840")).toBe(false);
  });

  it("measures each member once for a font, and again for a new font", () => {
    const charset = createTextCharset("abc");
    const measurer = createMeasurer(helveticaAdvance);
    charset.unit(FONT, measurer);
    charset.unit(FONT, measurer);
    expect(measurer.stats().requests).toBe(3);
    charset.unit("14px sans-serif", measurer);
    expect(measurer.stats().requests).toBe(6);
  });

  it("forgets the oldest font of a full memo, and stays correct", () => {
    const charset = createTextCharset("ab");
    const measurer = createMeasurer((text, font) => text.length * Number.parseInt(font, 10));
    for (let size = 1; size <= 80; size++) expect(charset.unit(`${size}px x`, measurer)).toBe(size * TEXT_UNITS + 1);
    expect(charset.unit("1px x", measurer)).toBe(TEXT_UNITS + 1);
  });
});

describe("the bound is a true upper bound", () => {
  for (const host of HOSTS) {
    it(`holds for each text of the set: ${host.name}`, () => {
      const charset = createTextCharset(PRINTABLE_ASCII, { pairMargin: host.pairMargin ?? 0 });
      fc.assert(
        fc.property(asciiText, (text) => {
          const bound = fresh(text, { sizing: "bound", charset }, host.advance);
          const exact = fresh(text, {}, host.advance);
          expect(bound.bounded).toBe(true);
          expect(bound.widths[0]!).toBeGreaterThanOrEqual(exact.widths[0]!);
        }),
        FAST_CHECK,
      );
    });
  }

  it("holds for digits and for the labels of the bench", () => {
    fc.assert(fc.property(digitText, (text) => void expect(fresh(text, { sizing: "bound", charset: DIGIT_SET }).widths[0]!).toBeGreaterThanOrEqual(fresh(text, {}).widths[0]!)), FAST_CHECK);
    for (const text of LETTER_LABELS) expect(fresh(text, { sizing: "bound", charset: ASCII }).widths[0]!).toBeGreaterThanOrEqual(fresh(text, {}).widths[0]!);
    for (const text of DIGIT_LABELS) expect(fresh(text, { sizing: "bound", charset: DIGIT_SET }).widths[0]!).toBeGreaterThanOrEqual(fresh(text, {}).widths[0]!);
  });

  it("adds a unit for the rounding: the sum of rounded advances alone is low", () => {
    const advance: AdvanceFn = (text) => text.length * 7.3;
    const units = createMeasurer(advance).advance("a", FONT);
    const exact = fresh("aaaaa", {}, advance).widths[0]! * TEXT_UNITS;
    expect(5 * units).toBeLessThan(exact);
    expect(createTextCharset("a").unit(FONT, createMeasurer(advance))).toBe(units + 1);
  });

  it("needs pairMargin for kerning that makes a pair wider: without it the bound is low", () => {
    const advance: AdvanceFn = (text) => text.length * 8 + (text === "ab" ? 3 : 0);
    const label = "ab";
    const low = fresh(label, { sizing: "bound", charset: createTextCharset("ab") }, advance).widths[0]!;
    expect(low).toBeLessThan(fresh(label, {}, advance).widths[0]!);
    const held = fresh(label, { sizing: "bound", charset: createTextCharset("ab", { pairMargin: 3 / 8 }) }, advance).widths[0]!;
    expect(held).toBeGreaterThanOrEqual(fresh(label, {}, advance).widths[0]!);
  });

  it("gives more lines or the same count than exact with the greedy breaker", () => {
    fc.assert(
      fc.property(asciiText, fc.integer({ min: 30, max: 300 }), (text, wrapWidth) => {
        expect(fresh(text, { wrapWidth, sizing: "bound", charset: ASCII }).lineCount).toBeGreaterThanOrEqual(fresh(text, { wrapWidth }).lineCount);
      }),
      FAST_CHECK,
    );
  });
});

/** The counts of the two branches of `bound-first` over a run. */
interface Branches {
  skipped: number;
  measured: number;
}

/** This function examines claim B1 on one text: the check of a skipped label and the check of a measured label. */
function checkBoundFirst(text: string, options: Plain, charset: TextCharset, branches: Branches): void {
  const exact = fresh(text, options);
  const measurer = createMeasurer(helveticaAdvance);
  charset.unit(FONT, measurer);
  const before = measurer.stats().requests;
  const first = layoutText(text, { font: FONT, lineHeight: 16, ...options, measurer, sizing: "bound-first", charset });
  if (first.bounded === true) {
    branches.skipped++;
    expect(measurer.stats().requests).toBe(before);
    expect(exact.lineCount).toBe(1);
    expect(first.lineCount).toBe(1);
    expect(first.lines).toEqual(exact.lines);
    expect(first.height).toBe(exact.height);
    expect(first.truncated).toBe(exact.truncated);
    expect(first.wrapWidth).toBeUndefined();
    expect(first.widths[0]!).toBeGreaterThanOrEqual(exact.widths[0]!);
    expect(first.width).toBeGreaterThanOrEqual(exact.width);
  } else {
    branches.measured++;
    expect(fields(first)).toBe(fields(exact));
  }
}

const planOptions: fc.Arbitrary<Plain> = fc.record(
  {
    wrapWidth: fc.integer({ min: 10, max: 400 }),
    maxLines: fc.integer({ min: 1, max: 4 }),
    maxChars: fc.integer({ min: 1, max: 60 }),
    padding: fc.integer({ min: 0, max: 16 }),
    minWidth: fc.integer({ min: 0, max: 120 }),
    maxWidth: fc.integer({ min: 20, max: 500 }),
    wordBreak: fc.constantFrom("keep" as const, "anywhere" as const),
    breaker: fc.constantFrom("greedy" as const, "total-fit" as const, "balanced" as const),
  },
  { requiredKeys: [] },
);

describe("B1: a label that bound-first skips is one line, and a measured label is exact", () => {
  it("holds on 300 seeded ASCII texts with seeded options", () => {
    const branches = { skipped: 0, measured: 0 };
    fc.assert(fc.property(asciiText, planOptions, (text, options) => checkBoundFirst(text, options, ASCII, branches)), FAST_CHECK);
    expect(branches.skipped).toBeGreaterThan(30);
    expect(branches.measured).toBeGreaterThan(30);
  });

  it("holds on 300 seeded digit texts with seeded options", () => {
    const branches = { skipped: 0, measured: 0 };
    fc.assert(fc.property(digitText, planOptions, (text, options) => checkBoundFirst(text, options, DIGIT_SET, branches)), FAST_CHECK);
    expect(branches.skipped).toBeGreaterThan(30);
    expect(branches.measured).toBeGreaterThan(30);
  });

  it("holds on the labels of the bench with the options of the bench", () => {
    const options: Plain = { wrapWidth: 160, maxLines: 2 };
    const letters = { skipped: 0, measured: 0 };
    for (const text of LETTER_LABELS) checkBoundFirst(text, options, ASCII, letters);
    expect(letters.skipped).toBeGreaterThan(0);
    expect(letters.measured).toBeGreaterThan(0);
    const digits = { skipped: 0, measured: 0 };
    for (const text of DIGIT_LABELS) checkBoundFirst(text, options, DIGIT_SET, digits);
    expect(digits).toEqual({ skipped: 333, measured: 0 });
  });

  it("skips a label with room, and measures a label that does not fit", () => {
    const options: Plain = { sizing: "bound-first", charset: DIGIT_SET, wrapWidth: 40 };
    expect(fresh("123", options).bounded).toBe(true);
    const long = fresh("1234567890", options);
    expect(long.bounded).toBeUndefined();
  });

  it("keeps a text with no wrap width on one line, also with maxWidth", () => {
    const layout = fresh("12345678", { sizing: "bound-first", charset: DIGIT_SET, maxWidth: 20, padding: 4 });
    expect(layout.bounded).toBe(true);
    expect(layout.lineCount).toBe(1);
    expect(layout.width).toBe(20);
  });

  it("sizes an empty text as exact", () => {
    for (const text of ["", "   "]) {
      const layout = fresh(text, { sizing: "bound-first", charset: ASCII, padding: 3, minWidth: 1 });
      expect({ ...layout, bounded: undefined }).toEqual({ ...fresh(text, { padding: 3, minWidth: 1 }), bounded: undefined });
    }
  });

  it("collapses white space as exact, and the bound counts one space", () => {
    const layout = fresh("12   34", { sizing: "bound-first", charset: createTextCharset(`${DIGITS} `) });
    expect(layout.lines).toEqual(["12 34"]);
    const unit = createTextCharset(`${DIGITS} `).unit(FONT, createMeasurer(helveticaAdvance))!;
    expect(layout.widths[0]).toBe((5 * unit) / TEXT_UNITS);
  });
});

describe("the modes on a label out of the fast path", () => {
  const OUT = [
    "tab\there",
    "line\nbreak",
    "line\r\nbreak",
    "para break",
    "no break",
    "soft­hyphen",
    "zero​width",
    "join‍me",
    "bom﻿bom",
    "é",
    "Z̧͙͑",
    "\u{1f469}‍\u{1f469}‍\u{1f467} family",
    "\u{1f1eb}\u{1f1f7} flag",
    "1️⃣ key",
    "abc שלום def",
    "abc مرحبا",
    "‮abc‬",
    "त्र",
    "\ud800 lone",
  ];

  for (const sizing of ["bound-first", "bound"] as const) {
    it(`gives the exact layout for each case with ${sizing}`, () => {
      for (const text of OUT) {
        for (const options of [{}, { wrapWidth: 30 }, { wrapWidth: 30, maxLines: 1 }, { maxChars: 3 }] satisfies Plain[]) {
          expect(fields(fresh(text, { ...options, sizing, charset: ASCII }))).toBe(fields(fresh(text, options)));
        }
      }
    });
  }

  it("collapses a line break to one space in exact, so a label with a line break has no hard break", () => {
    expect(fresh("a\nb", {}).lines).toEqual(["a b"]);
    expect(fresh("a\nb", { sizing: "bound-first", charset: ASCII }).bounded).toBeUndefined();
  });

  it("measures a label that the cut of maxChars ends with an ellipsis out of the set", () => {
    const options: Plain = { maxChars: 3, wrapWidth: 100 };
    const exact = fresh("123456", options);
    expect(exact.truncated).toBe(true);
    expect(fields(fresh("123456", { ...options, sizing: "bound-first", charset: DIGIT_SET }))).toBe(fields(exact));
    expect(fields(fresh("123456", { ...options, sizing: "bound", charset: DIGIT_SET }))).toBe(fields(exact));
  });

  it("uses the fast path when the set holds the ellipsis of the cut", () => {
    const layout = fresh("123456", { maxChars: 3, wrapWidth: 100, sizing: "bound-first", charset: createTextCharset(`${DIGITS}…`) });
    expect(layout.bounded).toBe(true);
    expect(layout.truncated).toBe(true);
    expect(layout.lines).toEqual(["12…"]);
  });
});

describe("a gap in the set leaves the fast path", () => {
  it("measures a text with a character out of the set", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const layout = layoutText("12a", { font: FONT, lineHeight: 16, measurer, sizing: "bound", charset: DIGIT_SET });
    expect(layout.bounded).toBeUndefined();
    expect(layout.widths[0]).toBe(fresh("12a", {}).widths[0]);
  });

  it("measures each label of a font with a member of no advance", () => {
    const advance: AdvanceFn = (text) => (text === "7" ? 0 : text.length * 6);
    for (const sizing of ["bound-first", "bound"] as const) {
      const layout = fresh("123", { sizing, charset: DIGIT_SET }, advance);
      expect(layout.bounded).toBeUndefined();
      expect(layout.widths[0]).toBe(18);
    }
  });

  it("measures each label of a measurer that gives no number for a member", () => {
    const inner = createMeasurer(helveticaAdvance);
    const broken: TextMeasurer = { ...inner, advance: (segment, font) => (segment === "7" ? Number.NaN : inner.advance(segment, font)) };
    expect(DIGIT_SET.unit(FONT, broken)).toBeUndefined();
    const layout = layoutText("123", { font: FONT, lineHeight: 16, measurer: broken, sizing: "bound", charset: DIGIT_SET });
    expect(layout.bounded).toBeUndefined();
    expect(layout.widths[0]).toBe(fresh("123", {}).widths[0]);
  });

  it("does not keep a low bound after a reset of the measurer", () => {
    let scale = 1;
    const measurer = createMeasurer((text) => text.length * 6 * scale);
    const options = { font: FONT, lineHeight: 16, measurer, sizing: "bound", charset: DIGIT_SET } as const;
    const small = layoutText("123", options).widths[0]!;
    scale = 3;
    measurer.reset();
    const large = layoutText("123", options).widths[0]!;
    expect(large).toBeGreaterThanOrEqual(18 * 3);
    expect(large).toBeGreaterThan(2.9 * small);
  });

  it("does not keep a bound for a measurer without generation", () => {
    let scale = 1;
    const measurer: TextMeasurer = { advance: (segment) => segment.length * 384 * scale, stats: () => ({ requests: 0, hits: 0, calls: 0 }), reset: () => undefined };
    const options = { font: FONT, lineHeight: 16, measurer, sizing: "bound", charset: DIGIT_SET } as const;
    expect(layoutText("12", options).widths[0]).toBe((2 * 385) / TEXT_UNITS);
    scale = 2;
    expect(layoutText("12", options).widths[0]).toBe((2 * 769) / TEXT_UNITS);
  });

  it("keeps a bound for each font", () => {
    const measurer = createMeasurer((text, font) => text.length * Number.parseInt(font, 10));
    const charset = DIGIT_SET;
    const wide = layoutText("12", { font: "24px x", lineHeight: 16, measurer, sizing: "bound", charset }).widths[0]!;
    const small = layoutText("12", { font: "12px x", lineHeight: 16, measurer, sizing: "bound", charset }).widths[0]!;
    expect(small).toBeGreaterThanOrEqual(24);
    expect(wide).toBeGreaterThanOrEqual(48);
    expect(wide).toBeGreaterThan(small);
  });
});

describe("sizing: bound", () => {
  it("gives the box the size of the bound, with the padding and the clamps", () => {
    const unit = DIGIT_SET.unit(FONT, createMeasurer(helveticaAdvance))!;
    const px = (4 * unit) / TEXT_UNITS;
    const layout = fresh("1234", { sizing: "bound", charset: DIGIT_SET, padding: 8 });
    expect(layout.bounded).toBe(true);
    expect(layout.widths).toEqual([px]);
    expect(layout.width).toBe(px + 8);
    expect(fresh("1", { sizing: "bound", charset: DIGIT_SET, minWidth: 90 }).width).toBe(90);
  });

  it("makes no measure, also for a label that wraps or breaks anywhere", () => {
    for (const options of [{}, { wrapWidth: 60 }, { wrapWidth: 30, wordBreak: "anywhere" }, { wrapWidth: 60, breaker: "total-fit" }, { wrapWidth: 60, breaker: "balanced" }] satisfies Plain[]) {
      const measurer = createMeasurer(helveticaAdvance);
      DIGIT_SET.unit(FONT, measurer);
      const before = measurer.stats().requests;
      const layout = layoutText("123456781234567812345678", { font: FONT, lineHeight: 16, ...options, measurer, sizing: "bound", charset: DIGIT_SET });
      expect(layout.bounded).toBe(true);
      expect(measurer.stats().requests).toBe(before);
    }
  });

  it("wraps from the bound: the box takes the wrap width, and the width of each line is a bound", () => {
    const charset = createTextCharset(`${DIGITS} `);
    const layout = fresh("1234 5678 1234 5678", { sizing: "bound", charset, wrapWidth: 40, padding: 2 });
    expect(layout.bounded).toBe(true);
    expect(layout.width).toBe(42);
    expect(layout.wrapWidth).toBe(40);
    expect(layout.height).toBe(16 * layout.lineCount);
    for (const width of layout.widths) expect(width).toBeLessThanOrEqual(40);
    expect(layout.lines.join(" ")).toBe("1234 5678 1234 5678");
  });

  it("cuts a wrapped label at maxLines, and measures only the ellipsis", () => {
    const charset = createTextCharset(`${DIGITS} `);
    const measurer = createMeasurer(helveticaAdvance);
    charset.unit(FONT, measurer);
    const before = measurer.stats().requests;
    const layout = layoutText("1234 5678 1234 5678", { font: FONT, lineHeight: 16, measurer, sizing: "bound", charset, wrapWidth: 40, maxLines: 1 });
    expect(layout.bounded).toBe(true);
    expect(layout.truncated).toBe(true);
    expect(layout.lines[0]!.endsWith("…")).toBe(true);
    expect(measurer.stats().requests).toBe(before + 1);
  });

  it("can wrap a label that fits in exact: this is the cost of a measure that does not happen", () => {
    expect(fresh("111 111", { wrapWidth: 45, sizing: "bound", charset: createTextCharset(`${DIGITS} W`) }).lineCount).toBe(2);
    expect(fresh("111 111", { wrapWidth: 45 }).lineCount).toBe(1);
  });
});

describe("the default stays exact", () => {
  const OPTIONS: readonly Plain[] = [{}, { wrapWidth: 60 }, { wrapWidth: 60, maxLines: 2 }, { maxChars: 6 }, { wrapWidth: 40, wordBreak: "anywhere" }, { wrapWidth: 90, breaker: "total-fit" }, { padding: 8, minWidth: 40, maxWidth: 90 }];

  it("gives the result and the measurer counts of no option, for sizing exact and for a charset alone", () => {
    fc.assert(
      fc.property(asciiText, fc.constantFrom(...OPTIONS), (text, options) => {
        const plain = createMeasurer(helveticaAdvance);
        const want = fields(layoutText(text, { font: FONT, lineHeight: 16, ...options, measurer: plain }));
        for (const extra of [{ sizing: "exact" }, { charset: ASCII }, { sizing: "exact", charset: ASCII }] satisfies Plain[]) {
          const measurer = createMeasurer(helveticaAdvance);
          expect(fields(layoutText(text, { font: FONT, lineHeight: 16, ...options, ...extra, measurer }))).toBe(want);
          expect(measurer.stats()).toEqual(plain.stats());
        }
      }),
      FAST_CHECK,
    );
  });

  it("gives the result and the counts of the npm build of 0.2.21", () => {
    fc.assert(
      fc.property(asciiText, fc.constantFrom(...OPTIONS.filter((o) => o.breaker === undefined)), (text, options) => {
        const old = released.createMeasurer(helveticaAdvance);
        const measurer = createMeasurer(helveticaAdvance);
        const want = released.layoutText(text, { font: FONT, lineHeight: 16, ...options, measurer: old } as Parameters<typeof released.layoutText>[1]);
        expect(fields(layoutText(text, { font: FONT, lineHeight: 16, ...options, measurer }))).toBe(fields(want));
        expect(measurer.stats()).toEqual(old.stats());
      }),
      FAST_CHECK,
    );
  });

  it("refuses an unknown sizing, and a bound mode with no set", () => {
    expect(() => fresh("a", { sizing: "guess" as TextSizing })).toThrow(RangeError);
    expect(() => fresh("a", { sizing: "bound-first" })).toThrow(RangeError);
    expect(() => fresh("a", { sizing: "bound" })).toThrow(RangeError);
  });
});

describe("createTextLayoutCache with sizing", () => {
  const SIZINGS = ["exact", "bound-first", "bound"] as const;
  const LIST = createTextCharset(`${DIGITS} `);
  const WIDE = createTextCharset(`${DIGITS} W@`);

  it("keeps each mode apart, in each order of two calls in a row", () => {
    for (const a of [...SIZINGS, undefined]) {
      for (const b of [...SIZINGS, undefined]) {
        const measurer = createMeasurer(helveticaAdvance);
        const cache = createTextLayoutCache();
        const options = (sizing: TextSizing | undefined): TextLayoutOptions => ({ font: FONT, lineHeight: 16, measurer, charset: LIST, ...(sizing === undefined ? {} : { sizing }) });
        const first = cache.layout("1234", options(a));
        const second = cache.layout("1234", options(b));
        expect(fields(first)).toBe(fields(fresh("1234", { charset: LIST, ...(a === undefined ? {} : { sizing: a }) })));
        expect(fields(second)).toBe(fields(fresh("1234", { charset: LIST, ...(b === undefined ? {} : { sizing: b }) })));
      }
    }
  });

  it("does not give the box of exact to bound, or the box of bound to exact", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const cache = createTextLayoutCache();
    const base = { font: FONT, lineHeight: 16, measurer, charset: LIST };
    const exact = cache.layout("1234", base);
    const bound = cache.layout("1234", { ...base, sizing: "bound" });
    expect(bound.width).toBeGreaterThan(exact.width);
    expect(cache.layout("1234", base)).toBe(exact);
    expect(cache.layout("1234", { ...base, sizing: "bound" })).toBe(bound);
    expect(cache.stats()).toEqual({ requests: 4, hits: 2, calls: 2, size: 2 });
  });

  it("gives one entry to no option and to sizing exact with no set", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const cache = createTextLayoutCache();
    const base = { font: FONT, lineHeight: 16, measurer };
    cache.layout("1234", base);
    cache.layout("9", { ...base, font: "24px x" });
    cache.layout("1234", { ...base, sizing: "exact" });
    expect(cache.stats().size).toBe(2);
    expect(cache.stats().hits).toBe(1);
  });

  it("keeps two character sets apart, in a row and after a call with other options", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const cache = createTextLayoutCache();
    const base = { font: FONT, lineHeight: 16, measurer, sizing: "bound" } as const;
    const narrow = cache.layout("1234", { ...base, charset: LIST });
    const wide = cache.layout("1234", { ...base, charset: WIDE });
    expect(wide.width).toBeGreaterThan(narrow.width);
    cache.layout("1234", { ...base, charset: LIST, padding: 1 });
    expect(cache.layout("1234", { ...base, charset: LIST })).toBe(narrow);
    expect(cache.layout("1234", { ...base, charset: WIDE })).toBe(wide);
  });

  it("does not share an entry between two sets with the same characters", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const cache = createTextLayoutCache();
    const base = { font: FONT, lineHeight: 16, measurer, sizing: "bound" } as const;
    const one = cache.layout("1234", { ...base, charset: createTextCharset(DIGITS) });
    const margin = cache.layout("1234", { ...base, charset: createTextCharset(DIGITS, { pairMargin: 0.5 }) });
    expect(margin.width).toBeGreaterThan(one.width);
  });

  it("gives the same layout for a seeded sequence through a small cache that removes entries", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const cache = createTextLayoutCache({ maxEntries: 16 });
    const r = mulberry32(71);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
    const texts = [...DIGIT_LABELS.slice(0, 5), "1 2 3", "12 34 56 78 90 12 34 56 78 90", "W@W"];
    for (let i = 0; i < 2000; i++) {
      const text = pick(texts);
      const options: Plain = { sizing: pick(SIZINGS), charset: pick([LIST, WIDE]), ...pick([{}, { wrapWidth: 40 }, { wrapWidth: 40, maxLines: 1 }]) };
      expect(fields(cache.layout(text, { font: FONT, lineHeight: 16, ...options, measurer }))).toBe(fields(fresh(text, options)));
    }
    expect(cache.stats().hits).toBeGreaterThan(0);
  });

  it("gives a new bound after a reset of the measurer", () => {
    let scale = 1;
    const measurer = createMeasurer((text) => text.length * 6 * scale);
    const cache = createTextLayoutCache();
    const options = { font: FONT, lineHeight: 16, measurer, sizing: "bound", charset: LIST } as const;
    const small = cache.layout("1234", options).width;
    scale = 2;
    measurer.reset();
    expect(cache.layout("1234", options).width).toBeGreaterThan(1.9 * small);
  });

  it("freezes a bounded layout, and keeps no entry for a call that throws", () => {
    const measurer = createMeasurer(helveticaAdvance);
    const cache = createTextLayoutCache();
    const base = { font: FONT, lineHeight: 16, measurer };
    expect(Object.isFrozen(cache.layout("12", { ...base, sizing: "bound", charset: LIST }))).toBe(true);
    expect(() => cache.layout("12", { ...base, sizing: "bound" })).toThrow(RangeError);
    expect(() => cache.layout("12", { ...base, sizing: "guess" as TextSizing, charset: LIST })).toThrow(RangeError);
    expect(cache.stats().size).toBe(1);
  });
});
