// The nightly sweep over the joint space (roadmap item L35, `docs/SWEEP.md`). It plans the nights, scores the records, races the configs and keeps the summary.
// The functions are pure. The script `scripts/sweep.mjs` reads and writes the files, and runs the shards with `runInput`.
import {
  canonicalConfig,
  configId,
  enumerateSpace,
  selectBest,
  verdict,
  type LayoutRecord,
  type StrategyConfig,
  type StrategySpace,
  type VerdictRecord,
} from "@mark1russell7/layout-contract";
import { iterPlanPairs } from "./lanes.ts";
import { HEADLINE, PICK_LEVELS, pickValues } from "./pick.ts";
import { plannedCost, planShards, type ShardPlan } from "./plan.ts";
import { configRun, JOINT_SPACE, type ConfigRun } from "./space.ts";

/** The schema of the state of the sweep on the data branch. */
export const SWEEP_SCHEMA = "sweep-state/1";

/** The named configs of the baseline arm. Each night runs them on each input of the corpus, for the paired comparisons. */
export const BASELINE_ARM: readonly string[] = Object.freeze(["rows+portfolio", "select+portfolio", "lanes-sides.maxrects-cp.corners+corners"]);

/** The named config that the race compares each config with: the best pair of L13 on the headline cell. */
export const INCUMBENT = "lanes-sides.maxrects-cp.corners+corners";

/** The measure of the race and of the summary: `joint.fill` when the config reaches the floor of the reference, else 0. */
export const SWEEP_SCORE = "sweep.score";

/** The minimum effect of the race on `sweep.score`. A smaller change of a family mean is a tie. */
export const SWEEP_TIE = 0.005;

/** The significance level of the race. */
export const SWEEP_LEVEL = 0.05;

/** The factor of the successive halving: the race keeps 1 config of each `SWEEP_ETA`. */
export const SWEEP_ETA = 3;

/** The count of the bins of a numeric param in the strata of the coverage. */
export const SWEEP_BINS = 3;

/** The part of the budget of a round that the plan fills. The rest is the margin of the plan. */
export const SWEEP_FILL = 0.9;

/** The least part of the screen inputs that a config needs before the race decides on it. */
export const SCREEN_SHARE = 0.8;

/** The seed of a night: the date `YYYY-MM-DD` as the number `YYYYMMDD`. Thus each night has a new sample, and a rerun of a night has the same sample. */
export function nightSeed(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) throw new RangeError(`The date of a night has the form YYYY-MM-DD, not "${date}".`);
  return Number(`${m[1]}${m[2]}${m[3]}`);
}

/** The facts of one input of the corpus that the sweep uses. */
export interface SweepInput {
  readonly id: string;
  readonly spec: string;
  /** The board kind: the first part of the id after the corpus, for example `rect-grid`. The summary groups by it. */
  readonly kind: string;
  readonly seed: number;
  /** This value is `true` for an input of the stress cell. */
  readonly stress: boolean;
  readonly boxes: number;
  readonly edges: number;
}

/** This function gives the inputs of the screen of round 1: seed 1 of each spec. */
export function screenInputs(inputs: readonly SweepInput[]): SweepInput[] {
  return inputs.filter((i) => i.seed === 1);
}

/** The cell of an input in the summary: `stress` for an input of the stress cell, else `headline`. */
export function cellOf(input: Pick<SweepInput, "stress">): "headline" | "stress" {
  return input.stress ? "stress" : "headline";
}

/**
 * This function gives the strata of a config for the coverage: one stratum for each stage, each pair of stages and each param bin.
 * A numeric param with a range gets `SWEEP_BINS` bins of equal width. Another param gets one stratum for each value.
 */
export function strataOf(config: StrategyConfig, space: StrategySpace = JOINT_SPACE): string[] {
  const c = canonicalConfig(space, config);
  const out: string[] = [];
  const picks = space.stages.map((s) => `${s.name}=${c.stages[s.name]?.option ?? "none"}`);
  out.push(...picks);
  for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) out.push(`${picks[i]}&${picks[j]}`);
  for (const stage of space.stages) {
    const choice = c.stages[stage.name] ?? null;
    if (choice === null) continue;
    const option = stage.options.find((o) => o.id === choice.option);
    for (const p of option?.params ?? []) {
      const v = choice.params?.[p.name];
      if (typeof v === "number" && p.min !== undefined && p.max !== undefined && p.max > p.min) {
        const bin = Math.min(SWEEP_BINS - 1, Math.floor(((v - p.min) / (p.max - p.min)) * SWEEP_BINS));
        out.push(`${stage.name}=${choice.option}.${p.name}#${bin}`);
      } else out.push(`${stage.name}=${choice.option}.${p.name}=${String(v)}`);
    }
  }
  return out;
}

/** This function gives the count of the configs in each stratum. */
export function strataCounts(configs: Iterable<StrategyConfig>, space: StrategySpace = JOINT_SPACE): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of configs) for (const s of strataOf(c, space)) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

/** This function gives the coverage need of a config: the sum of `1 / (1 + count)` over its strata. A config in less covered strata has a larger need. */
export function coverageNeed(strata: readonly string[], counts: ReadonlyMap<string, number>): number {
  return strata.reduce((s, x) => s + 1 / (1 + (counts.get(x) ?? 0)), 0);
}

/** The options of `sampleConfigs`. */
export interface SampleConfigsOptions {
  /** The largest count of configs. */
  readonly n: number;
  /** The seed of the sample, for example `nightSeed` of the date. */
  readonly seed: number;
  /** The ids of the configs that the sweep knows. The sample has none of them. */
  readonly known: ReadonlySet<string>;
  /** The counts of the strata of the known configs. The default is no count. */
  readonly counts?: ReadonlyMap<string, number>;
  /** The factor of the pool: the Latin hypercube draws `oversample * n` configs. The default is 8. */
  readonly oversample?: number;
}

/**
 * This function gives a sample of new configs: a Latin hypercube of `enumerateSpace` with the seed, and then the configs of the largest coverage need.
 * Each pick adds its strata to the counts, so the next pick goes to other strata. Equal needs keep the order of the pool.
 */
export function sampleConfigs(options: SampleConfigsOptions, space: StrategySpace = JOINT_SPACE): StrategyConfig[] {
  const { n, seed, known } = options;
  if (!(Number.isInteger(n) && n >= 0)) throw new RangeError(`The count of the sample is an integer of 0 or more, not ${n}.`);
  if (n === 0) return [];
  const pool: { id: string; config: StrategyConfig; strata: string[] }[] = [];
  const seen = new Set(known);
  for (const config of enumerateSpace(space, { mode: "sample", n: n * (options.oversample ?? 8), seed })) {
    const id = configId(space, config);
    if (seen.has(id)) continue;
    seen.add(id);
    pool.push({ id, config: canonicalConfig(space, config), strata: strataOf(config, space) });
  }
  const counts = new Map(options.counts ?? []);
  const out: StrategyConfig[] = [];
  const free = new Set(pool.keys());
  while (out.length < n && free.size > 0) {
    let best = -1;
    let need = -Infinity;
    for (const k of free) {
      const v = coverageNeed(pool[k]!.strata, counts);
      if (v > need) [best, need] = [k, v];
    }
    free.delete(best);
    const pick = pool[best]!;
    out.push(pick.config);
    for (const s of pick.strata) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return out;
}

/**
 * This function gives the planned cost of one config on one input in milliseconds. It is one pair and the lane passes, times the margin of the spec.
 * An iteration config also has the cost of its chain: `iterPlanPairs`, 3 pairs for each round.
 */
export function jobCost(run: Pick<ConfigRun, "passes"> & Partial<Pick<ConfigRun, "iter">>, input: Pick<SweepInput, "spec" | "boxes" | "edges">): number {
  const pairs = 1 + (run.iter === undefined ? 0 : iterPlanPairs([run.iter]));
  return plannedCost(input.spec, input.boxes, input.edges, pairs, run.passes);
}

/** One job of a round: one config on one input. */
export interface SweepJob {
  readonly config: string;
  readonly input: string;
}

/** One unit of work: one call of `runInput` on one input with some configs. */
export interface SweepUnit {
  /** The id: `<input id>#<count>`. */
  readonly id: string;
  readonly input: string;
  readonly configs: readonly string[];
  /** The planned cost in milliseconds. */
  readonly cost: number;
}

/**
 * This function joins the jobs of each input into units, in the order of the jobs. A unit gets configs while its planned cost stays at `maxCost` or less.
 * A config with a larger cost gets a unit of its own. The configs of one unit share their packs and their routes.
 */
export function unitsOf(jobs: readonly SweepJob[], cost: (job: SweepJob) => number, maxCost: number): SweepUnit[] {
  const byInput = new Map<string, SweepJob[]>();
  for (const j of jobs) byInput.set(j.input, [...(byInput.get(j.input) ?? []), j]);
  const units: SweepUnit[] = [];
  for (const [input, list] of byInput) {
    let configs: string[] = [];
    let sum = 0;
    const close = (): void => {
      if (configs.length > 0) units.push({ id: `${input}#${units.filter((u) => u.input === input).length}`, input, configs, cost: sum });
      configs = [];
      sum = 0;
    };
    for (const j of list) {
      const c = cost(j);
      if (configs.length > 0 && sum + c > maxCost) close();
      configs.push(j.config);
      sum += c;
    }
    close();
  }
  return units;
}

/** The plan of one round: the units, the shards and the planned cost of each shard. */
export interface RoundPlan extends ShardPlan {
  readonly units: readonly SweepUnit[];
}

/**
 * This function gives the units of a round to shards with `planShards`. The first count of the shards is the planned cost over `target`.
 * While the most costly shard is above `target`, the plan adds a shard, up to `maxShards`.
 * The spec of a unit is the spec of its input, so the units of a spec go to different shards.
 */
export function planRound(units: readonly SweepUnit[], specOf: (input: string) => string, target: number, maxShards: number): RoundPlan {
  const sum = units.reduce((s, u) => s + u.cost, 0);
  const items = units.map((u) => ({ id: u.id, spec: specOf(u.input), cost: u.cost }));
  let count = Math.max(1, Math.min(maxShards, Math.ceil(sum / target)));
  let plan = planShards(items, count);
  while (count < maxShards && Math.max(...plan.loads) > target) plan = planShards(items, ++count);
  return { ...plan, units };
}

/** The values of one config on one input. */
export interface SweepValue {
  /** `joint.fill` when the config reaches the floor of the reference, else 0. */
  readonly score: number;
  /** This value is `true` when the config reaches the floor of the reference. */
  readonly reached: boolean;
  readonly fill: number;
  readonly hard: number;
  readonly excess: number;
  readonly ms: number;
  /** This value is `true` when the runner skipped the config on the input. A skipped config does not reach the floor. */
  readonly skipped: boolean;
}

/** The pick values of the configs of the baseline arm on one input, in the order of `BASELINE_ARM`. A missing or skipped record has `null`. */
export type Reference = readonly (Readonly<Record<string, number>> | null)[];

/** This function gives the pick values of a record in the headline cell (rule `all`, cap 1.25), or `null` for a skipped record. */
export function pickOf(record: LayoutRecord): Record<string, number> | null {
  if (record.skipped !== undefined) return null;
  return pickValues(record, HEADLINE.rule, HEADLINE.cap);
}

/**
 * This function gives the values of a record against the reference of its input.
 * The floor is the set that `selectBest` keeps after the overflow level, over the reference and the record. The record reaches the floor when it is in the set.
 * Thus the floor is fixed by the baseline arm, and the scores of two nights are comparable.
 */
export function sweepValue(record: LayoutRecord, reference: Reference): SweepValue {
  const pick = pickOf(record);
  if (pick === null) return { score: 0, reached: false, fill: 0, hard: 0, excess: 0, ms: record.ms, skipped: true };
  const candidates = [
    ...reference.flatMap((v, i) => (v === null ? [] : [{ id: `ref${i}`, values: v }])),
    { id: "config", values: pick },
  ];
  const reached = selectBest(candidates, PICK_LEVELS).kept[1]!.includes("config");
  const fill = pick["joint.fill"] ?? 0;
  return { score: reached ? fill : 0, reached, fill, hard: pick["hard"] ?? 0, excess: pick["pack.overflow.excessArea"] ?? 0, ms: record.ms, skipped: false };
}

/** One row of the summary: the sums of one config in one cell and one board kind. */
export interface SummaryRow {
  readonly config: string;
  readonly cell: "headline" | "stress";
  /** The board kind of the inputs. */
  readonly family: string;
  /** The count of the inputs. */
  n: number;
  /** The count of the inputs where the config does not reach the floor of the reference. */
  misses: number;
  skipped: number;
  /** The sums of `sweep.score`, `joint.fill`, the hard value, the overflow area and the time in milliseconds. */
  score: number;
  fill: number;
  hard: number;
  excess: number;
  ms: number;
  /** The paired comparison with each config of the baseline arm, by its name. It has the wins, the losses, the ties and the sum of the differences. */
  vs: Record<string, { wins: number; losses: number; ties: number; diff: number }>;
}

/** This function gives the key of a summary row. */
export function rowKey(config: string, cell: string, family: string): string {
  return `${config}|${cell}|${family}`;
}

/**
 * This function adds the value of a config on a new input to the summary.
 * `baseline` gives the score of each config of the baseline arm on the input, by name. A missing score gives no paired count.
 */
export function addToSummary(
  rows: Map<string, SummaryRow>,
  config: string,
  input: Pick<SweepInput, "kind" | "stress">,
  value: SweepValue,
  baseline: Readonly<Record<string, number | undefined>>,
): void {
  const cell = cellOf(input);
  const key = rowKey(config, cell, input.kind);
  let row = rows.get(key);
  if (row === undefined) {
    row = { config, cell, family: input.kind, n: 0, misses: 0, skipped: 0, score: 0, fill: 0, hard: 0, excess: 0, ms: 0, vs: {} };
    rows.set(key, row);
  }
  row.n++;
  if (!value.reached) row.misses++;
  if (value.skipped) row.skipped++;
  row.score += value.score;
  row.fill += value.fill;
  row.hard += value.hard;
  row.excess += value.excess;
  row.ms += value.ms;
  for (const [name, b] of Object.entries(baseline)) {
    if (b === undefined) continue;
    const vs = (row.vs[name] ??= { wins: 0, losses: 0, ties: 0, diff: 0 });
    const d = value.score - b;
    if (Math.abs(d) <= SWEEP_TIE) vs.ties++;
    else if (d > 0) vs.wins++;
    else vs.losses++;
    vs.diff += d;
  }
}

/** The columns of a summary row in the file `summary.json`, before the paired columns. */
export const SUMMARY_COLUMNS: readonly string[] = Object.freeze(["config", "cell", "family", "n", "misses", "skipped", "score", "fill", "hard", "excess", "ms"]);

/** The paired columns of each config of the baseline arm, after `SUMMARY_COLUMNS`. */
export const PAIRED_COLUMNS: readonly string[] = Object.freeze(["wins", "losses", "ties", "diff"]);

/** The summary as a table: one array for each row, with the columns `SUMMARY_COLUMNS`, and then `PAIRED_COLUMNS` for each name of `baseline`. */
export interface SummaryTable {
  readonly columns: readonly string[];
  readonly baseline: readonly string[];
  readonly rows: readonly (readonly (string | number | null)[])[];
}

/** This function gives the summary as a table. The sums have 6 digits after the point. A row without a paired count of a baseline config has `null` there. */
export function summaryTable(rows: readonly SummaryRow[], baseline: readonly string[] = BASELINE_ARM): SummaryTable {
  const r6 = (x: number): number => Number(x.toFixed(6));
  return {
    columns: [...SUMMARY_COLUMNS, ...baseline.flatMap((b) => PAIRED_COLUMNS.map((c) => `${b}.${c}`))],
    baseline,
    rows: rows.map((r) => [
      r.config,
      r.cell,
      r.family,
      r.n,
      r.misses,
      r.skipped,
      r6(r.score),
      r6(r.fill),
      r6(r.hard),
      r6(r.excess),
      Math.round(r.ms),
      ...baseline.flatMap((b) => {
        const v = r.vs[b];
        return v === undefined ? [null, null, null, null] : [v.wins, v.losses, v.ties, r6(v.diff)];
      }),
    ]),
  };
}

/** This function gives the rows of a summary table. It is the reverse of `summaryTable`. */
export function summaryRows(table: SummaryTable): SummaryRow[] {
  const at = (name: string): number => {
    const i = table.columns.indexOf(name);
    if (i < 0) throw new RangeError(`The summary table has no column ${name}.`);
    return i;
  };
  const num = (row: readonly (string | number | null)[], name: string): number => Number(row[at(name)] ?? 0);
  return table.rows.map((row) => {
    const vs: SummaryRow["vs"] = {};
    for (const b of table.baseline) {
      if (row[at(`${b}.wins`)] === null) continue;
      vs[b] = { wins: num(row, `${b}.wins`), losses: num(row, `${b}.losses`), ties: num(row, `${b}.ties`), diff: num(row, `${b}.diff`) };
    }
    return {
      config: String(row[at("config")]),
      cell: row[at("cell")] === "stress" ? "stress" : "headline",
      family: String(row[at("family")]),
      n: num(row, "n"),
      misses: num(row, "misses"),
      skipped: num(row, "skipped"),
      score: num(row, "score"),
      fill: num(row, "fill"),
      hard: num(row, "hard"),
      excess: num(row, "excess"),
      ms: num(row, "ms"),
      vs,
    };
  });
}

/** The status of a config in the state. */
export type ConfigStatus = "baseline" | "screened" | "alive" | "dropped" | "halved";

/** The outcome of the race for one config. */
export interface RaceOutcome {
  readonly config: string;
  /** The label of the paired verdict of the config against the incumbent. */
  readonly label: string;
  /** The stratified mean of the difference `config - incumbent` on `sweep.score`, with its interval. */
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
  /** The count of the paired inputs. */
  readonly n: number;
  readonly status: "alive" | "dropped" | "halved";
}

/** The options of `race`. */
export interface RaceOptions {
  readonly incumbent: string;
  /** The family of an input for the verdict. The default is its spec. The seeds of a spec are its replicates. */
  readonly family: (input: string) => string;
  /** The seed of an input. */
  readonly seed: (input: string) => number;
  readonly tie?: number;
  readonly level?: number;
  /** The factor of the halving. The value `Infinity` keeps each config that the verdict does not drop. The default is `SWEEP_ETA`. */
  readonly eta?: number;
  /** The count of the samples of each bootstrap. The default is 2000. */
  readonly runs?: number;
  /** The count of the random sign sets. The default is 4000. */
  readonly draws?: number;
}

/**
 * This function races the candidates against the incumbent on `sweep.score`, in two steps.
 * - The paired verdict by family drops each candidate with the label `worse`.
 * - Successive halving keeps the best `ceil(n / eta)` of the other candidates by the stratified mean. A candidate with the label `better` always stays.
 * `values` gives the score of each config on each input. A candidate with no paired input gets the label `no verdict` and the halving decides.
 */
export function race(values: ReadonlyMap<string, ReadonlyMap<string, number>>, candidates: readonly string[], options: RaceOptions): RaceOutcome[] {
  const base = values.get(options.incumbent);
  if (base === undefined) throw new RangeError(`The race has no values of the incumbent ${options.incumbent}.`);
  const tie = options.tie ?? SWEEP_TIE;
  const level = options.level ?? SWEEP_LEVEL;
  const eta = options.eta ?? SWEEP_ETA;
  const first = candidates.map((config) => {
    const mine = values.get(config) ?? new Map<string, number>();
    const records: VerdictRecord[] = [];
    for (const [input, v] of mine) {
      const b = base.get(input);
      if (b === undefined) continue;
      const seed = options.seed(input);
      records.push({ strategy: "a", input, seed, measures: { [SWEEP_SCORE]: b } }, { strategy: "b", input, seed, measures: { [SWEEP_SCORE]: v } });
    }
    if (records.length === 0) return { config, label: "no verdict", mean: 0, lo: 0, hi: 0, n: 0 };
    const v = verdict(records, {
      by: "family",
      family: (r) => options.family(r.input),
      measure: { id: SWEEP_SCORE, direction: "higher" },
      a: "a",
      b: "b",
      tie,
      level,
      runs: options.runs ?? 2000,
      draws: options.draws ?? 4000,
    });
    return { config, label: v.label, mean: v.stratified.mean, lo: v.stratified.lo, hi: v.stratified.hi, n: v.n };
  });
  const rest = first.filter((r) => r.label !== "worse").sort((a, b) => b.mean - a.mean || (a.config < b.config ? -1 : 1));
  const keep = new Set(rest.slice(0, Number.isFinite(eta) ? Math.ceil(rest.length / eta) : rest.length).map((r) => r.config));
  for (const r of rest) if (r.label === "better") keep.add(r.config);
  return first.map((r) => ({ ...r, status: r.label === "worse" ? "dropped" : keep.has(r.config) ? "alive" : "halved" }));
}

/** This function gives the ids of the configs of the baseline arm in a space. */
export function baselineIds(space: StrategySpace = JOINT_SPACE): string[] {
  return BASELINE_ARM.map((name) => {
    const c = space.named?.[name];
    if (c === undefined) throw new RangeError(`The space ${space.engine} has no named config "${name}".`);
    return configId(space, c);
  });
}

/** This function gives the plan of the configs of a list by their runs, so the script needs no space. */
export function runsOf(configs: Readonly<Record<string, StrategyConfig>>, space: StrategySpace = JOINT_SPACE): Record<string, ConfigRun> {
  return Object.fromEntries(Object.entries(configs).map(([id, c]) => [id, configRun(c, space)]));
}

/**
 * This function takes items in their order while the sum of their costs stays at the budget or less. It stops at the first item that does not fit.
 * Thus the order of the items is their priority.
 */
export function takeBudget<T>(items: readonly T[], cost: (item: T) => number, budget: number): { readonly taken: T[]; readonly cost: number } {
  const taken: T[] = [];
  let sum = 0;
  for (const item of items) {
    const c = cost(item);
    if (sum + c > budget) break;
    taken.push(item);
    sum += c;
  }
  return { taken, cost: sum };
}
