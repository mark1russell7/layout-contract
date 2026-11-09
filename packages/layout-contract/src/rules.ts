import { boundsOf, grow, marginSides, overlapOf, type Margin, type Point, type Rect, type Region } from "./geometry.ts";
import type { LayoutBox, LayoutContainer, LayoutInput, Obstacle, PairGap, Port } from "./input.ts";
import { applyPack, type PackOutput } from "./output.ts";
import { resizeProblems, sizeFits } from "./resize.ts";
import { SHAPE_KIND_IDS, shapeKindProblem, type ShapeSupport } from "./shapes.ts";
import { DEFAULT_TOLERANCE, EPS, RECORD_EPS } from "./tolerance.ts";
import { turnBox } from "./turn.ts";

/** This function gives the area of a placed box: its shape or its rectangle, at its position. A box without a position gives `undefined`. */
export function placedRect(box: LayoutBox): Rect | undefined {
  if (box.x === undefined || box.y === undefined) return undefined;
  if (box.shape === undefined) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const b = boundsOf(box.shape);
  return { x: box.x + b.x, y: box.y + b.y, w: b.w, h: b.h };
}

/**
 * The version of the rules that count `no-overlap` and `in-container`. A record states it in `LayoutRecord.hardRule`.
 *
 * - Version 1 counts each shape by its bounding box. On a circle, that count is an upper bound. A count over 0 proves nothing.
 * - Version 2 counts two circles, and a circle in a circle container, by the distance of the centers. The other pairs stay on the bounding box.
 */
export const HARD_RULE_VERSION = 2;

/** A circle at its place on the board: its center and its radius, without a margin. */
export interface PlacedCircle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** This function gives the circle of a placed box. A box without a position, or with another shape, gives `undefined`. */
export function placedCircle(box: LayoutBox): PlacedCircle | undefined {
  if (box.shape?.kind !== "circle" || box.x === undefined || box.y === undefined) return undefined;
  return { cx: box.x + box.shape.cx, cy: box.y + box.shape.cy, r: box.shape.r };
}

/** This function gives the largest side of a margin. A circle has one distance to the things near it, so its margin is this side. */
function marginReach(margin: Margin | undefined): number {
  const m = marginSides(margin);
  return Math.max(m.top, m.right, m.bottom, m.left);
}

/** This function tells if the centers of two circles are nearer than `need`. It compares the squares, so it does not take a root. */
function nearerThan(a: PlacedCircle, b: PlacedCircle, need: number): boolean {
  if (need <= 0) return false;
  const dx = a.cx - b.cx;
  const dy = a.cy - b.cy;
  return dx * dx + dy * dy < need * need;
}

/**
 * This function tells if two placed boxes break `no-overlap`. It is the rule for one pair of `countOverlaps`.
 *
 * - Two circles break the rule when their centers are nearer than the two radii and the two margins, less `tolerance`. The margin of a circle is the largest side of its margin.
 * - Another pair breaks the rule when the bounding boxes with their margins overlap by more than `tolerance` on each axis. With a shape that is not a rectangle, this test is an upper bound.
 * - With `gap`, the gap replaces the two margins. Two circles are then apart by the two radii and the gap. For another pair, one box grows by the gap.
 * - A box without a position does not overlap.
 */
export function shapesOverlap(a: LayoutBox, b: LayoutBox, tolerance: number = DEFAULT_TOLERANCE.overlap, gap?: number): boolean {
  const ca = placedCircle(a);
  const cb = placedCircle(b);
  if (ca !== undefined && cb !== undefined) return nearerThan(ca, cb, ca.r + cb.r + (gap ?? marginReach(a.margin) + marginReach(b.margin)) - tolerance);
  const ra = placedRect(a);
  const rb = placedRect(b);
  if (ra === undefined || rb === undefined) return false;
  const o = gap === undefined ? overlapOf(grow(ra, a.margin), grow(rb, b.margin)) : overlapOf(grow(ra, gap), rb);
  return o.x > tolerance && o.y > tolerance;
}

/** This function gives the gap of each pair of `pairGaps` by `pairKey`. The first entry of a pair wins. A pair of one box has no gap. */
function gapsOf(pairGaps: readonly PairGap[] | undefined): Map<string, number> {
  const gaps = new Map<string, number>();
  for (const p of pairGaps ?? []) {
    const key = pairKey(p.a, p.b);
    if (p.a !== p.b && !gaps.has(key)) gaps.set(key, p.gap);
  }
  return gaps;
}

/**
 * This function counts the pairs of placed boxes that break `no-overlap`. `shapesOverlap` is the rule for one pair.
 * Two circles count by the distance of their centers. Each other pair counts by the bounding boxes, so a circle beside another shape is an upper bound (roadmap item L107).
 *
 * A pair of `pairGaps`, in either order, uses its `gap` in place of the two margins. One box grows by the gap, and the other box does not grow.
 * Thus the pair breaks the rule only when the boxes are nearer than the gap on each axis. The other pairs do not change.
 */
export function countOverlaps(boxes: readonly LayoutBox[], tolerance: number = DEFAULT_TOLERANCE.overlap, pairGaps?: readonly PairGap[]): number {
  const circles = circleOverlaps(boxes, tolerance, pairGaps);
  if (pairGaps === undefined || pairGaps.length === 0) return circles + marginOverlaps(boxes, tolerance, undefined);
  const gaps = gapsOf(pairGaps);
  const raw = new Map<string, LayoutBox>();
  for (const box of boxes) {
    if (placedRect(box) !== undefined && !raw.has(box.id)) raw.set(box.id, box);
  }
  let count = circles + marginOverlaps(boxes, tolerance, gaps);
  for (const [key, gap] of gaps) {
    const [a, b] = JSON.parse(key) as [string, string];
    const ba = raw.get(a);
    const bb = raw.get(b);
    if (ba === undefined || bb === undefined) continue;
    if (placedCircle(ba) !== undefined && placedCircle(bb) !== undefined) continue;
    if (shapesOverlap(ba, bb, tolerance, gap)) count++;
  }
  return count;
}

/** This function gives the key of a pair of box ids, with the same key for each order. */
const pairKey = (a: string, b: string): string => JSON.stringify(a < b ? [a, b] : [b, a]);

/**
 * This function counts the pairs of placed circles that break `no-overlap`, by the distance of their centers. Each other box does not count.
 *
 * - Two circles break the rule when their centers are nearer than the two radii, the two margins and `gap`, less `tolerance`.
 * - The margin of a circle is the largest side of its margin.
 * - A pair of `pairGaps` is apart by the two radii and its gap, in place of the margins and `gap`.
 * - `gap` has the default 0. The rule `no-overlap` does not read `LayoutInput.gap`, so `countOverlaps` gives no value. An engine that keeps the gap between circles gives it here.
 */
export function circleOverlaps(boxes: readonly LayoutBox[], tolerance: number = DEFAULT_TOLERANCE.overlap, pairGaps?: readonly PairGap[], gap = 0): number {
  const gaps = gapsOf(pairGaps);
  const discs: { readonly id: string; readonly c: PlacedCircle; readonly reach: number }[] = [];
  const first = new Map<string, PlacedCircle>();
  for (const box of boxes) {
    const c = placedCircle(box);
    if (c === undefined) continue;
    discs.push({ id: box.id, c, reach: c.r + marginReach(box.margin) + gap / 2 });
    if (!first.has(box.id)) first.set(box.id, c);
  }
  discs.sort((a, b) => a.c.cx - a.reach - (b.c.cx - b.reach));
  let count = 0;
  for (let i = 0; i < discs.length; i++) {
    const a = discs[i]!;
    for (let j = i + 1; j < discs.length; j++) {
      const b = discs[j]!;
      if (b.c.cx - b.reach >= a.c.cx + a.reach - tolerance) break;
      if (gaps.has(pairKey(a.id, b.id))) continue;
      if (nearerThan(a.c, b.c, a.reach + b.reach - tolerance)) count++;
    }
  }
  for (const [key, g] of gaps) {
    const [a, b] = JSON.parse(key) as [string, string];
    const ca = first.get(a);
    const cb = first.get(b);
    if (ca !== undefined && cb !== undefined && nearerThan(ca, cb, ca.r + cb.r + g - tolerance)) count++;
  }
  return count;
}

/** This function counts the overlaps by the bounding boxes with their margins. It skips the pairs of `skip` and the pairs of two circles. */
function marginOverlaps(boxes: readonly LayoutBox[], tolerance: number, skip: ReadonlyMap<string, number> | undefined): number {
  const rects: { readonly id: string; readonly r: Rect; readonly circle: boolean }[] = [];
  for (const box of boxes) {
    const r = placedRect(box);
    if (r !== undefined) rects.push({ id: box.id, r: grow(r, box.margin), circle: box.shape?.kind === "circle" });
  }
  rects.sort((a, b) => a.r.x - b.r.x);
  let count = 0;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!.r;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]!.r;
      if (b.x >= a.x + a.w - tolerance) break;
      if (rects[i]!.circle && rects[j]!.circle) continue;
      if (skip !== undefined && skip.has(pairKey(rects[i]!.id, rects[j]!.id))) continue;
      const o = overlapOf(a, b);
      if (o.x > tolerance && o.y > tolerance) count++;
    }
  }
  return count;
}

/** The options of the container test of `countOutside` and `packHard`. */
export interface ContainerTest {
  /**
   * With `true`, a box of a shaped container with the size `fixed` must stay inside the shape, not only inside its bounding box.
   * A circle in a circle container is tested by distance. The default is `true` since 0.4.0. With `false`, only the bounding box counts.
   */
  readonly exactContainer?: boolean;
}

/** This function gives the circle of a circle container. A free size reads its radius from `w`, and the corner of the shape stays. Another container, or a free size without `w`, gives `undefined`. */
function containerCircle(c: LayoutContainer): PlacedCircle | undefined {
  const s = c.shape;
  if (s?.kind !== "circle") return undefined;
  if (c.fixed === "size") return s;
  if (c.w === undefined) return undefined;
  const r = c.w / 2;
  return { cx: s.cx - s.r + r, cy: s.cy - s.r + r, r };
}

/** This function tells if a circle goes out of a circle container. The reach is the center distance, the radius and `extra`. It compares the squares. */
function circleOutside(disc: PlacedCircle, extra: number, ring: PlacedCircle, tolerance: number): boolean {
  const room = ring.r + tolerance - disc.r - extra;
  if (room < 0) return true;
  const dx = disc.cx - ring.cx;
  const dy = disc.cy - ring.cy;
  return dx * dx + dy * dy > room * room;
}

/**
 * This function counts the placed circles that go out of a circle container, by the distance of the centers.
 *
 * - The reach of a circle is the sum of the center distance, the radius, the largest side of the margin and the inset.
 * - A circle breaks the rule when its reach is more than the container radius plus `tolerance`.
 * - A container with a free size reads its radius from `w`, and its center is the corner of the shape plus that radius. `applyPack` writes that `w`.
 * - Each other box does not count. The function throws a `RangeError` for a container that is not a circle.
 */
export function circlesOutside(input: LayoutInput, tolerance: number = DEFAULT_TOLERANCE.overlap): number {
  const c = input.container;
  const ring = c === undefined ? undefined : containerCircle(c);
  if (c === undefined || ring === undefined) throw new RangeError("The function circlesOutside needs a circle container, with w when its size is free.");
  let count = 0;
  for (const box of input.boxes) {
    const disc = placedCircle(box);
    if (disc !== undefined && circleOutside(disc, marginReach(box.margin) + (c.inset ?? 0), ring, tolerance)) count++;
  }
  return count;
}

/** This function gives the length of the part of the segment `ab` inside a circle. A radius of 0 or less gives 0. */
function partInCircle(a: Point, b: Point, cx: number, cy: number, r: number): number {
  if (r <= 0) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - cx;
  const fy = a.y - cy;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return 0;
  const half = fx * dx + fy * dy;
  const inner = half * half - l2 * (fx * fx + fy * fy - r * r);
  if (inner <= 0) return 0;
  const root = Math.sqrt(inner);
  const t0 = Math.max(0, (-half - root) / l2);
  const t1 = Math.min(1, (-half + root) / l2);
  return t1 > t0 ? (t1 - t0) * Math.sqrt(l2) : 0;
}

/** This function gives the length of the part of the segment `ab` inside the open box from (`x0`, `y0`) to (`x1`, `y1`). A box with no inside gives 0. */
function partInBox(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 <= x0 || y1 <= y0) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [from, d, lo, hi] of [[a.x, dx, x0, x1], [a.y, dy, y0, y1]] as const) {
    if (d === 0) {
      if (from <= lo || from >= hi) return 0;
      continue;
    }
    const ta = (lo - from) / d;
    const tb = (hi - from) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return 0;
  }
  return (t1 - t0) * Math.sqrt(dx * dx + dy * dy);
}

/**
 * This function tells if the segment `ab` goes through a placed box, by the rule of `Tolerance.through`.
 * A part of the segment longer than `tolerance` is inside the shape made `tolerance` smaller.
 *
 * - A circle box reads its circle. Each other kind reads its bounding box, so on a polygon or a free shape the answer is an upper bound.
 * - The margin of the box does not count. A box without a position gives `false`.
 */
export function segmentThroughShape(a: Point, b: Point, box: LayoutBox, tolerance: number = DEFAULT_TOLERANCE.through): boolean {
  const disc = placedCircle(box);
  if (disc !== undefined) return partInCircle(a, b, disc.cx, disc.cy, disc.r - tolerance) > tolerance;
  const r = placedRect(box);
  if (r === undefined) return false;
  return partInBox(a, b, r.x + tolerance, r.y + tolerance, r.x + r.w - tolerance, r.y + r.h - tolerance) > tolerance;
}

/** A route between two boxes: the ids of its ends and its points. `countLinksThroughShapes` reads it. */
export interface ShapeLink {
  readonly source: string;
  readonly target: string;
  readonly points: readonly Point[];
}

/**
 * This function counts the routes that go through a placed box that is not one of their two ends, by `segmentThroughShape`.
 * A route counts once, also when it goes through more than one box.
 */
export function countLinksThroughShapes(boxes: readonly LayoutBox[], links: readonly ShapeLink[], tolerance: number = DEFAULT_TOLERANCE.through): number {
  const placed = boxes.flatMap((box) => {
    const r = placedRect(box);
    return r === undefined ? [] : [{ box, r }];
  });
  placed.sort((p, q) => p.r.x - q.r.x);
  const widest = placed.reduce((m, p) => Math.max(m, p.r.w), 0);
  const firstAt = (x: number): number => {
    let lo = 0;
    let hi = placed.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (placed[mid]!.r.x < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let count = 0;
  for (const link of links) {
    let hit = false;
    for (let i = 1; i < link.points.length && !hit; i++) {
      const a = link.points[i - 1]!;
      const b = link.points[i]!;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      for (let k = firstAt(left - widest); k < placed.length && placed[k]!.r.x < right && !hit; k++) {
        const { box, r } = placed[k]!;
        if (r.x + r.w <= left || r.y >= bottom || r.y + r.h <= top) continue;
        if (box.id !== link.source && box.id !== link.target && segmentThroughShape(a, b, box, tolerance)) hit = true;
      }
    }
    if (hit) count++;
  }
  return count;
}

/**
 * This function counts the placed boxes that go out of the container.
 * Each box with its margin must stay inside the container made smaller by `inset`. Only the fixed sides of the size count. A shaped container counts as its bounding box.
 *
 * With `exactContainer`, the default, a box of a shaped container with the size `fixed` also counts when it is not inside the shape, by `rectInRegion`.
 * For that test, the box grows by `inset` and becomes smaller by `tolerance` on each side. A shaped container with a free side keeps the bounding test only.
 * A circle in a circle container does not use `rectInRegion`. It counts by distance, as in `circlesOutside`, also when the size is free.
 * An input without a container gives 0.
 */
export function countOutside(input: LayoutInput, tolerance: number = DEFAULT_TOLERANCE.overlap, options: ContainerTest = {}): number {
  const c = input.container;
  if (c === undefined) return 0;
  const exact = options.exactContainer !== false;
  const shape = exact && c.fixed === "size" ? c.shape : undefined;
  const ring = exact ? containerCircle(c) : undefined;
  const area = c.shape === undefined ? { x: 0, y: 0, w: c.w ?? Infinity, h: c.h ?? Infinity } : boundsOf(c.shape);
  const inset = c.inset ?? 0;
  const fixW = c.fixed === "size" || c.fixed === "width";
  const fixH = c.fixed === "size" || c.fixed === "height";
  let count = 0;
  for (const box of input.boxes) {
    const r0 = placedRect(box);
    if (r0 === undefined) continue;
    const r = grow(r0, box.margin);
    const outX = r.x < area.x + inset - tolerance || r.x + r.w > area.x + area.w - inset + tolerance;
    const outY = r.y < area.y + inset - tolerance || r.y + r.h > area.y + area.h - inset + tolerance;
    const disc = ring === undefined ? undefined : placedCircle(box);
    if ((fixW && outX) || (fixH && outY)) count++;
    else if (ring !== undefined && disc !== undefined) {
      if (circleOutside(disc, marginReach(box.margin) + inset, ring, tolerance)) count++;
    } else if (shape !== undefined && !rectInRegion(shape, shrink(grow(r, inset), tolerance))) count++;
  }
  return count;
}

/** This function counts the fixed ports that are not on the border of their box, with the epsilon of a written file. A port without a side does not count. */
export function countPortsOffBorder(boxes: readonly LayoutBox[], eps: number = RECORD_EPS): number {
  let count = 0;
  for (const box of boxes) {
    for (const p of box.ports ?? []) {
      if (p.x === undefined || p.y === undefined || p.side === undefined) continue;
      const along = p.side === "top" || p.side === "bottom" ? p.x : p.y;
      const length = p.side === "top" || p.side === "bottom" ? box.w : box.h;
      const across = { top: p.y, bottom: p.y - box.h, left: p.x, right: p.x - box.w }[p.side];
      if (Math.abs(across) > eps || along < -eps || along > length + eps) count++;
    }
  }
  return count;
}

/** The count of the breaks of each hard rule of a pack. */
export interface PackHard {
  readonly "no-overlap": number;
  readonly "in-container": number;
  readonly "locked-kept": number;
  readonly complete: number;
  /**
   * The count of the placements whose size is not in the bounds of their box (`countResizeBreaks`).
   * `packHard` gives it only when a box of the input has `resize` or a placement has `w` or `h`. Thus the counts of the other inputs do not change.
   */
  readonly "size-kept"?: number;
}

/**
 * The hard rules of a pack, with the shape kinds that each rule supports.
 * `no-overlap` and `in-container` are exact for a `rect` and a `circle`. `limit` tells the inputs where the count of a circle is only safe (roadmap item L107).
 * For the other kinds, these rules test the bounding box. The count is safe: a shape is inside its bounding box, so the count is an upper bound. A count of 0 tells that the rule has no break.
 * `locked-kept` and `complete` read only the positions and the ids, so they support each kind.
 */
export const PACK_HARD_RULES: readonly ShapeSupport<keyof PackHard>[] = /* @__PURE__ */ Object.freeze([
  {
    id: "no-overlap",
    shapes: ["rect", "circle"],
    safe: ["polygon", "free"],
    limit: { reads: "neighbours", because: "A circle beside another shape kind or an obstacle counts by its bounding box.", until: "2026-11-28" },
  },
  {
    id: "in-container",
    shapes: ["rect", "circle"],
    safe: ["polygon", "free"],
    limit: { reads: "container", because: "A circle in a polygon or an ellipse container counts by its bounding box.", until: "2026-11-28" },
  },
  { id: "locked-kept", shapes: SHAPE_KIND_IDS },
  { id: "complete", shapes: SHAPE_KIND_IDS },
] as const);

/** This function tells if the inside of `region` and the inside of `rect` have a common point. */
export function regionHitsRect(region: Region, rect: Rect): boolean {
  if (rect.w <= 0 || rect.h <= 0) return false;
  switch (region.kind) {
    case "rect": {
      const o = overlapOf(region, rect);
      return o.x > 0 && o.y > 0;
    }
    case "circle":
      return circleHitsRect(region.cx, region.cy, region.r, region.r, rect);
    case "ellipse":
      return circleHitsRect(region.cx, region.cy, region.rx, region.ry, rect);
    case "polygon": {
      const rings = [region.points, ...(region.holes ?? [])];
      const inside = (x: number, y: number): boolean => x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
      if (region.points.some(([x, y]) => inside(x, y))) return true;
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const m = clipMid(a[0], a[1], b[0], b[1], rect);
          if (m !== undefined && inside(m[0], m[1])) return true;
        }
      }
      return pointInRings(rect.x + rect.w / 2, rect.y + rect.h / 2, rings);
    }
  }
}

/**
 * This function tells if all of `rect` is inside `region`. A point on the border counts as inside. No part of `rect` can overlap a hole.
 * The test of a circle, an ellipse or a polygon accepts an error of `EPS` on the border. A polygon can be concave.
 */
export function rectInRegion(region: Region, rect: Rect): boolean {
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  const corners: readonly (readonly [number, number])[] = [
    [rect.x, rect.y],
    [x1, rect.y],
    [x1, y1],
    [rect.x, y1],
  ];
  switch (region.kind) {
    case "rect":
      return rect.x >= region.x && rect.y >= region.y && x1 <= region.x + region.w && y1 <= region.y + region.h;
    case "circle":
      return corners.every(([x, y]) => inEllipse(region.cx, region.cy, region.r, region.r, x, y));
    case "ellipse":
      return corners.every(([x, y]) => inEllipse(region.cx, region.cy, region.rx, region.ry, x, y));
    case "polygon": {
      const ring = region.points;
      if (ring.length < 3) return false;
      const points = [...corners, [rect.x + rect.w / 2, rect.y + rect.h / 2] as const];
      if (!points.every(([x, y]) => onRing(x, y, ring) || pointInRings(x, y, [ring]))) return false;
      const deep = (x: number, y: number): boolean => x > rect.x + EPS && x < x1 - EPS && y > rect.y + EPS && y < y1 - EPS;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const m = clipMid(a[0], a[1], b[0], b[1], rect);
        if (m !== undefined && deep(m[0], m[1])) return false;
      }
      return (region.holes ?? []).every((hole) => !regionHitsRect({ kind: "polygon", points: hole }, rect));
    }
  }
}

/** This function gives the rectangle made smaller by `d` on each side. A side does not become smaller than 0. */
function shrink(r: Rect, d: number): Rect {
  const dx = Math.min(d, r.w / 2);
  const dy = Math.min(d, r.h / 2);
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy };
}

/** This function tells if a point is inside an ellipse or on its border, with an error of `EPS`. */
function inEllipse(cx: number, cy: number, rx: number, ry: number, x: number, y: number): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;
  return u * u + v * v <= 1 + EPS;
}

/** This function tells if a point is on a ring of a polygon, with an error of `EPS`. */
function onRing(x: number, y: number, ring: readonly (readonly [number, number])[]): boolean {
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= EPS) return true;
  }
  return false;
}

/** An ellipse with the radii `rx` and `ry` scales to a unit circle. The rectangle scales with it. */
function circleHitsRect(cx: number, cy: number, rx: number, ry: number, rect: Rect): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const x0 = (rect.x - cx) / rx;
  const x1 = (rect.x + rect.w - cx) / rx;
  const y0 = (rect.y - cy) / ry;
  const y1 = (rect.y + rect.h - cy) / ry;
  const dx = Math.max(x0, 0, -x1);
  const dy = Math.max(y0, 0, -y1);
  return dx * dx + dy * dy < 1;
}

/** This function gives the middle of the part of a segment inside a rectangle, or `undefined` when that part is a point or empty. */
function clipMid(ax: number, ay: number, bx: number, by: number, r: Rect): readonly [number, number] | undefined {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, ax - r.x],
    [dx, r.x + r.w - ax],
    [-dy, ay - r.y],
    [dy, r.y + r.h - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined;
    } else if (p < 0) {
      t0 = Math.max(t0, q / p);
    } else {
      t1 = Math.min(t1, q / p);
    }
  }
  if (t1 <= t0) return undefined;
  const t = (t0 + t1) / 2;
  return [ax + t * dx, ay + t * dy];
}

/** The even-odd rule over the outer ring and the holes. */
function pointInRings(x: number, y: number, rings: readonly (readonly (readonly [number, number])[])[]): boolean {
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
 * This function counts the pairs of a placed box and an obstacle that overlap by more than `tolerance`.
 * The box counts with its margin. A box with a shape counts as its bounding box.
 */
export function countObstacleHits(
  boxes: readonly LayoutBox[],
  obstacles: readonly Obstacle[] | undefined,
  tolerance: number = DEFAULT_TOLERANCE.overlap,
): number {
  if (obstacles === undefined || obstacles.length === 0) return 0;
  let count = 0;
  for (const box of boxes) {
    const r0 = placedRect(box);
    if (r0 === undefined) continue;
    const r = grow(r0, box.margin);
    const small = { x: r.x + tolerance, y: r.y + tolerance, w: r.w - 2 * tolerance, h: r.h - 2 * tolerance };
    for (const o of obstacles) if (regionHitsRect(o.region, small)) count++;
  }
  return count;
}

/**
 * This function gives the count of the placements whose size is not in the bounds of their box (`sizeFits`).
 * The bounds are in the axes of the placed box: a turned box has the turned bounds. A placement without `w` or `h` keeps that size of the box.
 * A placement of an id that is not in the input does not count.
 */
export function countResizeBreaks(input: LayoutInput, output: PackOutput): number {
  const was = new Map(input.boxes.map((b) => [b.id, b]));
  let count = 0;
  for (const p of output.placements) {
    if (p.w === undefined && p.h === undefined) continue;
    const box = was.get(p.id);
    if (box === undefined) continue;
    const placed = p.turn === 90 ? turnBox(box) : box;
    if (!sizeFits(placed, p.w ?? placed.w, p.h ?? placed.h)) count++;
  }
  return count;
}

/**
 * This function gives the count of each hard rule of the output of a packer.
 * It applies the output with `applyPack`. Only the placed boxes and the locked boxes count for the overlaps and the container.
 * `no-overlap` counts the pairs of boxes and the pairs of a box and an obstacle. A pair of `pairGaps` uses its gap in place of the margins. `HARD_RULE_VERSION` tells the version of these counts.
 *
 * A locked box without a placement, or with a move of more than `RECORD_EPS`, breaks `locked-kept`.
 * A locked box without a position in the input is a bad input, not a break. `checkInput` finds it.
 * Another box without a placement that is not in `overflow` breaks `complete`.
 * `size-kept` is in the result only when a box has `resize` or a placement has `w` or `h` (`countResizeBreaks`).
 *
 * `options` goes to `countOutside` for `in-container`.
 */
export function packHard(input: LayoutInput, output: PackOutput, tolerance: number = DEFAULT_TOLERANCE.overlap, options: ContainerTest = {}): PackHard {
  const after = applyPack(input, output);
  const placed = new Set(output.placements.map((p) => p.id));
  const out = new Set(output.overflow);
  const was = new Map(input.boxes.map((b) => [b.id, b]));
  let lockedMoved = 0;
  let incomplete = 0;
  const kept: LayoutBox[] = [];
  for (const box of after.boxes) {
    const old = was.get(box.id);
    if (old?.locked === true) {
      if (old.x === undefined || old.y === undefined) continue;
      const moved = Math.abs(old.x - (box.x ?? old.x)) > RECORD_EPS || Math.abs(old.y - (box.y ?? old.y)) > RECORD_EPS;
      if (!placed.has(box.id) || moved) lockedMoved++;
      kept.push(box);
    } else if (placed.has(box.id)) {
      kept.push(box);
    } else if (!out.has(box.id)) {
      incomplete++;
    }
  }
  return {
    "no-overlap": countOverlaps(kept, tolerance, input.pairGaps) + countObstacleHits(kept, after.obstacles, tolerance),
    "in-container": countOutside({ ...after, boxes: kept }, tolerance, options),
    "locked-kept": lockedMoved,
    complete: incomplete,
    ...(resizes(input, output) ? { "size-kept": countResizeBreaks(input, output) } : {}),
  };
}

/** This function tells if a box of the input has `resize` or a placement of the output has `w` or `h`. */
function resizes(input: LayoutInput, output: PackOutput): boolean {
  return input.boxes.some((b) => b.resize !== undefined) || output.placements.some((p) => p.w !== undefined || p.h !== undefined);
}

/**
 * This function gives the problems of an input file. An empty list tells that the file is good.
 * A problem is a bad input, not a break of a hard rule. Thus an engine refuses the input.
 * In `pairGaps`, an unknown box, a pair of one box, a repeated pair in either order, a bad `gap` and bad `lanes` are problems.
 * A port with `along` and no `side`, with `x` or `y`, or with a value outside [0, 1] is a problem.
 *
 * A bad `resize` is a problem (`resizeProblems`).
 */
export function checkInput(input: LayoutInput): readonly string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const box of input.boxes) {
    if (ids.has(box.id)) problems.push(`box ${box.id}: the id is not unique`);
    ids.add(box.id);
    if (!(box.w > 0 && box.h > 0 && Number.isFinite(box.w) && Number.isFinite(box.h))) problems.push(`box ${box.id}: the size is not positive and finite`);
    if (box.locked === true && (box.x === undefined || box.y === undefined)) problems.push(`box ${box.id}: a locked box has no position`);
    const shape = shapeKindProblem(box);
    if (shape !== undefined) problems.push(shape);
    for (const port of box.ports ?? []) problems.push(...alongProblems(box.id, port));
    problems.push(...resizeProblems(box));
  }
  if (countPortsOffBorder(input.boxes) > 0) problems.push("a fixed port is not on the border of its box");
  for (const edge of input.edges ?? []) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) problems.push(`edge ${edge.id}: a box of the edge is not in the input`);
  }
  problems.push(...pairGapProblems(input.pairGaps, ids));
  return problems;
}

/** This function gives the problems of the `along` of a port: no side, a value outside [0, 1], or `x` or `y` with it. A port without `along` has no problem. */
function alongProblems(boxId: string, port: Port): string[] {
  if (port.along === undefined) return [];
  const at = `box ${boxId} port ${port.id}`;
  const problems: string[] = [];
  if (port.side === undefined) problems.push(`${at}: a port with along has no side`);
  if (typeof port.along !== "number" || !Number.isFinite(port.along) || port.along < 0 || port.along > 1)
    problems.push(`${at}: the along value ${String(port.along)} is not a finite number from 0 to 1`);
  if (port.x !== undefined || port.y !== undefined) problems.push(`${at}: a port with along also has x or y`);
  return problems;
}

/** This function gives the problems of the `pairGaps` of an input. `ids` has the ids of the boxes. */
function pairGapProblems(pairGaps: LayoutInput["pairGaps"], ids: ReadonlySet<string>): string[] {
  if (pairGaps === undefined) return [];
  if (!Array.isArray(pairGaps)) return ["pairGaps: the value is not a list"];
  const problems: string[] = [];
  const seen = new Map<string, number>();
  pairGaps.forEach((p: PairGap, i) => {
    const at = `pair gap ${i} (${String(p?.a)}, ${String(p?.b)})`;
    if (typeof p !== "object" || p === null || typeof p.a !== "string" || typeof p.b !== "string") {
      problems.push(`pair gap ${i}: the entry has no string ids a and b`);
      return;
    }
    for (const id of [p.a, p.b]) if (!ids.has(id)) problems.push(`${at}: the box ${id} is not in the input`);
    if (p.a === p.b) problems.push(`${at}: the two ids are the same box`);
    if (typeof p.gap !== "number" || !Number.isFinite(p.gap) || p.gap < 0) problems.push(`${at}: the gap ${String(p.gap)} is not a finite number of 0 or more`);
    if (p.lanes !== undefined && (typeof p.lanes !== "number" || !Number.isInteger(p.lanes) || p.lanes < 0))
      problems.push(`${at}: the lanes value ${String(p.lanes)} is not a whole number of 0 or more`);
    const key = JSON.stringify(p.a < p.b ? [p.a, p.b] : [p.b, p.a]);
    const first = seen.get(key);
    if (first !== undefined) problems.push(`${at}: the pair is also pair gap ${first}`);
    else seen.set(key, i);
  });
  return problems;
}
