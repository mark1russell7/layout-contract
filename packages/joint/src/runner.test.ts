import type { LayoutInput } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { insideLength, jointMeasures, placementFacts, segmentsCross, spearman } from "./joint-measures.ts";
import { factMeasures, jointHash, packedInput, packInputOf, PACK_ENTRIES, pairId, PORTFOLIO_ROUTER, ROUTERS, runInput, shardOf } from "./runner.ts";

const fixed = (w: number, h: number) => ({ fixed: "size" as const, w, h });

/** Three boxes in a large fixed container, with two edges. */
const three: LayoutInput = {
  schema: "layout-input/1",
  id: "test/three/s1",
  seed: 1,
  container: fixed(200, 200),
  boxes: [
    { id: "a", w: 20, h: 10 },
    { id: "b", w: 10, h: 10 },
    { id: "c", w: 30, h: 20, group: "g0", data: { group: "g0" } },
  ],
  edges: [
    { id: "e0", source: "a", target: "b", data: { collection: "c0" } },
    { id: "e1", source: "b", target: "c", data: { collection: "c1" } },
  ],
};

/** A box that does not go in its container, with an edge to it. */
const oversize: LayoutInput = {
  schema: "layout-input/1",
  id: "test/oversize/s1",
  seed: 1,
  container: fixed(40, 40),
  boxes: [
    { id: "a", w: 10, h: 10 },
    { id: "big", w: 60, h: 60 },
  ],
  edges: [{ id: "e0", source: "a", target: "big", data: { collection: "c0" } }],
};

const empty: LayoutInput = { schema: "layout-input/1", id: "test/empty/s1", seed: 1, container: fixed(40, 40), boxes: [], edges: [] };
const one: LayoutInput = { schema: "layout-input/1", id: "test/one/s1", seed: 1, container: fixed(40, 40), boxes: [{ id: "a", w: 10, h: 10 }], edges: [] };

const small = { packs: PACK_ENTRIES.filter((p) => p.id === "rows" || p.id === "skyline"), routers: ["straight", "corners"] };

describe("runInput", () => {
  it("writes one record for each pair, with the pack, route and joint measures", () => {
    const records = runInput(three, undefined, small);
    expect(records.map((r) => r.strategy)).toEqual(["rows+straight", "rows+corners", "skyline+straight", "skyline+corners"]);
    for (const r of records) {
      expect(r.schema).toBe("layout-record/1");
      expect(r.stage).toBe("joint");
      expect(r.skipped).toBeUndefined();
      expect(r.outputHash).toMatch(/^[0-9a-f]{16}$/);
      expect(r.nodes).toBe(3);
      expect(r.edges).toBe(2);
      expect(r.measures["joint.fill"]).toBeGreaterThan(0);
      expect(r.measures["joint.fill"]).toBeLessThanOrEqual(1);
      expect(r.measures["joint.overflow.edges"]).toBe(0);
      expect(r.measures["joint.routes"]).toBe(2);
      expect(r.measures["pack.fill"]).toBeGreaterThan(0);
      expect(r.measures["joint.ms"]).toBeCloseTo((r.measures["pack.ms"] ?? 0) + (r.measures["route.ms"] ?? 0), 6);
      expect(r.measures["route.cap.1.1"]).toBeGreaterThanOrEqual(0);
      expect(r.hard["route.violations"]).toBeGreaterThanOrEqual(0);
      expect(r.hard["pack.no-overlap"]).toBe(0);
    }
    expect(records.find((r) => r.strategy === "rows+corners")!.measures["route.cap.1.1"]).toBe(0);
  });

  it("gives the same records for the same input", () => {
    const a = runInput(three, undefined, small).map((r) => r.outputHash);
    const b = runInput(three, undefined, small).map((r) => r.outputHash);
    expect(a).toEqual(b);
  });

  it("drops the overflow boxes and their edges before the route", () => {
    const records = runInput(oversize, undefined, small);
    expect(records).toHaveLength(4);
    for (const r of records) {
      expect(r.skipped).toBeUndefined();
      expect(r.measures["pack.overflow"]).toBe(1);
      expect(r.measures["joint.overflow.edges"]).toBe(1);
      expect(r.measures["joint.routes"]).toBe(0);
      expect(r.measures["joint.spill"]).toBeUndefined();
    }
  });

  it("records the inputs empty and one with no routes and no error", () => {
    for (const input of [empty, one]) {
      const records = runInput(input, undefined, small);
      expect(records).toHaveLength(4);
      for (const r of records) {
        expect(r.skipped).toBeUndefined();
        expect(r.measures["joint.routes"]).toBe(0);
        expect(r.measures["joint.straight.length"]).toBeUndefined();
        expect(r.measures["joint.fill"]).toBeGreaterThan(0);
      }
    }
  });

  it("writes a skipped record when the strategy does not support the cell", () => {
    const records = runInput(three, { containerSize: "fixed", mode: "incremental" }, { ...small, routers: ["straight"] });
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.skipped).toMatch(/mode incremental/);
      expect(r.measures).toEqual({});
    }
  });
});

describe("the parts of the runner", () => {
  it("lists 12 pack entries and the 10 routers", () => {
    expect(PACK_ENTRIES).toHaveLength(12);
    expect(ROUTERS).toHaveLength(10);
    expect(ROUTERS).toContain("corners");
    expect(ROUTERS.at(-1)).toBe(PORTFOLIO_ROUTER);
    expect(pairId("rows", "corners")).toBe("rows+corners");
  });

  it("removes the groups from the input of the packer", () => {
    const pack = packInputOf(three);
    expect(pack.items.some((i) => i.group !== undefined)).toBe(false);
    expect(pack.items[2]!.data).toEqual({ group: "g0" });
  });

  it("drops the edges of the overflow boxes", () => {
    const packed = packedInput(oversize, { placements: [{ id: "a", x: 0, y: 0 }], overflow: ["big"], size: { w: 40, h: 40 }, moved: [] }, "rows");
    expect(packed.dropped).toBe(1);
    expect(packed.input.boxes.map((b) => b.id)).toEqual(["a"]);
    expect(packed.input.edges).toEqual([]);
    expect(packed.input.base).toBe(oversize.id);
    expect(packed.input.change).toBe("packed");
  });

  it("hashes the list of the pack hash and the route hash", () => {
    expect(jointHash("a", "b")).toMatch(/^[0-9a-f]{16}$/);
    expect(jointHash("a", "b")).not.toBe(jointHash("b", "a"));
  });

  it("writes the route facts as the cap counts, route.mixed and the hard counts", () => {
    const facts = { hard: { "no-pass-through": 2, complete: 0 }, over: (cap: number) => (cap < 1.2 ? 3 : 0), mixed: 1 };
    expect(factMeasures(facts)).toEqual({
      measures: { "route.cap.1.1": 3, "route.cap.1.25": 0, "route.cap.1.5": 0, "route.mixed": 1 },
      hard: { "route.no-pass-through": 2 },
    });
  });

  it("gives each input to one shard", () => {
    const items = [0, 1, 2, 3, 4];
    expect([...shardOf(items, 0, 2), ...shardOf(items, 1, 2)].sort()).toEqual(items);
    expect(() => shardOf(items, 2, 2)).toThrow(RangeError);
  });
});

describe("the joint measures", () => {
  it("counts the crossings of the straight segments", () => {
    const boxes = [
      { id: "a", w: 2, h: 2, x: 0, y: 0 },
      { id: "b", w: 2, h: 2, x: 10, y: 10 },
      { id: "c", w: 2, h: 2, x: 10, y: 0 },
      { id: "d", w: 2, h: 2, x: 0, y: 10 },
    ];
    const facts = placementFacts(boxes, [
      { id: "e0", source: "a", target: "b" },
      { id: "e1", source: "c", target: "d" },
      { id: "e2", source: "a", target: "c" },
    ]);
    expect(facts.crossings).toBe(1);
    expect(facts.area).toBe(16);
    expect(facts.scale).toBe(4);
    expect(facts.straight.get("e0")).toBe(20);
  });

  it("gives the fill, the spill and the straight length", () => {
    const boxes = [
      { id: "a", w: 10, h: 10, x: 0, y: 0 },
      { id: "b", w: 10, h: 10, x: 10, y: 0 },
    ];
    const facts = placementFacts(boxes, [{ id: "e", source: "a", target: "b" }]);
    const inside = jointMeasures(facts, [{ edge: "e", points: [{ x: 5, y: 5 }, { x: 15, y: 5 }] }], 1);
    expect(inside["joint.fill"]).toBeCloseTo(1, 9);
    expect(inside["joint.spill"]).toBe(0);
    expect(inside["joint.straight.length"]).toBeCloseTo(10 / Math.sqrt(200), 9);
    expect(inside["joint.aspectError"]).toBeCloseTo(Math.log(2), 9);
    const out = jointMeasures(facts, [{ edge: "e", points: [{ x: 5, y: 5 }, { x: 5, y: 20 }, { x: 15, y: 20 }, { x: 15, y: 5 }] }], 1);
    expect(out["joint.fill"]).toBeCloseTo(200 / (20 * 20), 9);
    expect(out["joint.spill"]).toBeCloseTo(30 / 40, 9);
    expect(out["joint.proxy.rank"]).toBeUndefined();
  });

  it("writes no edge measures without edges", () => {
    const facts = placementFacts([{ id: "a", w: 1, h: 1, x: 0, y: 0 }], []);
    expect(Object.keys(jointMeasures(facts, [], 0)).sort()).toEqual(["joint.aspectError", "joint.fill"]);
  });

  it("clips a segment to a rectangle", () => {
    expect(insideLength({ x: -5, y: 5 }, { x: 15, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBeCloseTo(10, 9);
    expect(insideLength({ x: -5, y: 20 }, { x: 15, y: 20 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(0);
  });

  it("tells a crossing from a touch", () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 0 })).toBe(false);
  });

  it("gives the Spearman correlation", () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 9);
    expect(spearman([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1, 9);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeUndefined();
  });
});
