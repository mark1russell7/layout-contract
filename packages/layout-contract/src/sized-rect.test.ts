import { describe, expect, it } from "vitest";
import { toRect, toSizedRect, type Rect, type SizedRect } from "./geometry.ts";
import { mulberry32 } from "./random.ts";

/** Special values that a conversion must keep exactly. */
const SPECIAL = [0, -0, 1, -1, 0.1, -2.5, 1e-300, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER];

/** This function gives a random number: a special value, an integer, or a fraction of any sign. */
function value(next: () => number): number {
  const kind = next();
  if (kind < 0.25) return SPECIAL[Math.floor(next() * SPECIAL.length)] ?? 0;
  if (kind < 0.5) return Math.floor(next() * 2001) - 1000;
  return (next() - 0.5) * 10 ** Math.floor(next() * 12 - 4);
}

describe("SizedRect and Rect", () => {
  it("converts one rectangle in the two directions", () => {
    expect(toRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(toSizedRect({ x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it("gives back each rectangle after a round trip, in the two directions (2000 seeded rectangles)", () => {
    const next = mulberry32(0x5eed);
    for (let i = 0; i < 2000; i++) {
      const rect: Rect = { x: value(next), y: value(next), w: value(next), h: value(next) };
      const sized: SizedRect = { x: value(next), y: value(next), width: value(next), height: value(next) };
      // Object.is keeps -0 apart from 0, so the test also shows that the conversion keeps the sign of a zero.
      const back = toRect(toSizedRect(rect));
      const again = toSizedRect(toRect(sized));
      for (const key of ["x", "y", "w", "h"] as const) expect(Object.is(back[key], rect[key])).toBe(true);
      for (const key of ["x", "y", "width", "height"] as const) expect(Object.is(again[key], sized[key])).toBe(true);
      expect(Object.keys(back).toSorted()).toEqual(["h", "w", "x", "y"]);
      expect(Object.keys(again).toSorted()).toEqual(["height", "width", "x", "y"]);
    }
  });

  it("does not change its argument", () => {
    const rect = Object.freeze({ x: 5, y: 6, w: 7, h: 8 });
    expect(toRect(toSizedRect(rect))).not.toBe(rect);
    expect(rect).toEqual({ x: 5, y: 6, w: 7, h: 8 });
  });
});
