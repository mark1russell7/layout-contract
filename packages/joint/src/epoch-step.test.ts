import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { epochStep, hashesOfState, inputListHash, LEGACY_INPUT_LISTS, spaceOfEpoch, type StepSide } from "./epoch-step.ts";

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
