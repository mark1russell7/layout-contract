// Curves through the cells of a square grid: Hilbert, Moore and Morton (Z order). `docs/CURVES.md` gives the rules.
//
// A curve of side 2h has four parts. Part k fills the quadrant `order[k]` with a curve of side h, and the
// symmetry of part k maps that curve onto its quadrant. The top level uses the symmetries `root`, and each level
// below it uses the symmetries `child`. A curve of side 1 is the one cell (0, 0).

/**
 * A symmetry of a square: one of its 8 rotations and reflections. The names tell where a point `(s, t)` goes in a square
 * of side `size`.
 */
export type CurveSymmetry =
  /** The point stays: `(s, t)`. */
  | "same"
  /** The reflection in the diagonal from `(0, 0)`: `(t, s)`. */
  | "swap"
  /** The reflection in the other diagonal: `(size - t, size - s)`. */
  | "back"
  /** The turn by a half circle: `(size - s, size - t)`. */
  | "half"
  /** The quarter turn from the axis `s` to the axis `t`: `(size - t, s)`. */
  | "rise"
  /** The quarter turn from the axis `t` to the axis `s`: `(t, size - s)`. */
  | "fall"
  /** The reflection that changes `s`: `(size - s, t)`. */
  | "flip-s"
  /** The reflection that changes `t`: `(s, size - t)`. */
  | "flip-t";

/** The 8 symmetries of a square, in a fixed order. */
export const CURVE_SYMMETRIES: readonly CurveSymmetry[] = Object.freeze(["same", "swap", "back", "half", "rise", "fall", "flip-s", "flip-t"]);

/** A quadrant of a square: `[0, 0]` is the low left quadrant, and `[1, 0]` is the quadrant with the high `s` and the low `t`. */
export type CurveQuadrant = readonly [0 | 1, 0 | 1];

/** The symmetries of the four parts of one level of a curve, in the order of the parts. */
export type CurvePattern = readonly [CurveSymmetry, CurveSymmetry, CurveSymmetry, CurveSymmetry];

/** A curve as data. It has the quadrant of each part in the order of the curve, and the symmetry of each part. */
export interface CurveSpec {
  readonly name: string;
  readonly order: readonly [CurveQuadrant, CurveQuadrant, CurveQuadrant, CurveQuadrant];
  readonly root: CurvePattern;
  readonly child: CurvePattern;
}

/** The order of the parts of the Hilbert and Moore curves: low left, high left, high right and low right. */
const LOOP_ORDER: CurveSpec["order"] = Object.freeze([
  Object.freeze([0, 0] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([1, 1] as const),
  Object.freeze([1, 0] as const),
]);

/** The parts of the Hilbert curve. The curve goes in at the corner `(0, 0)` and out at the corner `(size, 0)`. */
export const HILBERT_PATTERN: CurvePattern = Object.freeze(["swap", "same", "same", "back"] as const);

/** The top level of the Moore curve: four Hilbert curves in a loop. The loop goes in and out at the middle of the side `t = 0`. */
export const MOORE_PATTERN: CurvePattern = Object.freeze(["rise", "rise", "fall", "fall"] as const);

/** The Hilbert curve. Two cells in a row along the curve share a side. */
export const HILBERT_CURVE: CurveSpec = Object.freeze({ name: "hilbert", order: LOOP_ORDER, root: HILBERT_PATTERN, child: HILBERT_PATTERN });

/** The Moore curve. Two cells in a row share a side, and the last cell shares a side with the first cell. */
export const MOORE_CURVE: CurveSpec = Object.freeze({ name: "moore", order: LOOP_ORDER, root: MOORE_PATTERN, child: HILBERT_PATTERN });

/** The Morton curve (the Z order). The index of a cell has the bits of `x` at the even places and the bits of `y` at the odd places. */
export const MORTON_CURVE: CurveSpec = Object.freeze({
  name: "morton",
  order: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([1, 0] as const), Object.freeze([0, 1] as const), Object.freeze([1, 1] as const)] as const),
  root: Object.freeze(["same", "same", "same", "same"] as const),
  child: Object.freeze(["same", "same", "same", "same"] as const),
});

/** The largest side of a curve grid: 2 to the power 26. Thus each index is less than 2 to the power 52, and is exact. */
export const CURVE_MAX_SIDE: number = 2 ** 26;

/**
 * This function gives a point of the square `[0, size] x [0, size]` after a symmetry. The cell `(x, y)` of a grid of
 * side `n` goes to a cell of the same grid with `size = n - 1`.
 */
export function applySymmetry(symmetry: CurveSymmetry, s: number, t: number, size = 1): [number, number] {
  switch (symmetry) {
    case "same":
      return [s, t];
    case "swap":
      return [t, s];
    case "back":
      return [size - t, size - s];
    case "half":
      return [size - s, size - t];
    case "rise":
      return [size - t, s];
    case "fall":
      return [t, size - s];
    case "flip-s":
      return [size - s, t];
    case "flip-t":
      return [s, size - t];
  }
}

/** This function gives the symmetry that undoes `symmetry`. Each symmetry undoes itself, but `rise` and `fall` undo each other. */
export function inverseSymmetry(symmetry: CurveSymmetry): CurveSymmetry {
  return symmetry === "rise" ? "fall" : symmetry === "fall" ? "rise" : symmetry;
}

/** This function gives the count of levels of a side. A side that is not a power of 2 from 1 to `CURVE_MAX_SIDE` is a `RangeError`. */
function levelsOf(side: number): number {
  if (!Number.isInteger(side) || side < 1 || side > CURVE_MAX_SIDE || (side & (side - 1)) !== 0) {
    throw new RangeError(`The side of a curve grid must be a power of 2 from 1 to ${CURVE_MAX_SIDE}, not ${side}.`);
  }
  return Math.round(Math.log2(side));
}

/**
 * This function gives the cell `[x, y]` at the place `index` along a curve on a grid of `side` cells on each side.
 * The side is a power of 2, and the index is a whole number from 0 to `side * side - 1`. Other values are a `RangeError`.
 * The cost is `O(log side)`.
 */
export function curveCell(curve: CurveSpec, index: number, side: number): [number, number] {
  const levels = levelsOf(side);
  if (!Number.isInteger(index) || index < 0 || index >= side * side) throw new RangeError(`The index ${index} is not a cell of a grid of side ${side}.`);
  let x = 0;
  let y = 0;
  let rest = index;
  // From the lowest level up: the cell in the part of side h goes to its quadrant of the part of side 2h.
  for (let level = 0, h = 1; level < levels; level += 1, h *= 2) {
    const part = rest % 4;
    rest = Math.floor(rest / 4);
    const pattern = level === levels - 1 ? curve.root : curve.child;
    [x, y] = applySymmetry(pattern[part]!, x, y, h - 1);
    const [qx, qy] = curve.order[part]!;
    x += qx * h;
    y += qy * h;
  }
  return [x, y];
}

/**
 * This function gives the place along a curve of the cell `(x, y)` of a grid of `side` cells on each side. It is the inverse
 * of `curveCell`. A side that is not a power of 2, or a cell outside the grid, is a `RangeError`. The cost is `O(log side)`.
 */
export function curveIndex(curve: CurveSpec, x: number, y: number, side: number): number {
  const levels = levelsOf(side);
  for (const value of [x, y]) {
    if (!Number.isInteger(value) || value < 0 || value >= side) throw new RangeError(`The cell (${x}, ${y}) is not in a grid of side ${side}.`);
  }
  let index = 0;
  let s = x;
  let t = y;
  // From the top level down: find the quadrant, then undo the symmetry of its part.
  for (let level = levels - 1, h = side / 2; level >= 0; level -= 1, h /= 2) {
    const qx = s >= h ? 1 : 0;
    const qy = t >= h ? 1 : 0;
    const part = curve.order.findIndex(([ox, oy]) => ox === qx && oy === qy);
    const pattern = level === levels - 1 ? curve.root : curve.child;
    [s, t] = applySymmetry(inverseSymmetry(pattern[part]!), s - qx * h, t - qy * h, h - 1);
    index += part * h * h;
  }
  return index;
}

/** This function gives the place along the Hilbert curve of the cell `(x, y)` of a grid of side `side`. */
export function hilbertIndex(x: number, y: number, side: number): number {
  return curveIndex(HILBERT_CURVE, x, y, side);
}

/** This function gives the cell at the place `index` along the Hilbert curve on a grid of side `side`. */
export function hilbertCell(index: number, side: number): [number, number] {
  return curveCell(HILBERT_CURVE, index, side);
}

/** This function gives the place along the Moore curve of the cell `(x, y)` of a grid of side `side`. */
export function mooreIndex(x: number, y: number, side: number): number {
  return curveIndex(MOORE_CURVE, x, y, side);
}

/** This function gives the cell at the place `index` along the Moore curve on a grid of side `side`. */
export function mooreCell(index: number, side: number): [number, number] {
  return curveCell(MOORE_CURVE, index, side);
}

/** This function gives the place along the Morton curve of the cell `(x, y)` of a grid of side `side`. */
export function mortonIndex(x: number, y: number, side: number): number {
  return curveIndex(MORTON_CURVE, x, y, side);
}

/** This function gives the cell at the place `index` along the Morton curve on a grid of side `side`. */
export function mortonCell(index: number, side: number): [number, number] {
  return curveCell(MORTON_CURVE, index, side);
}

/**
 * This function gives each cell of a grid of side `side` in the order of a curve. The cost is `O(side^2 log side)`.
 * A side that is not a power of 2 is a `RangeError`.
 */
export function curveCells(curve: CurveSpec, side: number): [number, number][] {
  levelsOf(side);
  return Array.from({ length: side * side }, (_, index) => curveCell(curve, index, side));
}
