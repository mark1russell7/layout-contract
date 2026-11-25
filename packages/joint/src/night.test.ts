import { describe, expect, it } from "vitest";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { nightLine, nightVerdict } from "./night-check.ts";
import { applyRecords, emptyState, labelLine, lostLine, lostPairs, noReferenceRecords, noteLost, planRound1, planRound2, raceLines, raceNight, RACE_NOTE_2026_11_02, statusCounts, valueMaps, applyKept, censoredLimit, censoredLines, nightOf, noteMisses, settleRows, waitingLine, waitAgeLines, WAIT_BOUND, epochEnd, epochEndLines, checkStateSpace, type SweepState } from "./night.ts";
import { configRun, JOINT_SPACE, spaceFingerprint } from "./space.ts";
import { baselineIds, jobCost, SWEEP_FILL, takeBudget, takeFitting, type SweepInput } from "./sweep.ts";

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
  it("keeps the fingerprint of the space, and refuses a state of another space (L133)", () => {
    const state = emptyState("test", "test", INPUTS);
    expect(state.spaceFingerprint).toBe(spaceFingerprint(JOINT_SPACE));
    expect(() => checkStateSpace(state)).not.toThrow();
    // A state from before the field gets the fingerprint at its next plan.
    const old: SweepState = { ...state };
    delete old.spaceFingerprint;
    checkStateSpace(old);
    expect(old.spaceFingerprint).toBe(spaceFingerprint(JOINT_SPACE));
    expect(() => checkStateSpace({ ...state, spaceFingerprint: "0000000000000000" })).toThrow(/takes a new BENCH_SPACE_VERSION/);
  });

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
    // The records of this test state no field deterministic, so the night counts each as a record with no value (L117).
    expect(state.nights.at(-1)!.sameTwice).toMatchObject({ twice: 0, differ: 0, unstated: records.length });
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
    const again = planned(third);
    const waitedThere = again.filter((id) => waited.includes(id));
    expect(waitedThere.length).toBeGreaterThan(0);
    expect(waitedThere).toEqual(waited.slice(0, waitedThere.length));
    // A config of the night before, such as the config that ran in part, comes only after each config that waited.
    if (again.length > waitedThere.length) expect(waitedThere).toEqual(waited);
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

describe("a pair that misses on 2 planned nights gets a censored row (L116)", () => {
  const RACE = { runs: 200, draws: 400 };
  const DATES = ["2026-11-10", "2026-11-11", "2026-11-12"];
  const NEVER = INPUTS[0]!.id;

  /** This function gives a state with an alive config that has each value except on the inputs of a list. */
  function aliveWithout(...absent: string[]): ReturnType<typeof stateWithAlive> {
    const state = stateWithAlive();
    applyRecords(state, INPUTS.filter((i) => !absent.includes(i.id)).map((i) => record("held", i.id, 0.5)), INPUTS, "2026-11-09");
    return state;
  }

  /** This function runs one night on a state: the race, and then a plan of a list of inputs that gives no record. A flag leaves the rule out, as a fault copy of the code. */
  function missNight(state: ReturnType<typeof stateWithAlive>, date: string, planned: readonly string[], rule = true): void {
    raceNight(state, INPUTS, { date, ...RACE });
    const units = planned.map((input) => ({ input, configs: ["held"] }));
    const night = nightOf(state, date);
    noteLost(night, 2, units, lostPairs(state, units, []));
    if (rule) noteMisses(state, night);
    delete night.pending;
  }

  it("brings a config with a synthetic input that never records to the full race on the third night", () => {
    const state = aliveWithout(NEVER);
    missNight(state, DATES[0]!, [NEVER]);
    expect(state.nights.at(-1)!.race!.full).toBe(0);
    expect(state.configs["held"]!.censored).toBeUndefined();
    missNight(state, DATES[1]!, [NEVER]);
    expect(state.nights.at(-1)!.race!.full).toBe(0);
    expect(state.configs["held"]!.censored?.[NEVER]).toEqual({ input: NEVER, tag: "censored", reason: "no-record", nights: DATES.slice(0, 2), atLeastMs: null });
    raceNight(state, INPUTS, { date: DATES[2]!, ...RACE });
    const race = state.nights.at(-1)!.race!;
    expect(race.full).toBe(1);
    expect(race.withRows).toBe(1);
    expect(race.held).toEqual([]);
    expect(raceLines(race).join("\n")).toContain("1 of the raced configs have censored rows");
    expect(state.configs["held"]!.labelFrom).toEqual({ kind: "race", night: DATES[2] });
    // The input of the row has no value, so it never counts for the config.
    expect(valueMaps(state).get("held")?.has(NEVER)).toBe(false);
    expect(labelLine(state.configs["held"]!)).toContain("1 censored inputs");
  });

  it("holds the config on the third night in a fault copy with no rule, which is the flip of the test above", () => {
    const state = aliveWithout(NEVER);
    missNight(state, DATES[0]!, [NEVER], false);
    missNight(state, DATES[1]!, [NEVER], false);
    raceNight(state, INPUTS, { date: DATES[2]!, ...RACE });
    const race = state.nights.at(-1)!.race!;
    expect(race.full).toBe(0);
    expect(race.withRows).toBeUndefined();
    expect(race.held?.[0]).toMatchObject({ config: "held", missing: 1 });
    expect(race.held?.[0]?.noRead).toBeUndefined();
  });

  it("does not count a night that did not plan the pair, and does not clear the count on that night", () => {
    const state = aliveWithout(NEVER);
    missNight(state, DATES[0]!, [NEVER]);
    missNight(state, DATES[1]!, []);
    expect(state.configs["held"]!.misses?.[NEVER]?.nights).toEqual([DATES[0]]);
    expect(state.configs["held"]!.censored).toBeUndefined();
    missNight(state, DATES[2]!, [NEVER]);
    expect(state.configs["held"]!.censored?.[NEVER]?.nights).toEqual([DATES[0], DATES[2]]);
  });

  it("clears the miss and the row when the pair gets a value", () => {
    const state = aliveWithout(NEVER);
    missNight(state, DATES[0]!, [NEVER]);
    missNight(state, DATES[1]!, [NEVER]);
    applyRecords(state, [record("held", NEVER, 0.5)], INPUTS, DATES[2]!);
    settleRows(state);
    expect(state.configs["held"]!.misses).toBeUndefined();
    expect(state.configs["held"]!.censored).toBeUndefined();
  });

  it("writes the lower bound of a stopped shard on the row, and the largest bound of the nights", () => {
    const state = aliveWithout(NEVER);
    const bound = (date: string, atLeastMs: number): void => {
      const night = nightOf(state, date);
      night.shards.push({ round: 2, shard: 0, planned: 1, real: 1, censored: { unit: "u", input: NEVER, configs: ["held"], atLeastMs, reason: "hard deadline" } });
      const units = [{ input: NEVER, configs: ["held"] }];
      noteLost(night, 2, units, lostPairs(state, units, [], new Set([`held|${NEVER}`])));
      noteMisses(state, night);
    };
    bound(DATES[0]!, 90_000);
    bound(DATES[1]!, 60_000);
    expect(state.configs["held"]!.censored?.[NEVER]).toMatchObject({ reason: "censored", atLeastMs: 90_000 });
    expect(censoredLines(state).join("\n")).toContain("| censored | 2026-11-10, 2026-11-11 | 1.5 min |");
  });

  it("gives no read to a config over the limit, and that config never reaches the race", () => {
    expect(censoredLimit(303)).toBe(2);
    expect(censoredLimit(12)).toBe(1);
    const [a, b] = [INPUTS[0]!.id, INPUTS[1]!.id];
    const state = aliveWithout(a, b);
    missNight(state, DATES[0]!, [a, b]);
    missNight(state, DATES[1]!, [a, b]);
    raceNight(state, INPUTS, { date: DATES[2]!, ...RACE });
    const race = state.nights.at(-1)!.race!;
    expect(race.full).toBe(0);
    expect(race.held?.[0]).toMatchObject({ config: "held", missing: 2, noRead: true });
    expect(race.held?.[0]?.reason).toContain("2 censored rows, so it reads no read");
    expect(labelLine(state.configs["held"]!, 2, true)).toMatch(/^no read, 2 censored inputs/);
    // A row at the limit stays a race, so the flip of the limit is the config above.
    delete state.configs["held"]!.censored![b];
    applyRecords(state, [record("held", b, 0.5)], INPUTS, DATES[2]!);
    raceNight(state, INPUTS, { date: "2026-11-13", ...RACE });
    expect(state.nights.at(-1)!.race!.full).toBe(1);
  });

  it("reads the screen share with the rows counted as absent, so the outcome of the screen does not move", () => {
    const state = stateWithAlive();
    const screen = INPUTS.filter((i) => i.seed === 1);
    state.configs["fresh"] = { status: "screened", config: { pack: "p", router: "r" }, first: "2026-11-09" } as unknown as (typeof state.configs)[string];
    state.values["fresh"] = INPUTS.map(() => null);
    // Each screen input has a censored row, so the plan owes nothing and the screen share still fails.
    state.configs["fresh"]!.censored = Object.fromEntries(screen.map((i) => [i.id, { input: i.id, tag: "censored", reason: "no-record", nights: DATES.slice(0, 2), atLeastMs: null }]));
    raceNight(state, INPUTS, { date: DATES[0]!, ...RACE });
    const race = state.nights.at(-1)!.race!;
    expect(race.raced).toBe(0);
    expect(race.held?.find((h) => h.config === "fresh")).toMatchObject({ status: "screened", missing: screen.length, noRead: true });
  });

  it("clears a row with no reference when the reference returns, so the plan has the pair again", () => {
    const state = aliveWithout(NEVER);
    state.reference[0] = null;
    missNight(state, DATES[0]!, [NEVER]);
    missNight(state, DATES[1]!, [NEVER]);
    expect(state.configs["held"]!.censored?.[NEVER]?.reason).toBe("no-reference");
    applyKept(state, [], DATES[2]!);
    expect(state.configs["held"]!.censored?.[NEVER]).toBeDefined();
    applyRecords(state, baselineIds().map((c) => record(c, NEVER, 0.5)), INPUTS, DATES[2]!);
    applyKept(state, [], DATES[2]!);
    expect(state.configs["held"]!.censored).toBeUndefined();
    expect(state.configs["held"]!.misses).toBeUndefined();
    raceNight(state, INPUTS, { date: DATES[2]!, ...RACE });
    expect(state.nights.at(-1)!.race!.held?.[0]).toMatchObject({ config: "held", missing: 1 });
  });

  it("gives a value from a kept record only after its reference returns, and no summary row", () => {
    const state = aliveWithout(NEVER);
    state.reference[0] = null;
    const kept = [{ record: record("held", NEVER, 0.5) }, { record: record("not-a-config", NEVER, 0.5) }];
    expect(applyKept(state, kept, DATES[0]!)).toBe(0);
    expect(nightOf(state, DATES[0]!).kept).toBeUndefined();
    applyRecords(state, baselineIds().map((c) => record(c, NEVER, 0.5)), INPUTS, DATES[0]!);
    const rows = state.summary.length;
    expect(applyKept(state, kept, DATES[0]!)).toBe(1);
    expect(state.values["held"]![0]).toBeTypeOf("number");
    expect(nightOf(state, DATES[0]!).kept).toBe(1);
    expect(state.summary).toHaveLength(rows);
    // A second read gives nothing, because the value stands.
    expect(applyKept(state, kept, DATES[1]!)).toBe(0);
  });

  it("gives no value from a kept record to a config that the race dropped", () => {
    const state = aliveWithout(NEVER);
    state.configs["held"]!.status = "dropped";
    expect(applyKept(state, [{ record: record("held", NEVER, 0.5) }], DATES[0]!)).toBe(0);
  });

  it("keeps a baseline config out of the rule", () => {
    const state = aliveWithout(NEVER);
    const [base] = baselineIds();
    const night = nightOf(state, DATES[0]!);
    night.pending = [`${base}|${NEVER}`];
    noteMisses(state, night);
    expect(state.configs[base!]!.misses).toBeUndefined();
  });
});

describe("a plan cannot hold a config for ever because of its cost (L116)", () => {
  /** This function gives a state with 3 real alive configs with no values, and the planned cost of the first of the rotation. Configs with no date and no mean have the order of their ids. */
  function threeAlive(inputs: readonly SweepInput[] = INPUTS): { state: ReturnType<typeof emptyState>; ids: string[]; costOfFirst: number } {
    const state = emptyState("test", "test", inputs);
    const first = planRound1(state, inputs, { ...OPTIONS, maxShards: 4 });
    const base = new Set(baselineIds());
    applyRecords(state, first.plan.units.flatMap((u) => u.configs.filter((c) => base.has(c)).map((c) => record(c, u.input, 0.5))), INPUTS, OPTIONS.date);
    const ids = Object.keys(first.configs).filter((id) => !base.has(id)).slice(0, 3).sort();
    for (const id of Object.keys(state.configs)) if (state.configs[id]!.status === "screened") state.configs[id]!.status = ids.includes(id) ? "alive" : "dropped";
    const run = configRun(state.configs[ids[0]!]!.config);
    return { state, ids, costOfFirst: inputs.reduce((s, i) => s + jobCost(run, i), 0) };
  }

  it("runs the first config that does not fit in part, and counts the rest as waiting", () => {
    const { state, ids, costOfFirst } = threeAlive();
    const target = costOfFirst / 2 / SWEEP_FILL;
    const plan = planRound2(state, INPUTS, { ...OPTIONS, date: "2026-10-30", target, maxShards: 1, maxConfigs: 0, maxUnit: target });
    const jobsOf = (id: string): number => plan.plan.units.filter((u) => u.configs.includes(id)).length;
    const planned = ids.map(jobsOf);
    const inPart = planned.filter((n) => n > 0 && n < INPUTS.length);
    // takeBudget alone, the fault copy of this plan, gives 0 jobs here, because the first config does not fit.
    expect(takeBudget([ids[0]], () => costOfFirst, target * SWEEP_FILL).taken).toEqual([]);
    expect(inPart).toHaveLength(1);
    expect(planned.filter((n) => n === 0)).toHaveLength(2);
    const waiting = nightOf(state, "2026-10-30").waiting?.[2];
    expect(waiting?.configs).toBe(3);
    expect(waiting?.pairs).toBe(INPUTS.length * 3 - inPart[0]!);
    expect(waitingLine(nightOf(state, "2026-10-30"))).toContain(`round 2: 3 configs, ${waiting?.pairs} pairs`);
  });

  it("moves the date of a config in part, so the configs behind it come first on the next night", () => {
    const { state, ids, costOfFirst } = threeAlive();
    const target = costOfFirst / 2 / SWEEP_FILL;
    const options = { ...OPTIONS, target, maxShards: 1, maxConfigs: 0, maxUnit: target };
    const first = planRound2(state, INPUTS, { ...options, date: "2026-10-30" });
    const took = ids.filter((id) => first.plan.units.some((u) => u.configs.includes(id)));
    expect(took).toHaveLength(1);
    applyRecords(state, first.plan.units.flatMap((u) => u.configs.map((c) => record(c, u.input, 0.5))), INPUTS, "2026-10-30");
    const second = planRound2(state, INPUTS, { ...options, date: "2026-10-31" });
    const next = ids.filter((id) => second.plan.units.some((u) => u.configs.includes(id)));
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(took);
  });

  it("reads not read on a night from before the field", () => {
    expect(waitingLine({})).toBe("Waiting for the budget: not read.");
  });

  /** This function gives a state with an alive config whose pairs each cost more than the first pair of the 2 cheapest configs. It also gives a budget between those costs. */
  function oneDear(): { state: ReturnType<typeof emptyState>; dear: string; cheap: string[]; target: number } {
    const state = emptyState("test", "test", INPUTS);
    const first = planRound1(state, INPUTS, { ...OPTIONS, maxShards: 4 });
    const base = new Set(baselineIds());
    applyRecords(state, first.plan.units.flatMap((u) => u.configs.filter((c) => base.has(c)).map((c) => record(c, u.input, 0.5))), INPUTS, OPTIONS.date);
    const dearest = (id: string): number => Math.min(...INPUTS.map((i) => jobCost(configRun(state.configs[id]!.config), i)));
    const sorted = Object.keys(first.configs).filter((id) => !base.has(id)).sort((a, b) => dearest(b) - dearest(a) || (a < b ? -1 : 1));
    const dear = sorted[0]!;
    const cheap = sorted.slice(-2);
    for (const id of Object.keys(state.configs)) if (state.configs[id]!.status === "screened") state.configs[id]!.status = id === dear || cheap.includes(id) ? "alive" : "dropped";
    const firstOf = (id: string): number => jobCost(configRun(state.configs[id]!.config), INPUTS[0]!);
    return { state, dear, cheap, target: (dearest(dear) + Math.max(...cheap.map(firstOf))) / 2 / SWEEP_FILL };
  }

  it("skips a config with no pair that fits, plans the next config, and counts the pairs over the budget", () => {
    const { state, dear, cheap, target } = oneDear();
    // A config with no date is the oldest, so the 2 cheap configs need a date for the dear config to be the head.
    state.configs[dear]!.ran = "2026-01-01";
    for (const id of cheap) state.configs[id]!.ran = "2026-10-20";
    const plan = planRound2(state, INPUTS, { ...OPTIONS, date: "2026-10-30", target, maxShards: 1, maxConfigs: 0, maxUnit: target });
    const planned = new Set(plan.plan.units.flatMap((u) => u.configs));
    expect(planned.has(dear)).toBe(false);
    // takeBudget alone stops at the first config, the fault copy of this plan, and plans no config.
    expect(cheap.some((id) => planned.has(id))).toBe(true);
    expect(state.configs[dear]!.waited).toEqual(["2026-10-30"]);
    const waiting = nightOf(state, "2026-10-30").waiting?.[2];
    expect(waiting?.overBudgetPairs).toBeGreaterThanOrEqual(INPUTS.length);
    expect(waiting?.overBudgetInputs).toBe(INPUTS.length);
    expect(waitAgeLines(state).join("\n")).toContain(`| \`${dear}\` | alive | 1 | 2026-10-30 |`);
  });

  it("moves on to the next pair when a pair of a config does not fit", () => {
    const mixed = INPUTS.map((i, n) => (n === 0 ? { ...i, boxes: 2000, edges: 1999 } : i));
    const { state, ids } = threeAlive(mixed);
    const run = configRun(state.configs[ids[0]!]!.config);
    const [big, small] = [jobCost(run, mixed[0]!), jobCost(run, mixed[1]!)];
    expect(big).toBeGreaterThan(small);
    const budget = (big + small) / 2;
    for (const id of ids.slice(1)) state.configs[id]!.ran = "2026-10-20";
    const plan = planRound2(state, mixed, { ...OPTIONS, date: "2026-10-30", target: budget / SWEEP_FILL, maxShards: 1, maxConfigs: 0, maxUnit: budget / SWEEP_FILL });
    const inputsOf = plan.plan.units.filter((u) => u.configs.includes(ids[0]!)).map((u) => u.input);
    expect(inputsOf.length).toBeGreaterThan(0);
    expect(inputsOf).not.toContain(mixed[0]!.id);
    // takeBudget stops at the first pair, the fault copy of this plan, and takes no pair.
    expect(takeBudget(mixed, (i) => jobCost(run, i), budget).taken).toEqual([]);
    expect(takeFitting(mixed, (i) => jobCost(run, i), budget).taken.length).toBe(inputsOf.length);
  });

  it("orders the configs past the limit by their age and then by id, and not by their means", () => {
    const { state, ids } = threeAlive();
    const costs = ids.map((id) => INPUTS.reduce((s, i) => s + jobCost(configRun(state.configs[id]!.config), i), 0));
    const target = Math.min(...costs) / 2 / SWEEP_FILL;
    const options = { ...OPTIONS, target, maxShards: 1, maxConfigs: 0, maxUnit: target, date: "2026-10-30" };
    const nights = (n: number): string[] => Array.from({ length: n }, (_, i) => `2026-10-1${i}`);
    state.configs[ids[0]!]!.mean = 0.1;
    state.configs[ids[1]!]!.mean = 0.9;
    state.configs[ids[2]!]!.mean = 0.5;
    const plannedOf = (s: typeof state): string[] => {
      const units = planRound2(s, INPUTS, options).plan.units;
      return ids.filter((id) => units.some((u) => u.configs.includes(id)));
    };
    const equal = JSON.parse(JSON.stringify(state)) as typeof state;
    for (const id of ids) equal.configs[id]!.waited = nights(WAIT_BOUND);
    // One age: the first id, although its mean is the smallest. The sort of the means alone gives the second id.
    expect(plannedOf(equal)).toEqual([ids[0]]);
    const longer = JSON.parse(JSON.stringify(state)) as typeof state;
    for (const id of ids) longer.configs[id]!.waited = nights(WAIT_BOUND);
    longer.configs[ids[2]!]!.waited = nights(WAIT_BOUND + 1);
    expect(plannedOf(longer)).toEqual([ids[2]]);
  });

  it("states the open configs at the end of an epoch, and no line after the first night", () => {
    const { state, ids } = threeAlive();
    expect(epochEnd(state)).toEqual({ epoch: "test", open: 3, leftOut: 0 });
    // An epoch from before the field has no read of the plans.
    const older = JSON.parse(JSON.stringify(state)) as typeof state;
    for (const n of older.nights) delete n.waiting;
    expect(epochEnd(older).leftOut).toBeNull();
    const target = INPUTS.reduce((s, i) => s + jobCost(configRun(state.configs[ids[0]!]!.config), i), 0) / 2 / SWEEP_FILL;
    planRound2(state, INPUTS, { ...OPTIONS, date: "2026-10-30", target, maxShards: 1, maxConfigs: 0, maxUnit: target });
    const end = epochEnd(state);
    expect(end.open).toBe(3);
    expect(end.leftOut).toBeGreaterThan(0);
    expect(epochEndLines({ epochBefore: { epoch: "old", open: 3, leftOut: null } })[0]).toBe("The epoch `old` ended with 3 open configs, and a plan left out a count not read of them. A new epoch carries no config and no age.");
    expect(epochEndLines({})).toEqual([]);
  });

  it("brings a config past the limit to the head of the plan, against the order of the dates, and a fault copy with no rule stays behind", () => {
    const { state, ids, costOfFirst } = threeAlive();
    const target = costOfFirst / 2 / SWEEP_FILL;
    const options = { ...OPTIONS, target, maxShards: 1, maxConfigs: 0, maxUnit: target, date: "2026-10-30" };
    const [old, recent] = [ids[0]!, ids[1]!];
    state.configs[old]!.ran = "2026-10-01";
    state.configs[recent]!.ran = "2026-10-20";
    state.configs[ids[2]!]!.ran = "2026-10-21";
    const copy = JSON.parse(JSON.stringify(state)) as typeof state;
    state.configs[recent]!.waited = Array.from({ length: WAIT_BOUND }, (_, i) => `2026-10-2${i + 2}`);
    const first = (s: typeof state): string => planRound2(s, INPUTS, options).plan.units.flatMap((u) => u.configs)[0]!;
    expect(first(state)).toBe(recent);
    expect(state.configs[recent]!.waited).toBeUndefined();
    // The fault copy: the same dates, and one night under the limit.
    copy.configs[recent]!.waited = Array.from({ length: WAIT_BOUND - 1 }, (_, i) => `2026-10-2${i + 2}`);
    expect(first(copy)).toBe(old);
  });

  it("reads no read past the limit with no plan, and a config under the limit reads held", () => {
    const { state, ids } = threeAlive();
    const held = (id: string) => {
      raceNight(state, INPUTS, { date: OPTIONS.date });
      return state.nights.at(-1)!.race?.held?.find((h) => h.config === id);
    };
    state.configs[ids[0]!]!.waited = Array.from({ length: WAIT_BOUND }, (_, i) => `2026-10-2${i}`);
    expect(held(ids[0]!)?.noRead).toBeUndefined();
    state.configs[ids[0]!]!.waited = Array.from({ length: WAIT_BOUND + 1 }, (_, i) => `2026-10-2${i}`);
    const past = held(ids[0]!);
    expect(past?.noRead).toBe(true);
    expect(past?.reason).toContain(`a plan left it out on ${WAIT_BOUND + 1} nights`);
    expect(labelLine(state.configs[ids[0]!]!, past?.missing ?? 0, true)).toContain(`no read, left out of the plan on ${WAIT_BOUND + 1} nights`);
  });

  it("does not add a second date in one night, and counts a round where a backlog gave no fresh configs", () => {
    const { state, ids, costOfFirst } = threeAlive();
    const target = costOfFirst / 2 / SWEEP_FILL;
    const options = { ...OPTIONS, target, maxShards: 1, maxConfigs: 0, maxUnit: target, date: "2026-10-30" };
    planRound2(state, INPUTS, options);
    planRound2(state, INPUTS, options);
    const left = ids.filter((id) => state.configs[id]!.waited !== undefined);
    expect(left.length).toBeGreaterThan(0);
    for (const id of left) expect(state.configs[id]!.waited).toEqual(["2026-10-30"]);
    expect(nightOf(state, "2026-10-30").waiting?.[2]?.noFresh).toBe(true);
    expect(waitAgeLines(state)[0]).toBe("Rounds of this epoch where a backlog gave no fresh configs: 1.");
    expect(waitingLine(nightOf(state, "2026-10-30"))).toContain("no fresh configs");
  });

  it("gives the plain lines with no wait", () => {
    expect(waitAgeLines(emptyState("test", "test", INPUTS))).toEqual(["Rounds of this epoch where a backlog gave no fresh configs: 0.", "Configs that a plan left out: 0."]);
  });
});
