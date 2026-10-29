import { describe, expect, it } from "vitest";
import {
  boxArea,
  checkInput,
  checkShapes,
  countOverlaps,
  itemShapeOf,
  JOINT_MEASURES,
  PACK_HARD_RULES,
  regionArea,
  ruleLevel,
  SHAPE_KIND_IDS,
  SHAPE_KINDS,
  shapeKindOf,
  shapeKindsOf,
  shapeLevel,
  shapeSupportProblems,
  toLayoutRecord,
  type LayoutBox,
  type LayoutInput,
  type MeasureSpec,
  type RunFacts,
} from "./index.ts";

const input = (boxes: LayoutBox[]): LayoutInput => ({ schema: "layout-input/1", id: "t", set: "s", hash: "h", container: { w: 100, h: 100, fixed: "size" }, boxes });
const rect: LayoutBox = { id: "r", w: 10, h: 10 };
const circle: LayoutBox = { id: "c", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 } };
const tri: LayoutBox = { id: "p", w: 10, h: 10, shape: { kind: "polygon", points: [[0, 0], [10, 0], [0, 10]] } };
const ellipse: LayoutBox = { id: "e", w: 10, h: 4, shape: { kind: "ellipse", cx: 5, cy: 2, rx: 5, ry: 2 } };
const run: RunFacts = { stage: "pack", step: "pack", strategy: "x", options: {}, corpus: "c", seed: 1, measures: {}, hard: {}, deterministic: true, ms: 1 };

describe("the shape kinds", () => {
  it("declares 4 kinds in a fixed order, each with its bounding box", () => {
    expect(SHAPE_KIND_IDS).toEqual(["rect", "polygon", "circle", "free"]);
    expect(SHAPE_KINDS.every((k) => k.geometry.bounds)).toBe(true);
    expect(SHAPE_KINDS.filter((k) => k.geometry.overlap).map((k) => k.id)).toEqual(["rect"]);
  });

  it("gives the kind of a box from shapeKind, or from its shape", () => {
    expect([rect, circle, tri, ellipse].map(shapeKindOf)).toEqual(["rect", "circle", "polygon", "free"]);
    expect(shapeKindOf({ ...rect, shape: { kind: "rect", x: 1, y: 1, w: 8, h: 8 } })).toBe("rect");
    expect(shapeKindOf({ ...rect, shapeKind: "free" })).toBe("free");
    expect(shapeKindsOf(input([circle, rect, ellipse, circle]))).toEqual(["rect", "circle", "free"]);
    expect(itemShapeOf(input([rect]))).toBe("rect");
    expect(itemShapeOf(input([]))).toBe("rect");
    expect(itemShapeOf(input([tri, tri]))).toBe("polygon");
    expect(itemShapeOf(input([tri, rect]))).toBe("mixed");
  });

  it("finds a shapeKind that does not agree with the shape as a bad input", () => {
    expect(checkInput(input([{ ...circle, shapeKind: "circle" }, { ...rect, shapeKind: "rect" }, { ...ellipse, shapeKind: "free" }, { ...rect, id: "f", shapeKind: "free" }]))).toEqual([]);
    expect(checkInput(input([{ ...rect, shapeKind: "circle" }]))).toEqual(["box r: the shape kind circle has no shape"]);
    expect(checkInput(input([{ ...tri, shapeKind: "rect" }]))).toEqual(["box p: the shape kind rect does not agree with a shape of the kind polygon"]);
    expect(checkInput(input([{ ...rect, shapeKind: "hexagon" as never }]))).toEqual(["box r: the shape kind hexagon is not a declared kind"]);
  });
});

describe("the records", () => {
  it("gives a record without shapes for an input of rectangles, so the record does not change", () => {
    const r = toLayoutRecord(input([rect, { ...rect, id: "s" }]), run);
    expect(Object.hasOwn(r, "shapes")).toBe(false);
    expect(r).toEqual({ schema: "layout-record/1", ...run, input: "t", inputHash: "h", set: "s", nodes: 2, edges: 0 });
    expect(Object.hasOwn(toLayoutRecord(input([]), run), "shapes")).toBe(false);
  });

  it("writes the kinds of an input with other shapes", () => {
    expect(toLayoutRecord(input([circle, rect]), run).shapes).toEqual(["rect", "circle"]);
    expect(toLayoutRecord(input([tri]), run).shapes).toEqual(["polygon"]);
  });
});

describe("checkShapes", () => {
  it("gives no break for rectangles, with each joint measure and each rule", () => {
    expect(checkShapes(input([rect]), [...JOINT_MEASURES, ...PACK_HARD_RULES])).toEqual([]);
  });

  it("refuses the 2 area measures and the 2 bounding rules on a polygon", () => {
    const breaks = checkShapes(input([rect, tri]), [...JOINT_MEASURES, ...PACK_HARD_RULES]);
    expect(breaks.map((b) => b.detail.split(" ")[0])).toEqual(["joint.fill", "joint.straight.length", "no-overlap", "in-container"]);
    expect(breaks[0]).toEqual({
      claim: "shape",
      detail: "joint.fill supports only the shape kinds rect, but the input t has polygon boxes: p",
      inputs: ["t"],
    });
  });

  it("reads a spec without shapes as rect only, and shortens a long list of boxes", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...circle, id: `c${i}` }));
    const breaks = checkShapes(input(many), [{ id: "pack.fill" }, { id: "any", shapes: SHAPE_KIND_IDS }]);
    expect(breaks.map((b) => b.detail)).toEqual(["pack.fill supports only the shape kinds rect, but the input t has circle boxes: c0, c1, c2, c3, c4, and 2 more"]);
  });
});

describe("the area of a region and of a box (L57)", () => {
  it("gives the exact area of each region kind", () => {
    expect(regionArea({ kind: "rect", x: 5, y: 5, w: 3, h: 4 })).toBe(12);
    expect(regionArea({ kind: "circle", cx: 0, cy: 0, r: 2 })).toBeCloseTo(4 * Math.PI, 12);
    expect(regionArea({ kind: "ellipse", cx: 0, cy: 0, rx: 5, ry: 2 })).toBeCloseTo(10 * Math.PI, 12);
    expect(regionArea({ kind: "polygon", points: [[0, 0], [10, 0], [0, 10]] })).toBe(50);
    expect(regionArea({ kind: "polygon", points: [[0, 0], [0, 10], [10, 0]] })).toBe(50);
    expect(regionArea({ kind: "polygon", points: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]] })).toBe(7);
    const holed = { kind: "polygon", points: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[2, 2], [2, 4], [4, 4], [4, 2]]] } as const;
    expect(regionArea(holed)).toBe(96);
    expect(regionArea({ kind: "polygon", points: [[0, 0], [1, 1]] })).toBe(0);
  });

  it("gives the area of a box from its shape, w by h for a rect, and undefined for free", () => {
    expect(boxArea(rect)).toBe(100);
    expect(boxArea(circle)).toBeCloseTo(25 * Math.PI, 12);
    expect(boxArea(tri)).toBe(50);
    expect(boxArea({ ...rect, shape: { kind: "rect", x: 1, y: 1, w: 8, h: 8 } })).toBe(64);
    expect(boxArea(ellipse)).toBeUndefined();
    expect(boxArea({ ...ellipse, shapeKind: "free" })).toBeUndefined();
    expect(boxArea({ ...rect, shapeKind: "free" })).toBeUndefined();
    expect(boxArea({ ...tri, shapeKind: "free" })).toBeUndefined();
    expect(boxArea({ ...rect, shapeKind: "circle" })).toBeUndefined();
  });

  it("declares the area of polygon and circle, and not of free", () => {
    expect(SHAPE_KINDS.filter((k) => k.geometry.area).map((k) => k.id)).toEqual(["rect", "polygon", "circle"]);
    expect(SHAPE_KINDS.filter((k) => k.geometry.contains).map((k) => k.id)).toEqual(["rect"]);
  });
});

describe("the safe level of a rule (L57)", () => {
  const noOverlap = PACK_HARD_RULES.find((r) => r.id === "no-overlap")!;
  const inContainer = PACK_HARD_RULES.find((r) => r.id === "in-container")!;

  it("gives the level of each hard rule on each kind", () => {
    expect(SHAPE_KIND_IDS.map((k) => ruleLevel(noOverlap, k))).toEqual(["exact", "safe", "safe", "safe"]);
    expect(SHAPE_KIND_IDS.map((k) => ruleLevel(inContainer, k))).toEqual(["exact", "safe", "safe", "safe"]);
    for (const id of ["locked-kept", "complete"]) expect(SHAPE_KIND_IDS.map((k) => ruleLevel(PACK_HARD_RULES.find((r) => r.id === id)!, k))).toEqual(["exact", "exact", "exact", "exact"]);
    expect(SHAPE_KIND_IDS.map((k) => ruleLevel({}, k))).toEqual(["exact", "none", "none", "none"]);
    expect(ruleLevel({ shapes: ["circle"], safe: ["free"] }, "rect")).toBe("none");
  });

  it("refuses a kind in shapes and in safe, an unknown kind and a repeated kind", () => {
    expect(shapeSupportProblems([...JOINT_MEASURES, ...PACK_HARD_RULES])).toEqual([]);
    expect(shapeSupportProblems([{ id: "a", shapes: ["rect", "circle"], safe: ["circle", "free"] }])).toEqual(["a: the kind circle is in shapes and in safe"]);
    expect(shapeSupportProblems([{ id: "b", safe: ["rect"] }])).toEqual(["b: the kind rect is in shapes and in safe"]);
    expect(shapeSupportProblems([{ id: "c", safe: ["hexagon" as never] }])).toEqual(["c: the safe kind hexagon is not a declared kind"]);
    expect(shapeSupportProblems([{ id: "d", shapes: ["rect", "rect"], safe: ["free", "free"] }])).toEqual([
      "d: the shapes list has the kind rect two times",
      "d: the safe list has the kind free two times",
    ]);
    expect(shapeSupportProblems([{ id: "e", safe: "free" as never }])).toEqual(["e: the safe value is not a list of shape kinds"]);
  });

  it("refuses a safe kind by default, and accepts it with the level safe", () => {
    const exact = checkShapes(input([rect, tri]), PACK_HARD_RULES);
    expect(exact.map((b) => b.detail)).toEqual([
      "no-overlap supports only the shape kinds rect, but the input t has polygon boxes: p. The count of no-overlap on polygon is only safe",
      "in-container supports only the shape kinds rect, but the input t has polygon boxes: p. The count of in-container on polygon is only safe",
    ]);
    expect(checkShapes(input([rect, tri, circle, ellipse]), PACK_HARD_RULES, { level: "safe" })).toEqual([]);
    const measures = checkShapes(input([tri]), [...JOINT_MEASURES, ...PACK_HARD_RULES], { level: "safe" });
    expect(measures.map((b) => b.detail.split(" ")[0])).toEqual(["joint.fill", "joint.straight.length"]);
  });

  it("over-counts two triangles whose bounding boxes overlap, and gives 0 when the boxes do not overlap", () => {
    const other: LayoutBox = { id: "q", w: 10, h: 10, shape: { kind: "polygon", points: [[10, 0], [10, 10], [0, 10]] } };
    expect(countOverlaps([{ ...tri, x: 0, y: 0 }, { ...other, x: 0, y: 0 }])).toBe(1);
    expect(countOverlaps([{ ...tri, x: 0, y: 0 }, { ...other, x: 10, y: 0 }])).toBe(0);
  });
});

describe("the bound of a measure (0.2.17)", () => {
  // A model of pack.shapeFill of packing: w by h is the area of a free box, so the fill is an upper bound of the true fill there.
  const shapeFill: MeasureSpec = {
    id: "pack.shapeFill",
    unit: "0 to 1",
    direction: "higher",
    min: 0,
    max: 1,
    shapes: ["rect", "polygon", "circle"],
    bound: { shapes: ["free"], side: "upper" },
  };

  it("gives the level bound for a bound kind, and keeps ruleLevel and the joint measures", () => {
    expect(SHAPE_KIND_IDS.map((k) => shapeLevel(shapeFill, k))).toEqual(["exact", "exact", "exact", "bound"]);
    expect(SHAPE_KIND_IDS.map((k) => ruleLevel(shapeFill, k))).toEqual(["exact", "exact", "exact", "none"]);
    const noOverlap = PACK_HARD_RULES.find((r) => r.id === "no-overlap")!;
    expect(SHAPE_KIND_IDS.map((k) => shapeLevel(noOverlap, k))).toEqual(SHAPE_KIND_IDS.map((k) => ruleLevel(noOverlap, k)));
    expect(SHAPE_KIND_IDS.map((k) => shapeLevel({ bound: { shapes: ["circle"], side: "lower" } }, k))).toEqual(["exact", "none", "bound", "none"]);
    for (const m of JOINT_MEASURES) {
      expect(m.bound).toBeUndefined();
      expect(SHAPE_KIND_IDS.map((k) => shapeLevel(m, k))).toEqual(SHAPE_KIND_IDS.map((k) => ruleLevel(m, k)));
    }
  });

  it("refuses a bound kind by default and with the level safe, and accepts it only with the level bound", () => {
    expect(checkShapes(input([rect, tri, circle]), [shapeFill])).toEqual([]);
    expect(checkShapes(input([rect, ellipse]), [shapeFill]).map((b) => b.detail)).toEqual([
      "pack.shapeFill supports only the shape kinds rect, polygon, circle, but the input t has free boxes: e. The value of pack.shapeFill is only an upper bound for free",
    ]);
    const lower = { ...shapeFill, id: "pack.low", bound: { shapes: ["free"], side: "lower" } } as const;
    expect(checkShapes(input([ellipse]), [lower])[0]!.detail).toMatch(/The value of pack.low is only a lower bound for free$/);
    const ids = (level?: "exact" | "safe" | "bound"): string[] =>
      checkShapes(input([rect, ellipse]), [shapeFill, ...PACK_HARD_RULES], level === undefined ? {} : { level }).map((b) => b.detail.split(" ")[0]!);
    expect(ids()).toEqual(["pack.shapeFill", "no-overlap", "in-container"]);
    expect(ids("exact")).toEqual(["pack.shapeFill", "no-overlap", "in-container"]);
    // The level safe keeps its meaning of 0.2.16: a pass is a proof. Thus it accepts the safe rule counts, but not the bound value.
    expect(ids("safe")).toEqual(["pack.shapeFill"]);
    expect(checkShapes(input([ellipse]), [shapeFill], { level: "safe" })[0]!.detail).toMatch(/only an upper bound for free$/);
    expect(ids("bound")).toEqual([]);
    expect(checkShapes(input([tri]), [...JOINT_MEASURES, ...PACK_HARD_RULES], { level: "bound" }).map((b) => b.detail.split(" ")[0])).toEqual(["joint.fill", "joint.straight.length"]);
  });

  it("refuses a kind in two lists, an unknown kind, a repeated kind and a bad side", () => {
    expect(shapeSupportProblems([shapeFill, ...JOINT_MEASURES, ...PACK_HARD_RULES])).toEqual([]);
    expect(shapeSupportProblems([{ id: "a", shapes: ["rect", "free"], bound: { shapes: ["free"], side: "upper" } }])).toEqual(["a: the kind free is in shapes and in bound"]);
    expect(shapeSupportProblems([{ id: "b", bound: { shapes: ["rect"], side: "lower" } }])).toEqual(["b: the kind rect is in shapes and in bound"]);
    expect(shapeSupportProblems([{ id: "c", safe: ["circle"], bound: { shapes: ["circle"], side: "upper" } }])).toEqual(["c: the kind circle is in safe and in bound"]);
    expect(shapeSupportProblems([{ id: "d", bound: { shapes: ["hexagon" as never, "free", "free"], side: "upper" } }])).toEqual([
      "d: the bound kind hexagon is not a declared kind",
      "d: the bound list has the kind free two times",
    ]);
    expect(shapeSupportProblems([{ id: "e", bound: { shapes: ["free"], side: "middle" as never } }])).toEqual(["e: the bound side middle is not upper or lower"]);
    expect(shapeSupportProblems([{ id: "f", bound: { side: "upper" } as never }])).toEqual(["f: the bound shapes value is not a list of shape kinds"]);
    expect(shapeSupportProblems([{ id: "g", bound: "free" as never }])).toEqual(["g: the bound value is not an object with shapes and a side"]);
  });
});
