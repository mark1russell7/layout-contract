import type { StrategyConfig, StrategySpace } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import type { SweepState } from "./night.ts";
import { stageGroup } from "./sensitivity.ts";
import type { JointEntry } from "./corpus.ts";
import { fitSurrogate, INPUT_FACTOR, KIND_FACTOR, manifestFeatures, surrogateFold, surrogateMarkdown, type SurrogateOptions } from "./surrogate.ts";

/** A small space: the stage `a.x` with 3 options, `b.y` with 2 options, and the optional stage `c.z` with one option and an int param. */
const SPACE: StrategySpace = {
  schema: "strategy-space/1",
  engine: "toy",
  version: "1",
  stages: [
    { name: "a.x", options: [{ id: "p", params: [] }, { id: "q", params: [] }, { id: "r", params: [] }] },
    { name: "b.y", options: [{ id: "u", params: [] }, { id: "v", params: [] }] },
    { name: "c.z", optional: true, options: [{ id: "m", params: [{ name: "k", kind: "int", min: 1, max: 5, default: 3 }] }] },
  ],
};
const GROUPS = [stageGroup("a", "a.x"), stageGroup("b", "b.y"), stageGroup("c", "c.z")];
// The cells of the small space have 3 or 15 rows, so the tests cover a cell from 3 rows.
const OPTIONS: SurrogateOptions = { space: SPACE, groups: GROUPS, draws: 1024, minRows: 3 };
const INPUTS = ["alpha", "beta"].flatMap((kind) => [1, 2, 3].map((s) => `toy/${kind}.x/s${s}`));

/** This function gives a config of the small space. A value `k` of `undefined` is a config without the stage `c.z`. */
function toy(a: string, b: string, k: number | undefined): StrategyConfig {
  return { space: "toy", stages: { "a.x": { option: a, params: {} }, "b.y": { option: b, params: {} }, "c.z": k === undefined ? null : { option: "m", params: { k } } } };
}

/** This function gives a state of the 36 configs of the small space on 6 inputs, with the score `score` of each config and input. */
function state(score: (a: string, b: string, k: number | undefined, kind: string, input: number) => number): SweepState {
  const configs: SweepState["configs"] = {};
  const values: SweepState["values"] = {};
  let n = 0;
  for (const a of ["p", "q", "r"]) {
    for (const b of ["u", "v"]) {
      for (const k of [undefined, 1, 2, 3, 4, 5]) {
        const id = `toy-${n++}`;
        configs[id] = { config: toy(a, b, k), status: "screened", first: "2026-11-02" };
        values[id] = INPUTS.map((input, i) => score(a, b, k, input.split("/")[1]!.split(".")[0]!, i));
      }
    }
  }
  return { schema: "sweep-state/1", epoch: "e", corpus: "toy", inputs: INPUTS, configs, values, reference: INPUTS.map(() => null), summary: [], nights: [] };
}

const A: Record<string, number> = { p: 0.1, q: 0.3, r: 0.5 };
const additive = (a: string, b: string, k: number | undefined, kind: string): number => A[a]! + (b === "v" ? 0.1 : 0) + (k === undefined ? 0 : 0.05 + 0.02 * (k - 3)) + (kind === "beta" ? 0.2 : 0);

describe("fitSurrogate", () => {
  it("finds an additive score, and covers each cell", () => {
    const r = fitSurrogate(state(additive), OPTIONS);
    expect(r.rows).toBe(36 * 6);
    expect(r.configs).toBe(36);
    expect(r.r2).toBeGreaterThan(0.99);
    expect(r.rmse).toBeLessThan(0.01);
    expect(r.lambda).toBe(0.01);
    expect(r.cells).toMatchObject({ total: 24, withRows: 24, eligible: 24, covered: 24, empty: 0, share: 1, floorRatio: 1.25, minRows: 3, minFloor: 0.01 });
    expect(r.cells.medianRatio).toBeLessThan(1);
    expect(r.cells.skill.median).toBeGreaterThan(0);
    expect(r.cells.skill.q10).toBeLessThanOrEqual(r.cells.skill.median);
    expect(r.cells.skill.median).toBeLessThanOrEqual(r.cells.skill.q90);
    expect(r.cellErrors).toHaveLength(24);
    expect(Object.keys(r.cellErrors[0]!.levels)).toEqual(["a", "b", "c", KIND_FACTOR]);
    expect(surrogateMarkdown(r)).toContain("Space coverage: 24 of the 24 cells with rows (100.0%)");
  });

  it("gives an R² near 0 or below on pure noise, with each RMSE near its floor", () => {
    const draw = random(11);
    const r = fitSurrogate(state(() => draw.next()), OPTIONS);
    expect(r.r2).toBeLessThan(0.1);
    // No model predicts noise better than the mean of the cell, so the ratio stays near 1.
    expect(r.cells.medianRatio).toBeGreaterThan(0.9);
    expect(r.cells.medianRatio).toBeLessThan(1.5);
    // A fit that knows only the mean of each cell has a skill near 0 or below.
    expect(r.cells.skill.median).toBeLessThan(0.2);
  });

  it("gives each cell the RMSE of its rows around their mean as its floor", () => {
    const draw = random(12);
    const s = state(() => draw.next());
    const r = fitSurrogate(s, OPTIONS);
    for (const e of r.cellErrors) {
      expect(e.floor).toBeGreaterThanOrEqual(0);
      expect(e.ratio).toBeCloseTo(e.rmse / Math.max(e.floor, 0.01), 12);
      expect(e.covered).toBe(e.rows >= 3 && e.ratio <= 1.25);
      expect(e.skill).toBeCloseTo(1 - e.ratio ** 2, 12);
    }
  });

  it("covers no cell with fewer rows than minRows", () => {
    const r = fitSurrogate(state(additive), { ...OPTIONS, minRows: 20 });
    expect(r.cells.eligible).toBe(0);
    expect(r.cells.covered).toBe(0);
    expect(r.cells.share).toBe(0);
    expect(r.cells.medianRatio).toBeNaN();
    expect(r.cells.skill).toEqual({ q10: Number.NaN, median: Number.NaN, q90: Number.NaN });
  });

  it("refuses a floorRatio or a minFloor of 0", () => {
    expect(() => fitSurrogate(state(additive), { ...OPTIONS, floorRatio: 0 })).toThrow(RangeError);
    expect(() => fitSurrogate(state(additive), { ...OPTIONS, minFloor: 0 })).toThrow(RangeError);
  });

  it("counts the cells with no rows, and does not cover them", () => {
    const s = state(additive);
    for (const [id, entry] of Object.entries(s.configs)) if (entry.config.stages["a.x"]?.option === "r") s.values[id] = INPUTS.map(() => null);
    const r = fitSurrogate(s, OPTIONS);
    expect(r.cells.total).toBe(24);
    expect(r.cells.empty).toBe(8);
    expect(r.cells.covered).toBeLessThanOrEqual(16);
  });

  it("keeps all rows of one config in one fold, from a seeded hash of the config id", () => {
    const s = state(additive);
    const r = fitSurrogate(s, { ...OPTIONS, seed: 5 });
    expect(Object.keys(r.foldOf).sort()).toEqual(Object.keys(s.values).sort());
    for (const [id, fold] of Object.entries(r.foldOf)) {
      expect(fold).toBe(surrogateFold(id, 5, 5));
      expect(Number.isInteger(fold) && fold >= 0 && fold < 5).toBe(true);
    }
    expect(new Set(Object.values(r.foldOf)).size).toBe(5);
    const other = fitSurrogate(s, { ...OPTIONS, seed: 6 });
    expect(other.foldOf).not.toEqual(r.foldOf);
  });

  it("gives the same result for the same seed", () => {
    const draw = random(3);
    const s = state((a, b, k, kind) => additive(a, b, k, kind) + 0.05 * draw.next());
    expect(fitSurrogate(s, { ...OPTIONS, seed: 9 })).toEqual(fitSurrogate(s, { ...OPTIONS, seed: 9 }));
  });

  it("refuses an empty state and bad options with a RangeError", () => {
    const s = state(additive);
    for (const id of Object.keys(s.values)) s.values[id] = INPUTS.map(() => null);
    expect(() => fitSurrogate(s, OPTIONS)).toThrow(RangeError);
    expect(() => fitSurrogate({ ...s, configs: {}, values: {} }, OPTIONS)).toThrow(RangeError);
    expect(() => fitSurrogate(state(additive), { ...OPTIONS, folds: 1 })).toThrow(RangeError);
    expect(() => fitSurrogate(state(additive), { ...OPTIONS, lambdas: [] })).toThrow(RangeError);
    expect(() => fitSurrogate(state(additive), { ...OPTIONS, groups: [{ name: "free", of: () => "x" }] })).toThrow(RangeError);
  });

  it("has no input features by default", () => {
    const r = fitSurrogate(state(additive), OPTIONS);
    expect(r.inputFeatures).toEqual([]);
    expect(r.featurePairs).toBe(false);
    expect(surrogateMarkdown(r)).toContain("The fit has no input features.");
  });

  it("finds the spread inside a cell from an input feature, and keeps the cells of the groups and the kind", () => {
    // The seed 1 of each kind is small, and the others are big. A big input adds 0.3 to each score.
    const size = (input: string): string => (input.endsWith("/s1") ? "small" : "big");
    const s = state((a, b, k, kind, i) => additive(a, b, k, kind) + (size(INPUTS[i]!) === "big" ? 0.3 : 0));
    const features = (input: string): Record<string, string> => ({ size: size(input), constant: "one" });
    const without = fitSurrogate(s, OPTIONS);
    const withFeatures = fitSurrogate(s, { ...OPTIONS, features });
    expect(without.cells.skill.median).toBeLessThan(0.2);
    expect(withFeatures.cells.skill.median).toBeGreaterThan(0.9);
    // The dimension with one value gives no block.
    expect(withFeatures.inputFeatures).toEqual(["size"]);
    expect(withFeatures.cells.total).toBe(without.cells.total);
    expect(withFeatures.cells.withRows).toBe(without.cells.withRows);
    expect(Object.keys(withFeatures.cellErrors[0]!.levels)).toEqual(["a", "b", "c", KIND_FACTOR]);
    expect(withFeatures.sobol.factors.map((x) => x.name)).toEqual(["a", "b", "c", INPUT_FACTOR]);
    expect(surrogateMarkdown(withFeatures)).toContain("The fit has 1 input features: size. It has no products of them with the groups.");
  });

  it("finds an effect of a feature that changes with a group only with the option featurePairs", () => {
    const size = (input: string): string => (input.endsWith("/s1") ? "small" : "big");
    // A big input adds 0.4 to the scores of the option p of a.x, and takes 0.4 from the others.
    const s = state((a, b, k, kind, i) => additive(a, b, k, kind) + (size(INPUTS[i]!) === "big" ? (a === "p" ? 0.4 : -0.4) : 0));
    const features = (input: string): Record<string, string> => ({ size: size(input) });
    const main = fitSurrogate(s, { ...OPTIONS, features });
    const paired = fitSurrogate(s, { ...OPTIONS, features, featurePairs: true });
    expect(paired.featurePairs).toBe(true);
    expect(paired.features).toBeGreaterThan(main.features);
    expect(paired.cells.skill.median).toBeGreaterThan(0.9);
    expect(paired.cells.skill.median).toBeGreaterThan(main.cells.skill.median);
  });

  it("gives the features of an input from the cells of a manifest", () => {
    const of = manifestFeatures({ inputs: [{ id: "x/s1", hash: "h", cell: { containerSize: "fixed", count: "10", spacing: "gap" } as unknown as JointEntry["cell"] }] });
    expect(of("x/s1")).toEqual({ containerSize: "fixed", count: "10", spacing: "gap" });
    expect(of("y/s1")).toBeUndefined();
  });

  it("gives a Sobol index near 1 to the one group that the score reads, and near 0 to the others", () => {
    const r = fitSurrogate(
      state((a) => A[a]!),
      { ...OPTIONS, draws: 2048 },
    );
    const by = Object.fromEntries(r.sobol.factors.map((x) => [x.name, x]));
    expect(Object.keys(by)).toEqual(["a", "b", "c", KIND_FACTOR]);
    expect(r.sobol.draws).toBe(2048);
    expect(by["a"]!.first).toBeGreaterThan(0.9);
    expect(by["a"]!.total).toBeGreaterThan(0.9);
    for (const name of ["b", "c", KIND_FACTOR]) {
      expect(Math.abs(by[name]!.first)).toBeLessThan(0.05);
      expect(by[name]!.total).toBeLessThan(0.05);
    }
  });
});
