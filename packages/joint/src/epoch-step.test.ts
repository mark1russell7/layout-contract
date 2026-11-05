import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { epochStep, hashesOfState, inputListHash, LEGACY_INPUT_LISTS, spaceOfEpoch, type StepSide, stepValuesOf } from "./epoch-step.ts";

const OLD = "joint-v2_packing-0.4.1_highways-0.10.0_space-bench-3";
const NEW = "joint-v2_packing-0.6.1_highways-0.13.0_space-bench-3";
const pick = (fill: number, hard = 100, crossings = 1000): Record<string, number> => ({ "joint.fill": fill, hard, "joint.straight.crossings": crossings });
const side = (epoch: string, fill: number, over: Partial<StepSide> = {}): StepSide => ({
  epoch,
  inputs: ["a", "b"],
  hashes: ["ha", "hb"],
  baseline: ["c1", "c2"],
  reference: [
    [pick(fill), pick(fill)],
    [pick(fill), pick(fill)],
  ],
  ...over,
});

describe("epochStep", () => {
  it("gives the ratio of each raw metric over each pair", () => {
    const step = epochStep(side(OLD, 0.5), side(NEW, 0.6));
    expect(step.pairs).toBe(4);
    expect(step.metrics["joint.fill"]).toMatchObject({ n: 4, median: expect.closeTo(1.2, 9) });
    expect(step.metrics["hard"]?.median).toBe(1);
    expect(step.dropped).toEqual({ space: 0, input: 0, hash: 0, config: 0, missing: 0 });
  });

  it("drops a pair of another input hash, and a hash with no proof", () => {
    const step = epochStep(side(OLD, 0.5, { hashes: ["ha", null] }), side(NEW, 0.6));
    expect(step.pairs).toBe(2);
    expect(step.dropped.hash).toBe(2);
    expect(epochStep(side(OLD, 0.5), side(NEW, 0.6, { hashes: ["other", "hb"] })).dropped.hash).toBe(2);
  });

  it("drops a pair of an unknown input or config, and each pair of another bench space", () => {
    expect(epochStep(side(OLD, 0.5), side(NEW, 0.6, { inputs: ["a", "z"] })).dropped.input).toBe(2);
    expect(epochStep(side(OLD, 0.5), side(NEW, 0.6, { baseline: ["c1", "c9"] })).dropped.config).toBe(2);
    const other = epochStep(side(OLD, 0.5), side(NEW.replace("bench-3", "bench-4"), 0.6));
    expect(other).toMatchObject({ pairs: 0, dropped: { space: 4 }, metrics: { hard: { n: 0 } } });
  });

  it("counts a pair with no value, and takes no ratio over an old value of zero", () => {
    const step = epochStep(side(OLD, 0, { reference: [null, [pick(0), null]] }), side(NEW, 0.6));
    expect(step).toMatchObject({ pairs: 1, dropped: { missing: 3 } });
    expect(step.metrics["joint.fill"]?.n).toBe(0);
    expect(step.metrics["hard"]?.n).toBe(1);
  });
});

/** This function gives the route values of each pair of a side. */
const routed = (values: Record<string, number>): Partial<StepSide> => ({
  stepValues: [
    [values, values],
    [values, values],
  ],
});
const ROUTES = { "route.detour.mean": 1.2, "route.detour.q95": 2, "route.crossings": 10 };

describe("the route values of a step", () => {
  it("gives a ratio only when both sides have the value", () => {
    const step = epochStep(side(OLD, 0.5, routed(ROUTES)), side(NEW, 0.5, routed({ ...ROUTES, "route.detour.mean": 1.8, "route.crossings": 5 })));
    expect(step.routes["route.detour.mean"]?.ratio).toMatchObject({ n: 4, median: expect.closeTo(1.5, 9) });
    expect(step.routes["route.detour.q95"]?.ratio?.median).toBe(1);
    expect(step.routes["route.crossings"]).toMatchObject({ ratio: { n: 4, median: 0.5 }, noOld: 0, noNew: 0, oldZero: 0, mixed: 0 });
  });

  it("reads no old value on a side with no field, and no ratio takes its place", () => {
    const step = epochStep(side(OLD, 0.5), side(NEW, 0.5, routed(ROUTES)));
    expect(step.pairs).toBe(4);
    for (const metric of Object.values(step.routes)) expect(metric).toEqual({ ratio: null, noOld: 4, noNew: 0, oldZero: 0, mixed: 0 });
  });

  it("counts no new value apart from no old value", () => {
    const step = epochStep(side(OLD, 0.5, routed(ROUTES)), side(NEW, 0.5));
    expect(step.routes["route.crossings"]).toEqual({ ratio: null, noOld: 0, noNew: 4, oldZero: 0, mixed: 0 });
  });

  it("does not divide by an old value of zero", () => {
    const step = epochStep(side(OLD, 0.5, routed({ ...ROUTES, "route.crossings": 0 })), side(NEW, 0.5, routed(ROUTES)));
    expect(step.routes["route.crossings"]).toEqual({ ratio: null, noOld: 0, noNew: 0, oldZero: 4, mixed: 0 });
  });

  it("gives no ratio of an estimate over a full count, and a ratio of two estimates", () => {
    const sampled = { ...ROUTES, "route.crossings.estimated": 1 };
    const mixed = epochStep(side(OLD, 0.5, routed({ ...ROUTES, "route.crossings.estimated": 0 })), side(NEW, 0.5, routed(sampled)));
    expect(mixed.routes["route.crossings"]).toEqual({ ratio: null, noOld: 0, noNew: 0, oldZero: 0, mixed: 4 });
    expect(mixed.routes["route.detour.mean"]?.ratio?.n).toBe(4);
    expect(epochStep(side(OLD, 0.5, routed(ROUTES)), side(NEW, 0.5, routed(sampled))).routes["route.crossings"]?.mixed).toBe(4);
    expect(epochStep(side(OLD, 0.5, routed(sampled)), side(NEW, 0.5, routed(sampled))).routes["route.crossings"]?.ratio?.n).toBe(4);
  });

  it("counts a pair only when it passes the rule", () => {
    const step = epochStep(side(OLD, 0.5, { ...routed(ROUTES), hashes: ["ha", null] }), side(NEW, 0.5, routed(ROUTES)));
    expect(step.dropped.hash).toBe(2);
    expect(step.routes["route.crossings"]?.ratio?.n).toBe(2);
  });

  it("does not change the raw metrics", () => {
    const plain = epochStep(side(OLD, 0.5), side(NEW, 0.6));
    const withRoutes = epochStep(side(OLD, 0.5, routed(ROUTES)), side(NEW, 0.6, routed({ ...ROUTES, "route.crossings": 99 })));
    expect(withRoutes.metrics).toEqual(plain.metrics);
    expect(withRoutes.pairs).toBe(plain.pairs);
  });
});

describe("the route values of a record", () => {
  const record = (measures: Record<string, number>, skipped?: string): LayoutRecord => ({ measures, ...(skipped === undefined ? {} : { skipped }) }) as unknown as LayoutRecord;

  it("keeps the route values and the mark of an estimate, and no other measure", () => {
    expect(stepValuesOf(record({ ...ROUTES, "route.crossings.estimated": 0, "joint.fill": 0.5 }))).toEqual({ ...ROUTES, "route.crossings.estimated": 0 });
  });

  it("leaves a measure absent when the record does not have it", () => {
    expect(stepValuesOf(record({ "route.crossings": 3 }))).toEqual({ "route.crossings": 3 });
  });

  it("gives null for a skipped record", () => {
    expect(stepValuesOf(record(ROUTES, "too large"))).toBeNull();
  });
});

describe("the hashes of an old state", () => {
  const manifest = JSON.parse(readFileSync(new URL("../corpus/joint-v2/corpus.json", import.meta.url), "utf8")) as { inputs: { id: string; hash: string }[] };
  const ids = manifest.inputs.map((e) => e.id);
  const hashes = manifest.inputs.map((e) => e.hash);

  it("reads the space of an epoch", () => {
    expect(spaceOfEpoch(OLD)).toBe("bench-3");
  });

  it("has the proof of the epoch of packing 0.4.1: the manifest of the code gives the same list", () => {
    expect(inputListHash(ids, hashes)).toBe(LEGACY_INPUT_LISTS[OLD]);
    expect(hashesOfState({ epoch: OLD, inputs: ids }, ids, hashes)).toEqual(hashes);
  });

  it("gives no hash for an epoch with no proof, or for a list that changed", () => {
    expect(hashesOfState({ epoch: "other", inputs: ["a"] }, ids, hashes)).toEqual([null]);
    expect(hashesOfState({ epoch: OLD, inputs: ids }, ids, hashes.map((h, i) => (i === 0 ? "x" : h))).every((h) => h === null)).toBe(true);
  });

  it("uses the stored hashes of a state that has them", () => {
    expect(hashesOfState({ epoch: "other", inputs: ["a"], inputHashes: ["h"] }, ids, hashes)).toEqual(["h"]);
  });
});
