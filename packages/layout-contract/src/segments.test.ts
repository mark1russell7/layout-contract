import { describe, expect, it } from "vitest";
import { boxCenterDistance, crossingPoint, pointInRing, pointInRings, pointSegmentDistance, segmentsCross, type Ring } from "./geometry.ts";

const p = (x: number, y: number) => ({ x, y });

describe("crossingPoint", () => {
  it("gives the point where two segments cross", () => {
    expect(crossingPoint(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toEqual(p(5, 5));
    expect(crossingPoint(p(0, 0), p(4, 0), p(1, -1), p(1, 3))).toEqual(p(1, 0));
  });

  it("gives nothing for a touch at an end, for collinear segments and for segments apart", () => {
    expect(crossingPoint(p(0, 0), p(5, 5), p(0, 10), p(10, 0))).toBeUndefined();
    expect(crossingPoint(p(0, 0), p(10, 0), p(10, 0), p(10, 10))).toBeUndefined();
    expect(crossingPoint(p(0, 0), p(10, 0), p(5, 0), p(15, 0))).toBeUndefined();
    expect(crossingPoint(p(0, 0), p(1, 1), p(0, 10), p(10, 0))).toBeUndefined();
  });

  it("gives a point at a small scale, as segmentsCross does", () => {
    const s = 1e-100;
    const q = crossingPoint(p(0, 0), p(s, s), p(0, s), p(s, 0));
    expect(q?.x).toBeCloseTo(s / 2, 110);
    expect(q?.y).toBeCloseTo(s / 2, 110);
  });

  it("gives a point exactly when segmentsCross is true, on the 2 segments, on a seeded walk", () => {
    let state = 12345;
    const next = (): number => {
      state = (state * 48271) % 2147483647;
      return (state % 41) - 20;
    };
    let crossed = 0;
    for (let i = 0; i < 2000; i++) {
      const [a, b, c, d] = [p(next(), next()), p(next(), next()), p(next(), next()), p(next(), next())];
      const q = crossingPoint(a, b, c, d);
      expect(q !== undefined).toBe(segmentsCross(a, b, c, d));
      if (q === undefined) continue;
      crossed++;
      expect(pointSegmentDistance(q, a, b)).toBeLessThan(1e-9);
      expect(pointSegmentDistance(q, c, d)).toBeLessThan(1e-9);
    }
    expect(crossed).toBeGreaterThan(100);
  });
});

describe("segmentsCross", () => {
  it("is true when the segments cross inside both of them", () => {
    expect(segmentsCross(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
  });

  it("is false when the lines cross outside a segment", () => {
    expect(segmentsCross(p(0, 0), p(1, 1), p(0, 10), p(10, 0))).toBe(false);
  });

  it("is false when a segment only touches at an end", () => {
    expect(segmentsCross(p(0, 0), p(5, 5), p(0, 10), p(10, 0))).toBe(false);
    expect(segmentsCross(p(0, 0), p(10, 0), p(10, 0), p(10, 10))).toBe(false);
  });

  it("is false for collinear segments, also when they overlap", () => {
    expect(segmentsCross(p(0, 0), p(10, 0), p(5, 0), p(15, 0))).toBe(false);
  });

  it("has no tolerance: a crossing of a small size counts", () => {
    expect(segmentsCross(p(0, 0), p(1e-9, 1e-9), p(0, 1e-9), p(1e-9, 0))).toBe(true);
  });

  it("finds a crossing at a scale where a product of two turns underflows", () => {
    const s = 1e-100;
    expect(segmentsCross(p(0, 0), p(s, s), p(0, s), p(s, 0))).toBe(true);
  });

  it("is false for a turn of 0 on one side and of either sign on the other", () => {
    expect(segmentsCross(p(0, 0), p(10, 0), p(5, 0), p(5, 10))).toBe(false);
    expect(segmentsCross(p(0, 0), p(10, 0), p(5, -10), p(5, 0))).toBe(false);
  });

  it("is false for a coordinate that is not a number", () => {
    expect(segmentsCross(p(Number.NaN, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(false);
    expect(segmentsCross(p(0, 0), p(10, 10), p(0, 10), p(10, Number.NaN))).toBe(false);
  });

  it("gives the same answer when the segments change places or direction", () => {
    const [a, b, c, d] = [p(0, 0), p(10, 3), p(2, 9), p(7, -4)];
    const answer = segmentsCross(a, b, c, d);
    expect(segmentsCross(c, d, a, b)).toBe(answer);
    expect(segmentsCross(b, a, d, c)).toBe(answer);
  });
});

describe("pointSegmentDistance", () => {
  it("measures to the nearest point inside the segment", () => {
    expect(pointSegmentDistance(p(5, 3), p(0, 0), p(10, 0))).toBe(3);
  });

  it("measures to the nearest end past the segment", () => {
    expect(pointSegmentDistance(p(13, 4), p(0, 0), p(10, 0))).toBe(5);
    expect(pointSegmentDistance(p(-3, -4), p(0, 0), p(10, 0))).toBe(5);
  });

  it("treats a segment of length 0 as a point", () => {
    expect(pointSegmentDistance(p(3, 4), p(0, 0), p(0, 0))).toBe(5);
  });

  it("gives 0 for a point on the segment", () => {
    expect(pointSegmentDistance(p(4, 0), p(0, 0), p(10, 0))).toBe(0);
  });
});

describe("pointInRing and pointInRings", () => {
  const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
  // An L shape: the square without its top-right quarter.
  const ell: Ring = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
  const hole: Ring = [[3, 3], [7, 3], [7, 7], [3, 7]];

  it("tells if a point is inside a ring by the even-odd rule", () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(15, 5, square)).toBe(false);
    expect(pointInRing(-1, 5, square)).toBe(false);
    expect(pointInRing(2, 8, ell)).toBe(true);
    expect(pointInRing(8, 8, ell)).toBe(false);
    expect(pointInRing(8, 2, ell)).toBe(true);
  });

  it("counts a point in a hole as out", () => {
    expect(pointInRings(5, 5, [square, hole])).toBe(false);
    expect(pointInRings(1, 1, [square, hole])).toBe(true);
    expect(pointInRings(5, 5, [square])).toBe(pointInRing(5, 5, square));
  });

  it("gives false for a ring with fewer than 3 corners and for no rings", () => {
    expect(pointInRing(0, 0, [])).toBe(false);
    expect(pointInRings(5, 5, [])).toBe(false);
  });
});

describe("boxCenterDistance", () => {
  it("gives the distance between the centers of two rectangles, in each order", () => {
    const a = { x: 0, y: 0, w: 2, h: 2 };
    const b = { x: 3, y: 4, w: 2, h: 2 };
    expect(boxCenterDistance(a, b)).toBe(5);
    expect(boxCenterDistance(b, a)).toBe(5);
    expect(boxCenterDistance(a, a)).toBe(0);
    // The centers are (1, 1) and (1, 4): a change of size moves the center.
    expect(boxCenterDistance(a, { x: 0, y: 2, w: 2, h: 4 })).toBe(3);
  });
});
