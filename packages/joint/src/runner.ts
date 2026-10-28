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
import { checkHard, measure, outputHash as packHash, packWith, strategy as packStrategy, unsupportedOf } from "@mark1russell7/packing";
import {
  asRouter,
  benchRun,
  byCollection,
  checkProperties,
  inputGraph,
  measureName,
  routeMeasures,
  routerStrategies,
  type Graph,
  type Result,
  type Router,
  type Strategy,
} from "@mark1russell7/highways";
import { jointMeasures, placementFacts, polylineLength, type JointRoute, type PlacementFacts } from "./joint-measures.ts";

/** One pack entry: a strategy of `packing` with options over its defaults. The id names the entry in the records. */
export interface PackEntry {
  readonly id: string;
  readonly strategy: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * The pack entries of the joint runner: the entries of the benchmark of `packing` 0.2.6 (`bench/entries.ts`) without `push`.
 * The strategy `push` supports only the mode `incremental`, and each input of `joint-v1` has the mode `offline`.
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
]);

/** The routers of the joint runner: the 9 router strategies of `highways` 0.5.0, in the order of its benchmark. */
export const ROUTERS: readonly string[] = Object.freeze(Object.keys(routerStrategies));

/** The router that gives the base routes of the stretch, as B3 of `highways`. */
export const BASE_ROUTER = "corners";

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
  /** The id of the corpus. The default is `joint-v1`. */
  readonly corpus?: string;
  readonly env?: RunEnv;
  readonly commit?: string;
  /** The clock in milliseconds. The default is `performance.now`. */
  readonly now?: () => number;
}

/** This function gives the facts of the computer of this run. */
export function runEnv(): RunEnv {
  const list = cpus();
  return { node: process.version, os: platform(), arch: arch(), runner: process.env["RUNNER_NAME"] ?? "local", cpu: list[0]?.model ?? "unknown", cpus: list.length };
}

/** This function gives the input of the packer: the boxes without `group` and `parent`. No strategy of `packing` 0.2.6 supports groups. */
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

/** This function gives the count of the shared segments (the runs and the bundles) with edges of 2 collections or more. An edge without a collection has its own key. */
export function mixedSegments(graph: Graph, result: Result): number {
  const key = new Map(graph.edges.map((e) => [e.id, byCollection(e) ?? `\u0000${e.id}`]));
  const shared = [...(result.runs ?? []).map((r) => r.edges), ...(result.bundles ?? []).map((b) => b.edges)];
  return shared.filter((edges) => new Set(edges.map((e) => key.get(e))).size > 1).length;
}

/**
 * This function gives the count of the routes with a stretch above each cap, by the measure name `route.cap.<cap>`.
 * The stretch of a route is its length divided by the length of the base route of its edge. A base route of 1 unit or less does not count.
 */
export function capBreaks(routes: readonly JointRoute[], base: readonly JointRoute[] | undefined, caps: readonly number[] = CAPS): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(caps.map((c) => [`route.cap.${c}`, 0]));
  if (base === undefined) return out;
  const baseLength = new Map(base.map((r) => [r.edge, polylineLength(r.points)]));
  for (const r of routes) {
    const b = baseLength.get(r.edge);
    if (b === undefined || b <= 1 || r.points.length < 2) continue;
    const stretch = polylineLength(r.points) / b;
    for (const c of caps) if (stretch > c + RECORD_EPS) out[`route.cap.${c}`]! += 1;
  }
  return out;
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

/** This function gives the router of a name. */
function routerOf(name: string): Router {
  const s = (routerStrategies as unknown as Readonly<Record<string, Strategy<"router", object>>>)[name];
  if (s === undefined) throw new RangeError(`There is no router "${name}". The routers are ${ROUTERS.join(", ")}.`);
  return asRouter(s);
}

/** This function routes one graph with one router and measures the result. */
function routeOnce(name: string, graph: Graph, fixture: string, repeat: number): RouteRun | RouteMiss {
  const router = routerOf(name);
  if (graph.nodes.length > (router.maxNodes ?? Infinity)) return { ok: false, reason: `The graph has ${graph.nodes.length} nodes, above the limit ${router.maxNodes} of the router.` };
  try {
    const { row, result } = benchRun(router, fixture, graph, repeat);
    const hard: Record<string, number> = { "route.violations": row.violations };
    if (row.violations > 0) for (const v of checkProperties(graph, result, 1_000_000)) hard[`route.${v.rule}`] = (hard[`route.${v.rule}`] ?? 0) + 1;
    const keyed = routeMeasures(graph, result, row);
    const measures: Record<string, number> = { "route.ms": row.ms };
    for (const [key, value] of Object.entries(keyed)) measures[measureName(key)] = value;
    measures["route.mixed"] = mixedSegments(graph, result);
    return { ok: true, result, hash: routeHash(result), ms: row.ms, deterministic: row.deterministic, measures: finite(measures), hard };
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

/** This function packs one input with one entry two times, for the time and for the rule "same twice". */
function packOnce(entry: PackEntry, input: PackInput, cell: Readonly<Record<string, unknown>> | undefined, seed: number, now: () => number): PackRun {
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
    const hard = Object.fromEntries(Object.entries(checkHard(input, output, undefined, { exactContainer: true })).map(([k, v]) => [`pack.${k}`, v]));
    const measures = finite(measure(input, output) as unknown as Record<string, number>);
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
  const shared = new Map<string, { packed: PackedInput; facts: PlacementFacts; graph: Graph; routes: Map<string, RouteRun | RouteMiss> }>();

  const factsOf = (entry: PackEntry, router: string) => ({
    stage: "joint" as const,
    step: "joint",
    strategy: pairId(entry.id, router),
    options: { pack: entry.id, packStrategy: entry.strategy, packOptions: fullOptions(entry), router },
    corpus: options.corpus ?? "joint-v1",
    seed,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.commit === undefined ? {} : { commit: options.commit }),
  });
  const skippedRecord = (entry: PackEntry, router: string, reason: string): LayoutRecord =>
    toLayoutRecord(input, { ...factsOf(entry, router), measures: {}, hard: {}, deterministic: true, ms: 0, skipped: reason });

  for (const entry of packs) {
    const run = packOnce(entry, packInput, cell, seed, now);
    if (!run.ok) {
      for (const router of routers) records.push(skippedRecord(entry, router, run.reason));
      continue;
    }
    const key = `${run.hash}:${JSON.stringify(run.output.moved)}`;
    let group = shared.get(key);
    if (group === undefined) {
      const packed = packedInput(input, run.output, entry.id);
      const boxes: readonly LayoutBox[] = packed.input.boxes;
      const edges: readonly LayoutEdge[] = packed.input.edges ?? [];
      group = { packed, facts: placementFacts(boxes, edges), graph: inputGraph(packed.input as unknown as Parameters<typeof inputGraph>[0]), routes: new Map() };
      shared.set(key, group);
    }
    const g = group;
    const routeOf = (name: string): RouteRun | RouteMiss => {
      let r = g.routes.get(name);
      if (r === undefined) {
        r = routeOnce(name, g.graph, g.packed.input.id, repeat);
        g.routes.set(name, r);
      }
      return r;
    };
    const baseRun = routeOf(BASE_ROUTER);
    const baseRoutes = baseRun.ok ? baseRun.result.routes : undefined;
    for (const router of routers) {
      const route = routeOf(router);
      if (!route.ok) {
        records.push(skippedRecord(entry, router, route.reason));
        continue;
      }
      const joint = jointMeasures(g.facts, route.result.routes, edgeCount - g.packed.dropped, target);
      const ms = run.ms + route.ms;
      const measures = finite({
        ...run.measures,
        "pack.ms": run.ms,
        ...route.measures,
        ...capBreaks(route.result.routes, baseRoutes),
        ...joint,
        "joint.overflow.edges": g.packed.dropped,
        "joint.routes": route.result.routes.length,
        "joint.ms": ms,
      });
      records.push(
        toLayoutRecord(input, {
          ...factsOf(entry, router),
          measures,
          hard: { ...run.hard, ...route.hard },
          deterministic: run.deterministic && route.deterministic,
          ms,
          outputHash: jointHash(run.hash, route.hash),
        }),
      );
    }
  }
  return records;
}

/** This function gives the inputs of one shard: each input whose place in the list, modulo `shards`, is `shard`. */
export function shardOf<T>(items: readonly T[], shard: number, shards: number): T[] {
  if (!(Number.isInteger(shards) && shards >= 1 && Number.isInteger(shard) && shard >= 0 && shard < shards)) throw new RangeError(`The shard is an integer from 0 to ${shards - 1}, not ${shard}.`);
  return items.filter((_, i) => i % shards === shard);
}
