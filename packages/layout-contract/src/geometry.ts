import { orient2dSign } from "@mark1russell7/predicates";

/** A side of a box. The y axis points down, so `top` has the smallest y. */
export type Side = "top" | "right" | "bottom" | "left";

/** The sides in clockwise order, from the top. */
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle: its top-left corner and its size. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A rectangle with the size in long names: its top-left corner, its `width` and its `height`.
 * Some layout engines use this shape. `toRect` and `toSizedRect` convert between it and `Rect`.
 */
export interface SizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** This function gives the `Rect` of a `SizedRect`. It copies each number, and it does not round. */
export function toRect(rect: SizedRect): Rect {
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}

/** This function gives the `SizedRect` of a `Rect`. It copies each number, and it does not round. */
export function toSizedRect(rect: Rect): SizedRect {
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
}

/** This function rounds a number to a whole number with `Math.round`. It gives 0, not -0, for a small negative number. */
const roundEdge = (value: number): number => Math.round(value) + 0;

/**
 * This function gives a rectangle on whole pixels. It rounds each edge with `Math.round`, not the size. Thus two
 * rectangles that touch still touch after the rounding, and no gap or overlap of one pixel comes between them.
 */
export function snapRect(rect: Rect): Rect {
  const x = roundEdge(rect.x);
  const y = roundEdge(rect.y);
  return { x, y, w: roundEdge(rect.x + rect.w) - x, h: roundEdge(rect.y + rect.h) - y };
}

/**
 * This function gives a rectangle with each coordinate and each size times `factor`. It changes the unit of a
 * rectangle, for example from the CSS pixels of a zoomed page to the pixels of its window. It does not round:
 * `snapRect` comes after it. A factor that is negative or not finite gives a `RangeError`.
 */
export function scaleRect(rect: Rect, factor: number): Rect {
  if (!Number.isFinite(factor) || factor < 0) throw new RangeError(`The factor of scaleRect must be a finite number of 0 or more, not ${factor}.`);
  return { x: rect.x * factor, y: rect.y * factor, w: rect.w * factor, h: rect.h * factor };
}

/** A value for each side of a box. */
export interface Sides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * A region. The forms and the rules are those of `docs/FORMAT.md` of `packing`.
 * A ring of a polygon closes without a copy of its first point.
 */
export type Region =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | {
      readonly kind: "polygon";
      readonly points: Ring;
      readonly holes?: readonly Ring[];
    }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };

/** A margin: one value for the four sides, or one value for each side. */
export type Margin = number | Sides;

/** This function gives the value of each side of a margin. No margin gives 0 on each side. */
export function marginSides(margin: Margin | undefined): Sides {
  if (margin === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof margin === "number") return { top: margin, right: margin, bottom: margin, left: margin };
  return margin;
}

/** This function gives the rectangle made larger by the margin on each side. */
export function grow(rect: Rect, margin: Margin | undefined): Rect {
  const m = marginSides(margin);
  return { x: rect.x - m.left, y: rect.y - m.top, w: rect.w + m.left + m.right, h: rect.h + m.top + m.bottom };
}

/** This function gives the bounding box of a region. */
export function boundsOf(region: Region): Rect {
  switch (region.kind) {
    case "rect":
      return { x: region.x, y: region.y, w: region.w, h: region.h };
    case "circle":
      return { x: region.cx - region.r, y: region.cy - region.r, w: 2 * region.r, h: 2 * region.r };
    case "ellipse":
      return { x: region.cx - region.rx, y: region.cy - region.ry, w: 2 * region.rx, h: 2 * region.ry };
    case "polygon": {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of region.points) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  }
}

/**
 * This function gives the exact area of a region. A `rect` gives `w` by `h`, a circle gives `PI * r * r`, and an ellipse gives `PI * rx * ry`.
 * A polygon gives the absolute value of the shoelace formula, less the area of each hole. A ring with fewer than 3 points has the area 0.
 */
export function regionArea(region: Region): number {
  switch (region.kind) {
    case "rect":
      return region.w * region.h;
    case "circle":
      return Math.PI * region.r * region.r;
    case "ellipse":
      return Math.PI * region.rx * region.ry;
    case "polygon":
      return (region.holes ?? []).reduce((area, hole) => area - ringArea(hole), ringArea(region.points));
  }
}

/** This function gives the area of one ring of a polygon: the absolute value of the shoelace formula. */
function ringArea(ring: readonly (readonly [number, number])[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
}

/**
 * This function gives the perimeter of a region. A `rect` gives `2 * (w + h)`, and a circle gives `2 * PI * r`.
 * A polygon gives the length of its outer ring plus the length of each hole. A ring with fewer than 2 points has the length 0.
 *
 * An ellipse has no closed form. It gives the second formula of Ramanujan, with a relative error below 5e-4 of the true perimeter. The error is largest for a flat ellipse.
 */
export function regionPerimeter(region: Region): number {
  switch (region.kind) {
    case "rect":
      return 2 * (region.w + region.h);
    case "circle":
      return 2 * Math.PI * region.r;
    case "ellipse": {
      const a = Math.abs(region.rx);
      const b = Math.abs(region.ry);
      if (a + b === 0) return 0;
      const t = ((a - b) / (a + b)) ** 2;
      return Math.PI * (a + b) * (1 + (3 * t) / (10 + Math.sqrt(4 - 3 * t)));
    }
    case "polygon":
      return (region.holes ?? []).reduce((length, hole) => length + ringLength(hole), ringLength(region.points));
  }
}

/** This function gives the length of the closed ring of a polygon. */
function ringLength(ring: readonly (readonly [number, number])[]): number {
  if (ring.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    length += Math.hypot(bx - ax, by - ay);
  }
  return length;
}

/** This function gives the region moved by `dx` and `dy`. */
export function translate(region: Region, dx: number, dy: number): Region {
  switch (region.kind) {
    case "rect":
      return { ...region, x: region.x + dx, y: region.y + dy };
    case "circle":
    case "ellipse":
      return { ...region, cx: region.cx + dx, cy: region.cy + dy };
    case "polygon": {
      const move = (ring: readonly (readonly [number, number])[]): [number, number][] => ring.map(([x, y]) => [x + dx, y + dy]);
      return region.holes === undefined
        ? { kind: "polygon", points: move(region.points) }
        : { kind: "polygon", points: move(region.points), holes: region.holes.map(move) };
    }
  }
}

/**
 * This function gives the overlap of the insides of two rectangles on each axis.
 * A value of 0 or less on an axis is no overlap. Two rectangles with a common edge have an overlap of 0.
 */
export function overlapOf(a: Rect, b: Rect): { readonly x: number; readonly y: number } {
  return {
    x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}

/** This function gives the cross product of `ab` and `ac`. The sign tells the side of `ab` that has `c`. */
function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** This function gives the exact sign of the cross product of `ab` and `ac`, from `orient2dSign` of `@mark1russell7/predicates`. */
function side(a: Point, b: Point, c: Point): number {
  return orient2dSign(a.x, a.y, b.x, b.y, c.x, c.y);
}

/** This function tells if each coordinate of the points is finite. */
function allFinite(...points: readonly Point[]): boolean {
  return points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/**
 * This function tells if the segments `ab` and `cd` cross at one point inside both of them.
 * Segments that only touch at an end, or that are collinear, do not cross. The test has no tolerance.
 * The signs are exact, so an input that is almost collinear gets the correct answer. A coordinate that is not finite gives `false`.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  if (!allFinite(a, b, c, d)) return false;
  return side(c, d, a) * side(c, d, b) === -1 && side(a, b, c) * side(a, b, d) === -1;
}

/**
 * This function gives the point where the segments `ab` and `cd` cross, or `undefined`.
 * It gives a point exactly when `segmentsCross` is true, so a touch at an end and collinear segments give `undefined`.
 * The point comes from float cross products. For an input that is almost collinear, the point stays on `ab`.
 */
export function crossingPoint(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  if (!segmentsCross(a, b, c, d)) return undefined;
  const from = orient(c, d, a);
  const r = from / (from - orient(c, d, b));
  const t = Number.isNaN(r) ? 0.5 : Math.min(1, Math.max(0, r));
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** This function gives the shortest distance from `p` to the segment `ab`. A segment of length 0 is the point `a`. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A ring of a polygon: its corners in order, as `[x, y]` pairs. The last corner connects to the first. */
export type Ring = readonly (readonly [number, number])[];

/** This function tells if the point (`x`, `y`) is inside a ring, by the even-odd rule. A ring can be concave. The answer for a point on the border can be each value. */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  return pointInRings(x, y, [ring]);
}

/**
 * This function tells if the point (`x`, `y`) is inside a set of rings, by the even-odd rule over all their sides.
 * Thus a point inside the outer ring and inside a hole is out. The answer for a point on a border can be each value.
 */
export function pointInRings(x: number, y: number, rings: readonly Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * This function gives the centroid of the area of a ring, by the shoelace formula. The order of the corners can be
 * clockwise or counterclockwise. A ring with the area 0 gives the mean of its corners. An empty ring is a `RangeError`.
 * The sums use the corners relative to the first corner. Thus a small ring far from the origin keeps its digits.
 */
export function ringCentroid(ring: Ring): Point {
  if (ring.length === 0) throw new RangeError("ringCentroid needs a ring with at least one corner.");
  const [ox, oy] = ring[0]!;
  let twice = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ax = a[0] - ox;
    const ay = a[1] - oy;
    const bx = b[0] - ox;
    const by = b[1] - oy;
    const cross = ax * by - bx * ay;
    twice += cross;
    sx += (ax + bx) * cross;
    sy += (ay + by) * cross;
  }
  if (twice === 0) {
    const mean = (k: 0 | 1): number => ring.reduce((sum, corner) => sum + (corner[k] - ring[0]![k]), 0) / ring.length;
    return { x: ox + mean(0), y: oy + mean(1) };
  }
  return { x: ox + sx / (3 * twice), y: oy + sy / (3 * twice) };
}

/**
 * This function gives the part of a ring in the half-plane `a * x + b * y <= c`, by the steps of Sutherland and Hodgman.
 * The corners keep their order. A new corner goes where a side crosses the line. A ring with no part in the half-plane
 * gives an empty ring. The part of a convex ring is convex. The part of a concave ring can have sides of length 0 on the line.
 */
export function clipRing(ring: Ring, a: number, b: number, c: number): Ring {
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/** This function gives the distance between the centers of two rectangles. */
export function boxCenterDistance(a: Rect, b: Rect): number {
  return Math.hypot(b.x + b.w / 2 - (a.x + a.w / 2), b.y + b.h / 2 - (a.y + a.h / 2));
}

/**
 * This function gives the index at which a point goes among the items of a list on the screen.
 * The reading order is the rows from top to bottom, and each row from left to right.
 * The index is that of the first item whose center comes after the point, from 0 to the number of items.
 * A center within `rowTolerance` of the point on the vertical axis is in the row of the point.
 * The tolerance has the units of the points: on a screen, the default 24 is 24 pixels.
 *
 * Give the centers in reading order and without the item that moves.
 *
 * @example
 * ```ts
 * const index = dropIndex(pointer, others.map(centerOf));
 * ```
 */
export function dropIndex(point: Point, centers: readonly Point[], rowTolerance = 24): number {
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i] as Point;
    if (point.y < c.y - rowTolerance) return i;
    if (Math.abs(point.y - c.y) <= rowTolerance && point.x < c.x) return i;
  }
  return centers.length;
}
