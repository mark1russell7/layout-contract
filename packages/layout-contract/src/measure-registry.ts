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
 * - `none`: no agreed scale. An objective compares two values with `compareMeasure`, or ranks the values of a set.
 */
export type MeasureNormalize = { readonly kind: "range" } | { readonly kind: "scale"; readonly half: number; readonly reason: string } | { readonly kind: "none" };

/**
 * The cost of one read of a measure, as an order of growth. The text is a sum of terms, for example `n + e^2` or `e log e`.
 * The variables are `n` (the boxes), `e` (the edges) and `p` (the points of the routes). The value `1` is a constant cost.
 */
export type CostOrder = string;

/** The pattern of a `CostOrder`: terms of `1`, `n`, `e` or `p`, each with an optional `^2`, `^3` or `log`, joined by ` + `. */
const COST_TERM = "(?:1|[nep](?:\\^[23])?(?: log [nep])?)";
const COST_ORDER = /* @__PURE__ */ new RegExp(`^${COST_TERM}(?: \\+ ${COST_TERM})*$`);

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
}

/** The facts that `measureEntry` adds to a spec. Without `normalize`, the rule is `range` for a finite range and `none` for the other ranges. */
export interface EntryFacts {
  readonly source: string;
  readonly noise?: NoiseKind;
  readonly normalize?: MeasureNormalize;
  readonly cost?: CostOrder;
}

/** This function gives the default normalization of a spec: `range` when `min` and `max` are finite, else `none`. */
export function defaultNormalize(spec: Pick<MeasureSpec, "min" | "max">): MeasureNormalize {
  return Number.isFinite(spec.min) && Number.isFinite(spec.max) ? { kind: "range" } : { kind: "none" };
}

/** This function makes a registry entry from a spec and the added facts. The noise is `exact` by default. */
export function measureEntry<Id extends string>(spec: MeasureSpec<Id>, facts: EntryFacts): MeasureEntry<Id> {
  return Object.freeze({
    ...spec,
    source: facts.source,
    noise: facts.noise ?? "exact",
    normalize: facts.normalize ?? defaultNormalize(spec),
    ...(facts.cost === undefined ? {} : { cost: facts.cost }),
  });
}

/**
 * This function gives the loss of the value `value` of a measure: a number from 0 to 1, where 0 is the best value.
 * A value outside the range of the spec gives a `RangeError`. A value `NaN` also gives a `RangeError`.
 * The rule `none` gives `undefined`: the measure has no agreed scale.
 */
export function normalizeMeasure(value: number, entry: Pick<MeasureEntry, "id" | "direction" | "min" | "max" | "normalize">): number | undefined {
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
 * It examines the unique ids, the range, the floor, the noise, the normalization, the cost and the source.
 */
export function checkRegistry(entries: readonly MeasureEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const at = `measure ${JSON.stringify(e.id)}`;
    if (typeof e.id !== "string" || e.id.length === 0) out.push(`${at}: the id is empty`);
    if (seen.has(e.id)) out.push(`${at}: the id is not unique`);
    seen.add(e.id);
    if (typeof e.unit !== "string" || e.unit.length === 0) out.push(`${at}: the unit is empty`);
    if (e.direction !== "lower" && e.direction !== "higher") out.push(`${at}: the direction is not lower or higher`);
    if (!Number.isFinite(e.min)) out.push(`${at}: min is not a finite number`);
    if (!(e.max > e.min)) out.push(`${at}: max is not above min`);
    if (e.floor !== undefined && !(e.floor >= e.min && e.floor <= e.max)) out.push(`${at}: the floor is not in the range`);
    if (typeof e.source !== "string" || e.source.length === 0) out.push(`${at}: the source is empty`);
    if (!NOISE_KINDS.includes(e.noise)) out.push(`${at}: the noise is not one of ${NOISE_KINDS.join(", ")}`);
    if (e.cost !== undefined && !COST_ORDER.test(e.cost)) out.push(`${at}: the cost ${JSON.stringify(e.cost)} is not an order of growth`);
    const n = e.normalize;
    if (n === undefined || (n.kind !== "range" && n.kind !== "scale" && n.kind !== "none")) out.push(`${at}: the normalization is not range, scale or none`);
    else if (n.kind === "range" && !Number.isFinite(e.max)) out.push(`${at}: the normalization range needs a finite max`);
    else if (n.kind === "scale" && !(Number.isFinite(n.half) && n.half > 0)) out.push(`${at}: the half of the normalization scale is not above 0`);
    else if (n.kind === "scale" && !(typeof n.reason === "string" && n.reason.length > 0)) out.push(`${at}: the normalization scale has no reason`);
  }
  return out;
}

/** The package of the joint bench. It is private, so the joint measures have no npm version. */
export const JOINT_SOURCE = "@layout-contract/joint";

const JOINT_FACTS: Readonly<Record<JointMeasureId, Omit<EntryFacts, "source">>> = {
  "joint.fill": { cost: "n + p" },
  "joint.aspectError": { cost: "n + p", normalize: { kind: "scale", half: Math.LN2, reason: "An aspect at a factor of 2 from the target has the loss 0.5." } },
  "joint.spill": { cost: "n + p" },
  "joint.straight.crossings": { cost: "n + e^2" },
  "joint.straight.length": { cost: "n + e", normalize: { kind: "scale", half: 1, reason: "An edge as long as the side S of the square of the box area has the loss 0.5." } },
  // The joint bench does not compute the two stability measures yet, so their cost is not known.
  "joint.stability.mean": {},
  "joint.stability.moved": {},
  "joint.proxy.rank": { cost: "n + p + e log e" },
  "joint.route.length": { cost: "p" },
  "joint.ms": { noise: "timed" },
};

/**
 * The registry entries of the joint measures, in the order of `JOINT_MEASURES`. `docs/MEASURE-REGISTRY.md` gives the reason of each cost and scale.
 * The engines keep the specs of their own measures. `docs/measure-survey.json` lists them, and an engine adopts the registry with `measureEntry`.
 */
export const MEASURE_REGISTRY: readonly MeasureEntry<JointMeasureId>[] = /* @__PURE__ */ Object.freeze(
  JOINT_MEASURES.map((spec) => measureEntry(spec, { source: JOINT_SOURCE, ...JOINT_FACTS[spec.id] })),
);
