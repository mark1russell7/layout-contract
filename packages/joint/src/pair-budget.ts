// The time budget of a pair of the joint benchmark (docs/JOINT-BENCH.md, "A time budget for each pair").
// The supervisor of @mark1russell7/rigor-bench holds each stage of a pair to the budget. This file gives it the cases of a shard, and gives the tag of each end.
import type { SupervisedCase, SupervisedEnd } from "@mark1russell7/rigor-bench/supervise";
import { packOf, routerOfPair } from "./analysis.ts";
import type { PairPhase, PairTag } from "./runner.ts";
import { doneKey } from "./shard-run.ts";

/** The reason of a pair that passed its budget. Its time is a lower bound: the pair ran for at least the budget. */
export const OVER_BUDGET = "over budget";

/** The reason of a pair that did not run, after 2 pairs of its router or its pack entry passed the budget on the input. This pair has no measurement. */
export const NOT_RUN_OVER_BUDGET = "not run: over budget on this input";

/** The budget of a run. The inputs of at most `boxes` boxes take the minutes of the first step that holds them, and each larger input takes `rest`. */
export interface PairBudget {
  /** The text of the option. The stamp of the run holds it. */
  readonly text: string;
  readonly steps: readonly { readonly boxes: number; readonly minutes: number }[];
  /** The minutes of an input above each step. */
  readonly rest: number;
}

/** One input of a shard. */
export interface BudgetInput {
  readonly id: string;
  readonly boxes: number;
}

/**
 * This function reads the option `--pair-budget`: a list of `<boxes>:<minutes>` steps from the smallest input to the largest, then the minutes of each larger input.
 * For example, `200:1,5` gives 1 minute to an input of at most 200 boxes, and 5 minutes to a larger input. The text `5` gives 5 minutes to each input.
 */
export function parsePairBudget(text: string): PairBudget {
  const parts = text.split(",").map((part) => part.trim());
  const minutesOf = (value: string): number => {
    const minutes = Number(value);
    if (value === "" || !(Number.isFinite(minutes) && minutes > 0)) throw new RangeError(`The minutes of the option --pair-budget are a number above 0, not "${value}".`);
    return minutes;
  };
  const rest = minutesOf(parts.at(-1)!);
  const steps = parts.slice(0, -1).map((part) => {
    const at = part.indexOf(":");
    const boxes = Number(part.slice(0, at));
    if (at <= 0 || !(Number.isInteger(boxes) && boxes > 0)) throw new RangeError(`A step of the option --pair-budget is <boxes>:<minutes>, not "${part}".`);
    return { boxes, minutes: minutesOf(part.slice(at + 1)) };
  });
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i]!.boxes <= steps[i - 1]!.boxes) throw new RangeError(`The steps of the option --pair-budget go from the smallest input to the largest, not "${text}".`);
  }
  return { text, steps, rest };
}

/** This function gives the budget of each stage of a pair on an input of `boxes` boxes, in milliseconds. */
export function pairBudgetMs(budget: PairBudget, boxes: number): number {
  const minutes = budget.steps.find((step) => boxes <= step.boxes)?.minutes ?? budget.rest;
  return minutes * 60_000;
}

/**
 * This function gives the supervised cases of a shard: each pair of each input that `done` does not hold.
 * An overrun in the stage `pack` counts for the pack entry on that input. An overrun in the stage `route` counts for the router on that input.
 */
export function budgetCases(inputs: readonly BudgetInput[], pairs: readonly string[], done: ReadonlySet<string>, budget: PairBudget): SupervisedCase[] {
  const stages = (input: string, pair: string): Readonly<Record<PairPhase, string>> => ({ pack: `${input}\npack\n${packOf(pair)}`, route: `${input}\nroute\n${routerOfPair(pair)}` });
  return inputs.flatMap((input) =>
    pairs
      .filter((pair) => !done.has(doneKey(input.id, pair)))
      .map((pair) => ({ id: doneKey(input.id, pair), budgetMs: pairBudgetMs(budget, input.boxes), groups: stages(input.id, pair) })),
  );
}

/** This function gives the input and the pair of a key of `doneKey`. */
export function keyParts(key: string): { readonly input: string; readonly pair: string } {
  const at = key.indexOf("\n");
  return { input: key.slice(0, at), pair: key.slice(at + 1) };
}

/** This function gives the tag of the record of a pair that did not finish. An overrun states its lower bound, and a skip names the 2 pairs that caused it. */
export function budgetTag(end: SupervisedEnd, budget: PairBudget): PairTag {
  const facts = { budget: budget.text, budgetMs: end.budgetMs };
  if (end.kind === "over-budget") return { reason: OVER_BUDGET, facts: { ...facts, stage: end.stage, atLeastMs: end.budgetMs } };
  return { reason: NOT_RUN_OVER_BUDGET, facts: { ...facts, because: end.because.map((key) => keyParts(key).pair) } };
}
