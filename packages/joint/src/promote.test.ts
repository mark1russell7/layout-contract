import { configId, type LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import type { AnalysisInput } from "./analysis.ts";
import { CONFIRM_SEEDS } from "./confirm.ts";
import { incumbentId, nightConfig, NIGHT_CONFIGS, promoteConfigs, promoteMarkdown, promotePlan, PROMOTE_SEEDS } from "./promote.ts";
import { configRun, JOINT_SPACE } from "./space.ts";
import { baselineIds, type SweepInput } from "./sweep.ts";

const INPUTS: readonly AnalysisInput[] = Array.from({ length: 40 }, (_, i) => ({
  id: `joint-v2/rect-grid.f${i % 4}.n${i}/s${PROMOTE_SEEDS[i % 5]}`,
  seed: PROMOTE_SEEDS[i % 5]!,
  spec: `joint-v2/rect-grid.f${i % 4}.n${i}`,
  kind: "rect-grid",
  cell: { containerSize: "fixed", count: "n100", spacing: "both" },
}));

const SWEEP_INPUTS: readonly SweepInput[] = INPUTS.slice(0, 6).map((i) => ({ id: i.id, spec: i.spec, kind: i.kind, seed: i.seed, stress: false, boxes: 100, edges: 200 }));

/** This function gives one record of a config on an input: the route cost falls with `gain`, so the score rises. */
function record(strategy: string, input: AnalysisInput, gain: number): LayoutRecord {
  const measures = { "pack.overflow.excessArea": 0, "joint.fill": 0.7, "joint.spill": 0, "joint.straight.crossings": 100 * (1 - gain) };
  return { schema: "layout-record/1", strategy, input: input.id, seed: input.seed, ms: 10, measures, valid: { pack: true, route: true }, options: {} } as unknown as LayoutRecord;
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

  it("does not pass a config with no gain", () => {
    expect(promoteConfigs(records, INPUTS, rows, incumbent).rows[1]!.passed).toBe(false);
  });

  it("gives a line of text for each config", () => {
    const text = promoteMarkdown(promoteConfigs(records, INPUTS, rows, incumbent));
    expect(text).toContain("of 2 pass");
    expect(text).toContain("Seed SD");
  });
});
