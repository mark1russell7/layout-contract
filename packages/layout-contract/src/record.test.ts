import { describe, expect, it } from "vitest";
import { checkLayoutRecord, parseLayoutRecord, type LayoutRecord, type RunEnv } from "./record.ts";

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
  });
});
