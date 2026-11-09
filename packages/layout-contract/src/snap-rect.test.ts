import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Rect, snapRect } from "./geometry.ts";

/** A coordinate and a size with a fraction, in the range of a screen and more. */
const coordinate = fc.double({ min: -1e4, max: 1e4, noNaN: true });
const size = fc.double({ min: 0, max: 1e4, noNaN: true });

describe("snapRect", () => {
  it("rounds each edge, not the size", () => {
    expect(snapRect({ x: 8.4, y: 44.6, w: 600.4, h: 700 })).toEqual({ x: 8, y: 45, w: 601, h: 700 });
    // The size 0.4 rounds to 0, but the edges 0.3 and 0.7 round to 0 and 1
    expect(snapRect({ x: 0.3, y: 0, w: 0.4, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("keeps a rectangle on whole pixels as it is, and gives 0, not -0", () => {
    expect(snapRect({ x: -3, y: 7, w: 12, h: 0 })).toEqual({ x: -3, y: 7, w: 12, h: 0 });
    const tiny = snapRect({ x: -0.2, y: -5e-324, w: 0.1, h: 0 });
    expect([tiny.x, tiny.y, tiny.w, tiny.h].map((value) => Object.is(value, -0))).toEqual([false, false, false, false]);
  });

  it("keeps two rectangles that touch in touch, and moves no edge by more than half a pixel", () => {
    fc.assert(
      fc.property(coordinate, coordinate, size, size, size, (x, y, w, h, next) => {
        const left: Rect = { x, y, w, h };
        const right: Rect = { x: x + w, y, w: next, h };
        const a = snapRect(left);
        const b = snapRect(right);
        expect(a.x + a.w).toBe(b.x);
        expect([a.y, a.h]).toEqual([b.y, b.h]);
        expect(a.w).toBeGreaterThanOrEqual(0);
        for (const [edge, exact] of [[a.x, x], [a.y, y], [a.x + a.w, x + w], [a.y + a.h, y + h]] as const) {
          expect(Number.isInteger(edge)).toBe(true);
          expect(Math.abs(edge - exact)).toBeLessThanOrEqual(0.5);
        }
        expect(snapRect(a)).toEqual(a);
      }),
      { seed: 0x5a5a, numRuns: 2000 },
    );
  });
});
