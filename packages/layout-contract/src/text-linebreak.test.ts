// The line breaks of `layoutText` against each line of LineBreakTest.txt of Unicode 17.0.0 (UAX #14).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { unicodeVersion } from "@mark1russell7/typeset/segmentation";
import { createMeasurer, layoutText } from "./text.ts";

/** The file of the Unicode Character Database, compressed with gzip. Its notice and its terms of use are in its first lines. */
const FILE = new URL("../test/fixtures/LineBreakTest-17.0.0.txt.gz", import.meta.url);

/** The SHA-256 of the file before the compression: the pin of the conformance gate of `@mark1russell7/typeset`. */
const SHA256 = "e69884e0dde6a8724873f885d68c52dc14518abf9ae4ca9e2283b8773db3b752";

/** The white space that collapses in `layoutText`. */
const COLLAPSE = /[ \t\n\v\f\r\u0085  ]+/gu;
const TRAILING = /[ \t\n\v\f\r\u0085  ]+$/u;

/** A test line: its number in the file, its text, and the offsets in UTF-16 units of each break (÷) after the start. */
interface Case {
  readonly line: number;
  readonly text: string;
  readonly breaks: readonly number[];
}

function parse(source: string): Case[] {
  const cases: Case[] = [];
  source.split("\n").forEach((raw, i) => {
    const body = raw.split("#")[0]!.trim();
    if (body === "") return;
    let text = "";
    const breaks: number[] = [];
    for (const token of body.split(/\s+/u)) {
      if (token === "÷") {
        if (text.length > 0) breaks.push(text.length);
      } else if (token !== "×") text += String.fromCodePoint(Number.parseInt(token, 16));
    }
    cases.push({ line: i + 1, text, breaks });
  });
  return cases;
}

/**
 * This function gives the words that `layoutText` puts on lines of their own when each break place ends a line.
 * The text between two breaks of the file loses its white space at the end. White space in it collapses to one space, and white space at its start goes.
 */
function wordsOf(c: Case): string[] {
  const words: string[] = [];
  let start = 0;
  for (const end of c.breaks) {
    const body = c.text.slice(start, end).replace(TRAILING, "").replace(COLLAPSE, " ");
    start = end;
    const word = body.startsWith(" ") ? body.slice(1) : body;
    if (word !== "") words.push(word);
  }
  return words;
}

/** Each code unit has a width of 10 px, so each word is wider than the line and each break place ends a line. */
const measurer = createMeasurer((text) => text.length * 10);

describe("LineBreakTest.txt (UAX #14)", () => {
  const raw = gunzipSync(readFileSync(FILE));
  const cases = parse(raw.toString("utf8"));

  it("is the pinned file of the Unicode version of typeset", () => {
    expect(createHash("sha256").update(raw).digest("hex")).toBe(SHA256);
    expect(unicodeVersion).toBe("17.0.0");
    expect(cases).toHaveLength(19338);
  });

  it("ends the lines at the break places of each test line", () => {
    const failed: string[] = [];
    for (const c of cases) {
      const lines = layoutText(c.text, { font: "10px test", measurer, lineHeight: 1, wrapWidth: 0.001 }).lines;
      const expected = wordsOf(c);
      const got = lines.length === 1 && lines[0] === "" ? [] : lines;
      if (JSON.stringify(got) !== JSON.stringify(expected)) failed.push(`line ${c.line}: ${JSON.stringify(got)} is not ${JSON.stringify(expected)}`);
    }
    // The count goes to the log of the CI run, for the report of pass and total.
    console.info(`LineBreakTest ${cases.length - failed.length}/${cases.length} passed, 0 skipped`);
    expect(failed.slice(0, 20)).toEqual([]);
  });
});
