// The verdict over families (`docs/VERDICT.md`). highways, packing and the joint bench use the same rule, so they give the same verdict.
import { compareMeasure, type MeasureSpec } from "./measures.ts";
import { stepRandom } from "./random.ts";
import type { LayoutRecord } from "./record.ts";

/**
 * The largest count of inputs for the exact permutation test. Up to this count, the test enumerates all `2^n` sign sets.
 * At 16 inputs, that is 65 536 sign sets, approximately 3 times the default draws. Above it, the cost doubles with each input, so the test uses seeded draws.
 */
export const VERDICT_EXACT_MAX = 16;

/** The largest value of the option `exactMax`. At 20 inputs, the exact test has approximately 1 million sign sets. */
export const VERDICT_EXACT_CAP = 20;

/** The default count of the samples of each bootstrap. It is the parameter `bootstrapRuns` of `docs/PROMOTION.md`. */
export const VERDICT_RUNS = 10000;

/** The default count of the random sign sets of the permutation test above `VERDICT_EXACT_MAX` inputs. */
export const VERDICT_DRAWS = 20000;

/** The default seed of the bootstraps and of the random sign sets. */
export const VERDICT_SEED = 1;

/** The fields of a record that the verdict reads. */
export type VerdictRecord = Pick<LayoutRecord, "strategy" | "input" | "seed" | "measures"> & { readonly skipped?: string };

/** One side of a verdict: a strategy id, or a test that selects the records of the side. */
export type VerdictSide<R extends VerdictRecord = VerdictRecord> = string | ((record: R) => boolean);

/** The arguments of `verdict`. `tie` and `level` have no default. */
export interface VerdictOptions<R extends VerdictRecord = VerdictRecord> {
  /** The unit of the verdict. The family is the only unit. */
  readonly by: "family";
  /** The hook that gives the family of a record, for example `familyOf` of the cell of its input. */
  readonly family: (record: R) => string;
  /** The measure. Its direction tells which side is better. */
  readonly measure: Pick<MeasureSpec, "id" | "direction">;
  /** The baseline side. */
  readonly a: VerdictSide<R>;
  /** The candidate side. A positive difference tells that `b` is better than `a`. */
  readonly b: VerdictSide<R>;
  /**
   * The minimum effect of the sign of a family, as `minEffect` of `MeasureSpec`. A smaller change of the family mean is a tie.
   * `compareMeasure` compares the two family means, so the smallest tie is one grid step of `RECORD_EPS`.
   */
  readonly tie: number | { readonly rel: number };
  /** The significance level, from 0 to 1. The permutation p must be below it. The intervals have the level `1 - level`. */
  readonly level: number;
  /** The count of the samples of each bootstrap. The default is `VERDICT_RUNS`. */
  readonly runs?: number;
  /** The count of the random sign sets above the exact limit. The default is `VERDICT_DRAWS`. */
  readonly draws?: number;
  /** The seed of the bootstraps and of the random sign sets. The default is `VERDICT_SEED`. */
  readonly seed?: number;
  /** The largest count of inputs for the exact test. The default is `VERDICT_EXACT_MAX`. The value 0 always uses draws. */
  readonly exactMax?: number;
}

/** A mean with its bootstrap interval. The interval is clear of 0 when `lo > 0` or `hi < 0`. */
export interface VerdictInterval {
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
}

/** The difference of one family: the count of its inputs, the mean of their differences and its sign. */
export interface FamilyVerdict {
  readonly family: string;
  readonly n: number;
  readonly mean: number;
  /** The value 1 tells that `b` is better, -1 that `b` is worse, and 0 a tie by `tie`. */
  readonly sign: -1 | 0 | 1;
}

/** The stratified paired permutation test. With `exact`, `draws` is the count of all the sign sets. */
export interface VerdictPermutation {
  readonly p: number;
  readonly exact: boolean;
  readonly draws: number;
  readonly seed: number;
}

/** The two-sided exact sign test of the family signs. It is a report only. Ties do not count. */
export interface VerdictSignTest {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly p: number;
}

/** The label of a verdict. `better` and `worse` tell the side of `b`. */
export type VerdictLabel = "better" | "worse" | "depends on the mix" | "no verdict";

/** The result of `verdict`. */
export interface VerdictResult {
  readonly measure: string;
  /** The count of the paired inputs. */
  readonly n: number;
  /** The mean of the family means, with a bootstrap of the seeds inside each family. */
  readonly stratified: VerdictInterval;
  /** The mean of the inputs, with a bootstrap of the inputs. */
  readonly pooled: VerdictInterval;
  readonly permutation: VerdictPermutation;
  /** The families, in sort order. */
  readonly families: readonly FamilyVerdict[];
  readonly signTest: VerdictSignTest;
  /** `true` only when the two means have the same sign, the two intervals are clear of 0 and the permutation p is below `level`. */
  readonly agree: boolean;
  readonly label: VerdictLabel;
  /** The inputs without a pair: one side has no record, a skipped record or no value of the measure. */
  readonly dropped: readonly string[];
}

/** One paired input: its key, its family, the two values and the difference in the direction of the measure. */
interface Pair {
  readonly key: string;
  readonly family: string;
  readonly a: number;
  readonly b: number;
  readonly d: number;
}

/** This function gives the mean of a list that is not empty. */
const meanOf = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

/** This function gives the `q` quantile of sorted values, with linear interpolation. */
function quantileOf(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** This function gives the interval of the samples of a bootstrap at the level `1 - level`. */
function intervalOf(mean: number, samples: number[], level: number): VerdictInterval {
  samples.sort((x, y) => x - y);
  return { mean, lo: quantileOf(samples, level / 2), hi: quantileOf(samples, 1 - level / 2) };
}

/** This function tells if an interval is clear of 0 on the side of the sign `sign`. */
const clearOn = (i: VerdictInterval, sign: number): boolean => (sign > 0 ? i.lo > 0 : sign < 0 ? i.hi < 0 : false);

/** This function gives the two-sided p of the exact binomial sign test, with `p = 0.5`. No count gives 1. */
function signP(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let tail = 0;
  let c = 1;
  for (let i = 0; i <= k; i++) {
    tail += c;
    c = (c * (n - i)) / (i + 1);
  }
  return Math.min(1, (2 * tail) / 2 ** n);
}

/** This function tells if a value is a positive whole number. */
const isCount = (v: number): boolean => Number.isInteger(v) && v > 0;

/** This function gives the test of one side. */
function sideTest<R extends VerdictRecord>(side: VerdictSide<R>): (record: R) => boolean {
  return typeof side === "string" ? (r) => r.strategy === side : side;
}

/** This function pairs the records of `a` and `b` by input and seed, and gives the pairs in the order of family and key. */
function pairsOf<R extends VerdictRecord>(records: Iterable<R>, options: VerdictOptions<R>): { pairs: Pair[]; dropped: string[] } {
  const isA = sideTest(options.a);
  const isB = sideTest(options.b);
  const sides = new Map<string, { a?: R; b?: R }>();
  for (const r of records) {
    const inA = isA(r);
    const inB = isB(r);
    if (inA && inB) throw new RangeError(`verdict: the record of the input "${r.input}" is in the two sides`);
    if (!inA && !inB) continue;
    const key = `${r.input}#${r.seed}`;
    const entry = sides.get(key) ?? {};
    const side = inA ? "a" : "b";
    if (entry[side] !== undefined) throw new RangeError(`verdict: the side ${side} has two records of the input "${r.input}" and the seed ${r.seed}`);
    entry[side] = r;
    sides.set(key, entry);
  }
  const pairs: Pair[] = [];
  const dropped: string[] = [];
  const id = options.measure.id;
  for (const [key, { a, b }] of sides) {
    const va = a?.skipped === undefined ? a?.measures[id] : undefined;
    const vb = b?.skipped === undefined ? b?.measures[id] : undefined;
    if (a === undefined || b === undefined || va === undefined || vb === undefined) {
      dropped.push(key);
      continue;
    }
    if (!Number.isFinite(va) || !Number.isFinite(vb)) throw new RangeError(`verdict: the measure ${id} of the input "${a.input}" is not finite`);
    const family = options.family(a);
    if (options.family(b) !== family) throw new RangeError(`verdict: the two records of the input "${a.input}" have different families`);
    pairs.push({ key, family, a: va, b: vb, d: options.measure.direction === "higher" ? vb - va : va - vb });
  }
  pairs.sort((x, y) => (x.family < y.family ? -1 : x.family > y.family ? 1 : x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  dropped.sort();
  return { pairs, dropped };
}

/**
 * This function gives the verdict of the candidate `b` against the baseline `a` on one measure, with the family as the unit (`docs/VERDICT.md`).
 *
 * - It pairs the records by input and seed. The difference of a pair is `b - a` for a measure where more is better, else `a - b`.
 * - `stratified` is the mean of the family means. Its bootstrap draws the seeds inside each family. `pooled` is the mean of the inputs.
 * - The permutation test changes the sign of each difference inside its family. Its statistic is the mean of the family means.
 * - The label is `better` or `worse` only when `agree` is `true`. Opposite signs of the two means give `depends on the mix`.
 *
 * It throws a `RangeError` for a missing `tie` or `level`, and for no pair. Two records of one side and input, or a value that is not finite, also cause a `RangeError`.
 */
export function verdict<R extends VerdictRecord>(records: Iterable<R>, options: VerdictOptions<R>): VerdictResult {
  const { tie, level, measure } = options;
  if (options.by !== "family") throw new RangeError(`verdict: the unit is "family", not "${String(options.by)}"`);
  if (tie === undefined || (typeof tie === "number" ? !(tie >= 0) : !(tie.rel >= 0))) throw new RangeError("verdict: tie is a required number of 0 or more, or { rel } of 0 or more");
  if (level === undefined || !(level > 0 && level < 1)) throw new RangeError("verdict: level is a required number between 0 and 1");
  const runs = options.runs ?? VERDICT_RUNS;
  const draws = options.draws ?? VERDICT_DRAWS;
  const seed = options.seed ?? VERDICT_SEED;
  const exactMax = options.exactMax ?? VERDICT_EXACT_MAX;
  if (!isCount(runs) || !isCount(draws)) throw new RangeError("verdict: runs and draws are whole numbers above 0");
  if (!Number.isInteger(exactMax) || exactMax < 0 || exactMax > VERDICT_EXACT_CAP) throw new RangeError(`verdict: exactMax is a whole number from 0 to ${VERDICT_EXACT_CAP}`);

  const { pairs, dropped } = pairsOf(records, options);
  const n = pairs.length;
  if (n === 0) throw new RangeError(`verdict: the records give no pair of the measure ${measure.id}`);

  const groups = new Map<string, Pair[]>();
  for (const p of pairs) groups.set(p.family, [...(groups.get(p.family) ?? []), p]);
  const lists = [...groups.values()];
  const spec = { direction: measure.direction, minEffect: tie };
  const families: FamilyVerdict[] = lists.map((list) => {
    const verdictOf = compareMeasure(meanOf(list.map((p) => p.b)), meanOf(list.map((p) => p.a)), spec);
    return { family: list[0]!.family, n: list.length, mean: meanOf(list.map((p) => p.d)), sign: verdictOf === "better" ? 1 : verdictOf === "worse" ? -1 : 0 };
  });

  // The stratified bootstrap draws the seeds of each family with replacement. The pooled bootstrap draws all the inputs.
  const stratMean = meanOf(families.map((f) => f.mean));
  const rs = stepRandom(seed, "verdict.stratified");
  const stratSamples: number[] = [];
  for (let run = 0; run < runs; run++) {
    let sum = 0;
    for (const list of lists) {
      let s = 0;
      for (let j = 0; j < list.length; j++) s += list[Math.floor(rs() * list.length)]!.d;
      sum += s / list.length;
    }
    stratSamples.push(sum / lists.length);
  }
  const stratified = intervalOf(stratMean, stratSamples, level);

  const pooledMean = meanOf(pairs.map((p) => p.d));
  const rp = stepRandom(seed, "verdict.pooled");
  const pooledSamples: number[] = [];
  for (let run = 0; run < runs; run++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += pairs[Math.floor(rp() * n)]!.d;
    pooledSamples.push(s / n);
  }
  const pooled = intervalOf(pooledMean, pooledSamples, level);

  // The statistic is a weighted sum: the weight of an input is 1 / (the count of families × the count of its family).
  const terms = lists.flatMap((list) => list.map((p) => p.d / (lists.length * list.length)));
  const observed = Math.abs(terms.reduce((s, t) => s + t, 0));
  const slack = 1e-12 * terms.reduce((s, t) => s + Math.abs(t), 0);
  const exact = n <= exactMax;
  let hits = 0;
  let total: number;
  if (exact) {
    total = 2 ** n;
    for (let mask = 0; mask < total; mask++) {
      let t = 0;
      for (let i = 0; i < n; i++) t += mask & (1 << i) ? -terms[i]! : terms[i]!;
      if (Math.abs(t) >= observed - slack) hits++;
    }
  } else {
    total = draws;
    const rf = stepRandom(seed, "verdict.permutation");
    for (let k = 0; k < draws; k++) {
      let t = 0;
      for (let i = 0; i < n; i++) t += rf() < 0.5 ? -terms[i]! : terms[i]!;
      if (Math.abs(t) >= observed - slack) hits++;
    }
  }
  // A drawn p counts the observed sign set as one draw, so it is always above 0.
  const permutation: VerdictPermutation = { p: exact ? hits / total : (hits + 1) / (total + 1), exact, draws: total, seed };

  const wins = families.filter((f) => f.sign === 1).length;
  const losses = families.filter((f) => f.sign === -1).length;
  const signTest: VerdictSignTest = { wins, losses, ties: families.length - wins - losses, p: signP(wins, losses) };

  const sign = Math.sign(stratified.mean);
  const agree = sign !== 0 && sign === Math.sign(pooled.mean) && clearOn(stratified, sign) && clearOn(pooled, sign) && permutation.p < level;
  const label: VerdictLabel = agree ? (sign > 0 ? "better" : "worse") : sign * Math.sign(pooled.mean) < 0 ? "depends on the mix" : "no verdict";
  return { measure: measure.id, n, stratified, pooled, permutation, families, signTest, agree, label, dropped };
}
