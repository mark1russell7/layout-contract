import { describe, expect, it } from "vitest";
import { deriveSeed, fnv1a32, random, type Random } from "@mark1russell7/rigor-generators";
import * as released from "layout-contract-0221/text";
import { breakWords, oldWords } from "../scripts/text-words.ts";
import { createMeasurer, layoutText, TEXT_UNITS, textMeasures, type TextLayoutOptions } from "./text.ts";

// The texts of the typeset corpus (github.com/mark1russell7/typeset, packages/corpus): the same seeds and draws, for the four
// scripts of the report of the typeset breakers. Only the parts that these scripts use are copied.
type Range = readonly [first: number, last: number, weight: number];
interface Script {
  readonly letters: readonly Range[];
  readonly marks: readonly Range[];
  readonly markRate: number;
  readonly wordLength: readonly [number, number];
  readonly punctuation: readonly string[];
}
const LATIN_PUNCTUATION = [",", ".", ";", ":", "!", "?"];
const SCRIPTS: Readonly<Record<string, Script>> = {
  latin: { letters: [[0x61, 0x7a, 20], [0x41, 0x5a, 1]], marks: [], markRate: 0, wordLength: [1, 12], punctuation: LATIN_PUNCTUATION },
  "latin-extended": {
    letters: [[0x61, 0x7a, 12], [0xc0, 0xd6, 1], [0xd8, 0xf6, 2], [0xf8, 0xff, 1], [0x100, 0x17f, 3]],
    marks: [[0x300, 0x36f, 1]],
    markRate: 0.03,
    wordLength: [1, 14],
    punctuation: LATIN_PUNCTUATION,
  },
  greek: { letters: [[0x3b1, 0x3c9, 20], [0x391, 0x3a1, 1], [0x3a3, 0x3a9, 1]], marks: [], markRate: 0, wordLength: [1, 12], punctuation: [",", ".", "·", ";"] },
  cyrillic: { letters: [[0x430, 0x44f, 20], [0x410, 0x42f, 1]], marks: [], markRate: 0, wordLength: [1, 13], punctuation: LATIN_PUNCTUATION },
};
const CLASSES: Readonly<Record<string, readonly [number, number]>> = { paragraph: [200, 800], page: [2000, 6000] };
const WIDTHS = [120, 240, 480];

function pickCodePoint(r: Random, ranges: readonly Range[]): number {
  let total = 0;
  for (const [first, last, weight] of ranges) total += (last - first + 1) * weight;
  let at = r.next() * total;
  for (const [first, last, weight] of ranges) {
    const span = (last - first + 1) * weight;
    if (at < span) return first + Math.floor(at / weight);
    at -= span;
  }
  return ranges[ranges.length - 1]![1];
}

/** This function gives the text of the corpus sample `<script>/<class>/<index>` of the corpus seed 1. */
function corpusText(script: string, lengthClass: string, index: number): string {
  const spec = SCRIPTS[script]!;
  const r = random(deriveSeed(1, `${script}/${lengthClass}/${index}`));
  r.next(); // the draw of the font
  r.next(); // the draw of the font size
  const [min, max] = CLASSES[lengthClass]!;
  const codePoints = r.int(min, max);
  const out: string[] = [];
  while (out.length < codePoints) {
    if (out.length > 0) out.push(" ");
    const left = codePoints - out.length;
    if (left <= 0) break;
    let word: string[];
    if (r.chance(0.03)) word = Array.from(String(r.int(0, 9999))).slice(0, left);
    else {
      word = [];
      const letters = Math.min(left, r.int(spec.wordLength[0], spec.wordLength[1]));
      for (let i = 0; i < letters; i++) {
        word.push(String.fromCodePoint(pickCodePoint(r, spec.letters)));
        if (spec.marks.length > 0 && r.chance(spec.markRate)) word.push(String.fromCodePoint(pickCodePoint(r, spec.marks)));
      }
    }
    out.push(...word);
    if (out.length < codePoints - 1 && r.chance(0.08)) out.push(r.pick(spec.punctuation));
  }
  while (out.length > codePoints) out.pop();
  if (out[out.length - 1] === " ") out[out.length - 1] = String.fromCodePoint(pickCodePoint(r, spec.letters));
  return out.join("");
}

/** The width function of the typeset report (`codePointPx`): 4 px to 12 px for each code point, from a hash of the code point. */
function codePointPx(text: string): number {
  let px = 0;
  for (const character of text) px += 4 + ((Math.imul(character.codePointAt(0)!, 2654435761) >>> 0) % 801) / 100;
  return px;
}

const TEXTS = Object.keys(SCRIPTS).flatMap((script) => Object.keys(CLASSES).flatMap((lengthClass) => Array.from({ length: 20 }, (_, i) => corpusText(script, lengthClass, i))));
/** Short texts at the edges of the word split: white space of each kind, a mark after a space, a long word and an emoji sequence. */
const EDGE_TEXTS = ["", "   ", "a", "a ́b c", "one two three", "a\n\nb\tc  d", "x".repeat(90) + " y z", "👩‍👩‍👧 family 👍🏽 ok", "W W W W W W W W W W"];
const FONT = "16px report";

type Variant = Omit<TextLayoutOptions, "font" | "measurer" | "lineHeight">;
/** The variants of the parity test: a name, the wrap widths and the options at a wrap width. */
const VARIANTS: readonly (readonly [string, readonly number[], (w: number) => Variant])[] = [
  ["default", WIDTHS, (w) => ({ wrapWidth: w })],
  ["maxLines 2 and an ellipsis", WIDTHS, (w) => ({ wrapWidth: w, maxLines: 2, ellipsis: "…" })],
  ["padding, minWidth and maxChars", WIDTHS, (w) => ({ wrapWidth: w, padding: 8, minWidth: 50, maxChars: 400 })],
  ["wordBreak anywhere", [60], (w) => ({ wrapWidth: w, wordBreak: "anywhere" })],
  ["wordBreak anywhere and maxLines 2", [60], (w) => ({ wrapWidth: w, wordBreak: "anywhere", maxLines: 2 })],
];

describe("layoutText with the typeset breakers", () => {
  it("has the corpus of the typeset report: 4 scripts, 2 length classes and 20 texts of each", () => {
    expect(TEXTS).toHaveLength(160);
    expect(new Set(TEXTS).size).toBe(160);
    expect(TEXTS.every((t) => t.length >= 200)).toBe(true);
    // The fingerprint of the 160 texts of `generateSample(1, script, lengthClass, index)` of the typeset corpus 0.1.0.
    expect(fnv1a32(TEXTS.join("")).toString(16)).toBe("d9facf2a");
  });

  it("gives the result of 0.2.21 for each case where the break places of UAX #14 are the white space (specificParity)", () => {
    let cases = 0;
    let same = 0;
    const changed = new Set<number>();
    const diffs: string[] = [];
    for (const [name, widths, variant] of VARIANTS) {
      for (const [t, text] of [...TEXTS, ...EDGE_TEXTS].entries()) {
        for (const w of widths) {
          const options = variant(w);
          // A measurer for each case, so the counts of a case do not include the counts of the cases before it.
          const head = createMeasurer(codePointPx);
          const old = released.createMeasurer(codePointPx);
          const a = layoutText(text, { font: FONT, measurer: head, lineHeight: 20, ...options });
          const b = released.layoutText(text, { font: FONT, measurer: old, lineHeight: 20, ...options });
          cases++;
          if (JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(head.stats()) === JSON.stringify(old.stats())) same++;
          else if (oldWords(text) !== breakWords(text)) changed.add(t);
          else if (diffs.length < 5) diffs.push(`${name}, text ${t}, width ${w}`);
        }
      }
    }
    const texts = [...changed].map((t) => (t < TEXTS.length ? `corpus ${t}` : `edge ${JSON.stringify(EDGE_TEXTS[t - TEXTS.length])}`));
    console.log(`specificParity: ${same} of ${cases} cases are equal to 0.2.21. The other cases are of ${changed.size} texts with other break places: ${texts.join(", ")}`);
    expect(diffs).toEqual([]);
    expect(same).toBeGreaterThan(0);
  }, 60_000);

  it("keeps the greedy line count with balanced, and total fit is not more ragged than greedy on 95% of the cases (specificBreakerOption)", () => {
    const measurer = createMeasurer(codePointPx);
    let cases = 0;
    let sameCount = 0;
    let notWorse = 0;
    let longCases = 0;
    let longNotWorse = 0;
    for (const text of TEXTS) {
      for (const wrapWidth of WIDTHS) {
        const at = (breaker: NonNullable<TextLayoutOptions["breaker"]>) => layoutText(text, { font: FONT, measurer, lineHeight: 20, wrapWidth, breaker });
        const greedy = at("greedy");
        const balanced = at("balanced");
        const totalFit = at("total-fit");
        cases++;
        if (balanced.lineCount === greedy.lineCount) sameCount++;
        const better = textMeasures(totalFit)["text.raggedness"]! <= textMeasures(greedy)["text.raggedness"]!;
        if (better) notWorse++;
        if (greedy.lineCount >= 3) {
          longCases++;
          if (better) longNotWorse++;
        }
        for (const layout of [balanced, totalFit]) {
          expect(layout.lines.join("").replace(/ /g, "")).toBe(greedy.lines.join("").replace(/ /g, ""));
          expect(layout.width).toBe(greedy.width);
        }
      }
    }
    console.log(`specificBreakerOption: balanced same count ${sameCount}/${cases}, total fit not worse ${notWorse}/${cases} (${(notWorse / cases).toFixed(4)}), with 3 lines or more ${longNotWorse}/${longCases} (${(longNotWorse / longCases).toFixed(4)})`);
    expect(cases).toBe(480);
    expect(sameCount).toBe(cases);
    expect(notWorse / cases).toBeGreaterThanOrEqual(0.95);
  }, 60_000);

  it("keeps the forced breaks of wordBreak anywhere with each breaker, so no line is wider than the wrap width", () => {
    const measurer = createMeasurer(codePointPx);
    for (const breaker of ["greedy", "total-fit", "balanced"] as const) {
      for (const text of TEXTS.slice(0, 40)) {
        const layout = layoutText(text, { font: FONT, measurer, lineHeight: 20, wrapWidth: 60, wordBreak: "anywhere", breaker });
        expect(Math.max(...layout.widths)).toBeLessThanOrEqual(Math.round(60 * TEXT_UNITS) / TEXT_UNITS);
        expect(layout.lines.join("").replace(/ /g, "")).toBe(text.replace(/\s+/g, ""));
      }
    }
  });

  it("refuses an unknown breaker", () => {
    const measurer = createMeasurer(codePointPx);
    const bad = (breaker: string) => () => layoutText("a b", { font: FONT, measurer, lineHeight: 20, wrapWidth: 60, breaker: breaker as "greedy" });
    expect(bad("first-fit")).toThrow(RangeError);
    expect(bad("constructor")).toThrow(RangeError);
  });
});
