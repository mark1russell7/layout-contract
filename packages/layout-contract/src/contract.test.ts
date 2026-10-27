import { describe, expect, it } from "vitest";
import {
  applyPack,
  countObstacleHits,
  countOutside,
  countOverlaps,
  countPortsOffBorder,
  grow,
  JOINT_MEASURES,
  packHard,
  regionHitsRect,
  toLayoutRecord,
  toPackInput,
  turnBox,
  turnMargin,
  turnPort,
  turnRegion,
  type LayoutBox,
  type LayoutInput,
} from "./index.ts";

const input = (boxes: LayoutBox[], extra: Partial<LayoutInput> = {}): LayoutInput => ({
  schema: "layout-input/1",
  id: "t",
  container: { w: 100, h: 100, fixed: "size" },
  boxes,
  ...extra,
});

describe("turn", () => {
  it("swaps the size and moves the top-left corner of the box to its top-right corner", () => {
    const b = turnBox({ id: "a", w: 40, h: 10, ports: [{ id: "p", side: "top", x: 0, y: 0 }] });
    expect([b.w, b.h]).toEqual([10, 40]);
    expect(b.ports).toEqual([{ id: "p", side: "right", x: 10, y: 0 }]);
  });

  it("turns each side one step clockwise and keeps a fixed port on the border", () => {
    let b: LayoutBox = {
      id: "a",
      w: 40,
      h: 10,
      ports: [
        { id: "t", side: "top", x: 5, y: 0 },
        { id: "r", side: "right", x: 40, y: 3 },
        { id: "b", side: "bottom", x: 7, y: 10 },
        { id: "l", side: "left", x: 0, y: 9 },
        { id: "free", side: "left" },
      ],
    };
    for (let i = 0; i < 4; i++) {
      b = turnBox(b);
      expect(countPortsOffBorder([b])).toBe(0);
    }
    expect(b.ports?.map((p) => p.side)).toEqual(["top", "right", "bottom", "left", "left"]);
    expect(b.ports?.[1]).toEqual({ id: "r", side: "right", x: 40, y: 3 });
  });

  it("moves each margin value one side clockwise", () => {
    expect(turnMargin({ top: 1, right: 2, bottom: 3, left: 4 })).toEqual({ top: 4, right: 1, bottom: 2, left: 3 });
    expect(turnMargin(5)).toBe(5);
  });

  it("turns a port with only one value, and keeps a port without a side", () => {
    expect(turnPort({ id: "p", side: "top", x: 5 }, 10)).toEqual({ id: "p", side: "right", y: 5 });
    expect(turnPort({ id: "p", side: "left", y: 3 }, 10)).toEqual({ id: "p", side: "top", x: 7 });
    expect(turnPort({ id: "p" }, 10)).toEqual({ id: "p" });
  });

  it("turns a rectangle shape inside the turned box", () => {
    expect(turnRegion({ kind: "rect", x: 0, y: 0, w: 40, h: 4 }, 10)).toEqual({ kind: "rect", x: 6, y: 0, w: 4, h: 40 });
  });
});

describe("rules", () => {
  it("does not count a common edge as an overlap", () => {
    expect(countOverlaps([{ id: "a", w: 10, h: 10, x: 0, y: 0 }, { id: "b", w: 10, h: 10, x: 10, y: 0 }])).toBe(0);
  });

  it("counts the margins in the overlap", () => {
    const boxes: LayoutBox[] = [
      { id: "a", w: 10, h: 10, x: 0, y: 0, margin: 2 },
      { id: "b", w: 10, h: 10, x: 13, y: 0, margin: 2 },
    ];
    expect(countOverlaps(boxes)).toBe(1);
    expect(countOverlaps(boxes.map((b) => ({ ...b, margin: 1.5 })))).toBe(0);
  });

  it("finds an overlap of 0.4 at the default tolerance, but not at 0.5", () => {
    const boxes: LayoutBox[] = [{ id: "a", w: 10, h: 10, x: 0, y: 0 }, { id: "b", w: 10, h: 10, x: 9.6, y: 0 }];
    expect(countOverlaps(boxes)).toBe(1);
    expect(countOverlaps(boxes, 0.5)).toBe(0);
  });

  it("counts only the fixed sides of the container, with the inset", () => {
    const boxes: LayoutBox[] = [{ id: "a", w: 10, h: 10, x: 0, y: 95 }];
    expect(countOutside(input(boxes))).toBe(1);
    expect(countOutside(input(boxes, { container: { w: 100, fixed: "width" } }))).toBe(0);
    expect(countOutside(input([{ id: "a", w: 10, h: 10, x: 0, y: 0 }], { container: { w: 100, h: 100, fixed: "size", inset: 1 } }))).toBe(1);
  });

  it("gives 0 outside without a container", () => {
    const i: LayoutInput = { schema: "layout-input/1", id: "r", boxes: [{ id: "a", w: 10, h: 10, x: -50, y: 0 }] };
    expect(countOutside(i)).toBe(0);
    expect(toPackInput(i).container).toEqual({ fixed: "none" });
  });

  it("finds a box over each kind of obstacle", () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(regionHitsRect({ kind: "rect", x: 10, y: 0, w: 5, h: 5 }, r)).toBe(false);
    expect(regionHitsRect({ kind: "rect", x: 9, y: 0, w: 5, h: 5 }, r)).toBe(true);
    expect(regionHitsRect({ kind: "circle", cx: 15, cy: 5, r: 5 }, r)).toBe(false);
    expect(regionHitsRect({ kind: "circle", cx: 14, cy: 5, r: 5 }, r)).toBe(true);
    expect(regionHitsRect({ kind: "circle", cx: 14, cy: 14, r: 5 }, r)).toBe(false);
    expect(regionHitsRect({ kind: "ellipse", cx: 5, cy: 20, rx: 2, ry: 11 }, r)).toBe(true);
    expect(regionHitsRect({ kind: "ellipse", cx: 5, cy: 20, rx: 2, ry: 9 }, r)).toBe(false);
    const tri = { kind: "polygon" as const, points: [[10, 0], [20, 0], [10, 10]] as [number, number][] };
    expect(regionHitsRect(tri, r)).toBe(false);
    expect(regionHitsRect({ ...tri, points: [[5, -5], [15, -5], [5, 5]] }, r)).toBe(true);
    expect(regionHitsRect({ ...tri, points: [[-5, 4], [15, 4], [5, -20]] }, r)).toBe(true);
    expect(regionHitsRect({ ...tri, points: [[5, -5], [15, -5], [15, 5]] }, r)).toBe(false);
    const ring = { kind: "polygon" as const, points: [[-10, -10], [20, -10], [20, 20], [-10, 20]] as [number, number][] };
    expect(regionHitsRect(ring, r)).toBe(true);
    expect(regionHitsRect({ ...ring, holes: [[[-1, -1], [11, -1], [11, 11], [-1, 11]]] }, r)).toBe(false);
    expect(countObstacleHits([{ id: "a", w: 10, h: 10, x: 0, y: 0 }], [{ id: "o", region: { kind: "rect", x: 9.9995, y: 0, w: 5, h: 5 } }])).toBe(0);
  });

  it("gives grow a rectangle with each side of the margin", () => {
    expect(grow({ x: 10, y: 10, w: 5, h: 5 }, { top: 1, right: 2, bottom: 3, left: 4 })).toEqual({ x: 6, y: 9, w: 11, h: 9 });
  });
});

describe("measures and records", () => {
  it("has one joint spec for each id", () => {
    expect(new Set(JOINT_MEASURES.map((m) => m.id)).size).toBe(JOINT_MEASURES.length);
  });

  it("fills the record from the input", () => {
    const r = toLayoutRecord(input([{ id: "a", w: 1, h: 1 }], { set: "s", hash: "h" }), {
      stage: "joint",
      step: "joint",
      strategy: "x",
      options: {},
      corpus: "c",
      seed: 1,
      measures: {},
      hard: {},
      deterministic: true,
      ms: 2,
    });
    expect(r).toMatchObject({ schema: "layout-record/1", input: "t", inputHash: "h", set: "s", nodes: 1, edges: 0, ms: 2 });
  });
});

describe("applyPack", () => {
  it("places, turns, moves obstacles and keeps the input unchanged", () => {
    const before = input(
      [
        { id: "a", w: 40, h: 10, turnable: true },
        { id: "pin", w: 10, h: 10, x: 50, y: 50, locked: true },
        { id: "c", w: 5, h: 5 },
      ],
      { obstacles: [{ id: "o", region: { kind: "circle", cx: 5, cy: 5, r: 5 }, move: { cost: 1 } }] },
    );
    const output = {
      placements: [{ id: "a", x: 0, y: 0, turn: 90 as const }, { id: "pin", x: 50, y: 50 }],
      overflow: [],
      size: { w: 100, h: 100 },
      moved: [{ id: "o", x: 20, y: 0 }],
    };
    const after = applyPack(before, output);
    expect(after.boxes[0]).toMatchObject({ w: 10, h: 40, x: 0, y: 0 });
    expect(after.obstacles?.[0]?.region).toEqual({ kind: "circle", cx: 25, cy: 5, r: 5 });
    expect(before.boxes[0]).toEqual({ id: "a", w: 40, h: 10, turnable: true });
    expect(packHard(before, output)).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 1 });
    expect(packHard(before, { ...output, overflow: ["c"] }).complete).toBe(0);
    expect(packHard(before, { ...output, placements: [{ id: "a", x: 0, y: 0, turn: 90 }] })["locked-kept"]).toBe(1);
    expect(packHard(before, { ...output, moved: [] })["no-overlap"]).toBe(1);
  });

  it("gives the packer input without the edges", () => {
    const i = toPackInput(input([{ id: "a", w: 1, h: 1 }], { gap: 4, edges: [{ id: "e", source: "a", target: "a" }] }));
    expect(i).toEqual({ container: { w: 100, h: 100, fixed: "size" }, items: [{ id: "a", w: 1, h: 1 }], gap: 4 });
  });
});
