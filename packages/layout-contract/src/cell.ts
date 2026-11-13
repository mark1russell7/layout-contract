import { regionArea, regionPerimeter, type Region } from "./geometry.ts";
import { measureEntry, type MeasureEntry } from "./measure-registry.ts";
import type { MeasureSpec } from "./measures.ts";
import type { ShapeKind } from "./shapes.ts";

/** One placed item for the cell measures: the area that the item asks for, and the region that it got. */
export interface CellItem {
  /**
   * The weight of the item, for example the area `w` by `h` of its box in the input. It is a finite number above 0.
   * The targets do not need a sum of 1, because `cellsOf` divides each target by the sum of the targets.
   */
  readonly target: number;
  /** The region that the item got, in any frame. A box without a shape gives its rectangle. */
  readonly cell: Region;
}

/** The cell measures of a set of items: `docs/CELLS.md` gives the definitions. */
export interface Cells {
  /** Half the sum of the differences of the cell share and the target share, from 0 to 1. */
  readonly areaError: number;
  /** The mean of the perimeter squared over 4 PI times the area of each cell, 1 or more. */
  readonly compactness: number;
}

/** The suffix of a cell measure id. The id is the stage, a point and the suffix, for example `pack.cell.areaError`. */
export type CellMeasureSuffix = "cell.areaError" | "cell.compactness";

/** The suffixes of the cell measures, in the order of `cellMeasureSpecs`. */
export const CELL_MEASURE_SUFFIXES: readonly CellMeasureSuffix[] = /* @__PURE__ */ Object.freeze(["cell.areaError", "cell.compactness"] as const);

/**
 * The compactness of a square: 4 over PI. The value is the literal of `4 / Math.PI`, because a bundler keeps a top-level division, also when
 * no code uses it.
 */
export const SQUARE_COMPACTNESS: number = 1.2732395447351628;

/**
 * This function gives the cell measures of the placed items in a container of the area `containerArea`.
 *
 * - The cell share of an item is the area of its cell over `containerArea`. The target share is its `target` over the sum of the targets.
 * - `containerArea` is the area of the container region. For a container with a shape, give `regionArea` of the shape, not `w` by `h`.
 * - `areaError` is half the sum of the absolute differences of the two shares. Cells that fill the container in the target shares give 0.
 *   Cells that overlap or go out of the container can give a sum over 1. Those cells break the hard rules, and the value stops at 1.
 * - `compactness` is the mean of `P * P / (4 * PI * A)` over the cells, for the perimeter `P` and the area `A` of each cell.
 *   A circle gives 1, and a square gives 4 over PI. A cell with the area 0 gives `Infinity`.
 * - No items give the best values: an `areaError` of 0 and a `compactness` of 1. The hard rule `complete` counts the items that are not placed.
 *
 * A target that is not a finite number above 0, and a container area that is not a finite number above 0, give a `RangeError`.
 */
export function cellsOf(items: readonly CellItem[], containerArea: number): Cells {
  if (!(Number.isFinite(containerArea) && containerArea > 0)) throw new RangeError(`cellsOf: the container area is a finite number above 0, not ${containerArea}.`);
  if (items.length === 0) return { areaError: 0, compactness: 1 };
  let targets = 0;
  for (const item of items) {
    if (!(Number.isFinite(item.target) && item.target > 0)) throw new RangeError(`cellsOf: a target is a finite number above 0, not ${item.target}.`);
    targets += item.target;
  }
  let error = 0;
  let compact = 0;
  for (const item of items) {
    const area = regionArea(item.cell);
    error += Math.abs(area / containerArea - item.target / targets);
    const p = regionPerimeter(item.cell);
    compact += area > 0 ? (p * p) / (4 * Math.PI * area) : Infinity;
  }
  return { areaError: Math.min(1, error / 2), compactness: compact / items.length };
}

/** This function gives the cell values as measures, with the prefix of the stage, for example `pack.cell.areaError`. */
export function cellMeasures<S extends string>(stage: S, cells: Cells): Record<`${S}.${CellMeasureSuffix}`, number> {
  return {
    [`${stage}.cell.areaError`]: cells.areaError,
    [`${stage}.cell.compactness`]: cells.compactness,
  } as Record<`${S}.${CellMeasureSuffix}`, number>;
}

/**
 * This function gives the specs of the cell measures, with the prefix of the stage. The family is `cell`.
 * The measures read the exact area and perimeter of each cell, so they support `rect`, `polygon` and `circle`. A `free` box has only its bounding box, so it is not supported.
 */
export function cellMeasureSpecs<S extends string>(stage: S): readonly MeasureSpec<`${S}.${CellMeasureSuffix}`>[] {
  const shapes: readonly ShapeKind[] = ["rect", "polygon", "circle"];
  return Object.freeze([
    { id: `${stage}.cell.areaError`, unit: "share", direction: "lower", min: 0, max: 1, floor: 0, tol: 1e-9, minEffect: 0.01, family: "cell", shapes },
    { id: `${stage}.cell.compactness`, unit: "ratio", direction: "lower", min: 1, max: Infinity, minEffect: 0.01, family: "cell", shapes },
  ] as MeasureSpec<`${S}.${CellMeasureSuffix}`>[]);
}

/** The npm name of the package that computes the cell measures. */
export const CELL_SOURCE = "@mark1russell7/layout-contract";

/**
 * This function gives the registry entries of the cell measures, with the prefix of the stage.
 * `areaError` uses the rule `range`. `compactness` uses the rule `scale`: a square has the loss 0.5.
 * The cost of each is `n`. Each makes one pass over the corners of the cells. The cells of a Voronoi diagram have a count of corners in the order of `n`.
 */
export function cellMeasureEntries<S extends string>(stage: S): readonly MeasureEntry<`${S}.${CellMeasureSuffix}`>[] {
  const [area, compact] = cellMeasureSpecs(stage);
  return Object.freeze([
    measureEntry(area!, { source: CELL_SOURCE, cost: "n" }),
    measureEntry(compact!, {
      source: CELL_SOURCE,
      cost: "n",
      normalize: { kind: "scale", half: SQUARE_COMPACTNESS - 1, reason: "A square cell has the loss 0.5, and a circle has the loss 0." },
    }),
  ]);
}
