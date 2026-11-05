import { describe, expect, it } from "vitest";
import type { GenerateContext } from "./families.ts";
import {
  CIRCLE_SCATTERED,
  PACK_HARD_RULES,
  checkInput,
  checkShapes,
  countLinksThroughShapes,
  createFamilyRegistry,
  mulberry32,
  randomInt,
  segmentThroughShape,
  type LayoutBox,
  type LayoutInput,
  type Point,
  type ShapeLink,
} from "./index.ts";

const reg = createFamilyRegistry<LayoutInput>([CIRCLE_SCATTERED]);
const make = (seed: number, containerShape: string, count?: number): LayoutInput =>
  reg.generate("circle-scattered", seed, { containerShape, ...(count === undefined ? {} : { count }) }) as LayoutInput;

const RECT_HASHES = ["e5e08a6bdd513075", "0d7b08993763cb54", "0f9abb4f55ea95ef"];
const CIRCLE_HASHES = ["4e9e9f8797afbbc4", "3fae0722f924fb9a", "1a47aecbf2104203"];

// The generator refuses these values before it reads its context.
const NO_CONTEXT = {} as GenerateContext;

const radiusOf = (b: LayoutBox): number => (b.shape as { r: number }).r;
const circleArea = (i: LayoutInput): number => i.boxes.reduce((sum, b) => sum + Math.PI * radiusOf(b) ** 2, 0);

describe("the family circle-scattered", () => {
  it("gives the pinned hashes in each container", () => {
    expect([1, 2, 3].map((s) => make(s, "rect").hash)).toEqual(RECT_HASHES);
    expect([1, 2, 3].map((s) => make(s, "circle").hash)).toEqual(CIRCLE_HASHES);
  });

  it("states its dimensions and its set, and the id holds the container", () => {
    expect(CIRCLE_SCATTERED.dimensions.map((d) => [d.name, d.default])).toEqual([["count", 40], ["containerShape", "rect"]]);
    expect(CIRCLE_SCATTERED.crossEngine).toBe("exact");
    const one = make(1, "circle");
    expect(one.id).toBe("circle-v1/circle-scattered/circle/s1");
    expect(make(1, "rect").id).toBe("circle-v1/circle-scattered/rect/s1");
    expect(one.generator?.params).toEqual({ count: 40, containerShape: "circle" });
    expect((reg.generate("circle-scattered", 1, {}, { set: "s" }) as LayoutInput).id).toBe("s/circle-scattered/rect/s1");
  });

  it("gives one seed the same radii in the 2 containers, and another seed other radii", () => {
    expect(make(4, "rect").boxes).toEqual(make(4, "circle").boxes);
    expect(make(4, "rect").boxes).not.toEqual(make(5, "rect").boxes);
  });

  it("gives valid inputs of circles only, which take the exact rules", () => {
    for (const shape of ["rect", "circle"]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const input = make(seed, shape);
        expect(checkInput(input)).toEqual([]);
        expect(checkShapes(input, PACK_HARD_RULES)).toEqual([]);
        expect(input.obstacles ?? []).toEqual([]);
        for (const b of input.boxes) {
          expect(Number.isInteger(radiusOf(b))).toBe(true);
          expect(radiusOf(b)).toBeGreaterThanOrEqual(8);
          expect(radiusOf(b)).toBeLessThanOrEqual(40);
          expect(b.w).toBe(2 * radiusOf(b));
          expect(b.margin).toBeUndefined();
        }
      }
    }
  });

  it("fills approximately half of the container when it has a number of circles", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rect = make(seed, "rect", 200);
      const fillRect = circleArea(rect) / (rect.container!.w! * rect.container!.h!);
      expect(fillRect).toBeGreaterThan(0.47);
      expect(fillRect).toBeLessThan(0.51);
      const circle = make(seed, "circle", 200);
      const big = (circle.container!.shape as { r: number }).r;
      const fillCircle = circleArea(circle) / (Math.PI * big * big);
      expect(fillCircle).toBeGreaterThan(0.47);
      expect(fillCircle).toBeLessThanOrEqual(0.5);
    }
  });

  it("makes the container at least as large as the largest circle", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rect = make(seed, "rect", 1);
      const r = radiusOf(rect.boxes[0]!);
      expect(rect.container!.w!).toBeGreaterThanOrEqual(2 * r);
      expect(rect.container!.h!).toBeGreaterThanOrEqual(2 * r);
      const circle = make(seed, "circle", 1);
      expect((circle.container!.shape as { r: number }).r).toBeGreaterThanOrEqual(r);
    }
    expect(make(1, "rect", 0).boxes).toEqual([]);
    expect(checkInput(make(1, "circle", 0))).toEqual([]);
  });

  it("refuses a container that it does not support, and a bad count", () => {
    expect(() => make(1, "polygon")).toThrow(RangeError);
    expect(() => make(1, "hexagon")).toThrow(RangeError);
    expect(() => CIRCLE_SCATTERED.generate(1, { count: 1.5, containerShape: "rect" }, NO_CONTEXT)).toThrow(RangeError);
    expect(() => CIRCLE_SCATTERED.generate(1, { count: 1, containerShape: "ellipse" }, NO_CONTEXT)).toThrow(RangeError);
  });
});

const disc = (id: string, cx: number, cy: number, r: number): LayoutBox => ({ id, w: 2 * r, h: 2 * r, x: cx - r, y: cy - r, shape: { kind: "circle", cx: r, cy: r, r } });
const rect = (id: string, x: number, y: number, w: number, h: number): LayoutBox => ({ id, w, h, x, y });
const p = (x: number, y: number): Point => ({ x, y });

describe("segmentThroughShape", () => {
  it("does not count a route in a corner of the bounding box of a circle", () => {
    const c = disc("c", 50, 50, 50);
    expect(segmentThroughShape(p(0, 10), p(10, 0), c)).toBe(false);
    expect(segmentThroughShape(p(0, 10), p(10, 0), rect("r", 0, 0, 100, 100))).toBe(true);
  });

  it("counts a route across a circle", () => {
    expect(segmentThroughShape(p(-10, 50), p(110, 50), disc("c", 50, 50, 50))).toBe(true);
    expect(segmentThroughShape(p(50, 50), p(50, 52), disc("c", 50, 50, 50))).toBe(true);
  });

  it("uses the tolerance twice: the shape gets smaller, and a short part does not count", () => {
    const c = disc("c", 0, 0, 10);
    expect(segmentThroughShape(p(-20, 9.4), p(20, 9.4), c)).toBe(true);
    expect(segmentThroughShape(p(-20, 9.6), p(20, 9.6), c)).toBe(false);
    expect(segmentThroughShape(p(-8.9, 0), p(-20, 0), c)).toBe(true);
    expect(segmentThroughShape(p(-8.9, 0), p(-20, 0), c, 0.9)).toBe(false);
    expect(segmentThroughShape(p(-9.1, 0), p(-20, 0), c)).toBe(false);
  });

  it("gives false for a shape with no inside, a segment of length 0 and a box without a position", () => {
    expect(segmentThroughShape(p(-1, 0), p(1, 0), disc("c", 0, 0, 0.4))).toBe(false);
    expect(segmentThroughShape(p(-1, 0.5), p(2, 0.5), rect("r", 0, 0, 1, 1))).toBe(false);
    expect(segmentThroughShape(p(5, 5), p(5, 5), disc("c", 5, 5, 3))).toBe(false);
    expect(segmentThroughShape(p(5, 5), p(5, 5), rect("r", 0, 0, 10, 10))).toBe(false);
    const { x: _x, ...unplaced } = rect("r", 0, 0, 10, 10);
    expect(segmentThroughShape(p(-1, 5), p(11, 5), unplaced)).toBe(false);
  });

  it("does not read the margin", () => {
    expect(segmentThroughShape(p(-20, 11), p(20, 11), { ...disc("c", 0, 0, 10), margin: 5 })).toBe(false);
    expect(segmentThroughShape(p(-1, -1), p(11, -1), { ...rect("r", 0, 0, 10, 10), margin: 5 })).toBe(false);
  });

  it("tests a rectangle on each axis, for a straight and for a diagonal segment", () => {
    const r = rect("r", 0, 0, 10, 10);
    expect(segmentThroughShape(p(-5, 5), p(15, 5), r)).toBe(true);
    expect(segmentThroughShape(p(5, -5), p(5, 15), r)).toBe(true);
    expect(segmentThroughShape(p(-5, 0.4), p(15, 0.4), r)).toBe(false);
    expect(segmentThroughShape(p(0.4, -5), p(0.4, 15), r)).toBe(false);
    expect(segmentThroughShape(p(-5, -5), p(15, 15), r)).toBe(true);
    expect(segmentThroughShape(p(-5, 4), p(0, 9), r)).toBe(false);
    expect(segmentThroughShape(p(-5, 20), p(20, 25), r)).toBe(false);
    expect(segmentThroughShape(p(-5, 5), p(0.4, 5), r)).toBe(false);
  });
});

describe("countLinksThroughShapes", () => {
  it("counts a route once, and leaves out its 2 ends", () => {
    const boxes = [rect("a", 0, 0, 10, 10), rect("b", 100, 0, 10, 10), disc("c", 30, 5, 5), disc("d", 60, 5, 5)];
    const across: ShapeLink = { source: "a", target: "b", points: [p(5, 5), p(105, 5)] };
    const over: ShapeLink = { source: "a", target: "b", points: [p(5, 5), p(5, 50), p(105, 50), p(105, 5)] };
    expect(countLinksThroughShapes(boxes, [across])).toBe(1);
    expect(countLinksThroughShapes(boxes, [over])).toBe(0);
    expect(countLinksThroughShapes(boxes, [across, over, across])).toBe(2);
    expect(countLinksThroughShapes(boxes, [{ source: "c", target: "d", points: [p(30, 5), p(60, 5)] }])).toBe(0);
    expect(countLinksThroughShapes(boxes, [{ source: "a", target: "b", points: [] }, { source: "a", target: "b", points: [p(1, 1)] }])).toBe(0);
  });

  it("finds a wide box whose left edge is far from the segment, and skips a box without a position", () => {
    const { x: _x, ...unplaced } = rect("u", 0, 0, 500, 500);
    const boxes = [rect("wide", 0, 0, 1000, 10), rect("small", 900, 100, 10, 10), unplaced];
    expect(countLinksThroughShapes(boxes, [{ source: "s", target: "t", points: [p(800, -5), p(800, 15)] }])).toBe(1);
    expect(countLinksThroughShapes(boxes, [{ source: "s", target: "t", points: [p(800, 50), p(800, 60)] }])).toBe(0);
    expect(countLinksThroughShapes([], [{ source: "s", target: "t", points: [p(0, 0), p(1, 1)] }])).toBe(0);
  });

  it("equals a plain loop over each segment and each box on seeded boards", () => {
    let seen = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const r = mulberry32(seed);
      const boxes: LayoutBox[] = Array.from({ length: 40 }, (_, i) =>
        i % 2 === 0
          ? disc(`b${i}`, randomInt(r, 0, 800), randomInt(r, 0, 800), randomInt(r, 5, 60))
          : rect(`b${i}`, randomInt(r, 0, 800), randomInt(r, 0, 800), randomInt(r, 5, 300), randomInt(r, 5, 100)),
      );
      const links: ShapeLink[] = Array.from({ length: 30 }, () => ({
        source: `b${randomInt(r, 0, 39)}`,
        target: `b${randomInt(r, 0, 39)}`,
        points: Array.from({ length: randomInt(r, 2, 5) }, () => p(randomInt(r, -50, 850), randomInt(r, -50, 850))),
      }));
      let expected = 0;
      for (const l of links) {
        let hit = false;
        for (let i = 1; i < l.points.length; i++) {
          for (const b of boxes) {
            if (b.id !== l.source && b.id !== l.target && segmentThroughShape(l.points[i - 1]!, l.points[i]!, b)) hit = true;
          }
        }
        if (hit) expected++;
      }
      expect(countLinksThroughShapes(boxes, links)).toBe(expected);
      seen += expected;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
