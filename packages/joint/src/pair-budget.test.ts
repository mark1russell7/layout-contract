import { describe, expect, it } from "vitest";
import { budgetCases, budgetTag, earlierOverruns, keyParts, pairBudgetMs, parsePairBudget } from "./pair-budget.ts";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { budgetLines, budgetReport, NOT_RUN_OVER_BUDGET, OVER_BUDGET, type AnalysisInput } from "./analysis.ts";
import { pairRuns, PACK_ENTRIES } from "./runner.ts";
import { doneKey, type PairLine } from "./shard-run.ts";

describe("parsePairBudget", () => {
  it("reads one number as the budget of each input", () => {
    const budget = parsePairBudget("5");
    expect(pairBudgetMs(budget, 10)).toBe(300_000);
    expect(pairBudgetMs(budget, 1000)).toBe(300_000);
  });

  it("reads a budget by input size", () => {
    const budget = parsePairBudget("200:0.5,500:2,5");
    expect(pairBudgetMs(budget, 200)).toBe(30_000);
    expect(pairBudgetMs(budget, 201)).toBe(120_000);
    expect(pairBudgetMs(budget, 501)).toBe(300_000);
    expect(budget.text).toBe("200:0.5,500:2,5");
  });

  it.each(["", "0", "-1", "x", "5,", "200:1", ":1,5", "a:1,5", "200:,5", "500:1,200:2,5"])("refuses the text %j", (text) => {
    expect(() => parsePairBudget(text)).toThrow(RangeError);
  });
});

describe("budgetCases", () => {
  it("gives each pair, with a group for the pack entry and for the router of each input", () => {
    const cases = budgetCases([{ id: "i", boxes: 10 }, { id: "j", boxes: 1000 }], ["p+r", "q+r"], parsePairBudget("100:1,5"));
    expect(cases.map((c) => c.id)).toEqual([doneKey("i", "p+r"), doneKey("i", "q+r"), doneKey("j", "p+r"), doneKey("j", "q+r")]);
    expect(cases.map((c) => c.budgetMs)).toEqual([60_000, 60_000, 300_000, 300_000]);
    expect(cases[2]!.groups!["route"]).toBe(cases[3]!.groups!["route"]);
    expect(cases[2]!.groups!["pack"]).not.toBe(cases[3]!.groups!["pack"]);
    expect(cases[0]!.groups!["route"]).not.toBe(cases[2]!.groups!["route"]);
  });

  it("keeps the router of a pair whole when the router has the separator", () => {
    const [one] = budgetCases([{ id: "i", boxes: 1 }], ["p+a+b"], parsePairBudget("5"));
    expect(one!.groups!["route"]).toBe("i\nroute\na+b");
    expect(keyParts(one!.id)).toEqual({ input: "i", pair: "p+a+b" });
  });
});

describe("earlierOverruns", () => {
  const line = (input: string, strategy: string, rest: Partial<PairLine>): PairLine => ({ stamp: "s", input, inputHash: "h", strategy, wallMs: 300_000, ...rest });

  it("gives the overruns of the inputs of the shard, in the order of the lines", () => {
    const lines = [
      line("i", "p+r", { tag: "over-budget", stage: "route" }),
      line("i", "q+r", {}),
      line("i", "s+r", { tag: "not-run", wallMs: 0 }),
      line("j", "p+r", { tag: "over-budget", stage: "route" }),
      line("i", "p+t", { tag: "over-budget", stage: "pack" }),
    ];
    expect(earlierOverruns(lines, [{ id: "i", boxes: 1 }])).toEqual([
      { kind: "over-budget", id: doneKey("i", "p+r"), budgetMs: 300_000, stage: "route" },
      { kind: "over-budget", id: doneKey("i", "p+t"), budgetMs: 300_000, stage: "pack" },
    ]);
  });

  it("refuses an overrun with no stage, because a resume cannot count it", () => {
    expect(() => earlierOverruns([line("i", "p+r", { tag: "over-budget" })], [{ id: "i", boxes: 1 }])).toThrow(RangeError);
  });
});

describe("budgetReport", () => {
  const input = (id: string, count: string): AnalysisInput => ({ id, seed: 1, spec: id, kind: "rect-grid", cell: { count } });
  const inputs = [input("small", "10"), input("large", "1000")];
  const record = (id: string, strategy: string, skipped?: string, stage?: string): LayoutRecord =>
    ({ input: id, strategy, options: stage === undefined ? {} : { budget: { budget: "5", stage } }, measures: {}, hard: {}, ...(skipped === undefined ? {} : { skipped }) }) as unknown as LayoutRecord;

  it("has no value when no pair has a tag, so a run with no budget has no table", () => {
    expect(budgetReport([record("small", "p+r")], inputs)).toBeUndefined();
  });

  it("gives the largest input that each router finished, and counts the tags apart", () => {
    const report = budgetReport(
      [
        record("small", "p+r"),
        record("large", "q+r"),
        record("large", "p+slow", OVER_BUDGET, "route"),
        record("large", "q+slow", NOT_RUN_OVER_BUDGET, "route"),
        record("small", "p+slow"),
        record("large", "s+none", OVER_BUDGET, "route"),
        record("large", "t+r", OVER_BUDGET, "pack"),
        record("large", "u+r", NOT_RUN_OVER_BUDGET, "pack"),
        record("large", "v+r", "no routes"),
      ],
      inputs,
    );
    expect(report).toEqual({
      budget: "5",
      routers: [
        { router: "none", largestFinished: undefined, finished: 0, overBudget: 1, notRun: 0 },
        { router: "r", largestFinished: 1000, finished: 2, overBudget: 0, notRun: 0 },
        { router: "slow", largestFinished: 10, finished: 1, overBudget: 1, notRun: 1 },
      ],
      pack: { overBudget: 1, notRun: 1 },
    });
    const lines = budgetLines(report!);
    expect(lines).toContain("| slow | 10 | 1 | 1 | 1 |");
    expect(lines).toContain("| none | none | 0 | 1 | 0 |");
    expect(lines.join("\n")).toContain("the route stage holds 2 routes");
    expect(lines.join("\n")).toContain("The pack stage has 1 pairs over budget, and 1 pairs that did not run.");
  });
});

describe("budgetTag", () => {
  const budget = parsePairBudget("5");

  it("gives an overrun its lower bound", () => {
    expect(budgetTag({ kind: "over-budget", id: doneKey("i", "p+r"), budgetMs: 300_000, stage: "route" }, budget)).toEqual({
      reason: OVER_BUDGET,
      facts: { budget: "5", budgetMs: 300_000, stage: "route", atLeastMs: 300_000 },
    });
  });

  it("gives a skip the 2 pairs that caused it, with another reason than an overrun", () => {
    const tag = budgetTag({ kind: "not-run", id: doneKey("i", "s+r"), budgetMs: 300_000, group: "i\nroute\nr", because: [doneKey("i", "p+r"), doneKey("i", "q+r")] }, budget);
    expect(tag.reason).toBe(NOT_RUN_OVER_BUDGET);
    expect(tag.reason).not.toBe(OVER_BUDGET);
    expect(tag.facts).toEqual({ budget: "5", budgetMs: 300_000, stage: "route", because: ["p+r", "q+r"] });
  });
});

describe("pairRuns with a budget", () => {
  const input = {
    schema: "layout-input/1" as const,
    id: "test/budget/s1",
    seed: 1,
    container: { fixed: "size" as const, w: 200, h: 200 },
    boxes: [{ id: "a", w: 20, h: 10 }, { id: "b", w: 10, h: 10 }],
    edges: [{ id: "e0", source: "a", target: "b", data: { collection: "c0" } }],
  };
  const options = { packs: PACK_ENTRIES.filter((p) => p.id === "rows" || p.id === "shelf"), routers: ["straight", "corners"] };

  it("tells the start of the pack stage once for each pack entry, and of the route stage for each pair", () => {
    const stages: string[] = [];
    const runs = [...pairRuns(input, undefined, { ...options, onStart: (pair, phase) => stages.push(`${phase} ${pair}`) })];
    expect(runs).toHaveLength(4);
    expect(stages).toEqual(["pack rows+straight", "route rows+straight", "route rows+corners", "pack shelf+straight", "route shelf+straight", "route shelf+corners"]);
  });

  it("gives a tagged pair its record, and does not pack or route for it", () => {
    const stages: string[] = [];
    const tag = { reason: OVER_BUDGET, facts: { budget: "5" } };
    const tags = new Map([["rows+straight", tag], ["rows+corners", tag]]);
    const runs = [...pairRuns(input, undefined, { ...options, tags, onStart: (pair) => stages.push(pair) })];
    expect(runs.slice(0, 2).map((run) => [run.record.strategy, run.record.skipped, run.record.ms])).toEqual([
      ["rows+straight", OVER_BUDGET, 0],
      ["rows+corners", OVER_BUDGET, 0],
    ]);
    expect((runs[0]!.record.options as { budget?: unknown }).budget).toEqual({ budget: "5" });
    expect(stages.every((pair) => pair.startsWith("shelf+"))).toBe(true);
    expect(runs[2]!.record.skipped).toBeUndefined();
  });
});
