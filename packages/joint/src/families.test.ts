import { readFileSync } from "node:fs";
import { DEFAULT_RNG, edgeStep, type LayoutInput } from "@mark1russell7/layout-contract";
import { generator } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { edgeFamily, hashOf, jointSpecs, SETS, type JointSet, type JointSpec } from "./corpus.ts";
import { JOINT_BASES, jointRegistry, packingFamily } from "./families.ts";
import { spacingStep } from "./spacing.ts";

/** The path of the corpus before L45: the generator of packing, `edgeStep`, `spacingStep`, then the id, the family and the hash. */
function oldInput(set: JointSet, spec: JointSpec, seed: number): LayoutInput {
  const gen = generator(spec.generator);
  const edges = spec.steps[0].params;
  const spacing = spec.steps[1]?.params.spacing;
  const base = gen.generate(seed, spec.params, set);
  const family = `${base.family}.${edgeFamily(edges)}${spacing === undefined ? "" : `.sp-${spacing}`}`;
  const withEdges = edgeStep(base, edges, seed);
  const stepped: LayoutInput = { ...(spacing === undefined ? withEdges : spacingStep(withEdges, { spacing }, seed)), id: `${set}/${family}/s${seed}`, family };
  return { ...stepped, hash: hashOf(stepped) };
}

describe("the joint families on the shared registry", () => {
  it("give the same input files as the path before L45 on a sample of the specs and seeds of each corpus", () => {
    for (const set of SETS) {
      const registry = jointRegistry(set);
      const specs = jointSpecs(set);
      const sample = specs.filter((_, i) => i % 6 === 0 || i >= specs.length - 3);
      expect(sample.length).toBeGreaterThan(15);
      for (const spec of sample) {
        for (const seed of spec.seeds) {
          const dims = { ...spec.params, ...spec.steps[0].params, ...(spec.steps[1] === undefined ? {} : { spacing: spec.steps[1].params.spacing }) };
          const out = registry.generate(spec.generator, seed, dims, { set });
          const old = oldInput(set, spec, seed);
          expect(out.hash, out.id).toBe(old.hash);
          expect(out).toEqual(old);
        }
      }
    }
  });

  it("count the specs, the inputs and the full sweep of each family with no generated input", () => {
    const counts = Object.fromEntries(SETS.map((set) => [set, jointSpecs(set).reduce((n, s) => n + s.seeds.length, 0)]));
    expect(counts).toEqual({ "joint-v1": 285, "joint-v2": 303 });
    const full = Object.fromEntries(JOINT_BASES.map((name) => [name, jointRegistry("joint-v2").cellCount(name)]));
    // rect-grid: 5 x 6 x 7 x 6 x 5 counts x 3 x 7 x 3 x 3 x 4 spacings, with hubBy 2 only for hubs and tree: 9 / 7 of the edge shapes.
    expect(full["rect-grid"]).toBe(5 * 6 * 7 * 6 * 5 * 3 * 9 * 3 * 3 * 4);
    expect(full["gallery"]).toBe(5 * 5 * 3 * 9 * 3 * 3 * 4);
    expect(full["edge-cases"]).toBe(5 * 5 * 3 * 9 * 3 * 3 * 4);
  });

  it("declare the owner, the cross-engine note and the default stream of each family", () => {
    const registry = jointRegistry("joint-v2");
    for (const f of registry.families()) {
      expect(f.owner).toBe("joint");
      expect(f.crossEngine).toBe("libm-dependent");
      const r = registry.rngOf(f.name)(1);
      const d = DEFAULT_RNG(1);
      expect([r(), r(), r()]).toEqual([d(), d(), d()]);
    }
    expect(packingFamily(generator("gallery")).crossEngine).toBe("exact");
    expect(packingFamily(generator("rect-grid")).crossEngine).toBe("libm-dependent");
  });

  it("use no API of Node in families.ts, spacing.ts and pairwise.ts", () => {
    for (const file of ["./families.ts", "./spacing.ts", "./pairwise.ts"]) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(/from\s+"node:/.test(text), file).toBe(false);
      expect(/\bprocess\.|\bBuffer\./.test(text), file).toBe(false);
    }
  });
});
