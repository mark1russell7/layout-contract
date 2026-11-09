import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { checkRegistry, defaultNormalize, JOINT_MEASURES, JOINT_SOURCE, MEASURE_REGISTRY, measureEntry, normalizeMeasure, type MeasureEntry } from "./index.ts";

const base: MeasureEntry = { id: "x.a", unit: "0 to 1", direction: "lower", min: 0, max: 1, source: "pkg", noise: "exact", normalize: { kind: "range" } };

describe("MEASURE_REGISTRY", () => {
  it("has one entry for each joint measure, in the order of JOINT_MEASURES, with no faults", () => {
    expect(MEASURE_REGISTRY.map((e) => e.id)).toEqual(JOINT_MEASURES.map((s) => s.id));
    expect(checkRegistry(MEASURE_REGISTRY)).toEqual([]);
    for (const e of MEASURE_REGISTRY) expect(e.source).toBe(JOINT_SOURCE);
  });

  it("keeps each field of the joint spec", () => {
    for (const [i, spec] of JOINT_MEASURES.entries()) expect(MEASURE_REGISTRY[i]).toMatchObject(spec);
  });

  it("gives joint.ms the noise timed, and the other joint measures the noise exact", () => {
    for (const e of MEASURE_REGISTRY) expect(e.noise).toBe(e.id === "joint.ms" ? "timed" : "exact");
  });
});

describe("measureEntry", () => {
  it("adds the defaults: the noise exact, and the rule range only for a finite range", () => {
    const finite = measureEntry({ id: "a.b", unit: "0 to 1", direction: "higher", min: 0, max: 1 }, { source: "s" });
    expect(finite).toMatchObject({ noise: "exact", normalize: { kind: "range" } });
    expect(finite.cost).toBeUndefined();
    const open = measureEntry({ id: "a.c", unit: "count", direction: "lower", min: 0, max: Infinity }, { source: "s", cost: "n" });
    expect(open).toMatchObject({ normalize: { kind: "none" }, cost: "n" });
    expect(defaultNormalize({ min: -1, max: 1 })).toEqual({ kind: "range" });
  });
});

describe("normalizeMeasure", () => {
  it("maps the ends of a range to 0 and 1 by the direction", () => {
    expect(normalizeMeasure(0, base)).toBe(0);
    expect(normalizeMeasure(1, base)).toBe(1);
    const higher = { ...base, direction: "higher" as const, min: -1, max: 1 };
    expect(normalizeMeasure(1, higher)).toBe(0);
    expect(normalizeMeasure(-1, higher)).toBe(1);
    expect(normalizeMeasure(0, higher)).toBe(0.5);
  });

  it("gives the loss 0.5 at min + half for the rule scale, and approaches 1 for a large value", () => {
    const scale: MeasureEntry = { ...base, max: Infinity, normalize: { kind: "scale", half: 2, reason: "r" } };
    expect(normalizeMeasure(0, scale)).toBe(0);
    expect(normalizeMeasure(2, scale)).toBe(0.5);
    expect(normalizeMeasure(Infinity, scale)).toBe(1);
    const higher = { ...scale, direction: "higher" as const };
    expect(normalizeMeasure(2, higher)).toBe(0.5);
    expect(normalizeMeasure(Infinity, higher)).toBe(0);
    expect(normalizeMeasure(0, higher)).toBe(1);
  });

  it("is monotone and in [0, 1] for each rule and direction, on random values", () => {
    const r = mulberry32(65);
    for (let i = 0; i < 2000; i++) {
      const direction = r() < 0.5 ? ("lower" as const) : ("higher" as const);
      const min = Math.round((r() - 0.5) * 100);
      const finite = r() < 0.5;
      const max = finite ? min + 1 + r() * 100 : Infinity;
      const entry: MeasureEntry = { ...base, direction, min, max, normalize: finite ? { kind: "range" } : { kind: "scale", half: 0.01 + r() * 10, reason: "r" } };
      const span = finite ? max - min : 1000;
      const a = min + r() * span;
      const b = min + r() * span;
      const la = normalizeMeasure(a, entry)!;
      const lb = normalizeMeasure(b, entry)!;
      expect(la).toBeGreaterThanOrEqual(0);
      expect(la).toBeLessThanOrEqual(1);
      const better = direction === "lower" ? a < b : a > b;
      if (better) expect(la).toBeLessThanOrEqual(lb);
    }
  });

  it("gives undefined for the rule none, and an error for a value outside the range or NaN", () => {
    expect(normalizeMeasure(0.5, { ...base, normalize: { kind: "none" } })).toBeUndefined();
    expect(() => normalizeMeasure(1.5, base)).toThrow(RangeError);
    expect(() => normalizeMeasure(-0.1, base)).toThrow(RangeError);
    expect(() => normalizeMeasure(Number.NaN, base)).toThrow(RangeError);
  });

  it("gives a loss for each joint value in the range of its rule range or scale", () => {
    for (const e of MEASURE_REGISTRY) {
      const v = Number.isFinite(e.max) ? (e.min + e.max) / 2 : e.min + 1;
      const loss = normalizeMeasure(v, e);
      if (e.normalize.kind === "none") expect(loss).toBeUndefined();
      else expect(loss).toBeGreaterThan(0);
    }
  });
});

describe("checkRegistry", () => {
  it("names each fault", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ id: "" }, "the id is empty"],
      [{ unit: "" }, "the unit is empty"],
      [{ direction: "up" }, "the direction is not lower or higher"],
      [{ min: -Infinity }, "min is not a finite number"],
      [{ max: 0 }, "max is not above min"],
      [{ floor: 2 }, "the floor is not in the range"],
      [{ source: "" }, "the source is empty"],
      [{ noise: "loud" }, "the noise is not one of exact, sampled, timed"],
      [{ cost: "n^4" }, "is not an order of growth"],
      [{ cost: "n +" }, "is not an order of growth"],
      [{ normalize: { kind: "log" } }, "the normalization is not range, scale or none"],
      [{ max: Infinity }, "the normalization range needs a finite max"],
      [{ normalize: { kind: "scale", half: 0, reason: "r" } }, "the half of the normalization scale is not above 0"],
      [{ normalize: { kind: "scale", half: 1, reason: "" } }, "the normalization scale has no reason"],
    ];
    for (const [patch, text] of cases) {
      const faults = checkRegistry([{ ...base, ...patch } as MeasureEntry]);
      expect(faults.some((f) => f.includes(text)), `${JSON.stringify(patch)}: ${faults.join(" | ")}`).toBe(true);
    }
    expect(checkRegistry([base, base])).toEqual(['measure "x.a": the id is not unique']);
  });

  it("accepts each cost form of the docs", () => {
    for (const cost of ["1", "n", "n + p", "n + e^2", "e log e", "n + p + e log e", "n^3", "p^2 log p"]) expect(checkRegistry([{ ...base, cost }])).toEqual([]);
  });
});
