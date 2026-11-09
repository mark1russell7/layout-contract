import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORPUS_MANIFEST_SCHEMA, type CorpusManifest, corpusManifestText, declaredClaimOf, lineJson, manifestText } from "./index.ts";

// The fixtures of `test/fixtures/corpus/` are corpus files of `packing`, at the commit 1d05bb51524ad399c142c54dfb4474066ccc028a of mark1russell7/packing.
// The bench of `packing` writes them. The tests pin the writer of this package to their bytes.
// The joint files are in `packages/joint/corpus/` of this repository.

const fixture = (name: string): string => readFileSync(new URL(`../test/fixtures/corpus/${name}.json`, import.meta.url), "utf8");
const joint = (name: string): string => readFileSync(new URL(`../../joint/corpus/${name}/corpus.json`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("corpusManifestText", () => {
  it.each(["pack-anchor-v1", "pack-change-v1", "pack-known-v1", "pack-worst-v1"])("gives the bytes of the packing file %s", (name) => {
    const text = fixture(name);
    const manifest = JSON.parse(text) as CorpusManifest;
    expect(corpusManifestText(manifest)).toBe(text);
    // Each of these files has a declared claim, and the reader of this package reads it.
    expect(declaredClaimOf(manifest)?.minCount).toBeGreaterThan(0);
  });

  it.each(["joint-v1", "joint-v2", "joint-v3"])("gives the bytes of the joint file %s in the compact style", (name) => {
    const text = joint(name);
    expect(corpusManifestText(JSON.parse(text) as CorpusManifest, { style: "compact" })).toBe(text);
  });

  it("writes the fields in one order, whatever the order of the keys of the manifest", () => {
    const manifest: CorpusManifest<{ readonly n: number }> = { specs: [{ n: 1 }, { n: 2 }], corpus: "c", heldOut: 3, schema: CORPUS_MANIFEST_SCHEMA };
    expect(corpusManifestText(manifest)).toBe('{\n  "schema": "layout-corpus/1",\n  "corpus": "c",\n  "heldOut": 3,\n  "specs": [\n    {"n": 1},\n    {"n": 2}\n  ]\n}\n');
  });

  it("refuses another schema", () => {
    expect(() => corpusManifestText({ schema: "layout-corpus/0" as typeof CORPUS_MANIFEST_SCHEMA, corpus: "c", specs: [] })).toThrow(/schema/);
  });
});

describe("manifestText", () => {
  it("gives the bytes of the packing file pack-adversary-v1: a search line, found rows and compact input rows", () => {
    const text = fixture("pack-adversary-v1");
    const file = JSON.parse(text) as Record<string, unknown>;
    const fields = [
      { key: "schema", value: file["schema"] },
      { key: "corpus", value: file["corpus"] },
      { key: "heldOut", value: file["heldOut"] },
      { key: "search", value: file["search"] },
      { key: "found", value: file["found"], rows: true },
      { key: "inputs", value: file["inputs"], rows: true, style: "compact" as const },
    ];
    expect(manifestText(fields)).toBe(text);
  });

  it("writes an empty list as [] by default, or with an empty line", () => {
    expect(manifestText([{ key: "specs", value: [], rows: true }])).toBe('{\n  "specs": []\n}\n');
    expect(manifestText([{ key: "specs", value: [], rows: true }], { emptyRows: "line" })).toBe('{\n  "specs": [\n\n  ]\n}\n');
  });

  it("refuses a key two times and rows that are not an array", () => {
    expect(() => manifestText([{ key: "a", value: 1 }, { key: "a", value: 2 }])).toThrow(/two times/);
    expect(() => manifestText([{ key: "a", value: 1, rows: true }])).toThrow(/array/);
  });
});

describe("lineJson", () => {
  it("puts a space after each colon and comma in the spaced style, and none in the compact style", () => {
    const value = { a: [1, "x", null], b: { c: true } };
    expect(lineJson(value)).toBe('{"a": [1, "x", null], "b": {"c": true}}');
    expect(lineJson(value, "compact")).toBe(JSON.stringify(value));
    expect(JSON.parse(lineJson(value))).toEqual(value);
  });
});
