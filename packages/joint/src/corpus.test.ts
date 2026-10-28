import { readFileSync } from "node:fs";
import { checkInput } from "@mark1russell7/layout-contract";
import { generator } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { GRID_DIMENSIONS, hashOf, jointCorpus, manifestJson, SET, UI_DIMENSIONS, type JointManifest } from "./corpus.ts";
import { coverage } from "./coverage.ts";
import { pairwise } from "./pairwise.ts";

const corpus = jointCorpus();
const { manifest, inputs } = corpus;
const committedText = readFileSync(new URL("../corpus/joint-v1/corpus.json", import.meta.url), "utf8");
const committed = JSON.parse(committedText) as JointManifest;

/** The family of `packing` of an input, the first part of its family: `rect-grid`, `gallery` and the others. */
const baseFamily = (id: string): string => id.split("/")[1]!.split(".")[0]!;

describe("jointCorpus", () => {
  it("gives the same corpus on each call", () => {
    expect(jointCorpus()).toEqual(corpus);
  });

  it("gives each input a unique id of the form joint-v1/<family>/s<seed>", () => {
    const ids = inputs.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of inputs) {
      expect(f.set).toBe(SET);
      expect(f.id).toBe(`${SET}/${f.family}/s${f.seed}`);
    }
  });

  it("gives inputs with 0 problems of checkInput and at most 1000 boxes", () => {
    const bad = inputs.map((f) => ({ id: f.id, problems: checkInput(f) })).filter((x) => x.problems.length > 0);
    expect(bad).toEqual([]);
    for (const f of inputs) expect(f.boxes.length).toBeLessThanOrEqual(1000);
  });

  it("gives the hash of the canonical form of each file", () => {
    for (const f of inputs) expect(f.hash).toBe(hashOf(f));
    // hashOf gives the hash of packing for a base input
    const base = generator("rect-grid").generate(1, {}, SET);
    expect(hashOf(base)).toBe(base.hash);
  });

  it("gives edges to the inputs with 2 boxes or more", () => {
    for (const f of inputs) {
      if (f.boxes.length >= 2) expect(f.edges?.length ?? 0, f.id).toBeGreaterThan(0);
      expect(f.steps?.map((s) => s.name)).toEqual(["edges"]);
    }
  });

  it("covers each pair of values of the array of rect-grid", () => {
    const cells = manifest.inputs.filter((e) => baseFamily(e.id) === "rect-grid").map((e) => e.cell);
    const c = coverage(cells, GRID_DIMENSIONS);
    expect(c.missing).toEqual([]);
    expect(c.share).toBe(1);
  });

  it("covers each pair of values of the array of the families of a user interface", () => {
    const families = new Set(UI_DIMENSIONS["family"]);
    const cells = manifest.inputs.filter((e) => families.has(baseFamily(e.id))).map((e) => ({ ...e.cell, family: baseFamily(e.id) }));
    const c = coverage(cells, UI_DIMENSIONS);
    expect(c.missing).toEqual([]);
    expect(c.share).toBe(1);
  });

  it("has the 3 fixed cases of edge-cases", () => {
    const fixed = manifest.specs.filter((s) => s.array === "fixed").map((s) => s.params["case"]);
    expect(fixed).toEqual(["empty", "one", "oversize"]);
  });

  it("equals the committed manifest corpus/joint-v1/corpus.json", () => {
    expect(committed.inputs.length).toBe(inputs.length);
    expect(manifest.inputs.map((e) => [e.id, e.hash])).toEqual(committed.inputs.map((e) => [e.id, e.hash]));
    expect(manifest).toEqual(committed);
    expect(manifestJson(manifest)).toBe(committedText.replace(/\r\n/g, "\n"));
  });
});

describe("pairwise", () => {
  it("covers each pair, and gives the same rows for the same seed", () => {
    const dims = { a: ["1", "2", "3"], b: ["x", "y"], c: ["p", "q", "r", "s"], d: ["u", "v"] };
    const rows = pairwise(dims, 7);
    expect(pairwise(dims, 7)).toEqual(rows);
    expect(coverage(rows, dims).share).toBe(1);
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });

  it("refuses a dimension with no values", () => {
    expect(() => pairwise({ a: [] }, 1)).toThrow(RangeError);
  });
});

describe("coverage", () => {
  it("counts the pairs, the covered pairs and the share", () => {
    const c = coverage([{ a: "1", b: "x" }], { a: ["1", "2"], b: ["x"] });
    expect(c).toEqual({ pairs: 2, covered: 1, share: 0.5, missing: ["a=2&b=x"] });
  });
});
