import type { LayoutBox, LayoutContainer, LayoutInput } from "@mark1russell7/layout-contract";
import { dependsOnLibm } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { MAX_SIDE_SHARE, NO_OPEN_SIZE, OPEN_SIZE_NAMES, OPEN_SIZES, openSizesStep } from "./open-sizes.ts";

const inputOf = (container: LayoutContainer, count = 400): LayoutInput => ({
  schema: "layout-input/1",
  id: "test",
  seed: 7,
  container,
  boxes: Array.from({ length: count }, (_, i): LayoutBox => ({ id: `b${i}`, w: 40 + (i % 7) * 10, h: 30 + (i % 5) * 10 })),
});
const area = (boxes: readonly LayoutBox[]): number => boxes.reduce((a, b) => a + b.w * b.h, 0);
const FREE: LayoutContainer = { fixed: "none", aspectWeight: 0 };

describe("openSizesStep", () => {
  it.each(OPEN_SIZE_NAMES)("keeps the total area of %s with a free container", (point) => {
    const input = inputOf(FREE);
    const out = openSizesStep(input, { point });
    expect(Math.abs(area(out.boxes) / area(input.boxes) - 1)).toBeLessThan(0.05);
  });

  it.each(OPEN_SIZE_NAMES)("keeps the aspect of each large box of %s", (point) => {
    const input = inputOf(FREE);
    const out = openSizesStep(input, { point });
    out.boxes.forEach((box, i) => {
      if (Math.min(box.w, box.h) < 30) return;
      const before = input.boxes[i]!;
      expect(Math.abs(box.w / box.h - before.w / before.h)).toBeLessThan(0.1);
    });
  });

  it("widens the areas with the sigma of the point", () => {
    const spread = (point: string): number => {
      const areas = openSizesStep(inputOf(FREE), { point }).boxes.map((b) => b.w * b.h);
      return Math.max(...areas) / Math.min(...areas);
    };
    expect(spread("lognormal-wide")).toBeGreaterThan(spread("lognormal-narrow"));
  });

  it("holds each side in the limit of a fixed container, and a side of 1 or more", () => {
    const container: LayoutContainer = { w: 600, h: 500, fixed: "size" };
    for (const point of OPEN_SIZE_NAMES) {
      for (const box of openSizesStep(inputOf(container), { point }).boxes) {
        expect(box.w).toBeLessThanOrEqual(Math.ceil(MAX_SIDE_SHARE * 600));
        expect(box.h).toBeLessThanOrEqual(Math.ceil(MAX_SIDE_SHARE * 500));
        expect(Math.min(box.w, box.h)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("gives the same boxes for the same seed and point, and other boxes for another seed or point", () => {
    const input = inputOf(FREE);
    const a = openSizesStep(input, { point: "pareto-heavy" });
    expect(openSizesStep(input, { point: "pareto-heavy" }).boxes).toEqual(a.boxes);
    expect(openSizesStep(input, { point: "pareto-heavy" }, 8).boxes).not.toEqual(a.boxes);
    expect(openSizesStep(input, { point: "zipf-ranks" }).boxes).not.toEqual(a.boxes);
  });

  it("appends its stamp and removes the hash", () => {
    const out = openSizesStep({ ...inputOf(FREE), hash: "old" }, { point: "beta-bowl" });
    expect(out.steps?.at(-1)).toMatchObject({ name: "open-sizes", version: 1, params: { point: "beta-bowl" }, seed: 7 });
    expect(out.hash).toBeUndefined();
  });

  it("gives the same input for no point, and refuses another name", () => {
    const input = inputOf(FREE);
    expect(openSizesStep(input, { point: NO_OPEN_SIZE })).toBe(input);
    expect(() => openSizesStep(input, { point: "normal" })).toThrow(RangeError);
  });

  it("has only points that use the functions of the platform, so the step says libm-dependent", () => {
    expect(OPEN_SIZE_NAMES.every((name) => dependsOnLibm(OPEN_SIZES[name]!))).toBe(true);
  });
});
