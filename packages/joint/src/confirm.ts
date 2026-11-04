// The confirmation of the first joint default (`docs/JOINT-BENCH.md`, roadmap item L40). It reads the records of a run on fresh seeds and gives a decision. It has no input or output of its own.
import { JOINT_MEASURES, verdict, type LayoutRecord, type VerdictResult, type VerdictSignTest } from "@mark1russell7/layout-contract";
import { holm, quantileSorted } from "@mark1russell7/rigor-statistics";
import { cellValues, HEADLINE, indexRecords, scoreOf, type AnalysisInput, type CellValues } from "./analysis.ts";
import { iterEntries, ITER_VARIANTS, laneEntries, LANE_VARIANTS, type IterEntry, type LaneEntry } from "./lanes.ts";
import { familyOf } from "./memory-gate.ts";
import { SWEEP_LEVEL, SWEEP_TIE } from "./sweep.ts";

/** The seeds of the confirmation. The corpus of each earlier run has the seeds 1 to 3. */
export const CONFIRM_SEEDS: readonly number[] = Object.freeze([4, 5, 6]);

/** The pack entry of the candidates, of the incumbent and of the base pair. */
const PACK = "maxrects-cp";

/** The router of the candidates, of the incumbent and of the base pair. */
const ROUTER = "corners";

/** The candidate of L11, with a cap of 3 rounds. */
export const CONFIRM_ITER3 = "lanes-iter3.maxrects-cp.corners+corners";

/** The other candidate of L11, with a cap of 2 rounds. It ties with `CONFIRM_ITER3` on the seeds 1 to 3, and it is faster. */
export const CONFIRM_ITER2 = "lanes-iter2.maxrects-cp.corners+corners";

/** The pair that the candidates replace: the best pair of L13. */
export const CONFIRM_INCUMBENT = "lanes-sides.maxrects-cp.corners+corners";

/** The base pair of the candidates: the best pair of L32. */
export const CONFIRM_BASE = "maxrects-cp+corners";

/** The two baselines of the joint bench. */
export const CONFIRM_BASELINES: readonly string[] = Object.freeze(["rows+portfolio", "select+portfolio"]);

/** The pairs of the run that have no lanes and no rounds. */
export const CONFIRM_PLAIN_PAIRS: readonly string[] = Object.freeze([CONFIRM_BASE, ...CONFIRM_BASELINES]);

/** Each pair of the run. The floor of an input comes from these pairs only. */
export const CONFIRM_PAIRS: readonly string[] = Object.freeze([CONFIRM_ITER3, CONFIRM_ITER2, CONFIRM_INCUMBENT, ...CONFIRM_PLAIN_PAIRS]);

/** One guard measure of the decision: its id, its direction and the smallest change of a family mean that is not a tie. */
export interface ConfirmGuardSpec {
  readonly id: string;
  readonly direction: "lower" | "higher";
  readonly tie: number;
}

/** The `pack.*` guards of `docs/PROMOTION.md`, with their directions. The registry of L65 replaces this table. */
const PACK_GUARDS: readonly ConfirmGuardSpec[] = Object.freeze([
  { id: "pack.area", direction: "lower", tie: 0 },
  { id: "pack.fill", direction: "higher", tie: 0 },
  { id: "pack.aspectError", direction: "lower", tie: 0 },
  { id: "pack.order.inversions", direction: "lower", tie: 0 },
]);

/** The guards of the decision: the `joint.*` guards and the `pack.*` guards. */
export const CONFIRM_GUARDS: readonly ConfirmGuardSpec[] = Object.freeze([
  ...JOINT_MEASURES.filter((m) => m.role === "guard").map((m): ConfirmGuardSpec => ({ id: m.id, direction: m.direction === "higher" ? "higher" : "lower", tie: typeof m.minEffect === "number" ? m.minEffect : 0 })),
  ...PACK_GUARDS,
]);

/** The name of the score in the records of the verdict. */
const SCORE = "confirm.score";

/** The count of the samples of each bootstrap, as in the sweep. */
const RUNS = 2000;

/** The count of the random sign sets, as in the sweep. */
const DRAWS = 4000;

/** This function gives the lane entry of the incumbent, for the option `lanes` of `pairRuns`. */
export function confirmLanes(): readonly LaneEntry[] {
  return laneEntries(LANE_VARIANTS.filter((v) => v.mode === "sides" && v.passes === 1), [PACK], [ROUTER]);
}

/** This function gives the iteration entries of the two candidates, for the option `iterate` of `pairRuns`. */
export function confirmIterate(): readonly IterEntry[] {
  return iterEntries(ITER_VARIANTS.slice(1, 3), [PACK], [ROUTER]);
}

/** One paired comparison of the score: candidate `b` against pair `a`. */
export interface ConfirmCompare {
  readonly a: string;
  readonly b: string;
  readonly n: number;
  /** The label of the verdict, before the correction for many comparisons. */
  readonly label: VerdictResult["label"];
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
  readonly p: number;
  /** The Holm p over the comparisons of the scope. */
  readonly adjusted: number;
  /** `true` when the label is `better` and the Holm p is below the level. */
  readonly better: boolean;
  /** `true` when the label is `worse` and the Holm p is below the level. */
  readonly worse: boolean;
  readonly signs: VerdictSignTest;
  readonly summary: string;
}

/** One guard of a candidate against one pair, with the label `worse`. */
export interface ConfirmGuard {
  readonly a: string;
  readonly b: string;
  readonly measure: string;
  readonly mean: number;
  readonly n: number;
}

/** The misses and the mean score of one pair. */
export interface ConfirmPair {
  readonly pair: string;
  readonly records: number;
  readonly misses: number;
  readonly score: number;
  /** The median time of a record in ms. */
  readonly medianMs: number;
}

/** The result of one scope of inputs. */
export interface ConfirmScope {
  readonly scope: "headline" | "stress";
  readonly inputs: number;
  /** The inputs of the scope where a pair of the run has no record. */
  readonly incomplete: number;
  readonly pairs: readonly ConfirmPair[];
  readonly compares: readonly ConfirmCompare[];
}

/** The result of the confirmation. */
export interface ConfirmReport {
  readonly schema: "joint-confirm/1";
  readonly seeds: readonly number[];
  readonly tie: number;
  readonly level: number;
  readonly headline: ConfirmScope;
  readonly stress: ConfirmScope;
  /** The cap that the run chooses: 3 only when it is better than 2 by the corrected verdict. A tie goes to the faster cap. */
  readonly chosen: string;
  /** The guards of each candidate against the incumbent and the base pair that have the label `worse`. */
  readonly worseGuards: readonly ConfirmGuard[];
  /** The count of the guards that are worse for the chosen cap against the incumbent. */
  readonly guardCount: number;
  /** The guards with no paired value for the chosen cap against the incumbent. A guard that nothing reads is not a clean guard. */
  readonly unreadGuards: readonly string[];
  readonly confirmed: boolean;
  /** The conditions of `confirmed`, each with its value. */
  readonly conditions: Readonly<Record<string, boolean>>;
}

/** This function gives the verdict of the score of pair `b` against pair `a` on the inputs. An input without a value of both pairs does not count. */
function scoreVerdict(cell: CellValues, inputs: readonly AnalysisInput[], a: string, b: string): VerdictResult {
  const records: { strategy: string; input: string; seed: number; measures: Record<string, number> }[] = [];
  for (const input of inputs) {
    const at = cell.values.get(input.id);
    if (at?.has(a) !== true || !at.has(b)) continue;
    records.push({ strategy: "a", input: input.id, seed: input.seed, measures: { [SCORE]: scoreOf(cell, input.id, a) } });
    records.push({ strategy: "b", input: input.id, seed: input.seed, measures: { [SCORE]: scoreOf(cell, input.id, b) } });
  }
  return verdict(records, { by: "family", family: (r) => familyOf(r.input), measure: { id: SCORE, direction: "higher" }, a: "a", b: "b", tie: SWEEP_TIE, level: SWEEP_LEVEL, runs: RUNS, draws: DRAWS });
}

/** This function gives the comparisons of a scope: each candidate against each other pair, and the cap 3 against the cap 2. */
function comparePairs(): readonly (readonly [string, string])[] {
  const others = [CONFIRM_INCUMBENT, ...CONFIRM_PLAIN_PAIRS];
  return [...[CONFIRM_ITER3, CONFIRM_ITER2].flatMap((b) => others.map((a) => [a, b] as const)), [CONFIRM_ITER2, CONFIRM_ITER3]];
}

/** This function gives the median of the times of the records. */
function medianMs(records: readonly LayoutRecord[]): number {
  const times = records.map((r) => r.ms).sort((x, y) => x - y);
  return times.length === 0 ? 0 : quantileSorted(times, 0.5);
}

/** This function gives the comparisons of the score of each pair `[a, b]` on the inputs. The Holm family is the list of the pairs. */
export function compareAll(cell: CellValues, inputs: readonly AnalysisInput[], pairs: readonly (readonly [string, string])[]): ConfirmCompare[] {
  const verdicts = pairs.map(([a, b]) => ({ a, b, v: scoreVerdict(cell, inputs, a, b) }));
  const corrected = holm(verdicts.map(({ v }) => v.permutation.p), SWEEP_LEVEL);
  return verdicts.map(({ a, b, v }, i): ConfirmCompare => {
    const c = corrected[i]!;
    return { a, b, n: v.n, label: v.label, mean: v.stratified.mean, lo: v.stratified.lo, hi: v.stratified.hi, p: v.permutation.p, adjusted: c.adjusted, better: v.label === "better" && c.reject, worse: v.label === "worse" && c.reject, signs: v.signTest, summary: v.summary };
  });
}

/** This function gives the result of one scope. The Holm family is the list of the comparisons of the scope. */
function scopeOf(scope: ConfirmScope["scope"], records: readonly LayoutRecord[], inputs: readonly AnalysisInput[]): ConfirmScope {
  const ids = new Set(inputs.map((i) => i.id));
  const inScope = records.filter((r) => ids.has(r.input) && r.skipped === undefined);
  const cell = cellValues(indexRecords(inScope), inputs, HEADLINE.rule, HEADLINE.cap);
  const compares = compareAll(cell, inputs, comparePairs());
  const pairs = CONFIRM_PAIRS.map((pair): ConfirmPair => {
    const mine = inScope.filter((r) => r.strategy === pair);
    const at = new Set(mine.map((r) => r.input));
    let misses = 0;
    let sum = 0;
    for (const id of at) {
      if (cell.floor.get(id)?.has(pair) !== true) misses += 1;
      sum += scoreOf(cell, id, pair);
    }
    return { pair, records: at.size, misses, score: at.size === 0 ? 0 : sum / at.size, medianMs: medianMs(mine) };
  });
  const incomplete = inputs.filter((i) => CONFIRM_PAIRS.some((p) => cell.values.get(i.id)?.has(p) !== true)).length;
  return { scope, inputs: inputs.length, incomplete, pairs, compares };
}

/** This function tells if the records give a pair of values of a guard for the pairs `a` and `b`. */
export function guardRead(records: readonly LayoutRecord[], guard: ConfirmGuardSpec, a: string, b: string): boolean {
  const left = new Set(records.filter((r) => r.strategy === a && r.measures[guard.id] !== undefined).map((r) => r.input));
  return records.some((r) => r.strategy === b && r.measures[guard.id] !== undefined && left.has(r.input));
}

/** This function gives the guards of one candidate against one pair that have the label `worse`. A guard with no paired value does not count. */
export function worseGuards(records: readonly LayoutRecord[], a: string, b: string): ConfirmGuard[] {
  const out: ConfirmGuard[] = [];
  for (const guard of CONFIRM_GUARDS) {
    if (!guardRead(records, guard, a, b)) continue;
    const v = verdict(records, { by: "family", family: (r) => familyOf(r.input), measure: guard, a, b, tie: guard.tie, level: SWEEP_LEVEL, runs: RUNS, draws: DRAWS });
    if (v.label === "worse") out.push({ a, b, measure: guard.id, mean: v.stratified.mean, n: v.n });
  }
  return out;
}

/** This function finds one comparison of a scope. */
function compareOf(scope: ConfirmScope, a: string, b: string): ConfirmCompare {
  const found = scope.compares.find((c) => c.a === a && c.b === b);
  if (found === undefined) throw new RangeError(`There is no comparison of ${b} with ${a}.`);
  return found;
}

/**
 * This function gives the result of the confirmation. The rule of the decision comes before the run:
 * - The cap 3 stays only when it is better than the cap 2 on the headline inputs. A tie goes to the faster cap.
 * - The chosen cap is better than each baseline. It is not worse than the incumbent or the base pair.
 * - Against the incumbent, no guard is worse and each guard has values.
 * - Each pair has a record on each headline input, so a lost shard cannot change the decision.
 */
export function confirmDefault(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[]): ConfirmReport {
  const headlineInputs = inputs.filter((i) => i.stress !== true);
  const headline = scopeOf("headline", records, headlineInputs);
  const stress = scopeOf("stress", records, inputs.filter((i) => i.stress === true));
  const chosen = compareOf(headline, CONFIRM_ITER2, CONFIRM_ITER3).better ? CONFIRM_ITER3 : CONFIRM_ITER2;
  const ids = new Set(headlineInputs.map((i) => i.id));
  const live = records.filter((r) => ids.has(r.input) && r.skipped === undefined);
  const guards = [CONFIRM_ITER3, CONFIRM_ITER2].flatMap((b) => [CONFIRM_INCUMBENT, CONFIRM_BASE].flatMap((a) => worseGuards(live, a, b)));
  const guardCount = guards.filter((g) => g.a === CONFIRM_INCUMBENT && g.b === chosen).length;
  const unreadGuards = CONFIRM_GUARDS.filter((g) => !guardRead(live, g, CONFIRM_INCUMBENT, chosen)).map((g) => g.id);
  const conditions = {
    complete: headline.incomplete === 0,
    ...Object.fromEntries(CONFIRM_BASELINES.map((a) => [`better than ${a}`, compareOf(headline, a, chosen).better])),
    "not worse than the incumbent": !compareOf(headline, CONFIRM_INCUMBENT, chosen).worse,
    "not worse than the base pair": !compareOf(headline, CONFIRM_BASE, chosen).worse,
    "no worse guard": guardCount === 0,
    "each guard read": unreadGuards.length === 0,
  };
  return { schema: "joint-confirm/1", seeds: CONFIRM_SEEDS, tie: SWEEP_TIE, level: SWEEP_LEVEL, headline, stress, chosen, worseGuards: guards, guardCount, unreadGuards, confirmed: Object.values(conditions).every((c) => c), conditions };
}

/** This function gives a number with 3 decimals and a sign. */
const signed = (x: number): string => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;

/** This function gives the tables of one scope. */
function scopeMarkdown(s: ConfirmScope): string[] {
  return [
    `## ${s.scope === "headline" ? "The headline inputs" : "The stress inputs"}: ${s.inputs} inputs, ${s.incomplete} incomplete`,
    "",
    "| Pair | Records | Misses | Score | Median ms |",
    "|---|---:|---:|---:|---:|",
    ...s.pairs.map((p) => `| \`${p.pair}\` | ${p.records} | ${p.misses} | ${p.score.toFixed(3)} | ${p.medianMs.toFixed(0)} |`),
    "",
    "| Candidate | Against | n | Gain | Interval | p | Holm p | Label | Families |",
    "|---|---|---:|---:|---|---:|---:|---|---|",
    ...s.compares.map((c) => `| \`${c.b}\` | \`${c.a}\` | ${c.n} | ${signed(c.mean)} | [${signed(c.lo)}, ${signed(c.hi)}] | ${c.p.toFixed(4)} | ${c.adjusted.toFixed(4)} | ${c.label} | ${c.summary} |`),
    "",
  ];
}

/** This function gives the text of the result. */
export function confirmMarkdown(report: ConfirmReport): string {
  return [
    `# The confirmation of the first joint default: ${report.confirmed ? "confirmed" : "not confirmed"}`,
    "",
    `The seeds are ${report.seeds.join(", ")}. The floor of each input comes from the ${CONFIRM_PAIRS.length} pairs of this run. The chosen cap is \`${report.chosen}\`.`,
    "",
    "| Condition | Holds |",
    "|---|---|",
    ...Object.entries(report.conditions).map(([name, value]) => `| ${name} | ${value ? "yes" : "no"} |`),
    "",
    ...scopeMarkdown(report.headline),
    ...scopeMarkdown(report.stress),
    `## The worse guards: ${report.guardCount} for the chosen cap against the incumbent`,
    "",
    `The guards with no value: ${report.unreadGuards.length === 0 ? "none" : report.unreadGuards.join(", ")}.`,
    "",
    "| Candidate | Against | Measure | Mean | n |",
    "|---|---|---|---:|---:|",
    ...report.worseGuards.map((g) => `| \`${g.b}\` | \`${g.a}\` | ${g.measure} | ${signed(g.mean)} | ${g.n} |`),
    "",
  ].join("\n");
}
