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
  dimensionSupports,
  dimensionUnit,
  EDGES_STEP,
  familyKind,
  levelsOf,
  ownerDimension,
  RECT_SCATTERED,
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
import { SHAPE_KIND_IDS } from "./shapes.ts";

/** The first 8 values of `mulberry32(0)` as whole numbers of 32 bits. `highways` adds a test that pins the same values. */
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
    expect(() => createFamilyRegistry([bad(KIND_DIMS, ["locality"])])).toThrow(/familyBy dimension "locality" has a when/);
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
    expect(reg.cellOf("graph", { layout: "uniform", locality: 0.9 })).toEqual({ kind: "graph@1", layout: "uniform", nodes: 10 });
    expect(reg.cellOf("graph", { layout: "clustered", locality: 0.9 })).toEqual({ kind: "graph@1", layout: "clustered", nodes: 10, locality: 0.9 });
  });
});

describe("the family keys", () => {
  it("give the map form of FamilyBy with the cells of cellOf", () => {
    const reg = createFamilyRegistry<unknown>([boxFamily(), kindFamily()]);
    expect(reg.familyBy()).toEqual({ "boxes@1": [], "graph@1": ["layout"] });
    expect(familyOf(reg.cellOf("boxes"), reg.familyBy())).toBe("boxes@1");
    expect(familyOf(reg.cellOf("boxes"), DEFAULT_FAMILY_BY)).toBe("boxes@1");
    expect(familyOf(reg.cellOf("graph", { layout: "hubs" }), reg.familyBy())).toBe("graph@1/hubs");
    for (const layout of ["uniform", "clustered", "hubs"]) expect(() => familyOf(reg.cellOf("graph", { layout }), reg.familyBy())).not.toThrow();
  });

  it("give each version of a family its own kind and its own familyBy", () => {
    const v1 = { ...kindFamily(), familyBy: [] };
    const v2 = { ...kindFamily(), version: 2, familyBy: ["nodes"] };
    const reg = createFamilyRegistry<unknown>([v1, v2]);
    expect(familyKind("graph", 2)).toBe("graph@2");
    expect(reg.familyBy()).toEqual({ "graph@1": [], "graph@2": ["nodes"] });
    const a = familyOf(reg.cellOf("graph", { nodes: 100 }, 1), reg.familyBy());
    const b = familyOf(reg.cellOf("graph", { nodes: 100 }, 2), reg.familyBy());
    expect([a, b]).toEqual(["graph@1", "graph@2/100"]);
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
    // Each end of locality gets the layout clustered, and each end of hubSkew gets the layout hubs.
    const has = (want: DimensionValues): boolean => cells.some((c) => Object.entries(want).every(([k, v]) => c[k] === v));
    expect(has({ layout: "clustered", locality: 0 })).toBe(true);
    expect(has({ layout: "clustered", locality: 1 })).toBe(true);
    expect(has({ layout: "hubs", hubSkew: 1 })).toBe(true);
    expect(has({ layout: "hubs", hubSkew: 5 })).toBe(true);
    expect(cells.length).toBe(7);
  });

  it("has each dimension of L45 in the shared table, with a good default", () => {
    for (const name of ["count", "sizes", "aspect", "groups", "density", "obstacles", "containerShape", "containerSize", "edgeDensity", "edgeShape", "ports", "spacing", "shape"]) {
      expect(CORPUS_DIMENSIONS[name], name).toBeDefined();
    }
    expect(CORPUS_DIMENSIONS["shape"]!.values).toEqual(SHAPE_KIND_IDS);
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

describe("EDGES_STEP", () => {
  it("refuses a missing or a bad value of a dimension when a caller uses apply with no registry", () => {
    const input = boxFamily().generate(1, { count: 5 }, { rng: DEFAULT_RNG, random: DEFAULT_RNG(1) });
    const good = { edgeDensity: "dense", edgeShape: "hubs", groups: "flat", ports: "sides", hubBy: "area" };
    expect(EDGES_STEP.apply(input, 1, good)).toEqual(edgeStep(input, { edgeDensity: "dense", edgeShape: "hubs", groups: "flat", ports: "sides", hubBy: "area" }, 1));
    expect(() => EDGES_STEP.apply(input, 1, { ...good, edgeShape: "star" })).toThrow(/"edgeShape" is bad/);
    const { ports: _ports, ...noPorts } = good;
    expect(() => EDGES_STEP.apply(input, 1, noPorts)).toThrow(/"ports" is bad: the value is missing/);
  });
});

/** The hashes of `rect-scattered` of `packing` 0.2.17, with 40 boxes and the set `xcheck-v1`, for the seeds 1, 2 and 3. */
const RECT_SCATTERED_HASHES = ["f5f5c51d1560e41c", "cfd6ef0ef232aaa3", "d1638f2406360b2e"];

describe("the family rect-scattered", () => {
  it("gives the pinned hashes of packing, with the default count 40 and the default set xcheck-v1", () => {
    const reg = createFamilyRegistry([RECT_SCATTERED]);
    expect([1, 2, 3].map((seed) => reg.generate("rect-scattered", seed).hash)).toEqual(RECT_SCATTERED_HASHES);
    const one = reg.generate("rect-scattered", 1);
    expect(one.id).toBe("xcheck-v1/rect-scattered/s1");
    expect(one.generator?.params).toEqual({ count: 40 });
    expect(reg.generate("rect-scattered", 1, {}, { set: "s" }).id).toBe("s/rect-scattered/s1");
    expect(RECT_SCATTERED.dimensions.map((d) => d.name)).toEqual(["count"]);
    expect(RECT_SCATTERED.crossEngine).toBe("exact");
  });
});

describe("a cell of cellOf as the dims of the registry", () => {
  it("goes back into generate, resolve, cellOf and rngOf with its own kind", () => {
    const reg = createFamilyRegistry<unknown>([kindFamily(), { ...kindFamily(), version: 2 }, RECT_SCATTERED]);
    const dims = { layout: "clustered", locality: 0.25, nodes: 100 };
    const cell = reg.cellOf("graph", dims);
    expect(cell.kind).toBe("graph@1");
    expect(reg.generate("graph", 5, cell)).toEqual(reg.generate("graph", 5, dims));
    expect(reg.resolve("graph", cell)).toEqual(reg.resolve("graph", dims));
    expect(reg.cellOf("graph", cell)).toEqual(cell);
    expect(u32(reg.rngOf("graph")(5, cell), 3)).toEqual(u32(reg.rngOf("graph")(5, dims), 3));
    const two = reg.cellOf("graph", dims, 2);
    expect(reg.generate("graph", 5, two, { version: 2 })).toEqual(reg.generate("graph", 5, dims, { version: 2 }));
    const scattered = reg.cellOf("rect-scattered", { count: 40 });
    expect((reg.generate("rect-scattered", 1, scattered) as LayoutInput).hash).toBe(RECT_SCATTERED_HASHES[0]);
  });

  it("refuses a kind of another family or of another version", () => {
    const reg = createFamilyRegistry<unknown>([kindFamily(), { ...kindFamily(), version: 2 }, RECT_SCATTERED]);
    const two = reg.cellOf("graph", {}, 2);
    expect(() => reg.generate("graph", 5, two)).toThrow(/has the kind "graph@1", not the kind "graph@2" of the cell/);
    expect(() => reg.resolve("graph", { kind: "rect-scattered@1" })).toThrow(RangeError);
    expect(() => reg.generate("rect-scattered", 1, { kind: "graph@1" })).toThrow(RangeError);
    expect(() => reg.cellOf("graph", { kind: 1 })).toThrow(RangeError);
  });
});

/** An input with a known best value, as the inputs of a consumer with a cut of the container. */
type KnownInput = LayoutInput & { readonly known?: { readonly area: number } };

/** A family with each new field: `supported`, an owner dimension and `invalidates`. */
function knobFamily(): CorpusFamily<KnownInput> {
  return {
    name: "cut",
    version: 1,
    owner: "test",
    meaning: "The pieces of a cut, with a known best value.",
    dimensions: [
      ownerDimension("cut", { kind: "enum", values: ["guillotine", "free"], default: "guillotine", meaning: "The kind of cut.", engines: ["test"] }),
      sharedDimension("shape", { supported: ["rect"] }),
      sharedDimension("margin", { invalidates: ["known"] }),
      sharedDimension("gap", { invalidates: ["known", "missing"], supported: { max: 16 } }),
    ],
    seeding: "stepRandom(seed, boxes).",
    crossEngine: "exact",
    generate(seed, dims) {
      const margin = dims["margin"] as number;
      const body: KnownInput = {
        schema: "layout-input/1",
        id: `t/cut.${String(dims["cut"])}/s${seed}`,
        boxes: [{ id: "b0", w: 10, h: 20, ...(margin === 0 ? {} : { margin }) }],
        known: { area: 200 },
      };
      return { ...body, hash: documentHash(body) };
    },
  };
}

describe("the supported values of a dimension", () => {
  it("keeps the shared values, and refuses another value in resolve, generate, cells and cellCount", () => {
    const reg = createFamilyRegistry([knobFamily()]);
    const shape = reg.family("cut").dimensions.find((d) => d.name === "shape")!;
    expect(shape.values).toEqual(CORPUS_DIMENSIONS["shape"]!.values);
    expect(levelsOf(shape)).toEqual(["rect"]);
    expect(reg.resolve("cut", { shape: "rect" })["shape"]).toBe("rect");
    expect(() => reg.resolve("cut", { shape: "circle" })).toThrow(/the value "circle" of the dimension "shape" is not supported by cut@1\. The supported values are "rect"\./);
    expect(() => reg.generate("cut", 1, { shape: "circle" })).toThrow(RangeError);
    expect(() => reg.generate("cut", 1, { gap: 20 })).toThrow(/the value 20 of the dimension "gap" is not supported by cut@1\. The supported values are the values from 0 to 16\./);
    expect(() => reg.cellCount("cut", { levels: { shape: ["rect", "circle"] } })).toThrow(/the level "circle" of "shape" is not supported by cut@1/);
    expect(reg.cellCount("cut", { sweep: ["shape"] })).toBe(1);
    expect([...reg.cells("cut", { sweep: ["cut", "shape"] })].map((c) => c["shape"])).toEqual(["rect", "rect"]);
  });

  it("gives the supported answer for the site, and keeps the numeric points of levelsOf in the supported range", () => {
    const [, shape, margin, gap] = knobFamily().dimensions;
    expect(dimensionSupports(shape!, "rect")).toBe(true);
    expect(dimensionSupports(shape!, "circle")).toBe(false);
    expect(dimensionSupports(shape!, "star")).toBe(false);
    expect(dimensionSupports(margin!, 32)).toBe(true);
    expect(dimensionSupports(gap!, 16)).toBe(true);
    expect(dimensionSupports(gap!, 16.5)).toBe(false);
    expect(dimensionSupports(gap!, "x")).toBe(false);
    expect(levelsOf(gap!, 3)).toEqual([0, 8, 16]);
    expect(levelsOf(sharedDimension("gap"), 3)).toEqual([0, 16, 32]);
    const ends = createFamilyRegistry([knobFamily()]).boundaryCells("cut").map((c) => c["gap"]);
    expect(ends).toContain(16);
    expect(ends).not.toContain(32);
  });

  it("refuses a bad supported list or range, and a default or a level outside it", () => {
    expect(() => sharedDimension("shape", { supported: [] })).toThrow(/an empty list/);
    expect(() => sharedDimension("shape", { supported: ["star"] })).toThrow(/a supported value of "shape" is bad/);
    expect(() => sharedDimension("shape", { supported: ["rect", "rect"] })).toThrow(/a value two times/);
    expect(() => sharedDimension("shape", { supported: ["circle"] })).toThrow(/the default of "shape" is not a supported value/);
    expect(() => sharedDimension("shape", { supported: { max: 1 } })).toThrow(/are a list, because the dimension is not numeric/);
    expect(() => sharedDimension("gap", { supported: [0, 1] })).toThrow(/are a range with min and max/);
    expect(() => sharedDimension("gap", { supported: { min: 8, max: 4 } })).toThrow(/a min above its max/);
    expect(() => sharedDimension("gap", { supported: { max: 64 } })).toThrow(/an end of the supported range of "gap" is bad/);
    expect(() => sharedDimension("count", { supported: { min: 200 } })).toThrow(/the default of "count" is not a supported value/);
    expect(() => sharedDimension("count", { supported: { max: 500 } })).toThrow(/the level 1000 of "count" is not a supported value/);
    const bad: CorpusFamily<KnownInput> = { ...knobFamily(), dimensions: [{ ...CORPUS_DIMENSIONS["shape"]!, supported: ["circle"] }] };
    expect(() => createFamilyRegistry([bad])).toThrow(/the default of "shape" is not a supported value/);
  });
});

describe("ownerDimension", () => {
  it("gives a dimension with the checks of a shared dimension", () => {
    const cut = ownerDimension("cut", { kind: "enum", values: ["guillotine", "free"], default: "free", meaning: "The kind of cut.", engines: ["test"] });
    expect(cut).toEqual({ kind: "enum", values: ["guillotine", "free"], default: "free", meaning: "The kind of cut.", engines: ["test"], name: "cut" });
    expect(Object.isFrozen(cut)).toBe(true);
    expect(levelsOf(cut)).toEqual(["guillotine", "free"]);
  });

  it("refuses a shared name, the name kind, an empty name and a bad dimension", () => {
    const spec = { kind: "enum", values: ["a", "b"], default: "a", meaning: "A test.", engines: ["test"] } as const;
    expect(() => ownerDimension("shape", spec)).toThrow(/is in the shared dimension table\. Use sharedDimension\("shape"\)/);
    expect(() => ownerDimension("count", spec)).toThrow(RangeError);
    expect(() => ownerDimension("kind", spec)).toThrow(/has a reserved name/);
    expect(() => ownerDimension("", spec)).toThrow(/a text that is not empty/);
    expect(() => ownerDimension("cut", { ...spec, default: "c" })).toThrow(/the default of "cut" is bad/);
    expect(() => ownerDimension("cut", { ...spec, levels: ["c"] })).toThrow(/a level of "cut" is bad/);
    expect(() => ownerDimension("cut", { ...spec, supported: ["b"] })).toThrow(/the default of "cut" is not a supported value/);
    expect(() => ownerDimension("cut", { ...spec, invalidates: ["hash"] })).toThrow(/the field "hash", which the registry writes/);
  });
});

describe("the invalidates fields of a dimension", () => {
  it("keeps the output of the family at the defaults: the same object, the same hash and no invalidated", () => {
    const f = knobFamily();
    const own = f.generate(3, createFamilyRegistry([f]).resolve("cut"), { rng: DEFAULT_RNG, random: DEFAULT_RNG(3) });
    const out = createFamilyRegistry([f]).generate("cut", 3);
    expect(out).toEqual(own);
    expect(out.known).toEqual({ area: 200 });
    expect(Object.hasOwn(out, "invalidated")).toBe(false);
  });

  it("removes the fields for a value other than the default, lists them sorted and calculates the hash again", () => {
    const reg = createFamilyRegistry([knobFamily()]);
    const out = reg.generate("cut", 3, { margin: 4, gap: 2 });
    expect(Object.hasOwn(out, "known")).toBe(false);
    expect(out.invalidated).toEqual(["known"]);
    expect(Object.keys(out).slice(-2)).toEqual(["invalidated", "hash"]);
    expect(out.hash).toBe(documentHash(out));
    expect(out.boxes[0]!.margin).toBe(4);
    expect(reg.generate("cut", 3, { gap: 2 }).invalidated).toEqual(["known"]);
  });

  it("uses the hash of the family, and keeps an output with none of the fields", () => {
    const f: CorpusFamily<KnownInput> = { ...knobFamily(), hash: () => "own" };
    expect(createFamilyRegistry([f]).generate("cut", 3, { margin: 4 }).hash).toBe("own");
    const plain: CorpusFamily<KnownInput> = { ...knobFamily(), generate: (seed) => ({ schema: "layout-input/1", id: `p/s${seed}`, boxes: [] }) };
    expect(createFamilyRegistry([plain]).generate("cut", 3, { margin: 4 })).toEqual({ schema: "layout-input/1", id: "p/s3", boxes: [] });
  });

  it("refuses a bad list of fields at registration", () => {
    const withList = (invalidates: readonly string[]): CorpusFamily<KnownInput> => ({ ...knobFamily(), dimensions: [{ ...CORPUS_DIMENSIONS["margin"]!, invalidates }] });
    expect(() => createFamilyRegistry([withList(["known", "known"])])).toThrow(/has a field two times/);
    expect(() => createFamilyRegistry([withList(["invalidated"])])).toThrow(/the field "invalidated", which the registry writes/);
    expect(() => createFamilyRegistry([withList([""])])).toThrow(/is not a list of field names/);
    expect(() => sharedDimension("margin", { invalidates: ["hash"] })).toThrow(RangeError);
  });
});
