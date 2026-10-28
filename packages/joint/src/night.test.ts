import { describe, expect, it } from "vitest";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { applyRecords, emptyState, planRound1, planRound2, raceNight, statusCounts, valueMaps } from "./night.ts";
import { baselineIds, type SweepInput } from "./sweep.ts";

/** The inputs of a test: 4 specs with 3 seeds each. Spec `d` is a stress spec. */
const INPUTS: SweepInput[] = ["a", "b", "c", "d"].flatMap((s) =>
  [1, 2, 3].map((seed) => ({ id: `test/${s}/s${seed}`, spec: `test/${s}`, kind: s === "d" ? "dash" : "cards", seed, stress: s === "d", boxes: 20, edges: 19 })),
);

/** This function gives a record of a test with a fill. */
function record(strategy: string, input: string, fill: number): LayoutRecord {
  return {
    strategy,
    input,
    seed: 1,
    ms: 5,
    measures: { "joint.fill": fill, "route.cap.1.25": 0, "pack.overflow.excessArea": 0, "joint.spill": 0, "joint.straight.crossings": 0 },
    hard: {},
  } as unknown as LayoutRecord;
}

/** The options of the plans: a small budget of 2 shards. */
const OPTIONS = { date: "2026-10-28", target: 60000, maxShards: 2, maxConfigs: 12 };

describe("a night of the sweep on small inputs", () => {
  it("plans round 1: the baseline arm on each input, and new configs on the screen", () => {
    const state = emptyState("test", "test", INPUTS);
    const night = planRound1(state, INPUTS, OPTIONS);
    const base = new Set(baselineIds());
    const units = night.plan.units;
    const jobs = units.flatMap((u) => u.configs.map((c) => ({ c, input: u.input })));
    for (const id of base) expect(jobs.filter((j) => j.c === id)).toHaveLength(INPUTS.length);
    const fresh = jobs.filter((j) => !base.has(j.c));
    expect(fresh.length).toBeGreaterThan(0);
    for (const j of fresh) expect(j.input).toMatch(/\/s1$/);
    expect(night.facts.sampled).toBe(Object.keys(night.configs).length - 3);
    expect(night.plan.shards.length).toBeLessThanOrEqual(OPTIONS.maxShards);
    expect(statusCounts(state)).toMatchObject({ baseline: 3, screened: night.facts.sampled });
    // The same date gives the same plan.
    const again = planRound1(emptyState("test", "test", INPUTS), INPUTS, OPTIONS);
    expect(Object.keys(again.configs)).toEqual(Object.keys(night.configs));
  });

  it("applies the records, races the configs and plans round 2", () => {
    const state = emptyState("test", "test", INPUTS);
    const night = planRound1(state, INPUTS, OPTIONS);
    const ids = Object.keys(night.configs);
    const base = baselineIds();
    const [, , incumbent] = base;
    // The incumbent has the fill 0.5. Each new config has a fill from 0.1 to 0.9 by its place in the list.
    const fillOf = (id: string): number => (base.includes(id) ? (id === incumbent ? 0.5 : 0.3) : 0.1 + (0.8 * ids.indexOf(id)) / ids.length);
    const records = night.plan.units.flatMap((u) => u.configs.map((c) => record(c, u.input, fillOf(c))));
    const added = applyRecords(state, records, INPUTS, OPTIONS.date);
    expect(added).toBe(records.length);
    expect(state.reference.every((r) => r !== null)).toBe(true);
    expect(valueMaps(state).get(incumbent!)?.size).toBe(INPUTS.length);
    // A second time, the records add nothing and give no drift.
    expect(applyRecords(state, records, INPUTS, OPTIONS.date)).toBe(0);
    expect(state.nights[0]!.drift).toBe(0);
    const outcomes = raceNight(state, INPUTS, { date: OPTIONS.date, runs: 200, draws: 400 });
    expect(outcomes.length).toBe(night.facts.sampled);
    const counts = statusCounts(state);
    expect(counts.alive + counts.dropped + counts.halved).toBe(night.facts.sampled);
    expect(counts.alive).toBeGreaterThan(0);
    for (const o of outcomes) if (o.status !== "alive") expect(state.values[o.config]).toBeUndefined();
    const second = planRound2(state, INPUTS, OPTIONS);
    const alive = Object.entries(state.configs).filter(([, c]) => c.status === "alive").map(([id]) => id);
    const jobs = second.plan.units.flatMap((u) => u.configs.map((c) => ({ c, input: u.input })));
    // The alive configs get the seeds 2 and 3 first.
    for (const id of alive.slice(0, 1)) expect(jobs.filter((j) => j.c === id && !j.input.endsWith("/s1")).length).toBe(8);
    expect(state.nights[0]!.round2?.configs).toBe(second.facts.configs);
  });

  it("counts the drift of the baseline arm", () => {
    const state = emptyState("test", "test", INPUTS);
    const base = baselineIds();
    applyRecords(state, INPUTS.flatMap((i) => base.map((b) => record(b, i.id, 0.4))), INPUTS, "2026-10-28");
    const changed = INPUTS.flatMap((i) => base.map((b) => record(b, i.id, i.seed === 1 ? 0.45 : 0.4)));
    applyRecords(state, changed, INPUTS, "2026-10-29");
    expect(state.nights.find((n) => n.date === "2026-10-29")?.drift).toBe(4);
    expect(state.summary.find((r) => r.config === base[0] && r.cell === "headline")?.n).toBe(9);
  });
});
