import { describe, expect, it } from "vitest";
import { mulberry32, verdict, VERDICT_EXACT_MAX, type VerdictOptions, type VerdictRecord } from "./index.ts";

// The verdict over families (VERDICT, SCREEN-WEIGHT step 1). All data is made up.

const M = "x.cost";

/** The records of a made-up screen: for each family, the differences of its seeds. The baseline has the value 10. */
function recordsOf(families: Record<string, readonly number[]>, direction: "lower" | "higher" = "lower"): VerdictRecord[] {
  const out: VerdictRecord[] = [];
  for (const [family, ds] of Object.entries(families)) {
    ds.forEach((d, seed) => {
      const input = `set/${family}/s${seed}`;
      out.push({ strategy: "base", input, seed, measures: { [M]: 10 } });
      out.push({ strategy: "cand", input, seed, measures: { [M]: direction === "lower" ? 10 - d : 10 + d } });
    });
  }
  return out;
}

const familyOfRecord = (r: VerdictRecord): string => r.input.split("/")[1]!;

const options = (extra: Partial<VerdictOptions> = {}): VerdictOptions => ({
  by: "family",
  family: familyOfRecord,
  measure: { id: M, direction: "lower" },
  a: "base",
  b: "cand",
  tie: 0,
  level: 0.05,
  runs: 2000,
  ...extra,
});

describe("verdict: hand-computed cases with 2 families of 3 seeds", () => {
  it("gives p = 2/64 when each difference has the same sign", () => {
    // X = [1, 2, 3] and Y = [1, 1, 1]. Only the sign sets "all +" and "all -" reach the observed |T|.
    const v = verdict(recordsOf({ X: [1, 2, 3], Y: [1, 1, 1] }), options());
    expect(v.n).toBe(6);
    expect(v.stratified.mean).toBeCloseTo(1.5, 12);
    expect(v.pooled.mean).toBeCloseTo(1.5, 12);
    expect(v.permutation).toEqual({ p: 2 / 64, exact: true, draws: 64, seed: 1 });
    expect(v.families).toEqual([
      { family: "X", n: 3, mean: 2, sign: 1 },
      { family: "Y", n: 3, mean: 1, sign: 1 },
    ]);
    // 2 wins of 2: the two-sided p is 2 × (1/2)^2.
    expect(v.signTest).toEqual({ wins: 2, losses: 0, ties: 0, p: 0.5 });
    // Each stratified sample is from (1 + 1) / 2 to (3 + 1) / 2.
    expect(v.stratified.lo).toBeGreaterThanOrEqual(1);
    expect(v.stratified.hi).toBeLessThanOrEqual(2);
    expect(v.agree).toBe(true);
    expect(v.label).toBe("better");
  });

  it("gives p = 14/64 for the differences [1, 1, 1] and [1, 1, -1]", () => {
    // The sum of six terms of ±1 is 6 - 2k. |6 - 2k| >= 4 for k in {0, 1, 5, 6}: 1 + 6 + 6 + 1 = 14 sign sets.
    const v = verdict(recordsOf({ X: [1, 1, 1], Y: [1, 1, -1] }), options());
    expect(v.permutation.p).toBe(14 / 64);
    expect(v.stratified.mean).toBeCloseTo(2 / 3, 12);
    expect(v.pooled.mean).toBeCloseTo(2 / 3, 12);
    expect(v.families.map((f) => f.sign)).toEqual([1, 1]);
    expect(v.agree).toBe(false);
    expect(v.label).toBe("no verdict");
  });

  it("reads the direction of the measure", () => {
    const lower = verdict(recordsOf({ X: [1, 2, 3], Y: [1, 1, 1] }, "lower"), options());
    const higher = verdict(recordsOf({ X: [1, 2, 3], Y: [1, 1, 1] }, "higher"), options({ measure: { id: M, direction: "higher" } }));
    expect(higher.stratified).toEqual(lower.stratified);
    expect(higher.label).toBe("better");
    const swapped = verdict(recordsOf({ X: [1, 2, 3], Y: [1, 1, 1] }), options({ a: "cand", b: "base" }));
    expect(swapped.stratified.mean).toBeCloseTo(-1.5, 12);
    expect(swapped.label).toBe("worse");
  });

  it("makes a family a tie when its mean change is at most tie", () => {
    const v = verdict(recordsOf({ X: [1, 2, 3], Y: [0.1, 0.2, 0] }), options({ tie: 0.5 }));
    expect(v.families.map((f) => f.sign)).toEqual([1, 0]);
    expect(v.signTest).toEqual({ wins: 1, losses: 0, ties: 1, p: 1 });
  });
});

describe("verdict: the permutation test", () => {
  // 4 families of 4 seeds, with made-up differences.
  const r = mulberry32(7);
  const sixteen: Record<string, number[]> = {};
  for (const f of ["A", "B", "C", "D"]) sixteen[f] = [0, 1, 2, 3].map(() => Math.round((r() - 0.35) * 1000) / 1000);

  it("gives an exact p and a drawn p that differ by less than 0.01 with 16 inputs and 20 000 draws", () => {
    const exact = verdict(recordsOf(sixteen), options());
    const drawn = verdict(recordsOf(sixteen), options({ exactMax: 0, draws: 20000 }));
    expect(exact.n).toBe(VERDICT_EXACT_MAX);
    expect(exact.permutation.exact).toBe(true);
    expect(exact.permutation.draws).toBe(65536);
    expect(drawn.permutation.exact).toBe(false);
    expect(drawn.permutation.draws).toBe(20000);
    expect(exact.permutation.p).toBeGreaterThan(0.01);
    expect(exact.permutation.p).toBeLessThan(0.99);
    expect(Math.abs(exact.permutation.p - drawn.permutation.p)).toBeLessThan(0.01);
  });

  it("uses draws above VERDICT_EXACT_MAX inputs", () => {
    const v = verdict(recordsOf({ A: [1, 2, 3, 4, 5, 6], B: [1, 2, 3, 4, 5, 6], C: [1, 2, 3, 4, 5] }), options({ draws: 500 }));
    expect(v.n).toBe(17);
    expect(v.permutation).toEqual({ p: 1 / 501, exact: false, draws: 500, seed: 1 });
    expect(v.label).toBe("better");
  });
});

describe("verdict: the bootstrap", () => {
  const data = { X: [0.4, -0.2, 1.1, 0.3], Y: [0.9, 0.1, -0.5], Z: [0.2, 0.25, 0.3, -0.1, 0.6] };

  it("gives the same intervals and p from the same seed", () => {
    const one = verdict(recordsOf(data), options({ seed: 42 }));
    const two = verdict([...recordsOf(data)].reverse(), options({ seed: 42 }));
    expect(two).toEqual(one);
  });

  it("gives other intervals from another seed", () => {
    const one = verdict(recordsOf(data), options({ seed: 42 }));
    const two = verdict(recordsOf(data), options({ seed: 43 }));
    expect(two.stratified.mean).toBe(one.stratified.mean);
    expect([two.stratified.lo, two.stratified.hi]).not.toEqual([one.stratified.lo, one.stratified.hi]);
  });
});

describe("verdict: the weight of a family", () => {
  it("does not let a large family carry the stratified mean", () => {
    // X has 30 inputs of +1. Y and Z have 3 inputs of -1 each.
    const big = (k: number): Record<string, number[]> => ({ X: Array.from({ length: k }, () => 1), Y: [-1, -1, -1], Z: [-1, -1, -1] });
    const v = verdict(recordsOf(big(30)), options());
    expect(v.stratified.mean).toBeCloseTo(-1 / 3, 12);
    expect(v.pooled.mean).toBeCloseTo(24 / 36, 12);
    expect(verdict(recordsOf(big(300)), options({ runs: 200 })).stratified.mean).toBeCloseTo(-1 / 3, 12);
    expect(v.signTest).toEqual({ wins: 1, losses: 2, ties: 0, p: 1 });
    expect(v.agree).toBe(false);
    expect(v.label).toBe("depends on the mix");
  });
});

describe("verdict: the arguments and the pairs", () => {
  it("refuses a missing tie or level", () => {
    const records = recordsOf({ X: [1, 2, 3] });
    const { tie: _tie, ...noTie } = options();
    const { level: _level, ...noLevel } = options();
    expect(() => verdict(records, noTie as VerdictOptions)).toThrow(/tie is a required/);
    expect(() => verdict(records, noLevel as VerdictOptions)).toThrow(/level is a required/);
    expect(() => verdict(records, options({ level: 1 }))).toThrow(RangeError);
    expect(() => verdict(records, options({ tie: -1 }))).toThrow(RangeError);
  });

  it("drops an input without a pair, a skipped record and a missing measure", () => {
    const records = recordsOf({ X: [1, 2, 3, 4], Y: [1, 1, 1] });
    records.push({ strategy: "base", input: "set/X/s9", seed: 9, measures: { [M]: 1 } });
    const at = records.findIndex((r) => r.strategy === "cand" && r.input === "set/X/s3");
    records[at] = { ...records[at]!, skipped: "too large", measures: {} };
    const k = records.findIndex((r) => r.strategy === "cand" && r.input === "set/Y/s2");
    records[k] = { ...records[k]!, measures: {} };
    const v = verdict(records, options());
    expect(v.n).toBe(5);
    expect(v.dropped).toEqual(["set/X/s3#3", "set/X/s9#9", "set/Y/s2#2"]);
  });

  it("refuses two records of one side for one input, and a value that is not finite", () => {
    const records = recordsOf({ X: [1, 2, 3] });
    expect(() => verdict([...records, records[0]!], options())).toThrow(/two records/);
    const bad = [...records, { strategy: "base", input: "set/X/s7", seed: 7, measures: { [M]: Infinity } }, { strategy: "cand", input: "set/X/s7", seed: 7, measures: { [M]: 1 } }];
    expect(() => verdict(bad, options())).toThrow(/not finite/);
    expect(() => verdict([], options())).toThrow(/no pair/);
  });

  it("accepts a test as a side", () => {
    const v = verdict(recordsOf({ X: [1, 2, 3], Y: [1, 1, 1] }), options({ a: (r) => r.strategy === "base", b: (r) => r.strategy === "cand" }));
    expect(v.permutation.p).toBe(2 / 64);
  });
});
