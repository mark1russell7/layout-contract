import { describe, expect, it } from "vitest";
import { COST_MODEL, inputCost } from "./plan.ts";
import { coverOptions } from "./cover.ts";
import { pairId, PACK_ENTRIES, ROUTERS } from "./runner.ts";
import {
  engineMismatch,
  fitMarginSet,
  heldOutErrors,
  inputRatios,
  MARGIN_SETS,
  marginNote,
  marginsOf,
  pairSetId,
  pairTotals,
  parseMarginSets,
  pickMarginSet,
  type MarginSet,
} from "./margin-sets.ts";
import type { PairLine } from "./shard-run.ts";

const line = (input: string, strategy: string, wallMs: number, tag?: PairLine["tag"]): PairLine => ({ stamp: "x", input, inputHash: "h", strategy, wallMs, ...(tag ? { tag } : {}) });

const set = (id: string, corpus: string, pairs: string[], run: number, heldOut: MarginSet["heldOut"] = {}): MarginSet => ({ id, corpus, run, commit: "c", pairs, quantile: 0.9, specs: {}, default: 1, heldOut });

describe("pairSetId", () => {
  it("does not depend on the order or on a repeated pair", () => {
    expect(pairSetId("joint-v2", ["b", "a", "a"])).toBe(pairSetId("joint-v2", ["a", "b"]));
  });

  it("changes with the corpus and with each pair", () => {
    const id = pairSetId("joint-v2", ["a", "b"]);
    expect(pairSetId("joint-v1", ["a", "b"])).not.toBe(id);
    expect(pairSetId("joint-v2", ["a", "c"])).not.toBe(id);
    expect(pairSetId("joint-v2", ["a"])).not.toBe(id);
  });
});

describe("pairTotals and inputRatios", () => {
  it("adds the finished pairs of each input and leaves out a tagged pair", () => {
    const totals = pairTotals([line("k/s1", "p", 10), line("k/s1", "q", 30), line("k/s1", "r", 300_000, "over-budget"), line("k/s2", "p", 5)]);
    expect(totals).toEqual([
      { input: "k/s1", wallMs: 40, pairs: 2 },
      { input: "k/s2", wallMs: 5, pairs: 1 },
    ]);
  });

  it("divides the time of an input by inputCost of its pairs, and leaves out an unknown input", () => {
    const inputs = new Map([["k/s1", { id: "k/s1", boxes: 100, edges: 50 }]]);
    const ratios = inputRatios(
      [
        { input: "k/s1", wallMs: 4000, pairs: 2 },
        { input: "other/s1", wallMs: 1, pairs: 1 },
      ],
      inputs,
    );
    expect([...ratios.keys()]).toEqual(["k/s1"]);
    expect(ratios.get("k/s1")).toBeCloseTo(4000 / inputCost(100, 50, 2), 12);
  });
});

describe("marginsOf and heldOutErrors", () => {
  const ratios = new Map([
    ["a/s1", 1],
    ["a/s2", 2],
    ["a/s3", 4],
    ["b/s1", 10],
    ["b/s2", 10],
    ["b/s3", 10],
  ]);

  it("gives the quantile of the seeds of each spec, and the quantile of all inputs as the default", () => {
    const margins = marginsOf(ratios, 0.5);
    expect(margins.specs).toEqual({ a: 2, b: 10 });
    expect(margins.default).toBe(7);
  });

  it("fits each seed on the other seeds", () => {
    const errors = heldOutErrors(ratios, 0.5);
    expect(Object.keys(errors)).toEqual(["s1", "s2", "s3"]);
    // Without s1, the median of a is 3, and b is 10: a/s1 gives |log(1/3)| and b/s1 gives 0.
    expect(errors["s1"]!.meanAbsLog).toBeCloseTo(Math.log(3) / 2, 12);
    expect(errors["s1"]!.inputs).toBe(2);
  });

  it("gives no error for a seed that is the only seed", () => {
    expect(heldOutErrors(new Map([["a/s1", 2]]), 0.9)).toEqual({});
  });
});

describe("fitMarginSet", () => {
  const inputs = [
    { id: "a/s1", boxes: 10, edges: 5 },
    { id: "a/s2", boxes: 10, edges: 5 },
  ];
  const lines = [line("a/s1", "p", 100), line("a/s1", "q", 100), line("a/s2", "p", 50), line("a/s2", "q", 9, "not-run")];

  it("keys the set by its corpus and pairs, also the pairs with no finished line", () => {
    const fitted = fitMarginSet({ corpus: "joint-v2", run: 7, commit: "c", pairs: lines.map((l) => l.strategy), totals: pairTotals(lines), inputs, quantile: 0.9 });
    expect(fitted.pairs).toEqual(["p", "q"]);
    expect(fitted.id).toBe(pairSetId("joint-v2", ["p", "q"]));
    expect(Object.keys(fitted.specs)).toEqual(["a"]);
    expect(Object.keys(fitted.heldOut)).toEqual(["s1", "s2"]);
  });

  it("refuses a quantile out of range, no pairs and no known input", () => {
    const base = { corpus: "joint-v2", run: 7, commit: "c", pairs: ["p"], totals: pairTotals(lines), inputs, quantile: 0.9 };
    expect(() => fitMarginSet({ ...base, quantile: 1 })).toThrow(/quantile/);
    expect(() => fitMarginSet({ ...base, pairs: [] })).toThrow(/one pair/);
    expect(() => fitMarginSet({ ...base, inputs: [] })).toThrow(/known input/);
  });
});

describe("pickMarginSet", () => {
  const small = set(pairSetId("c", ["a", "b"]), "c", ["a", "b"], 1);
  const large = set(pairSetId("c", ["a", "b", "c", "d"]), "c", ["a", "b", "c", "d"], 2);
  const other = set(pairSetId("d", ["a", "b"]), "d", ["a", "b"], 3);

  it("takes the set with the same pairs, in any order", () => {
    expect(pickMarginSet([large, small, other], "c", ["b", "a"])).toMatchObject({ set: small, shared: 2, exact: true });
  });

  it("takes the set with the largest overlap when no set has the same pairs", () => {
    // [a, b, c]: the small set shares 2 of 3 pairs, and the large set shares 3 of 4.
    expect(pickMarginSet([small, large], "c", ["a", "b", "c"])).toMatchObject({ set: large, shared: 3, overlap: 0.75, exact: false });
    // [a]: the small set shares 1 of 2 pairs, and the large set 1 of 4.
    expect(pickMarginSet([small, large], "c", ["a"])).toMatchObject({ set: small, exact: false });
  });

  it("takes the later run when two overlaps are equal", () => {
    const later = set(pairSetId("c", ["a", "c"]), "c", ["a", "c"], 9);
    expect(pickMarginSet([small, later], "c", ["a"])?.set).toBe(later);
  });

  it("gives undefined with no set of the corpus", () => {
    expect(pickMarginSet([other], "c", ["a", "b"])).toBeUndefined();
  });
});

describe("marginNote", () => {
  const measured = set(pairSetId("c", ["a", "b"]), "c", ["a", "b"], 41, { s1: { meanAbsLog: 0.21, medianRatio: 1, inputs: 3 }, s2: { meanAbsLog: 0.3, medianRatio: 1, inputs: 3 } });

  it("names the set and its held-out error for a plan with the same pairs", () => {
    const note = marginNote(pickMarginSet([measured], "c", ["a", "b"]), ["a", "b"], "cost-margins.json");
    expect(note).toBe(`The margins come from pair set ${measured.id} of run 41, with the 2 pairs of this plan. Its mean |log(real / planned)| on a held-out seed is 0.21-0.30.`);
  });

  it("says that a plan with other pairs uses another pair set, with the error of that set on its own pairs", () => {
    const pairs = ["a", "b", "c"];
    const note = marginNote(pickMarginSet([measured], "c", pairs), pairs, "cost-margins.json");
    expect(note).toBe(`No margin set has the 3 pairs of this plan. The estimate uses another pair set: ${measured.id} of run 41, with 2 pairs, and 2 of them are in this plan. Its mean |log(real / planned)| on a held-out seed is 0.21-0.30.`);
  });

  it("names each engine whose version differs from the version of the fit", () => {
    const fitted = { ...measured, engines: { packing: "0.7.0", highways: "0.14.0" } };
    const pick = pickMarginSet([fitted], "c", ["a", "b"]);
    expect(marginNote(pick, ["a", "b"], "x", { packing: "0.10.5", highways: "0.14.0" })).toMatch(/0\.21-0\.30\. The set was fit on packing 0\.7\.0\. This run has packing 0\.10\.5\.$/);
    expect(engineMismatch(fitted, { packing: "0.10.5", highways: "0.15.0" })).toBe("The set was fit on highways 0.14.0, packing 0.7.0. This run has highways 0.15.0, packing 0.10.5.");
    expect(engineMismatch(fitted, { packing: "0.7.0", highways: "0.14.0" })).toBeUndefined();
    // An engine that only one side names is no mismatch.
    expect(engineMismatch(measured, { packing: "0.10.5" })).toBeUndefined();
    expect(engineMismatch(fitted, { node: "26.0.0" })).toBeUndefined();
  });

  it("says when no set has the corpus, and when a set has no held-out error", () => {
    expect(marginNote(undefined, ["a"], "cost-margins.json")).toMatch(/^No margin set has the corpus of this plan\. The estimate uses the margins of cost-margins\.json\./);
    const bare = set(pairSetId("c", ["a"]), "c", ["a"], 1);
    expect(marginNote(pickMarginSet([bare], "c", ["a"]), ["a"], "x")).toMatch(/Its error on a held-out seed is not measured\.$/);
  });
});

describe("parseMarginSets", () => {
  it("gives a set with no margins the margins of the fallback", () => {
    const text = JSON.stringify({ sets: [{ id: pairSetId("c", ["a"]), corpus: "c", run: 1, commit: "x", pairs: ["a"], quantile: 0.9 }] });
    const [only] = parseMarginSets(text, { specs: { k: 2 }, default: 3 });
    expect(only).toMatchObject({ specs: { k: 2 }, default: 3, heldOut: {} });
  });

  it("refuses a set whose id is not the key of its pairs, and a margin that is not above 0", () => {
    const good = { id: pairSetId("c", ["a"]), corpus: "c", run: 1, commit: "x", pairs: ["a"], quantile: 0.9 };
    expect(() => parseMarginSets(JSON.stringify({ sets: [{ ...good, pairs: ["b"] }] }), COST_MODEL)).toThrow(/key of its pairs/);
    expect(() => parseMarginSets(JSON.stringify({ sets: [{ ...good, specs: { k: 0 }, default: 1 }] }), COST_MODEL)).toThrow(/above 0/);
  });
});

describe("MARGIN_SETS", () => {
  const defaultPairs = PACK_ENTRIES.flatMap((entry) => ROUTERS.map((router) => pairId(entry.id, router)));

  // The run of cost-margins.json had 195 pairs. The default plan has more pack strategies today, so no set has its pairs.
  it("gives the default plan the set of the run of cost-margins.json, with its margins", () => {
    const pick = pickMarginSet(MARGIN_SETS, COST_MODEL.corpus, defaultPairs);
    expect(pick?.set.run).toBe(COST_MODEL.run);
    expect(pick?.set.pairs.every((pair) => defaultPairs.includes(pair))).toBe(true);
    expect(pick?.set.specs).toBe(COST_MODEL.specs);
    expect(pick?.set.default).toBe(COST_MODEL.default);
  });

  it("gives the cover plan the set of the cover run with the most of its pairs", () => {
    const pairs = coverOptions().pairs!;
    const pick = pickMarginSet(MARGIN_SETS, COST_MODEL.corpus, pairs)!;
    const best = Math.max(...MARGIN_SETS.map((s) => s.pairs.filter((pair) => pairs.includes(pair)).length / new Set([...s.pairs, ...pairs]).size));
    expect(pick.overlap).toBe(best);
    expect(pick.set.run).not.toBe(COST_MODEL.run);
  });

  it("has a held-out error on each seed of each set, and the engine versions of its fit", () => {
    for (const marginSet of MARGIN_SETS) {
      expect(Object.keys(marginSet.engines ?? {}).sort()).toEqual(["highways", "packing"]);
      expect(Object.keys(marginSet.heldOut).sort()).toEqual(["s1", "s2", "s3"]);
      for (const error of Object.values(marginSet.heldOut)) expect(error.meanAbsLog).toBeGreaterThan(0);
    }
  });
});
