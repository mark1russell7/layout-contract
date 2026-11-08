import { describe, expect, it } from "vitest";
import { exactStripRefusal, packWith } from "@mark1russell7/packing";
import { CIRCLE_CONTAINERS, CIRCLE_SPACINGS, jointInput, jointSpecs, SEEDS, SET, SET_V2, SET_V3, shapeSpecs, STRIP_COUNTS, STRIP_CUTS } from "./corpus.ts";
import { jointRegistry } from "./families.ts";
import { packInputOf } from "./runner.ts";

// The array shapes of joint-v3 (L94): the inputs of the strategies of COVER_EXCEPTIONS of cover.ts.
const registry = jointRegistry(SET_V3);
const inputs = shapeSpecs().flatMap((spec) => spec.seeds.map((seed) => ({ spec, ...jointInput(spec, seed, SET_V3, registry) })));
const circles = inputs.filter((i) => i.spec.generator === "circle-scattered");
const strips = inputs.filter((i) => i.spec.generator === "perfect-cut");

describe("the array shapes of joint-v3", () => {
  it("is in joint-v3 only, after the fixed cases", () => {
    expect(jointSpecs(SET).some((s) => s.array === "shapes")).toBe(false);
    expect(jointSpecs(SET_V2).some((s) => s.array === "shapes")).toBe(false);
    const v3 = jointSpecs(SET_V3);
    expect(v3.slice(-shapeSpecs().length)).toEqual(shapeSpecs());
  });

  it("gives 12 circle inputs and 12 strip inputs, each with its own id", () => {
    expect(circles).toHaveLength(CIRCLE_CONTAINERS.length * CIRCLE_SPACINGS.length * SEEDS.length);
    expect(strips).toHaveLength(STRIP_CUTS.length * STRIP_COUNTS.length * SEEDS.length);
    expect([circles.length, strips.length]).toEqual([12, 12]);
    expect(new Set(inputs.map((i) => i.input.id)).size).toBe(inputs.length);
    for (const c of CIRCLE_CONTAINERS) expect(circles.filter((i) => i.input.family!.startsWith(`circle-scattered.${c}.n40.`))).toHaveLength(6);
  });

  it("gives circle items in a cell with the item shape circle, and the spacing of the spec", () => {
    for (const { input, entry, spec } of circles) {
      expect(input.boxes.every((b) => b.shape?.kind === "circle"), input.id).toBe(true);
      expect(entry.cell).toMatchObject({ itemShape: "circle", containerSize: "fixed", containerShape: spec.params["containerShape"], obstacles: "none", spacing: spec.steps[1]!.params.spacing });
      expect(input.edges?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("gives an input that each strategy of the cover exceptions packs with no refusal", () => {
    for (const { input } of circles) {
      const name = input.container!.shape?.kind === "circle" ? "circle-quasi-physical" : "hole-degree";
      const out = packWith(name, packInputOf(input));
      expect(out.placements, `${name} ${input.id}`).toHaveLength(input.boxes.length);
    }
    for (const { input, entry } of strips) {
      expect(entry.stress).toBe(true);
      expect(exactStripRefusal(packInputOf(input)), input.id).toBeNull();
      expect(packWith("exact-strip", packInputOf(input)).placements).toHaveLength(input.boxes.length);
    }
  }, 60_000);
});
