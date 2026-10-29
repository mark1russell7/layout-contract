// The shape kinds of the items (`docs/SHAPES.md`): the declared set, the kind of a box and the check of the measures and rules on a run.
import type { ClaimBreak } from "./corpus.ts";
import { regionArea, type Region } from "./geometry.ts";
import type { LayoutBox, LayoutInput } from "./input.ts";

/**
 * The kind of the shape of an item. A box without `shape` and without `shapeKind` is a `rect`.
 * The set is open: a later version can add a kind. A reader treats an unknown kind as a kind that it does not support.
 */
export type ShapeKind = "rect" | "polygon" | "circle" | "free";

/** The geometry of a shape kind that this package gives. A `false` value tells that the kind declares the operation, but this package does not supply it. */
export interface ShapeGeometry {
  /** The bounding box: `boundsOf` and `placedRect`. */
  readonly bounds: boolean;
  /** The area of the shape: `regionArea` and `boxArea`. */
  readonly area: boolean;
  /** The test that the shape is inside a region: `rectInRegion` for a `rect`. */
  readonly contains: boolean;
  /** The test that two shapes overlap: `overlapOf` for two `rect` shapes. */
  readonly overlap: boolean;
}

/** The facts of one shape kind: its fields, the kinds of `Region` that give it, and its geometry. */
export interface ShapeKindSpec {
  readonly id: ShapeKind;
  /** The fields of the outline, relative to the top-left corner of the box. A name with `?` is optional. */
  readonly fields: readonly string[];
  /** The kinds of `LayoutBox.shape` that agree with this kind. */
  readonly regions: readonly Region["kind"][];
  readonly geometry: ShapeGeometry;
}

/**
 * The declared shape kinds, in their order. Only `rect` has all of its geometry.
 * `polygon` and `circle` have their bounding box and their exact area. `free` has its bounding box only.
 */
export const SHAPE_KINDS: readonly ShapeKindSpec[] = Object.freeze([
  { id: "rect", fields: ["w", "h"], regions: ["rect"], geometry: { bounds: true, area: true, contains: true, overlap: true } },
  { id: "polygon", fields: ["points", "holes?"], regions: ["polygon"], geometry: { bounds: true, area: true, contains: false, overlap: false } },
  { id: "circle", fields: ["cx", "cy", "r"], regions: ["circle"], geometry: { bounds: true, area: true, contains: false, overlap: false } },
  { id: "free", fields: ["w", "h", "shape?"], regions: ["rect", "polygon", "circle", "ellipse"], geometry: { bounds: true, area: false, contains: false, overlap: false } },
] as const);

/** The ids of `SHAPE_KINDS`, in their order. */
export const SHAPE_KIND_IDS: readonly ShapeKind[] = Object.freeze(SHAPE_KINDS.map((k) => k.id));

/** The shape kinds of a measure or a rule without `shapes`. The contract measured only rectangles before L46. */
export const DEFAULT_SHAPES: readonly ShapeKind[] = Object.freeze(["rect"] as const);

/** A measure or a rule, with the shape kinds that it supports. Without `shapes`, it supports `DEFAULT_SHAPES`. */
export interface ShapeSupport<Id extends string = string> {
  readonly id: Id;
  /** The kinds with an exact count or value. */
  readonly shapes?: readonly ShapeKind[];
  /**
   * The kinds with a safe count: the rule can count a break that is not real, but it does not miss a real break.
   * Thus a safe count of 0 tells that the rule has no break. A kind is in `shapes` or in `safe`, not in the two lists.
   */
  readonly safe?: readonly ShapeKind[];
  /**
   * The kinds where the value of a measure is a bound of the true value, not the exact value. `ShapeBound` tells the side.
   * A kind is in one list only: `shapes`, `safe` or `bound.shapes`. `docs/SHAPES.md` tells what a bound value proves.
   */
  readonly bound?: ShapeBound;
}

/**
 * The kinds where a measure gives a bound of the true value, and the side of the bound.
 * With `upper`, the value is the true value or more. With `lower`, the value is the true value or less.
 *
 * @remarks
 * The side and the `direction` of the measure tell what a bound value `v` proves about a threshold `t`.
 * A bound is optimistic on the better side of the true value, and pessimistic on the worse side.
 *
 * | `direction` | `side` | The bound | The proof | No proof |
 * |---|---|---|---|---|
 * | `higher` | `upper` | optimistic | `v < t`: the true value is less than `t`. | `v >= t` |
 * | `higher` | `lower` | pessimistic | `v >= t`: the true value is `t` or more. | `v < t` |
 * | `lower` | `upper` | pessimistic | `v <= t`: the true value is `t` or less. | `v > t` |
 * | `lower` | `lower` | optimistic | `v > t`: the true value is more than `t`. | `v <= t` |
 *
 * For a floor or a guard, a pessimistic bound proves a pass, and an optimistic bound proves a fail.
 * `compareMeasure` on two bound values proves nothing. A tie with a bound value proves nothing.
 * Against an exact baseline, an optimistic candidate proves only `worse`, and a pessimistic candidate proves only `better`.
 */
export interface ShapeBound {
  readonly shapes: readonly ShapeKind[];
  readonly side: "upper" | "lower";
}

/** The level of a rule on a shape kind: an exact count, a safe count (an upper bound), or no support. */
export type RuleLevel = "exact" | "safe" | "none";

/** This function gives the level of a rule on a shape kind. A kind of `shapesOf` is `exact`, a kind of `safe` is `safe`, and another kind is `none`. It does not read `bound`. */
export function ruleLevel(rule: Pick<ShapeSupport, "shapes" | "safe">, kind: ShapeKind): RuleLevel {
  if (shapesOf(rule).includes(kind)) return "exact";
  return rule.safe?.includes(kind) === true ? "safe" : "none";
}

/** The level of a measure or a rule on a shape kind. The level `bound` is a value on one side of the true value (`ShapeBound`). */
export type ShapeLevel = RuleLevel | "bound";

/**
 * This function gives the level of a measure or a rule on a shape kind. It joins the lists `shapes`, `safe` and `bound.shapes`.
 * A kind of `shapesOf` is `exact`, a kind of `safe` is `safe`, a kind of `bound.shapes` is `bound`, and another kind is `none`.
 */
export function shapeLevel(use: Pick<ShapeSupport, "shapes" | "safe" | "bound">, kind: ShapeKind): ShapeLevel {
  const level = ruleLevel(use, kind);
  if (level !== "none") return level;
  return use.bound?.shapes.includes(kind) === true ? "bound" : "none";
}

/**
 * This function gives the problems of a list of measures and rules. An empty list tells that the list is good.
 * It refuses an unknown kind, a kind two times in one list, and a kind in more than one of `shapesOf`, `safe` and `bound.shapes`.
 * It also refuses a `bound` without a list of kinds, and a `side` that is not `upper` or `lower`.
 */
export function shapeSupportProblems(uses: readonly ShapeSupport[]): string[] {
  const out: string[] = [];
  for (const use of uses) {
    const bound: unknown = use.bound;
    const isBound = typeof bound === "object" && bound !== null && !Array.isArray(bound);
    if (bound !== undefined && !isBound) out.push(`${use.id}: the bound value is not an object with shapes and a side`);
    const boundShapes = isBound ? (bound as { readonly shapes?: unknown }).shapes : undefined;
    for (const [name, list] of [["shapes", use.shapes], ["safe", use.safe], ["bound", boundShapes]] as const) {
      if (list === undefined && (name !== "bound" || !isBound)) continue;
      if (!Array.isArray(list)) {
        out.push(`${use.id}: the ${name === "bound" ? "bound shapes" : name} value is not a list of shape kinds`);
        continue;
      }
      list.forEach((k: unknown, i) => {
        if (!isShapeKind(k)) out.push(`${use.id}: the ${name} kind ${String(k)} is not a declared kind`);
        else if (list.indexOf(k) !== i) out.push(`${use.id}: the ${name} list has the kind ${k} two times`);
      });
    }
    const exact: readonly unknown[] = use.shapes === undefined ? DEFAULT_SHAPES : Array.isArray(use.shapes) ? use.shapes : [];
    if (Array.isArray(use.safe)) for (const k of new Set<unknown>(use.safe)) if (exact.includes(k)) out.push(`${use.id}: the kind ${String(k)} is in shapes and in safe`);
    if (!isBound) continue;
    const side: unknown = (bound as { readonly side?: unknown }).side;
    if (side !== "upper" && side !== "lower") out.push(`${use.id}: the bound side ${String(side)} is not upper or lower`);
    if (!Array.isArray(boundShapes)) continue;
    const safe: readonly unknown[] = Array.isArray(use.safe) ? use.safe : [];
    for (const k of new Set<unknown>(boundShapes)) {
      if (exact.includes(k)) out.push(`${use.id}: the kind ${String(k)} is in shapes and in bound`);
      if (safe.includes(k)) out.push(`${use.id}: the kind ${String(k)} is in safe and in bound`);
    }
  }
  return out;
}

const REGION_KIND: Readonly<Record<Region["kind"], ShapeKind>> = { rect: "rect", polygon: "polygon", circle: "circle", ellipse: "free" };

/** This function tells if a value is a declared shape kind. */
export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === "string" && (SHAPE_KIND_IDS as readonly string[]).includes(value);
}

/**
 * This function gives the shape kind of a box. A box with `shapeKind` has that kind.
 * Without it, the kind comes from `shape`: no shape is a `rect`, and an ellipse is `free`.
 */
export function shapeKindOf(box: LayoutBox): ShapeKind {
  if (box.shapeKind !== undefined) return box.shapeKind;
  return box.shape === undefined ? "rect" : REGION_KIND[box.shape.kind];
}

/**
 * This function gives the exact area of a box, or `undefined` when the contract knows only its bounding box.
 * A box with `shape` gives `regionArea` of the shape. A `rect` box without `shape` gives `w` by `h`.
 * A box of the kind `free` gives `undefined`, also with a shape. Thus a box with an ellipse shape gives `undefined`, because `shapeKindOf` makes an ellipse `free`.
 * A box of another kind without `shape` is a bad input, and gives `undefined`.
 */
export function boxArea(box: LayoutBox): number | undefined {
  const kind = shapeKindOf(box);
  if (kind === "free") return undefined;
  if (box.shape !== undefined) return regionArea(box.shape);
  return kind === "rect" ? box.w * box.h : undefined;
}

/** This function gives the shape kinds of the boxes of an input, in the order of `SHAPE_KINDS`. An input without boxes gives an empty list. */
export function shapeKindsOf(input: Pick<LayoutInput, "boxes">): ShapeKind[] {
  const seen = new Set(input.boxes.map(shapeKindOf));
  return SHAPE_KIND_IDS.filter((k) => seen.has(k));
}

/** This function gives the value of the cell dimension `itemShape` of an input: its one kind, `mixed` for more kinds, or `rect` without boxes. */
export function itemShapeOf(input: Pick<LayoutInput, "boxes">): ShapeKind | "mixed" {
  const kinds = shapeKindsOf(input);
  return kinds.length === 0 ? "rect" : kinds.length === 1 ? kinds[0]! : "mixed";
}

/** This function gives the problem of the shape kind of a box, or `undefined` when `shapeKind` and `shape` agree. */
export function shapeKindProblem(box: LayoutBox): string | undefined {
  const k: unknown = box.shapeKind;
  if (k === undefined) return undefined;
  const spec = SHAPE_KINDS.find((s) => s.id === k);
  if (spec === undefined) return `box ${box.id}: the shape kind ${String(k)} is not a declared kind`;
  if (box.shape === undefined) return k === "rect" || k === "free" ? undefined : `box ${box.id}: the shape kind ${k} has no shape`;
  if (!spec.regions.includes(box.shape.kind)) return `box ${box.id}: the shape kind ${k} does not agree with a shape of the kind ${box.shape.kind}`;
  return undefined;
}

/** This function gives the shape kinds that a measure or a rule supports. */
export function shapesOf(use: Pick<ShapeSupport, "shapes">): readonly ShapeKind[] {
  return use.shapes ?? DEFAULT_SHAPES;
}

/** The options of `checkShapes`. */
export interface ShapeCheck {
  /**
   * The lowest level that `checkShapes` accepts. The default `exact` refuses a kind with only a safe count or a bound value.
   * The value `safe` also accepts a kind of `safe`, as in 0.2.16. Use it only when the run claims that a rule has no break.
   * The value `bound` also accepts a kind of `safe` and a kind of `bound.shapes`. Use it only when the run reads each bound value for the proofs of its side (`docs/SHAPES.md`).
   */
  readonly level?: "exact" | "safe" | "bound";
}

/**
 * This function checks that each measure and each rule of a run supports each shape kind of the input. An empty list tells that the run is good.
 * Each break has the claim `shape`, the id of the input, and the first 5 ids of the boxes of the kind.
 * By default, a kind of `safe` or of `bound.shapes` is a break, because the result is not exact.
 * With the level `safe`, a kind of `safe` is not a break. With the level `bound`, a kind of `safe` and a kind of `bound.shapes` are not a break.
 */
export function checkShapes(input: Pick<LayoutInput, "id" | "boxes">, uses: readonly ShapeSupport[], options: ShapeCheck = {}): ClaimBreak[] {
  const kinds = shapeKindsOf(input);
  const out: ClaimBreak[] = [];
  for (const use of uses) {
    const shapes = shapesOf(use);
    for (const kind of kinds) {
      const level = shapeLevel(use, kind);
      const accepts = level === "exact" || (level === "safe" && (options.level === "safe" || options.level === "bound")) || (level === "bound" && options.level === "bound");
      if (accepts) continue;
      const ids = input.boxes.filter((b) => shapeKindOf(b) === kind).map((b) => b.id);
      const shown = ids.slice(0, 5).join(", ") + (ids.length > 5 ? `, and ${ids.length - 5} more` : "");
      const safe =
        level === "safe" ? `. The count of ${use.id} on ${kind} is only safe` : level === "bound" ? `. The value of ${use.id} is only ${use.bound!.side === "upper" ? "an upper" : "a lower"} bound for ${kind}` : "";
      out.push({
        claim: "shape",
        detail: `${use.id} supports only the shape kinds ${shapes.join(", ") || "(none)"}, but the input ${input.id} has ${kind} boxes: ${shown}${safe}`,
        inputs: [input.id],
      });
    }
  }
  return out;
}
