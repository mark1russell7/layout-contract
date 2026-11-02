import { describe, expect, it } from "vitest";
import { CONFIG_COST, configFactor, fitConfigCost, fitConfigFactors, parseConfigCost, type ConfigCost, type CostRecord } from "./config-cost.ts";

const MODEL: ConfigCost = { run: 1, night: "2026-01-01", records: 9, level: 0.5, scale: 1.5, pack: { slow: 4 }, router: { search: 10 } };

describe("the cost factors of the configs", () => {
  it("multiply the level, the factor of the pack entry and the factor of the router", () => {
    expect(configFactor({ pack: "slow", router: "search" }, MODEL)).toBe(20);
    expect(configFactor({ pack: "slow", router: "corners" }, MODEL)).toBe(2);
    // An entry without a factor has the factor 1, and a run without a pack entry and a router has the factor 1.
    expect(configFactor({ pack: "rows", router: "corners" }, MODEL)).toBe(0.5);
    expect(configFactor({}, MODEL)).toBe(1);
  });

  it("refuse a factor or a level that is not a finite number above 0", () => {
    expect(() => parseConfigCost(JSON.stringify({ ...MODEL, router: { search: 0 } }))).toThrow(/router.search/);
    expect(() => parseConfigCost(JSON.stringify({ ...MODEL, level: Number.NaN }))).toThrow(/level/);
    expect(() => parseConfigCost(JSON.stringify({ ...MODEL, scale: undefined }))).toThrow(/scale/);
    expect(parseConfigCost(JSON.stringify(MODEL))).toEqual(MODEL);
  });

  it("of the file give the router search a larger factor than the router corners", () => {
    expect(CONFIG_COST.router["search"]!).toBeGreaterThan(CONFIG_COST.router["corners"]!);
    expect(CONFIG_COST.level).toBeGreaterThan(0);
  });
});

describe("the fit of the cost factors", () => {
  it("finds the factors of times that are a product of an input term, a pack term and a router term", () => {
    const packs = { a: 0.5, b: 1, c: 4 };
    const routers = { x: 1, y: 2, z: 0.25 };
    const records: CostRecord[] = [];
    for (const [i, base] of [3, 10, 50, 200, 1000].entries())
      for (const [pack, p] of Object.entries(packs)) for (const [router, r] of Object.entries(routers)) records.push({ input: `in${i}`, pack, router, ms: base * p * r });
    // The median factor of each term is 1, so the fit finds the factors as they are.
    const fit = fitConfigFactors(records);
    expect(fit.pack).toEqual(packs);
    expect(fit.router).toEqual(routers);
  });

  it("refuses an empty list of records", () => {
    expect(() => fitConfigFactors([])).toThrow(RangeError);
  });
});

describe("the fit of the cost of one night", () => {
  // Config "fast" uses the pack entry a and the router x, and config "slow" uses c and z. Each job costs 1000 ms without the factors.
  const configs: Record<string, { pack: string; router: string }> = { fast: { pack: "a", router: "x" }, mid: { pack: "b", router: "y" }, slow: { pack: "c", router: "z" } };
  const records: CostRecord[] = [];
  for (const input of ["i1", "i2", "i3"]) for (const [pack, p] of Object.entries({ a: 1, b: 2, c: 4 })) for (const [router, r] of Object.entries({ x: 1, y: 2, z: 4 })) records.push({ input, pack, router, ms: 10 * p * r });
  const job = (config: string): { base: number; pack: string; router: string } => ({ base: 1000, ...configs[config]! });
  const plans = [{ round: 1, shards: [["u1"], ["u2"]], units: [{ id: "u1", input: "i1", configs: ["fast", "mid"] }, { id: "u2", input: "i2", configs: ["slow", "mid"] }] }];

  it("keeps the planned milliseconds of the jobs, and gives the median scale of the shards", () => {
    // The factors are a 0.5, b 1, c 2 and x 0.5, y 1, z 2. Thus fast has 0.25, mid 1 and slow 4, and the level is 4000 / 6250 = 0.64.
    const shards = [{ round: 1, shard: 0, real: (1000 * 1.25 * 0.64 * 2) / 60000 }, { round: 1, shard: 1, real: (1000 * 5 * 0.64 * 4) / 60000 }];
    const model = fitConfigCost({ run: 7, night: "2026-01-01", records, plans, shards, job });
    expect(model).toMatchObject({ run: 7, night: "2026-01-01", records: 27, level: 0.64, pack: { a: 0.5, b: 1, c: 2 }, router: { x: 0.5, y: 1, z: 2 } });
    expect(model.scale).toBe(3);
  });

  it("counts a stopped shard with the units that it ran", () => {
    const stopped = [{ round: 1, shard: 0, real: (1000 * 1.25 * 0.64) / 60000, stopped: true, done: 1 }];
    const two = [{ round: 1, shards: [["u1", "u2"]], units: plans[0]!.units }];
    expect(fitConfigCost({ run: 7, night: "2026-01-01", records, plans: two, shards: stopped, job }).scale).toBe(1);
  });

  it("refuses a shard of a round without a plan", () => {
    expect(() => fitConfigCost({ run: 7, night: "2026-01-01", records, plans, shards: [{ round: 2, shard: 0, real: 1 }], job })).toThrow(/round 2/);
  });
});
