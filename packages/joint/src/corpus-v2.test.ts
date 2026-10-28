import { readFileSync } from "node:fs";
import { checkInput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { arrayDimensions, hashOf, jointCorpus, manifestJson, SET_V2, type JointManifest } from "./corpus.ts";
import { coverage } from "./coverage.ts";
import { SPACINGS, SPACING_STEP_VERSION, SPACING_VALUES } from "./spacing.ts";

const { manifest, inputs } = jointCorpus(SET_V2);
const committedText = readFileSync(new URL("../corpus/joint-v2/corpus.json", import.meta.url), "utf8");
const committed = JSON.parse(committedText) as JointManifest;

describe("jointCorpus of joint-v2", () => {
  it("equals the committed manifest corpus/joint-v2/corpus.json", () => {
    expect(manifestJson(manifest)).toBe(committedText.replace(/\r\n/g, "\n"));
    expect(committed).toEqual(JSON.parse(manifestJson(manifest)));
  });

  it("gives about 300 inputs with unique ids, 0 problems of checkInput and the hash of each file", () => {
    expect(inputs.length).toBeGreaterThanOrEqual(280);
    expect(inputs.length).toBeLessThanOrEqual(320);
    expect(new Set(inputs.map((f) => f.id)).size).toBe(inputs.length);
    for (const f of inputs) {
      expect(f.id.startsWith(`${SET_V2}/`)).toBe(true);
      expect(checkInput(f)).toEqual([]);
      expect(f.hash).toBe(hashOf(f));
    }
  });

  it("covers each pair of the arrays, with spacing as a dimension", () => {
    const dims = arrayDimensions(SET_V2);
    expect(Object.keys(dims.grid)).toContain("spacing");
    expect(Object.keys(dims.ui)).toContain("spacing");
    // The specs and their seeds give the inputs in the order of the manifest.
    const arrays = manifest.specs.flatMap((s) => s.seeds.map(() => s.array));
    for (const array of ["grid", "ui"] as const) {
      const cells = manifest.inputs.filter((_, i) => arrays[i] === array).map((e) => ({ ...e.cell, family: e.id.split("/")[1]!.split(".")[0]! }));
      expect(cells.length).toBeGreaterThan(0);
      expect(coverage(cells, dims[array]).share).toBe(1);
    }
  });

  it("marks the stress inputs, and gives each input the steps edges and spacing", () => {
    for (const [i, f] of inputs.entries()) {
      const e = manifest.inputs[i]!;
      const spacing = e.cell.spacing as (typeof SPACINGS)[number];
      expect(SPACINGS).toContain(spacing);
      expect(e.stress === true).toBe(spacing === "stress");
      expect(f.steps?.map((s) => s.name)).toEqual(["edges", "spacing"]);
      expect(f.steps?.[1]).toMatchObject({ version: SPACING_STEP_VERSION, params: { spacing, ...SPACING_VALUES[spacing] } });
      expect(f.gap).toBe(SPACING_VALUES[spacing].gap);
    }
    expect(manifest.inputs.filter((e) => e.stress === true).length).toBeGreaterThan(0);
  });
});
