import { describe, expect, it } from "vitest";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { nightLine, nightVerdict } from "./night-check.ts";
import { applyRecords, emptyState, labelLine, lostLine, lostPairs, noReferenceRecords, noteLost, planRound1, planRound2, raceLines, raceNight, RACE_NOTE_2026_11_02, statusCounts, valueMaps } from "./night.ts";
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

  it("keeps the route values of the baseline arm apart, so they move no verdict", () => {
    const nightWith = (crossings: number): { state: ReturnType<typeof emptyState>; outcomes: ReturnType<typeof raceNight> } => {
      const state = emptyState("test", "test", INPUTS);
      const night = planRound1(state, INPUTS, OPTIONS);
      const ids = Object.keys(night.configs);
      const records = night.plan.units.flatMap((u) =>
        u.configs.map((c) => {
          const plain = record(c, u.input, 0.1 + (0.8 * ids.indexOf(c)) / ids.length);
          return { ...plain, measures: { ...plain.measures, "route.crossings": crossings, "route.detour.mean": crossings + 1, "route.detour.q95": crossings + 2 } };
        }),
      );
      applyRecords(state, records, INPUTS, OPTIONS.date);
      return { state, outcomes: raceNight(state, INPUTS, { date: OPTIONS.date, runs: 200, draws: 400 }) };
    };
    const [low, high] = [nightWith(1), nightWith(1000)];
    expect(high.state.reference).toEqual(low.state.reference);
    expect(high.state.values).toEqual(low.state.values);
    expect(high.state.configs).toEqual(low.state.configs);
    expect(high.outcomes).toEqual(low.outcomes);
    expect(low.state.stepValues?.[0]?.[0]).toEqual({ "route.crossings": 1, "route.detour.mean": 2, "route.detour.q95": 3 });
    expect(high.state.stepValues?.[0]?.[0]).toEqual({ "route.crossings": 1000, "route.detour.mean": 1001, "route.detour.q95": 1002 });
  });

  it("gives an old state the route values at its first record, with null on an input with no night", () => {
    const state = emptyState("test", "test", INPUTS);
    expect(state.stepValues).toBeUndefined();
    planRound1(state, INPUTS, OPTIONS);
    const [first] = INPUTS;
    const records = baselineIds().map((id) => record(id, first!.id, 0.5));
    applyRecords(state, records, INPUTS, OPTIONS.date);
    expect(state.stepValues?.[0]).toEqual([{}, {}, {}]);
    expect(state.stepValues?.[1]).toBeNull();
    expect(state.stepValues).toHaveLength(INPUTS.length);
  });

  it("rotates the screened configs: a config that does not fit comes first on the next night", () => {
    const state = emptyState("test", "test", INPUTS);
    const first = planRound1(state, INPUTS, { ...OPTIONS, maxShards: 4 });
    const screened = Object.keys(first.configs).filter((id) => state.configs[id]!.status === "screened");
    expect(screened.length).toBeGreaterThan(2);
    // The first night stops before the jobs of the screened configs: only the baseline arm has records. Each screened config still needs the screen.
    const base = new Set(baselineIds());
    const recordsOf = (night: ReturnType<typeof planRound1>, keep: (id: string) => boolean): LayoutRecord[] =>
      night.plan.units.flatMap((u) => u.configs.filter(keep).map((c) => record(c, u.input, 0.4)));
    applyRecords(state, recordsOf(first, (id) => base.has(id)), INPUTS, OPTIONS.date);
    for (const id of screened) expect(state.configs[id]!.ran).toBeUndefined();
    // A small budget takes only some of the screened configs, and no new config.
    const planned = (night: ReturnType<typeof planRound1>): string[] => screened.filter((id) => id in night.configs);
    // The budget of one shard is 60% of the first night: the baseline arm and some of the screened configs.
    const total = first.plan.loads.reduce((s, l) => s + l, 0);
    const small = { ...OPTIONS, target: (total * 0.6) / 0.9, maxShards: 1, maxConfigs: 1 };
    const second = planRound1(state, INPUTS, { ...small, date: "2026-10-29" });
    const took = planned(second);
    expect(took.length).toBeGreaterThan(0);
    expect(took.length).toBeLessThan(screened.length);
    applyRecords(state, recordsOf(second, (id) => took.includes(id)), INPUTS, "2026-10-29");
    for (const id of took) expect(state.configs[id]!.ran).toBe("2026-10-29");
    const waited = screened.filter((id) => !took.includes(id));
    for (const id of waited) expect(state.configs[id]!.ran).toBeUndefined();
    // The next night takes the configs that waited before the configs of the night before.
    const third = planRound1(state, INPUTS, { ...small, date: "2026-10-30" });
    expect(planned(third).slice(0, Math.min(waited.length, planned(third).length))).toEqual(waited.slice(0, Math.min(waited.length, planned(third).length)));
  });

  it("gives no drift for a value with more digits than the state stores", () => {
    const state = emptyState("test", "test", INPUTS);
    const base = baselineIds();
    const same = INPUTS.flatMap((i) => base.map((b) => record(b, i.id, 0.123456789)));
    applyRecords(state, same, INPUTS, "2026-10-28");
    applyRecords(state, same, INPUTS, "2026-10-29");
    expect(state.nights.find((n) => n.date === "2026-10-29")?.drift).toBe(0);
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

/** This function gives a state after a first night with each record, so each input has a reference, and with one new config. */
function stateWithAlive(): ReturnType<typeof emptyState> {
  const state = emptyState("test", "test", INPUTS);
  const base = baselineIds();
  applyRecords(state, INPUTS.flatMap((i) => base.map((c) => record(c, i.id, 0.5))), INPUTS, OPTIONS.date);
  state.configs["held"] = { status: "alive", config: { pack: "p", router: "r" }, ran: OPTIONS.date } as unknown as (typeof state.configs)[string];
  return state;
}

describe("the race of a night states what it held out", () => {
  const NEXT = { date: "2026-10-29", runs: 200, draws: 400 };

  it("prints the name and the reason of an injected held config", () => {
    const state = stateWithAlive();
    // The config has values on each input except 2.
    applyRecords(state, INPUTS.slice(2).map((i) => record("held", i.id, 0.5)), INPUTS, NEXT.date);
    raceNight(state, INPUTS, NEXT);
    const race = state.nights.at(-1)!.race!;
    expect(race.full).toBe(0);
    expect(race.aliveAtStart).toBe(1);
    expect(race.held).toEqual([{ config: "held", status: "alive", missing: 2, of: INPUTS.length, reason: `2 of ${INPUTS.length} inputs have no value` }]);
    const text = raceLines(race).join("\n");
    expect(text).toContain("1 alive configs at the start, 0 with each input raced, 1 held out");
    expect(text).toContain("| `held` | alive | 2 |");
  });

  it("prints no held config on a night with none, also when a config raced in full", () => {
    const state = stateWithAlive();
    applyRecords(state, INPUTS.map((i) => record("held", i.id, 0.5)), INPUTS, NEXT.date);
    raceNight(state, INPUTS, NEXT);
    const race = state.nights.at(-1)!.race!;
    expect(race.held).toEqual([]);
    expect(race.full).toBe(1);
    const text = raceLines(race).join("\n");
    expect(text).toContain("0 held out");
    expect(text).not.toContain("Held config");
  });

  it("reads a night with nothing to race differently from a night that held each config out", () => {
    const empty = emptyState("test", "test", INPUTS);
    raceNight(empty, INPUTS, NEXT);
    const race = empty.nights.at(-1)!.race!;
    expect(race.full).toBe(0);
    expect(raceLines(race).join("\n")).toContain("had nothing to race");
    const held = stateWithAlive();
    raceNight(held, INPUTS, NEXT);
    const heldRace = held.nights.at(-1)!.race!;
    expect(heldRace.full).toBe(0);
    expect(raceLines(heldRace).join("\n")).not.toContain("nothing to race");
  });

  it("gives a night from before the held list only its counts", () => {
    expect(raceLines({ raced: 1, dropped: 0, halved: 0, alive: 1, full: 0, fullDropped: 0 })).toEqual(['Race: {"raced":1,"dropped":0,"halved":0,"alive":1,"full":0,"fullDropped":0}.']);
    expect(raceLines(undefined)).toEqual(["Race: none."]);
  });
});

describe("the label of a config states its origin", () => {
  it("reads a label from the screen as that, and a held config as held", () => {
    const entry = { label: "better", labelFrom: { kind: "screen", night: "2026-11-01" } } as const;
    expect(labelLine(entry)).toBe("better (the screen of 2026-11-01)");
    expect(labelLine(entry, 9)).toBe("held, 9 inputs missing (better from the screen of 2026-11-01)");
    expect(labelLine({ label: "better", labelFrom: { kind: "race", night: "2026-11-03" } })).toBe("better (the full race of 2026-11-03)");
  });

  it("states when the state gives no origin", () => {
    expect(labelLine({ label: "better" })).toBe("better (origin not stated)");
    expect(labelLine({ label: "better" }, 3)).toBe("held, 3 inputs missing (better from a race with no stated origin)");
    expect(labelLine({}, 3)).toBe("held, 3 inputs missing (no label)");
    expect(labelLine({})).toBe("");
  });

  it("writes the origin at the race", () => {
    const state = stateWithAlive();
    applyRecords(state, INPUTS.map((i) => record("held", i.id, 0.5)), INPUTS, "2026-10-29");
    raceNight(state, INPUTS, { date: "2026-10-29", runs: 200, draws: 400 });
    expect(state.configs["held"]!.labelFrom).toEqual({ kind: "race", night: "2026-10-29" });
  });

  it("keeps the note on the labels of 2026-11-02 with its run", () => {
    expect(RACE_NOTE_2026_11_02).toContain("41442420950");
    expect(RACE_NOTE_2026_11_02).toContain("2026-11-01");
  });
});

describe("the count of the planned pairs that gave no value", () => {
  const UNITS = [{ input: INPUTS[0]!.id, configs: ["a", "b"] }, { input: INPUTS[1]!.id, configs: ["a"] }];

  /** This function gives a night where each input has no reference, or each input except the first. */
  function stateOf(withReference: boolean): ReturnType<typeof emptyState> {
    const state = emptyState("test", "test", INPUTS);
    const base = baselineIds();
    if (withReference) applyRecords(state, base.map((c) => record(c, INPUTS[0]!.id, 0.5)), INPUTS, OPTIONS.date);
    else applyRecords(state, [], INPUTS, OPTIONS.date);
    for (const id of ["a", "b"]) state.configs[id] = { status: "screened", config: {}, ran: OPTIONS.date } as unknown as (typeof state.configs)[string];
    return state;
  }

  it("counts a pair with no record, a pair of a censored unit and a record with no reference", () => {
    const state = stateOf(true);
    const records = [record("a", INPUTS[0]!.id, 0.5), record("a", INPUTS[1]!.id, 0.5)];
    applyRecords(state, records, INPUTS, OPTIONS.date);
    expect(lostPairs(state, UNITS, records)).toEqual([
      { config: "b", input: INPUTS[0]!.id, reason: "no-record" },
      { config: "a", input: INPUTS[1]!.id, reason: "no-reference" },
    ]);
    expect(lostPairs(state, UNITS, records, new Set([`b|${INPUTS[0]!.id}`]))[0]!.reason).toBe("censored");
    expect(noReferenceRecords(state, records).map((r) => r.input)).toEqual([INPUTS[1]!.id]);
  });

  it("gives no record of an unknown config to the kept file", () => {
    const state = stateOf(false);
    expect(noReferenceRecords(state, [record("unknown", INPUTS[0]!.id, 0.5), record("a", "test/none/s1", 0.5)])).toEqual([]);
  });

  it("takes a lost pair off the count when a later round gets its value, and keeps a pair that no round plans again", () => {
    const state = stateOf(true);
    const night = state.nights.at(-1)!;
    noteLost(night, 1, UNITS, [{ config: "b", input: INPUTS[0]!.id, reason: "no-record" }, { config: "a", input: INPUTS[1]!.id, reason: "no-reference" }]);
    expect(night.missing).toBe(2);
    expect(night.lost?.rounds[1]).toEqual({ planned: 3, noRecord: 1, noReference: 1, censored: 0 });
    noteLost(night, 2, [{ input: INPUTS[0]!.id, configs: ["b"] }], []);
    expect(night.missing).toBe(1);
    expect(lostLine(night)).toContain("Planned pairs that gave no value by the end of the night: 1 (round 1: 1 with no record, 1 with no reference, 0 censored; round 2: 0 with no record, 0 with no reference, 0 censored).");
  });

  // The flip of the line "Partial" of the page. A record with no reference and a pair with no record turn the line partial. A copy with no fault stays current.
  it("turns the check of a night partial on a fault, and a no-fault copy stays current", () => {
    const state = stateOf(true);
    const records = [record("a", INPUTS[0]!.id, 0.5), record("a", INPUTS[1]!.id, 0.5)];
    applyRecords(state, records, INPUTS, OPTIONS.date);
    const fault = state.nights.at(-1)!;
    noteLost(fault, 1, UNITS, lostPairs(state, UNITS, records));
    const v = nightVerdict(OPTIONS.date, fault.missing, OPTIONS.date);
    expect(v.state).toBe("partial");
    expect(nightLine(v)).toContain("2 planned pairs gave no value");

    const clean = stateOf(true);
    const units = [{ input: INPUTS[0]!.id, configs: ["a", "b"] }];
    const all = [record("a", INPUTS[0]!.id, 0.5), record("b", INPUTS[0]!.id, 0.5)];
    applyRecords(clean, all, INPUTS, OPTIONS.date);
    const night = clean.nights.at(-1)!;
    noteLost(night, 1, units, lostPairs(clean, units, all));
    expect(night.missing).toBe(0);
    expect(nightVerdict(OPTIONS.date, night.missing, OPTIONS.date).state).toBe("current");
  });
});
