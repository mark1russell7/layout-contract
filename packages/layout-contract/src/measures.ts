import { SHAPE_KIND_IDS, type ShapeBound, type ShapeKind } from "./shapes.ts";
import { RECORD_EPS, RECORD_SCALE } from "./tolerance.ts";

/** The direction of a measure: the side of the better values. */
export type Direction = "lower" | "higher";

/**
 * The facts of one measure: its unit, its direction and its range.
 * `floor` and `tol` are the parameters of the floor rule of the promotion rule (`docs/PROMOTION.md` of `highways`).
 * Each engine exports the specs of its own measures. This package exports the specs of the `joint.*` measures.
 */
export interface MeasureSpec<Id extends string = string> {
  readonly id: Id;
  readonly unit: string;
  readonly direction: Direction;
  /** The lowest value. */
  readonly min: number;
  /** The highest value. The value `Infinity` tells that the measure has no upper limit. */
  readonly max: number;
  /** The family of the measure in the measure note of its engine. */
  readonly family?: string;
  /** The best value. Without it, the measure has no floor. */
  readonly floor?: number;
  /** The absolute tolerance at the floor. */
  readonly tol?: number;
  /**
   * The smallest change that counts as better or worse. A number is an absolute change. `{ rel }` is a share of the larger of the two values.
   * `docs/JOINT-MEASURES.md` gives the reason of each joint value.
   */
  readonly minEffect?: number | { readonly rel: number };
  /** The role of the measure in the joint selector. */
  readonly role?: "guard" | "change-guard" | "diagnostic" | "time";
  /** The shape kinds of the boxes that the measure supports. Without it, the measure supports only `rect`. `checkShapes` refuses the other kinds. */
  readonly shapes?: readonly ShapeKind[];
  /**
   * The kinds where the value is a bound of the true value, and its side. A kind is in `shapes` or in `bound.shapes`, not in the two lists.
   * `checkShapes` refuses a bound kind by default and with `{ level: "safe" }`. With `{ level: "bound" }`, it accepts it. `docs/SHAPES.md` tells what a bound value proves for each `direction`.
   */
  readonly bound?: ShapeBound;
}

/** The id of a joint measure. `docs/JOINT-MEASURES.md` gives the definitions. */
export type JointMeasureId =
  | "joint.fill"
  | "joint.aspectError"
  | "joint.spill"
  | "joint.straight.crossings"
  | "joint.straight.length"
  | "joint.stability.mean"
  | "joint.stability.moved"
  | "joint.proxy.rank"
  | "joint.ms";

/** The shape kinds of a joint measure that reads only the bounding boxes, the centers and the positions of the boxes. */
const BOUNDS_ONLY = SHAPE_KIND_IDS;
/** The shape kinds of a joint measure that reads the area `w` by `h` of each box. */
const AREA: readonly ShapeKind[] = ["rect"];

/**
 * The specs of the joint measures, in the order of `docs/JOINT-MEASURES.md`.
 * `joint.fill` and `joint.straight.length` read the area of each box, so they support only `rect`. `docs/SHAPES.md` tells the reasons.
 */
export const JOINT_MEASURES: readonly MeasureSpec<JointMeasureId>[] = Object.freeze([
  { id: "joint.fill", minEffect: 0.001, unit: "0 to 1", direction: "higher", min: 0, max: 1, floor: 1, role: "guard", shapes: AREA },
  { id: "joint.aspectError", minEffect: 0.01, unit: "natural log", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.01, role: "guard", shapes: BOUNDS_ONLY },
  { id: "joint.spill", minEffect: 0.001, unit: "0 to 1", direction: "lower", min: 0, max: 1, floor: 0, tol: 0.001, role: "guard", shapes: BOUNDS_ONLY },
  { id: "joint.straight.crossings", minEffect: 0, unit: "count", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0, role: "guard", shapes: BOUNDS_ONLY },
  { id: "joint.straight.length", minEffect: 0.01, unit: "S for each edge", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.01, role: "guard", shapes: AREA },
  { id: "joint.stability.mean", minEffect: 0.005, unit: "W", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.005, role: "change-guard", shapes: BOUNDS_ONLY },
  { id: "joint.stability.moved", minEffect: 0.02, unit: "0 to 1", direction: "lower", min: 0, max: 1, floor: 0, tol: 0.02, role: "change-guard", shapes: BOUNDS_ONLY },
  { id: "joint.proxy.rank", unit: "-1 to 1", direction: "higher", min: -1, max: 1, role: "diagnostic", shapes: BOUNDS_ONLY },
  { id: "joint.ms", unit: "milliseconds", direction: "lower", min: 0, max: Infinity, role: "time", shapes: BOUNDS_ONLY },
] as const);

/** The threshold of `joint.stability.moved`, in widths `W` of the base. */
export const JOINT_MOVED_MIN = 0.01;

/** The result of a compare of a candidate with a baseline on one measure. A tie is not better. */
export type Verdict = "better" | "worse" | "tie";

/**
 * This function gives the smallest change of a measure that counts between the values `a` and `b`.
 * The value is `max(RECORD_EPS, minEffect)`, or `max(RECORD_EPS, rel * max(|a|, |b|))` for a relative `minEffect`.
 * The larger value makes the threshold the same after a swap of `a` and `b`.
 */
export function minEffectOf(spec: Pick<MeasureSpec, "minEffect">, a = 0, b = 0): number {
  const m = spec.minEffect ?? 0;
  const t = typeof m === "number" ? m : m.rel * Math.max(Math.abs(a), Math.abs(b));
  return Math.max(RECORD_EPS, Number.isFinite(t) ? t : 0);
}

/** The slack of the threshold in grid steps. It absorbs only the float noise of the threshold, because the change is a whole number. */
const STEP_NOISE = 1e-6;

/**
 * This function compares the value `candidate` with the value `baseline` of one measure on one input.
 * The compare uses whole grid steps of `RECORD_EPS`. Thus a live value and its rounded record give the same verdict.
 * A change of at most the threshold of `minEffectOf` in grid steps is a tie. A swap of the two values swaps better and worse.
 * Two equal values are a tie, also two infinite values. A value `NaN` is an error.
 */
export function compareMeasure(candidate: number, baseline: number, spec: Pick<MeasureSpec, "direction" | "minEffect">): Verdict {
  if (Number.isNaN(candidate) || Number.isNaN(baseline)) throw new RangeError("compareMeasure: a value is NaN");
  if (candidate === baseline) return "tie";
  const a = Math.round(candidate * RECORD_SCALE);
  const b = Math.round(baseline * RECORD_SCALE);
  let delta: number;
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b)) {
    delta = a - b;
    const m = spec.minEffect ?? 0;
    const t = typeof m === "number" ? m * RECORD_SCALE : m.rel * Math.max(Math.abs(a), Math.abs(b));
    if (Math.abs(delta) <= Math.max(1, Number.isFinite(t) ? t : 0) + STEP_NOISE) return "tie";
  } else {
    delta = candidate - baseline;
    if (!(Math.abs(delta) > minEffectOf(spec, candidate, baseline))) return "tie";
  }
  const better = spec.direction === "lower" ? delta < 0 : delta > 0;
  return better ? "better" : "worse";
}
