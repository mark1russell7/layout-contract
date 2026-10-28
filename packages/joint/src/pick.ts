// The pick levels of one record on one input (`docs/JOINT-BENCH.md`, "The cells of highways"). The analysis and the iteration pairs of L11 use them.
import { compareMeasure, JOINT_MEASURES, type LayoutRecord, type SelectLevel } from "@mark1russell7/layout-contract";

/** The spec of `pack.overflow.excessArea` in the pick rule and in the pack rule. */
export const EXCESS_SPEC: SelectLevel["spec"] = Object.freeze({ direction: "lower", minEffect: 0.005 });

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
  { id: "pack.overflow.excessArea", spec: EXCESS_SPEC },
  { id: "joint.fill", spec: jointSpec("joint.fill") },
  { id: "joint.spill", spec: jointSpec("joint.spill") },
  { id: "joint.straight.crossings", spec: jointSpec("joint.straight.crossings") },
] as SelectLevel[]);

/** The headline cell of the predictions: the rule `all` with the cap 1.25, as in the result of the first run. */
export const HEADLINE: { readonly rule: "all"; readonly cap: number } = Object.freeze({ rule: "all", cap: 1.25 });

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
export function pickValues(record: LayoutRecord, rule: "collection" | "all", cap: number): Record<string, number> {
  const m = record.measures;
  return {
    hard: hardOf(record, rule, cap),
    "pack.overflow.excessArea": m["pack.overflow.excessArea"] ?? 0,
    "joint.fill": m["joint.fill"] ?? 0,
    "joint.spill": m["joint.spill"] ?? 0,
    "joint.straight.crossings": m["joint.straight.crossings"] ?? 0,
  };
}

/** This function compares two value sets by the levels in order: the first level that is not a tie decides. */
export function lexicographic(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>, levels: readonly SelectLevel[]): "better" | "worse" | "tie" {
  for (const level of levels) {
    const v = compareMeasure(a[level.id]!, b[level.id]!, level.spec);
    if (v !== "tie") return v;
  }
  return "tie";
}

/** This function compares two records of one input by the pick levels of the headline cell. The value is `better` when `a` wins. */
export function compareRecords(a: LayoutRecord, b: LayoutRecord, rule: "collection" | "all" = HEADLINE.rule, cap: number = HEADLINE.cap): "better" | "worse" | "tie" {
  return lexicographic(pickValues(a, rule, cap), pickValues(b, rule, cap), PICK_LEVELS);
}
