import type { LayoutInput, LayoutRecord } from "@mark1russell7/layout-contract";
import type { Graph, Route } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { analyze, laneRows, reportMarkdown, throughCounts, type AnalysisInput } from "./analysis.ts";
import {
  isLanePack,
  LANE_VARIANTS,
  laneEntries,
  laneMargins,
  laneNeed,
  laneParts,
  lanePlanPairs,
  marginGrowth,
  maxLanes,
  shortSides,
  sideLanes,
} from "./lanes.ts";
import { PACK_ENTRIES, runInput } from "./runner.ts";

/** Two boxes of 20 by 40 with a channel of 10 units between them. */
const pair: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 20, h: 40 } },
    { id: "b", box: { x: 30, y: 0, w: 20, h: 40 } },
  ],
  edges: [],
};

/** Two routes on the middle line of the channel, and one route across the channel. */
const routes: Route[] = [
  { edge: "r0", points: [{ x: 25, y: -10 }, { x: 25, y: 50 }] },
  { edge: "r1", points: [{ x: 25, y: -10 }, { x: 25, y: 50 }] },
  { edge: "r2", points: [{ x: -10, y: 20 }, { x: 60, y: 20 }] },
];

describe("laneNeed", () => {
  it("gives 2 clearances and k - 1 lane spaces, with the cap", () => {
    expect(laneNeed(0)).toBe(0);
    expect(laneNeed(1)).toBe(10);
    expect(laneNeed(3)).toBe(18);
    expect(laneNeed(20)).toBe(38);
    expect(laneNeed(2, { clearance: 4, space: 2, cap: 1 })).toBe(8);
  });
});

describe("sideLanes", () => {
  it("counts the routes along a channel, and not the routes across it", () => {
    const lanes = sideLanes(pair, routes);
    expect(lanes.get("a")!.right).toEqual({ lanes: 2, width: 10 });
    expect(lanes.get("b")!.left).toEqual({ lanes: 2, width: 10 });
    expect(lanes.get("a")!.left).toEqual({ lanes: 0, width: Infinity });
    expect(lanes.get("a")!.top.lanes).toBe(0);
    expect(maxLanes(lanes)).toBe(2);
  });

  it("counts a route through the box behind a narrow channel", () => {
    const touching: Graph = { nodes: [pair.nodes[0]!, { id: "b", box: { x: 20, y: 0, w: 20, h: 40 } }], edges: [] };
    const lanes = sideLanes(touching, [{ edge: "r0", points: [{ x: 25, y: -10 }, { x: 25, y: 50 }] }]);
    expect(lanes.get("a")!.right).toEqual({ lanes: 1, width: 0 });
    expect(shortSides(lanes)).toBe(1);
  });

  it("counts only the nodes of the ids", () => {
    expect([...sideLanes(pair, routes, new Set(["b"])).keys()]).toEqual(["b"]);
  });
});

describe("shortSides", () => {
  it("counts the sides narrower than the need of their lanes", () => {
    expect(shortSides(sideLanes(pair, routes))).toBe(2);
    expect(shortSides(sideLanes(pair, routes.slice(0, 1)))).toBe(0);
  });
});

describe("laneMargins", () => {
  const lanes = sideLanes(pair, routes);
  const boxes = [
    { id: "a", w: 20, h: 40 },
    { id: "b", w: 20, h: 40, margin: 10 },
  ];
  const placed = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 30, y: 0 },
  ];

  it("gives each side the half of its need less the gap, and keeps a larger margin", () => {
    const out = laneMargins(boxes, placed, lanes, 0, "sides");
    expect(out[0]!.margin).toEqual({ top: 0, right: 7, bottom: 0, left: 0 });
    expect(out[1]!.margin).toBe(10);
    expect(laneMargins(boxes, placed, lanes, 4, "sides")[0]!.margin).toEqual({ top: 0, right: 5, bottom: 0, left: 0 });
  });

  it("turns the margin with the box", () => {
    const out = laneMargins(boxes, [{ ...placed[0]!, turn: 90 as const }, placed[1]!], lanes, 0, "sides");
    expect(out[0]!.margin).toEqual({ top: 7, right: 0, bottom: 0, left: 0 });
  });

  it("gives each box the largest margin with the mode max", () => {
    const out = laneMargins(boxes, placed, lanes, 0, "max");
    expect(out[0]!.margin).toBe(7);
    expect(out[1]!.margin).toBe(10);
    expect(marginGrowth(boxes, out)).toBeCloseTo(3.5, 9);
  });

  it("keeps a box without lanes or without a placement", () => {
    const none = sideLanes(pair, []);
    expect(laneMargins(boxes, placed, none, 0, "sides")).toEqual(boxes);
    expect(laneMargins(boxes, [], lanes, 0, "sides")).toEqual(boxes);
  });
});

describe("laneEntries", () => {
  it("gives 18 lane pairs with ids that parse, and their plan cost", () => {
    const entries = laneEntries();
    expect(entries).toHaveLength(18);
    expect(entries[0]!.id).toBe("lanes-max.rows.corners");
    for (const e of entries) {
      expect(isLanePack(e.id)).toBe(true);
      expect(laneParts(e.id)).toEqual({ variant: e.variant.name, pack: e.pack, router: e.router });
      expect(e.id.includes("+")).toBe(false);
    }
    expect(laneParts("rows")).toBeUndefined();
    expect(LANE_VARIANTS.map((v) => v.passes)).toEqual([1, 1, 2]);
    expect(lanePlanPairs(entries)).toBe(72);
  });
});

/** A row of 4 boxes in a fixed container, with edges that skip boxes. Thus the routes run along the sides of the boxes between their ends. */
const row: LayoutInput = {
  schema: "layout-input/1",
  id: "test/row/s1",
  seed: 1,
  container: { fixed: "size", w: 400, h: 200 },
  gap: 10,
  boxes: ["a", "b", "c", "d"].map((id) => ({ id, w: 40, h: 30 })),
  edges: [
    { id: "e0", source: "a", target: "c" },
    { id: "e1", source: "a", target: "d" },
    { id: "e2", source: "b", target: "d" },
  ],
};

describe("runInput with lane pairs", () => {
  const packs = PACK_ENTRIES.filter((p) => p.id === "rows");
  const lanes = laneEntries(LANE_VARIANTS, ["rows"], ["corners"]);

  it("adds one record for each lane pair, and keeps the records of the other pairs", () => {
    const plain = runInput(row, undefined, { packs, routers: ["corners"] });
    const records = runInput(row, undefined, { packs, routers: ["corners"], lanes });
    expect(records.map((r) => r.strategy)).toEqual(["rows+corners", "lanes-max.rows.corners+corners", "lanes-sides.rows.corners+corners", "lanes-sides2.rows.corners+corners"]);
    expect(records[0]!.outputHash).toBe(plain[0]!.outputHash);
    for (const r of records.slice(1)) {
      expect(r.skipped).toBeUndefined();
      expect(r.outputHash).toMatch(/^[0-9a-f]{16}$/);
      expect(r.measures["lanes.max.base"]).toBeGreaterThan(0);
      expect(r.measures["lanes.margin"]).toBeGreaterThanOrEqual(0);
      expect(r.measures["lanes.short"]).toBeGreaterThanOrEqual(0);
      expect(r.measures["time.lanes.ms"]).toBeGreaterThanOrEqual(0);
      expect(r.measures["joint.ms"]).toBeGreaterThanOrEqual((r.measures["pack.ms"] ?? 0) + (r.measures["route.ms"] ?? 0) - 1e-9);
      expect(r.hard["pack.no-overlap"]).toBe(0);
      expect((r.options as { lanes: { base: string } }).lanes.base).toBe("rows+corners");
    }
  });

  it("gives the same records for the same input", () => {
    const a = runInput(row, undefined, { packs, routers: ["corners"], lanes }).map((r) => r.outputHash);
    const b = runInput(row, undefined, { packs, routers: ["corners"], lanes }).map((r) => r.outputHash);
    expect(a).toEqual(b);
  });

  it("gives the output of the base pair when no route runs along a side", () => {
    const quiet: LayoutInput = { ...row, id: "test/quiet/s1", edges: [] };
    const records = runInput(quiet, undefined, { packs, routers: ["corners"], lanes });
    for (const r of records.slice(1)) {
      expect(r.outputHash).toBe(records[0]!.outputHash);
      expect(r.measures["lanes.margin"]).toBe(0);
    }
  });

  it("runs a lane pair whose pack entry and router are not in the run", () => {
    const records = runInput(row, undefined, { packs, routers: ["straight"], lanes: lanes.slice(1, 2) });
    expect(records.map((r) => r.strategy)).toEqual(["rows+straight", "lanes-sides.rows.corners+corners"]);
    expect(records[1]!.skipped).toBeUndefined();
  });
});

/** This function makes a fake record of one pair on one input. */
function rec(input: string, strategy: string, measures: Record<string, number>, hard: Record<string, number> = {}, hash?: string): LayoutRecord {
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
    measures: { "pack.overflow": 0, "pack.overflow.excessArea": 0, "pack.fill": 0.5, "route.mixed": 0, "route.cap.1.1": 0, "route.cap.1.25": 0, "route.cap.1.5": 0, "joint.routes": 2, ...measures },
    hard: { "pack.no-overlap": 0, "route.violations": 0, ...hard },
    deterministic: true,
    ms: 1,
    outputHash: hash ?? `${strategy}:${input}`,
  };
}

describe("laneRows", () => {
  const inputs: AnalysisInput[] = [
    ...[1, 2, 3].map((seed) => ({ id: `p/s${seed}`, seed, spec: "p", kind: "p", cell: { spacing: "gap" } })),
    ...[1, 2, 3].map((seed) => ({ id: `s/s${seed}`, seed, spec: "s", kind: "s", cell: { spacing: "stress" }, stress: true })),
  ];
  const lane = "lanes-sides.rows.corners+corners";
  const records = inputs.flatMap((i) => {
    const stress = i.stress === true;
    const base = rec(i.id, "rows+corners", { "joint.fill": 0.6, "joint.ms": 10 }, stress ? { "route.no-pass-through": 2 } : {});
    const own = rec(i.id, lane, { "joint.fill": 0.5, "joint.ms": 25, "lanes.short.base": 3, "lanes.short": 1, "lanes.margin": 2 }, stress && i.seed === 1 ? { "route.no-pass-through": 1 } : {}, i.seed === 3 && !stress ? base.outputHash : undefined);
    return [base, own];
  });

  it("gives each lane pair against its base pair, outside and in the stress cell", () => {
    const rows = laneRows(records, inputs);
    expect(rows.map((r) => [r.pair, r.base, r.scope, r.inputs, r.same])).toEqual([
      [lane, "rows+corners", "headline", 3, 1],
      [lane, "rows+corners", "stress", 3, 0],
    ]);
    const stress = rows[1]!;
    expect(stress.lane.broken).toBe(1);
    expect(stress.baseSide.broken).toBe(3);
    expect(stress.baseSide.breaks).toBe(6);
    expect(rows[0]!.lane.fill).toBeCloseTo(0.5, 9);
    expect(rows[0]!.baseSide.fill).toBeCloseTo(0.6, 9);
    expect(rows[0]!.lane.ms).toBeCloseTo(25, 9);
    expect(rows[0]!.short).toBe(1);
    expect(rows[0]!.shortBase).toBe(3);
    expect(rows[0]!.margin).toBe(2);
  });

  it("counts the inputs where the lane pair has no record or a skipped record", () => {
    const some = records.filter((r) => !(r.strategy === lane && r.input === "p/s1")).map((r) => (r.strategy === lane && r.input === "p/s2" ? { ...r, skipped: "error: test" } : r));
    const rows = laneRows(some, inputs);
    expect(rows.map((r) => [r.scope, r.inputs, r.skipped])).toEqual([
      ["headline", 1, 2],
      ["stress", 3, 0],
    ]);
  });

  it("keeps the lane pairs out of the counts of no-pass-through by router", () => {
    const through = throughCounts(records, inputs);
    expect(through.find((t) => t.spacing === "stress" && t.router === "corners")).toMatchObject({ routed: 3, broken: 3, breaks: 6 });
  });

  it("puts the lane pairs into the report and its Markdown", () => {
    const report = analyze(records, inputs, { resamples: 20, compare: [[lane, "rows+corners"]] });
    expect(report.lanes).toHaveLength(2);
    expect(reportMarkdown(report)).toContain("### The lane pairs");
    expect(analyze(records.filter((r) => r.strategy !== lane), inputs, { resamples: 20 }).lanes).toBeUndefined();
  });
});
