import { describe, expect, it } from "vitest";
import { SHARD_CASE, stopFlipFindings, stoppedShard, wholeLines, type ShardFile, type StopFlipFacts, type StopFlipRun, type StopPlan } from "./shard-stop.ts";

const PLAN: StopPlan = {
  round: 1,
  loads: [120000],
  shards: [["u0", "u1"]],
  units: [
    { id: "u0", input: "i0", configs: ["a", "b"] },
    { id: "u1", input: "i1", configs: ["a", "b", "c"] },
  ],
};
const line = (strategy: string, input: string): string => `${JSON.stringify({ strategy, input })}\n`;
const IN_U1: ShardFile = { round: 1, shard: 0, planned: 2, real: 10, stopped: true, done: 1, units: 2, plannedDone: 1, unitAt: 700_000 };
const STOP = { startedAt: 100_000, at: 1_300_000, reason: "hard deadline" } as const;

describe("wholeLines", () => {
  it("keeps the text up to the last line end", () => {
    expect(wholeLines('{"a":1}\n{"b"')).toBe('{"a":1}\n');
    expect(wholeLines('{"a":1}\n')).toBe('{"a":1}\n');
    expect(wholeLines('{"b"')).toBe("");
    expect(wholeLines("")).toBe("");
  });
});

describe("the name of the supervised case", () => {
  it("is one id for the whole shard", () => {
    expect(SHARD_CASE).toBe("shard");
  });
});

describe("stoppedShard", () => {
  it("writes the censored row of the unit in progress, with the configs that have no record", () => {
    const records = line("a", "i0") + line("b", "i0") + line("a", "i1");
    const out = stoppedShard(PLAN, 0, IN_U1, records, STOP);
    expect(out.censored).toEqual({ unit: "u1", input: "i1", configs: ["b", "c"], atLeastMs: 600_000, reason: "hard deadline" });
    expect(out.elapsedMinutes).toBe(20);
  });

  it("keeps the real minutes of the units that ended, so the cost history reads the same units", () => {
    const out = stoppedShard(PLAN, 0, IN_U1, "", STOP);
    expect(out.real).toBe(10);
    expect(out.plannedDone).toBe(1);
    expect(out.done).toBe(1);
  });

  it("reads a cut last line as no record", () => {
    const out = stoppedShard(PLAN, 0, IN_U1, `${line("a", "i1")}{"strategy":"b","inp`, STOP);
    expect(out.censored?.configs).toEqual(["b", "c"]);
  });

  it("gives a file with no stop back as it is, because no unit is in progress", () => {
    const file: ShardFile = { round: 1, shard: 0, planned: 2, real: 30 };
    expect(stoppedShard(PLAN, 0, file, "", STOP)).toBe(file);
  });

  it("writes a row when the child ended before its first write, with no time for the unit", () => {
    const out = stoppedShard(PLAN, 0, null, "", { ...STOP, reason: "child failed" });
    expect(out.stopped).toBe(true);
    expect(out.done).toBe(0);
    expect(out.planned).toBe(2);
    expect(out.real).toBe(0);
    expect(out.censored).toEqual({ unit: "u0", input: "i0", configs: ["a", "b"], atLeastMs: 0, reason: "child failed" });
  });

  it("finds the unit in progress from the records when the file is lost", () => {
    const records = line("a", "i0") + line("b", "i0") + line("a", "i1");
    expect(stoppedShard(PLAN, 0, null, records, STOP).censored?.unit).toBe("u1");
  });

  it("gives no row when each unit has ended", () => {
    const done: ShardFile = { ...IN_U1, done: 2 };
    expect(stoppedShard(PLAN, 0, done, "", STOP).censored).toBeUndefined();
  });

  it("does not give a lower bound under 0 when the clock of the stop is behind the unit", () => {
    expect(stoppedShard(PLAN, 0, IN_U1, "", { ...STOP, at: 600_000 }).censored?.atLeastMs).toBe(0);
  });
});

describe("stopFlipFindings", () => {
  const FACTS: StopFlipFacts = { fast: "fast", slow: "slow", input: "i", limitMinutes: 4 };
  const row = { unit: "u", input: "i", configs: ["slow"], atLeastMs: 60_000, reason: "hard deadline" } as const;
  const fault: StopFlipRun = { code: 0, minutes: 2.1, recordText: line("fast", "i"), shard: { round: 1, shard: 0, planned: 1, real: 0, stopped: true, censored: row } };
  const clean: StopFlipRun = { code: 0, minutes: 0.5, recordText: line("fast", "i"), shard: { round: 1, shard: 0, planned: 1, real: 0.1 } };

  it("passes when the fault copy stops and the no-fault copy does not", () => {
    expect(stopFlipFindings(fault, clean, FACTS)).toEqual([]);
  });

  // Each row is one fault that the flip must see: a record lost, a row not written, a job that reached its limit, or a stop with no cause.
  const cases: readonly (readonly [string, StopFlipRun, StopFlipRun, string])[] = [
    ["a lost record", { ...fault, recordText: "" }, clean, "lost the record"],
    ["no censored row", { ...fault, shard: { round: 1, shard: 0, planned: 1, real: 0, stopped: true } }, clean, "no censored row"],
    ["no stop on the shard file", { ...fault, shard: { round: 1, shard: 0, planned: 1, real: 0, censored: row } }, clean, "does not read stopped"],
    ["a slow config that ended", { ...fault, recordText: line("fast", "i") + line("slow", "i") }, clean, "tested no stop"],
    ["a run that reached its limit", { ...fault, minutes: 4 }, clean, "its limit is 4"],
    ["a failed exit", { ...fault, code: 1 }, clean, "the code 1"],
    ["another config in the row", { ...fault, shard: { round: 1, shard: 0, planned: 1, real: 0, stopped: true, censored: { ...row, configs: ["fast"] } } }, clean, "not slow"],
    ["another reason in the row", { ...fault, shard: { round: 1, shard: 0, planned: 1, real: 0, stopped: true, censored: { ...row, reason: "child failed" } } }, clean, "child failed"],
    ["no lower bound in the row", { ...fault, shard: { round: 1, shard: 0, planned: 1, real: 0, stopped: true, censored: { ...row, atLeastMs: 0 } } }, clean, "lower bound 0"],
    ["a stop in the no-fault copy", fault, { ...clean, shard: { round: 1, shard: 0, planned: 1, real: 0, stopped: true } }, "no-fault copy reads stopped"],
    ["a row in the no-fault copy", fault, { ...clean, shard: { round: 1, shard: 0, planned: 1, real: 0, censored: row } }, "no-fault copy has a censored row"],
    ["a lost record in the no-fault copy", fault, { ...clean, recordText: "" }, "no record of fast"],
    ["no shard file in the no-fault copy", fault, { ...clean, shard: null }, "no shard file"],
    ["a failed exit of the no-fault copy", fault, { ...clean, code: 2 }, "the code 2"],
    ["a no-fault copy that reached the limit", fault, { ...clean, minutes: 9 }, "its limit is 4"],
  ];
  it.each(cases)("finds %s", (_name, badFault, badClean, words) => {
    expect(stopFlipFindings(badFault, badClean, FACTS).join(" ")).toContain(words);
  });
});
