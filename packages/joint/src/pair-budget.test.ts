import { describe, expect, it } from "vitest";
import { budgetCases, budgetTag, keyParts, NOT_RUN_OVER_BUDGET, OVER_BUDGET, pairBudgetMs, parsePairBudget } from "./pair-budget.ts";
import { pairRuns, PACK_ENTRIES } from "./runner.ts";
import { doneKey } from "./shard-run.ts";

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
  it("gives each pair that is not done, with a group for the pack entry and for the router of each input", () => {
    const cases = budgetCases([{ id: "i", boxes: 10 }, { id: "j", boxes: 1000 }], ["p+r", "q+r"], new Set([doneKey("i", "q+r")]), parsePairBudget("100:1,5"));
    expect(cases.map((c) => c.id)).toEqual([doneKey("i", "p+r"), doneKey("j", "p+r"), doneKey("j", "q+r")]);
    expect(cases.map((c) => c.budgetMs)).toEqual([60_000, 300_000, 300_000]);
    expect(cases[1]!.groups!["route"]).toBe(cases[2]!.groups!["route"]);
    expect(cases[1]!.groups!["pack"]).not.toBe(cases[2]!.groups!["pack"]);
    expect(cases[0]!.groups!["route"]).not.toBe(cases[1]!.groups!["route"]);
  });

  it("keeps the router of a pair whole when the router has the separator", () => {
    const [one] = budgetCases([{ id: "i", boxes: 1 }], ["p+a+b"], new Set(), parsePairBudget("5"));
    expect(one!.groups!["route"]).toBe("i\nroute\na+b");
    expect(keyParts(one!.id)).toEqual({ input: "i", pair: "p+a+b" });
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
    const tag = budgetTag({ kind: "not-run", id: doneKey("i", "s+r"), budgetMs: 300_000, group: "g", because: [doneKey("i", "p+r"), doneKey("i", "q+r")] }, budget);
    expect(tag.reason).toBe(NOT_RUN_OVER_BUDGET);
    expect(tag.reason).not.toBe(OVER_BUDGET);
    expect(tag.facts).toEqual({ budget: "5", budgetMs: 300_000, because: ["p+r", "q+r"] });
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
