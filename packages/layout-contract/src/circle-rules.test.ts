import { describe, expect, it } from "vitest";
import {
  HARD_RULE_VERSION,
  PACK_HARD_RULES,
  checkLayoutRecord,
  checkShapes,
  circleOverlaps,
  circlesOutside,
  countOutside,
  countOverlaps,
  grow,
  hardRuleOf,
  inputShapeLevel,
  overlapOf,
  packHard,
  placedCircle,
  placedRect,
  randomInt,
  shapeSupportProblems,
  shapesOverlap,
  stepRandom,
  type LayoutBox,
  type LayoutContainer,
  type LayoutInput,
  type PairGap,
  type Rect,
} from "./index.ts";

/** A placed circle box, with its shape relative to its corner, as a packer writes it. */
const disc = (id: string, cx: number, cy: number, r: number, margin?: number): LayoutBox => ({
  id,
  w: 2 * r,
  h: 2 * r,
  x: cx - r,
  y: cy - r,
  shape: { kind: "circle", cx: r, cy: r, r },
  ...(margin === undefined ? {} : { margin }),
});
const rect = (id: string, x: number, y: number, w: number, h: number, margin?: number): LayoutBox => ({
  id,
  w,
  h,
  x,
  y,
  ...(margin === undefined ? {} : { margin }),
});
const inContainer = (container: LayoutContainer, boxes: LayoutBox[], obstacles: LayoutInput["obstacles"] = []): LayoutInput => ({
  schema: "layout-input/1",
  id: "c",
  container,
  boxes,
  obstacles,
});
const circleRegion = { kind: "circle", cx: 50, cy: 50, r: 50 } as const;

/** Two circles of radius 10 whose boxes overlap at a corner, with centers 22 apart on a diagonal. */
const nearCorner = (): LayoutBox[] => [disc("a", 0, 0, 10), disc("b", 15.556, 15.556, 10)];

describe("no-overlap on two circles", () => {
  it("does not count a pair whose boxes overlap and whose circles do not", () => {
    const [a, b] = nearCorner();
    const ra = placedRect(a!)!;
    const rb = placedRect(b!)!;
    const o = overlapOf(ra, rb);
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBeGreaterThan(0);
    expect(countOverlaps([a!, b!])).toBe(0);
    expect(shapesOverlap(a!, b!)).toBe(false);
  });

  it("counts a pair whose circles overlap", () => {
    const boxes = [disc("a", 0, 0, 10), disc("b", 12, 12, 10)];
    expect(countOverlaps(boxes)).toBe(1);
    expect(shapesOverlap(boxes[0]!, boxes[1]!)).toBe(true);
  });

  it("uses the stated tolerance at the border", () => {
    expect(countOverlaps([disc("a", 0, 0, 10), disc("b", 20, 0, 10)])).toBe(0);
    expect(countOverlaps([disc("a", 0, 0, 10), disc("b", 19.9995, 0, 10)])).toBe(0);
    expect(countOverlaps([disc("a", 0, 0, 10), disc("b", 19.99, 0, 10)])).toBe(1);
    expect(countOverlaps([disc("a", 0, 0, 10), disc("b", 19.99, 0, 10)], 0.5)).toBe(0);
  });

  it("gives no overlap when the tolerance is larger than the two radii", () => {
    expect(countOverlaps([disc("a", 0, 0, 1), disc("b", 0, 0, 1)], 3)).toBe(0);
  });

  it("reads the largest side of a margin", () => {
    const wide: LayoutBox = { ...disc("a", 0, 0, 10), margin: { top: 0, right: 0, bottom: 5, left: 0 } };
    expect(countOverlaps([wide, disc("b", 24, 0, 10)])).toBe(1);
    expect(countOverlaps([wide, disc("b", 25, 0, 10)])).toBe(0);
    expect(countOverlaps([disc("a", 0, 0, 10, 2), disc("b", 23, 0, 10, 2)])).toBe(1);
  });

  it("does not count a box without a position", () => {
    const { x: _x, ...unplaced } = disc("a", 0, 0, 10);
    expect(placedCircle(unplaced)).toBeUndefined();
    expect(countOverlaps([unplaced, disc("b", 1, 1, 10)])).toBe(0);
    expect(shapesOverlap(unplaced, disc("b", 1, 1, 10))).toBe(false);
  });

  it("uses the gap of a pair in place of the two margins, also when the gap is larger than the margins", () => {
    const gap: PairGap[] = [{ a: "b", b: "a", gap: 8 }];
    expect(countOverlaps([disc("a", 0, 0, 10), disc("b", 27, 0, 10)], undefined, gap)).toBe(1);
    expect(countOverlaps([disc("a", 0, 0, 10), disc("b", 28, 0, 10)], undefined, gap)).toBe(0);
    const near: PairGap[] = [{ a: "a", b: "b", gap: 1 }];
    expect(countOverlaps([disc("a", 0, 0, 10, 5), disc("b", 25, 0, 10, 5)], undefined, near)).toBe(0);
    expect(shapesOverlap(disc("a", 0, 0, 10), disc("b", 27, 0, 10), undefined, 8)).toBe(true);
  });

  it("counts by the bounding box for a circle beside a rectangle", () => {
    const pair = [disc("a", 0, 0, 10), rect("r", 8, 8, 20, 20)];
    expect(Math.hypot(8, 8)).toBeGreaterThan(10);
    expect(countOverlaps(pair)).toBe(1);
    expect(shapesOverlap(pair[0]!, pair[1]!)).toBe(true);
    expect(countOverlaps(pair, undefined, [{ a: "a", b: "r", gap: 0 }])).toBe(1);
  });
});

describe("circleOverlaps", () => {
  it("counts only circles", () => {
    expect(circleOverlaps([rect("r", 0, 0, 20, 20), rect("s", 0, 0, 20, 20), disc("a", 0, 0, 10), disc("b", 5, 0, 10)])).toBe(1);
  });

  it("adds a gap only when the caller gives it", () => {
    const pair = [disc("a", 0, 0, 10), disc("b", 21, 0, 10)];
    expect(circleOverlaps(pair)).toBe(0);
    expect(countOverlaps(pair)).toBe(0);
    expect(circleOverlaps(pair, undefined, undefined, 2)).toBe(1);
    expect(circleOverlaps(pair, undefined, [{ a: "a", b: "b", gap: 0 }], 2)).toBe(0);
  });

  it("equals a plain distance count on seeded boards", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = stepRandom(seed, "circles");
      const boxes = Array.from({ length: 60 }, (_, i) => disc(`b${i}`, randomInt(r, 0, 400), randomInt(r, 0, 400), randomInt(r, 3, 30), randomInt(r, 0, 3)));
      let expected = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = placedCircle(boxes[i]!)!;
          const b = placedCircle(boxes[j]!)!;
          const need = a.r + b.r + (boxes[i]!.margin as number) + (boxes[j]!.margin as number) - 0.001;
          if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < need) expected++;
        }
      }
      expect(circleOverlaps(boxes)).toBe(expected);
      expect(countOverlaps(boxes)).toBe(expected);
    }
  });
});

describe("no-overlap on rectangles does not change", () => {
  /** The rule of 0.3.12, written as a plain loop over each pair. */
  function byBoxes(boxes: readonly LayoutBox[], gaps: readonly PairGap[]): number {
    const gapOf = (a: string, b: string): number | undefined => gaps.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))?.gap;
    const hit = (x: Rect, y: Rect): boolean => {
      const o = overlapOf(x, y);
      return o.x > 0.001 && o.y > 0.001;
    };
    let count = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const g = gapOf(a.id, b.id);
        const [first, second] = a.id < b.id ? [a, b] : [b, a];
        if (g === undefined ? hit(grow(placedRect(a)!, a.margin), grow(placedRect(b)!, b.margin)) : hit(grow(placedRect(first)!, g), placedRect(second)!)) count++;
      }
    }
    return count;
  }

  it("equals the count of the bounding boxes on seeded boards, with margins and pair gaps", () => {
    let seen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = stepRandom(seed, "rects");
      const boxes = Array.from({ length: 60 }, (_, i) => rect(`b${i}`, randomInt(r, 0, 500), randomInt(r, 0, 500), randomInt(r, 5, 60), randomInt(r, 5, 60), randomInt(r, 0, 4)));
      const gaps: PairGap[] = Array.from({ length: 10 }, (_, i) => ({ a: `b${i}`, b: `b${i + 20}`, gap: randomInt(r, 0, 12) }));
      const plain = countOverlaps(boxes);
      expect(plain).toBe(byBoxes(boxes, []));
      expect(countOverlaps(boxes, undefined, gaps)).toBe(byBoxes(boxes, gaps));
      seen += plain;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("in-container on a circle", () => {
  const fixed: LayoutContainer = { fixed: "size", shape: circleRegion };

  it("does not count a circle whose box corners leave the container and whose circle stays in", () => {
    const input = inContainer(fixed, [disc("a", 50, 11, 10)]);
    const corner = { ...placedRect(input.boxes[0]!)! };
    expect(Math.hypot(corner.x - 50, corner.y - 50)).toBeGreaterThan(50);
    expect(countOutside(input)).toBe(0);
    expect(circlesOutside(input)).toBe(0);
  });

  it("counts a circle that leaves the container between the axes", () => {
    const input = inContainer(fixed, [disc("a", 12, 12, 10)]);
    expect(countOutside(input)).toBe(1);
    expect(circlesOutside(input)).toBe(1);
  });

  it("reads the inset and the largest side of the margin", () => {
    expect(countOutside(inContainer(fixed, [disc("a", 50, 11, 10)]))).toBe(0);
    expect(countOutside(inContainer({ ...fixed, inset: 2 }, [disc("a", 50, 11, 10)]))).toBe(1);
    expect(circlesOutside(inContainer(fixed, [disc("a", 50, 11, 10, 2)]))).toBe(1);
    const tall = { ...disc("a", 50, 11, 10), margin: { top: 0, right: 0, bottom: 2, left: 0 } };
    expect(circlesOutside(inContainer(fixed, [tall]))).toBe(1);
  });

  it("counts a circle larger than the container", () => {
    expect(circlesOutside(inContainer(fixed, [disc("a", 50, 50, 60)]))).toBe(1);
  });

  it("reads the radius of a free size from w, which applyPack writes", () => {
    const free: LayoutContainer = { fixed: "none", w: 40, shape: { kind: "circle", cx: 50, cy: 50, r: 50 } };
    expect(circlesOutside(inContainer(free, [disc("a", 20, 20, 5)]))).toBe(0);
    expect(circlesOutside(inContainer(free, [disc("a", 38, 38, 5)]))).toBe(1);
    expect(countOutside(inContainer(free, [disc("a", 38, 38, 5)]))).toBe(1);
    const out = packHard(inContainer({ fixed: "none", shape: circleRegion }, [{ ...disc("a", 0, 0, 5) }]), { placements: [{ id: "a", x: 33, y: 33 }], overflow: [], size: { w: 40, h: 40 }, moved: [], trace: [] } as never);
    expect(out["in-container"]).toBe(1);
  });

  it("refuses another container in circlesOutside", () => {
    expect(() => circlesOutside(inContainer({ fixed: "size", w: 10, h: 10 }, []))).toThrow(RangeError);
    expect(() => circlesOutside(inContainer({ fixed: "none", shape: circleRegion }, []))).toThrow(RangeError);
  });

  it("counts by the bounding box with exactContainer false", () => {
    const input = inContainer(fixed, [disc("a", 12, 12, 10)]);
    expect(countOutside(input, undefined, { exactContainer: false })).toBe(0);
  });

  it("tests a rectangle in a shaped container by default since 0.4.0", () => {
    const input = inContainer(fixed, [rect("a", 0, 0, 10, 10)]);
    expect(countOutside(input)).toBe(1);
    expect(countOutside(input, undefined, { exactContainer: false })).toBe(0);
  });

  it("keeps a circle in a rectangle container on its box", () => {
    const input = inContainer({ fixed: "size", w: 100, h: 100 }, [disc("a", 95, 50, 10), disc("b", 50, 50, 10)]);
    expect(countOutside(input)).toBe(1);
  });
});

describe("the stated limit of the exact count", () => {
  const noOverlap = PACK_HARD_RULES.find((r) => r.id === "no-overlap")!;
  const contained = PACK_HARD_RULES.find((r) => r.id === "in-container")!;
  const circles = inContainer({ fixed: "size", shape: circleRegion }, [disc("a", 50, 50, 5), disc("b", 30, 50, 5)]);
  const beside = inContainer({ fixed: "size", w: 100, h: 100 }, [disc("a", 50, 50, 5), rect("r", 0, 0, 5, 5)]);
  const hole = inContainer({ fixed: "size", w: 100, h: 100 }, [disc("a", 50, 50, 5)], [{ id: "o", region: { kind: "rect", x: 0, y: 0, w: 5, h: 5 } }]);
  const polygon = inContainer({ fixed: "size", shape: { kind: "polygon", points: [[0, 0], [100, 0], [100, 100]] } }, [disc("a", 50, 50, 5)]);

  it("reads each row of the table with a date", () => {
    expect(shapeSupportProblems(PACK_HARD_RULES)).toEqual([]);
    expect(noOverlap.limit?.until).toBe("2026-11-28");
    expect(contained.limit?.until).toBe("2026-11-28");
  });

  it("gives exact on circles alone, and safe on the inputs that the limit names", () => {
    expect(inputShapeLevel(noOverlap, "circle", circles)).toBe("exact");
    expect(inputShapeLevel(noOverlap, "circle", beside)).toBe("safe");
    expect(inputShapeLevel(noOverlap, "rect", beside)).toBe("safe");
    expect(inputShapeLevel(noOverlap, "circle", hole)).toBe("safe");
    expect(inputShapeLevel(contained, "circle", beside)).toBe("exact");
    expect(inputShapeLevel(contained, "circle", polygon)).toBe("safe");
  });

  it("does not limit an input without a circle", () => {
    const rects = inContainer({ fixed: "size", w: 100, h: 100 }, [rect("r", 0, 0, 5, 5)], [{ id: "o", region: { kind: "rect", x: 50, y: 50, w: 5, h: 5 } }]);
    expect(inputShapeLevel(noOverlap, "rect", rects)).toBe("exact");
    expect(inputShapeLevel(noOverlap, "polygon", rects)).toBe("safe");
  });

  it("makes checkShapes refuse a limited input by default and accept it at the level safe", () => {
    expect(checkShapes(circles, PACK_HARD_RULES)).toEqual([]);
    expect(checkShapes(beside, PACK_HARD_RULES).map((b) => b.detail).join(" ")).toContain("only safe");
    expect(checkShapes(beside, PACK_HARD_RULES, { level: "safe" })).toEqual([]);
    expect(checkShapes({ id: "plain", boxes: [disc("a", 50, 50, 5)] }, PACK_HARD_RULES)).toEqual([]);
  });

  it("refuses a bad limit", () => {
    expect(shapeSupportProblems([{ id: "a", limit: { reads: "other" as never, because: "x", until: "2026-11-28" } }])).toEqual(["a: the limit reads other, not neighbours or container"]);
    expect(shapeSupportProblems([{ id: "b", limit: { reads: "container", because: "x", until: "soon" } }])).toEqual(["b: the limit date soon is not YYYY-MM-DD"]);
  });
});

describe("the rule version of a record", () => {
  it("reads version 1 from a record without the field", () => {
    expect(hardRuleOf({})).toBe(1);
    expect(hardRuleOf({ hardRule: HARD_RULE_VERSION })).toBe(3);
  });

  it("refuses a field that is not a number", () => {
    const problems = checkLayoutRecord({ hardRule: "2" });
    expect(problems).toContain("hardRule is not a number");
    expect(checkLayoutRecord({ hardRule: 2 })).not.toContain("hardRule is not a number");
  });
});
