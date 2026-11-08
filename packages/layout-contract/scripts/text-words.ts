// The words of a text in the 0.2.21 build and in this build, for the parity tests of `layoutText`.
// A parity test expects the result of 0.2.21 only for a text with the same words in the two builds.
import { graphemes, lineBreaks } from "@mark1russell7/typeset/segmentation";

/** The white space that collapses in `layoutText` since 0.6.0. */
const COLLAPSE = /[ \t\n\v\f\r\u0085\u2028\u2029]+/gu;

/** A grapheme cluster of white space only. A space with a combining mark after it is one cluster that is not white space only. */
const WHITE_CLUSTER = /^\s+$/u;

/**
 * This function gives the words of 0.2.21 as JSON: the text split at each grapheme cluster of white space.
 * So a combining mark after a space stays in the word of the space, as in 0.2.21.
 */
export function oldWords(text: string): string {
  const words: string[] = [];
  let word = "";
  for (const cluster of graphemes(text)) {
    if (!WHITE_CLUSTER.test(cluster)) {
      word += cluster;
      continue;
    }
    if (word !== "") words.push(word);
    word = "";
  }
  if (word !== "") words.push(word);
  return JSON.stringify(words);
}

/** This function gives the words of 0.6.0 as JSON: the text split at the break places of UAX #14. The white space of `COLLAPSE` collapses to one space. */
export function breakWords(text: string): string {
  const words: string[] = [];
  let start = 0;
  for (const place of lineBreaks(text)) {
    const body = text.slice(start, place.offset).replace(COLLAPSE, " ").replace(/^ | $/gu, "");
    start = place.offset;
    if (body !== "") words.push(body);
  }
  return JSON.stringify(words);
}
