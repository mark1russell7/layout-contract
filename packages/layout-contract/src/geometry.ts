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

/**
 * This function gives the corners of a convex region, or `undefined` for each other region.
 * A `rect` gives its 4 corners. A `polygon` without holes gives its points when it has 3 or more corners, an area over 0, and each turn to the same side.
 * The turns use exact signs. A corner on a straight side is permitted. A circle and an ellipse give `undefined`.
 */
export function convexCorners(region: Region): Ring | undefined {
  if (region.kind === "rect") {
    const { x, y, w, h } = region;
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  if (region.kind !== "polygon" || (region.holes !== undefined && region.holes.length > 0)) return undefined;
  const ring = region.points;
  if (ring.length < 3 || !ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return undefined;
  let turn = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const [cx, cy] = ring[(i + 2) % ring.length]!;
    const s = orient2dSign(ax, ay, bx, by, cx, cy);
    if (s === 0) continue;
    if (turn !== 0 && s !== turn) return undefined;
    turn = s;
  }
  return turn === 0 ? undefined : ring;
}

/**
 * This function gives the least overlap of two convex rings over the normals of their sides, in the units of the corners.
 * By the separating axis theorem, a value of 0 or less tells that a line separates the rings. For two rectangles, the value is the lesser axis of `overlapOf`.
 * A side of length 0 gives no normal. The rings come from `convexCorners`.
 */
export function convexOverlap(a: Ring, b: Ring): number {
  let least = Infinity;
  for (const ring of [a, b]) {
    for (let i = 0; i < ring.length; i++) {
      const [px, py] = ring[i]!;
      const [qx, qy] = ring[(i + 1) % ring.length]!;
      const length = Math.hypot(qx - px, qy - py);
      if (length === 0) continue;
      const nx = (py - qy) / length;
      const ny = (qx - px) / length;
      const [aLow, aHigh] = project(a, nx, ny);
      const [bLow, bHigh] = project(b, nx, ny);
      least = Math.min(least, Math.min(aHigh, bHigh) - Math.max(aLow, bLow));
    }
  }
  return least;
}

/** This function gives the least and the greatest projection of the corners of a ring on the direction (`nx`, `ny`). */
function project(ring: Ring, nx: number, ny: number): readonly [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const [x, y] of ring) {
    const v = x * nx + y * ny;
    if (v < low) low = v;
    if (v > high) high = v;
  }
  return [low, high];
}

/**
 * This function tells if each corner of the ring `inner` is inside the convex ring `outer` made smaller by `inset`, with the tolerance `tolerance`.
 * For a convex `outer`, this test is exact: a polygon is inside a convex region when each of its corners is inside.
 * The ring `outer` comes from `convexCorners`, in either direction of its corners.
 */
export function cornersInConvex(inner: Ring, outer: Ring, inset = 0, tolerance = 0): boolean {
  const turn = Math.sign(ringTwiceArea(outer));
  for (let i = 0; i < outer.length; i++) {
    const [px, py] = outer[i]!;
    const [qx, qy] = outer[(i + 1) % outer.length]!;
    const length = Math.hypot(qx - px, qy - py);
    if (length === 0) continue;
    // The left normal of a side points inside when the signed area is over 0. The sign of the area chooses the inward normal.
    const nx = (turn * (py - qy)) / length;
    const ny = (turn * (qx - px)) / length;
    const edge = px * nx + py * ny;
    for (const [x, y] of inner) if (x * nx + y * ny - edge < inset - tolerance) return false;
  }
  return true;
}

/** This function gives two times the signed area of a ring, by the shoelace formula, relative to its first corner. */
function ringTwiceArea(ring: Ring): number {
  if (ring.length === 0) return 0;
  const [ox, oy] = ring[0]!;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    twice += (ax - ox) * (by - oy) - (bx - ox) * (ay - oy);
  }
  return twice;
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

/**
 * This function gives the point of the segment `ab` nearest to `p`. A segment of length 0 gives the point `a`.
 * The point is `a + t * (b - a)`, with `t` from 0 to 1. The point at the end `b` is `a + (b - a)`, and it can differ from `b` by a rounding error.
 * The `Math.hypot` distance from `p` to the point is the same float as `pointSegmentDistance(p, a, b)`, for finite coordinates.
 */
export function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * This function gives the shortest distance from `p` to a polyline. A polyline of one point is that point, and an empty polyline gives `Infinity`.
 * The hit test of a route uses it with the polyline of `samplePath`.
 */
export function pointPolylineDistance(p: Point, points: readonly Point[]): number {
  const first = points[0];
  if (first === undefined) return Infinity;
  let best = Math.hypot(p.x - first.x, p.y - first.y);
  for (let i = 1; i < points.length; i++) best = Math.min(best, pointSegmentDistance(p, points[i - 1]!, points[i]!));
  return best;
}

/** The place on a polyline nearest to a point, from `locateOnPolyline`. */
export interface PolylinePlace {
  /** The point of the polyline nearest to the point. */
  readonly point: Point;
  /** The length of the polyline from its first point to `point`. */
  readonly along: number;
  /** The distance from the point to `point`. It is the same float as `pointPolylineDistance`. */
  readonly distance: number;
  /** The index of the first point of the segment of `point`. A polyline of one point gives 0. */
  readonly segment: number;
  /**
   * The side of the point: the exact sign of the cross product of the segment and the vector from its start to the point.
   * A point on the line of the segment gives 0. A polyline of one point gives 0.
   */
  readonly side: -1 | 0 | 1;
}

/**
 * This function gives the place on a polyline nearest to `p`: the point, its length along the polyline, the distance and the side.
 * When two segments are at the same distance, the first segment wins. An empty polyline gives `undefined`.
 * A street address uses it: the length along the street line of each known number, and its side of the street.
 */
export function locateOnPolyline(p: Point, points: readonly Point[]): PolylinePlace | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  if (points.length === 1) return { point: first, along: 0, distance: Math.hypot(p.x - first.x, p.y - first.y), segment: 0, side: 0 };
  let best: PolylinePlace | undefined;
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const near = nearestOnSegment(p, a, b);
    const distance = pointSegmentDistance(p, a, b);
    if (best === undefined || distance < best.distance) {
      best = { point: near, along: run + Math.hypot(near.x - a.x, near.y - a.y), distance, segment: i - 1, side: length === 0 ? 0 : (side(a, b, p) as -1 | 0 | 1) };
    }
    run += length;
  }
  return best;
}

/**
 * This function gives the point at the length `along` of a polyline, moved by `offset` at a right angle to its segment.
 * A positive `offset` moves the point to the side 1 of `locateOnPolyline`, and a negative `offset` to the side -1.
 *
 * An `along` less than 0 gives the first point, and an `along` more than the length gives the last point. The offset then uses the segment at that end.
 * Segments of length 0 have no direction, so the offset skips them. A polyline with no direction gives its point with no offset.
 * An empty polyline gives `undefined`.
 */
export function pointAlongPolyline(points: readonly Point[], along: number, offset = 0): Point | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  let run = 0;
  let last: { a: Point; b: Point; length: number } | undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    if (along <= run + length) return offsetPoint(a, b, length, Math.max(0, along - run), offset);
    last = { a, b, length };
    run += length;
  }
  if (last === undefined) return first;
  return offsetPoint(last.a, last.b, last.length, last.length, offset);
}

/** This function gives the point at the length `at` of the segment `ab`, moved by `offset` to the side 1 of the segment. */
function offsetPoint(a: Point, b: Point, length: number, at: number, offset: number): Point {
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  return { x: a.x + at * ux - offset * uy, y: a.y + at * uy + offset * ux };
}

/**
 * This function joins polylines at their shared end points into longer polylines, for example the ways of one street.
 * Two ends join only when their coordinates are equal. A join reverses a polyline when its direction is opposite.
 * The first polyline that is left starts each chain, and the chain grows at both ends with the first polyline that touches an end.
 * Thus a branch point keeps one branch in the chain, and the other branches start their own chains. An empty polyline gives no chain.
 */
export function chainPolylines(lines: readonly (readonly Point[])[]): Point[][] {
  const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
  const rest = lines.filter((line) => line.length > 0).map((line) => [...line]);
  const chains: Point[][] = [];
  for (let chain = rest.shift(); chain !== undefined; chain = rest.shift()) {
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < rest.length; i++) {
        const line = rest[i]!;
        const start = chain[0]!;
        const end = chain.at(-1)!;
        if (same(line[0]!, end)) chain = [...chain, ...line.slice(1)];
        else if (same(line.at(-1)!, end)) chain = [...chain, ...line.toReversed().slice(1)];
        else if (same(line.at(-1)!, start)) chain = [...line.slice(0, -1), ...chain];
        else if (same(line[0]!, start)) chain = [...line.toReversed().slice(0, -1), ...chain];
        else continue;
        rest.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
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
 * This function gives the distance from `p` to a region. A point in the region gives 0, so a hit test compares the value with its slack.
 * A hole of a polygon is not in the region. A polygon with no corner gives `Infinity`.
 * The distance to an ellipse is along the line to its center. Thus the value is the shortest distance or more, and the two are equal on the axes.
 */
export function pointRegionDistance(p: Point, region: Region): number {
  switch (region.kind) {
    case "rect":
      return Math.hypot(Math.max(region.x - p.x, 0, p.x - region.x - region.w), Math.max(region.y - p.y, 0, p.y - region.y - region.h));
    case "circle":
      return Math.max(0, Math.hypot(p.x - region.cx, p.y - region.cy) - region.r);
    case "ellipse": {
      const dx = p.x - region.cx;
      const dy = p.y - region.cy;
      // An ellipse with no width or no height is a segment or a point.
      if (!(region.rx > 0) || !(region.ry > 0)) {
        const rx = Math.max(0, region.rx);
        const ry = Math.max(0, region.ry);
        return pointSegmentDistance(p, { x: region.cx - rx, y: region.cy - ry }, { x: region.cx + rx, y: region.cy + ry });
      }
      // The line from the center to `p` leaves the ellipse at the share 1 / `far` of its length.
      const far = Math.hypot(dx / region.rx, dy / region.ry);
      return far <= 1 ? 0 : Math.hypot(dx, dy) * (1 - 1 / far);
    }
    case "polygon": {
      const rings = region.holes === undefined ? [region.points] : [region.points, ...region.holes];
      if (pointInRings(p.x, p.y, rings)) return 0;
      let best = Infinity;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ax, ay] = ring[j]!;
          const [bx, by] = ring[i]!;
          best = Math.min(best, pointSegmentDistance(p, { x: ax, y: ay }, { x: bx, y: by }));
        }
      }
      return best;
    }
  }
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

/** This function gives the middle of a rectangle. */
export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
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
