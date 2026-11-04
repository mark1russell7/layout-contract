import { configId, type LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import type { AnalysisInput } from "./analysis.ts";
import { CONFIRM_SEEDS } from "./confirm.ts";
import { aaSpread, incumbentId, nightConfig, NIGHT_CONFIGS, promoteConfigs, promoteMarkdown, promotePlan, PROMOTE_SEEDS } from "./promote.ts";
import { configRun, JOINT_SPACE } from "./space.ts";
import { baselineIds, type SweepInput } from "./sweep.ts";

/** Eight specs with the 5 seeds of the test, so that each pair of seeds has a difference on each spec. */
const INPUTS: readonly AnalysisInput[] = Array.from({ length: 8 }, (_, n) => n).flatMap((n) =>
  PROMOTE_SEEDS.map((seed) => ({
    id: `joint-v2/rect-grid.f${n % 4}.n${n}/s${seed}`,
    seed,
    spec: `joint-v2/rect-grid.f${n % 4}.n${n}`,
    kind: "rect-grid",
    cell: { containerSize: "fixed", count: "n100", spacing: "both" },
  })),
);

const SWEEP_INPUTS: readonly SweepInput[] = INPUTS.slice(0, 6).map((i) => ({ id: i.id, spec: i.spec, kind: i.kind, seed: i.seed, stress: false, boxes: 100, edges: 200 }));

/** This function gives one record of a config on an input: the fill rises with `gain`, and the crossings fall with it. Each guard has a value. */
function record(strategy: string, input: AnalysisInput, gain: number): LayoutRecord {
  const measures = {
    "pack.overflow": 0,
    "pack.overflow.excessArea": 0,
    "pack.area": 100,
    "pack.fill": 0.5,
    "pack.aspectError": 0.1,
    "pack.order.inversions": 0,
    "route.mixed": 0,
    "route.cap.1.1": 0,
    "route.cap.1.25": 0,
    "route.cap.1.5": 0,
    "joint.fill": 0.5 + gain,
    "joint.aspectError": 0.1,
    "joint.spill": 0,
    "joint.straight.crossings": 100 * (1 - gain),
    "joint.straight.length": 1,
  };
  const base = { schema: "layout-record/1", strategy, input: input.id, seed: input.seed, ms: 10, options: {}, corpus: "test", inputHash: "", set: "test", nodes: 3, edges: 2 };
  return { ...base, measures, hard: { "pack.no-overlap": 0, "route.violations": 0 }, deterministic: true, outputHash: `${strategy}:${input.id}` } as unknown as LayoutRecord;
}

describe("the configs of night 1", () => {
  it("keep their ids of the state of the sweep", () => {
    for (const row of NIGHT_CONFIGS) expect(configId(JOINT_SPACE, nightConfig(row))).toBe(row.id);
  });

  it("each give a run of the current space", () => {
    for (const row of NIGHT_CONFIGS) expect(configRun(nightConfig(row)).pair).toContain(row.pack);
  });

  it("use fresh seeds, apart from the seeds of the sweep and of L40", () => {
    expect(PROMOTE_SEEDS).toHaveLength(5);
    for (const seed of PROMOTE_SEEDS) {
      expect(seed).toBeGreaterThan(3);
      expect(CONFIRM_SEEDS).not.toContain(seed);
    }
  });
});

describe("promotePlan", () => {
  it("puts each config of night 1 and the baseline arm on each input", () => {
    const plan = promotePlan(SWEEP_INPUTS, { date: "2026-11-04", target: 60000, maxShards: 4, maxConfigs: 0 });
    const ids = new Set(Object.keys(plan.configs));
    for (const id of [...baselineIds(), ...NIGHT_CONFIGS.map((r) => r.id)]) expect(ids.has(id)).toBe(true);
    expect(ids.has(incumbentId())).toBe(true);
    expect(plan.facts.jobs).toBe(ids.size * SWEEP_INPUTS.length);
    expect(plan.seeds).toEqual(PROMOTE_SEEDS);
    expect(plan.plan.shards.flat()).toHaveLength(plan.facts.units);
  });
});

describe("promoteConfigs", () => {
  const rows = NIGHT_CONFIGS.slice(0, 2);
  const incumbent = "base";
  const gainOf = (id: string): number => (id === rows[0]!.id ? 0.3 : 0);
  const records = INPUTS.flatMap((input) => [record(incumbent, input, 0), ...rows.map((r) => record(r.id, input, gainOf(r.id)))]);

  it("gives the gain of each seed, its mean and its SD", () => {
    const report = promoteConfigs(records, INPUTS, rows, incumbent);
    expect(report.schema).toBe("joint-promotion/1");
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]!.seedGains).toHaveLength(5);
    expect(report.rows[0]!.seedSd).toBeGreaterThanOrEqual(0);
    expect(report.headlineInputs).toBe(INPUTS.length);
  });

  it("counts an input with no record as incomplete, and then the config does not pass", () => {
    const lost = records.filter((r) => !(r.strategy === rows[0]!.id && r.input === INPUTS[0]!.id));
    const row = promoteConfigs(lost, INPUTS, rows, incumbent).rows[0]!;
    expect(row.incomplete).toBe(1);
    expect(row.passed).toBe(false);
  });

  it("passes a config with a clean gain over the A/A spread", () => {
    const row = promoteConfigs(records, INPUTS, rows, incumbent).rows[0]!;
    expect(row.overAa).toBe(true);
    expect(row.passed).toBe(true);
  });

  it("gives the changes in the units of a reader", () => {
    const row = promoteConfigs(records, INPUTS, rows, incumbent).rows[0]!;
    expect(row.units.find((u) => u.id === "crossings")?.change).toBeCloseTo(-30);
    expect(row.units.find((u) => u.id === "fill")?.change).toBeCloseTo(30);
    expect(row.units.find((u) => u.id === "overlaps")?.config).toBe(0);
  });

  it("does not pass a gain under the A/A spread", () => {
    const moved = INPUTS.map((input) => record(incumbent, input, input.seed === 7 ? 0.5 : 0));
    const report = promoteConfigs([...moved, ...INPUTS.flatMap((input) => rows.map((r) => record(r.id, input, gainOf(r.id))))], INPUTS, rows, incumbent);
    expect(report.aa.score).toBeCloseTo(0.5);
    expect(report.rows[0]!.overAa).toBe(false);
    expect(report.rows[0]!.passed).toBe(false);
  });

  it("does not pass a config with no gain", () => {
    expect(promoteConfigs(records, INPUTS, rows, incumbent).rows[1]!.passed).toBe(false);
  });

  it("gives a line of text for each config", () => {
    const text = promoteMarkdown(promoteConfigs(records, INPUTS, rows, incumbent));
    expect(text).toContain("of 2 pass");
    expect(text).toContain("Seed SD");
    expect(text).toContain("The A/A spread");
    expect(text).toContain("Crossings");
  });
});

describe("aaSpread", () => {
  it("is 0 when a config gives the same value on each seed", () => {
    expect(aaSpread(INPUTS, () => 1)).toBe(0);
  });

  it("gives the largest mean difference between two seeds", () => {
    expect(aaSpread(INPUTS, (i) => (i.seed === 11 ? 3 : 1))).toBeCloseTo(2);
  });

  it("gives 0 with no spec on two seeds", () => {
    expect(aaSpread(INPUTS.filter((i) => i.seed === 7), () => 1)).toBe(0);
  });
});
