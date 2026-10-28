// The joint measures of `docs/JOINT-MEASURES.md`. They score a pack and a route of one input together.
import { marginSides, type LayoutBox, type LayoutEdge } from "@mark1russell7/layout-contract";

/** A point of a route. */
export interface JointPoint {
  readonly x: number;
  readonly y: number;
}

/** The route of one edge: a polyline in the coordinates of the board. */
export interface JointRoute {
  readonly edge: string;
  readonly points: readonly JointPoint[];
}

/** A rectangle with its top-left corner, its width and its height. */
export interface JointRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The facts of the placement alone. The routes do not change them. Thus a runner calculates them one time for each pack. */
export interface PlacementFacts {
  /** The value `S`: the square root of the sum of the areas of the boxes. */
  readonly scale: number;
  /** The sum of the areas of the placed boxes. */
  readonly area: number;
  /** The bounding box of the placed boxes with their margins, or `undefined` without boxes. */
  readonly bounds: JointRect | undefined;
  /** The Manhattan length of the straight segment of each edge, by the edge id. */
  readonly straight: ReadonlyMap<string, number>;
  /** The value of `joint.straight.crossings`. */
  readonly crossings: number;
}

/** A placed box: a box with its position. */
type Placed = LayoutBox & { readonly x: number; readonly y: number };

/** This function tells if a box has a position. */
function isPlaced(box: LayoutBox): box is Placed {
  return box.x !== undefined && box.y !== undefined;
}

/** This function gives the bounding box of rectangles, or `undefined` for an empty list. */
export function rectHull(rects: readonly JointRect[]): JointRect | undefined {
  if (rects.length === 0) return undefined;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.w);
    bottom = Math.max(bottom, r.y + r.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** This function gives the box with its margin. */
function withMargin(box: Placed): JointRect {
  const m = marginSides(box.margin);
  return { x: box.x - m.left, y: box.y - m.top, w: box.w + m.left + m.right, h: box.h + m.top + m.bottom };
}

/** This function gives the sign of the turn from `a` to `b` to `c`: 1, -1, or 0 for three points on one line. */
function turn(a: JointPoint, b: JointPoint, c: JointPoint): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0;
}

/** This function tells if two segments cross at one point inside the two segments. A touch at an end and a collinear overlap do not count. */
export function segmentsCross(a: JointPoint, b: JointPoint, c: JointPoint, d: JointPoint): boolean {
  const t1 = turn(a, b, c);
  const t2 = turn(a, b, d);
  const t3 = turn(c, d, a);
  const t4 = turn(c, d, b);
  return t1 * t2 < 0 && t3 * t4 < 0;
}

/**
 * This function gives the facts of a placement. The straight segment of an edge goes from the center of its source box to the center of its target box.
 * An edge with an end that has no position does not count. Two edges with a shared end box do not cross.
 */
export function placementFacts(boxes: readonly LayoutBox[], edges: readonly LayoutEdge[]): PlacementFacts {
  const placed = boxes.filter(isPlaced);
  const area = placed.reduce((sum, b) => sum + b.w * b.h, 0);
  const center = new Map(placed.map((b) => [b.id, { x: b.x + b.w / 2, y: b.y + b.h / 2 }]));
  const segments: { readonly edge: LayoutEdge; readonly a: JointPoint; readonly b: JointPoint }[] = [];
  const straight = new Map<string, number>();
  for (const edge of edges) {
    const a = center.get(edge.source);
    const b = center.get(edge.target);
    if (a === undefined || b === undefined) continue;
    segments.push({ edge, a, b });
    straight.set(edge.id, Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
  }
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    for (let j = i + 1; j < segments.length; j++) {
      const t = segments[j]!;
      const shared = s.edge.source === t.edge.source || s.edge.source === t.edge.target || s.edge.target === t.edge.source || s.edge.target === t.edge.target;
      if (!shared && segmentsCross(s.a, s.b, t.a, t.b)) crossings += 1;
    }
  }
  return { scale: Math.sqrt(area), area, bounds: rectHull(placed.map(withMargin)), straight, crossings };
}

/** This function gives the length of a polyline. */
export function polylineLength(points: readonly JointPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return sum;
}

/** This function gives the length of the part of the segment from `a` to `b` inside the rectangle `r`. It clips the segment by the method of Liang and Barsky. */
export function insideLength(a: JointPoint, b: JointPoint, r: JointRect): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let lo = 0;
  let hi = 1;
  const sides: readonly (readonly [number, number])[] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return 0;
  }
  return (hi - lo) * Math.hypot(dx, dy);
}

/** This function gives the ranks of values, from 1. Equal values get the mean of their ranks. */
function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
  const out: number[] = Array.from({ length: values.length }, () => 0);
  for (let s = 0; s < order.length; ) {
    let e = s;
    while (e + 1 < order.length && order[e + 1]!.v === order[s]!.v) e += 1;
    const rank = (s + e) / 2 + 1;
    for (let k = s; k <= e; k++) out[order[k]!.i] = rank;
    s = e + 1;
  }
  return out;
}

/** This function gives the Spearman rank correlation of two lists of one length. It gives `undefined` when a list has no spread or fewer than 2 values. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | undefined {
  if (xs.length !== ys.length || xs.length < 2) return undefined;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mean = (xs.length + 1) / 2;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < rx.length; i++) {
    sxy += (rx[i]! - mean) * (ry[i]! - mean);
    sxx += (rx[i]! - mean) ** 2;
    syy += (ry[i]! - mean) ** 2;
  }
  if (sxx === 0 || syy === 0) return undefined;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * This function gives the `joint.*` measures of one pack and one route, without the time.
 * An input without edges has no `joint.straight.*`, `joint.spill` or `joint.proxy.rank` values.
 * A board without boxes has `joint.fill` 1 and `joint.aspectError` 0, as `pack.fill` and `pack.aspectError` of `packing`.
 */
export function jointMeasures(facts: PlacementFacts, routes: readonly JointRoute[], edgeCount: number, targetAspect = 1): Record<string, number> {
  const points = routes.flatMap((r) => r.points);
  const pointBox = points.length === 0 ? [] : [{ ...rectHull(points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))! }];
  const hull = rectHull([...(facts.bounds === undefined ? [] : [facts.bounds]), ...pointBox]);
  const out: Record<string, number> = {};
  const hullArea = hull === undefined ? 0 : hull.w * hull.h;
  out["joint.fill"] = facts.area > 0 && hullArea > 0 ? facts.area / hullArea : 1;
  out["joint.aspectError"] = hull !== undefined && hull.w > 0 && hull.h > 0 ? Math.abs(Math.log(hull.w / hull.h) - Math.log(targetAspect)) : 0;
  if (edgeCount === 0 || facts.straight.size === 0) return out;

  let total = 0;
  let inside = 0;
  const routeLength = new Map<string, number>();
  for (const r of routes) {
    const length = polylineLength(r.points);
    routeLength.set(r.edge, length);
    total += length;
    if (facts.bounds !== undefined) for (let i = 1; i < r.points.length; i++) inside += insideLength(r.points[i - 1]!, r.points[i]!, facts.bounds);
  }
  out["joint.spill"] = total > 0 ? Math.max(0, total - inside) / total : 0;
  out["joint.straight.crossings"] = facts.crossings;
  const straightSum = [...facts.straight.values()].reduce((s, v) => s + v, 0);
  out["joint.straight.length"] = facts.scale > 0 ? straightSum / facts.scale / facts.straight.size : 0;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [edge, s] of facts.straight) {
    const l = routeLength.get(edge);
    if (l === undefined) continue;
    xs.push(s);
    ys.push(l);
  }
  const rank = spearman(xs, ys);
  if (rank !== undefined) out["joint.proxy.rank"] = rank;
  return out;
}
