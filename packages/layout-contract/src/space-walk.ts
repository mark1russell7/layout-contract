// The walk draw of a sample of a strategy space (`docs/STRATEGY-SPACE.md`). The package root does not export this file.
import type { OptionRef, SpaceConstraint, SpaceStage, StageOption } from "./strategy-space.ts";

const refMatches = (ref: OptionRef, choices: ReadonlyMap<string, string | null>): boolean => (choices.get(ref.stage) ?? null) === ref.option;

/** This function tells if the option choices keep a constraint. */
export function holds(c: SpaceConstraint, choices: ReadonlyMap<string, string | null>): boolean {
  if (!refMatches(c.if, choices)) return true;
  return "not" in c.then ? !refMatches(c.then.not, choices) : refMatches(c.then, choices);
}

const otherStage = (c: SpaceConstraint): string => ("not" in c.then ? c.then.not.stage : c.then.stage);

/** This function tells if an option of a stage keeps each constraint between that stage and the stages that a walk has fixed. */
export function fitsWalk(constraints: readonly SpaceConstraint[], fixed: Map<string, string | null>, stage: string, id: string | null): boolean {
  fixed.set(stage, id);
  const ok = constraints.every((c) => !fixed.has(c.if.stage === stage ? otherStage(c) : c.if.stage) || holds(c, fixed));
  fixed.delete(stage);
  return ok;
}

/** The order of the stages of a walk, and the constraints that name each stage. */
export interface WalkPlan {
  /** The stages of the space. */
  readonly stages: readonly SpaceStage[];
  /** The options of each stage for a draw. */
  readonly lists: readonly (readonly (StageOption | null)[])[];
  /** The indexes of the stages. The stages of `first` come first, in the order of the space. The others follow, from the largest stage to the smallest. */
  readonly order: readonly number[];
  /** The constraints that name each stage. */
  readonly naming: readonly (readonly SpaceConstraint[])[];
  /** The count of points of a round. */
  readonly n: number;
}

/**
 * This function gives the plan of a walk. Stages of equal size keep the order of the space.
 * The stages of `first` go first, for example the stages of the sample option `fixed`. Thus the other stages draw only from the options that keep the constraints with them.
 */
export function walkPlan(
  stages: readonly SpaceStage[],
  lists: readonly (readonly (StageOption | null)[])[],
  constraints: readonly SpaceConstraint[],
  n: number,
  first: ReadonlySet<string> = new Set(),
): WalkPlan {
  return {
    stages,
    lists,
    n,
    order: stages.map((_, k) => k).sort((a, b) => Number(first.has(stages[b]!.name)) - Number(first.has(stages[a]!.name)) || lists[b]!.length - lists[a]!.length || a - b),
    naming: stages.map((s) => constraints.filter((c) => c.if.stage === s.name || otherStage(c) === s.name)),
  };
}

/**
 * This function gives the options of one point of a walk. It fixes the largest stage first. Thus that stage keeps its equal strata, and the constraints limit only the smaller stages.
 * The value `picks[k][i]` is the stratum of the stage `k` for the point `i`. A stage with no open option gets `null`, and the caller rejects that point.
 * The argument `fits` lets a test give a fault. The default is `fitsWalk`.
 */
export function walkPoint(plan: WalkPlan, picks: readonly (readonly number[])[], i: number, fits: typeof fitsWalk = fitsWalk): Map<string, StageOption | null> {
  const fixed = new Map<string, string | null>();
  const out = new Map<string, StageOption | null>();
  for (const k of plan.order) {
    const s = plan.stages[k]!;
    const open = plan.lists[k]!.filter((o) => fits(plan.naming[k]!, fixed, s.name, o?.id ?? null));
    const o = open[Math.floor((picks[k]![i]! * open.length) / plan.n)] ?? null;
    fixed.set(s.name, o?.id ?? null);
    out.set(s.name, o);
  }
  return out;
}
