// The joint runner of roadmap item L9 (`docs/JOINT-BENCH.md`). It packs each input, then routes the packed input, for each pair of a pack entry and a router.
// It does not use Node, so the site operates it in a Web Worker. `runEnv` is in `src/env.ts`.
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
import {
  ITER_FLOOR_SPACE,
  iterMargins,
  LANE_CAP,
  LANE_CLEARANCE,
  LANE_SEPARATOR,
  LANE_SPACE,
  laneMargins,
  marginGrowth,
  maxLanes,
  shortSides,
  sideLanes,
  type BoxLanes,
  type IterEntry,
  type LaneEntry,
  type LaneOptions,
} from "./lanes.ts";
import { compareRecords } from "./pick.ts";

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

/**
 * One router entry: a router strategy of `highways`, or `portfolio`, with options over its defaults. The id names the entry in the pair ids.
 * A router name of `RunOptions.routers` is the entry with that id and no options.
 */
export interface RouterEntry {
  readonly id: string;
  /** The name of a router strategy of `highways`, or `portfolio` for `portfolioRouter`. */
  readonly router: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/** This function gives the router entry of a router name or of an entry. A name gives the entry with no options. */
export function routerEntryOf(router: string | RouterEntry): RouterEntry {
  return typeof router === "string" ? { id: router, router, options: {} } : router;
}

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
  /** The router names or router entries. The default is `ROUTERS`. */
  readonly routers?: readonly (string | RouterEntry)[];
  /**
   * The ids of the pairs to run, for example `rows+corners`. The default is each pair of `packs` and `routers`.
   * With this list, the runner runs only the pairs of the list, and packs only the entries of these pairs and of the lane pairs.
   */
  readonly pairs?: readonly string[];
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
  /** The options of the lane count and of the lane margins. The options of a lane entry replace them for that entry. */
  readonly laneOptions?: LaneOptions;
  /**
   * The iteration pairs of L11 (`iterEntries`). The default is none, so the default plan does not change.
   * Each iteration pair gives one more record after the records of the lane pairs.
   */
  readonly iterate?: readonly IterEntry[];
  /** The least space between two facing sides of an iteration pair. The default is `ITER_FLOOR_SPACE`. */
  readonly iterFloor?: number;
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

/** This function gives the router of an entry: a router strategy of `highways`, or `portfolio` for `portfolioRouter()`, with the options of the entry. */
function routerOf(entry: RouterEntry): Router {
  const custom = Object.keys(entry.options).length > 0;
  if (entry.router === PORTFOLIO_ROUTER) return custom ? portfolioRouter(entry.options) : portfolioRouter();
  const s = (routerStrategies as unknown as Readonly<Record<string, Strategy<"router", object>>>)[entry.router];
  if (s === undefined) throw new RangeError(`There is no router "${entry.router}". The routers are ${ROUTERS.join(", ")}.`);
  return custom ? asRouter(s, entry.options) : asRouter(s);
}

/**
 * This function routes one graph with one router and measures the result. `facts` is the function of `routeFacts` of the graph.
 * The result holds the time of each step in `times` (`time.bench.ms`, `time.facts.ms`, `time.measures.ms` and `time.hash.ms`).
 */
function routeOnce(name: RouterEntry, graph: Graph, facts: (result: Result) => PortfolioFacts, fixture: string, repeat: number, now: () => number): RouteRun | RouteMiss {
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

/** The result of one pair: its record, and the pack and the routes of a pair that did not skip. The site draws them. */
export interface PairRun {
  readonly record: LayoutRecord;
  /** The packed input that the router got: the placed boxes and their edges. A pair with a skipped pack has none. */
  readonly packed?: PackedInput;
  /** The output of the pack. A pair with a skipped pack has none. */
  readonly pack?: PackOutput;
  /** The output of the router. A skipped pair has none. */
  readonly result?: Result;
}

/**
 * This function packs and routes one input with each pair of a pack entry and a router, one pair at each step. It gives the result of each pair.
 * The records are the records of `runInput`, in the same order. A caller can stop after each pair, for example to show progress.
 */
export function* pairRuns(input: LayoutInput, cell: Readonly<Record<string, unknown>> | undefined, options: RunOptions = {}): Generator<PairRun, void, undefined> {
  const packs = options.packs ?? PACK_ENTRIES;
  const routerEntries = (options.routers ?? ROUTERS).map(routerEntryOf);
  const routers = routerEntries.map((r) => r.id);
  const byId = new Map(routerEntries.map((r) => [r.id, r]));
  const entryOf = (id: string): RouterEntry => byId.get(id) ?? routerEntryOf(id);
  const only = options.pairs === undefined ? undefined : new Set(options.pairs);
  const repeat = options.repeat ?? 2;
  const now = options.now ?? ((): number => performance.now());
  const seed = input.seed ?? 0;
  const packInput = packInputOf(input);
  const target = input.container?.aspect ?? 1;
  const edgeCount = input.edges?.length ?? 0;
  const shared = new Map<string, PackGroup>();
  const packRuns = new Map<string, PackRun>();
  const iterating = (options.iterate?.length ?? 0) > 0;
  const jointOf = new WeakMap<RouteRun, { readonly values: ReturnType<typeof jointMeasures>; readonly ms: number }>();

  const factsOf = (entry: PackEntry, router: string, id: string = entry.id, extra: Readonly<Record<string, unknown>> = {}) => ({
    stage: "joint" as const,
    step: "joint",
    strategy: pairId(id, router),
    options: { pack: id, packStrategy: entry.strategy, packOptions: fullOptions(entry), router, ...routerFacts(entryOf(router)), ...extra },
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
      r = routeOnce(entryOf(name), g.graph, g.check, g.packed.input.id, repeat, now);
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
      r = plainRoute(entryOf(name), g.graph, now);
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
    // The joint measures depend only on the group and its routes. With iteration pairs, a round and its record share them. A run without them does not change.
    let cached = iterating ? jointOf.get(route) : undefined;
    if (cached === undefined) {
      const t0 = now();
      const values = jointMeasures(g.facts, route.result.routes, edgeCount - g.packed.dropped, target);
      cached = { values, ms: now() - t0 };
      if (iterating) jointOf.set(route, cached);
    }
    const joint = cached.values;
    const jointMs = cached.ms;
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
    const mine = only === undefined ? routers : routers.filter((router) => only.has(pairId(entry.id, router)));
    if (mine.length === 0) continue;
    const run = packOnce(entry, packInput, cell, seed, now);
    packRuns.set(entry.id, run);
    if (!run.ok) {
      for (const router of mine) yield { record: skippedRecord(entry, router, run.reason) };
      continue;
    }
    const g = groupOf(run, entry.id);
    for (const router of mine) {
      const route = routeOf(g, router);
      if (!route.ok) {
        yield { record: skippedRecord(entry, router, route.reason), packed: g.packed, pack: run.output };
        continue;
      }
      yield { record: recordOf(entry, router, run, g, route, run.ms, run.ms + route.ms, run.deterministic && route.deterministic), packed: g.packed, pack: run.output, result: route.result };
    }
  }

  const runLane: Required<LaneOptions> = {
    clearance: options.laneOptions?.clearance ?? LANE_CLEARANCE,
    space: options.laneOptions?.space ?? LANE_SPACE,
    cap: options.laneOptions?.cap ?? LANE_CAP,
  };
  const gap = input.gap ?? 0;
  for (const lane of options.lanes ?? []) {
    const laneOpts: Required<LaneOptions> = { ...runLane, ...lane.options };
    const entry = packs.find((p) => p.id === lane.pack) ?? PACK_ENTRIES.find((p) => p.id === lane.pack);
    if (entry === undefined) throw new RangeError(`There is no pack entry "${lane.pack}" for the lane pair "${lane.id}".`);
    const extra = { lanes: { variant: lane.variant.name, mode: lane.variant.mode, passes: lane.variant.passes, base: pairId(lane.pack, lane.router), ...laneOpts } };
    // A generator cannot yield in a closure, so each skip of a lane pair yields its record here.
    const skip = (reason: string): PairRun => ({ record: skippedRecord(entry, lane.router, reason, lane.id, extra) });
    let run = packRuns.get(lane.pack) ?? packOnce(entry, packInput, cell, seed, now);
    packRuns.set(lane.pack, run);
    if (!run.ok) {
      yield skip(run.reason);
      continue;
    }
    let g = groupOf(run, entry.id);
    let routes = plainOf(g, lane.router);
    if (!routes.ok) {
      yield skip(routes.reason);
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
      yield skip(failed ?? "error: the lane pair has no final route");
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
    yield { record: recordOf(entry, lane.router, run, g, final, packMs, totalMs, deterministic, lane.id, extra, more), packed: g.packed, pack: run.output, result: final.result };
  }

  // The iteration pairs of L11. Each pack entry and router has one chain of rounds. The round caps of its iteration pairs read prefixes of the chain.
  // The iteration pairs use the lane options of the run. An iteration entry has no options of its own.
  const laneOpts = runLane;
  const floor = options.iterFloor ?? ITER_FLOOR_SPACE;
  const inputIds = new Set(input.boxes.map((b) => b.id));
  const chains = new Map<string, IterChain | { readonly ok: false; readonly reason: string }>();
  /** This function counts the lanes of the routes of a round one time, and adds the time to `ms`. */
  const lanesOf = (round: IterRound): { readonly lanes: Map<string, BoxLanes>; readonly ms: number } => {
    if (round.lanes === undefined) {
      const t0 = now();
      const lanes = sideLanes(round.g.graph, round.route.result.routes, inputIds, laneOpts);
      round.lanes = { lanes, ms: now() - t0 };
    }
    return round.lanes;
  };
  /** This function packs and routes one round with the boxes of `boxes`, after the round `prev`. It gives the round, or the reason of a failure. */
  const roundOf = (entry: PackEntry, router: string, boxes: readonly LayoutBox[], prev: Totals, laneMs: number, best: (r: LayoutRecord) => number): IterRound | string => {
    const run = packOnce(entry, packInputOf({ ...input, boxes }), cell, seed, now, packInput);
    if (!run.ok) return run.reason;
    const g = groupOf(run, `${ITER_PREFIX_ID}${LANE_SEPARATOR}${entry.id}`);
    const route = routeOf(g, router);
    if (!route.ok) return route.reason;
    const totals: Totals = {
      packMs: prev.packMs + run.ms,
      totalMs: prev.totalMs + run.ms + route.ms,
      laneMs: prev.laneMs + laneMs,
      deterministic: prev.deterministic && run.deterministic && route.deterministic,
    };
    const score = recordOf(entry, router, run, g, route, totals.packMs, totals.totalMs, totals.deterministic);
    return { run, g, route, boxes, score, best: best(score), totals };
  };
  /** This function starts the chain of a pack entry and a router: the base pair, then round 1 with the margins of `lanes-sides`. */
  const startChain = (entry: PackEntry, router: string): IterChain | { readonly ok: false; readonly reason: string } => {
    const run = packRuns.get(entry.id) ?? packOnce(entry, packInput, cell, seed, now);
    packRuns.set(entry.id, run);
    if (!run.ok) return { ok: false, reason: run.reason };
    const g = groupOf(run, entry.id);
    const routes = plainOf(g, router);
    if (!routes.ok) return { ok: false, reason: routes.reason };
    const t0 = now();
    const first = sideLanes(g.graph, routes.routes, inputIds, laneOpts);
    const boxes = laneMargins(input.boxes, run.output.placements, first, gap, "sides", laneOpts);
    const laneMs = now() - t0;
    const round = roundOf(entry, router, boxes, { packMs: run.ms, totalMs: run.ms + routes.ms, laneMs: 0, deterministic: run.deterministic }, laneMs, () => 1);
    if (typeof round === "string") return { ok: false, reason: round };
    return { ok: true, entry, router, first, rounds: [round], widened: [0], narrowed: [0] };
  };
  /** This function adds rounds to a chain up to `cap` rounds. It stops at a round without gain, at a round with the same margins, and at a failure. */
  const growChain = (chain: IterChain, cap: number): void => {
    while (chain.rounds.length < cap && chain.stop === undefined) {
      const prev = chain.rounds[chain.rounds.length - 1]!;
      const index = chain.rounds.length + 1;
      const t0 = now();
      const { lanes, ms } = lanesOf(prev);
      const space = iterMargins(prev.boxes, input.boxes, prev.run.output.placements, lanes, gap, { ...laneOpts, floor });
      const laneMs = ms + (now() - t0);
      if (space.widened + space.narrowed === 0) {
        chain.stop = { reason: "fixed", at: index };
        break;
      }
      const top = chain.rounds[prev.best - 1]!;
      const round = roundOf(chain.entry, chain.router, space.boxes, prev.totals, laneMs, (score) => (compareRecords(score, top.score) === "better" ? index : prev.best));
      if (typeof round === "string") {
        chain.stop = { reason: "failed", at: index, detail: round };
        break;
      }
      chain.rounds.push(round);
      chain.widened.push(space.widened);
      chain.narrowed.push(space.narrowed);
      if (round.best !== index) chain.stop = { reason: "no-gain", at: index };
    }
  };
  for (const it of options.iterate ?? []) {
    const entry = packs.find((p) => p.id === it.pack) ?? PACK_ENTRIES.find((p) => p.id === it.pack);
    if (entry === undefined) throw new RangeError(`There is no pack entry "${it.pack}" for the iteration pair "${it.id}".`);
    const extra = { iterate: { variant: it.variant.name, rounds: it.variant.rounds, base: pairId(it.pack, it.router), start: "lanes-sides", floor, ...laneOpts } };
    const key = [it.pack, it.router].join(LANE_SEPARATOR);
    let chain = chains.get(key);
    if (chain === undefined) {
      chain = startChain(entry, it.router);
      chains.set(key, chain);
    }
    if (!chain.ok) {
      yield { record: skippedRecord(entry, it.router, chain.reason, it.id, extra) };
      continue;
    }
    growChain(chain, it.variant.rounds);
    const used = chain.rounds.slice(0, it.variant.rounds);
    const last = used[used.length - 1]!;
    const best = used[last.best - 1]!;
    const own = lanesOf(best);
    const stop = chain.stop !== undefined && chain.stop.at <= it.variant.rounds ? chain.stop.reason : "cap";
    const sum = (list: readonly number[]): number => list.slice(0, used.length).reduce((s, n) => s + n, 0);
    const more = {
      "iter.rounds": used.length,
      "iter.best": last.best,
      "iter.stop": ITER_STOPS.indexOf(stop),
      "iter.widened": sum(chain.widened),
      "iter.narrowed": sum(chain.narrowed),
      "lanes.short.base": shortSides(chain.first, laneOpts),
      "lanes.short": shortSides(own.lanes, laneOpts),
      "lanes.max.base": maxLanes(chain.first),
      "lanes.max": maxLanes(own.lanes),
      "lanes.margin": marginGrowth(input.boxes, best.boxes),
      "time.lanes.ms": last.totals.laneMs + (best === last ? own.ms : 0),
    };
    yield {
      record: recordOf(entry, it.router, best.run, best.g, best.route, last.totals.packMs, last.totals.totalMs, last.totals.deterministic, it.id, extra, more),
      packed: best.g.packed,
      pack: best.run.output,
      result: best.route.result,
    };
  }
}

/**
 * This function packs and routes one input with each pair of a pack entry and a router. It gives one `layout-record/1` for each pair.
 *
 * - The runner packs the input, drops the overflow boxes and their edges, and routes the placed boxes.
 * - Pack entries with the same output share the routes of each router.
 * - A strategy that does not support the cell, an error and a graph above the limit of a router give a record with `skipped`.
 * - The `hard` field holds the breaks of `checkHard` (`pack.*`) and of `checkProperties` (`route.*`).
 * - The measures hold `pack.*`, `route.*`, `joint.*`, the cap counts `route.cap.<cap>`, `route.mixed` and `joint.overflow.edges`.
 * - The measures `time.*` hold the time of the steps after the pack, in milliseconds. `docs/JOINT-BENCH.md` ("The runner") tells each step.
 * - With `lanes`, each lane pair gives one more record. Its pack part is the id of the lane entry, and `docs/JOINT-BENCH.md` ("The lane pairs") tells its passes.
 * - A router entry with options or with an id that is not its router name also writes `routerStrategy` and `routerOptions` in `options`.
 */
export function runInput(input: LayoutInput, cell: Readonly<Record<string, unknown>> | undefined, options: RunOptions = {}): LayoutRecord[] {
  return Array.from(pairRuns(input, cell, options), (r) => r.record);
}

/** This function gives the facts of a router entry for the options of a record. A plain router name gives none, so the records of the benchmark do not change. */
function routerFacts(entry: RouterEntry): Readonly<Record<string, unknown>> {
  return entry.id === entry.router && Object.keys(entry.options).length === 0 ? {} : { routerStrategy: entry.router, routerOptions: entry.options };
}

/** The part of the packed input id of a round of an iteration pair. */
const ITER_PREFIX_ID = "iter";

/**
 * The reasons of the end of the rounds of an iteration pair, in the order of the measure `iter.stop`.
 * `cap`: the pair used all its rounds. `no-gain`: the last round did not beat the best round. `fixed`: the next margins were the same. `failed`: a pack or a route failed.
 */
export const ITER_STOPS: readonly ("cap" | "no-gain" | "fixed" | "failed")[] = Object.freeze(["cap", "no-gain", "fixed", "failed"]);

/** The sums of the times of the rounds of an iteration pair, up to one round. */
interface Totals {
  readonly packMs: number;
  readonly totalMs: number;
  readonly laneMs: number;
  readonly deterministic: boolean;
}

/** One round of an iteration pair: the pack, the routes and the record of the scores. */
interface IterRound {
  readonly run: Extract<PackRun, { ok: true }>;
  readonly g: PackGroup;
  readonly route: RouteRun;
  readonly boxes: readonly LayoutBox[];
  /** The record of the round. Its pick values of the headline cell give the best round. */
  readonly score: LayoutRecord;
  /** The number of the best round of the rounds 1 to this round. */
  readonly best: number;
  /** The sums of the times of the base pair and of the rounds 1 to this round. */
  readonly totals: Totals;
  /** The lanes of the routes of this round, after the first count. */
  lanes?: { readonly lanes: Map<string, BoxLanes>; readonly ms: number };
}

/** The chain of rounds of one pack entry and one router. */
interface IterChain {
  readonly ok: true;
  readonly entry: PackEntry;
  readonly router: string;
  /** The lanes of the routes of the base pair. */
  readonly first: ReadonlyMap<string, BoxLanes>;
  readonly rounds: IterRound[];
  /** The count of the sides that each round widened and narrowed. Round 1 counts 0. */
  readonly widened: number[];
  readonly narrowed: number[];
  /** The end of the rounds, and the number of the round that ended them. */
  stop?: { readonly reason: (typeof ITER_STOPS)[number]; readonly at: number; readonly detail?: string };
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
function plainRoute(name: RouterEntry, graph: Graph, now: () => number): PlainRoute | RouteMiss {
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
