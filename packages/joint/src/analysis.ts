// The analysis of the joint benchmark (`docs/JOINT-BENCH.md`). It reads records and the facts of the inputs, and gives a report. It has no input or output of its own.
import { compareMeasure, JOINT_MEASURES, mulberry32, outputGroups, selectBest, type LayoutRecord, type SelectCandidate, type SelectLevel } from "@mark1russell7/layout-contract";
import { recordCount, type RecordCount } from "./record-count.ts";
import { CAPS, PAIR_SEPARATOR } from "./runner.ts";

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

/** The spec of `pack.overflow.excessArea` in the pack rule. */
const EXCESS = { direction: "lower", minEffect: 0.005 } as const;

/** The spec of `pack.fill` in the pack rule. */
const PACK_FILL = { direction: "higher", minEffect: 0.005 } as const;

/** This function gives the pick spec of a joint measure. */
function jointSpec(id: string): SelectLevel["spec"] {
  const spec = JOINT_MEASURES.find((m) => m.id === id);
  if (spec === undefined) throw new RangeError(`There is no joint measure "${id}".`);
  return { direction: spec.direction, minEffect: spec.minEffect ?? 0 };
}

/**
 * The levels of the pick on one input, in order. Level 0 is `hard`. Level 1 is the overflow area above its bound.
 * Then `joint.fill`, and `joint.spill` and `joint.straight.crossings` break the ties.
 */
export const PICK_LEVELS: readonly SelectLevel[] = Object.freeze([
  { id: "hard", spec: { direction: "lower", minEffect: 0 } },
  { id: "pack.overflow.excessArea", spec: EXCESS },
  { id: "joint.fill", spec: jointSpec("joint.fill") },
  { id: "joint.spill", spec: jointSpec("joint.spill") },
  { id: "joint.straight.crossings", spec: jointSpec("joint.straight.crossings") },
] as SelectLevel[]);

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
}

/** The routers of the prediction Q2 of `joint-v2`. */
export const CLEAN_ROUTERS: readonly string[] = Object.freeze(["corners", "sections", "shared"]);

/** The headline cell of the predictions: the rule `all` with the cap 1.25, as in the result of the first run. */
export const HEADLINE: { readonly rule: "all"; readonly cap: number } = Object.freeze({ rule: "all", cap: 1.25 });

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
  readonly test: number;
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

/** This function gives the count of the breaks of the pack and of the route in a record: the `pack.*` breaks and `route.violations`. */
function baseHard(record: LayoutRecord): number {
  let sum = record.hard["route.violations"] ?? 0;
  for (const [k, v] of Object.entries(record.hard)) if (k.startsWith("pack.")) sum += v;
  return sum;
}

/** This function gives the hard value of a record in a cell. It adds the base breaks, the routes above the cap, and the mixed segments under the rule `collection`. */
export function hardOf(record: LayoutRecord, rule: "collection" | "all", cap: number): number {
  const m = record.measures;
  return baseHard(record) + (m[`route.cap.${cap}`] ?? 0) + (rule === "collection" ? (m["route.mixed"] ?? 0) : 0);
}

/** This function gives the values of the pick levels of a record in a cell. A missing joint value is 0, because each pair of the input misses it. */
function pickValues(record: LayoutRecord, rule: "collection" | "all", cap: number): Record<string, number> {
  const m = record.measures;
  return {
    hard: hardOf(record, rule, cap),
    "pack.overflow.excessArea": m["pack.overflow.excessArea"] ?? 0,
    "joint.fill": m["joint.fill"] ?? 0,
    "joint.spill": m["joint.spill"] ?? 0,
    "joint.straight.crossings": m["joint.straight.crossings"] ?? 0,
  };
}

/** This function tells if a pack is clean: no hard break of the pack and no overflow. */
function packClean(record: LayoutRecord): boolean {
  for (const [k, v] of Object.entries(record.hard)) if (k.startsWith("pack.") && v > 0) return false;
  return (record.measures["pack.overflow"] ?? 0) === 0;
}

/** This function compares two value sets by the levels in order: the first level that is not a tie decides. */
function lexicographic(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>, levels: readonly SelectLevel[]): "better" | "worse" | "tie" {
  for (const level of levels) {
    const v = compareMeasure(a[level.id]!, b[level.id]!, level.spec);
    if (v !== "tie") return v;
  }
  return "tie";
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
  options: Required<Pick<AnalysisOptions, "resamples" | "seed" | "sizes">>,
): CellReport {
  const cell = cellValues(index, inputs, rule, cap);
  const ids = inputs.map((i) => i.id);
  const reps = groups.map((g) => g.id);
  const spec = new Map(inputs.map((i) => [i.id, i.spec]));

  const single = selectBest(
    reps.map((p) => ({ id: p, values: setValues(cell, picksOf(cell, ids, [p])) })),
    SET_LEVELS,
  );
  const best = single.winner;
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
  for (const test of seeds) {
    const train = inputs.filter((i) => i.seed !== test).map((i) => i.id);
    const held = inputs.filter((i) => i.seed === test).map((i) => i.id);
    const members = greedy(cell, train, reps, maxK);
    const base = picksOf(cell, held, members.slice(0, 1));
    for (const k of options.sizes) {
      const picks = picksOf(cell, held, members.slice(0, k));
      const rows = held.map((i) => {
        const b = scoreOf(cell, i, base.get(i));
        return { cluster: spec.get(i)!, value: scoreOf(cell, i, picks.get(i)) - b, weight: scoreOf(cell, i, cell.oracle.get(i)) - b };
      });
      pooled.get(k)!.push(...rows);
      const den = rows.reduce((s, r) => s + r.weight, 0);
      const share = den > 0 ? rows.reduce((s, r) => s + r.value, 0) / den : undefined;
      folds.get(k)!.push({ test, members: members.slice(0, k), ...(share === undefined ? {} : { share }) });
    }
  }
  const portfolios: PortfolioReport[] = options.sizes.map((k) => ({ k, share: bootstrap(pooled.get(k)!, options.resamples, options.seed), folds: folds.get(k)! }));

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

/** This function counts the breaks of `no-pass-through` for each value of spacing and each router. An input with no value has the value `none`. */
export function throughCounts(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[]): ThroughCount[] {
  const spacing = new Map(inputs.map((i) => [i.id, i.cell["spacing"] ?? "none"]));
  const out = new Map<string, { spacing: string; router: string; routed: number; broken: number; breaks: number; causes: Record<string, number> }>();
  for (const r of records) {
    const sp = spacing.get(r.input);
    if (sp === undefined || r.skipped !== undefined || (r.measures["joint.routes"] ?? 0) <= 0) continue;
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

/** This function gives the mean `pack.fill` of the pack records of each value of spacing. A pack record is the first record of each pack entry on an input. */
function fillOf(index: RecordIndex, inputs: readonly AnalysisInput[]): Record<string, number> {
  const values = new Map<string, number[]>();
  for (const i of inputs) {
    const sp = i.cell["spacing"] ?? "none";
    for (const r of index.pack.get(i.id)?.values() ?? []) {
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
 */
export function analyze(records: readonly LayoutRecord[], allInputs: readonly AnalysisInput[], options: AnalysisOptions = {}): Report {
  const opts = { resamples: options.resamples ?? 1000, seed: options.seed ?? 1, sizes: options.sizes ?? PORTFOLIO_SIZES };
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
  return { ...base, predictions: options.predictions === "joint-v2" ? checkPredictionsV2(base) : checkPredictions(base) };
}

/** This function gives the headline cell on the inputs of a subset, with the pack entry of the headline as the best pack. */
function subsetReport(
  records: readonly LayoutRecord[],
  inputs: readonly AnalysisInput[],
  ids: readonly string[],
  bestPack: string,
  opts: Required<Pick<AnalysisOptions, "resamples" | "seed" | "sizes">>,
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
  opts: Required<Pick<AnalysisOptions, "resamples" | "seed" | "sizes">>,
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

/** This function writes a report as Markdown. */
export function reportMarkdown(report: Report): string {
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
  for (const c of report.cells) for (const p of c.portfolios) for (const f of p.folds) lines.push(`| ${c.rule} | ${c.cap} | ${p.k} | ${f.test} | ${f.members.join(", ")} | ${f3(f.share)} |`);
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
