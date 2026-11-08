import { describe, expect, it } from "vitest";
import { carryRecord, checkLayoutRecord, parseLayoutRecord, type LayoutRecord, type RunEnv } from "./record.ts";

const env: RunEnv = { node: "v24.0.0", os: "linux", arch: "x64", runner: "ubuntu-latest", cpu: "AMD EPYC 7763", cpus: 4 };

const run: LayoutRecord = {
  schema: "layout-record/1",
  stage: "joint",
  step: "joint",
  strategy: "rows+corners",
  options: { pack: "rows" },
  corpus: "joint-v1",
  input: "joint-v1/p/s1",
  inputHash: "979d6f758b35b32e",
  set: "joint-v1",
  seed: 1,
  nodes: 3,
  edges: 2,
  measures: { "pack.fill": 0.5 },
  hard: { "pack.no-overlap": 0 },
  tolerance: { overlap: 0.001 },
  deterministic: true,
  ms: 1.8,
  msRuns: [1.7, 1.8, 1.9],
  outputHash: "3fce85d3fce85d00",
  env,
  commit: "3fce85d",
};

const skipped: LayoutRecord = { ...run, measures: {}, hard: {}, deterministic: null, ms: 0, skipped: "error: no" };

/** This function gives the record as one line of JSON Lines gives it back. */
const line = (record: unknown): unknown => JSON.parse(JSON.stringify(record));

describe("parseLayoutRecord", () => {
  it("reads a run record with a boolean deterministic", () => {
    expect(checkLayoutRecord(line(run))).toEqual([]);
    expect(parseLayoutRecord(line(run))).toEqual(run);
    expect(parseLayoutRecord(line({ ...run, deterministic: false })).deterministic).toBe(false);
  });

  it("reads a skipped record with deterministic null", () => {
    expect(checkLayoutRecord(line(skipped))).toEqual([]);
    expect(parseLayoutRecord(line(skipped))).toEqual(skipped);
  });

  it("reads an old skipped record with deterministic true, and gives null in its place", () => {
    const old = line({ ...skipped, deterministic: true });
    expect(checkLayoutRecord(old)).toEqual([]);
    const record = parseLayoutRecord(old);
    expect(record.deterministic).toBeNull();
    expect(record).toEqual(skipped);
    expect((old as LayoutRecord).deterministic).toBe(true);
  });

  it("keeps env.mode and env.context through a write and a read", () => {
    const timed: LayoutRecord = { ...run, env: { ...env, mode: "fresh", context: "ci --expose-gc" } };
    const record = parseLayoutRecord(line(timed));
    expect(record.env).toEqual({ ...env, mode: "fresh", context: "ci --expose-gc" });
    expect(record).toEqual(timed);
  });

  it("reads an env without mode and context", () => {
    expect(parseLayoutRecord(line(run)).env).toEqual(env);
  });

  it("keeps fields that the format does not know", () => {
    const extra = { ...line(run) as object, trace: { id: "t", measures: { "move.powerEdge": 2 } } };
    expect(parseLayoutRecord(extra)).toEqual(extra);
  });

  it("refuses a wrong type of deterministic", () => {
    expect(checkLayoutRecord(line({ ...run, deterministic: null }))).toEqual(["deterministic is not a boolean, and the record has no skipped"]);
    expect(checkLayoutRecord(line({ ...run, deterministic: "yes" }))).toEqual(["deterministic is not a boolean, and the record has no skipped"]);
    expect(checkLayoutRecord(line({ ...skipped, deterministic: 1 }))).toEqual(["deterministic of a skipped record is not null or a boolean"]);
    expect(() => parseLayoutRecord(line({ ...run, deterministic: null }))).toThrow(TypeError);
  });

  it("refuses a wrong type of env.mode, env.context and the other env fields", () => {
    expect(checkLayoutRecord(line({ ...run, env: { ...env, mode: 1 } }))).toEqual(["env.mode is not a string"]);
    expect(checkLayoutRecord(line({ ...run, env: { ...env, context: false } }))).toEqual(["env.context is not a string"]);
    expect(checkLayoutRecord(line({ ...run, env: { ...env, cpus: "4" } }))).toEqual(["env.cpus is not a number"]);
    expect(checkLayoutRecord(line({ ...run, env: "linux" }))).toEqual(["env is not an object"]);
    expect(() => parseLayoutRecord(line({ ...run, env: { ...env, mode: 1 } }))).toThrow(/env\.mode is not a string/);
  });

  it("refuses a wrong type of the other fields", () => {
    expect(checkLayoutRecord(null)).toEqual(["the record is not an object"]);
    expect(checkLayoutRecord([run])).toEqual(["the record is not an object"]);
    expect(checkLayoutRecord(line({ ...run, schema: "layout-record/2" }))).toEqual(["schema is not layout-record/1"]);
    expect(checkLayoutRecord(line({ ...run, stage: "draw" }))).toEqual(["stage is not pack, route or joint"]);
    expect(checkLayoutRecord(line({ ...run, seed: "1" }))).toEqual(["seed is not a number"]);
    expect(checkLayoutRecord(line({ ...run, strategy: 2 }))).toEqual(["strategy is not a string"]);
    expect(checkLayoutRecord(line({ ...run, skipped: 2 }))).toEqual(["skipped is not a string"]);
    expect(checkLayoutRecord(line({ ...run, options: [] }))).toEqual(["options is not an object"]);
    expect(checkLayoutRecord(line({ ...run, measures: { "pack.fill": "0.5" } }))).toEqual(["measures.pack.fill is not a number"]);
    expect(checkLayoutRecord(line({ ...run, hard: 0 }))).toEqual(["hard is not an object"]);
    expect(checkLayoutRecord(line({ ...run, tolerance: { overlap: "x" } }))).toEqual(["tolerance.overlap is not a number"]);
    expect(checkLayoutRecord(line({ ...run, shapes: ["hexagon"] }))).toEqual(["shapes is not a list of shape kinds"]);
    expect(checkLayoutRecord(line({ ...run, msRuns: [1, "2"] }))).toEqual(["msRuns is not a list of numbers"]);
    expect(checkLayoutRecord(line({ ...run, oneRun: 1 }))).toEqual(["oneRun is not a boolean"]);
    expect(checkLayoutRecord(line({ ...run, budgetMs: "30000" }))).toEqual(["budgetMs is not a number"]);
    expect(checkLayoutRecord(line({ ...run, msAtLeast: "30000" }))).toEqual(["msAtLeast is not a number"]);
    expect(checkLayoutRecord(line({ ...run, because: "a@10" }))).toEqual(["because is not a list of strings"]);
    expect(checkLayoutRecord(line({ ...run, because: ["a@10", 2] }))).toEqual(["because is not a list of strings"]);
  });

  it("accepts null on a one-run record only", () => {
    expect(checkLayoutRecord(line({ ...run, oneRun: true, deterministic: null }))).toEqual([]);
    const refused = ["deterministic is not a boolean, and the record has no skipped"];
    expect(checkLayoutRecord(line({ ...run, oneRun: false, deterministic: null }))).toEqual(refused);
    expect(checkLayoutRecord(line({ ...run, deterministic: null }))).toEqual(refused);
    expect(checkLayoutRecord(line({ ...run, oneRun: true, deterministic: "yes" }))).toEqual(refused);
  });

  it("accepts the fields of a wall budget", () => {
    expect(checkLayoutRecord(line({ ...run, oneRun: true }))).toEqual([]);
    expect(checkLayoutRecord(line({ ...run, oneRun: false }))).toEqual([]);
    expect(checkLayoutRecord(line({ ...run, measures: {}, deterministic: null, skipped: "over budget", budgetMs: 30000, msAtLeast: 30000 }))).toEqual([]);
    expect(checkLayoutRecord(line({ ...run, measures: {}, deterministic: null, skipped: "not run", budgetMs: 30000, because: ["a@10", "b@10"] }))).toEqual([]);
  });
});

describe("carried", () => {
  const from = { packing: "0.10.2", highways: "0.15.0" };
  const to = { packing: "0.10.5", highways: "0.15.2" };
  const fingerprints = { rows: "0123456789abcdef", corners: "fedcba9876543210" };
  const carried = { from, to, fingerprints, run: "42428038369" };

  it("accepts a record with the facts of a carry", () => {
    expect(checkLayoutRecord(JSON.parse(JSON.stringify({ ...run, carried })))).toEqual([]);
    const { run: _run, ...noRun } = carried;
    expect(checkLayoutRecord({ ...run, carried: noRun })).toEqual([]);
  });

  it("refuses each bad form of the facts of a carry", () => {
    expect(checkLayoutRecord({ ...run, carried: "yes" })).toEqual(["carried is not an object"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, from: { packing: 10 } } })).toEqual(["carried.from is not a map of strings"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, to: [] } })).toEqual(["carried.to is not a map of strings"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, run: 1 } })).toEqual(["carried.run is not a string"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, to: { packing: "0.10.5" } } })).toEqual(["carried.from and carried.to do not name the same engines"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, from: {}, to: {} } })).toEqual(["carried.from and carried.to do not name the same engines"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, to: from } })).toEqual(["carried.to has no other version than carried.from"]);
    expect(checkLayoutRecord({ ...run, carried: { ...carried, fingerprints: {} } })).toEqual(["carried.fingerprints is empty"]);
    expect(checkLayoutRecord({ ...skipped, carried })).toEqual(["a skipped record has carried"]);
  });

  it("carries a record, and a second carry keeps the versions and the run of the measure", () => {
    const once = carryRecord(run, { from, to, fingerprints, run: "42428038369" });
    expect(once).toEqual({ ...run, carried });
    expect(checkLayoutRecord(once)).toEqual([]);
    const next = { packing: "0.10.6", highways: "0.15.2" };
    const twice = carryRecord(once, { from: to, to: next, fingerprints, run: "42500000000" });
    expect(twice.carried).toEqual({ from, to: next, fingerprints, run: "42428038369" });
    expect(twice.measures).toBe(run.measures);
    expect(twice.outputHash).toBe(run.outputHash);
  });

  it("refuses a skipped record, a first carry with no from, and a carry with no change of version", () => {
    expect(() => carryRecord(skipped, { from, to, fingerprints })).toThrow(/is skipped, so a run measures it again/);
    expect(() => carryRecord(run, { to, fingerprints })).toThrow(/has no carried.from/);
    expect(() => carryRecord(run, { from, to: from, fingerprints })).toThrow(/carried.to has no other version than carried.from/);
    expect(() => carryRecord(run, { from, to: { packing: "0.10.5" }, fingerprints })).toThrow(/do not name the same engines/);
    expect(() => carryRecord(run, { from, to, fingerprints: {} })).toThrow(/carried.fingerprints is empty/);
  });
});
