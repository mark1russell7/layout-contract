// The messages between the joint pages and their worker, and the view of one pair. The worker packs and routes, and the page draws.
import type { IterEntry, LaneEntry } from "@layout-contract/joint/browser";
import type { LayoutRecord, StageChoice } from "@mark1russell7/layout-contract";
import type { PackChoice, RouterChoice } from "./catalog.ts";

/** An input of the corpus `joint-v2`, or an input that the page builds from the dimensions of the array `grid`. */
export type InputRef =
  | { readonly kind: "corpus"; readonly spec: number; readonly seed: number; readonly hash: string }
  | { readonly kind: "build"; readonly dims: Readonly<Record<string, string>>; readonly count: number; readonly seed: number };

/**
 * A job for the worker: each pair of the packs and the routers on one input, then the lane pairs and the iteration pairs.
 * With `lane`, the worker operates only the variant of each pair that the lane choice gives, and not the pair without lanes.
 */
export interface RunJob {
  readonly type: "run";
  readonly job: number;
  readonly input: InputRef;
  readonly packs: readonly PackChoice[];
  readonly routers: readonly RouterChoice[];
  /** The lane pairs of L13. A lane pair uses a pack entry of `packs`, else of `PACK_ENTRIES`. */
  readonly lanes?: readonly LaneEntry[];
  /** The iteration pairs of L11. */
  readonly iterate?: readonly IterEntry[];
  /** The choice of the stage `lanes.mode` of the joint space: `max`, `sides` or `iter`, with its params. */
  readonly lane?: StageChoice;
}

/** The facts of the input of a job. */
export interface InputView {
  readonly id: string;
  readonly boxes: number;
  readonly edges: number;
  readonly hash: string;
}

/** The view of one pair: its measures, its breaks and its drawing. */
export interface PairView {
  readonly pair: string;
  readonly pack: string;
  readonly router: string;
  /** The reason of a skipped pair. */
  readonly skipped?: string;
  /** The time of the pack and of the route, in milliseconds. */
  readonly ms: number;
  /** The measures of the pair that the page shows, by their ids. */
  readonly measures: Readonly<Record<string, number>>;
  /** The hard breaks of the pair with a count above 0, by their rules. */
  readonly breaks: Readonly<Record<string, number>>;
  /** The size of the packed area. */
  readonly w: number;
  readonly h: number;
  /** The placed boxes, 4 numbers for each box: x, y, width and height. */
  readonly boxes: readonly number[];
  /** The routes, one list of numbers for each route: x and y of each point. */
  readonly routes: readonly (readonly number[])[];
  readonly deterministic: boolean;
}

/** The rank of one pair, as `rankPairs` gives it. */
export interface RankView {
  readonly rank: number | undefined;
  readonly pair: string;
  readonly misses: number;
  readonly score: number;
  /** The hard count of the pair in the cell of the headline: its hard breaks and its routes above the stretch cap. */
  readonly hard: number;
}

/** A message of the worker. */
export type WorkerMessage =
  | { readonly type: "input"; readonly job: number; readonly input: InputView }
  | { readonly type: "pair"; readonly job: number; readonly done: number; readonly total: number; readonly view: PairView; readonly ranks: readonly RankView[]; readonly record: LayoutRecord }
  | { readonly type: "done"; readonly job: number; readonly ms: number }
  | { readonly type: "error"; readonly job: number; readonly message: string };

/** The measures of a record that the page shows. */
export const VIEW_MEASURES: readonly string[] = Object.freeze(["joint.fill", "pack.fill", "pack.overflow", "joint.overflow.edges", "route.crossings", "joint.routes", "route.ms", "pack.ms"]);

/** This function rounds a coordinate to 0.1, so the messages and the drawings stay small. */
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** The parts of the run of a pair that the view uses. */
export interface PairParts {
  readonly record: LayoutRecord;
  readonly pack: string;
  readonly router: string;
  readonly size?: { readonly w: number; readonly h: number };
  readonly boxes?: readonly { readonly x?: number; readonly y?: number; readonly w: number; readonly h: number }[];
  readonly routes?: readonly { readonly points: readonly { readonly x: number; readonly y: number }[] }[];
}

/** This function gives the view of one pair from its record, its packed boxes and its routes. */
export function pairView(p: PairParts): PairView {
  const r = p.record;
  const measures: Record<string, number> = {};
  for (const id of VIEW_MEASURES) {
    const v = r.measures[id];
    if (typeof v === "number") measures[id] = v;
  }
  const breaks: Record<string, number> = {};
  for (const [rule, n] of Object.entries(r.hard)) if (typeof n === "number" && n > 0) breaks[rule] = n;
  const boxes: number[] = [];
  for (const b of p.boxes ?? []) if (typeof b.x === "number" && typeof b.y === "number") boxes.push(r1(b.x), r1(b.y), r1(b.w), r1(b.h));
  const routes = (p.routes ?? []).map((route) => route.points.flatMap((q) => [r1(q.x), r1(q.y)]));
  return {
    pair: r.strategy,
    pack: p.pack,
    router: p.router,
    ...(r.skipped === undefined ? {} : { skipped: r.skipped }),
    ms: r.ms,
    measures,
    breaks,
    w: r1(p.size?.w ?? 0),
    h: r1(p.size?.h ?? 0),
    boxes,
    routes,
    deterministic: r.deterministic,
  };
}
