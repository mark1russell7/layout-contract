import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { familyOf } from "./corpus.ts";
import { edgeStep } from "./edges.ts";
import {
  composeFamily,
  CORPUS_DIMENSIONS,
  createFamilyRegistry,
  DEFAULT_FAMILY_BY,
  DEFAULT_RNG,
  dimensionAt,
  dimensionUnit,
  EDGES_STEP,
  levelsOf,
  resolveDimensions,
  sharedDimension,
  type CorpusDimension,
  type CorpusFamily,
  type DimensionValues,
  type GenerateContext,
} from "./families.ts";
import { documentHash } from "./hash.ts";
import type { LayoutInput } from "./input.ts";
import { mulberry32, randomInt, stepRandom } from "./random.ts";

/** The first 8 values of `mulberry32(0)` as whole numbers of 32 bits. `highways` pins the same values. */
const SEED0_U32 = [1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985, 2642484575, 2787370982];

const u32 = (r: () => number, n: number): number[] => Array.from({ length: n }, () => r() * 4294967296);

/** A small family of boxes. It records each call of `generate`. */
function boxFamily(calls: { seed: number; dims: DimensionValues; context: GenerateContext }[] = []): CorpusFamily<LayoutInput> {
  return {
    name: "boxes",
    version: 1,
    owner: "test",
    meaning: "Boxes with random sizes.",
    dimensions: [sharedDimension("count", { default: 12 })],
    seeding: "stepRandom(seed, boxes).",
    crossEngine: "exact",
    generate(seed, dims, context) {
      calls.push({ seed, dims, context });
      const r = stepRandom(seed, "boxes");
      const n = dims["count"] as number;
      const boxes = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, w: randomInt(r, 20, 120), h: randomInt(r, 20, 80) }));
      return Object.freeze({ schema: "layout-input/1", id: `${context.set ?? "t"}/boxes.n${n}/s${seed}`, set: context.set ?? "t", family: `boxes.n${n}`, seed, boxes });
    },
  };
}

/** A family with a layout that decides which other dimensions are active, as the fixtures of `highways`. */
const KIND_DIMS: readonly CorpusDimension[] = [
  { name: "layout", kind: "enum", values: ["uniform", "clustered", "hubs"], default: "uniform", meaning: "The kind.", engines: ["test"] },
  { name: "nodes", kind: "int", min: 2, max: 400, default: 10, levels: [10, 100], meaning: "The nodes.", engines: ["test"] },
  { name: "locality", kind: "real", min: 0, max: 1, default: 0.65, levels: [0.25, 0.65], when: { param: "layout", in: ["clustered"] }, meaning: "The locality.", engines: ["test"] },
  { name: "hubSkew", kind: "real", min: 1, max: 5, default: 3, levels: [2, 3, 4], when: { param: "layout", in: ["hubs"] }, meaning: "The skew.", engines: ["test"] },
];

function kindFamily(seen: DimensionValues[] = []): CorpusFamily<{ readonly params: DimensionValues; readonly draws: number[] }> {
  return {
    name: "graph",
    version: 1,
    owner: "test",
    meaning: "A graph family with a kind.",
    dimensions: KIND_DIMS,
    seeding: "(seed * 2654435761 + nodes) >>> 0",
    crossEngine: "libm-dependent",
    rngSeed: (seed, dims) => (seed * 2654435761 + (dims["nodes"] as number)) >>> 0,
    familyBy: ["layout"],
    generate(_seed, dims, context) {
      seen.push(dims);
      // The family writes only the dimensions away from their defaults into its params.
      const params = Object.fromEntries(KIND_DIMS.filter((d) => dims[d.name] !== d.default).map((d) => [d.name, dims[d.name]!]));
      return { params, draws: u32(context.random, 3) };
    },
  };
}

describe("the default random numbers", () => {
  it("give the pinned stream of mulberry32 for the seed 0", () => {
    expect(u32(DEFAULT_RNG(0), 8)).toEqual(SEED0_U32);
    expect(DEFAULT_RNG).toBe(mulberry32);
  });

  it("give the pinned stream of stepRandom, which the joint families use", () => {
    expect(u32(stepRandom(1, "edges"), 3)).toEqual([3115590279, 1768759722, 654251102]);
    const r = stepRandom(1, "container");
    expect(randomInt(r, 600, 1000)).toBe(970);
  });
});

describe("generate of a registry", () => {
  it("gives the raw seed to the family, with no step through fnv1a32", () => {
    const calls: { seed: number; dims: DimensionValues; context: GenerateContext }[] = [];
    const reg = createFamilyRegistry([boxFamily(calls)]);
    reg.generate("boxes", 123);
    expect(calls[0]!.seed).toBe(123);
    expect(u32(calls[0]!.context.random, 4)).toEqual(u32(mulberry32(123), 4));
    expect(calls[0]!.context.rng).toBe(DEFAULT_RNG);
  });

  it("gives the seed of rngSeed with the full dimensions to the stream, and the own rng of a family", () => {
    const reg = createFamilyRegistry([kindFamily()]);
    const out = reg.generate("graph", 0, { nodes: 100 });
    expect(out.draws).toEqual(u32(mulberry32((0 * 2654435761 + 100) >>> 0), 3));
    expect(u32(reg.rngOf("graph")(5, { nodes: 100 }), 3)).toEqual(u32(mulberry32((5 * 2654435761 + 100) >>> 0), 3));
    const constant: CorpusFamily<number> = { ...boxFamily(), rng: () => () => 0.5, generate: (_s, _d, c) => c.random() };
    expect(createFamilyRegistry([constant]).generate("boxes", 9)).toBe(0.5);
  });

  it("gives an explicit default and a missing value the same dimensions", () => {
    const seen: DimensionValues[] = [];
    const reg = createFamilyRegistry([kindFamily(seen)]);
    const a = reg.generate("graph", 1, {});
    const b = reg.generate("graph", 1, { layout: "uniform", nodes: 10, locality: 0.65, hubSkew: 3 });
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toEqual({ layout: "uniform", nodes: 10, locality: 0.65, hubSkew: 3 });
    expect(a).toEqual(b);
    expect(a.params).toEqual({});
    expect(reg.generate("graph", 1, { nodes: 100 }).params).toEqual({ nodes: 100 });
  });

  it("gives the output of the family with no change and no new hash", () => {
    const fam = boxFamily();
    const direct = fam.generate(4, { count: 12 }, { rng: DEFAULT_RNG, random: DEFAULT_RNG(4) });
    const out = createFamilyRegistry([fam]).generate("boxes", 4);
    expect(out).toEqual(direct);
    expect(Object.isFrozen(out)).toBe(true);
    expect(out.hash).toBeUndefined();
  });

  it("refuses an unknown family, an unknown dimension, a bad value and a bad seed", () => {
    const reg = createFamilyRegistry([boxFamily(), kindFamily() as unknown as CorpusFamily<LayoutInput>]);
    expect(() => reg.generate("nope", 1)).toThrow(RangeError);
    expect(() => reg.generate("boxes", 1, { size: 3 })).toThrow(/no dimension "size"/);
    expect(() => reg.generate("boxes", 1, { count: 1.5 })).toThrow(/not a whole number/);
    expect(() => reg.generate("boxes", 1, { count: 200_000 })).toThrow(/more than the max/);
    expect(() => reg.generate("graph", 1, { layout: "grid" })).toThrow(/is not one of/);
    expect(() => reg.generate("graph", 1, { locality: 2 })).toThrow(RangeError);
    expect(() => reg.generate("boxes", -1)).toThrow(RangeError);
    expect(() => reg.generate("boxes", 1, {}, { version: 2 })).toThrow(/versions 1, not 2/);
  });
});

describe("register", () => {
  it("refuses a second version 1, a bad default, a when without an earlier dimension and a bad familyBy", () => {
    const reg = createFamilyRegistry([boxFamily()]);
    expect(() => reg.register(boxFamily())).toThrow(/in the registry already/);
    reg.register({ ...boxFamily(), version: 2 });
    expect(reg.family("boxes").version).toBe(1);
    expect(reg.family("boxes", 2).version).toBe(2);
    const bad = (dimensions: readonly CorpusDimension[], familyBy?: readonly string[]): CorpusFamily<LayoutInput> => ({ ...boxFamily(), name: "bad", dimensions, ...(familyBy ? { familyBy } : {}) });
    expect(() => createFamilyRegistry([bad([sharedDimension("count", { default: -1 })])])).toThrow(/default of "count"/);
    expect(() => createFamilyRegistry([bad([KIND_DIMS[2]!, KIND_DIMS[0]!])])).toThrow(/not an earlier dimension/);
    expect(() => createFamilyRegistry([bad([KIND_DIMS[0]!, { ...KIND_DIMS[2]!, when: { param: "layout", in: ["grid"] } }])])).toThrow(/does not have/);
    expect(() => createFamilyRegistry([bad([KIND_DIMS[0]!], ["nodes"])])).toThrow(/familyBy dimension "nodes"/);
    expect(() => createFamilyRegistry([bad([{ ...KIND_DIMS[0]!, name: "kind" }])])).toThrow(/reserved/);
  });
});

describe("the dimensions with when", () => {
  it("skip the dead combinations in cells and cellCount", () => {
    const reg = createFamilyRegistry([kindFamily()]);
    const cells = [...reg.cells("graph")];
    // uniform: 2 nodes; clustered: 2 nodes x 2 locality; hubs: 2 nodes x 3 hubSkew.
    expect(cells.length).toBe(2 + 4 + 6);
    expect(reg.cellCount("graph")).toBe(12);
    expect(new Set(cells.map((c) => JSON.stringify(c))).size).toBe(12);
    expect(cells.filter((c) => c["layout"] === "uniform").every((c) => c["locality"] === 0.65 && c["hubSkew"] === 3)).toBe(true);
    expect(reg.cellCount("graph", { sweep: ["layout"] })).toBe(3);
    expect(reg.cellCount("graph", { levels: { nodes: [10, 20, 30] } })).toBe(3 + 6 + 9);
  });

  it("give generate the default of an inactive dimension, also when the caller gives a value", () => {
    const seen: DimensionValues[] = [];
    const reg = createFamilyRegistry([kindFamily(seen)]);
    reg.generate("graph", 1, { layout: "uniform", locality: 0.9 });
    reg.generate("graph", 1, { layout: "clustered", locality: 0.9 });
    expect(seen[0]!["locality"]).toBe(0.65);
    expect(seen[1]!["locality"]).toBe(0.9);
    expect(reg.cellOf("graph", { layout: "uniform", locality: 0.9 })).toEqual({ kind: "graph", layout: "uniform", nodes: 10 });
    expect(reg.cellOf("graph", { layout: "clustered", locality: 0.9 })).toEqual({ kind: "graph", layout: "clustered", nodes: 10, locality: 0.9 });
  });
});

describe("the family keys", () => {
  it("give the map form of FamilyBy with the cells of cellOf", () => {
    const reg = createFamilyRegistry<unknown>([boxFamily(), kindFamily()]);
    expect(reg.familyBy()).toEqual({ boxes: [], graph: ["layout"] });
    expect(familyOf(reg.cellOf("boxes"), reg.familyBy())).toBe("boxes");
    expect(familyOf(reg.cellOf("boxes"), DEFAULT_FAMILY_BY)).toBe("boxes");
    expect(familyOf(reg.cellOf("graph", { layout: "hubs" }), reg.familyBy())).toBe("graph/hubs");
  });
});

describe("the ranges and the scales", () => {
  it("map a log scale from 0 to a slider and back", () => {
    const count = CORPUS_DIMENSIONS["count"]!;
    expect(dimensionAt(count, 0)).toBe(0);
    expect(dimensionAt(count, 1)).toBe(100_000);
    for (const v of [0, 1, 10, 999, 100_000]) expect(dimensionAt(count, dimensionUnit(count, v))).toBe(v);
    expect(levelsOf(count)).toEqual([1, 10, 100, 1000, 10_000]);
    const { levels: _levels, ...open } = count;
    expect(levelsOf(open, 3)).toEqual([0, 315, 100_000]);
    expect(levelsOf(CORPUS_DIMENSIONS["aspect"]!, 3)).toEqual([0.25, 1, 4]);
    expect(levelsOf(CORPUS_DIMENSIONS["margin"]!)).toEqual([0]);
  });

  it("give the defaults and each end of each range in boundaryCells", () => {
    const reg = createFamilyRegistry([kindFamily()]);
    const cells = reg.boundaryCells("graph");
    expect(cells[0]).toEqual({ layout: "uniform", nodes: 10, locality: 0.65, hubSkew: 3 });
    expect(cells.map((c) => c["nodes"])).toContain(2);
    expect(cells.map((c) => c["nodes"])).toContain(400);
    // locality and hubSkew are inactive at the default kind, so their ends give the default cell.
    expect(cells.length).toBe(3);
  });

  it("has each dimension of L45 in the shared table, with a good default", () => {
    for (const name of ["count", "sizes", "aspect", "groups", "density", "obstacles", "containerShape", "containerSize", "edgeDensity", "edgeShape", "ports", "spacing", "shape"]) {
      expect(CORPUS_DIMENSIONS[name], name).toBeDefined();
    }
    expect(CORPUS_DIMENSIONS["shape"]!.values).toEqual(["rect"]);
    expect(() => resolveDimensions(Object.values(CORPUS_DIMENSIONS))).not.toThrow();
    for (const d of Object.values(CORPUS_DIMENSIONS)) expect(d.engines.length, d.name).toBeGreaterThan(0);
  });
});

describe("composeFamily", () => {
  it("gives the input of the base family and edgeStep, with the id, the family and documentHash", () => {
    const fam = composeFamily(boxFamily(), [EDGES_STEP]);
    expect(fam.name).toBe("boxes+edges");
    expect(fam.crossEngine).toBe("libm-dependent");
    const reg = createFamilyRegistry([fam]);
    const out = reg.generate("boxes+edges", 2, { count: 40, edgeShape: "bundled", edgeDensity: "dense", groups: "flat", ports: "sides" }, { set: "s" });
    const base = boxFamily().generate(2, { count: 40 }, { rng: DEFAULT_RNG, random: DEFAULT_RNG(2), set: "s" });
    const stepped = { ...edgeStep(base, { edgeShape: "bundled", edgeDensity: "dense", groups: "flat", ports: "sides", hubBy: "area" }, 2), id: "s/boxes.n40.e-dense.bundled.flat.sides/s2", family: "boxes.n40.e-dense.bundled.flat.sides" };
    expect(out).toEqual({ ...stepped, hash: documentHash(stepped) });
  });

  it("refuses a step with the name of a dimension of the base family", () => {
    expect(() => composeFamily(boxFamily(), [{ ...EDGES_STEP, dimensions: [sharedDimension("count")] }])).toThrow(/already/);
  });
});

/** The modules that a browser does not have, and the globals of Node. */
const NODE_IMPORT = /^(node:|fs$|path$|os$|crypto$|worker_threads$|child_process$|module$|url$)/;
const NODE_GLOBAL = /\b(process\.|Buffer\.|require\(|__dirname|__filename)/;

/** This function gives the local files of the import closure of a module, and the external imports. */
function closure(entry: URL): { files: string[]; external: string[] } {
  const files: string[] = [];
  const external = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const url = todo.pop()!;
    if (files.includes(url.href)) continue;
    files.push(url.href);
    const text = readFileSync(url, "utf8");
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)) {
      const spec = m[1]!;
      if (spec.startsWith(".")) todo.push(new URL(spec, url));
      else external.add(spec);
    }
  }
  return { files, external: [...external] };
}

describe("browser safety", () => {
  it("has no API of Node in the import closure of families.ts and of the package root", () => {
    for (const entry of ["./families.ts", "./index.ts"]) {
      const { files, external } = closure(new URL(entry, import.meta.url));
      expect(files.length).toBeGreaterThan(3);
      expect(external.filter((s) => NODE_IMPORT.test(s)), entry).toEqual([]);
      expect(external, entry).toEqual([]);
      for (const f of files) {
        const code = readFileSync(new URL(f), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
        expect(NODE_GLOBAL.test(code), f).toBe(false);
      }
    }
  });
});
