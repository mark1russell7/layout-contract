import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { breakWords } from "../scripts/text-words.ts";
import { partsOfWord, partsOfWords } from "./word-parts.ts";

/** This function gives the segments of each word with one call for each word: the reference. */
function oneCallEach(words: readonly string[]): string[][] {
  return words.map(partsOfWord);
}

/** Words with scripts, marks and sequences where a rule of UAX #29 looks at a neighbour. */
const HARD_WORDS = [
  "can't", "1,000.50", "a.b", "e.g.", "U.S.A", "́a", "á", "‍x", "x‍", "👨‍👩‍👧", "🇺🇸🇫🇷", "🇺",
  "日本語の文章", "東京都", "สวัสดีครับ", "ภาษาไทย", "שָׁלוֹם", "ab\"cd", "12:30", "x­y", "a b", "foo )", "(bar",
  "\ud800", "\udc00x", "a\rb", "a\r", "\r", "\nb", "a\n", "", "-", "--x", "x--",
];

describe("partsOfWords", () => {
  it("gives the segments of one call for each word, for words with hard cases", () => {
    for (let i = 0; i < HARD_WORDS.length; i++) {
      const words = [HARD_WORDS[i]!, ...HARD_WORDS.slice(0, i), ...HARD_WORDS.slice(i + 1)];
      expect(partsOfWords(words)).toEqual(oneCallEach(words));
    }
  });

  it("gives the segments of one call for each word, for generated words", () => {
    const word = fc.oneof(
      fc.string({ unit: "grapheme", maxLength: 12 }),
      fc.string({ unit: "binary", maxLength: 8 }),
      fc.constantFrom(...HARD_WORDS),
    );
    fc.assert(
      fc.property(fc.array(word, { maxLength: 8 }), (words) => {
        expect(partsOfWords(words)).toEqual(oneCallEach(words));
      }),
      { numRuns: 2000, seed: 0x1440 },
    );
  });

  it("gives the segments of one call for each word, for the words of generated texts", () => {
    const piece = fc.oneof(fc.string({ unit: "grapheme", maxLength: 10 }), fc.constantFrom(...HARD_WORDS, " ", "  ", "\t", "\n"));
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 10 }), (pieces) => {
        const words = JSON.parse(breakWords(pieces.join(" "))) as string[];
        expect(partsOfWords(words)).toEqual(oneCallEach(words));
      }),
      { numRuns: 2000, seed: 0x1441 },
    );
  });

  it("gives no words for no words, and the segments of one word for one word", () => {
    expect(partsOfWords([])).toEqual([]);
    expect(partsOfWords(["can't"])).toEqual([partsOfWord("can't")]);
  });
});
