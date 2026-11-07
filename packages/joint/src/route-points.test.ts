// The routers of the joint runner as points of `routeSpace` (roadmap item L34). Each point has the routes of its router on a small set of inputs of `joint-v1`.
import { inputGraph, MEMBER_FORMS, type Result, routeConfig, routeSpace } from "@mark1russell7/highways";
import { applyPack, checkConfig, type LayoutInput, type StrategySpace } from "@mark1russell7/layout-contract";
import { packWith, UnsupportedCell } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointInput, jointSpecs, SET } from "./corpus.ts";
import { coverRouters } from "./cover.ts";
import { PACK_ENTRIES, packInputOf, PORTFOLIO_ROUTER, routeHash, routerEntryOf, routerOf, ROUTERS } from "./runner.ts";

/** The strategy space of `highways`, with the type of `layout-contract`. */
const SPACE = routeSpace as unknown as StrategySpace;

/**
 * The router entries of `KEYED_STRATEGIES` that `routeSpace` of `highways` 0.15.0 does not name (L129).
 * The cover races them, but this test cannot compare a point with them. The fix belongs to `highways`.
 */
const UNNAMED_ROUTERS: readonly string[] = ["adam", "annealing", "attraction", "canals", "nudge", "repel", "reroute", "springs", "tight", "seams", "shared-ways-all"];

/** The largest count of boxes of an input of the set. */
const MAX_BOXES = 30;

/** The graph type of `highways`, as `inputGraph` gives it. */
type Graph = ReturnType<typeof inputGraph>;

/** This function gives the first input of each container kind and obstacle case, with at most `MAX_BOXES` boxes. Each input is the first seed of its spec. */
function testInputs(): LayoutInput[] {
  const picks = new Map<string, LayoutInput>();
  for (const spec of jointSpecs(SET)) {
    const { input } = jointInput(spec, spec.seeds[0]!, SET);
    if (input.boxes.length > MAX_BOXES) continue;
    const pack = packInputOf(input);
    const key = `${pack.container.fixed}/${(pack.obstacles?.length ?? 0) > 0}`;
    if (!picks.has(key)) picks.set(key, input);
  }
  return [...picks.values()];
}

/** This function packs an input with the first pack entry that supports it, and gives the graph of the placed boxes. */
function graphOf(input: LayoutInput): Graph {
  const pack = packInputOf(input);
  for (const entry of PACK_ENTRIES) {
    try {
      const packed = applyPack(input, packWith(entry.strategy, pack, entry.options, input.seed ?? 0));
      return inputGraph(packed as unknown as Parameters<typeof inputGraph>[0]);
    } catch (error) {
      if (!(error instanceof UnsupportedCell)) throw error;
    }
  }
  throw new RangeError(`No pack entry supports the input ${input.id}.`);
}

/** This function gives the hash of the routes of a run, or the message of its error. A point and its router have one of them. */
function hashOf(run: () => Result): string {
  try {
    return routeHash(run());
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("the routers of the cover as points of routeSpace", () => {
  const all = [...ROUTERS, ...coverRouters()];
  const routers = all.filter((id) => SPACE.named?.[id] !== undefined);
  const inputs = testInputs();

  it("has a named point for each router, apart from the portfolio, its member forms and the closed list of routers with no point", () => {
    // `routeSpace` does not name these routers, and `highways` gives no function from a member form to a config. `docs/STRATEGY-SPACE.md` gives the gap.
    const others = all.filter((id) => SPACE.named?.[id] === undefined);
    // Each router with no point is in the closed list, and each router of the list has no point. When `highways` names one, remove it from the list.
    expect(others.filter((id) => id !== PORTFOLIO_ROUTER && MEMBER_FORMS[id] === undefined).sort()).toEqual([...UNNAMED_ROUTERS].sort());
    expect([routers.length, others.length]).toEqual([76, 86]);
  });

  it("gives points that pass the checks of routeSpace", () => {
    for (const id of routers) {
      const point = SPACE.named?.[id];
      if (point !== undefined) expect(checkConfig(SPACE, point), id).toEqual([]);
    }
  });

  it("has an input of each container kind, with and without obstacles", () => {
    expect(inputs).toHaveLength(8);
  });

  it("gives with routeConfig the routes of the router on each input", () => {
    const graphs = inputs.map((input) => ({ id: input.id, graph: graphOf(input) }));
    const routed = new Map<string, number>();
    for (const { id: input, graph } of graphs) {
      for (const id of routers) {
        const point = SPACE.named?.[id];
        if (point === undefined) continue;
        const want = hashOf(() => routerOf(routerEntryOf(id)).route(graph));
        expect(hashOf(() => routeConfig(graph, point)), `${id} ${input}`).toBe(want);
        if (!want.startsWith("error:")) routed.set(id, (routed.get(id) ?? 0) + 1);
      }
    }
    // A router with an error on each input has no comparison of a hash.
    expect(routers.filter((id) => !routed.has(id))).toEqual([]);
  }, 300_000);
});
