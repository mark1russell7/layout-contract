import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { COST_FIT, COST_MODEL, costMargin, fitCost, inputCost, LANE_FIT, parseCostModel, plannedCost, planShards, type PlanItem } from "./plan.ts";
import { laneEntries, lanePasses } from "./lanes.ts";
import { PACK_ENTRIES, ROUTERS } from "./runner.ts";

const PAIRS = PACK_ENTRIES.length * ROUTERS.length;
const specOf = (id: string): string => id.replace(/\/s\d+$/, "");

/** This function gives the plan items of `joint-v2`, with the cost of `plannedCost` for the pairs of the runner. */
function corpusItems(): PlanItem[] {
  return jointCorpus(SET_V2).inputs.map((i) => ({ id: i.id, spec: specOf(i.id), cost: plannedCost(specOf(i.id), i.boxes.length, i.edges?.length ?? 0, PAIRS) }));
}

/** The dense spec with hubs and the gap, and its wall time on each seed in the shard logs of run 40884908305 (L63, no lane pairs), in milliseconds. That run had `COST_MODEL.pairs` pairs. */
const DENSE_HUBS = "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap";
const DENSE_HUBS_WALL: Readonly<Record<string, number>> = { s1: 4446554, s2: 2949079, s3: 4813197 };

/** The lane passes of the 18 lane pairs of L13. */
const PASSES = lanePasses(laneEntries());

describe("planShards", () => {
  const items = corpusItems();

  it("gives each input to exactly one shard", () => {
    const plan = planShards(items, 48);
    expect(plan.shards).toHaveLength(48);
    expect(plan.shards.flat().sort()).toEqual(items.map((i) => i.id).sort());
  });

  it("is deterministic: the same plan for each order of the inputs", () => {
    const plan = planShards(items, 48);
    expect(planShards(items, 48)).toEqual(plan);
    expect(planShards([...items].reverse(), 48)).toEqual(plan);
  });

  it("puts the seeds of one spec on different shards", () => {
    for (const count of [3, 16, 48, 64]) {
      for (const ids of planShards(items, count).shards) {
        const specs = ids.map((id) => id.replace(/\/s\d+$/, ""));
        expect(new Set(specs).size, `${count} shards`).toBe(specs.length);
      }
    }
  });

  it("keeps the most costly shard at the most costly input, or below 1.5 times the mean cost, at 48 and 64 shards", () => {
    const top = Math.max(...items.map((i) => i.cost));
    for (const count of [48, 64]) {
      const { loads } = planShards(items, count);
      const mean = loads.reduce((s, l) => s + l, 0) / count;
      expect(Math.max(...loads), `${count} shards`).toBeLessThanOrEqual(Math.max(top, 1.5 * mean));
    }
  });

  it("keeps the most costly shard at 64 shards below half of the limit of 360 minutes", () => {
    const { loads } = planShards(items, 64);
    expect(Math.max(...loads) / 60000).toBeLessThan(180);
  });

  it("runs the inputs of a shard from the least cost to the most cost", () => {
    const cost = new Map(items.map((i) => [i.id, i.cost]));
    for (const ids of planShards(items, 48).shards) for (let i = 1; i < ids.length; i++) expect(cost.get(ids[i]!)!).toBeGreaterThanOrEqual(cost.get(ids[i - 1]!)!);
  });

  it("gives the 3 seeds of a costly spec 3 shards, and the small inputs to the other shard", () => {
    const plan = planShards(
      [
        { id: "big/s1", spec: "big", cost: 100 },
        { id: "big/s2", spec: "big", cost: 100 },
        { id: "big/s3", spec: "big", cost: 100 },
        ...Array.from({ length: 8 }, (_, i) => ({ id: `small${String(i).padStart(2, "0")}/s1`, spec: `small${String(i).padStart(2, "0")}`, cost: 10 })),
      ],
      4,
    );
    expect(plan.loads).toEqual([100, 100, 100, 80]);
    expect(plan.shards.slice(0, 3)).toEqual([["big/s1"], ["big/s2"], ["big/s3"]]);
  });

  it("refuses a bad count of shards, a repeated id and a bad cost", () => {
    expect(() => planShards(items, 0)).toThrow(RangeError);
    expect(() => planShards([items[0]!, items[0]!], 2)).toThrow(RangeError);
    expect(() => planShards([{ id: "a", spec: "a", cost: Number.NaN }], 2)).toThrow(RangeError);
  });

  // One seed varies by 1.7 times between runs: s2 took 2949079 ms in run 40884908305 and 4889994 ms in run 40832034625.
  // The margin is a 0.9 quantile, so the plan is for the most costly seed. The test compares it with the range of the seeds.
  it("gives the dense spec with hubs a planned cost within a factor of 1.5 of its most costly seed, and above each seed divided by 1.5", () => {
    const inputs = jointCorpus(SET_V2).inputs.filter((i) => specOf(i.id) === DENSE_HUBS);
    expect(inputs.map((i) => i.id.slice(DENSE_HUBS.length + 1))).toEqual(["s1", "s2", "s3"]);
    const top = Math.max(...Object.values(DENSE_HUBS_WALL));
    for (const i of inputs) {
      const planned = plannedCost(DENSE_HUBS, i.boxes.length, i.edges?.length ?? 0, COST_MODEL.pairs, COST_MODEL.lanePasses);
      expect(planned / top, i.id).toBeGreaterThan(1 / 1.5);
      expect(planned / top, i.id).toBeLessThan(1.5);
      expect(planned / DENSE_HUBS_WALL[i.id.slice(DENSE_HUBS.length + 1)]!, i.id).toBeGreaterThan(1 / 1.5);
    }
  });
});

describe("the cost model", () => {
  it("has the pair fit and the margins of the run 40884908305 (L63)", () => {
    expect(COST_MODEL.corpus).toBe(SET_V2);
    expect(COST_MODEL.pairRun).toBe(40884908305);
    expect(COST_MODEL.run).toBe(40884908305);
    // The run of L63 had the 195 pairs of bench-3 and no lane pairs. bench-4 has 270 pairs: the fit stays a cost for each pair. The lane term stays the fit of run 40757153151 (L13), with 24 passes.
    expect(COST_MODEL.pairs).toBe(195);
    expect(PAIRS).toBe(270);
    expect(COST_MODEL.lanePasses).toBe(0);
    expect(PASSES).toBe(24);
    expect(COST_MODEL.quantile).toBe(0.9);
  });

  it("gives a lane pass more time than one pair on a small input", () => {
    expect(fitCost(LANE_FIT, 10, 9)).toBeGreaterThan(fitCost(COST_FIT, 10, 9));
    expect(inputCost(100, 99, 0, 1)).toBeCloseTo(fitCost(LANE_FIT, 100, 99), 9);
    expect(inputCost(100, 99, 130, 24)).toBeCloseTo(inputCost(100, 99, 130) + 24 * fitCost(LANE_FIT, 100, 99), 9);
  });

  it("has a margin for each spec of joint-v2, and for no other spec", () => {
    const specs = [...new Set(jointCorpus(SET_V2).inputs.map((i) => specOf(i.id)))].sort();
    expect(Object.keys(COST_MODEL.specs).sort()).toEqual(specs);
  });

  it("gives the default margin to a spec without a measured time", () => {
    expect(costMargin("joint-v2/unknown.n10")).toBe(COST_MODEL.default);
    expect(costMargin("toString")).toBe(COST_MODEL.default);
    expect(costMargin(DENSE_HUBS)).toBe(COST_MODEL.specs[DENSE_HUBS]);
    expect(plannedCost("joint-v2/unknown.n10", 100, 99, PAIRS)).toBeCloseTo(inputCost(100, 99, PAIRS) * COST_MODEL.default, 9);
  });

  it("refuses a coefficient or a margin that is not a finite number of 0 or more", () => {
    const good = { corpus: "c", run: 1, commit: "x", pairs: 120, quantile: 0.9, fit: { base: 1, square: 1, cross: 1 }, default: 2, specs: { a: 1 } };
    expect(parseCostModel(JSON.stringify(good)).specs).toEqual({ a: 1 });
    expect(() => parseCostModel(JSON.stringify({ ...good, fit: { base: -1, square: 1, cross: 1 } }))).toThrow(RangeError);
    expect(() => parseCostModel(JSON.stringify({ ...good, specs: { a: "1" } }))).toThrow(RangeError);
    expect(() => parseCostModel(JSON.stringify({ ...good, default: null }))).toThrow(RangeError);
    expect(() => parseCostModel(JSON.stringify({ ...good, lane: { base: 1, square: Number.NaN, cross: 1 } }))).toThrow(RangeError);
    // A model before L13 has no lane term, so a lane pass has no time.
    const old = parseCostModel(JSON.stringify(good));
    expect(old.lane).toEqual({ base: 0, square: 0, cross: 0 });
    expect(old.lanePasses).toBe(0);
    expect(old.pairRun).toBe(1);
  });

  it("gives a cost that grows with the boxes and the edges, and with the pairs", () => {
    expect(inputCost(1000, 4000, 120)).toBeGreaterThan(inputCost(1000, 1000, 120));
    expect(inputCost(1000, 0, 120)).toBeGreaterThan(inputCost(100, 99, 120));
    expect(inputCost(100, 99, 120)).toBeCloseTo(120 * inputCost(100, 99, 1), 9);
  });
});
