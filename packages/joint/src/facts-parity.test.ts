// The local cap and mixed counts of the first joint run, against `portfolioFacts` of `highways`. Only this test keeps the local code.
// The test also compares `routeFacts` of the runner with `portfolioFacts`: the two functions give the same facts.
import { RECORD_EPS, type LayoutInput } from "@mark1russell7/layout-contract";
import { asRouter, byCollection, inputGraph, portfolioFacts, portfolioRouter, routerStrategies, type Graph, type Result, type Strategy } from "@mark1russell7/highways";
import { packWith } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { polylineLength, type JointRoute } from "./joint-measures.ts";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { CAPS, packedInput, packInputOf, routeFacts } from "./runner.ts";

/** The local count of the mixed shared segments of the first run: the runs and the bundles with edges of 2 collections or more. */
function localMixed(graph: Graph, result: Result): number {
  const key = new Map(graph.edges.map((e) => [e.id, byCollection(e) ?? `\u0000${e.id}`]));
  const shared = [...(result.runs ?? []).map((r) => r.edges), ...(result.bundles ?? []).map((b) => b.edges)];
  return shared.filter((edges) => new Set(edges.map((e) => key.get(e))).size > 1).length;
}

/** The local cap count of the first run: the routes with a length above the cap times the length of the route of `corners`. */
function localCaps(routes: readonly JointRoute[], base: readonly JointRoute[]): Record<number, number> {
  const out: Record<number, number> = Object.fromEntries(CAPS.map((c) => [c, 0]));
  const baseLength = new Map(base.map((r) => [r.edge, polylineLength(r.points)]));
  for (const r of routes) {
    const b = baseLength.get(r.edge);
    if (b === undefined || b <= 1 || r.points.length < 2) continue;
    const stretch = polylineLength(r.points) / b;
    for (const c of CAPS) if (stretch > c + RECORD_EPS) out[c]! += 1;
  }
  return out;
}

const route = (name: string, graph: Graph): Result => asRouter((routerStrategies as unknown as Record<string, Strategy<"router", object>>)[name]!).route(graph);

/** A row of 6 boxes in a fixed container, with edges of 2 collections. */
const row: LayoutInput = {
  schema: "layout-input/1",
  id: "test/row/s1",
  seed: 1,
  gap: 10,
  container: { fixed: "size", w: 400, h: 200 },
  boxes: ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, w: 20 + 5 * i, h: 20 })),
  edges: [
    { id: "e0", source: "a", target: "f", data: { collection: "users" } },
    { id: "e1", source: "b", target: "f", data: { collection: "users" } },
    { id: "e2", source: "c", target: "e", data: { collection: "orders" } },
    { id: "e3", source: "a", target: "d", data: { collection: "orders" } },
    { id: "e4", source: "b", target: "e", data: { collection: "users" } },
  ],
};

describe("portfolioFacts and the local code of the first run", () => {
  const routers = Object.keys(routerStrategies);
  // The tiny input of this file, and seed 1 of 4 inputs of joint-v2 with 10 boxes outside the stress cell. The pack is rows.
  const { manifest, inputs } = jointCorpus(SET_V2);
  const tiny = [row, ...inputs.filter((f, i) => f.seed === 1 && manifest.inputs[i]!.cell.count === "10" && manifest.inputs[i]!.stress !== true).slice(0, 4)];
  const cases = tiny.map((input) => {
    const output = packWith("rows", packInputOf(input), {}, 1);
    const graph = inputGraph(packedInput(input, output, "rows").input as unknown as Parameters<typeof inputGraph>[0]);
    return { id: input.id, graph, facts: portfolioFacts(graph), local: routeFacts(graph), base: route("corners", graph).routes };
  });

  it("gives the facts of portfolioFacts in routeFacts, with exactStretches for the caps", () => {
    for (const c of cases) {
      for (const name of [...routers, "portfolio"]) {
        const result = name === "portfolio" ? portfolioRouter().route(c.graph) : route(name, c.graph);
        const a = c.facts(result);
        const b = c.local(result);
        expect(b.hard, `${c.id} ${name}`).toEqual(a.hard);
        expect(b.mixed, `${c.id} ${name}`).toBe(a.mixed);
        for (const cap of [1, ...CAPS, 2]) expect(b.over(cap), `${c.id} ${name} ${cap}`).toBe(a.over(cap));
      }
    }
  });

  it("gives the same count of mixed segments for each router", () => {
    for (const c of cases) {
      for (const name of routers) {
        const result = route(name, c.graph);
        expect(c.facts(result).mixed, `${c.id} ${name}`).toBe(localMixed(c.graph, result));
      }
    }
  });

  it("gives cap counts that differ from the local counts against corners", () => {
    const differ: string[] = [];
    for (const c of cases) {
      for (const name of routers) {
        const result = route(name, c.graph);
        const local = localCaps(result.routes, c.base);
        const f = c.facts(result);
        if (name === "corners") for (const cap of CAPS) expect(local[cap]).toBe(0);
        for (const cap of CAPS) if (f.over(cap) !== local[cap]) differ.push(`${c.id} ${name} ${cap}`);
      }
    }
    // The exact model measures each route against the shortest way of its network, not against the route of corners. Thus the counts differ.
    expect(differ.length).toBeGreaterThan(0);
  });
});
