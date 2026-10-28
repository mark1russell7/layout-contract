// The shape kinds of the items (`docs/SHAPES.md`): the declared set, the kind of a box and the check of the measures and rules on a run.
import type { ClaimBreak } from "./corpus.ts";
import type { Region } from "./geometry.ts";
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
  /** The area of the shape. */
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

/** The declared shape kinds, in their order. Only `rect` has all of its geometry. The other kinds have their bounding box only. */
export const SHAPE_KINDS: readonly ShapeKindSpec[] = Object.freeze([
  { id: "rect", fields: ["w", "h"], regions: ["rect"], geometry: { bounds: true, area: true, contains: true, overlap: true } },
  { id: "polygon", fields: ["points", "holes?"], regions: ["polygon"], geometry: { bounds: true, area: false, contains: false, overlap: false } },
  { id: "circle", fields: ["cx", "cy", "r"], regions: ["circle"], geometry: { bounds: true, area: false, contains: false, overlap: false } },
  { id: "free", fields: ["w", "h", "shape?"], regions: ["rect", "polygon", "circle", "ellipse"], geometry: { bounds: true, area: false, contains: false, overlap: false } },
] as const);

/** The ids of `SHAPE_KINDS`, in their order. */
export const SHAPE_KIND_IDS: readonly ShapeKind[] = Object.freeze(SHAPE_KINDS.map((k) => k.id));

/** The shape kinds of a measure or a rule without `shapes`. The contract measured only rectangles before L46. */
export const DEFAULT_SHAPES: readonly ShapeKind[] = Object.freeze(["rect"] as const);

/** A measure or a rule, with the shape kinds that it supports. Without `shapes`, it supports `DEFAULT_SHAPES`. */
export interface ShapeSupport<Id extends string = string> {
  readonly id: Id;
  readonly shapes?: readonly ShapeKind[];
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

/**
 * This function checks that each measure and each rule of a run supports each shape kind of the input. An empty list tells that the run is good.
 * Each break has the claim `shape`, the id of the input, and the first 5 ids of the boxes of the kind.
 */
export function checkShapes(input: Pick<LayoutInput, "id" | "boxes">, uses: readonly ShapeSupport[]): ClaimBreak[] {
  const kinds = shapeKindsOf(input);
  const out: ClaimBreak[] = [];
  for (const use of uses) {
    const shapes = shapesOf(use);
    for (const kind of kinds) {
      if (shapes.includes(kind)) continue;
      const ids = input.boxes.filter((b) => shapeKindOf(b) === kind).map((b) => b.id);
      const shown = ids.slice(0, 5).join(", ") + (ids.length > 5 ? `, and ${ids.length - 5} more` : "");
      out.push({
        claim: "shape",
        detail: `${use.id} supports only the shape kinds ${shapes.join(", ") || "(none)"}, but the input ${input.id} has ${kind} boxes: ${shown}`,
        inputs: [input.id],
      });
    }
  }
  return out;
}
