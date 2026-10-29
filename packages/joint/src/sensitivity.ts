import { canonicalConfig, configId, enumerateSpace, mulberry32, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
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

/** One row of a Saltelli design: the config ids of the matrices `A` and `B`, and of `AB_i` for each stage `i`. */
export interface SaltelliRow {
  readonly a: string;
  readonly b: string;
  /** The config of `A` with the choice of one stage from `B`, by stage. */
  readonly ab: Readonly<Record<string, string>>;
}

/** A Saltelli design over the stages of a space. The sweep keeps it in the state, so the analysis reads the rows later. */
export interface SaltelliDesign {
  readonly date: string;
  readonly n: number;
  readonly seed: number;
  readonly stages: readonly string[];
  readonly rows: readonly SaltelliRow[];
}

/**
 * This function gives a Saltelli design with `n` rows. The matrices `A` and `B` are the two halves of a sample of `2n` configs of the space.
 * `AB_i` is the row of `A` with the choice of stage `i` from the row of `B`. Each stage is one factor, with its options and its params.
 * The configs are the unique configs of all matrices, by id. A design of `n` rows has at most `n * (k + 2)` configs for `k` stages.
 */
export function saltelliDesign(space: StrategySpace, n: number, seed: number, date: string): { readonly design: SaltelliDesign; readonly configs: Readonly<Record<string, StrategyConfig>> } {
  if (!(Number.isInteger(n) && n >= 2)) throw new RangeError(`saltelliDesign: n is an integer of 2 or more, not ${n}.`);
  const sample = [...enumerateSpace(space, { mode: "sample", n: 2 * n, seed })].map((c) => canonicalConfig(space, c));
  if (sample.length < 2 * n) throw new RangeError(`saltelliDesign: the space gives ${sample.length} configs, not ${2 * n}.`);
  const stages = space.stages.map((s) => s.name);
  const configs: Record<string, StrategyConfig> = {};
  const add = (config: StrategyConfig): string => {
    const c = canonicalConfig(space, config);
    const id = configId(space, c);
    configs[id] ??= c;
    return id;
  };
  const rows: SaltelliRow[] = [];
  for (let j = 0; j < n; j++) {
    const a = sample[j]!;
    const b = sample[n + j]!;
    const ab: Record<string, string> = {};
    for (const stage of stages) ab[stage] = add({ space: a.space, stages: { ...a.stages, [stage]: b.stages[stage] ?? null } });
    rows.push({ a: add(a), b: add(b), ab });
  }
  return { design: { date, n, seed, stages, rows }, configs };
}

/** The first and total indices of one stage, with their bootstrap intervals. */
export interface StageIndex {
  readonly stage: string;
  /** The first-order index of Saltelli (2010): the mean of `(f(B) - mean) * (f(AB_i) - f(A))`, divided by the variance. */
  readonly first: number;
  /** The total index of Jansen (1999): the mean of `(f(A) - f(AB_i))^2`, divided by 2 times the variance. */
  readonly total: number;
  readonly firstLow: number;
  readonly firstHigh: number;
  readonly totalLow: number;
  readonly totalHigh: number;
}

/** The indices of a Saltelli design. */
export interface TotalOrder {
  /** The rows where each config has a value on each shared input. */
  readonly rows: number;
  readonly inputs: number;
  readonly draws: number;
  readonly level: number;
  readonly stages: readonly StageIndex[];
}

/**
 * This function gives the first and total index of each stage of a design on the sweep score.
 * The response of a config is its mean score over the inputs where each config of the design has a value. A bootstrap over the rows gives the intervals.
 * The sum of the totals minus the sum of the firsts shows the share of the interactions.
 */
export function totalOrder(state: SweepState, design: SaltelliDesign, options: Omit<FirstOrderOptions, "within"> = {}): TotalOrder {
  const draws = options.draws ?? 2000;
  const level = options.level ?? 0.95;
  if (!(Number.isInteger(draws) && draws > 0)) throw new RangeError(`totalOrder: draws is an integer above 0, not ${draws}.`);
  const ids = [...new Set(design.rows.flatMap((r) => [r.a, r.b, ...Object.values(r.ab)]))].filter((id) => state.values[id] !== undefined);
  const shared = state.inputs.map((_, i) => i).filter((i) => ids.every((id) => state.values[id]![i] !== null));
  const mean = new Map(ids.map((id) => [id, shared.reduce((s, i) => s + state.values[id]![i]!, 0) / Math.max(1, shared.length)]));
  const rows = design.rows.filter((r) => [r.a, r.b, ...Object.values(r.ab)].every((id) => mean.has(id)));
  if (rows.length < 2 || shared.length === 0) throw new RangeError(`totalOrder: the state has ${rows.length} full rows and ${shared.length} shared inputs. It needs 2 rows and 1 input.`);
  const f = (id: string): number => mean.get(id)!;
  const indices = (pick: readonly number[]): { first: number; total: number }[] => {
    const ys = pick.flatMap((j) => [f(rows[j]!.a), f(rows[j]!.b)]);
    const m = ys.reduce((s, v) => s + v, 0) / ys.length;
    const v = ys.reduce((s, y) => s + (y - m) ** 2, 0) / ys.length;
    return design.stages.map((stage) => {
      if (v === 0) return { first: 0, total: 0 };
      let first = 0;
      let total = 0;
      for (const j of pick) {
        const r = rows[j]!;
        const ab = f(r.ab[stage]!);
        // The responses are centered on the mean, so a gap between the means of A and B does not bias the first index.
        first += (f(r.b) - m) * (ab - f(r.a));
        total += (f(r.a) - ab) ** 2;
      }
      return { first: first / pick.length / v, total: total / pick.length / (2 * v) };
    });
  };
  const all = rows.map((_, j) => j);
  const point = indices(all);
  const random = mulberry32(options.seed ?? 1);
  const boot = Array.from({ length: draws }, () => indices(all.map(() => Math.floor(random() * rows.length))));
  const tail = (1 - level) / 2;
  const interval = (values: number[]): [number, number] => {
    values.sort((a, b) => a - b);
    return [quantile(values, tail), quantile(values, 1 - tail)];
  };
  const stages = design.stages.map((stage, k) => {
    const [firstLow, firstHigh] = interval(boot.map((b) => b[k]!.first));
    const [totalLow, totalHigh] = interval(boot.map((b) => b[k]!.total));
    return { stage, first: point[k]!.first, total: point[k]!.total, firstLow, firstHigh, totalLow, totalHigh };
  });
  return { rows: rows.length, inputs: shared.length, draws, level, stages };
}

/** This function gives the Markdown table of a result of `totalOrder`. */
export function totalOrderMarkdown(result: TotalOrder): string {
  const f = (v: number): string => v.toFixed(3);
  const pct = Math.round(result.level * 100);
  return [
    `The indices of a Saltelli design: ${result.rows} rows, ${result.inputs} shared inputs, ${result.draws} bootstrap draws over the rows.`,
    "",
    `| Stage | First | ${pct}% interval | Total | ${pct}% interval |`,
    "|---|---|---|---|---|",
    ...result.stages.map((s) => `| ${s.stage} | ${f(s.first)} | ${f(s.firstLow)} to ${f(s.firstHigh)} | ${f(s.total)} | ${f(s.totalLow)} to ${f(s.totalHigh)} |`),
    "",
  ].join("\n");
}
