import { describe, expect, it } from "vitest";
import { compareMeasure, JOINT_MEASURES, minEffectOf, RECORD_EPS, RECORD_SCALE, type MeasureSpec, type Verdict } from "./index.ts";

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

const swap: Record<Verdict, Verdict> = { better: "worse", worse: "better", tie: "tie" };
const lower: Pick<MeasureSpec, "direction" | "minEffect"> = { direction: "lower", minEffect: 0.01 };
const higher: Pick<MeasureSpec, "direction" | "minEffect"> = { direction: "higher", minEffect: 0.01 };
const relative: Pick<MeasureSpec, "direction" | "minEffect"> = { direction: "lower", minEffect: { rel: 0.1 } };

describe("compareMeasure", () => {
  it("is symmetric on random values, for both directions and many sizes of minEffect", () => {
    const r = rng(7);
    for (let i = 0; i < 5000; i++) {
      const direction = r() < 0.5 ? ("lower" as const) : ("higher" as const);
      const spec: Pick<MeasureSpec, "direction" | "minEffect"> = { direction, minEffect: r() < 0.3 ? { rel: r() * 0.2 } : r() < 0.2 ? 0 : r() * 0.1 };
      const a = (r() - 0.5) * 10 ** Math.floor(r() * 6);
      const b = r() < 0.3 ? a + (r() - 0.5) * 2 * minEffectOf(spec, a, a) * 1.5 : (r() - 0.5) * 100;
      expect(compareMeasure(b, a, spec)).toBe(swap[compareMeasure(a, b, spec)]);
    }
  });

  it("gives a tie for each change of at most the threshold, and better or worse just above it", () => {
    const r = rng(11);
    for (let i = 0; i < 2000; i++) {
      const base = Math.round(r() * 1000) / 8;
      const t = minEffectOf(lower);
      const inside = base + (r() * 2 - 1) * t * 0.999;
      expect(compareMeasure(inside, base, lower)).toBe("tie");
      expect(compareMeasure(base - t - RECORD_EPS, base, lower)).toBe("better");
      expect(compareMeasure(base + t + RECORD_EPS, base, lower)).toBe("worse");
      expect(compareMeasure(base + t + RECORD_EPS, base, higher)).toBe("better");
    }
  });

  it("scales a relative minEffect with the larger value, the same after a swap", () => {
    expect(compareMeasure(100, 112, relative)).toBe("better");
    expect(compareMeasure(112, 100, relative)).toBe("worse");
    expect(compareMeasure(100, 111, relative)).toBe("tie");
    expect(compareMeasure(100, 110, relative)).toBe("tie");
    expect(compareMeasure(110, 100, relative)).toBe("tie");
    expect(minEffectOf(relative, 0, 0)).toBe(RECORD_EPS);
  });

  it("uses RECORD_EPS when minEffect is smaller or missing, so a count of 1 counts", () => {
    expect(minEffectOf({})).toBe(RECORD_EPS);
    expect(minEffectOf({ minEffect: 0 })).toBe(RECORD_EPS);
    expect(compareMeasure(1, 0, { direction: "lower", minEffect: 0 })).toBe("worse");
    expect(compareMeasure(0.0005, 0, { direction: "lower" })).toBe("tie");
  });

  it("gives a tie at exactly minEffect on 3-decimal records, with no float noise", () => {
    const fill: Pick<MeasureSpec, "direction" | "minEffect"> = { direction: "higher", minEffect: 0.005 };
    expect(0.723 - 0.718).toBeGreaterThan(0.005);
    expect(compareMeasure(0.723, 0.718, fill)).toBe("tie");
    expect(compareMeasure(0.718, 0.723, fill)).toBe("tie");
    expect(compareMeasure(0.724, 0.718, fill)).toBe("better");
    expect(compareMeasure(0.7, 0.693, { direction: "lower", minEffect: 0.007 })).toBe("tie");
    expect(compareMeasure(5.05, 5, { direction: "lower", minEffect: { rel: 0.01 } })).toBe("tie");
  });

  it("gives the verdict of the rounded record for a live value", () => {
    const r = rng(23);
    const round3 = (x: number): number => Math.round(x * RECORD_SCALE) / RECORD_SCALE;
    for (let i = 0; i < 20000; i++) {
      const spec: Pick<MeasureSpec, "direction" | "minEffect"> = {
        direction: r() < 0.5 ? "lower" : "higher",
        minEffect: r() < 0.3 ? { rel: Math.round(r() * 20) / 100 } : Math.round(r() * 20) / 1000,
      };
      const half = r() < 0.3;
      const a = half ? (Math.round((r() - 0.5) * 20000) + 0.5) / 1000 : (r() - 0.5) * 10 ** Math.floor(r() * 4);
      const b = half ? (Math.round((r() - 0.5) * 20000) + 0.5) / 1000 : a + (r() - 0.5) * 0.06;
      expect(compareMeasure(a, b, spec)).toBe(compareMeasure(round3(a), round3(b), spec));
    }
  });

  it("gives back the grid step of a value from its rounded record, also at half steps and below 0", () => {
    expect(RECORD_EPS).toBe(1e-3);
    const r = rng(29);
    for (let i = 0; i < 20000; i++) {
      const k = Math.round((r() - 0.5) * 2e7);
      const v = i % 3 === 0 ? (k + 0.5) / RECORD_SCALE : i % 3 === 1 ? k / RECORD_SCALE : (r() - 0.5) * 10 ** Math.floor(r() * 7);
      const step = Math.round(v * RECORD_SCALE);
      expect(Math.round((step / RECORD_SCALE) * RECORD_SCALE)).toBe(step);
    }
  });

  it("gives a tie for equal infinite values, and an error for NaN", () => {
    expect(compareMeasure(Infinity, Infinity, lower)).toBe("tie");
    expect(compareMeasure(Infinity, 1, lower)).toBe("worse");
    expect(() => compareMeasure(Number.NaN, 1, lower)).toThrow(RangeError);
  });

  it("has a minEffect on each joint guard", () => {
    for (const m of JOINT_MEASURES) {
      if (m.role === "guard" || m.role === "change-guard") expect(m.minEffect).toBeTypeOf("number");
    }
  });
});
