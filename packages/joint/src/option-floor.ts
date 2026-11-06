// The floor per option of a walk sample (roadmap item L122, part 3). A stage compares its options, so each option needs a count of configs.
// The functions are pure. `sampleConfigs` of `sweep.ts` uses `stratumTarget` for the stratum of a sample.
import { canonicalConfig, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { optionFloor } from "@mark1russell7/rigor-statistics";
import { JOINT_SPACE } from "./space.ts";

/**
 * `FLOOR_SIGMA` is the standard deviation of one config value about the additive fit of its options.
 * The paired read of 2026-11-05 gave it, on the 216 configs of the epoch `packing-0.4.1`.
 */
export const FLOOR_SIGMA = 0.0243;

/** `FLOOR_DELTA` is the smallest difference between the means of two options that the floor finds. The same read gave it. */
export const FLOOR_DELTA = 0.0389;

/** `STRATUM_SHARE` is the share of the picks of a sample that go to the stratum, from the answer of the strategist of 2026-11-05. */
export const STRATUM_SHARE = 0.25;

/** The options of `stageFloors`. Each default is the value of the paired read of 2026-11-05. */
export interface FloorOptions {
  /** The spread of one config value. The default is `FLOOR_SIGMA`. */
  readonly sigma?: number;
  /** The smallest difference that the floor finds. The default is `FLOOR_DELTA`. */
  readonly delta?: number;
  /** The two-sided level of the family of a stage. The default is 0.05. */
  readonly alpha?: number;
  /** The share of comparisons that find a difference of `delta`. The default is 0.8. */
  readonly power?: number;
}

/**
 * This function gives the floor of each stage: the smallest count of configs for each option of the stage.
 * The family of a stage is its options, so a stage with `k` options has `k` tests in its Bonferroni family.
 * The count comes from `optionFloor` of `rigor-statistics`, by the Student t law.
 *
 * @param space - The strategy space. The default is `JOINT_SPACE`.
 * @param options - The spread, the difference and the targets.
 * @returns The floor of each stage, by the name of the stage.
 */
export function stageFloors(space: StrategySpace = JOINT_SPACE, options: FloorOptions = {}): Record<string, number> {
  const { sigma = FLOOR_SIGMA, delta = FLOOR_DELTA, alpha, power } = options;
  const out: Record<string, number> = {};
  for (const stage of space.stages) {
    out[stage.name] = optionFloor({ sigma, delta, tests: Math.max(1, stage.options.length), ...(alpha === undefined ? {} : { alpha }), ...(power === undefined ? {} : { power }) });
  }
  return out;
}

/** The count of one option of a stage in a set of configs. */
export interface OptionCount {
  readonly stage: string;
  readonly option: string;
  /** The count of the configs with this option. */
  readonly count: number;
  /** The count of each option if the configs that set the stage have each option of the stage equally often. */
  readonly uniform: number;
  /** The floor of the stage. */
  readonly floor: number;
}

/**
 * This function gives the count of each option of each stage, beside the uniform count and the floor of the stage.
 * An option that no config has gets a count of 0. A config with no option for an optional stage does not count for that stage.
 *
 * @param configs - The configs.
 * @param space - The strategy space. The default is `JOINT_SPACE`.
 * @param floors - The floor of each stage. The default is `stageFloors(space)`.
 * @returns One row for each option of each stage, in the order of the space.
 */
export function optionCounts(configs: Iterable<StrategyConfig>, space: StrategySpace = JOINT_SPACE, floors: Readonly<Record<string, number>> = stageFloors(space)): OptionCount[] {
  const counts = new Map<string, number>();
  for (const config of configs) {
    const c = canonicalConfig(space, config);
    for (const stage of space.stages) {
      const option = c.stages[stage.name]?.option;
      if (option !== undefined) counts.set(`${stage.name}=${option}`, (counts.get(`${stage.name}=${option}`) ?? 0) + 1);
    }
  }
  const out: OptionCount[] = [];
  for (const stage of space.stages) {
    const rows = stage.options.map((o) => ({ option: o.id, count: counts.get(`${stage.name}=${o.id}`) ?? 0 }));
    const set = rows.reduce((s, r) => s + r.count, 0);
    for (const r of rows) out.push({ stage: stage.name, option: r.option, count: r.count, uniform: set / stage.options.length, floor: floors[stage.name] ?? 0 });
  }
  return out;
}

/** The next target of the stratum: one option of one stage under its floor. */
export interface StratumTarget {
  readonly stage: string;
  readonly option: string;
}

/**
 * This function gives the next target of the stratum, or `undefined` when no option is under the floor of its stage.
 * The stage nearest to full goes first: the stage with the smallest positive sum of `floor - count` over its options.
 * In that stage, the option with the smallest count is the target. Equal values keep the order of the space.
 *
 * @param space - The strategy space.
 * @param counts - The count of each stratum, with the key `<stage>=<option>` (the keys of `strataCounts`).
 * @param floors - The floor of each stage.
 * @param skip - The keys `<stage>=<option>` that the function does not give, for example options with no config in the pool.
 */
export function stratumTarget(
  space: StrategySpace,
  counts: ReadonlyMap<string, number>,
  floors: Readonly<Record<string, number>>,
  skip: ReadonlySet<string> = new Set(),
): StratumTarget | undefined {
  let best: StratumTarget | undefined;
  let bestGap = Infinity;
  for (const stage of space.stages) {
    const floor = floors[stage.name] ?? 0;
    let gap = 0;
    let low: { option: string; count: number } | undefined;
    for (const o of stage.options) {
      const count = counts.get(`${stage.name}=${o.id}`) ?? 0;
      gap += Math.max(0, floor - count);
      if (count < floor && !skip.has(`${stage.name}=${o.id}`) && (low === undefined || count < low.count)) low = { option: o.id, count };
    }
    if (low !== undefined && gap < bestGap) [best, bestGap] = [{ stage: stage.name, option: low.option }, gap];
  }
  return best;
}
