// The families of the joint corpus on the shared registry of `@mark1russell7/layout-contract` (L45, `docs/CORPUS.md`).
// The base families are the generators of `packing` and the families of `highways` (L54). The steps are `EDGES_STEP` of the contract and `SPACING_STEP` of this package.
// This file uses no API of Node, so a site can import it and generate a joint input in a browser.
import {
  composeFamily,
  CORPUS_DIMENSIONS,
  createFamilyRegistry,
  EDGES_STEP,
  familyKind,
  sharedDimension,
  type CorpusDimension,
  type CorpusFamily,
  type CorpusStep,
  type CrossEngine,
  type DimensionValues,
  type FamilyRegistry,
  type GenerateContext,
  type LayoutInput,
} from "@mark1russell7/layout-contract";
import { graphInput, HIGHWAYS_FAMILIES, type HighwaysFamily } from "@mark1russell7/highways";
import { generator, type CorpusGenerator } from "@mark1russell7/packing";
import { spacingStep, SPACING_STEP_VERSION, type Spacing } from "./spacing.ts";

/** The names of the generators of `packing` that the joint corpus uses. */
export const JOINT_BASES: readonly string[] = Object.freeze(["rect-grid", "gallery", "dashboard", "cards", "word-cloud", "edge-cases"]);

/**
 * The cross-engine note of each generator of `packing`. The size distribution `heavyTail` of `rect-grid` uses `**`, which is not correctly rounded in each engine.
 * The other generators use only whole numbers, `Math.sqrt`, `Math.floor`, `Math.round` and division.
 */
const CROSS_ENGINE: Readonly<Record<string, CrossEngine>> = Object.freeze({ "rect-grid": "libm-dependent" });

/** This function gives the params of a generator of `packing`: text and numbers only. It throws a `RangeError` for a value of another type. */
function generatorParams(name: string, dims: DimensionValues): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(dims)) {
    if (typeof value !== "string" && typeof value !== "number") throw new RangeError(`The generator "${name}" of packing has no parameter "${key}" of the type ${typeof value}.`);
    out[key] = value;
  }
  return out;
}

/**
 * This function gives a family of the registry for a generator of `packing`. The dimensions are the parameters of the generator.
 * A parameter of the shared table gets its dimension, with the default and the values of the generator. `generate` starts the generator with no other change.
 * TODO(k73): use the family that `packing` registers, when it has one. Then this adapter goes.
 */
export function packingFamily(gen: CorpusGenerator): CorpusFamily<LayoutInput> {
  const values = gen.values as Readonly<Record<string, readonly (string | number)[] | undefined>>;
  const dimensions = Object.entries(gen.defaults).map(([name, value]): CorpusDimension => {
    const allowed = values[name];
    if (Object.hasOwn(CORPUS_DIMENSIONS, name)) return sharedDimension(name, { default: value, ...(allowed === undefined ? {} : { values: [...allowed] }) });
    const meaning = `The parameter "${name}" of the generator "${gen.name}" of packing.`;
    if (allowed !== undefined || typeof value !== "number") return { name, kind: "enum", values: [...(allowed ?? [value])], default: value, meaning, engines: ["packing"] };
    // TODO(k73): packing declares the range of each numeric parameter. Until then, the range has the default only.
    return { name, kind: Number.isInteger(value) ? "int" : "real", min: value, max: value, default: value, meaning, engines: ["packing"] };
  });
  return Object.freeze({
    name: gen.name,
    version: gen.version,
    owner: "packing",
    meaning: `The generator "${gen.name}" version ${gen.version} of packing.`,
    dimensions,
    seeding: "stepRandom(seed, step) for the steps container, obstacles and boxes, as in docs/FORMAT.md of packing.",
    crossEngine: CROSS_ENGINE[gen.name] ?? "exact",
    generate: (seed: number, dims: DimensionValues, context: { readonly set?: string }) => gen.generate(seed, generatorParams(gen.name, dims), context.set),
  });
}

/** The step `spacing` of `spacingStep` (version 1), as a corpus step. Its family part is `sp-<spacing>`. */
export const SPACING_STEP: CorpusStep = Object.freeze({
  name: "spacing",
  version: SPACING_STEP_VERSION,
  owner: "joint",
  meaning: "The margin of each box and the gap of the input, from the value of spacing.",
  dimensions: [CORPUS_DIMENSIONS["spacing"]!],
  seeding: "No random numbers.",
  crossEngine: "exact",
  familyPart: (d: DimensionValues) => `sp-${d["spacing"]}`,
  apply: (input: LayoutInput, seed: number, d: DimensionValues) => spacingStep(input, { spacing: d["spacing"] as Spacing }, seed),
});

/** The steps of each joint corpus: `edges` for `joint-v1`, and `edges` then `spacing` for `joint-v2`. */
export const JOINT_STEPS: Readonly<Record<"joint-v1" | "joint-v2", readonly CorpusStep[]>> = Object.freeze({ "joint-v1": [EDGES_STEP], "joint-v2": [EDGES_STEP, SPACING_STEP] });

/**
 * This function gives a family of the registry for a family of `highways` (CORPUS-GEN). The output is the input file of `graphInput` of the board.
 * The boxes have the positions of the board, and the edges are the edges of the board. Thus a highways family needs no step `edges`.
 */
export function highwaysFamily(family: HighwaysFamily): CorpusFamily<LayoutInput> {
  return Object.freeze({
    name: family.name,
    version: family.version,
    owner: family.owner,
    meaning: family.meaning,
    dimensions: family.dimensions,
    seeding: family.seeding,
    crossEngine: family.crossEngine,
    ...(family.rng === undefined ? {} : { rng: family.rng }),
    ...(family.rngSeed === undefined ? {} : { rngSeed: family.rngSeed }),
    ...(family.familyBy === undefined ? {} : { familyBy: family.familyBy }),
    generate(seed: number, dims: DimensionValues, context: GenerateContext): LayoutInput {
      const board = family.generate(seed, dims, context);
      const set = context.set ?? "";
      const id = `${set === "" ? "" : `${set}/`}${family.name}/s${seed}`;
      return graphInput(board.graph, { id, set, family: family.name, seed, generator: board.generator });
    },
  });
}

/**
 * The steps of a highways family in each joint corpus: the steps of `JOINT_STEPS` without `EDGES_STEP`, because the board has its edges.
 * A step with a dimension of the same name as a dimension of the family is not used.
 * For example, `sparse-long` of highways 0.9.4 and later has its own `spacing`: the size of the cell of each node.
 */
function highwaysSteps(set: "joint-v1" | "joint-v2", family: HighwaysFamily): readonly CorpusStep[] {
  const own = new Set(family.dimensions.map((d) => d.name));
  return JOINT_STEPS[set].filter((s) => s !== EDGES_STEP && s.dimensions.every((d) => !own.has(d.name)));
}

/**
 * The families of `highways` that a joint registry holds after the families of `JOINT_BASES` (L54): each family of `HIGHWAYS_FAMILIES`.
 * The `joint-v1` and `joint-v2` specs use only `JOINT_BASES`, so these families change no committed input. A new corpus can use them.
 */
export const JOINT_HIGHWAYS_FAMILIES: readonly string[] = Object.freeze(HIGHWAYS_FAMILIES.map((f) => f.name));

/**
 * This function gives the registry of a joint corpus. It has one family for each name of `JOINT_BASES`: the generator of `packing`, then the steps of the corpus.
 * Then it has one family for each family of `HIGHWAYS_FAMILIES`: the board of `highways`, then the steps of the corpus without `EDGES_STEP`.
 * A highways family does not get a step with a dimension of the family.
 * The name of each family is the name of its generator. A highways family with the kind of a family before it throws a `RangeError`.
 */
export function jointRegistry(set: "joint-v1" | "joint-v2"): FamilyRegistry<LayoutInput> {
  const steps = JOINT_STEPS[set];
  const registry = createFamilyRegistry(JOINT_BASES.map((name) => composeFamily(packingFamily(generator(name)), steps, { name, owner: "joint" })));
  const kinds = new Set(registry.families().map((f) => familyKind(f.name, f.version)));
  const names = new Set(registry.families().map((f) => f.name));
  for (const f of HIGHWAYS_FAMILIES) {
    const kind = familyKind(f.name, f.version);
    if (kinds.has(kind) || names.has(f.name)) throw new RangeError(`The highways family "${kind}" has the name of a joint family. The registry does not hold both.`);
    const own = highwaysSteps(set, f);
    const meaning = own.length === 0 ? f.meaning : `${f.meaning} Then the steps ${own.map((s) => s.name).join(", ")}.`;
    registry.register(composeFamily(highwaysFamily(f), own, { name: f.name, owner: "highways", meaning }));
  }
  return registry;
}
