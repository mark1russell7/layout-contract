import { readFileSync } from "node:fs";
import { checkInput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkCorpus } from "./check.ts";
import { arrayDimensions, GRID_DIMENSIONS, hashOf, jointCorpus, manifestJson, MAX_BOXES, SET_V3, type JointManifest } from "./corpus.ts";
import { coverage } from "./coverage.ts";
import { OPEN_SIZE_NAMES } from "./open-sizes.ts";

const { manifest, inputs } = jointCorpus(SET_V3);
const committedText = readFileSync(new URL("../corpus/joint-v3/corpus.json", import.meta.url), "utf8");
const committed = JSON.parse(committedText) as JointManifest;

describe("jointCorpus of joint-v3", () => {
  it("equals the committed manifest corpus/joint-v3/corpus.json", () => {
    expect(manifestJson(manifest)).toBe(committedText.replace(/\r\n/g, "\n"));
    expect(committed).toEqual(JSON.parse(manifestJson(manifest)));
  });

  it("gives unique ids, 0 problems of checkInput and the hash of each file", () => {
    expect(new Set(inputs.map((f) => f.id)).size).toBe(inputs.length);
    for (const f of inputs) {
      expect(f.id.startsWith(`${SET_V3}/`)).toBe(true);
      expect(checkInput(f)).toEqual([]);
      expect(f.hash).toBe(hashOf(f));
      expect(f.boxes.length).toBeLessThanOrEqual(MAX_BOXES);
    }
  });

  it("has all 6 closed names and all open points in the array grid", () => {
    expect(arrayDimensions(SET_V3).grid["sizes"]).toEqual([...GRID_DIMENSIONS["sizes"]!, ...OPEN_SIZE_NAMES]);
    const grid = manifest.specs.filter((s) => s.array === "grid");
    const open = new Set(grid.flatMap((s) => (s.openSizes === undefined ? [] : [s.openSizes.params.point])));
    expect([...open].sort()).toEqual([...OPEN_SIZE_NAMES].sort());
    for (const s of grid) if (s.openSizes !== undefined) expect(s.params["sizes"]).toBe("uniform");
  });

  it("covers each pair of the arrays, and passes each claim", () => {
    const dims = arrayDimensions(SET_V3);
    const grid = manifest.inputs.filter((e) => e.id.includes("/rect-grid"));
    expect(coverage(grid.map((e) => e.cell), dims.grid).share).toBe(1);
    expect(checkCorpus(manifest, inputs)).toEqual([]);
  });

  it("names the open point in the cell and in the family, and stamps it before the edges", () => {
    const entry = manifest.inputs.find((e) => e.cell.sizes === "pareto-heavy")!;
    const input = inputs.find((f) => f.id === entry.id)!;
    expect(input.family).toContain("sz-pareto-heavy");
    expect(input.steps?.map((s) => s.name)).toEqual(["open-sizes", "edges", "spacing"]);
  });

  it("keeps the sizes of a closed name, with no stamp of the step", () => {
    const entry = manifest.inputs.find((e) => e.cell.sizes === "bimodal")!;
    const input = inputs.find((f) => f.id === entry.id)!;
    expect(input.family).toContain("sz-none");
    expect(input.steps?.map((s) => s.name)).toEqual(["edges", "spacing"]);
  });
});
