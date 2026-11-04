// The labels of the text bench. `bench-text.mjs` and `src/text-sizing.test.ts` read them, so the claims of L71 hold on the labels that the bench times.
import { mulberry32 } from "@mark1russell7/rigor-generators";

/** This function gives a word of `n` characters from a letter function. */
const wordOf = (n: number, letter: () => string): string => Array.from({ length: n }, letter).join("");

/** This function gives 333 labels with the shape of the labels of a consumer page: distinct texts of approximately 8 characters, mostly one word. */
function letterLabels(): string[] {
  const r = mulberry32(333);
  const letter = (): string => String.fromCharCode(97 + Math.floor(r() * 26));
  const labels: string[] = [];
  while (labels.length < 333) {
    const words = r() < 0.9 ? 1 : 2 + Math.floor(r() * 2);
    const text = Array.from({ length: words }, () => wordOf(3 + Math.floor(r() * 12), letter)).join(" ");
    if (!labels.includes(text)) labels.push(text);
  }
  return labels;
}

/** This function gives 333 distinct labels of 1 to 12 digits. */
function digitLabels(): string[] {
  const r = mulberry32(334);
  const digit = (): string => String(Math.floor(r() * 10));
  const labels: string[] = [];
  while (labels.length < 333) {
    const text = wordOf(1 + Math.floor(r() * 12), digit);
    if (!labels.includes(text)) labels.push(text);
  }
  return labels;
}

export const LETTER_LABELS: readonly string[] = letterLabels();
export const DIGIT_LABELS: readonly string[] = digitLabels();

/** The advances of Helvetica, from the Adobe core font metrics, in 1/1000 em, for the codes 32 to 126. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722,
  278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
  333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** This function gives the width of a text in pixels at a size of 12 px, from the table with no kerning. A character out of the table gets 1 em, the width of the ellipsis of Helvetica. */
export function helveticaAdvance(text: string): number {
  let em = 0;
  for (let i = 0; i < text.length; i++) em += HELVETICA[text.charCodeAt(i) - 32] ?? 1000;
  return (em * 12) / 1000;
}
