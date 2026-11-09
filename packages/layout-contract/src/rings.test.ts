import { describe, expect, it } from "vitest";
import { clipRing, regionArea, ringCentroid, type Ring } from "./index.ts";

const square: Ring = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

const areaOf = (ring: Ring): number => regionArea({ kind: "polygon", points: ring });

describe("ringCentroid", () => {
  it("gives the center of a square in each direction of the corners", () => {
    expect(ringCentroid(square)).toEqual({ x: 2, y: 2 });
    expect(ringCentroid([...square].reverse())).toEqual({ x: 2, y: 2 });
  });

  it("gives the centroid of the area, not the mean of the corners", () => {
    // An L of three unit squares: (0,0)-(2,1) and (0,1)-(1,2). The area centroid is (5/6, 5/6).
    const shape: Ring = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    const c = ringCentroid(shape);
    expect(c.x).toBeCloseTo(5 / 6, 12);
    expect(c.y).toBeCloseTo(5 / 6, 12);
  });

  it("gives the same centroid after a move of the ring", () => {
    const moved = square.map(([x, y]) => [x + 100, y - 7] as const);
    expect(ringCentroid(moved)).toEqual({ x: 102, y: -5 });
  });

  it("keeps the digits of a small ring far from the origin", () => {
    const tiny: Ring = [
      [1e6, 1e6],
      [1e6 + 0.001, 1e6],
      [1e6 + 0.001, 1e6 + 0.001],
      [1e6, 1e6 + 0.001],
    ];
    const c = ringCentroid(tiny);
    expect(c.x).toBeCloseTo(1e6 + 0.0005, 6);
    expect(c.y).toBeCloseTo(1e6 + 0.0005, 6);
  });

  it("gives the mean of the corners for a ring with the area 0, and refuses an empty ring", () => {
    expect(ringCentroid([[1, 1], [3, 3], [5, 5]])).toEqual({ x: 3, y: 3 });
    expect(ringCentroid([[2, 7]])).toEqual({ x: 2, y: 7 });
    expect(() => ringCentroid([])).toThrow(RangeError);
  });
});

describe("clipRing", () => {
  it("keeps the left half of a square for x <= 2", () => {
    const half = clipRing(square, 1, 0, 2);
    expect(areaOf(half)).toBe(8);
    expect(ringCentroid(half)).toEqual({ x: 1, y: 2 });
  });

  it("keeps the whole ring when it is inside, and gives an empty ring when it is outside", () => {
    expect(clipRing(square, 1, 0, 10)).toEqual(square);
    expect(clipRing(square, 1, 0, -1)).toEqual([]);
  });

  it("cuts a triangle off a square on a diagonal", () => {
    // x + y <= 2 keeps the corner triangle (0,0), (2,0), (0,2) of area 2.
    const corner = clipRing(square, 1, 1, 2);
    expect(areaOf(corner)).toBeCloseTo(2, 12);
    expect(corner).toHaveLength(3);
  });

  it("gives two complementary parts that sum to the area of the ring", () => {
    for (const [a, b, c] of [
      [1, 0.3, 2.2],
      [-0.4, 1, 1.7],
      [2, -3, 0.5],
    ] as const) {
      const inside = clipRing(square, a, b, c);
      const outside = clipRing(square, -a, -b, -c);
      expect(areaOf(inside) + areaOf(outside)).toBeCloseTo(16, 10);
    }
  });

  it("gives a convex part of a convex ring after many cuts, as the cell of a power diagram needs", () => {
    let cell: Ring = square;
    for (const [a, b, c] of [
      [1, 1, 6],
      [-1, 1, 2],
      [1, -1, 2],
      [-1, -1, -1],
    ] as const)
      cell = clipRing(cell, a, b, c);
    // Each turn of the part goes the same way: the sign of each cross product is the same.
    const signs = cell.map((p, i) => {
      const q = cell[(i + 1) % cell.length]!;
      const r = cell[(i + 2) % cell.length]!;
      return Math.sign((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]));
    });
    expect(new Set(signs.filter((s) => s !== 0)).size).toBe(1);
    expect(areaOf(cell)).toBeGreaterThan(0);
  });
});
