import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { inputCost, planShards, type PlanItem } from "./plan.ts";
import { PACK_ENTRIES, ROUTERS } from "./runner.ts";

/** This function gives the plan items of `joint-v2`, with the cost of `inputCost` for each pair of the runner. */
function corpusItems(): PlanItem[] {
  const pairs = PACK_ENTRIES.length * ROUTERS.length;
  return jointCorpus(SET_V2).inputs.map((i) => ({ id: i.id, spec: i.id.replace(/\/s\d+$/, ""), cost: inputCost(i.boxes.length, i.edges?.length ?? 0, pairs) }));
}

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

  it("keeps the most costly shard below 1.5 times the mean cost at 48 and 64 shards", () => {
    for (const count of [48, 64]) {
      const { loads } = planShards(items, count);
      const mean = loads.reduce((s, l) => s + l, 0) / count;
      expect(Math.max(...loads) / mean, `${count} shards`).toBeLessThan(1.5);
    }
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

  it("gives a cost that grows with the boxes and the edges, and with the pairs", () => {
    expect(inputCost(1000, 4000, 120)).toBeGreaterThan(inputCost(1000, 1000, 120));
    expect(inputCost(1000, 0, 120)).toBeGreaterThan(inputCost(100, 99, 120));
    expect(inputCost(100, 99, 120)).toBeCloseTo(120 * inputCost(100, 99, 1), 9);
  });
});
