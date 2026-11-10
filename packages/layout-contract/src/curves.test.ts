import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applySymmetry,
  CURVE_MAX_SIDE,
  CURVE_SYMMETRIES,
  curveCell,
  curveCells,
  curveIndex,
  type CurveSpec,
  HILBERT_CURVE,
  hilbertCell,
  hilbertIndex,
  inverseSymmetry,
  MOORE_CURVE,
  mooreCell,
  mooreIndex,
  MORTON_CURVE,
  mortonCell,
  mortonIndex,
} from "./index.ts";

const CURVES: readonly CurveSpec[] = [HILBERT_CURVE, MOORE_CURVE, MORTON_CURVE];

/** A side from 1 to 2 to the power 12, with an index and a cell of its grid. */
const sideIndexCell = fc
  .integer({ min: 0, max: 12 })
  .chain((levels) => {
    const side = 2 ** levels;
    return fc.record({ side: fc.constant(side), index: fc.integer({ min: 0, max: side * side - 1 }), x: fc.integer({ min: 0, max: side - 1 }), y: fc.integer({ min: 0, max: side - 1 }) });
  });

/** The `d2xy` of the Hilbert curve as the reference of Wikipedia ("Hilbert curve", the C code) gives it. */
function referenceHilbert(n: number, d: number): [number, number] {
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & Math.floor(t / 2);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

/** The Morton index as the interleave of the bits: the bits of `x` at the even places and the bits of `y` at the odd places. */
function referenceMorton(x: number, y: number): number {
  let index = 0;
  for (let bit = 0; bit < 16; bit += 1) index += (((x >> bit) & 1) << (2 * bit)) + (((y >> bit) & 1) << (2 * bit + 1));
  return index;
}

/** This function tells that two cells share a side. */
function neighbours([ax, ay]: readonly number[], [bx, by]: readonly number[]): boolean {
  return Math.abs(ax! - bx!) + Math.abs(ay! - by!) === 1;
}

describe("curves", () => {
  it("gives the index of a cell back from the cell of an index, and the cell back from its index, for each curve", () => {
    for (const curve of CURVES) {
      fc.assert(
        fc.property(sideIndexCell, ({ side, index, x, y }) => {
          const [cx, cy] = curveCell(curve, index, side);
          expect(curveIndex(curve, cx, cy, side)).toBe(index);
          expect(curveCell(curve, curveIndex(curve, x, y, side), side)).toEqual([x, y]);
        }),
      );
    }
  });

  it("gives each cell of a grid one time", () => {
    for (const curve of CURVES) {
      for (const side of [1, 2, 4, 8, 32]) {
        const keys = new Set(curveCells(curve, side).map(([x, y]) => x * side + y));
        expect(keys.size, curve.name).toBe(side * side);
      }
    }
  });

  it("puts two cells in a row of the Hilbert and Moore curves side by side, and closes the Moore curve", () => {
    for (const curve of [HILBERT_CURVE, MOORE_CURVE]) {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 12 }).chain((levels) => fc.tuple(fc.constant(2 ** levels), fc.integer({ min: 0, max: 4 ** levels - 2 }))),
          ([side, index]) => {
            expect(neighbours(curveCell(curve, index, side), curveCell(curve, index + 1, side))).toBe(true);
          },
        ),
      );
    }
    for (const side of [2, 4, 8, 16, 64, 1024]) {
      expect(neighbours(mooreCell(0, side), mooreCell(side * side - 1, side)), `side ${side}`).toBe(true);
      // The Hilbert curve goes from the corner (0, 0) to the corner (side - 1, 0).
      expect([hilbertCell(0, side), hilbertCell(side * side - 1, side)]).toEqual([[0, 0], [side - 1, 0]]);
    }
  });

  it("gives the published values of the Hilbert curve and the Morton curve", () => {
    for (const side of [2, 4, 8, 16]) {
      for (let index = 0; index < side * side; index += 1) expect(hilbertCell(index, side)).toEqual(referenceHilbert(side, index));
    }
    expect(curveCells(HILBERT_CURVE, 4)).toEqual([
      [0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [1, 2],
      [2, 2], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1], [2, 0], [3, 0],
    ]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1023 }), fc.integer({ min: 0, max: 1023 }), (x, y) => {
        expect(mortonIndex(x, y, 1024)).toBe(referenceMorton(x, y));
      }),
    );
    expect(curveCells(MORTON_CURVE, 2)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });

  it("gives the Moore loop of side 4", () => {
    expect(curveCells(MOORE_CURVE, 4)).toEqual([
      [1, 0], [0, 0], [0, 1], [1, 1], [1, 2], [0, 2], [0, 3], [1, 3],
      [2, 3], [3, 3], [3, 2], [2, 2], [2, 1], [3, 1], [3, 0], [2, 0],
    ]);
    expect(mooreIndex(2, 0, 4)).toBe(15);
  });

  it("keeps each symmetry in its square, and undoes each symmetry with its inverse", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CURVE_SYMMETRIES), fc.integer({ min: 0, max: 63 }), fc.integer({ min: 0, max: 63 }), (symmetry, s, t) => {
        const [p, q] = applySymmetry(symmetry, s, t, 63);
        expect(p >= 0 && p <= 63 && q >= 0 && q <= 63).toBe(true);
        expect(applySymmetry(inverseSymmetry(symmetry), p, q, 63)).toEqual([s, t]);
      }),
    );
    expect(new Set(CURVE_SYMMETRIES.map((symmetry) => applySymmetry(symmetry, 0.25, 0.125).join()))).toHaveProperty("size", 8);
  });

  it("refuses a side that is not a power of 2, and a cell or an index outside the grid", () => {
    for (const side of [0, 3, 6, -2, 1.5, Number.NaN, CURVE_MAX_SIDE * 2]) {
      expect(() => hilbertCell(0, side), String(side)).toThrow(RangeError);
      expect(() => hilbertIndex(0, 0, side), String(side)).toThrow(RangeError);
      expect(() => curveCells(MORTON_CURVE, side), String(side)).toThrow(RangeError);
    }
    expect(() => hilbertCell(16, 4)).toThrow(RangeError);
    expect(() => hilbertCell(-1, 4)).toThrow(RangeError);
    expect(() => hilbertCell(0.5, 4)).toThrow(RangeError);
    expect(() => mortonCell(4, 2)).toThrow(RangeError);
    expect(() => hilbertIndex(4, 0, 4)).toThrow(RangeError);
    expect(() => mooreIndex(0, -1, 4)).toThrow(RangeError);
    expect(hilbertCell(0, 1)).toEqual([0, 0]);
    expect(hilbertIndex(CURVE_MAX_SIDE - 1, 0, CURVE_MAX_SIDE)).toBe(CURVE_MAX_SIDE * CURVE_MAX_SIDE - 1);
  });
});
