import type { StrategyConfig, StrategySpace } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import type { SweepState } from "./night.ts";
import { stageGroup } from "./sensitivity.ts";
import { fitSurrogate, KIND_FACTOR, surrogateFold, surrogateMarkdown, type SurrogateOptions } from "./surrogate.ts";

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
const OPTIONS: SurrogateOptions = { space: SPACE, groups: GROUPS, draws: 1024 };
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
    expect(r.cells).toEqual({ total: 24, covered: 24, empty: 0, share: 1, bound: 0.05, minRows: 3 });
    expect(r.cellErrors).toHaveLength(24);
    expect(Object.keys(r.cellErrors[0]!.levels)).toEqual(["a", "b", "c", KIND_FACTOR]);
    expect(surrogateMarkdown(r)).toContain("Space coverage: 24 of 24 cells (100.0%)");
  });

  it("gives an R² near 0 or below, and a low share, on pure noise", () => {
    const draw = random(11);
    const r = fitSurrogate(state(() => draw.next()), OPTIONS);
    expect(r.r2).toBeLessThan(0.1);
    expect(r.cells.share).toBeLessThan(0.2);
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
