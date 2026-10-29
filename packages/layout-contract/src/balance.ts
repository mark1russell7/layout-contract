import { SIDES, type Rect, type Side } from "./geometry.ts";
import type { MeasureSpec } from "./measures.ts";
import { SHAPE_KIND_IDS, type ShapeKind } from "./shapes.ts";

/** A placed box: its id and its bounding box. */
export interface PlacedBox extends Rect {
  readonly id: string;
}

/** The balance of one layout. `docs/BALANCE.md` gives the definitions. */
export interface Balance {
  /** The standard deviation of the nearest-neighbour gaps divided by their mean. */
  readonly gapCv: number;
  /** The distance from the centroid of the free area to the center of the container, as a share of the half-diagonal. */
  readonly centroidOffset: number;
  /** The empty share of the strip at each side of the container. */
  readonly side: Readonly<Record<Side, number>>;
  /** The largest value of `side` minus the smallest value. */
  readonly sideRange: number;
}

/** The depth of the strip of each side, as a share of the container. For `top` and `bottom`, it is a share of the height. For `left` and `right`, it is a share of the width. */
export const BALANCE_SIDE_DEPTH = 0.25;

/** A suffix of a balance or stability measure. A stage adds its prefix, for example `pack.balance.gapCv`. */
export type BalanceMeasureSuffix =
  | "balance.gapCv"
  | "balance.centroidOffset"
  | "balance.side.top"
  | "balance.side.right"
  | "balance.side.bottom"
  | "balance.side.left"
  | "balance.sideRange"
  | "stability.procrustes"
  | "stability.seed";

/** The suffixes of the balance and stability measures, in the order of `docs/BALANCE.md`. */
export const BALANCE_MEASURE_SUFFIXES: readonly BalanceMeasureSuffix[] = Object.freeze([
  "balance.gapCv",
  "balance.centroidOffset",
  "balance.side.top",
  "balance.side.right",
  "balance.side.bottom",
  "balance.side.left",
  "balance.sideRange",
  "stability.procrustes",
  "stability.seed",
] as const);

/** This function gives the area of the overlap of two rectangles. */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** This function gives the distance between two rectangles. Two rectangles that touch or overlap give 0. */
function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * This function gives the gap of each box to its nearest other box, in the order of `boxes`.
 * Each box scans the boxes sorted by `x` in the two directions. A scan stops when the distance on `x` alone is above the best gap of the box.
 * To the left, the distance on `x` is at least `a.x - b.x - maxW`, with `maxW` the largest width. With fewer than 2 boxes, a gap is `Infinity`.
 */
export function nearestGaps(boxes: readonly Rect[]): number[] {
  const order = boxes.map((_, i) => i).sort((i, j) => boxes[i]!.x - boxes[j]!.x || i - j);
  const maxW = boxes.reduce((m, b) => Math.max(m, b.w), 0);
  const gaps = new Array<number>(boxes.length).fill(Infinity);
  for (let k = 0; k < order.length; k++) {
    const a = boxes[order[k]!]!;
    let best = Infinity;
    for (let m = k + 1; m < order.length; m++) {
      const b = boxes[order[m]!]!;
      if (b.x - (a.x + a.w) > best) break;
      best = Math.min(best, rectDistance(a, b));
    }
    for (let m = k - 1; m >= 0; m--) {
      const b = boxes[order[m]!]!;
      if (a.x - b.x - maxW > best) break;
      best = Math.min(best, rectDistance(a, b));
    }
    gaps[order[k]!] = best;
  }
  return gaps;
}

/**
 * This function gives the balance of the placed boxes in the container: the evenness of the gaps and the place of the free space.
 * The boxes do not overlap, as in the output of a packer. The area of a box outside the container does not count.
 * `docs/BALANCE.md` gives the definitions and the reasons.
 */
export function balanceOf(boxes: readonly Rect[], container: Rect): Balance {
  const gaps = boxes.length < 2 ? [] : nearestGaps(boxes);
  const mean = gaps.length === 0 ? 0 : gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = gaps.length === 0 ? 0 : Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  const gapCv = mean > 0 ? sd / mean : 0;

  const area = container.w * container.h;
  const cx = container.x + container.w / 2;
  const cy = container.y + container.h / 2;
  let used = 0;
  let mx = 0;
  let my = 0;
  for (const b of boxes) {
    const x0 = Math.max(b.x, container.x);
    const y0 = Math.max(b.y, container.y);
    const x1 = Math.min(b.x + b.w, container.x + container.w);
    const y1 = Math.min(b.y + b.h, container.y + container.h);
    if (x1 <= x0 || y1 <= y0) continue;
    const a = (x1 - x0) * (y1 - y0);
    used += a;
    mx += a * (x0 + x1) / 2;
    my += a * (y0 + y1) / 2;
  }
  const free = area - used;
  const half = Math.hypot(container.w, container.h) / 2;
  let centroidOffset = 0;
  if (free > 0 && half > 0) {
    const fx = (area * cx - mx) / free;
    const fy = (area * cy - my) / free;
    centroidOffset = Math.min(1, Math.hypot(fx - cx, fy - cy) / half);
  }

  const dh = container.h * BALANCE_SIDE_DEPTH;
  const dw = container.w * BALANCE_SIDE_DEPTH;
  const strips: Record<Side, Rect> = {
    top: { x: container.x, y: container.y, w: container.w, h: dh },
    right: { x: container.x + container.w - dw, y: container.y, w: dw, h: container.h },
    bottom: { x: container.x, y: container.y + container.h - dh, w: container.w, h: dh },
    left: { x: container.x, y: container.y, w: dw, h: container.h },
  };
  const side = {} as Record<Side, number>;
  for (const s of SIDES) {
    const strip = strips[s];
    const stripArea = strip.w * strip.h;
    const filled = boxes.reduce((sum, b) => sum + overlapArea(b, strip), 0);
    side[s] = stripArea > 0 ? Math.min(1, Math.max(0, 1 - filled / stripArea)) : 0;
  }
  const values = SIDES.map((s) => side[s]);
  return { gapCv, centroidOffset, side, sideRange: Math.max(...values) - Math.min(...values) };
}

/** The options of `procrustesOf`. */
export interface ProcrustesOptions {
  /** The unit of the result: the width `W` of the base, as in `joint.stability.mean`. A finite number above 0. */
  readonly unit: number;
  /** With `true` (the default), the alignment also rotates. With `false`, it only moves. */
  readonly rotate?: boolean;
}

/**
 * This function gives the root mean square move of the box centers from `base` to `next`, after the best alignment, in units of `unit`.
 * The alignment is the orthogonal Procrustes fit: one move and, by default, one rotation. Only the ids in the two lists count.
 * Fewer than 2 shared ids give 0, because the alignment then removes each move.
 */
export function procrustesOf(base: readonly PlacedBox[], next: readonly PlacedBox[], options: ProcrustesOptions): number {
  if (!(Number.isFinite(options.unit) && options.unit > 0)) throw new RangeError(`procrustesOf: the unit is a finite number above 0, not ${options.unit}.`);
  const after = new Map(next.map((b) => [b.id, b]));
  const a: [number, number][] = [];
  const b: [number, number][] = [];
  for (const p of base) {
    const q = after.get(p.id);
    if (q === undefined) continue;
    a.push([p.x + p.w / 2, p.y + p.h / 2]);
    b.push([q.x + q.w / 2, q.y + q.h / 2]);
  }
  const n = a.length;
  if (n < 2) return 0;
  const mean = (list: [number, number][]): [number, number] => [list.reduce((s, p) => s + p[0], 0) / n, list.reduce((s, p) => s + p[1], 0) / n];
  const [ax, ay] = mean(a);
  const [bx, by] = mean(b);
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const [px, py] = [a[i]![0] - ax, a[i]![1] - ay];
    const [qx, qy] = [b[i]![0] - bx, b[i]![1] - by];
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
  }
  const theta = options.rotate === false || (dot === 0 && cross === 0) ? 0 : Math.atan2(cross, dot);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [px, py] = [a[i]![0] - ax, a[i]![1] - ay];
    const [qx, qy] = [b[i]![0] - bx, b[i]![1] - by];
    sum += (cos * px - sin * py - qx) ** 2 + (sin * px + cos * py - qy) ** 2;
  }
  return Math.sqrt(sum / n) / options.unit;
}

/**
 * This function gives the value of `stability.procrustes`: the move of `procrustesOf` divided by the change share.
 * The change share is `changed / count`, and it is at least `1 / count`. Thus a change of one box divides by the smallest share.
 */
export function perChange(move: number, changed: number, count: number): number {
  if (!(Number.isInteger(count) && count >= 1)) throw new RangeError(`perChange: the count is an integer of 1 or more, not ${count}.`);
  const share = Math.max(1, Math.min(count, changed)) / count;
  return move / share;
}

/** This function gives the balance values as measures, with the prefix of the stage, for example `pack.balance.gapCv`. */
export function balanceMeasures<S extends string>(stage: S, balance: Balance): Record<`${S}.${BalanceMeasureSuffix}`, number> {
  const m: Record<string, number> = {
    [`${stage}.balance.gapCv`]: balance.gapCv,
    [`${stage}.balance.centroidOffset`]: balance.centroidOffset,
    [`${stage}.balance.sideRange`]: balance.sideRange,
  };
  for (const s of SIDES) m[`${stage}.balance.side.${s}`] = balance.side[s];
  return m as Record<`${S}.${BalanceMeasureSuffix}`, number>;
}

/**
 * This function gives the specs of the balance and stability measures, with the prefix of the stage.
 * The balance measures read the area of each box, so they support only `rect`. The stability measures read only the centers.
 */
export function balanceMeasureSpecs<S extends string>(stage: S): readonly MeasureSpec<`${S}.${BalanceMeasureSuffix}`>[] {
  const id = (suffix: BalanceMeasureSuffix): `${S}.${BalanceMeasureSuffix}` => `${stage}.${suffix}`;
  const rect: readonly ShapeKind[] = ["rect"];
  const centers = SHAPE_KIND_IDS;
  return Object.freeze([
    { id: id("balance.gapCv"), unit: "ratio", direction: "lower", min: 0, max: Infinity, minEffect: 0.01, family: "balance", shapes: rect },
    { id: id("balance.centroidOffset"), unit: "0 to 1", direction: "lower", min: 0, max: 1, minEffect: 0.01, family: "balance", shapes: rect },
    ...SIDES.map((s) => ({ id: id(`balance.side.${s}`), unit: "0 to 1", direction: "lower" as const, min: 0, max: 1, family: "balance", role: "diagnostic" as const, shapes: rect })),
    { id: id("balance.sideRange"), unit: "0 to 1", direction: "lower", min: 0, max: 1, minEffect: 0.02, family: "balance", shapes: rect },
    { id: id("stability.procrustes"), unit: "W for each change share", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.005, minEffect: 0.005, family: "stability", role: "change-guard", shapes: centers },
    { id: id("stability.seed"), unit: "W", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0.005, minEffect: 0.005, family: "stability", shapes: centers },
  ]);
}
