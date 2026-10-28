import { describe, expect, it } from "vitest";
import {
  checkInput,
  checkShapes,
  itemShapeOf,
  JOINT_MEASURES,
  PACK_HARD_RULES,
  SHAPE_KIND_IDS,
  SHAPE_KINDS,
  shapeKindOf,
  shapeKindsOf,
  toLayoutRecord,
  type LayoutBox,
  type LayoutInput,
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
