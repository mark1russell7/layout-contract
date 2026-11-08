// The margin sets of the shard plan (docs/JOINT-BENCH.md, "Margins by pair set", roadmap item L143).
// A margin set comes from the pair lines of one run. Its key is the corpus and the list of its pairs, so a plan finds the margins of its own pairs.
// A plan with other pairs takes the set with the most shared pairs, and its note says so with the error of that set on a held-out seed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mean, quantileSorted } from "@mark1russell7/rigor-statistics";
import { COST_MODEL, inputCost, type SpecMargins } from "./plan.ts";
import type { PairLine } from "./shard-run.ts";

/** The error of a margin set on one seed that the fit did not read. */
export interface HeldOutError {
  /** The mean of |log(real / planned)| over the inputs of the seed. */
  readonly meanAbsLog: number;
  /** The median of real / planned over the inputs of the seed. */
  readonly medianRatio: number;
  readonly inputs: number;
}

/** The margins of one pair set. `specs` and `default` have the form of `cost-margins.json`. */
export interface MarginSet extends SpecMargins {
  /** The key of the set: `pairSetId` of `corpus` and `pairs`. */
  readonly id: string;
  readonly corpus: string;
  readonly run: number;
  /** The commit of the run. The lockfile of this commit gives the versions of the engines. */
  readonly commit: string;
  /** The versions of the engines of the run, for example `{ packing: "0.7.0" }`. They are not in the key, so a release does not void a set. */
  readonly engines?: Readonly<Record<string, string>>;
  readonly pairs: readonly string[];
  readonly quantile: number;
  /** The error of the margins on each seed, from a fit on the other seeds. */
  readonly heldOut: Readonly<Record<string, HeldOutError>>;
}

/** One input of a fit: its id with the seed, and its counts. */
export interface MarginInput {
  readonly id: string;
  readonly boxes: number;
  readonly edges: number;
}

const specOf = (id: string): string => id.replace(/\/s\d+$/, "");
const seedOf = (id: string): string => id.slice(id.lastIndexOf("/") + 1);
const sortedUnique = (pairs: readonly string[]): string[] => [...new Set(pairs)].sort();

/** This function gives the key of a pair set: a hash of the corpus and of the pairs, with no effect of their order. */
export function pairSetId(corpus: string, pairs: readonly string[]): string {
  return createHash("sha256").update([corpus, ...sortedUnique(pairs)].join("\n")).digest("hex").slice(0, 16);
}

/** The time of one input in a run: the sum of the wall times of its finished pairs, and the count of these pairs. */
export interface InputTotal {
  readonly input: string;
  readonly wallMs: number;
  readonly pairs: number;
}

/** This function gives the total of each input of the pair lines of a run. A tagged line is no measurement, so it does not count. */
export function pairTotals(lines: readonly PairLine[]): InputTotal[] {
  const sums = new Map<string, { wallMs: number; pairs: number }>();
  for (const line of lines) {
    if (line.tag !== undefined) continue;
    const sum = sums.get(line.input) ?? { wallMs: 0, pairs: 0 };
    sum.wallMs += line.wallMs;
    sum.pairs += 1;
    sums.set(line.input, sum);
  }
  return [...sums].map(([input, sum]) => ({ input, ...sum }));
}

/** This function gives real / predicted of each input: its wall time over `inputCost` of its count of pairs. A total of an unknown input does not count. */
export function inputRatios(totals: readonly InputTotal[], inputs: ReadonlyMap<string, MarginInput>): Map<string, number> {
  const ratios = new Map<string, number>();
  for (const total of totals) {
    const input = inputs.get(total.input);
    if (input !== undefined && total.pairs > 0) ratios.set(total.input, total.wallMs / inputCost(input.boxes, input.edges, total.pairs));
  }
  return ratios;
}

const quantileOf = (values: readonly number[], p: number): number => quantileSorted([...values].sort((a, b) => a - b), p);

/** This function gives the margin of each spec: the quantile `quantile` of the ratios of its seeds. `default` is the same quantile over all ratios. */
export function marginsOf(ratios: ReadonlyMap<string, number>, quantile: number): SpecMargins {
  const bySpec = new Map<string, number[]>();
  for (const [id, ratio] of ratios) bySpec.set(specOf(id), [...(bySpec.get(specOf(id)) ?? []), ratio]);
  const specs: Record<string, number> = {};
  for (const spec of [...bySpec.keys()].sort()) specs[spec] = quantileOf(bySpec.get(spec)!, quantile);
  return { specs, default: quantileOf([...ratios.values()], quantile) };
}

const marginOf = (margins: SpecMargins, spec: string): number => (Object.hasOwn(margins.specs, spec) ? margins.specs[spec]! : margins.default);

/** This function gives the error of the margins on each seed. The margins come from the other seeds. Each input of the seed gives |log(real / planned)|. */
export function heldOutErrors(ratios: ReadonlyMap<string, number>, quantile: number): Record<string, HeldOutError> {
  const seeds = [...new Set([...ratios.keys()].map(seedOf))].sort();
  const errors: Record<string, HeldOutError> = {};
  for (const seed of seeds) {
    const train = new Map([...ratios].filter(([id]) => seedOf(id) !== seed));
    if (train.size === 0) continue;
    const margins = marginsOf(train, quantile);
    const test = [...ratios].filter(([id]) => seedOf(id) === seed).map(([id, ratio]) => ratio / marginOf(margins, specOf(id)));
    errors[seed] = { meanAbsLog: mean(test.map((r) => Math.abs(Math.log(r)))), medianRatio: quantileOf(test, 0.5), inputs: test.length };
  }
  return errors;
}

/**
 * The options of a fit. `totals` are the times of the inputs of one run, and `inputs` are the inputs of its corpus.
 * `pairs` are the pairs of the plan of the run, also a pair with no finished line.
 */
export interface MarginFit {
  readonly corpus: string;
  readonly run: number;
  readonly commit: string;
  readonly pairs: readonly string[];
  readonly totals: readonly InputTotal[];
  readonly inputs: readonly MarginInput[];
  readonly quantile: number;
  readonly engines?: Readonly<Record<string, string>>;
}

/** This function gives the margin set of a run: its margins, and their error on each seed from a fit on the other seeds. */
export function fitMarginSet(fit: MarginFit): MarginSet {
  if (!(fit.quantile > 0 && fit.quantile < 1)) throw new RangeError(`The quantile of a margin set is between 0 and 1, not ${fit.quantile}.`);
  const ratios = inputRatios(fit.totals, new Map(fit.inputs.map((input) => [input.id, input])));
  if (ratios.size === 0) throw new RangeError("A margin set needs the time of at least one known input.");
  if (fit.pairs.length === 0) throw new RangeError("A margin set needs at least one pair.");
  const pairs = sortedUnique(fit.pairs);
  return { id: pairSetId(fit.corpus, pairs), corpus: fit.corpus, run: fit.run, commit: fit.commit, ...(fit.engines === undefined ? {} : { engines: fit.engines }), pairs, quantile: fit.quantile, ...marginsOf(ratios, fit.quantile), heldOut: heldOutErrors(ratios, fit.quantile) };
}

/** The margin set of a plan. `shared` counts the pairs of both, and `overlap` is `shared` over the count of the pairs of either. `exact` is true when the set has the same pairs as the plan. */
export interface MarginPick {
  readonly set: MarginSet;
  readonly shared: number;
  readonly overlap: number;
  readonly exact: boolean;
}

/**
 * This function gives the set of the corpus with the same pairs, or else the set with the largest overlap. Equal overlaps take the later run. With no set of the corpus, it gives undefined.
 * The overlap counts the pairs of either list. Thus a small plan does not take a large set only because that set holds all its pairs.
 */
export function pickMarginSet(sets: readonly MarginSet[], corpus: string, pairs: readonly string[]): MarginPick | undefined {
  const id = pairSetId(corpus, pairs);
  const wanted = new Set(pairs);
  let best: MarginPick | undefined;
  for (const set of sets) {
    if (set.corpus !== corpus) continue;
    const shared = set.pairs.filter((pair) => wanted.has(pair)).length;
    const pick = { set, shared, overlap: shared / (set.pairs.length + wanted.size - shared), exact: set.id === id };
    if (pick.exact) return pick;
    if (best === undefined || pick.overlap > best.overlap || (pick.overlap === best.overlap && set.run > best.set.run)) best = pick;
  }
  return best;
}

/** This function gives the sentence of the held-out error of a set, for example "Its mean |log(real / planned)| on a held-out seed is 0.21-0.30." */
function heldOutSentence(set: MarginSet): string {
  const values = Object.values(set.heldOut).map((e) => e.meanAbsLog);
  if (values.length === 0) return "Its error on a held-out seed is not measured.";
  return `Its mean |log(real / planned)| on a held-out seed is ${Math.min(...values).toFixed(2)}-${Math.max(...values).toFixed(2)}.`;
}

/**
 * This function gives the sentences about the engines of a set and of this run, when their versions differ. Else it gives undefined.
 * A slow new engine then shows as a cause of a long shard before the run.
 */
export function engineMismatch(set: MarginSet, engines: Readonly<Record<string, string>>): string | undefined {
  const names = Object.keys(set.engines ?? {}).filter((name) => Object.hasOwn(engines, name) && engines[name] !== set.engines![name]).sort();
  if (names.length === 0) return undefined;
  const list = (versions: Readonly<Record<string, string>>): string => names.map((name) => `${name} ${versions[name]}`).join(", ");
  return `The set was fit on ${list(set.engines!)}. This run has ${list(engines)}.`;
}

/**
 * This function gives the lines of the plan about its margins. A plan with no set of its own pairs says which set it uses, and the error of that set on its own pairs.
 * `engines` are the versions of the engines of this run. The lines name each engine with another version in the set.
 */
export function marginNote(pick: MarginPick | undefined, pairs: readonly string[], fallback: string, engines: Readonly<Record<string, string>> = {}): string {
  const count = new Set(pairs).size;
  if (pick === undefined) return `No margin set has the corpus of this plan. The estimate uses the margins of ${fallback}. Their error on these pairs is not measured.`;
  const { set } = pick;
  const mismatch = engineMismatch(set, engines);
  const end = mismatch === undefined ? heldOutSentence(set) : `${heldOutSentence(set)} ${mismatch}`;
  if (pick.exact) return `The margins come from pair set ${set.id} of run ${set.run}, with the ${count} pairs of this plan. ${end}`;
  return `No margin set has the ${count} pairs of this plan. The estimate uses another pair set: ${set.id} of run ${set.run}, with ${set.pairs.length} pairs, and ${pick.shared} of them are in this plan. ${end}`;
}

/**
 * This function reads the text of `data/margin-sets.json` and examines each set. A set whose id is not the key of its pairs is an error.
 * A set with no `specs` takes the margins of `fallback`. The set of the run of `cost-margins.json` has this form, so the margins have one home.
 */
export function parseMarginSets(text: string, fallback: SpecMargins): MarginSet[] {
  const raw = JSON.parse(text) as { sets?: (Omit<MarginSet, "specs" | "default" | "heldOut"> & Partial<MarginSet>)[] };
  const sets = (raw.sets ?? []).map((set): MarginSet => ({ ...set, specs: set.specs ?? fallback.specs, default: set.default ?? fallback.default, heldOut: set.heldOut ?? {} }));
  for (const set of sets) {
    if (set.id !== pairSetId(set.corpus, set.pairs)) throw new RangeError(`The margin set ${set.id} does not have the key of its pairs (${pairSetId(set.corpus, set.pairs)}).`);
    for (const [spec, margin] of Object.entries({ ...set.specs, default: set.default })) {
      if (!(Number.isFinite(margin) && margin > 0)) throw new RangeError(`The margin ${spec} of the set ${set.id} is a finite number above 0, not ${margin}.`);
    }
  }
  return sets;
}

/** The margin sets of the plan, from `data/margin-sets.json`. The command `bench.mjs margins` writes a set from the records of a run. */
export const MARGIN_SETS: readonly MarginSet[] = parseMarginSets(readFileSync(new URL("../data/margin-sets.json", import.meta.url), "utf8"), COST_MODEL);
