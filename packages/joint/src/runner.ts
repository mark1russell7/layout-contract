// The joint runner of roadmap item L9 (`docs/JOINT-BENCH.md`). It packs each input, then routes the packed input, for each pair of a pack entry and a router.
import { arch, cpus, platform } from "node:os";
import {
  applyPack,
  outputHash,
  RECORD_EPS,
  toLayoutRecord,
  toPackInput,
  type LayoutBox,
  type LayoutEdge,
  type LayoutInput,
  type LayoutRecord,
  type PackInput,
  type PackOutput,
  type RunEnv,
} from "@mark1russell7/layout-contract";
import { checkHard, measure, outputHash as packHash, packWith, SELECT_MEMBERS, selectFeatures, selectLeaf, strategy as packStrategy, unsupportedOf } from "@mark1russell7/packing";
import {
  asRouter,
  benchRun,
  checkProperties,
  exactStretches,
  inputGraph,
  measureName,
  mixedSegments,
  portfolioRouter,
  routeMeasures,
  routerStrategies,
  type Graph,
  type PortfolioFacts,
  type Result,
  type Router,
  type Strategy,
} from "@mark1russell7/highways";
import { jointMeasures, placementFacts, type PlacementFacts } from "./joint-measures.ts";
import { LANE_CAP, LANE_CLEARANCE, LANE_SPACE, laneMargins, marginGrowth, maxLanes, shortSides, sideLanes, type LaneEntry, type LaneOptions } from "./lanes.ts";

/** One pack entry: a strategy of `packing` with options over its defaults. The id names the entry in the records. */
export interface PackEntry {
  readonly id: string;
  readonly strategy: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * The pack entries of the joint runner: the entries of the benchmark of `packing` 0.2.10 (`bench/entries.ts`) without `push`, and `select`.
 * The strategy `push` supports only the mode `incremental`, and each input of the joint corpora has the mode `offline`.
 * The composite strategy `select` of `packing` 0.2.15 (roadmap item L32) packs each input with `rows` or `maxrects-bl`. Its output is the output of that member.
 */
export const PACK_ENTRIES: readonly PackEntry[] = Object.freeze([
  { id: "rows", strategy: "rows", options: {} },
  { id: "skyline", strategy: "skyline", options: {} },
  { id: "shelf", strategy: "shelf", options: {} },
  { id: "shelf-next", strategy: "shelf", options: { fit: "next", sortOrder: "height-desc" } },
  { id: "shelf-first", strategy: "shelf", options: { fit: "first", sortOrder: "height-desc" } },
  { id: "shelf-best", strategy: "shelf", options: { fit: "best", sortOrder: "height-desc" } },
  { id: "shelf-first-input", strategy: "shelf", options: { fit: "first", sortOrder: "input" } },
  { id: "maxrects-bssf", strategy: "maxrects", options: { rule: "bssf" } },
  { id: "maxrects-blsf", strategy: "maxrects", options: { rule: "blsf" } },
  { id: "maxrects-baf", strategy: "maxrects", options: { rule: "baf" } },
  { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } },
  { id: "maxrects-cp", strategy: "maxrects", options: { rule: "cp" } },
  { id: "select", strategy: "select", options: {} },
]);

/** The id of the composite pack entry `select` in the pair ids. */
export const SELECT_PACK = "select";

/**
 * This function gives the member that the table of `select` picks for an input: `rows` or `maxrects-bl`.
 * The pick comes from the features of the pack input alone. The member ids are also the ids of their pack entries.
 */
export function selectMemberOf(input: LayoutInput): string {
  return SELECT_MEMBERS[selectLeaf(selectFeatures(packInputOf(input))).pick]!.id;
}

/** The name of the portfolio router of `highways` 0.6.0 in the pair ids. The runner uses `portfolioRouter()` with its defaults. */
export const PORTFOLIO_ROUTER = "portfolio";

/** The routers of the joint runner: the 9 router strategies of `highways` 0.6.0, in the order of its benchmark, and the portfolio router. */
export const ROUTERS: readonly string[] = Object.freeze([...Object.keys(routerStrategies), PORTFOLIO_ROUTER]);

/** The stretch caps of the cells of `highways`. */
export const CAPS: readonly number[] = Object.freeze([1.1, 1.25, 1.5]);

/** The separator of the pack entry and the router in the id of a pair. */
export const PAIR_SEPARATOR = "+";

/** This function gives the id of a pair, for example `skyline+corners`. */
export function pairId(pack: string, router: string): string {
  return `${pack}${PAIR_SEPARATOR}${router}`;
}

/** The options of `runInput`. */
export interface RunOptions {
  /** The pack entries. The default is `PACK_ENTRIES`. */
  readonly packs?: readonly PackEntry[];
  /** The router names. The default is `ROUTERS`. */
  readonly routers?: readonly string[];
  /** The count of the timed routes of each router. The default is 2, the least count of `benchRun`. */
  readonly repeat?: number;
  /** The id of the corpus. The default is `joint-v1`. The CLI gives the corpus of its argument. */
  readonly corpus?: string;
  readonly env?: RunEnv;
  readonly commit?: string;
  /** The clock in milliseconds. The default is `performance.now`. */
  readonly now?: () => number;
  /**
   * The lane pairs of the joint strategy of L13 (`laneEntries`). The default is none, so the default plan does not change.
   * Each lane pair gives one more record after the records of the pack entries and the routers.
   */
  readonly lanes?: readonly LaneEntry[];
  /** The options of the lane count and of the lane margins. */
  readonly laneOptions?: LaneOptions;
}

/** This function gives the facts of the computer of this run. */
export function runEnv(): RunEnv {
  const list = cpus();
  return { node: process.version, os: platform(), arch: arch(), runner: process.env["RUNNER_NAME"] ?? "local", cpu: list[0]?.model ?? "unknown", cpus: list.length };
}

/** This function gives the input of the packer: the boxes without `group` and `parent`. No strategy of `packing` 0.2.10 supports groups. */
export function packInputOf(input: LayoutInput): PackInput {
  const boxes = input.boxes.map((box) => {
    const { group: _group, parent: _parent, ...rest } = box;
    return rest;
  });
  return toPackInput({ ...input, boxes });
}

/** The routed input of one pack: the placed boxes, and the edges between them. */
export interface PackedInput {
  readonly input: LayoutInput;
  /** The count of the edges with an end in the overflow. The router does not get them. */
  readonly dropped: number;
}

/**
 * This function applies a pack to an input. An overflow box has no position, so the function drops it and each edge with an end on it.
 * The result has `base` set to the id of the input and `change` set to `packed`.
 */
export function packedInput(input: LayoutInput, output: PackOutput, packId: string): PackedInput {
  const placed = new Set(output.placements.map((p) => p.id));
  const applied = applyPack(input, output);
  const boxes = applied.boxes.filter((b) => placed.has(b.id));
  const edges = (applied.edges ?? []).filter((e) => placed.has(e.source) && placed.has(e.target));
  const dropped = (applied.edges?.length ?? 0) - edges.length;
  const { hash: _hash, ...rest } = applied;
  return { input: { ...rest, id: `${input.id}#${packId}`, base: input.id, change: "packed", boxes, edges }, dropped };
}

/** This function gives the hash form of a route result, as the router stage of `docs/PROMOTION.md` gives it. The routes go in the order of the edge ids. */
export function routeHash(result: Result): string {
  const routes = [...result.routes].sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
  return outputHash({ routes, levels: result.levels, bundles: result.bundles, runs: result.runs }, { grid: RECORD_EPS });
}

/** This function gives the hash of a joint output: `outputHash` of the list of the pack hash and the route hash. */
export function jointHash(pack: string, route: string): string {
  return outputHash([pack, route]);
}

/** The tolerance of a stretch above a cap. `portfolioFacts` of `highways` 0.6.0 uses the same value. */
export const CAP_EPS = 1e-9;

/**
 * This function gives the function of the route facts of the outputs on the graph `graph`. The values are the values of `portfolioFacts` of `highways` 0.6.0.
 * - `over(cap)` counts the edges whose stretch of `exactStretches` is above the cap. That stretch is the route length without its two plug ends, divided by the shortest way of the exact network.
 * - An edge without a route or without a way in the network has no stretch. An edge with a shortest way of 1 unit or less also has none.
 * - `hard` counts the breaks of each rule of `checkProperties`, and `mixed` is `mixedSegments`.
 * The function builds the exact network one time for the graph, at the first call.
 */
export function routeFacts(graph: Graph): (result: Result) => PortfolioFacts {
  let stretches: ReturnType<typeof exactStretches> | undefined;
  return (result) => {
    stretches ??= exactStretches(graph);
    const values = [...stretches(result.routes).values()];
    const hard: Record<string, number> = {};
    for (const b of checkProperties(graph, result, 1_000_000)) hard[b.rule] = (hard[b.rule] ?? 0) + 1;
    return { hard, over: (cap) => values.filter((v) => v > cap + CAP_EPS).length, mixed: mixedSegments(graph, result) };
  };
}

/**
 * This function gives the measures and the hard counts of the route facts (`routeFacts`). The guard of the portfolio router of `highways` uses the same facts.
 * `route.cap.<cap>` is the count of the edges with a stretch of `exactStretches` above the cap. `route.mixed` is the count of the mixed shared segments.
 * `route.<rule>` is the count of the breaks of each hard rule of `checkProperties`, for the rules with a break.
 */
export function factMeasures(facts: PortfolioFacts, caps: readonly number[] = CAPS): { readonly measures: Record<string, number>; readonly hard: Record<string, number> } {
  const measures: Record<string, number> = Object.fromEntries(caps.map((c) => [`route.cap.${c}`, facts.over(c)]));
  measures["route.mixed"] = facts.mixed;
  const hard = Object.fromEntries(Object.entries(facts.hard).filter(([, v]) => v > 0).map(([rule, v]) => [`route.${rule}`, v]));
  return { measures, hard };
}

/** The result of one router on one packed input. Pack entries with the same output share it. */
interface RouteRun {
  readonly ok: true;
  readonly result: Result;
  readonly hash: string;
  readonly ms: number;
  readonly deterministic: boolean;
  readonly measures: Record<string, number>;
  readonly hard: Record<string, number>;
  /** The time of each step of the route, in milliseconds, by the name of its measure. */
  readonly times: Record<string, number>;
}

/** A router that did not run on an input, with the reason. */
interface RouteMiss {
  readonly ok: false;
  readonly reason: string;
}

/** This function gives the message of an error. */
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** This function keeps the finite values of a record of measures. */
function finite(values: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
}

/** This function gives the router of a name: a router strategy of `highways`, or `portfolio` for `portfolioRouter()`. */
function routerOf(name: string): Router {
  if (name === PORTFOLIO_ROUTER) return portfolioRouter();
  const s = (routerStrategies as unknown as Readonly<Record<string, Strategy<"router", object>>>)[name];
  if (s === undefined) throw new RangeError(`There is no router "${name}". The routers are ${ROUTERS.join(", ")}.`);
  return asRouter(s);
}

/**
 * This function routes one graph with one router and measures the result. `facts` is the function of `routeFacts` of the graph.
 * The result holds the time of each step in `times` (`time.bench.ms`, `time.facts.ms`, `time.measures.ms` and `time.hash.ms`).
 */
function routeOnce(name: string, graph: Graph, facts: (result: Result) => PortfolioFacts, fixture: string, repeat: number, now: () => number): RouteRun | RouteMiss {
  const router = routerOf(name);
  if (graph.nodes.length > (router.maxNodes ?? Infinity)) return { ok: false, reason: `The graph has ${graph.nodes.length} nodes, above the limit ${router.maxNodes} of the router.` };
  try {
    const t0 = now();
    const { row, result } = benchRun(router, fixture, graph, repeat);
    const t1 = now();
    const fact = factMeasures(facts(result));
    const t2 = now();
    const hard: Record<string, number> = { "route.violations": row.violations, ...fact.hard };
    const keyed = routeMeasures(graph, result, row);
    const t3 = now();
    const measures: Record<string, number> = { "route.ms": row.ms };
    for (const [key, value] of Object.entries(keyed)) measures[measureName(key)] = value;
    Object.assign(measures, fact.measures);
    const hash = routeHash(result);
    const t4 = now();
    const times = { "time.bench.ms": t1 - t0, "time.facts.ms": t2 - t1, "time.measures.ms": t3 - t2, "time.hash.ms": t4 - t3 };
    return { ok: true, result, hash, ms: row.ms, deterministic: row.deterministic, measures: finite(measures), hard, times };
  } catch (e) {
    return { ok: false, reason: `error: ${messageOf(e)}` };
  }
}

/** The facts of one pack of one input. */
type PackRun =
  | {
      readonly ok: true;
      readonly output: PackOutput;
      readonly hash: string;
      readonly ms: number;
      readonly deterministic: boolean;
      readonly measures: Record<string, number>;
      readonly hard: Record<string, number>;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * This function packs one input with one entry two times, for the time and for the rule "same twice".
 * The hard breaks and the measures use `score`, the default is the packed input. A lane pass packs an input with larger margins, and scores the pack on the input of the corpus.
 */
function packOnce(entry: PackEntry, input: PackInput, cell: Readonly<Record<string, unknown>> | undefined, seed: number, now: () => number, score: PackInput = input): PackRun {
  const s = packStrategy(entry.strategy);
  if (cell !== undefined) {
    const miss = unsupportedOf(s.supports, { ...(cell as Record<string, string>), groups: "none" });
    if (miss !== undefined) return { ok: false, reason: `The strategy does not support ${miss.dimension} ${miss.value}.` };
  }
  try {
    const t0 = now();
    const output = packWith(entry.strategy, input, entry.options, seed);
    const t1 = now();
    const again = packWith(entry.strategy, input, entry.options, seed);
    const t2 = now();
    const hash = packHash(output);
    const hard = Object.fromEntries(Object.entries(checkHard(score, output, undefined, { exactContainer: true })).map(([k, v]) => [`pack.${k}`, v]));
    const measures = finite(measure(score, output) as unknown as Record<string, number>);
    return { ok: true, output, hash, ms: (t1 - t0 + (t2 - t1)) / 2, deterministic: packHash(again) === hash, measures, hard };
  } catch (e) {
    return { ok: false, reason: `error: ${messageOf(e)}` };
  }
}

/** This function gives the full options of a pack entry: the defaults of its strategy and the options of the entry. */
function fullOptions(entry: PackEntry): Record<string, unknown> {
  return { ...(packStrategy(entry.strategy).defaults as Record<string, unknown>), ...entry.options };
}

/**
 * This function runs each pair of a pack entry and a router on one input, and gives one `layout-record/1` for each pair.
 *
 * - The runner packs the input, drops the overflow boxes and their edges, and routes the placed boxes.
 * - Pack entries with the same output share the routes of each router.
 * - A strategy that does not support the cell, an error and a graph above the limit of a router give a record with `skipped`.
 * - The `hard` field holds the breaks of `checkHard` (`pack.*`) and of `checkProperties` (`route.*`).
 * - The measures hold `pack.*`, `route.*`, `joint.*`, the cap counts `route.cap.<cap>`, `route.mixed` and `joint.overflow.edges`.
 * - The measures `time.*` hold the time of the steps after the pack, in milliseconds. `docs/JOINT-BENCH.md` ("The runner") tells each step.
 * - With `lanes`, each lane pair gives one more record. Its pack part is the id of the lane entry, and `docs/JOINT-BENCH.md` ("The lane pairs") tells its passes.
 */
export function runInput(input: LayoutInput, cell: Readonly<Record<string, unknown>> | undefined, options: RunOptions = {}): LayoutRecord[] {
  const packs = options.packs ?? PACK_ENTRIES;
  const routers = options.routers ?? ROUTERS;
  const repeat = options.repeat ?? 2;
  const now = options.now ?? ((): number => performance.now());
  const seed = input.seed ?? 0;
  const packInput = packInputOf(input);
  const target = input.container?.aspect ?? 1;
  const edgeCount = input.edges?.length ?? 0;
  const records: LayoutRecord[] = [];
  const shared = new Map<string, PackGroup>();
  const packRuns = new Map<string, PackRun>();

  const factsOf = (entry: PackEntry, router: string, id: string = entry.id, extra: Readonly<Record<string, unknown>> = {}) => ({
    stage: "joint" as const,
    step: "joint",
    strategy: pairId(id, router),
    options: { pack: id, packStrategy: entry.strategy, packOptions: fullOptions(entry), router, ...extra },
    corpus: options.corpus ?? "joint-v1",
    seed,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.commit === undefined ? {} : { commit: options.commit }),
  });
  const skippedRecord = (entry: PackEntry, router: string, reason: string, id?: string, extra?: Readonly<Record<string, unknown>>): LayoutRecord =>
    toLayoutRecord(input, { ...factsOf(entry, router, id, extra), measures: {}, hard: {}, deterministic: true, ms: 0, skipped: reason });

  /** This function gives the shared group of a pack output: the packed input, its graph and its routes. Pack outputs with the same hash share one group. */
  const groupOf = (run: Extract<PackRun, { ok: true }>, packId: string): PackGroup => {
    const key = `${run.hash}:${JSON.stringify(run.output.moved)}`;
    let group = shared.get(key);
    if (group === undefined) {
      const t0 = now();
      const packed = packedInput(input, run.output, packId);
      const boxes: readonly LayoutBox[] = packed.input.boxes;
      const edges: readonly LayoutEdge[] = packed.input.edges ?? [];
      const graph = inputGraph(packed.input as unknown as Parameters<typeof inputGraph>[0]);
      const facts = placementFacts(boxes, edges);
      group = { packed, facts, graph, check: routeFacts(graph), routes: new Map(), plain: new Map(), placementMs: now() - t0 };
      shared.set(key, group);
    }
    return group;
  };
  const routeOf = (g: PackGroup, name: string): RouteRun | RouteMiss => {
    let r = g.routes.get(name);
    if (r === undefined) {
      r = routeOnce(name, g.graph, g.check, g.packed.input.id, repeat, now);
      g.routes.set(name, r);
    }
    return r;
  };
  /** This function gives the routes of one router on a group without the measures: the routes of `routeOf` when they exist, else one plain route. */
  const plainOf = (g: PackGroup, name: string): PlainRoute | RouteMiss => {
    const full = g.routes.get(name);
    if (full !== undefined) return full.ok ? { ok: true, routes: full.result.routes, ms: full.ms } : full;
    let r = g.plain.get(name);
    if (r === undefined) {
      r = plainRoute(name, g.graph, now);
      g.plain.set(name, r);
    }
    return r;
  };
  const recordOf = (
    entry: PackEntry,
    router: string,
    run: Extract<PackRun, { ok: true }>,
    g: PackGroup,
    route: RouteRun,
    packMs: number,
    totalMs: number,
    deterministic: boolean,
    id?: string,
    extra?: Readonly<Record<string, unknown>>,
    more: Readonly<Record<string, number>> = {},
  ): LayoutRecord => {
    const t0 = now();
    const joint = jointMeasures(g.facts, route.result.routes, edgeCount - g.packed.dropped, target);
    const jointMs = now() - t0;
    const measures = finite({
      ...run.measures,
      "pack.ms": packMs,
      ...route.measures,
      ...joint,
      "joint.overflow.edges": g.packed.dropped,
      "joint.routes": route.result.routes.length,
      "joint.ms": totalMs,
      ...route.times,
      "time.placement.ms": g.placementMs,
      "time.joint.ms": jointMs,
      ...more,
    });
    return toLayoutRecord(input, {
      ...factsOf(entry, router, id, extra),
      measures,
      hard: { ...run.hard, ...route.hard },
      deterministic,
      ms: totalMs,
      outputHash: jointHash(run.hash, route.hash),
    });
  };

  for (const entry of packs) {
    const run = packOnce(entry, packInput, cell, seed, now);
    packRuns.set(entry.id, run);
    if (!run.ok) {
      for (const router of routers) records.push(skippedRecord(entry, router, run.reason));
      continue;
    }
    const g = groupOf(run, entry.id);
    for (const router of routers) {
      const route = routeOf(g, router);
      if (!route.ok) {
        records.push(skippedRecord(entry, router, route.reason));
        continue;
      }
      records.push(recordOf(entry, router, run, g, route, run.ms, run.ms + route.ms, run.deterministic && route.deterministic));
    }
  }

  const laneOpts: Required<LaneOptions> = {
    clearance: options.laneOptions?.clearance ?? LANE_CLEARANCE,
    space: options.laneOptions?.space ?? LANE_SPACE,
    cap: options.laneOptions?.cap ?? LANE_CAP,
  };
  const gap = input.gap ?? 0;
  for (const lane of options.lanes ?? []) {
    const entry = packs.find((p) => p.id === lane.pack) ?? PACK_ENTRIES.find((p) => p.id === lane.pack);
    if (entry === undefined) throw new RangeError(`There is no pack entry "${lane.pack}" for the lane pair "${lane.id}".`);
    const extra = { lanes: { variant: lane.variant.name, mode: lane.variant.mode, passes: lane.variant.passes, base: pairId(lane.pack, lane.router), ...laneOpts } };
    const skip = (reason: string): void => void records.push(skippedRecord(entry, lane.router, reason, lane.id, extra));
    let run = packRuns.get(lane.pack) ?? packOnce(entry, packInput, cell, seed, now);
    packRuns.set(lane.pack, run);
    if (!run.ok) {
      skip(run.reason);
      continue;
    }
    let g = groupOf(run, entry.id);
    let routes = plainOf(g, lane.router);
    if (!routes.ok) {
      skip(routes.reason);
      continue;
    }
    // The first pass is the base pair: its pack time and its route time count in the time of the lane pair.
    let packMs = run.ms;
    let totalMs = run.ms + routes.ms;
    let deterministic = run.deterministic;
    let laneMs = 0;
    let boxes: readonly LayoutBox[] = input.boxes;
    const ids = new Set(input.boxes.map((b) => b.id));
    let t0 = now();
    const first = sideLanes(g.graph, routes.routes, ids, laneOpts);
    laneMs += now() - t0;
    let lanes = first;
    let failed: string | undefined;
    let final: RouteRun | undefined;
    for (let pass = 1; pass <= lane.variant.passes; pass++) {
      if (pass > 1) {
        t0 = now();
        lanes = sideLanes(g.graph, routes.routes, ids, laneOpts);
        laneMs += now() - t0;
      }
      boxes = laneMargins(boxes, run.output.placements, lanes, gap, lane.variant.mode, laneOpts);
      const next = packInputOf({ ...input, boxes });
      run = packOnce(entry, next, cell, seed, now, packInput);
      if (!run.ok) {
        failed = run.reason;
        break;
      }
      packMs += run.ms;
      deterministic &&= run.deterministic;
      g = groupOf(run, lane.id);
      if (pass < lane.variant.passes) {
        routes = plainOf(g, lane.router);
        if (!routes.ok) {
          failed = routes.reason;
          break;
        }
        totalMs += run.ms + routes.ms;
      } else {
        const route = routeOf(g, lane.router);
        if (!route.ok) {
          failed = route.reason;
          break;
        }
        totalMs += run.ms + route.ms;
        deterministic &&= route.deterministic;
        final = route;
      }
    }
    if (failed !== undefined || final === undefined || !run.ok) {
      skip(failed ?? "error: the lane pair has no final route");
      continue;
    }
    t0 = now();
    const last = sideLanes(g.graph, final.result.routes, ids, laneOpts);
    laneMs += now() - t0;
    const more = {
      "lanes.short.base": shortSides(first, laneOpts),
      "lanes.short": shortSides(last, laneOpts),
      "lanes.max.base": maxLanes(first),
      "lanes.max": maxLanes(last),
      "lanes.margin": marginGrowth(input.boxes, boxes),
      "time.lanes.ms": laneMs,
    };
    records.push(recordOf(entry, lane.router, run, g, final, packMs, totalMs, deterministic, lane.id, extra, more));
  }
  return records;
}

/** The shared facts of one pack output: the packed input, its graph and the routes of each router. Pack entries with the same output share them. */
interface PackGroup {
  readonly packed: PackedInput;
  readonly facts: PlacementFacts;
  readonly graph: Graph;
  readonly check: (result: Result) => PortfolioFacts;
  /** The routes of `routeOnce`, with the measures, by router. */
  readonly routes: Map<string, RouteRun | RouteMiss>;
  /** The plain routes of the passes of a lane pair before its last pass, by router. */
  readonly plain: Map<string, PlainRoute | RouteMiss>;
  readonly placementMs: number;
}

/** The routes of one router without the measures, for a pass of a lane pair before its last pass. */
interface PlainRoute {
  readonly ok: true;
  readonly routes: readonly Result["routes"][number][];
  readonly ms: number;
}

/** This function routes one graph one time with one router, without the measures. */
function plainRoute(name: string, graph: Graph, now: () => number): PlainRoute | RouteMiss {
  const router = routerOf(name);
  if (graph.nodes.length > (router.maxNodes ?? Infinity)) return { ok: false, reason: `The graph has ${graph.nodes.length} nodes, above the limit ${router.maxNodes} of the router.` };
  try {
    const t0 = now();
    const result = router.route(graph);
    return { ok: true, routes: result.routes, ms: now() - t0 };
  } catch (e) {
    return { ok: false, reason: `error: ${messageOf(e)}` };
  }
}

/** This function gives the inputs of one shard: each input whose place in the list, modulo `shards`, is `shard`. */
export function shardOf<T>(items: readonly T[], shard: number, shards: number): T[] {
  if (!(Number.isInteger(shards) && shards >= 1 && Number.isInteger(shard) && shard >= 0 && shard < shards)) throw new RangeError(`The shard is an integer from 0 to ${shards - 1}, not ${shard}.`);
  return items.filter((_, i) => i % shards === shard);
}
