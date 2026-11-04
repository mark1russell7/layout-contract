import { describe, expect, it } from "vitest";
import { pointSegmentDistance, segmentsCross } from "./geometry.ts";

const p = (x: number, y: number) => ({ x, y });

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
