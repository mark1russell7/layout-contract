import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scaleRect, snapRect } from "./geometry.ts";

/** A coordinate and a size with a fraction, in the range of a screen and more. */
const coordinate = fc.double({ min: -1e4, max: 1e4, noNaN: true });
const size = fc.double({ min: 0, max: 1e4, noNaN: true });
/** A zoom factor of a page, from 25% to 500%. */
const factor = fc.double({ min: 0.25, max: 5, noNaN: true });

describe("scaleRect", () => {
  it("multiplies each coordinate and each size by the factor", () => {
    expect(scaleRect({ x: 10, y: -4, w: 200, h: 50 }, 1.5)).toEqual({ x: 15, y: -6, w: 300, h: 75 });
    expect(scaleRect({ x: 10, y: 4, w: 200, h: 50 }, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("refuses a factor that is negative or not finite", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scaleRect({ x: 0, y: 0, w: 1, h: 1 }, bad)).toThrow(RangeError);
    }
  });

  it("keeps a rectangle at the factor 1, and the inverse factor gives the rectangle back", () => {
    fc.assert(
      fc.property(coordinate, coordinate, size, size, factor, (x, y, w, h, f) => {
        const rect = { x, y, w, h };
        expect(scaleRect(rect, 1)).toEqual(rect);
        const back = scaleRect(scaleRect(rect, f), 1 / f);
        for (const key of ["x", "y", "w", "h"] as const) expect(back[key]).toBeCloseTo(rect[key], 6);
        expect(scaleRect(rect, f).w).toBeGreaterThanOrEqual(0);
      }),
      { seed: 0x5ca1e, numRuns: 2000 },
    );
  });

  it("gives whole pixels with snapRect after it, with each edge at most half a pixel from the exact edge", () => {
    fc.assert(
      fc.property(coordinate, coordinate, size, size, factor, (x, y, w, h, f) => {
        const snapped = snapRect(scaleRect({ x, y, w, h }, f));
        expect(Math.abs(snapped.x - x * f)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(snapped.x + snapped.w - (x * f + w * f))).toBeLessThanOrEqual(0.5 + 1e-9);
      }),
      { seed: 0x5ca1e, numRuns: 2000 },
    );
  });
});
