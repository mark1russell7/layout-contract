import { describe, expect, it } from "vitest";
import { configId, type LayoutRecord } from "@mark1russell7/layout-contract";
import { PACK_ENTRIES } from "./runner.ts";
import { configRun, JOINT_SPACE, LANE_STAGE } from "./space.ts";
import {
  addToSummary,
  baselineIds,
  coverageNeed,
  jobCost,
  nightSeed,
  planRound,
  race,
  sampleConfigs,
  strataCounts,
  strataOf,
  summaryRows,
  summaryTable,
  sweepValue,
  takeBudget,
  unitsOf,
  type SummaryRow,
} from "./sweep.ts";

/** This function gives a record with the pick values of a test: the fill, the routes above the cap and the overflow area. */
function record(strategy: string, input: string, fill: number, hard = 0, excess = 0, skipped?: string): LayoutRecord {
  return {
    strategy,
    input,
    seed: 1,
    ms: 10,
    measures: { "joint.fill": fill, "route.cap.1.25": hard, "pack.overflow.excessArea": excess, "joint.spill": 0, "joint.straight.crossings": 0 },
    hard: {},
    ...(skipped === undefined ? {} : { skipped }),
  } as unknown as LayoutRecord;
}

describe("the seed of a night", () => {
  it("is the date as a number, and refuses another form", () => {
    expect(nightSeed("2026-10-28")).toBe(20261028);
    expect(() => nightSeed("2026-10-28T03:17")).toThrow(RangeError);
  });
});

describe("the coverage of the space", () => {
  it("gives a stratum for each stage, each pair of stages and each param bin", () => {
    const strata = strataOf(JOINT_SPACE.named!["lanes-sides.maxrects-cp.corners+corners"]!);
    expect(strata).toContain("packing.entry=maxrects-cp");
    expect(strata).toContain("highways.router=corners");
    expect(strata).toContain(`${LANE_STAGE}=sides`);
    expect(strata).toContain(`packing.entry=maxrects-cp&${LANE_STAGE}=sides`);
    // The clearance 5 is in the middle bin of 2 to 10, and the cap 8 is in the middle bin of 1 to 16.
    expect(strata).toContain(`${LANE_STAGE}=sides.clearance#1`);
    expect(strata).toContain(`${LANE_STAGE}=sides.cap#1`);
    expect(strataOf(JOINT_SPACE.named!["rows+portfolio"]!)).toContain(`${LANE_STAGE}=none`);
  });

  it("gives a larger need to a config in less covered strata", () => {
    const counts = strataCounts([JOINT_SPACE.named!["rows+portfolio"]!]);
    const old = coverageNeed(strataOf(JOINT_SPACE.named!["rows+portfolio"]!), counts);
    const fresh = coverageNeed(strataOf(JOINT_SPACE.named!["shelf+corners"]!), counts);
    expect(fresh).toBeGreaterThan(old);
  });

  it("samples new configs: the same for one seed, other configs for another seed, none of the known configs", () => {
    const known = new Set(baselineIds());
    const a = sampleConfigs({ n: 20, seed: 20261028, known });
    const b = sampleConfigs({ n: 20, seed: 20261028, known });
    const c = sampleConfigs({ n: 20, seed: 20261029, known });
    const ids = (xs: typeof a): string[] => xs.map((x) => configId(JOINT_SPACE, x));
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).not.toEqual(ids(c));
    expect(new Set(ids(a)).size).toBe(20);
    for (const id of ids(a)) expect(known.has(id)).toBe(false);
  });

  it("spreads a sample over the pack entries", () => {
    const a = sampleConfigs({ n: PACK_ENTRIES.length, seed: 7, known: new Set() });
    expect(new Set(a.map((c) => configRun(c).pack)).size).toBeGreaterThanOrEqual(PACK_ENTRIES.length - 1);
  });
});

describe("the plan of a round", () => {
  it("gives a lane config more cost than a plain config", () => {
    const input = { spec: "test/a", boxes: 100, edges: 99 };
    expect(jobCost({ passes: 1 }, input)).toBeGreaterThan(jobCost({ passes: 0 }, input));
  });

  it("joins the jobs of an input into units up to the largest cost", () => {
    const jobs = ["a", "b", "c", "d", "e"].map((config) => ({ config, input: "x" }));
    const units = unitsOf([...jobs, { config: "a", input: "y" }], (j) => (j.config === "c" ? 5 : 1), 3);
    expect(units.map((u) => [u.id, u.configs])).toEqual([
      ["x#0", ["a", "b"]],
      ["x#1", ["c"]],
      ["x#2", ["d", "e"]],
      ["y#0", ["a"]],
    ]);
  });

  it("gives a round the count of shards of its cost over the target, up to the largest count", () => {
    const units = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, input: `i${i}`, configs: ["a"], cost: 10 }));
    expect(planRound(units, (i) => i, 25, 8).shards).toHaveLength(4);
    expect(planRound(units, (i) => i, 5, 8).shards).toHaveLength(8);
    expect(planRound([], (i) => i, 5, 8).shards).toHaveLength(1);
  });

  it("takes items in order while the budget lasts", () => {
    expect(takeBudget([3, 4, 1, 1], (x) => x, 7).taken).toEqual([3, 4]);
    expect(takeBudget([3, 5, 1], (x) => x, 7)).toEqual({ taken: [3], cost: 3 });
  });
});

describe("the score of a config against the reference", () => {
  const reference = [
    { hard: 0, "pack.overflow.excessArea": 0, "joint.fill": 0.3, "joint.spill": 0, "joint.straight.crossings": 0 },
    { hard: 1, "pack.overflow.excessArea": 0, "joint.fill": 0.5, "joint.spill": 0, "joint.straight.crossings": 0 },
  ];

  it("gives the fill to a config that reaches the floor of the reference", () => {
    const v = sweepValue(record("x", "i", 0.25), reference);
    expect(v.reached).toBe(true);
    expect(v.score).toBe(0.25);
  });

  it("gives 0 to a config with more hard breaks or more overflow than the floor", () => {
    expect(sweepValue(record("x", "i", 0.9, 2), reference)).toMatchObject({ reached: false, score: 0, fill: 0.9, hard: 2 });
    expect(sweepValue(record("x", "i", 0.9, 0, 0.5), reference).score).toBe(0);
  });

  it("gives 0 to a skipped config", () => {
    expect(sweepValue(record("x", "i", 0, 0, 0, "error"), reference)).toMatchObject({ reached: false, skipped: true });
  });
});

describe("the summary", () => {
  it("adds the counts, the sums and the paired counts of each value", () => {
    const rows = new Map<string, SummaryRow>();
    const value = sweepValue(record("x", "i", 0.4), []);
    addToSummary(rows, "x", { kind: "cards", stress: false }, value, { "rows+portfolio": 0.2, "select+portfolio": 0.4, missing: undefined });
    addToSummary(rows, "x", { kind: "cards", stress: false }, { ...value, score: 0, reached: false }, { "rows+portfolio": 0.2 });
    addToSummary(rows, "x", { kind: "cards", stress: true }, value, {});
    const row = rows.get("x|headline|cards")!;
    expect(row).toMatchObject({ n: 2, misses: 1, score: 0.4, fill: 0.8 });
    expect(row.vs["rows+portfolio"]).toEqual({ wins: 1, losses: 1, ties: 0, diff: expect.closeTo(0, 9) });
    expect(row.vs["select+portfolio"]).toMatchObject({ ties: 1 });
    expect(row.vs["missing"]).toBeUndefined();
    expect(rows.get("x|stress|cards")?.n).toBe(1);
    // The table of the file summary.json gives the same rows back.
    const table = summaryTable([...rows.values()], ["rows+portfolio", "select+portfolio", "missing"]);
    expect(table.columns).toContain("rows+portfolio.wins");
    expect(summaryRows(JSON.parse(JSON.stringify(table)))).toEqual([...rows.values()].map((r) => ({ ...r, vs: Object.fromEntries(Object.entries(r.vs).map(([k, v]) => [k, { ...v, diff: Number(v.diff.toFixed(6)) }])) })));
  });
});

describe("the race", () => {
  const inputs = Array.from({ length: 30 }, (_, i) => `spec${i}/s1`);
  const values = new Map<string, Map<string, number>>();
  const add = (id: string, f: (i: number) => number): void => void values.set(id, new Map(inputs.map((x, i) => [x, f(i)])));
  add("inc", (i) => 0.5 + (i % 3) * 0.01);
  add("worse", (i) => 0.2 + (i % 3) * 0.01);
  add("better", (i) => 0.8 + (i % 3) * 0.01);
  for (let k = 0; k < 6; k++) add(`near${k}`, (i) => 0.5 + (i % 3) * 0.01 + (i % 2 === 0 ? 0.002 * k : -0.002 * k) + 0.0005 * k);
  const options = { incumbent: "inc", family: (i: string) => i.split("/")[0]!, seed: () => 1, runs: 500, draws: 1000 };

  it("drops a config that the paired verdict beats, and keeps a better config", () => {
    const out = race(values, ["worse", "better"], options);
    expect(out.find((o) => o.config === "worse")).toMatchObject({ label: "worse", status: "dropped" });
    expect(out.find((o) => o.config === "better")).toMatchObject({ label: "better", status: "alive" });
  });

  it("keeps 1 of each 3 of the other configs by their mean", () => {
    const out = race(values, ["near0", "near1", "near2", "near3", "near4", "near5"], options);
    expect(out.filter((o) => o.status === "alive").map((o) => o.config)).toEqual(["near4", "near5"]);
    expect(out.filter((o) => o.status === "halved")).toHaveLength(4);
  });

  it("keeps each config that is not worse with the factor Infinity, and gives no verdict without values", () => {
    const out = race(values, ["near0", "near1", "none"], { ...options, eta: Infinity });
    expect(out.map((o) => o.status)).toEqual(["alive", "alive", "alive"]);
    expect(out[2]).toMatchObject({ label: "no verdict", n: 0 });
  });
});
