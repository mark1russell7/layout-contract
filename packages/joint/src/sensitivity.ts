import { mulberry32, type StrategyConfig } from "@mark1russell7/layout-contract";
import type { SweepState } from "./night.ts";

/** A group of the space: a function from a config to its level, for example the option of the router. */
export interface SensitivityGroup {
  readonly name: string;
  readonly of: (config: StrategyConfig) => string;
}

/** This function gives the group of one stage of the space. The level is the option of the stage, or `none` when the config has no choice for it. */
export function stageGroup(name: string, stage: string): SensitivityGroup {
  return { name, of: (config) => config.stages[stage]?.option ?? "none" };
}

/** The groups of the joint space: the router, the lane mode and the pack entry. */
export const JOINT_GROUPS: readonly SensitivityGroup[] = Object.freeze([
  stageGroup("router", "highways.router"),
  stageGroup("lanes", "lanes.mode"),
  stageGroup("pack", "packing.entry"),
]);

/** The options of `firstOrder`. */
export interface FirstOrderOptions {
  /** The count of the bootstrap draws over the inputs. The default is 2000. */
  readonly draws?: number;
  /** The seed of the bootstrap. The default is 1. */
  readonly seed?: number;
  /** The share of the interval. The default is 0.95. */
  readonly level?: number;
  /** With a group and a level, the function uses only the configs at that level, for example `{ group: "router", level: "corners" }`. */
  readonly within?: { readonly group: string; readonly level: string };
}

/** The first-order index of one group. */
export interface GroupIndex {
  readonly name: string;
  /** The count of the configs at each level. */
  readonly levels: Readonly<Record<string, number>>;
  /** The correlation ratio: the between-level sum of squares divided by the total sum of squares. */
  readonly eta2: number;
  /** The bias-corrected correlation ratio (epsilon squared). It removes the share that `k - 1` levels give to noise. It can be below 0. */
  readonly eps2: number;
  /** The bootstrap interval of `eps2` over the inputs. */
  readonly low: number;
  readonly high: number;
}

/** The bootstrap interval of the difference of the `eps2` of two groups, over the same draws. */
export interface GroupDifference {
  readonly a: string;
  readonly b: string;
  readonly low: number;
  readonly high: number;
}

/** The first-order indices of the groups on the mean score of the configs. */
export interface FirstOrder {
  readonly configs: number;
  /** The count of the inputs where each config has a value. Only these inputs count, so the race of the sweep gives no bias. */
  readonly inputs: number;
  readonly draws: number;
  readonly level: number;
  readonly within?: { readonly group: string; readonly level: string };
  readonly groups: readonly GroupIndex[];
  /** The difference of each pair of groups, in the order of the groups. */
  readonly differences: readonly GroupDifference[];
}

/** This function gives the correlation ratio and its bias-corrected form of the values `y` with the levels `labels`. */
export function correlationRatio(y: readonly number[], labels: readonly string[]): { readonly eta2: number; readonly eps2: number } {
  const n = y.length;
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const by = new Map<string, number[]>();
  y.forEach((v, i) => {
    const a = by.get(labels[i]!);
    if (a === undefined) by.set(labels[i]!, [v]);
    else a.push(v);
  });
  let ssb = 0;
  let ssw = 0;
  for (const a of by.values()) {
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    ssb += a.length * (m - mean) ** 2;
    for (const v of a) ssw += (v - m) ** 2;
  }
  const sst = ssb + ssw;
  const k = by.size;
  if (sst === 0 || n <= k) return { eta2: 0, eps2: 0 };
  return { eta2: ssb / sst, eps2: (ssb - (k - 1) * (ssw / (n - k))) / sst };
}

/** This function gives the value at the share `p` of the sorted values. */
function quantile(sorted: readonly number[], p: number): number {
  return sorted[Math.round(p * (sorted.length - 1))]!;
}

/**
 * This function gives the first-order index of each group on the sweep score.
 * The response of a config is its mean score over the inputs where each config has a value. A bootstrap over these inputs gives the intervals.
 * The configs are a sample of the space, not a full design. Thus a group that the sample confounds with another group shares its index. The total indices need the design of Saltelli.
 */
export function firstOrder(state: SweepState, groups: readonly SensitivityGroup[] = JOINT_GROUPS, options: FirstOrderOptions = {}): FirstOrder {
  const draws = options.draws ?? 2000;
  const level = options.level ?? 0.95;
  if (!(Number.isInteger(draws) && draws > 0)) throw new RangeError(`firstOrder: draws is an integer above 0, not ${draws}.`);
  if (!(level > 0 && level < 1)) throw new RangeError(`firstOrder: level is between 0 and 1, not ${level}.`);
  const byName = new Map(groups.map((g) => [g.name, g]));
  let ids = Object.keys(state.values).filter((id) => state.configs[id] !== undefined);
  if (options.within !== undefined) {
    const g = byName.get(options.within.group);
    if (g === undefined) throw new RangeError(`firstOrder: there is no group "${options.within.group}". The groups are ${[...byName.keys()].join(", ")}.`);
    ids = ids.filter((id) => g.of(state.configs[id]!.config) === options.within!.level);
  }
  const shared = state.inputs.map((_, i) => i).filter((i) => ids.every((id) => state.values[id]![i] !== null));
  if (ids.length < 2 || shared.length === 0) throw new RangeError(`firstOrder: the state has ${ids.length} configs and ${shared.length} shared inputs. It needs 2 configs and 1 input.`);
  const labels = groups.map((g) => ids.map((id) => g.of(state.configs[id]!.config)));
  const response = (inputs: readonly number[]): number[] => ids.map((id) => inputs.reduce((s, i) => s + state.values[id]![i]!, 0) / inputs.length);

  const random = mulberry32(options.seed ?? 1);
  const boot = groups.map(() => [] as number[]);
  for (let b = 0; b < draws; b++) {
    const y = response(shared.map(() => shared[Math.floor(random() * shared.length)]!));
    labels.forEach((l, g) => boot[g]!.push(correlationRatio(y, l).eps2));
  }
  const tail = (1 - level) / 2;
  const interval = (values: readonly number[]): { low: number; high: number } => {
    const s = [...values].sort((a, b) => a - b);
    return { low: quantile(s, tail), high: quantile(s, 1 - tail) };
  };
  const point = response(shared);
  const indices = groups.map((g, k) => {
    const levels: Record<string, number> = {};
    for (const l of labels[k]!) levels[l] = (levels[l] ?? 0) + 1;
    return { name: g.name, levels, ...correlationRatio(point, labels[k]!), ...interval(boot[k]!) };
  });
  const differences: GroupDifference[] = [];
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) differences.push({ a: groups[a]!.name, b: groups[b]!.name, ...interval(boot[a]!.map((v, i) => v - boot[b]![i]!)) });
  }
  return { configs: ids.length, inputs: shared.length, draws, level, ...(options.within === undefined ? {} : { within: options.within }), groups: indices, differences };
}

/** This function gives the Markdown table of a result of `firstOrder`. */
export function firstOrderMarkdown(result: FirstOrder): string {
  const f = (v: number): string => v.toFixed(3);
  const pct = Math.round(result.level * 100);
  const scope = result.within === undefined ? "all configs" : `the configs with ${result.within.group} = ${result.within.level}`;
  return [
    `First-order indices on ${scope}: ${result.configs} configs, ${result.inputs} shared inputs, ${result.draws} bootstrap draws.`,
    "",
    `| Group | Levels | eta² | eps² | ${pct}% interval of eps² |`,
    "|---|---|---|---|---|",
    ...result.groups.map((g) => `| ${g.name} | ${Object.keys(g.levels).length} | ${f(g.eta2)} | ${f(g.eps2)} | ${f(g.low)} to ${f(g.high)} |`),
    "",
    `| Difference | ${pct}% interval |`,
    "|---|---|",
    ...result.differences.map((d) => `| ${d.a} − ${d.b} | ${f(d.low)} to ${f(d.high)} |`),
    "",
  ].join("\n");
}
