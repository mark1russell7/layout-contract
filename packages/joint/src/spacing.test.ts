import { marginSides, type LayoutBox, type LayoutInput } from "@mark1russell7/layout-contract";
import { checkHard, packWith } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { packedInput, packInputOf, PACK_ENTRIES } from "./runner.ts";
import { ROUTE_CLEARANCE, SPACINGS, SPACING_STEP_VERSION, SPACING_VALUES, spacingStep } from "./spacing.ts";

const base: LayoutInput = {
  schema: "layout-input/1",
  id: "test/base/s1",
  seed: 1,
  hash: "0000000000000000",
  container: { fixed: "none" },
  boxes: [
    { id: "a", w: 20, h: 10, margin: 3 },
    { id: "b", w: 10, h: 10 },
  ],
  steps: [{ name: "edges", version: 1, params: {}, seed: 1 }],
};

describe("spacingStep", () => {
  it("sets the margins and the gap of each value, and appends its stamp", () => {
    for (const spacing of SPACINGS) {
      const out = spacingStep(base, { spacing });
      const v = SPACING_VALUES[spacing];
      expect(out.gap).toBe(v.gap);
      for (const b of out.boxes) expect(b.margin).toBe(v.margin === 0 ? undefined : v.margin);
      expect(out.hash).toBeUndefined();
      expect(out.steps).toEqual([...base.steps!, { name: "spacing", version: SPACING_STEP_VERSION, params: { spacing, ...v }, seed: 1 }]);
    }
    expect(base.boxes[0]!.margin).toBe(3);
  });

  it("gives margin + gap equal to the clearance outside the stress cell", () => {
    expect(SPACING_VALUES.stress).toEqual({ margin: 0, gap: 0 });
    for (const s of SPACINGS.filter((x) => x !== "stress")) expect(SPACING_VALUES[s].margin + SPACING_VALUES[s].gap).toBe(ROUTE_CLEARANCE);
  });

  it("refuses an unknown value", () => {
    expect(() => spacingStep(base, { spacing: "wide" as never })).toThrow(RangeError);
  });
});

/** This function gives the space between two rectangles: the largest of the x space and the y space. A negative value is an overlap. */
function space(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
}

/** This function gives the least space that two boxes need: the margins of their facing sides and the gap. The test uses the smallest side. */
function need(a: LayoutBox, b: LayoutBox, gap: number): number {
  const ma = marginSides(a.margin);
  const mb = marginSides(b.margin);
  return Math.min(ma.top, ma.right, ma.bottom, ma.left) + Math.min(mb.top, mb.right, mb.bottom, mb.left) + gap;
}

describe("the pack entries and the spacing", () => {
  const { manifest, inputs } = jointCorpus(SET_V2);
  // Seed 1 of the inputs of rect-grid with count 10 and of dashboard, one or more for each value of spacing.
  const sample = inputs
    .map((input, i) => ({ input, entry: manifest.inputs[i]! }))
    .filter(({ entry }) => entry.id.endsWith("/s1") && (entry.cell.count === "10" || entry.id.includes("/dashboard.")) && entry.cell.spacing !== "stress");

  it("has inputs of each value outside the stress cell", () => {
    expect(new Set(sample.map((s) => s.entry.cell.spacing))).toEqual(new Set(["gap", "margin", "both"]));
  });

  it("keeps the margins and the gap between the placed boxes, and half the gap to an obstacle, for each pack entry", () => {
    const bad: string[] = [];
    const overlaps: string[] = [];
    for (const { input } of sample) {
      const gap = input.gap ?? 0;
      for (const entry of PACK_ENTRIES) {
        const output = packWith(entry.strategy, packInputOf(input), entry.options, input.seed ?? 0);
        // An output with a break of no-overlap is a fault of the packer that does not come from the spacing. The benchmark counts it in `hard`.
        if ((checkHard(packInputOf(input), output, undefined, { exactContainer: true })["no-overlap"] ?? 0) > 0) {
          overlaps.push(`${input.id} ${entry.id}`);
          continue;
        }
        const boxes = packedInput(input, output, entry.id).input.boxes as (LayoutBox & { x: number; y: number })[];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const s = space(boxes[i]!, boxes[j]!);
            if (s < need(boxes[i]!, boxes[j]!, gap) - 1e-3) bad.push(`${input.id} ${entry.id}: ${boxes[i]!.id} and ${boxes[j]!.id} are ${s.toFixed(3)} apart`);
          }
          for (const o of input.obstacles ?? []) {
            if (o.region.kind !== "rect") continue;
            const m = marginSides(boxes[i]!.margin);
            const s = space(boxes[i]!, o.region);
            if (s < Math.min(m.top, m.right, m.bottom, m.left) + gap / 2 - 1e-3) bad.push(`${input.id} ${entry.id}: ${boxes[i]!.id} is ${s.toFixed(3)} from ${o.id}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    // `packing` 0.2.6 had a fault: `skyline` put each box at one place in a free circle with identical boxes. Version 0.2.10 corrects it.
    expect(overlaps).toEqual([]);
    // The 4 k16 searches of bench-4 pack each sample 16 times or more. Thus the test takes more than the default 5 s.
  }, 60_000);
});
