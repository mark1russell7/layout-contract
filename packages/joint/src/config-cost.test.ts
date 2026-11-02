import { describe, expect, it } from "vitest";
import { CONFIG_COST, configFactor, fitConfigFactors, parseConfigCost, type ConfigCost, type CostRecord } from "./config-cost.ts";

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
