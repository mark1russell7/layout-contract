// The paths of a picture (`docs/PICTURE.md`): a path is a list of segments that each renderer draws in the same way.
// The record came from the curve model of `highways`, so a curve of `highways` is a path with no change.
import type { Point, Rect } from "./geometry.ts";

/** The kinds of the segments of a path. */
export const PATH_KINDS = ["move", "line", "cubic", "arc"] as const;

/** The start of a path: the pen goes to `to` and draws nothing. */
export interface PathMove {
  readonly kind: "move";
  readonly to: Point;
}

/** A straight line from the end of the segment before to `to`. */
export interface PathLine {
  readonly kind: "line";
  readonly to: Point;
}

/** A cubic Bezier curve from the end of the segment before to `to`, with the control points `c1` and `c2`. */
export interface PathCubic {
  readonly kind: "cubic";
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/**
 * A circular arc from the end of the segment before to `to`. The arc has its center at `center` and the radius `radius`.
 * It starts at the angle `start` and turns by `sweep` radians. A positive `sweep` turns from the x axis to the y axis.
 * On a canvas, `ctx.arc(center.x, center.y, radius, start, start + sweep, sweep < 0)` draws it.
 */
export interface PathArc {
  readonly kind: "arc";
  readonly center: Point;
  readonly radius: number;
  readonly start: number;
  readonly sweep: number;
  readonly to: Point;
}

/**
 * A segment of a path. A path is a list of segments: one `move` first, then lines, cubic curves and arcs.
 * A renderer maps the list to SVG path data, to canvas commands or to the vertices of a mesh.
 */
export type PathSegment = PathMove | PathLine | PathCubic | PathArc;

/** A point of a path, with the direction of the path at that point. */
export interface PathTangent {
  readonly point: Point;
  /** A unit vector along the path, in the direction from its start to its end. A path with no length gives the vector 0, 0. */
  readonly direction: Point;
}

/** The largest number of points that `samplePath` gives for one segment. */
const MAX_STEPS = 1024;

/** This function gives the path of a polyline: a `move` to the first point, then a line to each next point. A list with no point gives an empty path. */
export function pathOf(points: readonly Point[]): PathSegment[] {
  return points.map((to, i) => (i === 0 ? { kind: "move", to } : { kind: "line", to }));
}

/**
 * This function gives a polyline that follows the path. The distance from each part of the path to the polyline is `tolerance` or less.
 * The polyline starts at the point of the `move` and goes through the end of each segment.
 * Hit tests, measures and renderers that draw only lines use this polyline.
 */
export function samplePath(segments: readonly PathSegment[], tolerance = 0.5): Point[] {
  const tol = Math.max(1e-6, tolerance);
  const out: Point[] = [];
  let at: Point | undefined;
  for (const s of segments) {
    if (s.kind === "move" || at === undefined) {
      out.push(s.to);
      at = s.to;
      continue;
    }
    if (s.kind === "cubic") {
      // The chord of a step of 1/n of the parameter is within 3·D/(4·n²) of the curve. D is the largest second difference of the control points.
      const d = Math.max(Math.hypot(at.x - 2 * s.c1.x + s.c2.x, at.y - 2 * s.c1.y + s.c2.y), Math.hypot(s.c1.x - 2 * s.c2.x + s.to.x, s.c1.y - 2 * s.c2.y + s.to.y));
      const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.sqrt((3 * d) / (4 * tol)))));
      for (let k = 1; k < n; k++) out.push(cubicAt(at, s.c1, s.c2, s.to, k / n));
    } else if (s.kind === "arc") {
      // The chord of an angle φ is within r·(1 - cos(φ/2)) of the arc.
      const step = s.radius <= tol ? Math.PI : 2 * Math.acos(1 - tol / s.radius);
      const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.abs(s.sweep) / step)));
      for (let k = 1; k < n; k++) {
        const a = s.start + (s.sweep * k) / n;
        out.push({ x: s.center.x + s.radius * Math.cos(a), y: s.center.y + s.radius * Math.sin(a) });
      }
    }
    out.push(s.to);
    at = s.to;
  }
  return out;
}

/** This function gives the point at the parameter `t` of the cubic Bezier curve with the control points `p0`, `p1`, `p2` and `p3`. */
export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/**
 * This function writes the segments as the data of an SVG path: the commands `M`, `L`, `C` and `A`.
 * Each number has at most `digits` digits after the point.
 */
export function toSvgPath(segments: readonly PathSegment[], digits = 2): string {
  const n = (v: number): string => {
    const s = String(Number(v.toFixed(digits)));
    return s === "-0" ? "0" : s;
  };
  const p = (q: Point): string => `${n(q.x)} ${n(q.y)}`;
  const parts: string[] = [];
  for (const s of segments) {
    if (s.kind === "move") parts.push(`M ${p(s.to)}`);
    else if (s.kind === "line") parts.push(`L ${p(s.to)}`);
    else if (s.kind === "cubic") parts.push(`C ${p(s.c1)} ${p(s.c2)} ${p(s.to)}`);
    else parts.push(`A ${n(s.radius)} ${n(s.radius)} 0 ${Math.abs(s.sweep) > Math.PI ? 1 : 0} ${s.sweep > 0 ? 1 : 0} ${p(s.to)}`);
  }
  return parts.join(" ");
}

/** This function gives the parameters between 0 and 1 where `a·t² + b·t + c` is 0. The stable form of the roots keeps a small `a` correct. */
function unitRoots(a: number, b: number, c: number): number[] {
  const inside = (t: number): boolean => t > 0 && t < 1;
  if (a === 0) return b !== 0 && inside(-c / b) ? [-c / b] : [];
  const disc = b * b - 4 * a * c;
  if (!(disc >= 0)) return [];
  const q = -(b + (b < 0 ? -1 : 1) * Math.sqrt(disc)) / 2;
  const roots = q === 0 ? [0] : [q / a, c / q];
  return roots.filter(inside);
}

/**
 * This function gives the exact bounding box of a path. The box of a cubic curve has the points where the curve turns back on an axis.
 * The box of an arc has the points of its circle at each quarter turn that the arc goes through.
 * A path with no segment gives a `RangeError`.
 */
export function pathBounds(segments: readonly PathSegment[]): Rect {
  if (segments.length === 0) throw new RangeError("layout-path: a path with no segment has no bounds.");
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Point): void => {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };
  let at: Point | undefined;
  for (const s of segments) {
    add(s.to);
    const from = at;
    at = s.to;
    if (from === undefined) continue;
    if (s.kind === "cubic") {
      // The derivative of the curve on one axis is 3·(a·t² + b·t + c).
      for (const k of ["x", "y"] as const) {
        const a = s.to[k] - 3 * s.c2[k] + 3 * s.c1[k] - from[k];
        const b = 2 * (s.c2[k] - 2 * s.c1[k] + from[k]);
        const c = s.c1[k] - from[k];
        for (const t of unitRoots(a, b, c)) add(cubicAt(from, s.c1, s.c2, s.to, t));
      }
    } else if (s.kind === "arc") {
      const quarter = Math.PI / 2;
      const lo = Math.min(s.start, s.start + s.sweep);
      const hi = Math.max(s.start, s.start + s.sweep);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
      const first = hi - lo >= 2 * Math.PI ? 0 : Math.ceil(lo / quarter);
      const last = hi - lo >= 2 * Math.PI ? 3 : Math.floor(hi / quarter);
      for (let k = first; k <= last; k++) {
        // The unit vector of the angle k·π/2 has whole numbers, so the box has no error of a cosine.
        const turn = ((k % 4) + 4) % 4;
        const ux = turn === 0 ? 1 : turn === 2 ? -1 : 0;
        const uy = turn === 1 ? 1 : turn === 3 ? -1 : 0;
        add({ x: s.center.x + s.radius * ux, y: s.center.y + s.radius * uy });
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** This function gives the unit vector of the vector `dx`, `dy`, or `undefined` for a vector with no length. */
function unit(dx: number, dy: number): Point | undefined {
  const length = Math.hypot(dx, dy);
  return length > 0 && Number.isFinite(length) ? { x: dx / length, y: dy / length } : undefined;
}

/**
 * This function gives the direction of one segment at its start or at its end. `from` is the end of the segment before.
 * A segment with no length gives `undefined`. A cubic curve with a control point on its end uses the next control point.
 */
function directionOf(from: Point, s: PathSegment, atEnd: boolean): Point | undefined {
  if (s.kind === "move") return undefined;
  const chord = (): Point | undefined => unit(s.to.x - from.x, s.to.y - from.y);
  if (s.kind === "cubic") {
    return atEnd
      ? (unit(s.to.x - s.c2.x, s.to.y - s.c2.y) ?? unit(s.to.x - s.c1.x, s.to.y - s.c1.y) ?? chord())
      : (unit(s.c1.x - from.x, s.c1.y - from.y) ?? unit(s.c2.x - from.x, s.c2.y - from.y) ?? chord());
  }
  if (s.kind === "arc" && s.radius > 0 && s.sweep !== 0) {
    const angle = atEnd ? s.start + s.sweep : s.start;
    const sign = s.sweep > 0 ? 1 : -1;
    return unit(-sign * Math.sin(angle), sign * Math.cos(angle));
  }
  return chord();
}

/**
 * This function gives the first point of a path and the direction in which the path leaves it.
 * The direction comes from the first segment that has a length. A path with no segment gives a `RangeError`.
 */
export function pathStart(segments: readonly PathSegment[]): PathTangent {
  const first = segments[0];
  if (first === undefined) throw new RangeError("layout-path: a path with no segment has no start.");
  for (let i = 1; i < segments.length; i++) {
    const direction = directionOf(segments[i - 1]!.to, segments[i]!, false);
    if (direction !== undefined) return { point: first.to, direction };
  }
  return { point: first.to, direction: { x: 0, y: 0 } };
}

/**
 * This function gives the last point of a path and the direction in which the path comes to it. An arrow head at the end points along it.
 * The direction comes from the last segment that has a length. A path with no segment gives a `RangeError`.
 */
export function pathEnd(segments: readonly PathSegment[]): PathTangent {
  const last = segments[segments.length - 1];
  if (last === undefined) throw new RangeError("layout-path: a path with no segment has no end.");
  for (let i = segments.length - 1; i >= 1; i--) {
    const direction = directionOf(segments[i - 1]!.to, segments[i]!, true);
    if (direction !== undefined) return { point: last.to, direction };
  }
  return { point: last.to, direction: { x: 0, y: 0 } };
}

const isFields = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isPoint = (v: unknown): v is Point => isFields(v) && Number.isFinite(v["x"]) && Number.isFinite(v["y"]);

/** The fields of each kind of segment that hold a point. */
const POINT_FIELDS = { move: ["to"], line: ["to"], cubic: ["c1", "c2", "to"], arc: ["center", "to"] } as const;

/**
 * This function gives the problems of a path. An empty list means a good path.
 * A good path starts with its one `move`, and each number of it is finite. An arc has a radius of 0 or more.
 * An arc starts at the end of the segment before, and it ends at its `to`, to 1e-6 of its radius plus 1.
 */
export function checkPath(value: unknown): string[] {
  if (!Array.isArray(value)) return ["the path is not a list"];
  if (value.length === 0) return ["the path has no segment"];
  const out: string[] = [];
  let at: Point | undefined;
  value.forEach((s: unknown, i) => {
    const from = at;
    at = undefined;
    if (!isFields(s)) {
      out.push(`segment ${i} is not an object`);
      return;
    }
    const kind = PATH_KINDS.find((k) => k === s["kind"]);
    if (kind === undefined) {
      out.push(`segment ${i}: the kind is not one of ${PATH_KINDS.join(", ")}`);
      return;
    }
    if (i === 0 && kind !== "move") out.push("segment 0 is not a move");
    if (i > 0 && kind === "move") out.push(`segment ${i} is a second move`);
    let good = true;
    for (const key of POINT_FIELDS[kind]) {
      if (isPoint(s[key])) continue;
      out.push(`segment ${i}: ${key} is not a point of two finite numbers`);
      good = false;
    }
    const to = s["to"];
    if (isPoint(to)) at = to;
    if (kind !== "arc") return;
    for (const key of ["radius", "start", "sweep"] as const) {
      if (Number.isFinite(s[key])) continue;
      out.push(`segment ${i}: ${key} is not a finite number`);
      good = false;
    }
    if (!good) return;
    const arc = s as unknown as PathArc;
    if (arc.radius < 0) {
      out.push(`segment ${i}: the radius is less than 0`);
      return;
    }
    const slack = 1e-6 * (arc.radius + 1);
    const on = (angle: number, p: Point): boolean => Math.hypot(arc.center.x + arc.radius * Math.cos(angle) - p.x, arc.center.y + arc.radius * Math.sin(angle) - p.y) <= slack;
    if (from !== undefined && !on(arc.start, from)) out.push(`segment ${i}: the arc does not start at the end of the segment before`);
    if (!on(arc.start + arc.sweep, arc.to)) out.push(`segment ${i}: the arc does not end at its point to`);
  });
  return out;
}
