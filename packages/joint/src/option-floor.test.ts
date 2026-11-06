import { describe, expect, it } from "vitest";
import { configId, STRATEGY_SPACE_SCHEMA, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { routeSpace } from "@mark1russell7/highways";
import { optionFloor } from "@mark1russell7/rigor-statistics";
import { FLOOR_DELTA, FLOOR_SIGMA, optionCounts, STRATUM_SHARE, stageFloors, stratumTarget } from "./option-floor.ts";
import { JOINT_SPACE } from "./space.ts";
import { sampleConfigs } from "./sweep.ts";

const ROUTE = routeSpace as unknown as StrategySpace;

/** A small space: a stage of 3 options, and an optional stage of 2 options. */
const SMALL: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "small",
  version: "0.0.1",
  stages: [
    { name: "a", options: [{ id: "x", params: [] }, { id: "y", params: [] }, { id: "z", params: [] }] },
    { name: "b", optional: true, options: [{ id: "p", params: [] }, { id: "q", params: [] }] },
  ],
};

/** This function gives a config of `SMALL`. */
function small(a: string, b: string | null): StrategyConfig {
  return { space: "small", stages: { a: { option: a }, b: b === null ? null : { option: b } } } as unknown as StrategyConfig;
}

/** This function gives the smallest count of the options of one stage. */
function smallest(configs: readonly StrategyConfig[], space: StrategySpace, stage: string): number {
  return Math.min(...optionCounts(configs, space).filter((r) => r.stage === stage).map((r) => r.count));
}

describe("the floor of each stage (L122)", () => {
  it("gives optionFloor with one test for each option of the stage", () => {
    const floors = stageFloors(JOINT_SPACE);
    for (const stage of JOINT_SPACE.stages) expect(floors[stage.name]).toBe(optionFloor({ sigma: FLOOR_SIGMA, delta: FLOOR_DELTA, tests: stage.options.length }));
    expect(floors).toEqual({ "packing.entry": 14, "highways.router": 14, "lanes.mode": 10 });
  });

  it("pins the floors of routeSpace, and a larger difference gives lower floors", () => {
    const floors = stageFloors(ROUTE);
    expect(floors).toEqual({ grouping: 11, plugs: 13, routing: 17, gate: 11, "lane-order": 10, smoothing: 8, levels: 10 });
    // Flip: twice the difference needs fewer configs for each stage.
    const wide = stageFloors(ROUTE, { delta: 2 * FLOOR_DELTA });
    for (const stage of ROUTE.stages) expect(wide[stage.name]).toBeLessThan(floors[stage.name]!);
  });
});

describe("the count of each option (L122)", () => {
  it("counts each option beside the uniform count, with 0 for an option that no config has", () => {
    const rows = optionCounts([small("x", "p"), small("x", null), small("y", "p")], SMALL, { a: 2, b: 2 });
    expect(rows).toEqual([
      { stage: "a", option: "x", count: 2, uniform: 1, floor: 2 },
      { stage: "a", option: "y", count: 1, uniform: 1, floor: 2 },
      { stage: "a", option: "z", count: 0, uniform: 1, floor: 2 },
      // The config with no option for b does not count for b.
      { stage: "b", option: "p", count: 2, uniform: 1, floor: 2 },
      { stage: "b", option: "q", count: 0, uniform: 1, floor: 2 },
    ]);
  });
});

describe("the target of the stratum (L122)", () => {
  const counts = (pairs: Record<string, number>): Map<string, number> => new Map(Object.entries(pairs));

  it("takes the stage nearest to full, and in it the option with the smallest count", () => {
    // The gap of a is 3 (0 + 1 + 2), the gap of b is 1 (0 + 1). So b goes first, with its option q.
    const c = counts({ "a=x": 2, "a=y": 1, "b=p": 2, "b=q": 1 });
    expect(stratumTarget(SMALL, c, { a: 2, b: 2 })).toEqual({ stage: "b", option: "q" });
    // With q at the floor, a is the only stage under it, and z has the smallest count.
    expect(stratumTarget(SMALL, counts({ "a=x": 2, "a=y": 1, "b=p": 2, "b=q": 2 }), { a: 2, b: 2 })).toEqual({ stage: "a", option: "z" });
  });

  it("skips the named options, and gives no target when each option is at its floor", () => {
    const c = counts({ "a=x": 2, "a=y": 1, "b=p": 2, "b=q": 1 });
    expect(stratumTarget(SMALL, c, { a: 2, b: 2 }, new Set(["b=q"]))).toEqual({ stage: "a", option: "z" });
    expect(stratumTarget(SMALL, counts({ "a=x": 2, "a=y": 2, "a=z": 2, "b=p": 2, "b=q": 2 }), { a: 2, b: 2 })).toBeUndefined();
  });
});

describe("a sample with a stratum (L122)", () => {
  it("gives the same sample as before with no stratum and with a share of 0, and refuses a share outside 0 to 1", () => {
    const known = new Set<string>();
    const ids = (xs: readonly StrategyConfig[]): string[] => xs.map((x) => configId(JOINT_SPACE, x));
    const none = sampleConfigs({ n: 20, seed: 20261028, known });
    expect(ids(sampleConfigs({ n: 20, seed: 20261028, known, stratum: { share: 0, floors: stageFloors() } }))).toEqual(ids(none));
    expect(() => sampleConfigs({ n: 20, seed: 1, known, stratum: { share: 1.5, floors: {} } })).toThrow("The share of the stratum is from 0 to 1, not 1.5.");
  });

  it("takes the count of the stratum picks from picks, by default round(share * n), and refuses picks outside 0 to n", () => {
    const known = new Set<string>();
    const ids = (xs: readonly StrategyConfig[]): string[] => xs.map((x) => configId(JOINT_SPACE, x));
    const floors = stageFloors();
    const none = ids(sampleConfigs({ n: 20, seed: 20261028, known }));
    const byShare = ids(sampleConfigs({ n: 20, seed: 20261028, known, stratum: { share: STRATUM_SHARE, floors } }));
    expect(ids(sampleConfigs({ n: 20, seed: 20261028, known, stratum: { share: STRATUM_SHARE, floors, picks: 5 } }))).toEqual(byShare);
    // Flip: 0 picks give the sample with no stratum, and the default of 5 picks does not.
    expect(ids(sampleConfigs({ n: 20, seed: 20261028, known, stratum: { share: STRATUM_SHARE, floors, picks: 0 } }))).toEqual(none);
    expect(byShare).not.toEqual(none);
    expect(() => sampleConfigs({ n: 20, seed: 1, known, stratum: { share: 0.25, floors, picks: 21 } })).toThrow("The picks of the stratum are an integer from 0 to 20, not 21.");
    expect(() => sampleConfigs({ n: 20, seed: 1, known, stratum: { share: 0.25, floors, picks: 2.5 } })).toThrow("The picks of the stratum are an integer from 0 to 20, not 2.5.");
  });

  it("gives the joint space a sample of the full count with a stratum, and none of the known configs", () => {
    const known = new Set(sampleConfigs({ n: 10, seed: 5, known: new Set() }).map((c) => configId(JOINT_SPACE, c)));
    const out = sampleConfigs({ n: 40, seed: 20261105, known, stratum: { share: STRATUM_SHARE, floors: stageFloors() } });
    expect(out).toHaveLength(40);
    for (const c of out) expect(known.has(configId(JOINT_SPACE, c))).toBe(false);
  });

  // Local time of the two samples: approximately 1.6 s. The limit has a margin for a slow shared runner.
  it("pins the smallest counts of levels and grouping in a routeSpace sample of 216 picks", { timeout: 30000 }, () => {
    const floors = stageFloors(ROUTE);
    const base = { n: 216, seed: 20261105, known: new Set<string>(), draw: "walk" } as const;
    const withStratum = sampleConfigs({ ...base, stratum: { share: STRATUM_SHARE, floors } }, ROUTE);
    expect(withStratum).toHaveLength(216);
    expect(smallest(withStratum, ROUTE, "levels")).toBe(11);
    expect(smallest(withStratum, ROUTE, "grouping")).toBe(8);
    expect(smallest(withStratum, ROUTE, "levels")).toBeGreaterThanOrEqual(floors["levels"]!);
    // Flip: with no stratum, the walk balances only the largest stage, and levels stays under its floor.
    const without = sampleConfigs(base, ROUTE);
    expect(smallest(without, ROUTE, "levels")).toBe(4);
    expect(smallest(without, ROUTE, "grouping")).toBe(3);
  });
});
