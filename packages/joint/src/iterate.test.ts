import type { LayoutInput, LayoutRecord } from "@mark1russell7/layout-contract";
import type { Graph, Route } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { analyze, laneRows, reportMarkdown, type AnalysisInput } from "./analysis.ts";
import {
  isIterPack,
  isLanePack,
  ITER_FLOOR_SPACE,
  ITER_ROUNDS,
  ITER_VARIANTS,
  iterEntries,
  iterMargins,
  iterPlanPairs,
  iterRoundsOf,
  laneEntries,
  laneParts,
  LANE_VARIANTS,
  sideCall,
  sideLanes,
} from "./lanes.ts";
import { compareRecords } from "./pick.ts";
import { ITER_STOPS, PACK_ENTRIES, runInput } from "./runner.ts";

/** Two boxes of 20 by 40 with a channel of 10 units between them, and two routes along the channel. */
const pair: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 20, h: 40 } },
    { id: "b", box: { x: 30, y: 0, w: 20, h: 40 } },
  ],
  edges: [],
};
const routes: Route[] = [
  { edge: "r0", points: [{ x: 25, y: -10 }, { x: 25, y: 50 }] },
  { edge: "r1", points: [{ x: 25, y: -10 }, { x: 25, y: 50 }] },
];

describe("iterEntries", () => {
  it("gives 18 iteration pairs with ids that parse, and one chain of rounds for each pack entry and router in the plan", () => {
    const entries = iterEntries();
    expect(entries).toHaveLength(18);
    expect(entries[0]!.id).toBe("lanes-iter1.rows.corners");
    expect(ITER_VARIANTS.map((v) => v.rounds)).toEqual([1, 2, 3]);
    for (const e of entries) {
      expect(isLanePack(e.id)).toBe(true);
      expect(isIterPack(e.id)).toBe(true);
      expect(iterRoundsOf(e.id)).toBe(e.variant.rounds);
      expect(laneParts(e.id)).toEqual({ variant: e.variant.name, pack: e.pack, router: e.router });
    }
    expect(iterRoundsOf("lanes-sides.rows.corners")).toBeUndefined();
    expect(iterRoundsOf("rows")).toBeUndefined();
    expect(laneEntries().some((e) => isIterPack(e.id))).toBe(false);
    // 6 chains of 3 rounds, with the cost of 3 pairs for each round.
    expect(iterPlanPairs(entries)).toBe(6 * ITER_ROUNDS * 3);
    expect(iterPlanPairs(entries.filter((e) => e.variant.rounds === 1))).toBe(18);
  });
});

describe("sideCall", () => {
  it("tells crowded, empty and kept sides", () => {
    expect(sideCall({ lanes: 2, width: 10 })).toBe("crowded");
    expect(sideCall({ lanes: 2, width: 14 })).toBe("kept");
    expect(sideCall({ lanes: 3, width: Infinity })).toBe("kept");
    expect(sideCall({ lanes: 0, width: 4 })).toBe("empty");
  });
});

describe("iterMargins", () => {
  const lanes = sideLanes(pair, routes);
  const placed = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 30, y: 0 },
  ];

  it("widens a crowded side to its need, and narrows each empty side to the margin of the input", () => {
    const inputs = [
      { id: "a", w: 20, h: 40 },
      { id: "b", w: 20, h: 40, margin: 2 },
    ];
    const boxes = [
      { id: "a", w: 20, h: 40, margin: 6 },
      { id: "b", w: 20, h: 40, margin: 6 },
    ];
    const space = iterMargins(boxes, inputs, placed, lanes, 0);
    // 2 lanes need 14 units. The channel of 10 units is crowded, so each side of it gets 7. The gap 0 gives the floor of d7 to the other sides of a.
    expect(space.boxes[0]!.margin).toEqual({ top: 0.5, right: 7, bottom: 0.5, left: 0.5 });
    expect(space.boxes[1]!.margin).toEqual({ top: 2, right: 2, bottom: 2, left: 7 });
    expect(space.widened).toBe(2);
    expect(space.narrowed).toBe(6);
  });

  it("keeps the floor of decision d7 when the margin and the gap are 0", () => {
    const inputs = [
      { id: "a", w: 20, h: 40 },
      { id: "b", w: 20, h: 40 },
    ];
    const space = iterMargins(inputs, inputs, placed, sideLanes(pair, []), 0);
    expect(space.boxes[0]!.margin).toBe(ITER_FLOOR_SPACE / 2);
    expect(iterMargins(inputs, inputs, placed, sideLanes(pair, []), 4).boxes).toEqual(inputs);
  });

  it("turns the margin with the box, and keeps a box without a placement", () => {
    const inputs = [
      { id: "a", w: 40, h: 20 },
      { id: "b", w: 20, h: 40 },
    ];
    const space = iterMargins(inputs, inputs, [{ id: "a", x: 0, y: 0, turn: 90 as const }], lanes, 4);
    // The right side of the turned box is its top side. 2 lanes need 14 units, and the gap gives 4 of them.
    expect(space.boxes[0]!.margin).toEqual({ top: 5, right: 0, bottom: 0, left: 0 });
    expect(space.boxes[1]).toBe(inputs[1]);
  });
});

/** A row of 4 boxes in a fixed container, with edges that skip boxes. Thus the routes run along the sides of the boxes between their ends. */
const row: LayoutInput = {
  schema: "layout-input/1",
  id: "test/row/s1",
  seed: 1,
  container: { fixed: "size", w: 400, h: 200 },
  gap: 10,
  boxes: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, w: 40, h: 30 })),
  edges: [
    { id: "e0", source: "a", target: "c" },
    { id: "e1", source: "a", target: "d" },
    { id: "e2", source: "b", target: "d" },
    { id: "e3", source: "a", target: "f" },
    { id: "e4", source: "b", target: "e" },
  ],
};

describe("runInput with iteration pairs", () => {
  const packs = PACK_ENTRIES.filter((p) => p.id === "rows");
  const iterate = iterEntries(ITER_VARIANTS, ["rows"], ["corners"]);
  const sides = laneEntries(LANE_VARIANTS.filter((v) => v.name === "lanes-sides"), ["rows"], ["corners"]);

  it("adds one record for each iteration pair, and round 1 is the layout of lanes-sides", () => {
    const records = runInput(row, undefined, { packs, routers: ["corners"], lanes: sides, iterate });
    expect(records.map((r) => r.strategy)).toEqual([
      "rows+corners",
      "lanes-sides.rows.corners+corners",
      "lanes-iter1.rows.corners+corners",
      "lanes-iter2.rows.corners+corners",
      "lanes-iter3.rows.corners+corners",
    ]);
    const [, lane, one, ...more] = records;
    expect(one!.outputHash).toBe(lane!.outputHash);
    expect(one!.measures["iter.rounds"]).toBe(1);
    expect(one!.measures["iter.best"]).toBe(1);
    for (const [k, r] of [one!, ...more].entries()) {
      expect(r.skipped).toBeUndefined();
      expect(r.measures["iter.rounds"]).toBeGreaterThanOrEqual(1);
      expect(r.measures["iter.rounds"]).toBeLessThanOrEqual(k + 1);
      expect(r.measures["iter.best"]).toBeLessThanOrEqual(r.measures["iter.rounds"]!);
      expect(ITER_STOPS[r.measures["iter.stop"]!]).toBeDefined();
      expect(r.measures["time.lanes.ms"]).toBeGreaterThanOrEqual(0);
      expect(r.hard["pack.no-overlap"]).toBe(0);
      expect((r.options as { iterate: { base: string } }).iterate.base).toBe("rows+corners");
      // The best round never loses to round 1.
      expect(compareRecords(r, one!)).not.toBe("worse");
    }
    // A larger cap uses at least as many rounds, and its time includes them.
    expect(more[1]!.measures["iter.rounds"]).toBeGreaterThanOrEqual(more[0]!.measures["iter.rounds"]!);
    expect(more[1]!.measures["joint.ms"]).toBeGreaterThanOrEqual(more[0]!.measures["joint.ms"]! - 1e-9);
  });

  it("gives the same records for the same input", () => {
    const a = runInput(row, undefined, { packs, routers: ["corners"], iterate }).map((r) => [r.outputHash, r.measures["iter.rounds"]]);
    const b = runInput(row, undefined, { packs, routers: ["corners"], iterate }).map((r) => [r.outputHash, r.measures["iter.rounds"]]);
    expect(a).toEqual(b);
  });

  it("stops after round 1 when no route runs along a side", () => {
    const quiet: LayoutInput = { ...row, id: "test/quiet/s1", edges: [] };
    const records = runInput(quiet, undefined, { packs, routers: ["corners"], iterate });
    for (const r of records.slice(1)) {
      expect(r.outputHash).toBe(records[0]!.outputHash);
      expect(r.measures["iter.rounds"]).toBe(1);
    }
    expect(ITER_STOPS[records[3]!.measures["iter.stop"]!]).toBe("fixed");
  });

  it("does not change the records of a run without iteration pairs", () => {
    const plain = runInput(row, undefined, { packs, routers: ["corners"] });
    const records = runInput(row, undefined, { packs, routers: ["corners"], iterate });
    expect(records[0]!.outputHash).toBe(plain[0]!.outputHash);
    expect(records[0]!.measures["joint.fill"]).toBe(plain[0]!.measures["joint.fill"]);
  });
});

/** This function makes a fake record of one pair on one input. */
function rec(input: string, strategy: string, measures: Record<string, number>): LayoutRecord {
  return {
    schema: "layout-record/1",
    stage: "joint",
    step: "joint",
    strategy,
    options: {},
    corpus: "test",
    input,
    inputHash: "",
    set: "test",
    seed: 1,
    nodes: 3,
    edges: 2,
    measures: { "pack.overflow": 0, "pack.overflow.excessArea": 0, "pack.fill": 0.5, "route.cap.1.25": 0, "joint.routes": 2, ...measures },
    hard: { "route.violations": 0 },
    deterministic: true,
    ms: 1,
    outputHash: `${strategy}:${input}`,
  };
}

describe("laneRows with iteration pairs", () => {
  const inputs: AnalysisInput[] = [1, 2, 3].map((seed) => ({ id: `p/s${seed}`, seed, spec: "p", kind: "p", cell: { spacing: "gap" } }));
  const iter = "lanes-iter3.rows.corners+corners";
  const records = inputs.flatMap((i) => [
    rec(i.id, "rows+corners", { "joint.fill": 0.6 }),
    rec(i.id, iter, { "joint.fill": 0.55, "iter.rounds": i.seed, "iter.best": i.seed === 3 ? 2 : 1, "iter.stop": i.seed === 1 ? 2 : 1, "iter.widened": 4, "iter.narrowed": 2 }),
  ]);

  it("gives the rounds of each iteration pair, and puts them into the Markdown", () => {
    const [row] = laneRows(records, inputs);
    expect(row!.iterate).toEqual({ rounds: 2, best: 4 / 3, gained: 1, stops: { fixed: 1, "no-gain": 2 }, widened: 4, narrowed: 2 });
    const report = analyze(records, inputs, { resamples: 20 });
    expect(reportMarkdown(report)).toContain("### The rounds of the iteration pairs");
    expect(laneRows(records.filter((r) => r.strategy !== iter), inputs)).toEqual([]);
  });
});
