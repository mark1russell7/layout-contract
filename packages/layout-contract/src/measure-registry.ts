import { JOINT_MEASURES, type JointMeasureId, type MeasureSpec } from "./measures.ts";

/**
 * The noise of a measure: the cause of a change of its value when the layout does not change.
 *
 * - `exact`: the value is a function of the layout. Two reads of one layout give the same value.
 * - `sampled`: the value is an estimate from a seeded sample. Another seed gives another value.
 * - `timed`: the value is a time of the machine. Each read gives another value.
 */
export type NoiseKind = "exact" | "sampled" | "timed";

/** The ids of the noise kinds, in the order of `NoiseKind`. */
export const NOISE_KINDS: readonly NoiseKind[] = /* @__PURE__ */ Object.freeze(["exact", "sampled", "timed"] as const);

/**
 * The rule that maps a value of a measure to a loss from 0 to 1. The loss 0 is the best value. `docs/MEASURE-REGISTRY.md` gives the formulas.
 *
 * - `range`: the share of the range `min` to `max`. Only a measure with a finite `max` has this rule.
 * - `scale`: `d / (d + half)` for the distance `d` from `min`. The loss is 0.5 at `min + half`. A measure with no upper limit uses it.
 * - `none`: no agreed scale. An objective compares two values with `compareMeasure`, or ranks the values of a set. The reason tells why the measure has no scale.
 *
 * The rule `range` needs a finite `min` and `max`. The rule `scale` needs a finite `min`. A measure with no finite range gets the rule `none`, not a guess.
 */
export type MeasureNormalize =
  | { readonly kind: "range" }
  | { readonly kind: "scale"; readonly half: number; readonly reason: string }
  | { readonly kind: "none"; readonly reason: string };

/**
 * The one unit word of a value from 0 to 1: a share, or a flag of 0 or 1 that a record averages.
 * `checkRegistry` refuses a unit text that names a range, for example `0 to 1`, `0 or 1` or `-1 to 1`. The range goes in `min` and `max`.
 */
export const SHARE_UNIT = "share";

/** The unit word of a measure with no other unit and a range that is not 0 to 1. An example is a correlation from -1 to 1. */
export const NO_UNIT = "no unit";

/** A unit text that names a range, for example `0 to 1` or `-0.5 to 1`. */
const RANGE_UNIT = /^-?\d+(?:\.\d+)? (?:to|or) -?\d+(?:\.\d+)?$/;
/** The other words of a share. */
const SHARE_WORDS: ReadonlySet<string> = /* @__PURE__ */ new Set(["boolean", "fraction", "proportion"]);

/** This function gives the fault of a unit text, or `undefined` for a good unit. */
export function unitFault(spec: Pick<MeasureSpec, "unit" | "min" | "max">): string | undefined {
  const u = spec.unit;
  if (typeof u !== "string" || u.length === 0) return "the unit is empty";
  if (RANGE_UNIT.test(u)) return `the unit ${JSON.stringify(u)} names a range: use ${JSON.stringify(SHARE_UNIT)} for the range 0 to 1, else ${JSON.stringify(NO_UNIT)}, with the range in min and max`;
  if (SHARE_WORDS.has(u)) return `the unit ${JSON.stringify(u)} is a share: use ${JSON.stringify(SHARE_UNIT)}`;
  if (u === SHARE_UNIT && !(spec.min === 0 && spec.max === 1)) return `the unit ${JSON.stringify(SHARE_UNIT)} needs the range 0 to 1`;
  return undefined;
}

/**
 * The cost of one read of a measure, as an order of growth. The text is a sum of terms, for example `n + e^2` or `e log e`.
 * The variables are `n` (the boxes), `e` (the edges) and `p` (the points of the routes). The value `1` is a constant cost.
 */
export type CostOrder = string;

/**
 * The pattern of a `CostOrder`: terms of `1`, `n`, `e` or `p`, each with an optional `^2`, `^3` or `log`, joined by ` + `. The pattern is a
 * literal, because a bundler keeps a top-level `new RegExp` of a template, also when no code uses it.
 */
const COST_ORDER = /^(?:1|[nep](?:\^[23])?(?: log [nep])?)(?: \+ (?:1|[nep](?:\^[23])?(?: log [nep])?))*$/;

/**
 * One entry of the measure registry: the spec of the measure, its source package, its noise, its normalization and its cost.
 * The registry extends `MeasureSpec`. Thus a spec of an engine becomes an entry with `measureEntry`.
 */
export interface MeasureEntry<Id extends string = string> extends MeasureSpec<Id> {
  /** The npm name of the package that computes the measure. */
  readonly source: string;
  readonly noise: NoiseKind;
  readonly normalize: MeasureNormalize;
  /** The cost of one read of the measure. Without it, the cost is not known. */
  readonly cost?: CostOrder;
  /**
   * The reason that no code computes the measure yet. A planned measure has a spec and no value.
   * An objective refuses a planned measure, and `normalizeMeasure` throws an error for it.
   */
  readonly planned?: string;
}

/** The facts that `measureEntry` adds to a spec. Without `normalize`, the rule is `range` for a finite range and `none` for the other ranges. */
export interface EntryFacts {
  readonly source: string;
  readonly noise?: NoiseKind;
  readonly normalize?: MeasureNormalize;
  readonly cost?: CostOrder;
  readonly planned?: string;
}

/** The reason of the default rule `none`. */
export const NO_FINITE_RANGE = "The range is not finite, and the registry has no agreed scale for the measure.";

/** This function gives the default normalization of a spec: `range` when `min` and `max` are finite, else `none` with the reason `NO_FINITE_RANGE`. */
export function defaultNormalize(spec: Pick<MeasureSpec, "min" | "max">): MeasureNormalize {
  return Number.isFinite(spec.min) && Number.isFinite(spec.max) ? { kind: "range" } : { kind: "none", reason: NO_FINITE_RANGE };
}

/** This function makes a registry entry from a spec and the added facts. The noise is `exact` by default. */
export function measureEntry<Id extends string>(spec: MeasureSpec<Id>, facts: EntryFacts): MeasureEntry<Id> {
  return Object.freeze({
    ...spec,
    source: facts.source,
    noise: facts.noise ?? "exact",
    normalize: facts.normalize ?? defaultNormalize(spec),
    ...(facts.cost === undefined ? {} : { cost: facts.cost }),
    ...(facts.planned === undefined ? {} : { planned: facts.planned }),
  });
}

/**
 * This function gives the loss of the value `value` of a measure: a number from 0 to 1, where 0 is the best value.
 * A value outside the range of the spec gives a `RangeError`. A value `NaN` also gives a `RangeError`.
 * The rule `none` gives `undefined`: the measure has no agreed scale.
 * A planned measure gives an `Error`: no code computes it, so it has no value.
 */
export function normalizeMeasure(value: number, entry: Pick<MeasureEntry, "id" | "direction" | "min" | "max" | "normalize" | "planned">): number | undefined {
  if (entry.planned !== undefined) throw new Error(`normalizeMeasure: ${entry.id} is planned, and no code computes it: ${entry.planned}`);
  if (Number.isNaN(value) || value < entry.min || value > entry.max) throw new RangeError(`normalizeMeasure: the value ${value} of ${entry.id} is not in [${entry.min}, ${entry.max}].`);
  const rule = entry.normalize;
  if (rule.kind === "none") return undefined;
  let worse: number;
  if (rule.kind === "range") {
    const t = entry.max === entry.min ? 0 : (value - entry.min) / (entry.max - entry.min);
    worse = entry.direction === "lower" ? t : 1 - t;
  } else {
    const d = value - entry.min;
    if (d === Infinity) worse = entry.direction === "lower" ? 1 : 0;
    else worse = entry.direction === "lower" ? d / (d + rule.half) : rule.half / (d + rule.half);
  }
  return worse === 0 ? 0 : worse;
}

/**
 * This function gives the faults of a list of registry entries, as plain text. An empty list tells that the entries are good.
 * It examines the unique ids, the unit, the range, the floor, the noise, the normalization, the cost, the source and the planned reason.
 */
export function checkRegistry(entries: readonly MeasureEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const at = `measure ${JSON.stringify(e.id)}`;
    if (typeof e.id !== "string" || e.id.length === 0) out.push(`${at}: the id is empty`);
    if (seen.has(e.id)) out.push(`${at}: the id is not unique`);
    seen.add(e.id);
    const unit = unitFault(e);
    if (unit !== undefined) out.push(`${at}: ${unit}`);
    if (e.direction !== "lower" && e.direction !== "higher") out.push(`${at}: the direction is not lower or higher`);
    if (typeof e.min !== "number" || Number.isNaN(e.min) || e.min === Infinity) out.push(`${at}: min is not a number below Infinity`);
    if (!(e.max > e.min)) out.push(`${at}: max is not above min`);
    if (e.floor !== undefined && !(e.floor >= e.min && e.floor <= e.max)) out.push(`${at}: the floor is not in the range`);
    if (typeof e.source !== "string" || e.source.length === 0) out.push(`${at}: the source is empty`);
    if (!NOISE_KINDS.includes(e.noise)) out.push(`${at}: the noise is not one of ${NOISE_KINDS.join(", ")}`);
    if (e.cost !== undefined && !COST_ORDER.test(e.cost)) out.push(`${at}: the cost ${JSON.stringify(e.cost)} is not an order of growth`);
    if (e.planned !== undefined && !(typeof e.planned === "string" && e.planned.length > 0)) out.push(`${at}: the planned reason is empty`);
    if (e.planned !== undefined && e.cost !== undefined) out.push(`${at}: a planned measure has no code, so it has no cost`);
    const n = e.normalize;
    if (n === undefined || (n.kind !== "range" && n.kind !== "scale" && n.kind !== "none")) out.push(`${at}: the normalization is not range, scale or none`);
    else if (n.kind === "range" && !(Number.isFinite(e.min) && Number.isFinite(e.max))) out.push(`${at}: the normalization range needs a finite min and max`);
    else if (n.kind === "scale" && !Number.isFinite(e.min)) out.push(`${at}: the normalization scale needs a finite min`);
    else if (n.kind === "scale" && !(Number.isFinite(n.half) && n.half > 0)) out.push(`${at}: the half of the normalization scale is not above 0`);
    else if (n.kind === "scale" && !(typeof n.reason === "string" && n.reason.length > 0)) out.push(`${at}: the normalization scale has no reason`);
    else if (n.kind === "none" && !(typeof n.reason === "string" && n.reason.length > 0)) out.push(`${at}: the normalization none has no reason`);
  }
  return out;
}

/** The package of the joint bench. It is private, so the joint measures have no npm version. */
export const JOINT_SOURCE = "@layout-contract/joint";

/** The planned reason of the two joint stability measures. */
const NO_CHANGE_PAIRS = "The joint bench has no pairs of a base input and a changed input, so no code computes the measure.";

const JOINT_FACTS: Readonly<Record<JointMeasureId, Omit<EntryFacts, "source">>> = {
  "joint.fill": { cost: "n + p" },
  "joint.aspectError": { cost: "n + p", normalize: { kind: "scale", half: Math.LN2, reason: "An aspect at a factor of 2 from the target has the loss 0.5." } },
  "joint.spill": { cost: "n + p" },
  "joint.straight.crossings": { cost: "n + e^2", normalize: { kind: "none", reason: "A count of crossings has no agreed scale." } },
  "joint.straight.length": { cost: "n + e", normalize: { kind: "scale", half: 1, reason: "An edge as long as the side S of the square of the box area has the loss 0.5." } },
  "joint.stability.mean": { planned: NO_CHANGE_PAIRS },
  "joint.stability.moved": { planned: NO_CHANGE_PAIRS },
  "joint.proxy.rank": { cost: "n + p + e log e" },
  "joint.route.length": { cost: "p", normalize: { kind: "none", reason: "A length in layout units has no agreed scale." } },
  "joint.ms": { noise: "timed", normalize: { kind: "none", reason: "A time of the machine has no agreed scale, and each read gives another value." } },
};

/**
 * The registry entries of the joint measures, in the order of `JOINT_MEASURES`. `docs/MEASURE-REGISTRY.md` gives the reason of each cost and scale.
 * The engines keep the specs of their own measures. `docs/measure-survey.json` lists them, and an engine adopts the registry with `measureEntry`.
 */
export const MEASURE_REGISTRY: readonly MeasureEntry<JointMeasureId>[] = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ JOINT_MEASURES.map((spec) => measureEntry(spec, { source: JOINT_SOURCE, ...JOINT_FACTS[spec.id] })),
);
