import { boundsOf, grow, overlapOf, type Rect, type Region } from "./geometry.ts";
import type { LayoutBox, LayoutInput, Obstacle, PairGap, Port } from "./input.ts";
import { applyPack, type PackOutput } from "./output.ts";
import { SHAPE_KIND_IDS, shapeKindProblem, type ShapeSupport } from "./shapes.ts";
import { DEFAULT_TOLERANCE, EPS, RECORD_EPS } from "./tolerance.ts";

/** This function gives the area of a placed box: its shape or its rectangle, at its position. A box without a position gives `undefined`. */
export function placedRect(box: LayoutBox): Rect | undefined {
  if (box.x === undefined || box.y === undefined) return undefined;
  if (box.shape === undefined) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const b = boundsOf(box.shape);
  return { x: box.x + b.x, y: box.y + b.y, w: b.w, h: b.h };
}

/**
 * This function counts the pairs of placed boxes whose insides, with their margins, overlap by more than `tolerance` on each axis.
 * A box with a shape counts as its bounding box. That area is larger, thus the count is safe.
 *
 * A pair of `pairGaps`, in either order, uses its `gap` in place of the two margins. One box grows by the gap, and the other box does not grow.
 * Thus the pair breaks the rule only when the boxes are nearer than the gap on each axis. The other pairs do not change.
 */
export function countOverlaps(boxes: readonly LayoutBox[], tolerance: number = DEFAULT_TOLERANCE.overlap, pairGaps?: readonly PairGap[]): number {
  if (pairGaps === undefined || pairGaps.length === 0) return marginOverlaps(boxes, tolerance, undefined);
  const gaps = new Map<string, number>();
  for (const p of pairGaps) {
    const key = pairKey(p.a, p.b);
    if (p.a !== p.b && !gaps.has(key)) gaps.set(key, p.gap);
  }
  const raw = new Map<string, Rect>();
  for (const box of boxes) {
    const r = placedRect(box);
    if (r !== undefined && !raw.has(box.id)) raw.set(box.id, r);
  }
  let count = marginOverlaps(boxes, tolerance, gaps);
  for (const [key, gap] of gaps) {
    const [a, b] = JSON.parse(key) as [string, string];
    const ra = raw.get(a);
    const rb = raw.get(b);
    if (ra === undefined || rb === undefined) continue;
    const o = overlapOf(grow(ra, gap), rb);
    if (o.x > tolerance && o.y > tolerance) count++;
  }
  return count;
}

/** This function gives the key of a pair of box ids, with the same key for each order. */
const pairKey = (a: string, b: string): string => JSON.stringify(a < b ? [a, b] : [b, a]);

/** This function counts the overlaps of the boxes with their margins. It skips the pairs of `skip`. Without `skip`, it is the rule of 0.2.13. */
function marginOverlaps(boxes: readonly LayoutBox[], tolerance: number, skip: ReadonlyMap<string, number> | undefined): number {
  const rects: { readonly id: string; readonly r: Rect }[] = [];
  for (const box of boxes) {
    const r = placedRect(box);
    if (r !== undefined) rects.push({ id: box.id, r: grow(r, box.margin) });
  }
  rects.sort((a, b) => a.r.x - b.r.x);
  let count = 0;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!.r;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]!.r;
      if (b.x >= a.x + a.w - tolerance) break;
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
   * The default is `false`. The default changes to `true` at the next breaking version.
   */
  readonly exactContainer?: boolean;
}

/**
 * This function counts the placed boxes that go out of the container.
 * Each box with its margin must stay inside the container made smaller by `inset`. Only the fixed sides of the size count. A shaped container counts as its bounding box.
 *
 * With `exactContainer`, a box of a shaped container with the size `fixed` also counts when `rectInRegion` tells that it is not inside the shape.
 * For that test, the box grows by `inset` and becomes smaller by `tolerance` on each side. A shaped container with a free side keeps the bounding test only.
 * An input without a container gives 0.
 */
export function countOutside(input: LayoutInput, tolerance: number = DEFAULT_TOLERANCE.overlap, options: ContainerTest = {}): number {
  const c = input.container;
  if (c === undefined) return 0;
  const shape = options.exactContainer === true && c.fixed === "size" ? c.shape : undefined;
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
    if ((fixW && outX) || (fixH && outY)) count++;
    else if (shape !== undefined && !rectInRegion(shape, shrink(grow(r, inset), tolerance))) count++;
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
}

/**
 * The hard rules of a pack, with the shape kinds that each rule supports.
 * `no-overlap` and `in-container` test the bounding box of a shape. That count is exact only for a `rect`.
 * `locked-kept` and `complete` read only the positions and the ids, so they support each kind.
 */
export const PACK_HARD_RULES: readonly ShapeSupport<keyof PackHard>[] = Object.freeze([
  { id: "no-overlap", shapes: ["rect"] },
  { id: "in-container", shapes: ["rect"] },
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
 * This function gives the count of each hard rule of the output of a packer.
 * It applies the output with `applyPack`. Only the placed boxes and the locked boxes count for the overlaps and the container.
 * `no-overlap` counts the pairs of boxes and the pairs of a box and an obstacle. A pair of `pairGaps` uses its gap in place of the margins.
 *
 * A locked box without a placement, or with a move of more than `RECORD_EPS`, breaks `locked-kept`.
 * A locked box without a position in the input is a bad input, not a break. `checkInput` finds it.
 * Another box without a placement that is not in `overflow` breaks `complete`.
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
  };
}

/**
 * This function gives the problems of an input file. An empty list tells that the file is good.
 * A problem is a bad input, not a break of a hard rule. Thus an engine refuses the input.
 * In `pairGaps`, an unknown box, a pair of one box, a repeated pair in either order, a bad `gap` and bad `lanes` are problems.
 * A port with `along` and no `side`, with `x` or `y`, or with a value outside [0, 1] is a problem.
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
