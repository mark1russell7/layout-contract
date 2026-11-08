// The word segments (UAX #29) of the words of a text, with one call of `wordBreaks` for all the words.
// This module is internal: the package root and `./text` do not export it.
import { wordBreaks } from "@mark1russell7/typeset/segmentation";

/** This function gives the word segments of one word, with one call of `wordBreaks`. */
export function partsOfWord(word: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const end of wordBreaks(word)) {
    parts.push(word.slice(from, end));
    from = end;
  }
  return parts;
}

/**
 * This function gives the word segments of each word, with one call of `wordBreaks` on the words joined by line feeds.
 * UAX #29 puts a break before and after a line feed (WB3a, WB3b), and no rule looks across it.
 * So each word gets the segments of a call on the word alone.
 * A word that ends with a carriage return has no break before the next line feed (WB3).
 * When a break of a line feed is absent, the function gives the segments of one call for each word.
 */
export function partsOfWords(words: readonly string[]): string[][] {
  if (words.length === 0) return [];
  if (words.length === 1) return [partsOfWord(words[0]!)];
  const parts: string[][] = words.map(() => []);
  const joined = words.join("\n");
  let w = 0;
  let from = 0;
  let end = words[0]!.length;
  for (const offset of wordBreaks(joined)) {
    if (from === end) {
      // The segment from `end` is the line feed after word `w`.
      if (offset !== end + 1 || w + 1 >= words.length) return words.map(partsOfWord);
      w += 1;
      from = offset;
      end = offset + words[w]!.length;
      continue;
    }
    if (offset > end) return words.map(partsOfWord);
    parts[w]!.push(joined.slice(from, offset));
    from = offset;
  }
  if (w !== words.length - 1 || from !== end) return words.map(partsOfWord);
  return parts;
}
