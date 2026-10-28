import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { analyze, bootstrap, hardOf, indexRecords, packOf, rankPacks, reportMarkdown, routerOfPair, throughCounts, type AnalysisInput } from "./analysis.ts";

/** This function makes a fake record of one pair on one input. */
function rec(input: string, strategy: string, measures: Record<string, number>, options: { hard?: Record<string, number>; hash?: string; skipped?: string } = {}): LayoutRecord {
  return {
    schema: "layout-record/1",
    stage: "joint",
    step: "joint",
    strategy,
    options: {},
    corpus: "test",
    input,
    inputHash: "",
    set: "test",
    seed: 1,
    nodes: 3,
    edges: 2,
    measures: { "pack.overflow": 0, "pack.overflow.excessArea": 0, "pack.fill": 0.5, "route.mixed": 0, "route.cap.1.1": 0, "route.cap.1.25": 0, "route.cap.1.5": 0, ...measures },
    hard: { "pack.no-overlap": 0, "route.violations": 0, ...options.hard },
    deterministic: true,
    ms: 1,
    ...(options.skipped === undefined ? { outputHash: options.hash ?? `${strategy}:${input}` } : { skipped: options.skipped }),
  };
}

/** Two specs with 3 seeds each. */
const inputs: AnalysisInput[] = ["p", "q"].flatMap((spec) =>
  [1, 2, 3].map((seed) => ({ id: `${spec}/s${seed}`, seed, spec, kind: spec === "p" ? "grid" : "ui", cell: { containerSize: spec === "p" ? "fixed" : "freeArea", count: spec === "p" ? "10" : "100" } })),
);

/**
 * The pair `a+r` is best on the spec `p`, and `b+r` is best on the spec `q`. The pair `c+r` gives the same output as `a+r`.
 * On the spec `p`, `a+r` breaks the cap 1.1, so the cell of the cap 1.1 picks `b+r` there.
 */
function records(): LayoutRecord[] {
  const out: LayoutRecord[] = [];
  for (const i of inputs) {
    const p = i.spec === "p";
    out.push(rec(i.id, "a+r", { "joint.fill": p ? 0.8 : 0.6, "route.cap.1.1": p ? 1 : 0 }, { hash: `A:${i.id}` }));
    out.push(rec(i.id, "b+r", { "joint.fill": p ? 0.6 : 0.9 }));
    out.push(rec(i.id, "c+r", { "joint.fill": p ? 0.8 : 0.6, "route.cap.1.1": p ? 1 : 0 }, { hash: `A:${i.id}` }));
  }
  return out;
}

describe("analyze", () => {
  const report = analyze(records(), inputs, { resamples: 200 });

  it("counts the pairs and the output groups", () => {
    expect(report.pairs).toBe(3);
    expect(report.groups).toBe(2);
    expect(report.cells).toHaveLength(6);
  });

  it("finds the best single pair and the oracle", () => {
    const cell = report.cells.find((c) => c.rule === "all" && c.cap === 1.25)!;
    expect(cell.best.pair).toBe("b+r");
    expect(cell.best.score).toBeCloseTo(0.75, 9);
    expect(cell.oracle.score).toBeCloseTo(0.85, 9);
    expect(cell.oracle.gain.mean).toBeCloseTo(0.1, 9);
    expect(cell.oracle.wins).toBe(3);
    expect(cell.oracle.byCount["10"]!.mean).toBeCloseTo(0.2, 9);
    expect(cell.oracle.byCount["100"]!.mean).toBeCloseTo(0, 9);
    expect(cell.oracle.byCount["100"]!.open).toBe(true);
  });

  it("counts a route above the cap as a hard break", () => {
    const tight = report.cells.find((c) => c.rule === "all" && c.cap === 1.1)!;
    expect(tight.oracle.score).toBeCloseTo(0.75, 9);
    expect(tight.oracle.gain.mean).toBeCloseTo(0, 9);
    expect(tight.oracle.gain.open).toBe(true);
  });

  it("builds greedy portfolios that reach the oracle with both groups", () => {
    const cell = report.cells.find((c) => c.rule === "all" && c.cap === 1.5)!;
    const k3 = cell.portfolios.find((p) => p.k === 3)!;
    expect(k3.folds).toHaveLength(3);
    for (const f of k3.folds) expect([...f.members].sort()).toEqual(["a+r", "b+r"]);
    expect(k3.share.mean).toBeCloseTo(1, 9);
  });

  it("splits the picks by overflow", () => {
    const cell = report.cells[0]!;
    expect(cell.split.oracle.clean.inputs).toBe(6);
    expect(cell.split.oracle.overflow.inputs).toBe(0);
  });

  it("lists the thin board kinds", () => {
    expect(report.thinKinds).toEqual([
      { kind: "grid", inputs: 3 },
      { kind: "ui", inputs: 3 },
    ]);
  });

  it("writes the report as Markdown", () => {
    const md = reportMarkdown(report);
    expect(md).toContain("### The cells");
    expect(md).toContain("b+r");
    expect(report.predictions.map((p) => p.id)).toEqual(["P1", "P2", "P2b", "P3", "P3b", "P4", "P5"]);
  });

  it("ignores skipped records in the picks", () => {
    const list = [...records(), rec("p/s1", "d+r", {}, { skipped: "error: no" })];
    const r = analyze(list, inputs, { resamples: 50 });
    expect(r.skipped).toEqual({ "error: no": 1 });
    expect(r.pairs).toBe(4);
  });
});

describe("the record count check and the subset headline", () => {
  it("counts the inputs from the records, and lists the missing inputs", () => {
    const list = records().filter((r) => r.input !== "q/s3");
    const r = analyze(list, inputs, { resamples: 50 });
    expect(r.count).toMatchObject({ manifest: 6, recorded: 5, missing: ["q/s3"], allowed: [], ok: false });
    const md = reportMarkdown(r);
    expect(md).toContain("Inputs: 5 with records, of 6 in the manifest.");
    expect(md).toContain("### The missing inputs");
    expect(md).toContain("| q/s3 | no |");
    expect(analyze(list, inputs, { resamples: 50, allowMissing: ["q/s3"] }).count.ok).toBe(true);
    expect(analyze(records(), inputs, { resamples: 50 }).count).toMatchObject({ recorded: 6, missing: [], ok: true });
  });

  it("gives the headline cell on the subset next to the full headline cell", () => {
    const r = analyze(records(), inputs, { resamples: 50, subset: ["p/s1", "p/s2", "p/s3", "x/s1"] });
    expect(r.subset).toMatchObject({ ids: 4, inputs: 3 });
    // On the spec p alone, the group of a+r is best.
    expect(r.subset!.cell!.best.pair).toBe("a+r");
    expect(r.subset!.cell!.oracle.gain.mean).toBeCloseTo(0, 9);
    const md = reportMarkdown(r);
    expect(md).toContain("### The headline cell on the subset (3 of 6 inputs)");
    expect(md).toContain("| all (6) | b+r |");
    expect(md).toContain("| subset (3) | a+r |");
    expect(analyze(records(), inputs, { resamples: 50 }).subset).toBeUndefined();
  });
});

describe("the parts of the analysis", () => {
  it("adds the cap breaks and, under the rule collection, the mixed segments", () => {
    const r = rec("x", "a+r", { "route.cap.1.1": 2, "route.mixed": 3 }, { hard: { "pack.complete": 1, "route.violations": 4, "route.complete": 4 } });
    expect(hardOf(r, "all", 1.1)).toBe(7);
    expect(hardOf(r, "all", 1.25)).toBe(5);
    expect(hardOf(r, "collection", 1.1)).toBe(10);
  });

  it("ranks the pack entries by the excess area, then by the fill of the clean inputs", () => {
    const list: LayoutRecord[] = [];
    for (const i of ["x/s1", "x/s2"]) {
      list.push(rec(i, "p+r", { "pack.fill": 0.7 }));
      list.push(rec(i, "q+r", { "pack.fill": 0.8 }));
      list.push(rec(i, "s+r", { "pack.fill": 0.95, "pack.overflow": 1, "pack.overflow.excessArea": 0.2 }));
    }
    const ranking = rankPacks(indexRecords(list), ["x/s1", "x/s2"], "all");
    expect(ranking.order.map((s) => s.id)).toEqual(["q", "p", "s"]);
    expect(ranking.order[0]!.tied).toEqual(["p", "q"]);
    expect(ranking.order[0]!.cleanShare).toBe(1);
    expect(ranking.order[0]!.thin).toBe(false);
  });

  it("marks a scope thin when few inputs are clean", () => {
    const list: LayoutRecord[] = [];
    for (const [n, i] of ["x/s1", "x/s2", "x/s3", "x/s4"].entries()) {
      list.push(rec(i, "p+r", { "pack.overflow": n === 0 ? 0 : 1 }));
      list.push(rec(i, "q+r", { "pack.overflow": n === 0 ? 0 : 1 }));
    }
    const ranking = rankPacks(indexRecords(list), ["x/s1", "x/s2", "x/s3", "x/s4"], "all");
    expect(ranking.order[0]!.cleanShare).toBe(0.25);
    expect(ranking.order[0]!.thin).toBe(true);
  });

  it("gives a bootstrap interval of the mean and of a ratio", () => {
    const flat = bootstrap([1, 1, 1, 1].map((value, i) => ({ cluster: `c${i}`, value })), 100, 1);
    expect(flat).toEqual({ mean: 1, lo: 1, hi: 1, open: false, n: 4 });
    const spread = bootstrap([-1, 1, -1, 1].map((value, i) => ({ cluster: `c${i}`, value })), 200, 1);
    expect(spread.open).toBe(true);
    const ratio = bootstrap([{ cluster: "a", value: 1, weight: 2 }, { cluster: "b", value: 1, weight: 2 }], 100, 1);
    expect(ratio.mean).toBeCloseTo(0.5, 9);
  });

  it("gives the pack entry of a pair", () => {
    expect(packOf("maxrects-bl+corners")).toBe("maxrects-bl");
  });
});

describe("the stress cell and the breaks by spacing", () => {
  // The inputs of the spec q are stress inputs. Each pair breaks no-pass-through there.
  const marked: AnalysisInput[] = inputs.map((i) => ({ ...i, cell: { ...i.cell, spacing: i.spec === "q" ? "stress" : "gap" }, ...(i.spec === "q" ? { stress: true } : {}) }));
  const list = records().map((r) => {
    const stress = r.input.startsWith("q/");
    const hard = stress ? { ...r.hard, "route.no-pass-through": 3 } : r.hard;
    return { ...r, hard, measures: { ...r.measures, "joint.routes": 2 } };
  });
  const report = analyze(list, marked, { resamples: 100, predictions: "joint-v2" });

  it("keeps the stress inputs out of the headline, and reports them apart", () => {
    expect(report.inputs).toBe(3);
    expect(report.stress?.inputs).toBe(3);
    expect(report.stress?.cells).toHaveLength(6);
    expect(report.cells.find((c) => c.rule === "all" && c.cap === 1.25)!.best.pair).toBe("a+r");
  });

  it("counts the breaks of no-pass-through for each value of spacing and each router", () => {
    expect(throughCounts(list, marked)).toEqual([
      { spacing: "gap", router: "r", routed: 9, broken: 0, breaks: 0, causes: {} },
      { spacing: "stress", router: "r", routed: 9, broken: 9, breaks: 27, causes: { router: 9 } },
    ]);
    expect(report.through).toEqual(throughCounts(list, marked));
    expect(routerOfPair("maxrects-bl+corners")).toBe("corners");
  });

  it("gives the predictions of joint-v2 and writes the new tables", () => {
    expect(report.predictions.map((p) => p.id)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"]);
    expect(report.predictions[0]!.held).toBe(true);
    const md = reportMarkdown(report);
    expect(md).toContain("### The breaks of no-pass-through by spacing");
    expect(md).toContain("### The stress cell (3 inputs)");
  });

  it("gives the predictions of joint-v1 by default", () => {
    expect(analyze(list, marked, { resamples: 50 }).predictions[0]!.id).toBe("P1");
  });
});
