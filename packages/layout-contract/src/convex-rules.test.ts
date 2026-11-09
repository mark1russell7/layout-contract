import { describe, expect, it } from "vitest";
import {
  convexCorners,
  convexOverlap,
  cornersInConvex,
  countOutside,
  countOverlaps,
  overlapOf,
  packHard,
  placedConvex,
  shapesOverlap,
  type LayoutBox,
  type LayoutInput,
  type PackOutput,
  type Ring,
} from "./index.ts";

// The hard rules of version 3: a convex polygon counts by the separating axis theorem, and by its corners in a convex container.

/** A box at (`x`, `y`) with the polygon shape `points`, relative to its origin. */
const poly = (id: string, x: number, y: number, points: Ring, margin?: number): LayoutBox => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { id, x, y, w: Math.max(...xs), h: Math.max(...ys), shape: { kind: "polygon", points }, ...(margin === undefined ? {} : { margin }) };
};

const lower: Ring = [
  [0, 0],
  [100, 0],
  [0, 100],
];
const upper: Ring = [
  [100, 0],
  [100, 100],
  [0, 100],
];

describe("convexCorners", () => {
  it("gives the corners of a rectangle and of a convex polygon in each direction", () => {
    expect(convexCorners({ kind: "rect", x: 1, y: 2, w: 3, h: 4 })).toEqual([
      [1, 2],
      [4, 2],
      [4, 6],
      [1, 6],
    ]);
    expect(convexCorners({ kind: "polygon", points: lower })).toBe(lower);
    expect(convexCorners({ kind: "polygon", points: [...lower].reverse() })).toHaveLength(3);
    // A corner on a straight side is permitted.
    expect(convexCorners({ kind: "polygon", points: [[0, 0], [50, 0], [100, 0], [0, 100]] })).toHaveLength(4);
  });

  it("gives undefined for a concave polygon, a hole, an area of 0 and a circle", () => {
    expect(convexCorners({ kind: "polygon", points: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]] })).toBeUndefined();
    expect(convexCorners({ kind: "polygon", points: lower, holes: [[[10, 10], [20, 10], [10, 20]]] })).toBeUndefined();
    expect(convexCorners({ kind: "polygon", points: [[0, 0], [1, 1], [2, 2]] })).toBeUndefined();
    expect(convexCorners({ kind: "polygon", points: [[0, 0], [1, 1]] })).toBeUndefined();
    expect(convexCorners({ kind: "circle", cx: 0, cy: 0, r: 1 })).toBeUndefined();
  });
});

describe("convexOverlap", () => {
  it("gives the lesser axis of overlapOf for two rectangles", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 7, y: 4, w: 10, h: 10 };
    const o = overlapOf(a, b);
    const ring = (r: typeof a): Ring => convexCorners({ kind: "rect", ...r })!;
    expect(convexOverlap(ring(a), ring(b))).toBeCloseTo(Math.min(o.x, o.y), 12);
  });

  it("gives 0 for two triangles with a common side, and more than 0 when they overlap", () => {
    expect(convexOverlap(lower, upper)).toBeCloseTo(0, 12);
    const moved = upper.map(([x, y]) => [x - 10, y - 10] as const);
    expect(convexOverlap(lower, moved)).toBeGreaterThan(5);
  });
});

describe("no-overlap of version 3", () => {
  it("does not count two triangles that fill one square", () => {
    const boxes = [poly("a", 0, 0, lower), poly("b", 0, 0, upper)];
    expect(countOverlaps(boxes)).toBe(0);
    expect(shapesOverlap(boxes[0]!, boxes[1]!)).toBe(false);
  });

  it("does not count the 4 cells of a square cut on its diagonals", () => {
    const c: Ring[] = [
      [[0, 0], [100, 0], [50, 50]],
      [[100, 0], [100, 100], [50, 50]],
      [[100, 100], [0, 100], [50, 50]],
      [[0, 100], [0, 0], [50, 50]],
    ];
    expect(countOverlaps(c.map((points, i) => ({ id: `c${i}`, x: 0, y: 0, w: 100, h: 100, shape: { kind: "polygon", points } })))).toBe(0);
  });

  it("counts two triangles that overlap", () => {
    expect(countOverlaps([poly("a", 0, 0, lower), poly("b", -10, -10, upper)])).toBe(1);
  });

  it("does not count a rectangle in the empty corner of the bounds of a triangle", () => {
    const box: LayoutBox = { id: "r", x: 70, y: 70, w: 20, h: 20 };
    expect(countOverlaps([poly("a", 0, 0, lower), box])).toBe(0);
    expect(countOverlaps([poly("a", 0, 0, lower), { ...box, x: 30, y: 30 }])).toBe(1);
  });

  it("keeps the bounds test for a box with a margin, a concave polygon and a pair gap", () => {
    expect(countOverlaps([poly("a", 0, 0, lower, 1), poly("b", 0, 0, upper)])).toBe(1);
    expect(placedConvex(poly("a", 0, 0, lower, 1))).toBeUndefined();
    const ell: Ring = [[0, 0], [100, 0], [100, 10], [10, 10], [10, 100], [0, 100]];
    expect(countOverlaps([poly("l", 0, 0, ell), { id: "r", x: 50, y: 50, w: 20, h: 20 }])).toBe(1);
    expect(countOverlaps([poly("a", 0, 0, lower), poly("b", 0, 0, upper)], undefined, [{ a: "a", b: "b", gap: 0 }])).toBe(1);
  });
});

describe("in-container of version 3", () => {
  const triangle = (inset?: number): LayoutInput => ({
    schema: "layout-input/1",
    id: "t",
    container: { fixed: "size", w: 100, h: 100, shape: { kind: "polygon", points: lower }, ...(inset === undefined ? {} : { inset }) },
    boxes: [],
  });
  const half: Ring = [
    [0, 0],
    [50, 0],
    [0, 50],
  ];

  it("counts a triangle in a triangle container by its corners", () => {
    expect(countOutside({ ...triangle(), boxes: [poly("a", 10, 10, half)] })).toBe(0);
    expect(countOutside({ ...triangle(), boxes: [poly("a", 30, 30, half)] })).toBe(1);
  });

  it("reads the inset of the container", () => {
    expect(countOutside({ ...triangle(5), boxes: [poly("a", 10, 10, half)] })).toBe(0);
    expect(countOutside({ ...triangle(15), boxes: [poly("a", 10, 10, half)] })).toBe(1);
  });

  it("tests the corners against a convex ring in either direction", () => {
    const inner: Ring = [
      [10, 10],
      [60, 10],
      [10, 60],
    ];
    expect(cornersInConvex(inner, lower)).toBe(true);
    expect(cornersInConvex(inner, [...lower].reverse())).toBe(true);
    expect(cornersInConvex(inner, lower, 15)).toBe(false);
    expect(cornersInConvex(inner, lower, 15, 6)).toBe(true);
  });

  it("keeps the bounds test for a rectangle box", () => {
    expect(countOutside({ ...triangle(), boxes: [{ id: "r", x: 10, y: 10, w: 50, h: 50 }] })).toBe(1);
  });
});

// The cells of a Voronoi treemap, from a pack output with `Placement.shape` (L161 part 1) to the counts of version 3.
describe("the polygon cells of a pack output", () => {
  const cells: Ring[] = [
    [[0, 0], [100, 0], [50, 50]],
    [[100, 0], [100, 100], [50, 50]],
    [[100, 100], [0, 100], [50, 50]],
    [[0, 100], [0, 0], [50, 50]],
  ];
  const input: LayoutInput = {
    schema: "layout-input/1",
    id: "v",
    container: { fixed: "size", w: 100, h: 100, shape: { kind: "polygon", points: [[0, 0], [100, 0], [100, 100], [0, 100]] } },
    boxes: cells.map((_, i) => ({ id: `c${i}`, w: 10, h: 10, resize: { maxW: 100, maxH: 100, reshape: true } })),
  };
  const output = (dx: number): PackOutput => ({
    placements: cells.map((points, i) => ({ id: `c${i}`, x: i === 0 ? dx : 0, y: 0, w: 100, h: 100, shape: { kind: "polygon", points } })),
    overflow: [],
    size: { w: 100, h: 100 },
    moved: [],
  });

  it("counts no break for cells that fill the container, although their bounds overlap", () => {
    // The bounds of the 4 cells are one square, so a count of the bounds gives each of the 6 pairs.
    expect(countOverlaps(cells.map((_, i) => ({ id: `b${i}`, x: 0, y: 0, w: 100, h: 100 })))).toBe(6);
    expect(packHard(input, output(0))).toMatchObject({ "no-overlap": 0, "in-container": 0, "size-kept": 0 });
  });

  it("counts a cell that moves into its neighbours and out of the container", () => {
    const hard = packHard(input, output(20));
    expect(hard["no-overlap"]).toBeGreaterThan(0);
    expect(hard["in-container"]).toBe(1);
  });
});
