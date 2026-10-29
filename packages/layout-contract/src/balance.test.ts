import { describe, expect, it } from "vitest";
import { BALANCE_MEASURE_SUFFIXES, balanceMeasures, balanceMeasureSpecs, balanceOf, nearestGaps, perChange, procrustesOf, type PlacedBox, type Rect } from "./index.ts";

/** A small seeded generator, so each run tests the same values. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const distance = (a: Rect, b: Rect): number =>
  Math.hypot(Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)));

const container: Rect = { x: 0, y: 0, w: 100, h: 100 };
const grid = (n: number, size: number, step: number, x0 = 0, y0 = 0): PlacedBox[] =>
  Array.from({ length: n * n }, (_, i) => ({ id: `b${i}`, x: x0 + (i % n) * step, y: y0 + Math.floor(i / n) * step, w: size, h: size }));

describe("nearestGaps", () => {
  it("gives the gaps of a scan of all pairs, on random boxes of many widths", () => {
    const r = rng(3);
    for (let t = 0; t < 200; t++) {
      const boxes = Array.from({ length: 2 + Math.floor(r() * 30) }, () => ({ x: r() * 200, y: r() * 200, w: 1 + r() * 40, h: 1 + r() * 40 }));
      const brute = boxes.map((a, i) => Math.min(...boxes.filter((_, j) => j !== i).map((b) => distance(a, b))));
      expect(nearestGaps(boxes)).toEqual(brute);
    }
  });

  it("finds a nearest box that is only to the left", () => {
    // The box c has its nearest box a to the left. b touches a, so a and b stop their scans early.
    const boxes = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 0, y: 10, w: 1, h: 1 },
      { x: 100, y: 0, w: 10, h: 10 },
    ];
    expect(nearestGaps(boxes)).toEqual([0, 0, 90]);
  });
});

describe("balanceOf", () => {
  it("gives 0 for an even grid in the center", () => {
    const b = balanceOf(grid(4, 10, 25, 7.5, 7.5), container);
    expect(b.gapCv).toBe(0);
    expect(b.centroidOffset).toBeCloseTo(0, 12);
    expect(b.sideRange).toBeCloseTo(0, 12);
  });

  it("shows the skew of a pack in the bottom-left corner", () => {
    const center = balanceOf(grid(4, 10, 12, 26, 26), container);
    const corner = balanceOf(grid(4, 10, 12, 0, 52), container);
    expect(corner.gapCv).toBe(center.gapCv);
    expect(corner.centroidOffset).toBeGreaterThan(center.centroidOffset + 0.05);
    expect(corner.side.top).toBe(1);
    expect(corner.side.right).toBe(1);
    expect(corner.side.left).toBeLessThan(1);
    expect(corner.side.bottom).toBeLessThan(1);
    expect(corner.sideRange).toBeGreaterThan(0.25);
  });

  it("gives values in the ranges of the specs", () => {
    const r = rng(11);
    const specs = new Map(balanceMeasureSpecs("pack").map((s) => [s.id, s]));
    for (let t = 0; t < 100; t++) {
      const boxes = Array.from({ length: Math.floor(r() * 12) }, () => ({ x: r() * 90, y: r() * 90, w: 1 + r() * 30, h: 1 + r() * 30 }));
      for (const [id, v] of Object.entries(balanceMeasures("pack", balanceOf(boxes, container)))) {
        const spec = specs.get(id as never)!;
        expect(v).toBeGreaterThanOrEqual(spec.min);
        expect(v).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  it("gives 0 with no box and with one box", () => {
    expect(balanceOf([], container)).toEqual({ gapCv: 0, centroidOffset: 0, side: { top: 1, right: 1, bottom: 1, left: 1 }, sideRange: 0 });
    expect(balanceOf([{ x: 45, y: 45, w: 10, h: 10 }], container).gapCv).toBe(0);
  });
});

describe("procrustesOf", () => {
  const base = grid(3, 10, 20);

  it("gives 0 after a move and a rotation, and the move without the rotation", () => {
    const turn = (p: PlacedBox): PlacedBox => ({ ...p, x: -(p.y + p.h / 2) - p.w / 2 + 500, y: p.x + p.w / 2 - p.h / 2 + 300 });
    const turned = base.map(turn);
    expect(procrustesOf(base, turned, { unit: 100 })).toBeCloseTo(0, 9);
    expect(procrustesOf(base, turned, { unit: 100, rotate: false })).toBeGreaterThan(0.1);
  });

  it("gives the RMS move of the centers in units, over the shared ids", () => {
    // One box of 9 moves by 9 units. After the best move of all, the RMS is sqrt(8 * 1^2 + 8^2) / 3 over x.
    const next = base.map((p, i) => (i === 0 ? { ...p, x: p.x + 9 } : p));
    expect(procrustesOf(base, next, { unit: 1, rotate: false })).toBeCloseTo(Math.sqrt(8 + 64) / 3, 9);
    expect(procrustesOf(base, [...next, { id: "new", x: 999, y: 999, w: 1, h: 1 }], { unit: 1, rotate: false })).toBeCloseTo(Math.sqrt(8 + 64) / 3, 9);
    expect(procrustesOf(base, base.slice(0, 1), { unit: 1 })).toBe(0);
  });

  it("refuses a bad unit", () => {
    expect(() => procrustesOf(base, base, { unit: 0 })).toThrow(RangeError);
  });
});

describe("perChange and the specs", () => {
  it("divides by the change share, with at least 1 box", () => {
    expect(perChange(0.1, 1, 10)).toBeCloseTo(1, 12);
    expect(perChange(0.1, 0, 10)).toBeCloseTo(1, 12);
    expect(perChange(0.1, 5, 10)).toBeCloseTo(0.2, 12);
    expect(() => perChange(0.1, 1, 0)).toThrow(RangeError);
  });

  it("has one spec for each suffix, with the prefix of the stage", () => {
    expect(balanceMeasureSpecs("joint").map((s) => s.id)).toEqual(BALANCE_MEASURE_SUFFIXES.map((s) => `joint.${s}`));
  });
});
