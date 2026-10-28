// The routing-aware gaps of roadmap item L13 (`docs/JOINT-BENCH.md`, "The prediction for routing-aware gaps (L13)").
// The joint strategy packs and routes one time, counts the lanes along each side of each box, and packs again with the margins that the lanes need.
import { marginSides, type LayoutBox, type Margin, type Placement, type Sides } from "@mark1russell7/layout-contract";
import type { Box, Graph, Route } from "@mark1russell7/highways";

/** The clearance of a route from a box in units: the corner margin of the routers of `highways`, with the default 5. */
export const LANE_CLEARANCE = 5;

/** The space between two lanes in units: the default lane width of the router `shared` and of `roomDemand` of `highways`. */
export const LANE_SPACE = 4;

/** The largest count of lanes that a side gets space for. 8 lanes need 38 units. A hub with more lanes gets the space of 8. */
export const LANE_CAP = 8;

/** The prefix of the pack part of each lane pair. The analysis finds the lane pairs by this prefix. */
export const LANE_PREFIX = "lanes-";

/** The separator of the parts of the pack part of a lane pair: `<variant>.<pack entry>.<router>`. */
export const LANE_SEPARATOR = ".";

/** A side of a placed box, in the axes of the board. */
export type BoxSide = "top" | "right" | "bottom" | "left";

/** The 4 sides of a box. */
export const BOX_SIDES: readonly BoxSide[] = Object.freeze(["top", "right", "bottom", "left"]);

/** The lanes along one side of a placed box. */
export interface SideLanes {
  /** The largest count of routes that run along the side at one place, in the strip of the side. */
  readonly lanes: number;
  /** The distance from the side to the nearest node that faces it, or `Infinity` when no node faces it. */
  readonly width: number;
}

/** The lanes along the 4 sides of one placed box. */
export type BoxLanes = Readonly<Record<BoxSide, SideLanes>>;

/** The options of the lane count and of the lane margins. */
export interface LaneOptions {
  /** The clearance of a route from a box. The default is `LANE_CLEARANCE`. */
  readonly clearance?: number;
  /** The space between two lanes. The default is `LANE_SPACE`. */
  readonly space?: number;
  /** The largest count of lanes that a side gets space for. The default is `LANE_CAP`. */
  readonly cap?: number;
}

/** This function gives the space that `k` lanes need between two boxes: 2 clearances and `k - 1` lane spaces. 0 lanes need no space. */
export function laneNeed(k: number, options: LaneOptions = {}): number {
  const c = options.clearance ?? LANE_CLEARANCE;
  const s = options.space ?? LANE_SPACE;
  const n = Math.min(k, options.cap ?? LANE_CAP);
  return n <= 0 ? 0 : 2 * c + (n - 1) * s;
}

/** One segment of a route, with the index of its route. */
interface Segment {
  readonly route: number;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** The size of a cell of the grid of the segments, in units. */
const CELL = 64;

/** The tolerance of the lane count, in units. */
const EPS = 1e-6;

/** This function gives the part of the segment from `a` to `b` inside a rectangle, as the parameters `[t0, t1]`, or `undefined` (Liang-Barsky). */
function clip(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): [number, number] | undefined {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const tests: [number, number][] = [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t1 < t0) return undefined;
  }
  return [t0, t1];
}

/** This function gives the largest count of spans that overlap at one place. Spans that only touch do not overlap. */
function density(spans: readonly (readonly [number, number])[]): number {
  const events: [number, number][] = [];
  for (const [from, to] of spans) events.push([from, 1], [to, -1]);
  events.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  let n = 0;
  let best = 0;
  for (const [, w] of events) {
    n += w;
    best = Math.max(best, n);
  }
  return best;
}

/** This function joins the spans of one route that overlap, so that one route counts one time at each place. */
function merge(spans: [number, number][]): [number, number][] {
  spans.sort((u, v) => u[0] - v[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

/** This function gives the distance from one side of a box to the nearest other node that faces it, or `Infinity`. */
function facingWidth(box: Box, side: BoxSide, nodes: readonly Box[]): number {
  let best = Infinity;
  for (const n of nodes) {
    if (n === box) continue;
    if (side === "right" || side === "left") {
      if (!(n.y < box.y + box.h - EPS && n.y + n.h > box.y + EPS)) continue;
      const d = side === "right" ? n.x - (box.x + box.w) : box.x - (n.x + n.w);
      if (d >= -EPS) best = Math.min(best, Math.max(0, d));
    } else {
      if (!(n.x < box.x + box.w - EPS && n.x + n.w > box.x + EPS)) continue;
      const d = side === "bottom" ? n.y - (box.y + box.h) : box.y - (n.y + n.h);
      if (d >= -EPS) best = Math.min(best, Math.max(0, d));
    }
  }
  return best;
}

/** This function gives the strip of one side of a box: the rectangle out from the side, `reach` units wide, along the full side. */
function stripOf(box: Box, side: BoxSide, reach: number): { x0: number; y0: number; x1: number; y1: number; along: "x" | "y" } {
  switch (side) {
    case "right":
      return { x0: box.x + box.w, y0: box.y, x1: box.x + box.w + reach, y1: box.y + box.h, along: "y" };
    case "left":
      return { x0: box.x - reach, y0: box.y, x1: box.x, y1: box.y + box.h, along: "y" };
    case "bottom":
      return { x0: box.x, y0: box.y + box.h, x1: box.x + box.w, y1: box.y + box.h + reach, along: "x" };
    case "top":
      return { x0: box.x, y0: box.y - reach, x1: box.x + box.w, y1: box.y, along: "x" };
  }
}

/**
 * This function counts the lanes along each side of each node of `ids` (the default is each node of the graph).
 *
 * - The strip of a side goes out from the side to the nearest node that faces it, and at least 2 clearances out. It goes along the full side.
 * - Thus the strip of a narrow channel also holds the routes that go through the box behind the channel.
 * - A piece of a route counts when it is in the strip, and it goes farther along the side than across it.
 * - The lanes of a side are the largest count of routes that run along it at one place. Routes on the same line count one time each.
 */
export function sideLanes(graph: Graph, routes: readonly Route[], ids?: ReadonlySet<string>, options: LaneOptions = {}): Map<string, BoxLanes> {
  const clearance = options.clearance ?? LANE_CLEARANCE;
  const boxes = graph.nodes.map((n) => n.box);
  const segments: Segment[] = [];
  routes.forEach((r, route) => {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      segments.push({ route, ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  });
  const cells = new Map<string, number[]>();
  segments.forEach((s, i) => {
    const cx0 = Math.floor(Math.min(s.ax, s.bx) / CELL);
    const cx1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
    const cy0 = Math.floor(Math.min(s.ay, s.by) / CELL);
    const cy1 = Math.floor(Math.max(s.ay, s.by) / CELL);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        const list = cells.get(key);
        if (list) list.push(i);
        else cells.set(key, [i]);
      }
  });
  const seen = new Int32Array(segments.length).fill(-1);
  let query = 0;
  const out = new Map<string, BoxLanes>();
  for (const node of graph.nodes) {
    if (ids !== undefined && !ids.has(node.id)) continue;
    const sides = {} as Record<BoxSide, SideLanes>;
    for (const side of BOX_SIDES) {
      const width = facingWidth(node.box, side, boxes);
      const reach = Math.max(Number.isFinite(width) ? width : 0, 2 * clearance);
      const strip = stripOf(node.box, side, reach);
      const x0 = strip.x0 - EPS;
      const y0 = strip.y0 - EPS;
      const x1 = strip.x1 + EPS;
      const y1 = strip.y1 + EPS;
      const byRoute = new Map<number, [number, number][]>();
      query += 1;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++)
          for (const i of cells.get(`${cx},${cy}`) ?? []) {
            if (seen[i] === query) continue;
            seen[i] = query;
            const s = segments[i]!;
            const t = clip(s.ax, s.ay, s.bx, s.by, x0, y0, x1, y1);
            if (t === undefined) continue;
            const [t0, t1] = t;
            const sx = s.ax + (s.bx - s.ax) * t0;
            const sy = s.ay + (s.by - s.ay) * t0;
            const ex = s.ax + (s.bx - s.ax) * t1;
            const ey = s.ay + (s.by - s.ay) * t1;
            const run = strip.along === "y" ? Math.abs(ey - sy) : Math.abs(ex - sx);
            const cross = strip.along === "y" ? Math.abs(ex - sx) : Math.abs(ey - sy);
            if (!(run > cross && run > EPS)) continue;
            const from = strip.along === "y" ? Math.min(sy, ey) : Math.min(sx, ex);
            const list = byRoute.get(s.route) ?? [];
            list.push([from, from + run]);
            byRoute.set(s.route, list);
          }
      const spans = [...byRoute.values()].flatMap((list) => merge(list));
      sides[side] = { lanes: density(spans), width };
    }
    out.set(node.id, sides);
  }
  return out;
}

/** This function counts the sides that are too narrow for their lanes: a node faces the side, and the width is less than `laneNeed` of its lanes. */
export function shortSides(lanes: ReadonlyMap<string, BoxLanes>, options: LaneOptions = {}): number {
  let n = 0;
  for (const sides of lanes.values())
    for (const side of BOX_SIDES) {
      const s = sides[side];
      if (s.lanes > 0 && Number.isFinite(s.width) && s.width < laneNeed(s.lanes, options) - EPS) n += 1;
    }
  return n;
}

/** This function gives the largest count of lanes of one side. */
export function maxLanes(lanes: ReadonlyMap<string, BoxLanes>): number {
  let n = 0;
  for (const sides of lanes.values()) for (const side of BOX_SIDES) n = Math.max(n, sides[side].lanes);
  return n;
}

/** The two ways to turn the lane counts into margins. */
export type LaneMode = "max" | "sides";

/** This function gives the sides of a box in its own axes from the sides of its placement. A turn of 90 degrees clockwise puts the left side of the box at the top. */
function itemSides(placed: Readonly<Record<BoxSide, number>>, turn: Placement["turn"]): Sides {
  if (turn !== 90) return { top: placed.top, right: placed.right, bottom: placed.bottom, left: placed.left };
  return { top: placed.right, right: placed.bottom, bottom: placed.left, left: placed.top };
}

/** This function gives a margin as a number when its 4 sides are the same, and as sides otherwise. A margin of 0 gives `undefined`. */
function marginOf(s: Sides): Margin | undefined {
  if (s.top === s.right && s.top === s.bottom && s.top === s.left) return s.top === 0 ? undefined : s.top;
  return s;
}

/**
 * This function gives the boxes with the margins that the lanes need. A margin never becomes smaller.
 *
 * - The need of a side with `k` lanes is `laneNeed(k)`. The two boxes of a channel share it, with the gap: each side gets `(need - gap) / 2`.
 * - With `sides`, each side of each placed box gets its own margin. The margin turns with the box.
 * - With `max`, each side of each box gets the largest margin of all sides.
 * - A box without a placement or without lanes keeps its margin.
 */
export function laneMargins(
  boxes: readonly LayoutBox[],
  placements: readonly Placement[],
  lanes: ReadonlyMap<string, BoxLanes>,
  gap: number,
  mode: LaneMode,
  options: LaneOptions = {},
): LayoutBox[] {
  const at = new Map(placements.map((p) => [p.id, p]));
  const wanted = new Map<string, Sides>();
  let top = 0;
  for (const box of boxes) {
    const p = at.get(box.id);
    const sides = lanes.get(box.id);
    if (p === undefined || sides === undefined) continue;
    const placed = {} as Record<BoxSide, number>;
    for (const side of BOX_SIDES) placed[side] = Math.max(0, (laneNeed(sides[side].lanes, options) - gap) / 2);
    const own = itemSides(placed, p.turn);
    wanted.set(box.id, own);
    top = Math.max(top, own.top, own.right, own.bottom, own.left);
  }
  return boxes.map((box) => {
    const old = marginSides(box.margin);
    const want = mode === "max" ? { top, right: top, bottom: top, left: top } : wanted.get(box.id);
    if (want === undefined) return box;
    const next: Sides = { top: Math.max(old.top, want.top), right: Math.max(old.right, want.right), bottom: Math.max(old.bottom, want.bottom), left: Math.max(old.left, want.left) };
    const margin = marginOf(next);
    const { margin: _old, ...rest } = box;
    return margin === undefined ? rest : { ...rest, margin };
  });
}

/** This function gives the mean growth of the margins over the sides of the boxes, in units. */
export function marginGrowth(before: readonly LayoutBox[], after: readonly LayoutBox[]): number {
  if (before.length === 0) return 0;
  let sum = 0;
  before.forEach((box, i) => {
    const a = marginSides(box.margin);
    const b = marginSides(after[i]?.margin);
    sum += b.top - a.top + (b.right - a.right) + (b.bottom - a.bottom) + (b.left - a.left);
  });
  return sum / (4 * before.length);
}

/** One variant of the joint strategy: the mode of the margins and the count of the passes after the first pack. */
export interface LaneVariant {
  readonly name: string;
  readonly mode: LaneMode;
  readonly passes: number;
}

/**
 * The variants of the joint strategy of L13.
 * - `lanes-max`: one gap for all boxes, the largest need of the board.
 * - `lanes-sides`: a margin for each side of each box, one pass.
 * - `lanes-sides2`: the same, two passes. The second pass counts the lanes of the layout of the first pass, and keeps the larger margin.
 */
export const LANE_VARIANTS: readonly LaneVariant[] = Object.freeze([
  { name: `${LANE_PREFIX}max`, mode: "max", passes: 1 },
  { name: `${LANE_PREFIX}sides`, mode: "sides", passes: 1 },
  { name: `${LANE_PREFIX}sides2`, mode: "sides", passes: 2 },
]);

/** The pack entries of the lane pairs: the pack of the 2 baselines (`rows` and `select`) and of the best pair (`maxrects-cp`). */
export const LANE_PACKS: readonly string[] = Object.freeze(["rows", "maxrects-cp", "select"]);

/** The routers of the lane pairs: the router of the 2 baselines (`portfolio`) and of the best pair (`corners`). */
export const LANE_ROUTERS: readonly string[] = Object.freeze(["corners", "portfolio"]);

/** One lane pair: a variant, a pack entry and a router. Its id is the pack part of the pair id. */
export interface LaneEntry {
  readonly id: string;
  readonly variant: LaneVariant;
  readonly pack: string;
  readonly router: string;
}

/** This function gives the lane entries of each variant, pack entry and router, in this order. */
export function laneEntries(variants: readonly LaneVariant[] = LANE_VARIANTS, packs: readonly string[] = LANE_PACKS, routers: readonly string[] = LANE_ROUTERS): LaneEntry[] {
  return variants.flatMap((variant) => packs.flatMap((pack) => routers.map((router) => ({ id: [variant.name, pack, router].join(LANE_SEPARATOR), variant, pack, router }))));
}

/** This function tells if the pack part of a pair id is a lane entry. */
export function isLanePack(pack: string): boolean {
  return pack.startsWith(LANE_PREFIX);
}

/** This function gives the variant, the pack entry and the router of the pack part of a lane pair, or `undefined` for another pack part. */
export function laneParts(pack: string): { readonly variant: string; readonly pack: string; readonly router: string } | undefined {
  if (!isLanePack(pack)) return undefined;
  const parts = pack.split(LANE_SEPARATOR);
  return parts.length === 3 ? { variant: parts[0]!, pack: parts[1]!, router: parts[2]! } : undefined;
}

/**
 * The plan cost of one pass of a lane pair, in the cost of one pair of the plan.
 * A pass makes a new pack output, so it builds a new exact network for the facts. The 10 routers of a pack entry share that cost in the other pairs.
 */
export const LANE_PASS_COST = 3;

/** This function gives the plan cost of the lane entries, in the cost of one pair: `LANE_PASS_COST` for each pass. */
export function lanePlanPairs(entries: readonly LaneEntry[]): number {
  return entries.reduce((n, e) => n + LANE_PASS_COST * e.variant.passes, 0);
}
