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
  /** The role of the measure in the joint selector. */
  readonly role?: "guard" | "change-guard" | "diagnostic" | "time";
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

/** The specs of the joint measures, in the order of `docs/JOINT-MEASURES.md`. */
export const JOINT_MEASURES: readonly MeasureSpec<JointMeasureId>[] = Object.freeze([
  { id: "joint.fill", unit: "0 to 1", direction: "higher", min: 0, max: 1, floor: 1, role: "guard" },
  { id: "joint.aspectError", unit: "natural log", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.01, role: "guard" },
  { id: "joint.spill", unit: "0 to 1", direction: "lower", min: 0, max: 1, floor: 0, tol: 0.001, role: "guard" },
  { id: "joint.straight.crossings", unit: "count", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0, role: "guard" },
  { id: "joint.straight.length", unit: "S for each edge", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.01, role: "guard" },
  { id: "joint.stability.mean", unit: "W", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.005, role: "change-guard" },
  { id: "joint.stability.moved", unit: "0 to 1", direction: "lower", min: 0, max: 1, floor: 0, tol: 0.02, role: "change-guard" },
  { id: "joint.proxy.rank", unit: "-1 to 1", direction: "higher", min: -1, max: 1, role: "diagnostic" },
  { id: "joint.ms", unit: "milliseconds", direction: "lower", min: 0, max: Infinity, role: "time" },
] as const);

/** The threshold of `joint.stability.moved`, in widths `W` of the base. */
export const JOINT_MOVED_MIN = 0.01;
