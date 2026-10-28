import { describe, expect, it } from "vitest";
import { countOutside, packHard, rectInRegion, type LayoutBox, type LayoutContainer, type LayoutInput, type Region } from "./index.ts";

/** A convex octagon in 0..100 with the four corners cut. The diagonal edges are on the lines x + y = 30 and the like. */
const octagon: Region = {
  kind: "polygon",
  points: [[30, 0], [70, 0], [100, 30], [100, 70], [70, 100], [30, 100], [0, 70], [0, 30]],
};
/** A concave L in 0..100 with a notch at the bottom right. */
const lShape: Region = { kind: "polygon", points: [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]] };
/** A square 0..100 with a square hole 40..60. */
const holed: Region = {
  kind: "polygon",
  points: [[0, 0], [100, 0], [100, 100], [0, 100]],
  holes: [[[40, 40], [60, 40], [60, 60], [40, 60]]],
};
const circle: Region = { kind: "circle", cx: 50, cy: 50, r: 50 };
const ellipse: Region = { kind: "ellipse", cx: 50, cy: 25, rx: 50, ry: 25 };

const shaped = (shape: Region, boxes: LayoutBox[], extra: Partial<LayoutContainer> = {}): LayoutInput => ({
  schema: "layout-input/1",
  id: "c",
  container: { fixed: "size", shape, ...extra },
  boxes,
});
const box = (x: number, y: number, w = 10, h = 10, margin?: number): LayoutBox =>
  margin === undefined ? { id: "a", w, h, x, y } : { id: "a", w, h, x, y, margin };
const exact = { exactContainer: true } as const;

describe("rectInRegion", () => {
  it("tests a rect region by plain containment", () => {
    const r: Region = { kind: "rect", x: 0, y: 0, w: 10, h: 10 };
    expect(rectInRegion(r, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(rectInRegion(r, { x: 1, y: 1, w: 10, h: 2 })).toBe(false);
  });

  it("tests the corners of a circle and an ellipse, with a corner on the border inside", () => {
    expect(rectInRegion(circle, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectInRegion({ kind: "circle", cx: 0, cy: 0, r: 5 }, { x: -3, y: -4, w: 6, h: 8 })).toBe(true);
    expect(rectInRegion(ellipse, { x: 0, y: 0, w: 10, h: 5 })).toBe(false);
    expect(rectInRegion({ kind: "ellipse", cx: 0, cy: 0, rx: 10, ry: 5 }, { x: -6, y: -4, w: 12, h: 8 })).toBe(true);
  });

  it("finds a cut corner of a convex polygon, and accepts a box on the border", () => {
    expect(rectInRegion(octagon, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectInRegion(octagon, { x: 30, y: 0, w: 40, h: 100 })).toBe(true);
    expect(rectInRegion(octagon, { x: 15, y: 15, w: 70, h: 70 })).toBe(true);
  });

  it("finds the notch of a concave polygon", () => {
    expect(rectInRegion(lShape, { x: 60, y: 60, w: 10, h: 10 })).toBe(false);
    expect(rectInRegion(lShape, { x: 10, y: 10, w: 80, h: 80 })).toBe(false);
    expect(rectInRegion(lShape, { x: 0, y: 0, w: 100, h: 50 })).toBe(true);
    expect(rectInRegion(lShape, { x: 0, y: 0, w: 50, h: 100 })).toBe(true);
  });

  it("finds an edge of a notch with both ends on the border of the box", () => {
    // The notch (2, 0), (3, 4), (4, 0) has no vertex strictly inside the box and no edge that crosses an edge of the box.
    const notched: Region = { kind: "polygon", points: [[0, 0], [2, 0], [3, 4], [4, 0], [10, 0], [10, 10], [0, 10]] };
    expect(rectInRegion(notched, { x: 0, y: 0, w: 10, h: 4 })).toBe(false);
    expect(rectInRegion(notched, { x: 0, y: 4, w: 10, h: 6 })).toBe(true);
    expect(rectInRegion(notched, { x: 5, y: 0, w: 5, h: 10 })).toBe(true);
  });

  it("finds a box on a hole or over a hole, and accepts a box next to a hole", () => {
    expect(rectInRegion(holed, { x: 45, y: 45, w: 5, h: 5 })).toBe(false);
    expect(rectInRegion(holed, { x: 30, y: 30, w: 40, h: 40 })).toBe(false);
    expect(rectInRegion(holed, { x: 20, y: 40, w: 20, h: 20 })).toBe(true);
  });
});

describe("countOutside with exactContainer", () => {
  const cases: readonly (readonly [string, LayoutInput, number])[] = [
    ["a cut corner of a convex polygon", shaped(octagon, [box(0, 0)]), 1],
    ["the notch of an L", shaped(lShape, [box(60, 60)]), 1],
    ["a hole", shaped(holed, [box(45, 45, 5, 5)]), 1],
    ["next to a hole", shaped(holed, [box(20, 40, 20, 20)]), 0],
    ["a corner of the bounds of a circle", shaped(circle, [box(0, 0)]), 1],
    ["a corner of the bounds of an ellipse", shaped(ellipse, [box(0, 0, 10, 5)]), 1],
    ["exactly on the border", shaped(octagon, [box(15, 15, 70, 70)]), 0],
    ["a little over a diagonal, inside the tolerance", shaped(octagon, [box(14.9996, 14.9996)]), 0],
    ["over a diagonal by more than the tolerance", shaped(octagon, [box(14.99, 14.99)]), 1],
    ["on a diagonal with no inset", shaped(octagon, [box(15, 15)]), 0],
    ["on a diagonal with an inset", shaped(octagon, [box(15, 15)], { inset: 1 }), 1],
    ["near a diagonal with no margin", shaped(octagon, [box(16, 16)]), 0],
    ["near a diagonal with a margin", shaped(octagon, [box(16, 16, 10, 10, 2)]), 1],
  ];

  for (const [name, input, count] of cases) {
    it(`counts a box in ${name} as ${count}, and 0 without the option`, () => {
      expect(countOutside(input, undefined, exact)).toBe(count);
      expect(countOutside(input)).toBe(0);
      expect(countOutside(input, undefined, { exactContainer: false })).toBe(0);
      const output = { placements: input.boxes.map((b) => ({ id: b.id, x: b.x!, y: b.y! })), overflow: [], size: { w: 100, h: 100 }, moved: [] };
      expect(packHard(input, output, undefined, exact)["in-container"]).toBe(count);
      expect(packHard(input, output)["in-container"]).toBe(0);
    });
  }

  it("uses the tolerance of the call", () => {
    expect(countOutside(shaped(octagon, [box(14.99, 14.99)]), 0.1, exact)).toBe(0);
  });

  it("keeps the bounding test for a box out of the bounds", () => {
    const i = shaped(octagon, [box(95, 40)]);
    expect(countOutside(i)).toBe(1);
    expect(countOutside(i, undefined, exact)).toBe(1);
  });

  it("keeps the old rule for a shaped container with a free side", () => {
    expect(countOutside(shaped(octagon, [box(0, 0)], { fixed: "width" }), undefined, exact)).toBe(0);
    expect(countOutside(shaped(octagon, [box(0, 0)], { fixed: "none" }), undefined, exact)).toBe(0);
  });

  it("changes nothing for a container without a shape", () => {
    const i: LayoutInput = { schema: "layout-input/1", id: "r", container: { w: 100, h: 100, fixed: "size" }, boxes: [box(0, 0), { id: "b", w: 10, h: 10, x: 95, y: 0 }] };
    expect(countOutside(i, undefined, exact)).toBe(countOutside(i));
    expect(countOutside(i)).toBe(1);
  });
});
