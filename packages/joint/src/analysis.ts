// The analysis of the joint benchmark (`docs/JOINT-BENCH.md`). It reads records and the facts of the inputs, and gives a report. It has no input or output of its own.
import {
  compareMeasure,
  leaveOneSeedOut,
  mulberry32,
  outputGroups,
  selectBest,
  type LayoutRecord,
  type SelectCandidate,
  type SelectLevel,
  type SplitFold,
} from "@mark1russell7/layout-contract";
import { recordCount, type RecordCount } from "./record-count.ts";
import { CAPS, ITER_STOPS, PAIR_SEPARATOR, pairId, ROUTERS } from "./runner.ts";
import { isIterPack, isLanePack, laneParts } from "./lanes.ts";
import { EXCESS_SPEC as EXCESS, HEADLINE, lexicographic, PICK_LEVELS, pickValues } from "./pick.ts";

export { HEADLINE, hardOf, PICK_LEVELS } from "./pick.ts";

/** The facts of one input that the analysis reads. The CLI gives them from the manifest of the corpus. */
export interface AnalysisInput {
  readonly id: string;
  readonly seed: number;
  /** The id of the spec of the input: the inputs of one spec differ only in the seed. The bootstrap samples the specs. */
  readonly spec: string;
  /** The board kind: the generator of the input, for example `rect-grid` or `gallery`. */
  readonly kind: string;
  /** The cell of the input in the manifest. The analysis reads `containerSize`, `count` and `spacing`. */
  readonly cell: Readonly<Record<string, string>>;
  /** This value is true for an input of the stress cell of `joint-v2`: no margins and gap 0. The headline numbers do not use these inputs. */
  readonly stress?: boolean;
}

/** The two rules of the cells of `highways`. Under `collection`, a shared segment with 2 collections is a hard break. */
export const RULES: readonly ("collection" | "all")[] = Object.freeze(["collection", "all"]);

/** The portfolio sizes of the analysis. */
export const PORTFOLIO_SIZES: readonly number[] = Object.freeze([3, 8]);

/** A pack strategy is thin in a scope when fewer than this share of the inputs are clean for each tied strategy. */
export const THIN_SHARE = 0.3;

/** A board kind with fewer inputs than this count is thin. */
export const THIN_KIND = 10;

/** The spec of `pack.fill` in the pack rule. */
const PACK_FILL = { direction: "higher", minEffect: 0.005 } as const;

/** The levels of a pick over many inputs: the count of the inputs that miss the floor, then the mean score. */
export const SET_LEVELS: readonly SelectLevel[] = Object.freeze([
  { id: "misses", spec: { direction: "lower", minEffect: 0 } },
  { id: "score", spec: { direction: "higher", minEffect: 0.001 } },
] as SelectLevel[]);

/** The joint measures of the overflow split. */
export const SPLIT_MEASURES: readonly string[] = Object.freeze(["joint.fill", "joint.aspectError", "joint.spill", "joint.straight.crossings", "joint.straight.length", "joint.proxy.rank"]);

/** A statistic with a bootstrap interval. The interval is open when it holds 0, or when the statistic has no value. */
export interface Interval {
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
  readonly open: boolean;
  /** The count of the values. */
  readonly n: number;
}

/** The options of `analyze`. */
export interface AnalysisOptions {
  /** The count of the bootstrap samples. The default is 1000. */
  readonly resamples?: number;
  /** The seed of the bootstrap. The default is 1. */
  readonly seed?: number;
  /** The portfolio sizes. The default is `PORTFOLIO_SIZES`. */
  readonly sizes?: readonly number[];
  /** The caps. The default is `CAPS`. */
  readonly caps?: readonly number[];
  /** The parts of the ids of the inputs that must give no routes. The default is the fixed cases `empty` and `one`. */
  readonly quiet?: readonly string[];
  /** The set of predictions that the report checks. The default is `joint-v1`. */
  readonly predictions?: "joint-v1" | "joint-v2";
  /** The ids of the inputs that can have no records. The record count check does not fail on them. */
  readonly allowMissing?: readonly string[];
  /** The ids of the inputs of the second headline. With it, the report also gives the headline cell on these inputs only. */
  readonly subset?: readonly string[];
  /**
   * The pair of the baseline, for example `BASELINE`, or a list of pairs. With it, each cell also gives each baseline and the gains over it.
   * The field `baseline` of a cell holds the first pair. The field `baselines` holds each pair.
   */
  readonly baseline?: string | readonly string[];
  /** The pairs `[a, b]` of the pairwise comparisons. Each cell gives the misses and the scores of `a` and `b`, and the gain of `a` over `b`. */
  readonly compare?: readonly (readonly [string, string])[];
  /** The pack entries to remove before the analysis. The analysis ignores each record of their pairs. The checks of `composite` and `times` read all records. */
  readonly excludePacks?: readonly string[];
  /** The pack entries of a second oracle. Each cell also gives the oracle without the pairs of these entries. */
  readonly without?: readonly string[];
  /** The composite pack entry, and the member that it picks on each input. With it, the report checks that each record of the entry is the record of its member. */
  readonly composite?: { readonly pack: string; readonly members: Readonly<Record<string, string>> };
  /** The specs of the table of the route times. The report gives the median and the maximum `route.ms` of each router on each seed. */
  readonly times?: readonly string[];
  /** The jobs of the run, from `gh run view <id> --json jobs`. With them, the report gives the time of each shard. */
  readonly jobs?: readonly JobFacts[];
  /**
   * The folds of the greedy portfolios, from a split file (`loadSplit`). The default holds out one seed of the inputs in each fold.
   * A fold without held-out inputs gives no row. A seed of a fold without inputs adds no input.
   */
  readonly folds?: readonly SplitFold[];
}

/** The pair of the sequential baseline (L10): the default pack entry `rows`, then the portfolio router. */
export const BASELINE = "rows+portfolio";

/** The router of the first row of the table of the route times. */
export const TIME_FIRST = "shared-all";

/** The spec of the claim S10 (L32): the dense spec with hubs and 1000 boxes. `pnpm bench analyze` gives its route times by default. */
export const DENSE_HUBS = "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap";

/** The limit of the claim S11 (L32) on the time of the step `Run one shard` of each shard, in minutes. */
export const SHARD_LIMIT_MINUTES = 60;

/** The name of the step of a shard job that runs the inputs of the shard. */
export const SHARD_STEP = "Run one shard";

/** The default count of the rows of the ranking of the output groups in the Markdown report. */
export const RANK_TOP = 20;

/** The options of the report of one cell. */
type CellOptions = Required<Pick<AnalysisOptions, "resamples" | "seed" | "sizes">> &
  Pick<AnalysisOptions, "folds" | "compare" | "without"> & { readonly baselines?: readonly string[] };

/** One output group in the ranking of a cell. The ranking uses the levels of the best pair: the misses, then the score. */
export interface GroupRank {
  /** The rank, from 1. The group of rank 1 is the best pair of the cell. */
  readonly rank: number;
  /** The id of the group: its first pair in sort order. */
  readonly group: string;
  readonly members: readonly string[];
  readonly misses: number;
  readonly score: number;
}

/** The comparison of two pairs in one cell. */
export interface PairCompare {
  readonly a: string;
  readonly b: string;
  readonly missesA: number;
  readonly missesB: number;
  readonly scoreA: number;
  readonly scoreB: number;
  /** The score of `a` minus the score of `b`, on each input. */
  readonly gain: Interval;
  /** The count of the inputs where `a` reaches the floor and `b` misses it. */
  readonly onlyA: number;
  /** The count of the inputs where `b` reaches the floor and `a` misses it. */
  readonly onlyB: number;
  /** The inputs where `a` reaches the floor and `b` misses it, in the order of the inputs of the cell. */
  readonly onlyAInputs: readonly string[];
  /** The inputs where `b` reaches the floor and `a` misses it, in the order of the inputs of the cell. */
  readonly onlyBInputs: readonly string[];
}

/** The oracle of a cell without the pairs of some pack entries. */
export interface WithoutReport {
  readonly packs: readonly string[];
  /** The mean score of the oracle without these pairs. */
  readonly score: number;
  /** The score of the oracle with all pairs minus the score without these pairs, on each input. */
  readonly gain: Interval;
  /** The count of the inputs where the two oracle scores differ by more than 1e-12. */
  readonly differ: number;
}

/** The check of a composite pack entry for the inputs of one member. */
export interface CompositeMember {
  readonly member: string;
  /** The count of the inputs where the composite entry picks this member. */
  readonly inputs: number;
  /** The count of the records of the composite entry on these inputs. */
  readonly records: number;
  readonly skipped: number;
  /** The count of the records with the output hash of the record of the member with the same router. */
  readonly same: number;
  /** The count of the records with a different output hash. */
  readonly differ: number;
  /** The count of the records without a record of the member with the same router. */
  readonly missing: number;
}

/**
 * The check of a composite pack entry, for example `select`. The output hash of a joint record is the hash of its pack hash and its route hash.
 * Thus an equal output hash gives an equal pack hash and an equal route hash.
 */
export interface CompositeReport {
  readonly pack: string;
  readonly records: number;
  /** The count of the skipped records of the entry, by reason. */
  readonly skipped: Readonly<Record<string, number>>;
  readonly members: readonly CompositeMember[];
  /** The inputs with a record that differs from its member, or that has no record of its member. The list has 20 ids or fewer. */
  readonly bad: readonly string[];
  /** For each other pack entry: the count of the inputs where each record of the composite entry has its output hash, router by router. */
  readonly matches: Readonly<Record<string, number>>;
}

/** The route times of one router on one input. */
export interface RouterTime {
  readonly router: string;
  /** The count of the records with `route.ms`. */
  readonly records: number;
  /** The median `route.ms` of the records, in milliseconds. */
  readonly median: number;
  /** The maximum `route.ms` of the records, in milliseconds. */
  readonly max: number;
}

/** The route times of the routers on one seed of a spec. The first router is `TIME_FIRST`. */
export interface SeedTimes {
  readonly input: string;
  readonly seed: number;
  readonly routers: readonly RouterTime[];
}

/** The route times of one spec. */
export interface SpecTimes {
  readonly spec: string;
  readonly seeds: readonly SeedTimes[];
}

/** The facts of one job of a run, as `gh run view <id> --json jobs` gives them. */
export interface JobFacts {
  readonly name: string;
  readonly conclusion?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly steps?: readonly { readonly name: string; readonly startedAt?: string; readonly completedAt?: string; readonly conclusion?: string }[];
}

/** The time of one shard job. */
export interface ShardTime {
  readonly shard: number;
  readonly conclusion: string;
  /** The minutes of the job, from its start to its end. */
  readonly job?: number;
  /** The minutes of the step `SHARD_STEP`: the inputs of the shard. */
  readonly step?: number;
}

/** The times of the shard jobs of a run, and the verdict of the limit `SHARD_LIMIT_MINUTES`. */
export interface ShardTimes {
  readonly limit: number;
  /** The shards from the longest step to the shortest. A shard without a step time comes last. */
  readonly shards: readonly ShardTime[];
  /** The longest step time, in minutes. */
  readonly max: number;
  /** The count of the shards with a step time of `limit` minutes or more, or without a step time. */
  readonly over: number;
  /** This value is true when each shard succeeded and each step took less than `limit` minutes. */
  readonly held: boolean;
}

/** A greedy portfolio of one size against the baseline, on the held-out seeds. Each input is in the test seed of one fold. */
export interface BaselinePortfolio {
  readonly k: number;
  /** The count of the held-out inputs where the picks of the portfolio miss the floor. */
  readonly misses: number;
  /** The mean score of the picks of the portfolio on the held-out inputs. */
  readonly score: number;
  /** The score of the portfolio minus the score of the baseline, on each input. */
  readonly gain: Interval;
}

/** The baseline of one cell, and the gains over it. Each gain is a bootstrap interval of the difference of the scores on each input. */
export interface BaselineReport {
  readonly pair: string;
  /** The count of the inputs where the baseline misses the floor. */
  readonly misses: number;
  /** The mean score of the baseline. */
  readonly score: number;
  /** The score of the best single pair minus the score of the baseline. */
  readonly best: Interval;
  /** The score of the oracle minus the score of the baseline. */
  readonly oracle: Interval;
  readonly portfolios: readonly BaselinePortfolio[];
}

/** The routers of the prediction Q2 of `joint-v2`. */
export const CLEAN_ROUTERS: readonly string[] = Object.freeze(["corners", "sections", "shared"]);

/** The oracle gain of the headline cell of the first run on `joint-v1`. */
export const V1_GAIN = 0.445;

/** The best single pair of the headline cell of the first run on `joint-v1`. */
export const V1_BEST = "shelf+corners";

/** The counts of the breaks of `no-pass-through` of one router on the inputs of one value of spacing. */
export interface ThroughCount {
  readonly spacing: string;
  readonly router: string;
  /** The count of the records with one route or more. */
  readonly routed: number;
  /** The count of the records with one break of `no-pass-through` or more. */
  readonly broken: number;
  /** The sum of the breaks over the records. */
  readonly breaks: number;
  /** The count of the broken records by cause: `overlap` (the pack has an overlap), `overflow` (the pack has overflow) or `router`. */
  readonly causes: Readonly<Record<string, number>>;
}

/** The report of the stress cell: the same cells as the headline, over the stress inputs only. */
export interface StressReport {
  readonly inputs: number;
  readonly cells: readonly CellReport[];
}

/** One step of the pack ranking. */
export interface PackStep {
  readonly id: string;
  /** The mean of `pack.overflow.excessArea` over the inputs of the scope. */
  readonly excessArea: number;
  /** The mean of `pack.fill` over the clean inputs of the tie, or `undefined` without a tie. */
  readonly fill?: number;
  /** The strategies that tied with this strategy on the overflow level. */
  readonly tied: readonly string[];
  /** The share of the inputs of the scope that each tied strategy packs clean. */
  readonly cleanShare: number;
  readonly thin: boolean;
}

/** The ranking of the pack entries in one scope: all inputs, or the inputs of one `containerSize`. */
export interface PackRanking {
  readonly scope: string;
  readonly inputs: number;
  readonly order: readonly PackStep[];
}

/** The overflow facts of the inputs. */
export interface OverflowFacts {
  /** For each `containerSize`: the count of the inputs, and of the inputs that some pack entry overflows. */
  readonly byContainerSize: Readonly<Record<string, { readonly inputs: number; readonly overflowing: number }>>;
  /** The first pack entry of the ranking over all inputs. */
  readonly bestPack: string;
  /** The inputs where the best pack entry overflows. */
  readonly bestPackOverflowing: number;
  /** The inputs where the best pack entry overflows and its `pack.overflow.excessArea` ties with 0. */
  readonly bestPackZeroExcess: number;
}

/** The mean joint measures of a set of inputs. */
export interface SplitPart {
  readonly inputs: number;
  readonly means: Readonly<Record<string, number>>;
}

/** The joint measures of the picks, split by an overflow of 0 and an overflow above 0. */
export interface OverflowSplit {
  readonly clean: SplitPart;
  readonly overflow: SplitPart;
}

/** One fold of a greedy portfolio. */
export interface Fold {
  /** The first held-out seed of the fold. */
  readonly test: number;
  /** The held-out seeds of the fold, when the fold holds out more than one seed. */
  readonly heldOut?: readonly number[];
  readonly members: readonly string[];
  /** The share of the oracle gain on the test seed, or `undefined` when the oracle has no gain. */
  readonly share?: number;
}

/** A greedy portfolio of one size. */
export interface PortfolioReport {
  readonly k: number;
  /** The share of the oracle gain on the pooled held-out seeds. */
  readonly share: Interval;
  readonly folds: readonly Fold[];
}

/** The report of one cell of a rule and a cap. */
export interface CellReport {
  readonly rule: "collection" | "all";
  readonly cap: number;
  /** The best single pair: the first member of its output group, and the other members. */
  readonly best: { readonly pair: string; readonly members: readonly string[]; readonly misses: number; readonly score: number };
  /** The mean score of the oracle, the gain over the best pair, and the count of the inputs where the oracle wins. */
  readonly oracle: {
    readonly score: number;
    readonly gain: Interval;
    readonly wins: number;
    readonly byCount: Readonly<Record<string, Interval>>;
    /** The count of the inputs that each pair wins, for the pairs with the most wins. */
    readonly top: readonly { readonly pair: string; readonly wins: number }[];
  };
  readonly portfolios: readonly PortfolioReport[];
  readonly split: { readonly best: OverflowSplit; readonly oracle: OverflowSplit };
  /** This value is true when no pair of the group of the best pair uses the best pack entry. */
  readonly bestPackOutside: boolean;
  /** The baseline of `AnalysisOptions.baseline`: its first pair. It is absent without this option. */
  readonly baseline?: BaselineReport;
  /** Each baseline of `AnalysisOptions.baseline`, in its order. It is absent without this option. */
  readonly baselines?: readonly BaselineReport[];
  /** The output groups from the best to the worst, by the levels of the best pair. */
  readonly ranking: readonly GroupRank[];
  /** The rank of the first group of each pack entry: the first group with a pair of the entry. */
  readonly packRanks: Readonly<Record<string, number>>;
  /** The comparisons of `AnalysisOptions.compare`. */
  readonly compare?: readonly PairCompare[];
  /** The oracle without the pack entries of `AnalysisOptions.without`. */
  readonly without?: WithoutReport;
}

/** One input that must give no routes, with its facts. */
export interface QuietCheck {
  readonly id: string;
  readonly records: number;
  readonly skipped: number;
  readonly routes: number;
}

/** The verdict of one prediction. */
export interface PredictionCheck {
  readonly id: string;
  readonly held: boolean;
  readonly detail: string;
}

/** The headline cell on a subset of the inputs, next to the headline cell on all inputs. */
export interface SubsetReport {
  /** The count of the ids of the subset. */
  readonly ids: number;
  /** The count of the inputs of the subset in the analysis, outside the stress cell. */
  readonly inputs: number;
  /** The headline cell on the inputs of the subset. It is absent when these inputs have no records. */
  readonly cell?: CellReport;
}

/** The report of the analysis. */
export interface Report {
  /** The count of the inputs outside the stress cell. The headline cells use these inputs. */
  readonly inputs: number;
  /** The record count check over all inputs of the analysis. */
  readonly count: RecordCount;
  /** The headline cell on the subset of `AnalysisOptions.subset`. */
  readonly subset?: SubsetReport;
  readonly records: number;
  readonly skipped: Readonly<Record<string, number>>;
  readonly pairs: number;
  readonly groups: number;
  readonly packs: readonly PackRanking[];
  readonly overflow: OverflowFacts;
  readonly cells: readonly CellReport[];
  readonly thinKinds: readonly { readonly kind: string; readonly inputs: number }[];
  readonly thinKindSizes: readonly { readonly kind: string; readonly inputs: number }[];
  readonly quiet: readonly QuietCheck[];
  /** The count of the breaks of `no-pass-through` for each value of spacing and each router, over all inputs. */
  readonly through: readonly ThroughCount[];
  /** The report of the stress inputs. It is absent when the corpus has no stress input. */
  readonly stress?: StressReport;
  /** The mean `pack.fill` over the pack records of each value of spacing. */
  readonly fillBySpacing: Readonly<Record<string, number>>;
  readonly predictions: readonly PredictionCheck[];
  /** The pack entries of `AnalysisOptions.excludePacks`. The analysis ignored their records. */
  readonly excluded?: readonly string[];
  /** The check of the composite pack entry of `AnalysisOptions.composite`. */
  readonly composite?: CompositeReport;
  /** The route times of the specs of `AnalysisOptions.times`. */
  readonly times?: readonly SpecTimes[];
  /** The times of the shard jobs of `AnalysisOptions.jobs`. */
  readonly shardTimes?: ShardTimes;
  /** Each lane pair of L13 against its base pair, outside and in the stress cell. It is absent when the records have no lane pair. */
  readonly lanes?: readonly LaneRow[];
}

/** The means of one pair over the inputs of a row of `LaneRow`. */
export interface LaneSide {
  /** The count of the records with one break of `no-pass-through` or more. */
  readonly broken: number;
  /** The sum of the breaks of `no-pass-through`. */
  readonly breaks: number;
  /** The count of the records with overflow. */
  readonly overflowing: number;
  /** The mean `joint.fill`. */
  readonly fill: number;
  /** The mean `pack.fill`. */
  readonly packFill: number;
  /** The mean `pack.overflow.excessArea`. */
  readonly excess: number;
  /** The mean `joint.ms`, in milliseconds. */
  readonly ms: number;
}

/** One lane pair against its base pair, the pair of the same pack entry and router, on the inputs where both have a record. */
export interface LaneRow {
  readonly pair: string;
  readonly base: string;
  /** `headline`: the inputs outside the stress cell. `stress`: the stress inputs. */
  readonly scope: "headline" | "stress";
  readonly inputs: number;
  /** The count of the inputs where the base pair has a record, and the lane pair has no record or a skipped record. A skipped base record does not count. */
  readonly skipped: number;
  /** The count of the inputs where the lane pair has the output hash of the base pair. */
  readonly same: number;
  readonly lane: LaneSide;
  readonly baseSide: LaneSide;
  /** The mean count of the sides that are too narrow for their lanes, in the layout of the base pair (`lanes.short.base`). */
  readonly shortBase: number;
  /** The mean count of the sides that are too narrow for their lanes, in the layout of the lane pair (`lanes.short`). */
  readonly short: number;
  /** The mean growth of the margins of the lane pair, in units (`lanes.margin`). */
  readonly margin: number;
  /** The rounds of an iteration pair of L11. It is absent for the other lane pairs. */
  readonly iterate?: IterSide;
}

/** The means of the rounds of an iteration pair over the inputs of a row of `LaneRow`. */
export interface IterSide {
  /** The mean count of the rounds that the pair used (`iter.rounds`). */
  readonly rounds: number;
  /** The mean number of the best round (`iter.best`). */
  readonly best: number;
  /** The count of the inputs where a round after round 1 is the best round. */
  readonly gained: number;
  /** The count of the inputs by the end of the rounds (`iter.stop`, `ITER_STOPS`). */
  readonly stops: Readonly<Record<string, number>>;
  /** The mean counts of the sides that the rounds widened and narrowed. */
  readonly widened: number;
  readonly narrowed: number;
}

/** This function gives the rounds of an iteration pair over a list of records. */
function iterSide(list: readonly LayoutRecord[]): IterSide {
  const stops: Record<string, number> = {};
  for (const r of list) {
    const name = ITER_STOPS[r.measures["iter.stop"] ?? 0] ?? "cap";
    stops[name] = (stops[name] ?? 0) + 1;
  }
  return {
    rounds: mean(list.map((r) => r.measures["iter.rounds"] ?? 0)),
    best: mean(list.map((r) => r.measures["iter.best"] ?? 0)),
    gained: list.filter((r) => (r.measures["iter.best"] ?? 1) > 1).length,
    stops,
    widened: mean(list.map((r) => r.measures["iter.widened"] ?? 0)),
    narrowed: mean(list.map((r) => r.measures["iter.narrowed"] ?? 0)),
  };
}

/** This function gives the means of one pair over a list of records. */
function laneSide(list: readonly LayoutRecord[]): LaneSide {
  const m = (key: string): number => mean(list.map((r) => r.measures[key] ?? 0));
  const breaks = list.map((r) => r.hard["route.no-pass-through"] ?? 0);
  return {
    broken: breaks.filter((n) => n > 0).length,
    breaks: breaks.reduce((s, n) => s + n, 0),
    overflowing: list.filter((r) => (r.measures["pack.overflow"] ?? 0) > 0).length,
    fill: m("joint.fill"),
    packFill: m("pack.fill"),
    excess: m("pack.overflow.excessArea"),
    ms: m("joint.ms"),
  };
}

/** This function gives each lane pair against its base pair, outside and in the stress cell. A skipped record does not count. */
export function laneRows(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[]): LaneRow[] {
  const at = new Map<string, Map<string, LayoutRecord>>();
  for (const r of records) {
    if (r.skipped !== undefined) continue;
    const m = at.get(r.input) ?? new Map<string, LayoutRecord>();
    m.set(r.strategy, r);
    at.set(r.input, m);
  }
  const pairs = [...new Set(records.map((r) => r.strategy))].filter((p) => isLanePack(packOf(p))).sort();
  const rows: LaneRow[] = [];
  for (const pair of pairs) {
    const parts = laneParts(packOf(pair));
    if (parts === undefined) continue;
    const base = pairId(parts.pack, parts.router);
    for (const scope of ["headline", "stress"] as const) {
      const lane: LayoutRecord[] = [];
      const own: LayoutRecord[] = [];
      let skipped = 0;
      for (const i of inputs) {
        if ((i.stress === true) !== (scope === "stress")) continue;
        const a = at.get(i.id)?.get(pair);
        const b = at.get(i.id)?.get(base);
        if (b !== undefined && a === undefined) skipped++;
        if (a === undefined || b === undefined) continue;
        lane.push(a);
        own.push(b);
      }
      if (lane.length === 0 && skipped === 0) continue;
      rows.push({
        pair,
        base,
        scope,
        inputs: lane.length,
        skipped,
        same: lane.filter((r, k) => r.outputHash === own[k]!.outputHash).length,
        lane: laneSide(lane),
        baseSide: laneSide(own),
        shortBase: mean(lane.map((r) => r.measures["lanes.short.base"] ?? 0)),
        short: mean(lane.map((r) => r.measures["lanes.short"] ?? 0)),
        margin: mean(lane.map((r) => r.measures["lanes.margin"] ?? 0)),
        ...(isIterPack(packOf(pair)) ? { iterate: iterSide(lane) } : {}),
      });
    }
  }
  return rows;
}

/** This function gives the pack entry of a pair id. */
export function packOf(pair: string): string {
  const at = pair.indexOf(PAIR_SEPARATOR);
  return at < 0 ? pair : pair.slice(0, at);
}

/** This function gives the mean of a list, or 0 for an empty list. */
function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/** This function gives the `q` quantile of sorted values, with linear interpolation. */
function quantileOf(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/**
 * This function gives a statistic with a 95% interval of a cluster bootstrap. Each sample draws the clusters with replacement.
 * The statistic reads the sum of the numerators and the sum of the denominators of the drawn rows. Without denominators, it is the mean.
 */
export function bootstrap(rows: readonly { readonly cluster: string; readonly value: number; readonly weight?: number }[], resamples: number, seed: number): Interval {
  const ratio = rows.some((r) => r.weight !== undefined);
  const stat = (list: readonly { readonly value: number; readonly weight?: number }[]): number => {
    const num = list.reduce((s, r) => s + r.value, 0);
    const den = ratio ? list.reduce((s, r) => s + (r.weight ?? 0), 0) : list.length;
    return den === 0 ? Number.NaN : num / den;
  };
  const point = stat(rows);
  const clusters = new Map<string, { value: number; weight?: number }[]>();
  for (const r of rows) {
    const list = clusters.get(r.cluster) ?? [];
    list.push(r);
    clusters.set(r.cluster, list);
  }
  const keys = [...clusters.keys()];
  const random = mulberry32(seed);
  const samples: number[] = [];
  for (let i = 0; i < resamples && keys.length > 0; i++) {
    const drawn: { value: number; weight?: number }[] = [];
    for (let j = 0; j < keys.length; j++) drawn.push(...clusters.get(keys[Math.floor(random() * keys.length)]!)!);
    const v = stat(drawn);
    if (Number.isFinite(v)) samples.push(v);
  }
  samples.sort((a, b) => a - b);
  const lo = samples.length === 0 ? point : quantileOf(samples, 0.025);
  const hi = samples.length === 0 ? point : quantileOf(samples, 0.975);
  return { mean: point, lo, hi, open: !Number.isFinite(point) || (lo <= 0 && hi >= 0), n: rows.length };
}

/** This function tells if a pack is clean: no hard break of the pack and no overflow. */
function packClean(record: LayoutRecord): boolean {
  for (const [k, v] of Object.entries(record.hard)) if (k.startsWith("pack.") && v > 0) return false;
  return (record.measures["pack.overflow"] ?? 0) === 0;
}

/** The records of the analysis, by input and by pair. */
export interface RecordIndex {
  readonly pairs: readonly string[];
  readonly packs: readonly string[];
  readonly at: ReadonlyMap<string, ReadonlyMap<string, LayoutRecord>>;
  /** One record of each pack entry on each input: the pack measures are the same for each router. */
  readonly pack: ReadonlyMap<string, ReadonlyMap<string, LayoutRecord>>;
}

/** This function makes the index of the records. A skipped record is not in the index. */
export function indexRecords(records: readonly LayoutRecord[]): RecordIndex {
  const pairs = new Set<string>();
  const at = new Map<string, Map<string, LayoutRecord>>();
  const pack = new Map<string, Map<string, LayoutRecord>>();
  for (const r of records) {
    pairs.add(r.strategy);
    if (r.skipped !== undefined) continue;
    const byPair = at.get(r.input) ?? new Map<string, LayoutRecord>();
    byPair.set(r.strategy, r);
    at.set(r.input, byPair);
    const byPack = pack.get(r.input) ?? new Map<string, LayoutRecord>();
    if (!byPack.has(packOf(r.strategy))) byPack.set(packOf(r.strategy), r);
    pack.set(r.input, byPack);
  }
  const sorted = [...pairs].sort();
  return { pairs: sorted, packs: [...new Set(sorted.map(packOf))], at, pack };
}

/**
 * This function ranks the pack entries on a set of inputs. The first level is the mean `pack.overflow.excessArea`, with the minimum effect 0.005.
 * Among the ties, the second level is the mean `pack.fill` over the inputs that each tied entry packs clean.
 * Each step picks a winner with `selectBest`, and the next step ranks the rest.
 */
export function rankPacks(index: Pick<RecordIndex, "packs" | "pack">, inputs: readonly string[], scope: string): PackRanking {
  const order: PackStep[] = [];
  let rest = [...index.packs];
  const value = (pack: string, input: string): LayoutRecord | undefined => index.pack.get(input)?.get(pack);
  while (rest.length > 0) {
    const excess = rest.map((p) => ({ id: p, values: { excess: mean(inputs.map((i) => value(p, i)?.measures["pack.overflow.excessArea"] ?? 1)) } }));
    const first = selectBest(excess, [{ id: "excess", spec: EXCESS }]);
    const tied = first.kept[0]!;
    const clean = inputs.filter((i) => tied.every((p) => {
      const r = value(p, i);
      return r !== undefined && packClean(r);
    }));
    const cleanShare = inputs.length === 0 ? 0 : clean.length / inputs.length;
    let winner = first.winner;
    let fill: number | undefined;
    if (tied.length > 1 && clean.length > 0) {
      const fills = tied.map((p) => ({ id: p, values: { fill: mean(clean.map((i) => value(p, i)!.measures["pack.fill"] ?? 0)) } }));
      winner = selectBest(fills, [{ id: "fill", spec: PACK_FILL }]).winner;
      fill = fills.find((f) => f.id === winner)!.values.fill;
    }
    order.push({
      id: winner,
      excessArea: excess.find((e) => e.id === winner)!.values.excess,
      ...(fill === undefined ? {} : { fill }),
      tied,
      cleanShare,
      thin: cleanShare < THIN_SHARE,
    });
    rest = rest.filter((p) => p !== winner);
  }
  return { scope, inputs: inputs.length, order };
}

/** The values of one cell: the pick values of each pair on each input, the floor of each input and the oracle. */
interface CellValues {
  readonly values: ReadonlyMap<string, ReadonlyMap<string, Record<string, number>>>;
  /** The pairs that reach the floor of each input: the pairs that `selectBest` keeps after the overflow level. */
  readonly floor: ReadonlyMap<string, ReadonlySet<string>>;
  /** The oracle pick of each input. */
  readonly oracle: ReadonlyMap<string, string>;
}

/** This function gives the values of one cell. */
function cellValues(index: RecordIndex, inputs: readonly AnalysisInput[], rule: "collection" | "all", cap: number): CellValues {
  const values = new Map<string, Map<string, Record<string, number>>>();
  const floor = new Map<string, Set<string>>();
  const oracle = new Map<string, string>();
  for (const input of inputs) {
    const byPair = index.at.get(input.id);
    const map = new Map<string, Record<string, number>>();
    if (byPair !== undefined) for (const [pair, record] of byPair) map.set(pair, pickValues(record, rule, cap));
    values.set(input.id, map);
    const candidates: SelectCandidate[] = [...map].map(([id, v]) => ({ id, values: v }));
    if (candidates.length === 0) continue;
    const pick = selectBest(candidates, PICK_LEVELS);
    floor.set(input.id, new Set(pick.kept[1]!));
    oracle.set(input.id, pick.winner);
  }
  return { values, floor, oracle };
}

/** This function gives the score of a pair on an input: its `joint.fill` when it reaches the floor of the input, else 0. */
function scoreOf(cell: CellValues, input: string, pair: string | undefined): number {
  if (pair === undefined || !cell.floor.get(input)?.has(pair)) return 0;
  return cell.values.get(input)?.get(pair)?.["joint.fill"] ?? 0;
}

/** This function gives the pick of a list of members on one input: `selectBest` over each member in turn. A member without a record does not take part. */
function pickOf(cell: CellValues, input: string, current: string | undefined, member: string): string | undefined {
  const at = cell.values.get(input);
  const v = at?.get(member);
  if (v === undefined) return current;
  if (current === undefined) return member;
  return selectBest(
    [
      { id: current, values: at!.get(current)! },
      { id: member, values: v },
    ],
    PICK_LEVELS,
  ).winner;
}

/** This function gives the picks of a list of members on each input. */
function picksOf(cell: CellValues, inputs: readonly string[], members: readonly string[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const input of inputs) {
    let current: string | undefined;
    for (const m of members) current = pickOf(cell, input, current, m);
    out.set(input, current);
  }
  return out;
}

/** This function gives the set values of picks: the count of the inputs that miss the floor, and the mean score. */
function setValues(cell: CellValues, picks: ReadonlyMap<string, string | undefined>): { misses: number; score: number } {
  let misses = 0;
  let sum = 0;
  for (const [input, pair] of picks) {
    const s = scoreOf(cell, input, pair);
    if (pair === undefined || !cell.floor.get(input)?.has(pair)) misses += 1;
    sum += s;
  }
  return { misses, score: picks.size === 0 ? 0 : sum / picks.size };
}

/** This function gives the members of a greedy portfolio on the training inputs, up to `k` members. Each step adds the member that `selectBest` picks. */
function greedy(cell: CellValues, train: readonly string[], candidates: readonly string[], k: number): string[] {
  const members: string[] = [];
  const picks = new Map<string, string | undefined>(train.map((i) => [i, undefined]));
  while (members.length < k && members.length < candidates.length) {
    const options: SelectCandidate[] = [];
    for (const c of candidates) {
      if (members.includes(c)) continue;
      const next = new Map<string, string | undefined>();
      for (const input of train) next.set(input, pickOf(cell, input, picks.get(input), c));
      options.push({ id: c, values: setValues(cell, next) });
    }
    const winner = selectBest(options, SET_LEVELS).winner;
    members.push(winner);
    for (const input of train) picks.set(input, pickOf(cell, input, picks.get(input), winner));
  }
  return members;
}

/** This function gives the mean joint measures of the picks, split by the overflow of the picked record. */
function splitOf(index: RecordIndex, picks: ReadonlyMap<string, string | undefined>): OverflowSplit {
  const parts = { clean: [] as LayoutRecord[], overflow: [] as LayoutRecord[] };
  for (const [input, pair] of picks) {
    const r = pair === undefined ? undefined : index.at.get(input)?.get(pair);
    if (r === undefined) continue;
    ((r.measures["pack.overflow"] ?? 0) > 0 ? parts.overflow : parts.clean).push(r);
  }
  const part = (list: readonly LayoutRecord[]): SplitPart => {
    const means: Record<string, number> = {};
    for (const id of SPLIT_MEASURES) {
      const vs = list.map((r) => r.measures[id]).filter((v): v is number => v !== undefined);
      if (vs.length > 0) means[id] = mean(vs);
    }
    return { inputs: list.length, means };
  };
  return { clean: part(parts.clean), overflow: part(parts.overflow) };
}

/** This function gives the report of one cell. */
function cellReport(
  index: RecordIndex,
  inputs: readonly AnalysisInput[],
  groups: readonly { readonly id: string; readonly members: readonly string[] }[],
  rule: "collection" | "all",
  cap: number,
  bestPack: string,
  options: CellOptions,
): CellReport {
  const cell = cellValues(index, inputs, rule, cap);
  const ids = inputs.map((i) => i.id);
  const reps = groups.map((g) => g.id);
  const spec = new Map(inputs.map((i) => [i.id, i.spec]));

  const ranking = rankGroups(cell, ids, groups);
  const best = ranking[0]!.group;
  const bestValues = setValues(cell, picksOf(cell, ids, [best]));
  const gains = ids.map((i) => ({ cluster: spec.get(i)!, value: scoreOf(cell, i, cell.oracle.get(i)) - scoreOf(cell, i, best), input: i }));
  const byCount: Record<string, Interval> = {};
  for (const count of [...new Set(inputs.map((i) => i.cell["count"] ?? "none"))].sort()) {
    const set = new Set(inputs.filter((i) => (i.cell["count"] ?? "none") === count).map((i) => i.id));
    byCount[count] = bootstrap(gains.filter((g) => set.has(g.input)), options.resamples, options.seed);
  }
  let wins = 0;
  const top = new Map<string, number>();
  for (const i of ids) {
    const o = cell.oracle.get(i);
    if (o === undefined) continue;
    top.set(o, (top.get(o) ?? 0) + 1);
    const b = cell.values.get(i)?.get(best);
    if (b === undefined || lexicographic(cell.values.get(i)!.get(o)!, b, PICK_LEVELS) === "better") wins += 1;
  }

  const seeds = [...new Set(inputs.map((i) => i.seed))].sort((a, b) => a - b);
  const maxK = Math.max(...options.sizes);
  const pooled = new Map<number, { cluster: string; value: number; weight: number }[]>(options.sizes.map((k) => [k, []]));
  const folds = new Map<number, Fold[]>(options.sizes.map((k) => [k, []]));
  /** The picks of each portfolio size on the held-out inputs of all folds, for the baseline. */
  const heldPicks = new Map<number, Map<string, string | undefined>>(options.sizes.map((k) => [k, new Map()]));
  for (const fold of options.folds ?? leaveOneSeedOut(seeds)) {
    const trainSeeds = new Set(fold.train);
    const heldSeeds = new Set(fold.heldOut);
    const test = fold.heldOut[0]!;
    const many = fold.heldOut.length > 1 ? { heldOut: [...fold.heldOut] } : {};
    const train = inputs.filter((i) => trainSeeds.has(i.seed)).map((i) => i.id);
    const held = inputs.filter((i) => heldSeeds.has(i.seed)).map((i) => i.id);
    if (held.length === 0) continue;
    const members = greedy(cell, train, reps, maxK);
    const base = picksOf(cell, held, members.slice(0, 1));
    for (const k of options.sizes) {
      const picks = picksOf(cell, held, members.slice(0, k));
      for (const [i, p] of picks) heldPicks.get(k)!.set(i, p);
      const rows = held.map((i) => {
        const b = scoreOf(cell, i, base.get(i));
        return { cluster: spec.get(i)!, value: scoreOf(cell, i, picks.get(i)) - b, weight: scoreOf(cell, i, cell.oracle.get(i)) - b };
      });
      pooled.get(k)!.push(...rows);
      const den = rows.reduce((s, r) => s + r.weight, 0);
      const share = den > 0 ? rows.reduce((s, r) => s + r.value, 0) / den : undefined;
      folds.get(k)!.push({ test, ...many, members: members.slice(0, k), ...(share === undefined ? {} : { share }) });
    }
  }
  const portfolios: PortfolioReport[] = options.sizes.map((k) => ({ k, share: bootstrap(pooled.get(k)!, options.resamples, options.seed), folds: folds.get(k)! }));

  const baselines = (options.baselines ?? []).map((baseline): BaselineReport => {
    const over = (pick: (input: string) => string | undefined): Interval =>
      bootstrap(
        ids.map((i) => ({ cluster: spec.get(i)!, value: scoreOf(cell, i, pick(i)) - scoreOf(cell, i, baseline) })),
        options.resamples,
        options.seed,
      );
    return {
      pair: baseline,
      ...setValues(cell, picksOf(cell, ids, [baseline])),
      best: over(() => best),
      oracle: over((i) => cell.oracle.get(i)),
      portfolios: options.sizes.map((k) => {
        const picks = heldPicks.get(k)!;
        return { k, ...setValues(cell, picks), gain: over((i) => picks.get(i)) };
      }),
    };
  });

  const compare = options.compare?.map(([a, b]): PairCompare => {
    const va = setValues(cell, picksOf(cell, ids, [a]));
    const vb = setValues(cell, picksOf(cell, ids, [b]));
    const on = (i: string, p: string): boolean => cell.floor.get(i)?.has(p) ?? false;
    return {
      a,
      b,
      missesA: va.misses,
      missesB: vb.misses,
      scoreA: va.score,
      scoreB: vb.score,
      gain: bootstrap(
        ids.map((i) => ({ cluster: spec.get(i)!, value: scoreOf(cell, i, a) - scoreOf(cell, i, b) })),
        options.resamples,
        options.seed,
      ),
      onlyA: ids.filter((i) => on(i, a) && !on(i, b)).length,
      onlyB: ids.filter((i) => on(i, b) && !on(i, a)).length,
      onlyAInputs: ids.filter((i) => on(i, a) && !on(i, b)),
      onlyBInputs: ids.filter((i) => on(i, b) && !on(i, a)),
    };
  });

  let without: WithoutReport | undefined;
  if (options.without !== undefined && options.without.length > 0) {
    const rest = cellValues(dropPacks(index, new Set(options.without)), inputs, rule, cap);
    const diffs = ids.map((i) => ({ cluster: spec.get(i)!, value: scoreOf(cell, i, cell.oracle.get(i)) - scoreOf(rest, i, rest.oracle.get(i)) }));
    without = {
      packs: [...options.without],
      score: mean(ids.map((i) => scoreOf(rest, i, rest.oracle.get(i)))),
      gain: bootstrap(diffs, options.resamples, options.seed),
      differ: diffs.filter((d) => Math.abs(d.value) > 1e-12).length,
    };
  }

  const packRanks: Record<string, number> = {};
  for (const row of ranking) for (const m of row.members) packRanks[packOf(m)] ??= row.rank;

  const group = groups.find((g) => g.id === best)!;
  return {
    rule,
    cap,
    best: { pair: best, members: group.members, ...bestValues },
    oracle: {
      score: mean(ids.map((i) => scoreOf(cell, i, cell.oracle.get(i)))),
      gain: bootstrap(gains, options.resamples, options.seed),
      wins,
      byCount,
      top: [...top].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([pair, w]) => ({ pair, wins: w })),
    },
    portfolios,
    split: { best: splitOf(index, picksOf(cell, ids, [best])), oracle: splitOf(index, cell.oracle) },
    bestPackOutside: !group.members.some((m) => packOf(m) === bestPack),
    ...(baselines.length === 0 ? {} : { baseline: baselines[0]!, baselines }),
    ranking,
    packRanks,
    ...(compare === undefined ? {} : { compare }),
    ...(without === undefined ? {} : { without }),
  };
}

/**
 * This function ranks the output groups of a cell by the levels of the best pair: the misses, then the score.
 * Each step picks the best of the rest with `selectBest`, in the order of the groups. Thus the first group is the best pair.
 */
function rankGroups(cell: CellValues, ids: readonly string[], groups: readonly { readonly id: string; readonly members: readonly string[] }[]): GroupRank[] {
  let rest = groups.map((g) => ({ id: g.id, members: g.members, values: setValues(cell, picksOf(cell, ids, [g.id])) }));
  const out: GroupRank[] = [];
  while (rest.length > 0) {
    const winner = selectBest(rest, SET_LEVELS).winner;
    const row = rest.find((r) => r.id === winner)!;
    out.push({ rank: out.length + 1, group: row.id, members: row.members, misses: row.values.misses, score: row.values.score });
    rest = rest.filter((r) => r !== row);
  }
  return out;
}

/** This function gives the index without the pairs of some pack entries. */
function dropPacks(index: RecordIndex, packs: ReadonlySet<string>): RecordIndex {
  const at = new Map<string, ReadonlyMap<string, LayoutRecord>>();
  for (const [input, byPair] of index.at) at.set(input, new Map([...byPair].filter(([pair]) => !packs.has(packOf(pair)))));
  const pack = new Map<string, ReadonlyMap<string, LayoutRecord>>();
  for (const [input, byPack] of index.pack) pack.set(input, new Map([...byPack].filter(([p]) => !packs.has(p))));
  return { pairs: index.pairs.filter((p) => !packs.has(packOf(p))), packs: index.packs.filter((p) => !packs.has(p)), at, pack };
}

/** This function gives the median of sorted values, or 0 for an empty list. */
function medianOf(sorted: readonly number[]): number {
  return quantileOf(sorted, 0.5);
}

/**
 * This function checks the records of a composite pack entry against the records of the member that it picks on each input.
 * A record matches when the record of the member with the same router has the same output hash.
 */
export function compositeCheck(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[], pack: string, members: Readonly<Record<string, string>>): CompositeReport {
  const byInput = new Map<string, Map<string, LayoutRecord>>();
  for (const r of records) {
    const m = byInput.get(r.input) ?? new Map<string, LayoutRecord>();
    m.set(r.strategy, r);
    byInput.set(r.input, m);
  }
  const rows = new Map<string, { member: string; inputs: number; records: number; skipped: number; same: number; differ: number; missing: number }>();
  const skipped: Record<string, number> = {};
  const matches: Record<string, number> = {};
  const bad: string[] = [];
  let count = 0;
  for (const input of inputs) {
    const all = byInput.get(input.id);
    const own = [...(all?.values() ?? [])].filter((r) => packOf(r.strategy) === pack);
    const member = members[input.id] ?? "none";
    const row = rows.get(member) ?? { member, inputs: 0, records: 0, skipped: 0, same: 0, differ: 0, missing: 0 };
    row.inputs += 1;
    let fault = false;
    for (const r of own) {
      count += 1;
      row.records += 1;
      if (r.skipped !== undefined) {
        row.skipped += 1;
        skipped[r.skipped] = (skipped[r.skipped] ?? 0) + 1;
        continue;
      }
      const twin = all!.get(`${member}${PAIR_SEPARATOR}${routerOfPair(r.strategy)}`);
      if (twin === undefined || twin.skipped !== undefined || twin.outputHash === undefined) {
        row.missing += 1;
        fault = true;
      } else if (twin.outputHash === r.outputHash) row.same += 1;
      else {
        row.differ += 1;
        fault = true;
      }
    }
    if (fault && bad.length < 20) bad.push(input.id);
    rows.set(member, row);
    const ran = own.filter((r) => r.skipped === undefined);
    if (ran.length === 0) continue;
    const others = new Set([...(all?.keys() ?? [])].map(packOf).filter((p) => p !== pack));
    for (const p of others) {
      const each = ran.every((r) => {
        const o = all!.get(`${p}${PAIR_SEPARATOR}${routerOfPair(r.strategy)}`);
        return o !== undefined && o.skipped === undefined && o.outputHash === r.outputHash;
      });
      if (each) matches[p] = (matches[p] ?? 0) + 1;
    }
  }
  return {
    pack,
    records: count,
    skipped,
    members: [...rows.values()].sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0)),
    bad,
    matches: Object.fromEntries(Object.entries(matches).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  };
}

/** This function gives the order of the routers of the table of the route times. `TIME_FIRST` comes first, then the order of `ROUTERS`, then the other names. */
function routerOrder(names: Iterable<string>): string[] {
  const rank = (r: string): number => (r === TIME_FIRST ? -1 : ROUTERS.includes(r) ? ROUTERS.indexOf(r) : ROUTERS.length);
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** This function gives the median and the maximum `route.ms` of each router on each seed of each spec. A skipped record and a lane pair do not count. */
export function routeTimes(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[], specs: readonly string[]): SpecTimes[] {
  return specs.map((spec) => {
    const seeds = inputs.filter((i) => i.spec === spec).sort((a, b) => a.seed - b.seed);
    return {
      spec,
      seeds: seeds.map((input): SeedTimes => {
        const byRouter = new Map<string, number[]>();
        for (const r of records) {
          const ms = r.measures["route.ms"];
          if (r.input !== input.id || r.skipped !== undefined || typeof ms !== "number" || isLanePack(packOf(r.strategy))) continue;
          const router = routerOfPair(r.strategy);
          byRouter.set(router, [...(byRouter.get(router) ?? []), ms]);
        }
        return {
          input: input.id,
          seed: input.seed,
          routers: routerOrder(byRouter.keys()).map((router) => {
            const list = byRouter.get(router)!.sort((a, b) => a - b);
            return { router, records: list.length, median: medianOf(list), max: list.at(-1)! };
          }),
        };
      }),
    };
  });
}

/** This function gives the minutes from one ISO time to another, or `undefined` without both times. */
function minutesOf(start: string | undefined, end: string | undefined): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) ? ms / 60000 : undefined;
}

/** This function gives the times of the shard jobs `run (<i>)` of a run, and the verdict of the limit. A job with another name does not count. */
export function shardTimes(jobs: readonly JobFacts[], limit: number = SHARD_LIMIT_MINUTES): ShardTimes {
  const shards: ShardTime[] = [];
  for (const job of jobs) {
    const m = /^run \((\d+)\)$/.exec(job.name);
    if (m === null) continue;
    const step = job.steps?.find((s) => s.name === SHARD_STEP);
    const jobMinutes = minutesOf(job.startedAt, job.completedAt);
    const stepMinutes = minutesOf(step?.startedAt, step?.completedAt);
    shards.push({ shard: Number(m[1]), conclusion: job.conclusion ?? "unknown", ...(jobMinutes === undefined ? {} : { job: jobMinutes }), ...(stepMinutes === undefined ? {} : { step: stepMinutes }) });
  }
  shards.sort((a, b) => (b.step ?? -1) - (a.step ?? -1) || a.shard - b.shard);
  const over = shards.filter((s) => s.step === undefined || s.step >= limit).length;
  return {
    limit,
    shards,
    max: Math.max(0, ...shards.map((s) => s.step ?? 0)),
    over,
    held: shards.length > 0 && over === 0 && shards.every((s) => s.conclusion === "success"),
  };
}

/** This function gives the board kinds with fewer than `THIN_KIND` inputs, for a key of the inputs. */
function thinBy(inputs: readonly AnalysisInput[], key: (i: AnalysisInput) => string): { kind: string; inputs: number }[] {
  const counts = new Map<string, number>();
  for (const i of inputs) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return [...counts]
    .filter(([, n]) => n < THIN_KIND)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([kind, n]) => ({ kind, inputs: n }));
}

/** This function tells if most values of a list are true: more than half. */
function most(values: readonly boolean[]): boolean {
  return values.filter(Boolean).length * 2 > values.length;
}

/** This function gives the verdict of each prediction of `docs/JOINT-BENCH.md` from a report. */
export function checkPredictions(report: Omit<Report, "predictions">): PredictionCheck[] {
  const sizes = Object.entries(report.overflow.byContainerSize);
  const outside = sizes.filter(([size, f]) => size !== "fixed" && f.overflowing > 0).map(([size]) => size);
  const o = report.overflow;
  const zeroShare = o.bestPackOverflowing === 0 ? 1 : o.bestPackZeroExcess / o.bestPackOverflowing;
  const cells = report.cells;
  const beats = cells.filter((c) => c.oracle.gain.lo > 0).length;
  const tenOpen = cells.filter((c) => c.oracle.byCount["10"]?.open ?? true).length;
  const share = (c: CellReport, k: number): number => c.portfolios.find((p) => p.k === k)?.share.mean ?? Number.NaN;
  const k3 = cells.filter((c) => share(c, 3) >= 0.7).length;
  const k8 = cells.filter((c) => share(c, 8) - share(c, 3) < 0.1).length;
  const outsideCells = cells.filter((c) => c.bestPackOutside).length;
  const quietOk = report.quiet.length > 0 && report.quiet.every((q) => q.records > 0 && q.skipped === 0 && q.routes === 0);
  return [
    {
      id: "P1",
      held: outside.length === 0 && zeroShare > 0.5,
      detail: `Overflow outside fixed containers: ${outside.length === 0 ? "none" : outside.join(", ")}. The best pack entry ${o.bestPack} keeps the excess area at 0 on ${o.bestPackZeroExcess} of ${o.bestPackOverflowing} inputs that it overflows.`,
    },
    { id: "P2", held: most(cells.map((c) => c.oracle.gain.lo > 0)), detail: `The oracle gain is above 0 in ${beats} of ${cells.length} cells.` },
    { id: "P2b", held: most(cells.map((c) => c.oracle.byCount["10"]?.open ?? true)), detail: `The gain of count 10 is open in ${tenOpen} of ${cells.length} cells.` },
    { id: "P3", held: most(cells.map((c) => share(c, 3) >= 0.7)), detail: `k = 3 gets at least 70% of the oracle gain in ${k3} of ${cells.length} cells.` },
    { id: "P3b", held: most(cells.map((c) => share(c, 8) - share(c, 3) < 0.1)), detail: `k = 8 adds less than 10% in ${k8} of ${cells.length} cells.` },
    { id: "P4", held: outsideCells > 0, detail: `The best pair does not use the best pack entry in ${outsideCells} of ${cells.length} cells.` },
    { id: "P5", held: quietOk, detail: report.quiet.map((q) => `${q.id}: ${q.records} records, ${q.skipped} skipped, ${q.routes} routes`).join(". ") },
  ];
}

/** This function gives the router of a pair id. */
export function routerOfPair(pair: string): string {
  const at = pair.indexOf(PAIR_SEPARATOR);
  return at < 0 ? pair : pair.slice(at + 1);
}

/** This function gives the cause of a break of `no-pass-through` in a record: a fault of the pack, or of the router. */
function causeOf(record: LayoutRecord): string {
  if ((record.hard["pack.no-overlap"] ?? 0) > 0) return "overlap";
  if ((record.measures["pack.overflow"] ?? 0) > 0) return "overflow";
  return "router";
}

/**
 * This function counts the breaks of `no-pass-through` for each value of spacing and each router. An input with no value has the value `none`.
 * The lane pairs do not count. The field `lanes` of the report holds their breaks.
 */
export function throughCounts(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[]): ThroughCount[] {
  const spacing = new Map(inputs.map((i) => [i.id, i.cell["spacing"] ?? "none"]));
  const out = new Map<string, { spacing: string; router: string; routed: number; broken: number; breaks: number; causes: Record<string, number> }>();
  for (const r of records) {
    const sp = spacing.get(r.input);
    if (sp === undefined || r.skipped !== undefined || (r.measures["joint.routes"] ?? 0) <= 0 || isLanePack(packOf(r.strategy))) continue;
    const router = routerOfPair(r.strategy);
    const key = `${sp}\u0000${router}`;
    const c = out.get(key) ?? { spacing: sp, router, routed: 0, broken: 0, breaks: 0, causes: {} };
    c.routed += 1;
    const n = r.hard["route.no-pass-through"] ?? 0;
    if (n > 0) {
      c.broken += 1;
      c.breaks += n;
      const cause = causeOf(r);
      c.causes[cause] = (c.causes[cause] ?? 0) + 1;
    }
    out.set(key, c);
  }
  return [...out.values()].sort((a, b) => (a.spacing < b.spacing ? -1 : a.spacing > b.spacing ? 1 : a.router < b.router ? -1 : a.router > b.router ? 1 : 0));
}

/** This function gives the mean `pack.fill` of the pack records of each value of spacing. A pack record is the first record of each pack entry on an input. The lane pairs do not count. */
function fillOf(index: RecordIndex, inputs: readonly AnalysisInput[]): Record<string, number> {
  const values = new Map<string, number[]>();
  for (const i of inputs) {
    const sp = i.cell["spacing"] ?? "none";
    for (const r of index.pack.get(i.id)?.values() ?? []) {
      if (isLanePack(packOf(r.strategy))) continue;
      const v = r.measures["pack.fill"];
      if (typeof v === "number" && Number.isFinite(v)) values.set(sp, [...(values.get(sp) ?? []), v]);
    }
  }
  return Object.fromEntries([...values].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([sp, v]) => [sp, mean(v)]));
}

/** This function gives the verdict of each prediction for `joint-v2` of `docs/JOINT-BENCH.md` from a report. */
export function checkPredictionsV2(report: Omit<Report, "predictions">): PredictionCheck[] {
  const cells = report.cells;
  const head = cells.find((c) => c.rule === HEADLINE.rule && c.cap === HEADLINE.cap);
  const share = (c: CellReport, k: number): number => c.portfolios.find((p) => p.k === k)?.share.mean ?? Number.NaN;
  const stress = report.through.filter((t) => t.spacing === "stress");
  const stressOk = stress.length > 0 && stress.every((t) => t.broken === t.routed);
  const clean = report.through.filter((t) => t.spacing !== "stress" && CLEAN_ROUTERS.includes(t.router));
  const routerBreaks = clean.reduce((n, t) => n + (t.causes["router"] ?? 0), 0);
  const causes: Record<string, number> = {};
  for (const t of clean) for (const [k, v] of Object.entries(t.causes)) causes[k] = (causes[k] ?? 0) + v;
  const below = cells.filter((c) => c.oracle.gain.mean < V1_GAIN).length;
  const above = cells.filter((c) => c.oracle.gain.lo > 0).length;
  const k3 = cells.filter((c) => share(c, 3) >= 0.6).length;
  const fill = report.fillBySpacing;
  const loose = cells.find((c) => c.rule === "all" && c.cap === Math.max(...cells.map((x) => x.cap)));
  const changed = loose === undefined ? 0 : cells.filter((c) => c !== loose && (c.best.pair !== loose.best.pair || Math.abs(c.oracle.score - loose.oracle.score) > 0.005)).length;
  const causeText = Object.keys(causes).length === 0 ? "none" : Object.entries(causes).map(([k, v]) => `${k} ${v}`).join(", ");
  return [
    {
      id: "Q1",
      held: stressOk,
      detail: stress.map((t) => `${t.router} ${t.broken} of ${t.routed}`).join(", ") || "There is no stress record with routes.",
    },
    {
      id: "Q2",
      held: clean.length > 0 && routerBreaks === 0,
      detail: `The broken records of ${CLEAN_ROUTERS.join(", ")} outside the stress cell, by cause: ${causeText}.`,
    },
    {
      id: "Q3",
      held: below === cells.length && above * 2 > cells.length,
      detail: `The gain is below ${V1_GAIN} in ${below} of ${cells.length} cells, and its interval is above 0 in ${above} cells.`,
    },
    {
      id: "Q4",
      held: head !== undefined && !head.best.members.includes(V1_BEST),
      detail: head === undefined ? "There is no headline cell." : `The best pair of the cell ${HEADLINE.rule} ${HEADLINE.cap} is ${head.best.pair}.`,
    },
    {
      id: "Q5",
      held: k3 * 2 > cells.length,
      detail: `k = 3 gets at least 60% of the oracle gain in ${k3} of ${cells.length} cells.`,
    },
    {
      id: "Q6",
      held: fill["margin"] !== undefined && fill["gap"] !== undefined && fill["margin"] < fill["gap"],
      detail: `The mean pack.fill is ${Object.entries(fill).map(([k, v]) => `${v.toFixed(3)} for ${k}`).join(", ")}.`,
    },
    {
      id: "Q7",
      held: changed >= 2,
      detail: `${changed} cells have a best pair or an oracle score that differs from the cell all ${loose?.cap ?? "-"}.`,
    },
  ];
}

/**
 * This function analyzes the records of a joint run. It is pure: the same records and inputs give the same report.
 *
 * - It ranks the pack entries over all inputs and for each `containerSize`.
 * - For each cell of a rule and a cap, it finds the best single pair, the oracle and the greedy portfolios.
 * - Pairs with the same output hash on each input make one output group. A group counts as one candidate.
 * - The headline numbers use only the inputs outside the stress cell. The field `stress` holds the cells of the stress inputs.
 * - With a baseline pair, each cell also gives the score of the baseline and the gains over it.
 */
export function analyze(allRecords: readonly LayoutRecord[], allInputs: readonly AnalysisInput[], options: AnalysisOptions = {}): Report {
  const baselines = options.baseline === undefined ? [] : typeof options.baseline === "string" ? [options.baseline] : [...options.baseline];
  const opts: CellOptions = {
    resamples: options.resamples ?? 1000,
    seed: options.seed ?? 1,
    sizes: options.sizes ?? PORTFOLIO_SIZES,
    ...(baselines.length === 0 ? {} : { baselines }),
    ...(options.folds === undefined ? {} : { folds: options.folds }),
    ...(options.compare === undefined ? {} : { compare: options.compare }),
    ...(options.without === undefined ? {} : { without: options.without }),
  };
  const exclude = new Set(options.excludePacks ?? []);
  for (const p of [...exclude, ...(options.without ?? [])])
    if (allRecords.length > 0 && !allRecords.some((r) => packOf(r.strategy) === p)) throw new RangeError(`The records have no pair of the pack entry "${p}".`);
  const records = exclude.size === 0 ? allRecords : allRecords.filter((r) => !exclude.has(packOf(r.strategy)));
  for (const pair of [...baselines, ...(options.compare ?? []).flat()])
    if (records.length > 0 && !records.some((r) => r.strategy === pair)) throw new RangeError(`The records have no pair "${pair}" for the baseline or the comparison.`);
  const caps = options.caps ?? CAPS;
  const inputs = allInputs.filter((i) => i.stress !== true);
  const stressInputs = allInputs.filter((i) => i.stress === true);
  const through = throughCounts(records, allInputs);
  const allIds = new Set(allInputs.map((i) => i.id));
  const known = new Set(inputs.map((i) => i.id));
  const used = records.filter((r) => known.has(r.input));
  const index = indexRecords(used);
  const skipped: Record<string, number> = {};
  for (const r of used) if (r.skipped !== undefined) skipped[r.skipped] = (skipped[r.skipped] ?? 0) + 1;

  const hashes: Record<string, string[]> = {};
  for (const pair of index.pairs) hashes[pair] = inputs.map((i) => index.at.get(i.id)?.get(pair)?.outputHash ?? "skipped");
  const groups = index.pairs.length === 0 ? [] : outputGroups(hashes);

  const ids = inputs.map((i) => i.id);
  const all = rankPacks(index, ids, "all");
  const sizes = [...new Set(inputs.map((i) => i.cell["containerSize"] ?? "none"))].sort();
  const packs = [all, ...sizes.map((s) => rankPacks(index, inputs.filter((i) => (i.cell["containerSize"] ?? "none") === s).map((i) => i.id), s))];
  const bestPack = all.order[0]?.id ?? "";

  const byContainerSize: Record<string, { inputs: number; overflowing: number }> = {};
  let bestPackOverflowing = 0;
  let bestPackZeroExcess = 0;
  for (const input of inputs) {
    const size = input.cell["containerSize"] ?? "none";
    const f = byContainerSize[size] ?? { inputs: 0, overflowing: 0 };
    f.inputs += 1;
    const byPack = index.pack.get(input.id);
    if ([...(byPack?.values() ?? [])].some((r) => (r.measures["pack.overflow"] ?? 0) > 0)) f.overflowing += 1;
    byContainerSize[size] = f;
    const b = byPack?.get(bestPack);
    if (b !== undefined && (b.measures["pack.overflow"] ?? 0) > 0) {
      bestPackOverflowing += 1;
      if (compareMeasure(b.measures["pack.overflow.excessArea"] ?? 0, 0, EXCESS) === "tie") bestPackZeroExcess += 1;
    }
  }

  const cells: CellReport[] = [];
  if (groups.length > 0) for (const rule of RULES) for (const cap of caps) cells.push(cellReport(index, inputs, groups, rule, cap, bestPack, opts));
  const stress = stressReport(records, stressInputs, caps, bestPack, opts);

  const quiet = (options.quiet ?? ["edge-cases.empty", "edge-cases.one"]).flatMap((part) =>
    inputs
      .filter((i) => i.id.includes(part))
      .map((i): QuietCheck => {
        const list = used.filter((r) => r.input === i.id);
        return { id: i.id, records: list.length, skipped: list.filter((r) => r.skipped !== undefined).length, routes: Math.max(0, ...list.map((r) => r.measures["joint.routes"] ?? 0)) };
      }),
  );

  const count = recordCount(
    allInputs.map((i) => i.id),
    records.map((r) => r.input),
    options.allowMissing,
  );
  const subset = options.subset === undefined ? undefined : subsetReport(records, inputs, options.subset, bestPack, opts);

  const base = {
    inputs: inputs.length,
    count,
    ...(subset === undefined ? {} : { subset }),
    records: used.length,
    skipped,
    pairs: index.pairs.length,
    groups: groups.length,
    packs,
    overflow: { byContainerSize, bestPack, bestPackOverflowing, bestPackZeroExcess },
    cells,
    thinKinds: thinBy(inputs, (i) => i.kind),
    thinKindSizes: thinBy(inputs, (i) => `${i.kind} ${i.cell["containerSize"] ?? "none"}`),
    quiet,
    through,
    ...(stress === undefined ? {} : { stress }),
    fillBySpacing: fillOf(indexRecords(records.filter((r) => allIds.has(r.input))), allInputs),
  };
  const runRecords = allRecords.filter((r) => allIds.has(r.input));
  const lanes = laneRows(records, allInputs);
  const extra = {
    ...(exclude.size === 0 ? {} : { excluded: [...exclude] }),
    ...(options.composite === undefined ? {} : { composite: compositeCheck(runRecords, allInputs, options.composite.pack, options.composite.members) }),
    ...(options.times === undefined ? {} : { times: routeTimes(runRecords, allInputs, options.times) }),
    ...(options.jobs === undefined ? {} : { shardTimes: shardTimes(options.jobs) }),
    ...(lanes.length === 0 ? {} : { lanes }),
  };
  return { ...base, predictions: options.predictions === "joint-v2" ? checkPredictionsV2(base) : checkPredictions(base), ...extra };
}

/** This function gives the headline cell on the inputs of a subset, with the pack entry of the headline as the best pack. */
function subsetReport(
  records: readonly LayoutRecord[],
  inputs: readonly AnalysisInput[],
  ids: readonly string[],
  bestPack: string,
  opts: CellOptions,
): SubsetReport {
  const wanted = new Set(ids);
  const chosen = inputs.filter((i) => wanted.has(i.id));
  const known = new Set(chosen.map((i) => i.id));
  const index = indexRecords(records.filter((r) => known.has(r.input)));
  const hashes: Record<string, string[]> = {};
  for (const pair of index.pairs) hashes[pair] = chosen.map((i) => index.at.get(i.id)?.get(pair)?.outputHash ?? "skipped");
  const groups = index.pairs.length === 0 ? [] : outputGroups(hashes);
  const base = { ids: wanted.size, inputs: chosen.length };
  return groups.length === 0 ? base : { ...base, cell: cellReport(index, chosen, groups, HEADLINE.rule, HEADLINE.cap, bestPack, opts) };
}

/** This function gives the cells of the stress inputs, with the pack entry of the headline as the best pack. */
function stressReport(
  records: readonly LayoutRecord[],
  inputs: readonly AnalysisInput[],
  caps: readonly number[],
  bestPack: string,
  opts: CellOptions,
): StressReport | undefined {
  if (inputs.length === 0) return undefined;
  const known = new Set(inputs.map((i) => i.id));
  const index = indexRecords(records.filter((r) => known.has(r.input)));
  const hashes: Record<string, string[]> = {};
  for (const pair of index.pairs) hashes[pair] = inputs.map((i) => index.at.get(i.id)?.get(pair)?.outputHash ?? "skipped");
  const groups = index.pairs.length === 0 ? [] : outputGroups(hashes);
  const cells: CellReport[] = [];
  if (groups.length > 0) for (const rule of RULES) for (const cap of caps) cells.push(cellReport(index, inputs, groups, rule, cap, bestPack, opts));
  return { inputs: inputs.length, cells };
}

/** This function writes a number with 3 decimals, or a dash for a value that is not finite. */
function f3(v: number | undefined): string {
  return v === undefined || !Number.isFinite(v) ? "-" : v.toFixed(3);
}

/** This function writes an interval as `mean [lo, hi]`, with the word `open` when it holds 0. */
function interval(i: Interval | undefined): string {
  if (i === undefined) return "-";
  return `${f3(i.mean)} [${f3(i.lo)}, ${f3(i.hi)}]${i.open ? " open" : ""}`;
}

/** This function gives the named cells of a report: the cells, the headline cell on the subset and the stress cells. */
function namedCells(report: Report): [string, CellReport][] {
  return [
    ...report.cells.map((c): [string, CellReport] => [`all (${report.inputs})`, c]),
    ...(report.subset?.cell === undefined ? [] : [[`subset (${report.subset.inputs})`, report.subset.cell] as [string, CellReport]]),
    ...(report.stress?.cells ?? []).map((c): [string, CellReport] => [`stress (${report.stress!.inputs})`, c]),
  ];
}

/** This function writes the table of each baseline: the cells, the headline cell on the subset and the stress cells. It gives no lines without a baseline. */
function baselineLines(report: Report): string[] {
  const rows = namedCells(report);
  const pairs = rows.find(([, c]) => c.baselines !== undefined)?.[1].baselines?.map((b) => b.pair) ?? [];
  const lines: string[] = [];
  for (const [at, pair] of pairs.entries()) {
    const first = rows.find(([, c]) => c.baselines?.[at] !== undefined)![1].baselines![at]!;
    const ks = first.portfolios.map((p) => p.k);
    lines.push(
      "",
      `### The baseline ${pair}`,
      "",
      "Each gain is the score of a pick minus the score of the baseline on each input, with its interval. The portfolios use the held-out seeds.",
      "",
      `| Inputs | Rule | Cap | Misses | Score | Best pair | Best pair gain | Oracle gain | ${ks.map((k) => `k = ${k} misses | k = ${k} gain`).join(" | ")} |`,
      `|---|---|---|---|---|---|---|---|${ks.map(() => "---|---|").join("")}`,
    );
    for (const [name, c] of rows) {
      const b = c.baselines?.[at];
      if (b === undefined) continue;
      const k = ks.map((n) => {
        const p = b.portfolios.find((x) => x.k === n);
        return p === undefined ? "- | -" : `${p.misses} | ${interval(p.gain)}`;
      });
      lines.push(`| ${name} | ${c.rule} | ${c.cap} | ${b.misses} | ${f3(b.score)} | ${c.best.pair} | ${interval(b.best)} | ${interval(b.oracle)} | ${k.join(" | ")} |`);
    }
  }
  return lines;
}

/** This function writes the table of the pairwise comparisons. It gives no lines without a comparison. */
function compareLines(report: Report): string[] {
  const rows = namedCells(report).filter(([, c]) => c.compare !== undefined && c.compare.length > 0);
  if (rows.length === 0) return [];
  const lines = [
    "",
    "### The pairwise comparisons",
    "",
    "The gain is the score of A minus the score of B on each input, with its interval.",
    "",
    "| Inputs | Rule | Cap | A | B | A misses | B misses | A misses - B misses | A score | B score | Gain | Only A on the floor | Only B on the floor |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [name, c] of rows)
    for (const p of c.compare!)
      lines.push(`| ${name} | ${c.rule} | ${c.cap} | ${p.a} | ${p.b} | ${p.missesA} | ${p.missesB} | ${p.missesA - p.missesB} | ${f3(p.scoreA)} | ${f3(p.scoreB)} | ${interval(p.gain)} | ${p.onlyA} | ${p.onlyB} |`);
  return lines;
}

/** This function writes the table of the oracle without some pack entries. It gives no lines without the option `without`. */
function withoutLines(report: Report): string[] {
  const rows = namedCells(report).filter(([, c]) => c.without !== undefined);
  if (rows.length === 0) return [];
  const lines = [
    "",
    `### The oracle without ${rows[0]![1].without!.packs.join(", ")}`,
    "",
    "The difference is the oracle score with all pairs minus the oracle score without these pairs, on each input.",
    "",
    "| Inputs | Rule | Cap | Oracle | Oracle without | Difference | Inputs that differ |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const [name, c] of rows) lines.push(`| ${name} | ${c.rule} | ${c.cap} | ${f3(c.oracle.score)} | ${f3(c.without!.score)} | ${interval(c.without!.gain)} | ${c.without!.differ} |`);
  return lines;
}

/** This function writes the ranking of the output groups of the headline cell. It also writes the rank of the first group of each pack entry in each cell. */
function rankLines(report: Report, top: number): string[] {
  const head = report.cells.find((c) => c.rule === HEADLINE.rule && c.cap === HEADLINE.cap);
  if (head === undefined) return [];
  const lines = [
    "",
    `### The ranking of the output groups (rule ${HEADLINE.rule}, cap ${HEADLINE.cap})`,
    "",
    `The ranking uses the levels of the best pair: the misses, then the score. The table shows ${Math.min(top, head.ranking.length)} of ${head.ranking.length} groups. The file report.json holds each group.`,
    "",
    "| Rank | Group | Misses | Score | Members |",
    "|---|---|---|---|---|",
  ];
  for (const r of head.ranking.slice(0, top)) lines.push(`| ${r.rank} | ${r.group} | ${r.misses} | ${f3(r.score)} | ${r.members.join(", ")} |`);
  const packs = Object.keys(head.packRanks).sort();
  lines.push("", "### The rank of the first group of each pack entry", "", `| Inputs | Rule | Cap | ${packs.join(" | ")} |`, `|---|---|---|${packs.map(() => "---|").join("")}`);
  for (const [name, c] of namedCells(report)) lines.push(`| ${name} | ${c.rule} | ${c.cap} | ${packs.map((p) => c.packRanks[p] ?? "-").join(" | ")} |`);
  return lines;
}

/** This function writes the check of the composite pack entry. It gives no lines without the option `composite`. */
function compositeLines(report: Report): string[] {
  const c = report.composite;
  if (c === undefined) return [];
  const skipped = Object.entries(c.skipped);
  const lines = [
    "",
    `### The check of the pack entry ${c.pack}`,
    "",
    `The records of ${c.pack}: ${c.records}. Skipped: ${skipped.length === 0 ? "none" : skipped.map(([k, v]) => `${v} (${k.replace(/\|/g, "/")})`).join(", ")}.`,
    "A record is the same as its member when the record of the member with the same router has the same output hash, thus the same pack hash and route hash.",
    "",
    "| Member | Inputs | Records | Skipped | Same | Differ | No record of the member |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const m of c.members) lines.push(`| ${m.member} | ${m.inputs} | ${m.records} | ${m.skipped} | ${m.same} | ${m.differ} | ${m.missing} |`);
  const matches = Object.entries(c.matches);
  lines.push("", `The inputs where each record of ${c.pack} has the output hash of another pack entry: ${matches.length === 0 ? "none" : matches.map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  if (c.bad.length > 0) lines.push("", `The inputs with a record that is not the same as its member: ${c.bad.join(", ")}.`);
  return lines;
}

/** This function writes a time in milliseconds as seconds with 1 decimal. */
function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** This function writes the tables of the route times. It gives no lines without the option `times`. */
function timeLines(report: Report): string[] {
  const lines: string[] = [];
  for (const spec of report.times ?? []) {
    lines.push("", `### The route times of ${spec.spec}`, "");
    if (spec.seeds.length === 0) {
      lines.push("The analysis has no input of this spec.");
      continue;
    }
    const routers = routerOrder(spec.seeds.flatMap((s) => s.routers.map((r) => r.router)));
    lines.push(
      "Each cell gives the median and the maximum `route.ms` of the records of the router on the seed, in seconds.",
      "",
      `| Router | ${spec.seeds.map((s) => `s${s.seed} median | s${s.seed} max`).join(" | ")} |`,
      `|---|${spec.seeds.map(() => "---|---|").join("")}`,
    );
    for (const router of routers) {
      const cells = spec.seeds.map((s) => {
        const t = s.routers.find((r) => r.router === router);
        return t === undefined ? "- | -" : `${seconds(t.median)} | ${seconds(t.max)}`;
      });
      lines.push(`| ${router} | ${cells.join(" | ")} |`);
    }
  }
  return lines;
}

/** This function writes the times of the shard jobs. It gives no lines without the option `jobs`. */
function shardLines(report: Report): string[] {
  const t = report.shardTimes;
  if (t === undefined) return [];
  const minutes = (v: number | undefined): string => (v === undefined ? "-" : v.toFixed(1));
  const lines = [
    "",
    "### The shard times",
    "",
    `Shards: ${t.shards.length}. The longest step \`${SHARD_STEP}\` took ${minutes(t.max)} minutes. Shards at ${t.limit} minutes or more, or without a step time: ${t.over}. Held: ${t.held ? "yes" : "no"}.`,
    "",
    "| Shard | Conclusion | Step minutes | Job minutes |",
    "|---|---|---|---|",
  ];
  for (const s of t.shards.slice(0, 10)) lines.push(`| ${s.shard} | ${s.conclusion} | ${minutes(s.step)} | ${minutes(s.job)} |`);
  return lines;
}

/** The options of `reportMarkdown`. */
export interface MarkdownOptions {
  /** The count of the rows of the ranking of the output groups. The default is `RANK_TOP`. */
  readonly rankTop?: number;
}

/** This function writes a report as Markdown. */
export function reportMarkdown(report: Report, options: MarkdownOptions = {}): string {
  const lines: string[] = [];
  const n = report.count;
  lines.push(
    `Inputs: ${n.recorded} with records, of ${n.manifest} in the manifest. The headline cells use the ${report.inputs} inputs outside the stress cell. Records: ${report.records}. Pairs: ${report.pairs}, in ${report.groups} output groups.`,
    "",
  );
  if (n.missing.length > 0 || n.unknown.length > 0) {
    lines.push("### The missing inputs", "", n.ok ? "The list of allowed inputs holds each missing input." : "The record count check fails.", "");
    if (n.missing.length > 0) {
      const allowed = new Set(n.allowed);
      lines.push("| Input | Allowed |", "|---|---|");
      for (const id of n.missing) lines.push(`| ${id} | ${allowed.has(id) ? "yes" : "no"} |`);
      lines.push("");
    }
    if (n.unknown.length > 0) lines.push(`Inputs with records outside the manifest: ${n.unknown.join(", ")}.`, "");
  }
  const skipped = Object.entries(report.skipped);
  if (skipped.length > 0) {
    lines.push("### Skipped records", "", "| Reason | Records |", "|---|---|");
    for (const [reason, n] of skipped.sort((a, b) => b[1] - a[1])) lines.push(`| ${reason.replace(/\|/g, "/")} | ${n} |`);
    lines.push("");
  }
  lines.push("### The predictions", "", "| Id | Held | Facts |", "|---|---|---|");
  for (const p of report.predictions) lines.push(`| ${p.id} | ${p.held ? "yes" : "no"} | ${p.detail} |`);
  lines.push("", "### The cells", "", "| Rule | Cap | Best pair | Misses | Score | Oracle | Gain | Oracle wins | k = 3 share | k = 8 share |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const c of report.cells) {
    const k = (n: number): string => interval(c.portfolios.find((p) => p.k === n)?.share);
    lines.push(`| ${c.rule} | ${c.cap} | ${c.best.pair} | ${c.best.misses} | ${f3(c.best.score)} | ${f3(c.oracle.score)} | ${interval(c.oracle.gain)} | ${c.oracle.wins} | ${k(3)} | ${k(8)} |`);
  }
  if (report.excluded !== undefined) lines.push("", `The analysis ignores the records of the pack entries ${report.excluded.join(", ")}.`);
  lines.push(...compositeLines(report));
  lines.push(...rankLines(report, options.rankTop ?? RANK_TOP));
  lines.push(...withoutLines(report));
  lines.push(...baselineLines(report));
  lines.push(...compareLines(report));
  lines.push(...timeLines(report));
  lines.push(...shardLines(report));
  if (report.subset !== undefined) {
    const full = report.cells.find((c) => c.rule === HEADLINE.rule && c.cap === HEADLINE.cap);
    lines.push("", `### The headline cell on the subset (${report.subset.inputs} of ${report.inputs} inputs)`, "", "| Inputs | Best pair | Misses | Score | Oracle | Gain | Oracle wins | k = 3 share | k = 8 share |", "|---|---|---|---|---|---|---|---|---|");
    for (const [name, c] of [
      [`all (${report.inputs})`, full],
      [`subset (${report.subset.inputs})`, report.subset.cell],
    ] as const) {
      if (c === undefined) {
        lines.push(`| ${name} | - | - | - | - | - | - | - | - |`);
        continue;
      }
      const k = (m: number): string => interval(c.portfolios.find((p) => p.k === m)?.share);
      lines.push(`| ${name} | ${c.best.pair} | ${c.best.misses} | ${f3(c.best.score)} | ${f3(c.oracle.score)} | ${interval(c.oracle.gain)} | ${c.oracle.wins} | ${k(3)} | ${k(8)} |`);
    }
  }
  lines.push("", "### The oracle gain by count", "", "| Rule | Cap | " + Object.keys(report.cells[0]?.oracle.byCount ?? {}).join(" | ") + " |");
  lines.push("|---|---|" + Object.keys(report.cells[0]?.oracle.byCount ?? {}).map(() => "---|").join(""));
  for (const c of report.cells) lines.push(`| ${c.rule} | ${c.cap} | ${Object.values(c.oracle.byCount).map(interval).join(" | ")} |`);
  lines.push("", "### The greedy portfolios", "", "| Rule | Cap | k | Test seed | Members | Share |", "|---|---|---|---|---|---|");
  for (const c of report.cells) for (const p of c.portfolios) for (const f of p.folds) lines.push(`| ${c.rule} | ${c.cap} | ${p.k} | ${(f.heldOut ?? [f.test]).join(", ")} | ${f.members.join(", ")} | ${f3(f.share)} |`);
  lines.push("", "### The overflow split of the oracle picks", "", "| Rule | Cap | Part | Inputs | " + SPLIT_MEASURES.join(" | ") + " |", "|---|---|---|---|" + SPLIT_MEASURES.map(() => "---|").join(""));
  for (const c of report.cells)
    for (const [name, part] of [
      ["overflow 0", c.split.oracle.clean],
      ["overflow above 0", c.split.oracle.overflow],
    ] as const)
      lines.push(`| ${c.rule} | ${c.cap} | ${name} | ${part.inputs} | ${SPLIT_MEASURES.map((m) => f3(part.means[m])).join(" | ")} |`);
  lines.push("", "### The pack ranking", "", "| Scope | Inputs | Order (excess area, fill) | Thin |", "|---|---|---|---|");
  for (const r of report.packs) lines.push(`| ${r.scope} | ${r.inputs} | ${r.order.map((s) => `${s.id} (${f3(s.excessArea)}, ${f3(s.fill)})`).join(", ")} | ${r.order[0]?.thin ? `yes (${f3(r.order[0].cleanShare)})` : "no"} |`);
  lines.push("", "### Overflow by container size", "", "| Container size | Inputs | Inputs with overflow |", "|---|---|---|");
  for (const [size, f] of Object.entries(report.overflow.byContainerSize)) lines.push(`| ${size} | ${f.inputs} | ${f.overflowing} |`);
  if (report.through.length > 0) {
    lines.push("", "### The breaks of no-pass-through by spacing", "", "| Spacing | Router | Records with routes | Broken records | Breaks | Causes |", "|---|---|---|---|---|---|");
    for (const t of report.through) lines.push(`| ${t.spacing} | ${t.router} | ${t.routed} | ${t.broken} | ${t.breaks} | ${Object.entries(t.causes).map(([k, v]) => `${k} ${v}`).join(", ") || "-"} |`);
  }
  const fill = Object.entries(report.fillBySpacing);
  if (fill.length > 0) lines.push("", "### The pack fill by spacing", "", fill.map(([k, v]) => `- ${k}: ${f3(v)}`).join("\n"));
  if (report.lanes !== undefined && report.lanes.length > 0) {
    lines.push(
      "",
      "### The lane pairs",
      "",
      "Each lane pair against its base pair, with the value of the base pair in parentheses. Broken: the records with a break of no-pass-through. Short: the mean count of the sides too narrow for their lanes.",
      "",
      "| Lane pair | Scope | Inputs | Skipped | Same | Broken | Breaks | Overflow | Joint fill | Pack fill | Short | Margin | ms |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    );
    for (const r of report.lanes)
      lines.push(
        `| ${r.pair} | ${r.scope} | ${r.inputs} | ${r.skipped} | ${r.same} | ${r.lane.broken} (${r.baseSide.broken}) | ${r.lane.breaks} (${r.baseSide.breaks}) | ${r.lane.overflowing} (${r.baseSide.overflowing}) | ${f3(r.lane.fill)} (${f3(r.baseSide.fill)}) | ${f3(r.lane.packFill)} (${f3(r.baseSide.packFill)}) | ${f3(r.short)} (${f3(r.shortBase)}) | ${f3(r.margin)} | ${Math.round(r.lane.ms)} (${Math.round(r.baseSide.ms)}) |`,
      );
    const iter = report.lanes.filter((r) => r.iterate !== undefined);
    if (iter.length > 0) {
      lines.push(
        "",
        "### The rounds of the iteration pairs",
        "",
        "Rounds: the mean count of the rounds used. Gained: the inputs where a round after round 1 is the best round. Widened and narrowed: the mean count of the changed sides.",
        "",
        "| Iteration pair | Scope | Inputs | Rounds | Best round | Gained | Stops | Widened | Narrowed |",
        "|---|---|---|---|---|---|---|---|---|",
      );
      for (const r of iter) {
        const t = r.iterate!;
        const stops = Object.entries(t.stops).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
        lines.push(`| ${r.pair} | ${r.scope} | ${r.inputs} | ${f3(t.rounds)} | ${f3(t.best)} | ${t.gained} | ${stops} | ${f3(t.widened)} | ${f3(t.narrowed)} |`);
      }
    }
  }
  if (report.stress !== undefined) {
    lines.push("", `### The stress cell (${report.stress.inputs} inputs)`, "", "| Rule | Cap | Best pair | Misses | Score | Oracle | Gain | k = 3 share | k = 8 share |", "|---|---|---|---|---|---|---|---|---|");
    for (const c of report.stress.cells) {
      const k = (n: number): string => interval(c.portfolios.find((p) => p.k === n)?.share);
      lines.push(`| ${c.rule} | ${c.cap} | ${c.best.pair} | ${c.best.misses} | ${f3(c.best.score)} | ${f3(c.oracle.score)} | ${interval(c.oracle.gain)} | ${k(3)} | ${k(8)} |`);
    }
  }
  lines.push("", "### Thin board kinds", "");
  lines.push(report.thinKinds.length === 0 ? "Each board kind has 10 inputs or more." : report.thinKinds.map((t) => `- ${t.kind}: ${t.inputs} inputs`).join("\n"));
  lines.push("", report.thinKindSizes.length === 0 ? "Each board kind has 10 inputs or more for each container size." : `By container size: ${report.thinKindSizes.map((t) => `${t.kind} (${t.inputs})`).join(", ")}.`, "");
  return lines.join("\n");
}
