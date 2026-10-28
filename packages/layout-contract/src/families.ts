// The shared corpus generator (`docs/CORPUS.md`): the dimension schema, the family registry and the seeded random numbers.
// An engine owns its families and gives them to a registry. This file imports no engine and no API of Node, so a browser can run it.
import type { FamilyBy } from "./corpus.ts";
import { edgeStep, type EdgeStepParams } from "./edges.ts";
import { documentHash } from "./hash.ts";
import type { LayoutInput, Obstacle } from "./input.ts";
import { mulberry32, randomInt, stepRandom } from "./random.ts";
import { SHAPE_KIND_IDS } from "./shapes.ts";
import { paramActive, paramLevels, paramProblem, paramValue, type ParamValue, type SpaceParam } from "./strategy-space.ts";

/**
 * One dimension of a corpus: a param of `strategy-space.ts` with its meaning and the engines that use it.
 * The field `when` has the form of `SpaceParam.when`: the dimension is active only for some values of an earlier dimension.
 */
export interface CorpusDimension extends SpaceParam {
  /** The meaning of the dimension, in one sentence. */
  readonly meaning: string;
  /** The engines that read the dimension, for example `packing`, `highways` and `joint`. */
  readonly engines: readonly string[];
  /** The values of a sweep. Without them, a sweep uses the values of an `enum`, `false` and `true` of a `bool`, or the default. */
  readonly levels?: readonly ParamValue[];
}

/** The values of the dimensions of one input: one value for each name. */
export type DimensionValues = Readonly<Record<string, ParamValue>>;

/** A factory of seeded random numbers: it gives a source of numbers in [0, 1) for a seed. */
export type RngFactory = (seed: number) => () => number;

/**
 * The cross-engine note of a family. `exact` tells that each JavaScript engine gives the same output.
 * `libm-dependent` tells that the family uses a function that is not correctly rounded in each engine, for example `Math.log`, `Math.cos` or `**`.
 */
export type CrossEngine = "exact" | "libm-dependent";

/** The random numbers of the default factory: `mulberry32` of `random.ts`. Its stream is pinned in `families.test.ts`. */
export const DEFAULT_RNG: RngFactory = mulberry32;

/** The context that a registry gives to `generate`. */
export interface GenerateContext {
  /** The random factory of the family: its own `rng`, or `DEFAULT_RNG`. */
  readonly rng: RngFactory;
  /** The source of random numbers of the input: `rng(rngSeed(seed, dims))`. A family that does not use it takes no numbers from it. */
  readonly random: () => number;
  /** The name of the corpus of the input, when the caller gives one. */
  readonly set?: string;
}

/**
 * A family of a corpus: a seeded generator with declared dimensions. The engine that owns it gives it to a registry.
 * The registry gives `generate` the raw seed and the full dimension values. It does not change the output, and it does not calculate a hash.
 */
export interface CorpusFamily<O = LayoutInput> {
  /** The name of the family, for example `rect-grid`. */
  readonly name: string;
  /** The version. A change of the output of the family needs a new version. A dimension of only some versions is in the list of those versions only. */
  readonly version: number;
  /** The engine that owns the definition of the family, for example `packing`. */
  readonly owner: string;
  /** The meaning of the family, in one sentence. */
  readonly meaning: string;
  /** The dimensions of the family, in their order. A dimension with `when` comes after the dimension that its `when` names. The name `kind` is reserved. */
  readonly dimensions: readonly CorpusDimension[];
  /** The text of the rule that gives the random numbers of an input from its seed and its dimensions. */
  readonly seeding: string;
  /** The cross-engine note of the family. */
  readonly crossEngine: CrossEngine;
  /** The random factory of the family. The default is `DEFAULT_RNG`. */
  readonly rng?: RngFactory;
  /** This function gives the seed of `context.random` from the input seed and the full dimension values. The default gives the input seed. */
  readonly rngSeed?: (seed: number, dims: DimensionValues) => number;
  /** The dimensions of the family key of `familyBy`, after the kind of the cell. A dimension with `when` is not permitted. The default is no dimension. */
  readonly familyBy?: readonly string[];
  /** This function gives the input of a seed. `dims` has a value for each dimension, also for an inactive dimension. */
  generate(seed: number, dims: DimensionValues, context: GenerateContext): O;
}

/** The options of `generate` of a registry. */
export interface GenerateOptions {
  /** The version of the family. The default is the first version that the registry got. */
  readonly version?: number;
  /** The name of the corpus. The registry gives it to the family in `context.set`. */
  readonly set?: string;
}

/** The options of `cells` and `cellCount` of a registry. */
export interface CellsOptions {
  readonly version?: number;
  /** The dimensions of the sweep. The other dimensions keep their defaults. The default is each dimension of the family. */
  readonly sweep?: readonly string[];
  /** The values of a sweep for some dimensions, in place of the levels of the dimensions. */
  readonly levels?: Readonly<Record<string, readonly ParamValue[]>>;
}

/** The cell of an input of a registry: `<name>@<version>` of its family in `kind` (`familyKind`), and the value of each active dimension. */
export type RegistryCell = Readonly<Record<string, ParamValue>> & { readonly kind: string };

/** This function gives the `kind` of the cells of a version of a family: `<name>@<version>`, for example `rect-grid@2`. Thus two versions do not share a family key. */
export function familyKind(name: string, version: number): string {
  return `${name}@${version}`;
}

/** A registry of families. An import registers nothing: a host makes a registry from the lists of families of the engines. */
export interface FamilyRegistry<O = LayoutInput> {
  /** This method adds a family. It throws a `RangeError` for a second family with the same name and version, or for a bad dimension. */
  register(family: CorpusFamily<O>): FamilyRegistry<O>;
  /** This method gives a family. Without a version, it gives the first version that the registry got. It throws a `RangeError` for an unknown family. */
  family(name: string, version?: number): CorpusFamily<O>;
  /** This method gives each family, in the order of registration. */
  families(): readonly CorpusFamily<O>[];
  /**
   * This method gives the full dimension values of an input. It throws a `RangeError` for an unknown dimension or a bad value.
   * The methods with `dims` accept a cell of `cellOf`: they ignore a `kind` that is the `familyKind` of the family, and refuse another `kind`.
   */
  resolve(name: string, dims?: Readonly<Record<string, ParamValue>>, version?: number): DimensionValues;
  /** This method gives the input of a seed. The output is the output of the family, with no change. */
  generate(name: string, seed: number, dims?: Readonly<Record<string, ParamValue>>, options?: GenerateOptions): O;
  /** This method gives the cell of an input: the `familyKind` of the family version and the value of each active dimension. */
  cellOf(name: string, dims?: Readonly<Record<string, ParamValue>>, version?: number): RegistryCell;
  /** This method gives the full dimension values of each cell of a sweep, without the dead combinations of `when`. */
  cells(name: string, options?: CellsOptions): Generator<DimensionValues>;
  /** This method gives the count of the cells of `cells`. It makes no input. */
  cellCount(name: string, options?: CellsOptions): number;
  /** This method gives the defaults, and each end of each numeric range. The dimensions that a `when` needs get its first value. The other dimensions keep their defaults. */
  boundaryCells(name: string, version?: number): DimensionValues[];
  /** This method gives the random source of an input: the stream that `generate` gets in `context.random`. */
  rngOf(name: string, version?: number): (seed: number, dims?: Readonly<Record<string, ParamValue>>) => () => number;
  /** This method gives the map form of `FamilyBy` for the cells of `cellOf`: the `familyKind` of each family version, with its own `familyBy`. */
  familyBy(): FamilyBy;
}

/** The default key of a family in a manifest: the kind of the cell alone. It is the map form of `FamilyBy` with the entry `"*"`. */
export const DEFAULT_FAMILY_BY: FamilyBy = Object.freeze({ "*": Object.freeze([]) as readonly string[] });

/** This function gives an `enum` dimension. */
const choice = (name: string, values: readonly string[], value: string, meaning: string, engines: readonly string[]): CorpusDimension =>
  Object.freeze({ name, kind: "enum", values: Object.freeze([...values]), default: value, meaning, engines: Object.freeze([...engines]) });

/** This function gives an `int` or a `real` dimension. */
const range = (
  name: string,
  kind: "int" | "real",
  limits: { readonly min: number; readonly max: number; readonly value: number; readonly scale?: "linear" | "log"; readonly levels?: readonly number[] },
  meaning: string,
  engines: readonly string[],
): CorpusDimension =>
  Object.freeze({
    name,
    kind,
    min: limits.min,
    max: limits.max,
    default: limits.value,
    scale: limits.scale ?? "linear",
    ...(limits.levels === undefined ? {} : { levels: Object.freeze([...limits.levels]) }),
    meaning,
    engines: Object.freeze([...engines]),
  });

const P = "packing";
const H = "highways";
const J = "joint";

/**
 * The shared dimension table. A family takes a dimension of it with `sharedDimension`, or declares its own dimension.
 * The coverage table of each dimension and each engine is in `docs/CORPUS.md`.
 */
export const CORPUS_DIMENSIONS: Readonly<Record<string, CorpusDimension>> = Object.freeze({
  count: range("count", "int", { min: 0, max: 100_000, value: 100, scale: "log", levels: [1, 10, 100, 1000, 10_000] }, "The count of the items (n) of an input.", [P, H, J]),
  sizes: choice("sizes", ["identical", "nearIdentical", "uniform", "heavyTail", "bimodal", "extremeAspect"], "uniform", "The distribution of the sizes of the items.", [P, J]),
  aspect: range("aspect", "real", { min: 0.25, max: 4, value: 1, scale: "log" }, "The width over the height of a container with no fixed size.", [P]),
  density: range("density", "real", { min: 0.05, max: 1, value: 0.4, scale: "linear" }, "The area of the items over the area of the frame of the container.", [P]),
  obstacles: choice("obstacles", ["none", "center", "scattered", "wall", "corridors", "touching", "edge"], "none", "The layout of the fixed obstacles.", [P, J]),
  containerSize: choice("containerSize", ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"], "fixed", "The sides of the container that the engine can change.", [P, J]),
  containerShape: choice("containerShape", ["rect", "convex", "polygon", "circle", "ellipse", "holes"], "rect", "The kind of the shape of the container.", [P, J]),
  shape: choice("shape", SHAPE_KIND_IDS, "rect", "The shape kind of each item: a `ShapeKind` of `shapes.ts`.", [P]),
  order: choice("order", ["free", "soft"], "free", "The reading order of the items: no order, or a rank on each item.", [P]),
  groups: choice("groups", ["none", "flat", "nested"], "none", "The groups of the items: no groups, one level, or groups in groups.", [H, J]),
  edgeDensity: choice("edgeDensity", ["sparse", "medium", "dense"], "medium", "The mean count of the edges of each item: 0.5, 1.5 or 4.", [H, J]),
  edgeShape: choice("edgeShape", ["random", "clustered", "hubChain", "hubs", "longRange", "tree", "bundled"], "random", "The topology of the edges.", [H, J]),
  ports: choice("ports", ["free", "sides", "fixed"], "free", "The ports of the edges: free, a side for each end, or fixed ports.", [H, J]),
  hubBy: Object.freeze({
    ...choice("hubBy", ["area", "random"], "area", "The order of the hubs of the shapes hubs and tree: the largest item first, or random.", [J]),
    when: Object.freeze({ param: "edgeShape", in: Object.freeze(["hubs", "tree"]) }),
  }),
  spacing: choice("spacing", ["stress", "gap", "margin", "both"], "both", "The split of the route clearance between the margins and the gap. `stress` has neither.", [J]),
  margin: range("margin", "real", { min: 0, max: 32, value: 0 }, "The margin of each item, in units.", [P, J]),
  gap: range("gap", "real", { min: 0, max: 32, value: 0 }, "The free space between two items, in units.", [P, J]),
});

/** This function gives a dimension of `CORPUS_DIMENSIONS`, with the fields of `patch` over it. It throws a `RangeError` for an unknown name. */
export function sharedDimension(name: string, patch: Partial<CorpusDimension> = {}): CorpusDimension {
  const base = Object.hasOwn(CORPUS_DIMENSIONS, name) ? CORPUS_DIMENSIONS[name] : undefined;
  if (base === undefined) throw new RangeError(`The shared dimension table has no dimension "${name}".`);
  return Object.freeze({ ...base, ...patch, name });
}

/** This function tells if a log scale of a range starts at 0. Then the scale is the log of `1 + x - min`. */
const fromZero = (d: SpaceParam): boolean => d.scale === "log" && (d.min ?? 0) <= 0;

/**
 * This function gives the value at the fraction `t` of the range of a numeric dimension, on its scale. A slider of a site uses it.
 * A log scale with a `min` of 0 or less is the log of `1 + x - min`. An `int` dimension gives a whole number.
 */
export function dimensionAt(dim: SpaceParam, t: number): number {
  const min = dim.min ?? 0;
  const max = dim.max ?? min;
  const u = Math.min(1, Math.max(0, t));
  let v: number;
  if (dim.scale !== "log") v = min + u * (max - min);
  else if (fromZero(dim)) v = min + Math.expm1(u * Math.log1p(max - min));
  else v = Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min)));
  v = Math.min(max, Math.max(min, v));
  return dim.kind === "int" ? Math.round(v) : (paramValue(dim, v) as number);
}

/** This function gives the fraction of the range of a numeric dimension at a value, on its scale. It is the inverse of `dimensionAt`. */
export function dimensionUnit(dim: SpaceParam, value: number): number {
  const min = dim.min ?? 0;
  const max = dim.max ?? min;
  if (max === min) return 0;
  const v = Math.min(max, Math.max(min, value));
  if (dim.scale !== "log") return (v - min) / (max - min);
  if (fromZero(dim)) return Math.log1p(v - min) / Math.log1p(max - min);
  return (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

/**
 * This function gives the values of a sweep of a dimension. `levels` of the dimension come first. Then an `enum` gives its values, and a `bool` gives `false` and `true`.
 * With `steps`, a numeric dimension gives `steps` points from `min` to `max` on its scale. Else it gives its default.
 */
export function levelsOf(dim: CorpusDimension, steps?: number): ParamValue[] {
  if (dim.levels !== undefined) return [...dim.levels];
  if (dim.kind === "enum" || dim.kind === "bool" || steps === undefined) return paramLevels(dim, 1);
  if (!fromZero(dim)) return paramLevels(dim, steps);
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError(`The steps of a sweep are a whole number of 1 or more, not ${steps}.`);
  if (steps === 1) return [paramValue(dim, dim.default)];
  return [...new Set(Array.from({ length: steps }, (_, j) => dimensionAt(dim, j / (steps - 1))))];
}

/** This function gives the problems of the dimensions of a family: a repeated name, a bad default, a bad level or a bad `when`. */
function dimensionProblems(dims: readonly CorpusDimension[]): string[] {
  const out: string[] = [];
  const names = dims.map((d) => d.name);
  dims.forEach((d, i) => {
    if (names.indexOf(d.name) !== i) out.push(`the dimension "${d.name}" is in the list two times`);
    const bad = paramProblem(d, d.default);
    if (bad !== undefined) out.push(`the default of "${d.name}" is bad: ${bad}`);
    for (const v of d.levels ?? []) {
      const p = paramProblem(d, v);
      if (p !== undefined) out.push(`a level of "${d.name}" is bad: ${p}`);
    }
    if (d.when === undefined) return;
    const j = names.indexOf(d.when.param);
    if (j < 0 || j >= i) out.push(`the when of "${d.name}" names "${d.when.param}", which is not an earlier dimension`);
    else if (d.when.in.length === 0) out.push(`the when of "${d.name}" has no values`);
    else for (const v of d.when.in) if (paramProblem(dims[j]!, v) !== undefined) out.push(`the when of "${d.name}" has a value that "${d.when.param}" does not have`);
  });
  return out;
}

/**
 * This function gives the full dimension values of an input. A missing dimension gets its default. An inactive dimension of `when` also gets its default.
 * Thus a default that the caller gives, a missing value and an inactive value give the same values. A real number gets its stable form.
 * The function throws a `RangeError` for an unknown dimension or a bad value, also for a bad value of an inactive dimension.
 */
export function resolveDimensions(dimensions: readonly CorpusDimension[], dims: Readonly<Record<string, ParamValue>> = {}, where: string = "The family"): DimensionValues {
  const known = new Set(dimensions.map((d) => d.name));
  for (const key of Object.keys(dims)) if (!known.has(key)) throw new RangeError(`${where} has no dimension "${key}".`);
  const active: Record<string, ParamValue> = {};
  const out: Record<string, ParamValue> = {};
  for (const d of dimensions) {
    const given = Object.hasOwn(dims, d.name) ? dims[d.name] : undefined;
    if (given !== undefined) {
      const bad = paramProblem(d, given);
      if (bad !== undefined) throw new RangeError(`${where}: the dimension "${d.name}" is bad: ${bad}.`);
    }
    const on = paramActive(d, active);
    const value = paramValue(d, on && given !== undefined ? given : d.default);
    if (on) active[d.name] = value;
    out[d.name] = value;
  }
  return out;
}

/** This function gives the values of the active dimensions only. */
function activeValues(dimensions: readonly CorpusDimension[], full: DimensionValues): Record<string, ParamValue> {
  const active: Record<string, ParamValue> = {};
  for (const d of dimensions) if (paramActive(d, active)) active[d.name] = full[d.name]!;
  return active;
}

/** This function gives the active values of each cell of a sweep, in the order of the dimensions. The last dimension changes first. */
function* sweepOf(dimensions: readonly CorpusDimension[], levels: readonly (readonly ParamValue[] | undefined)[], i = 0, values: Record<string, ParamValue> = {}): Generator<Record<string, ParamValue>> {
  if (i === dimensions.length) {
    yield { ...values };
    return;
  }
  const d = dimensions[i]!;
  const lv = levels[i];
  if (lv === undefined || !paramActive(d, values)) {
    yield* sweepOf(dimensions, levels, i + 1, paramActive(d, values) ? { ...values, [d.name]: paramValue(d, d.default) } : values);
    return;
  }
  for (const v of lv) yield* sweepOf(dimensions, levels, i + 1, { ...values, [d.name]: paramValue(d, v) });
}

/** This function counts the cells of a sweep with no list of the cells. A dimension that a later `when` reads splits the count. */
function countOf(dimensions: readonly CorpusDimension[], levels: readonly (readonly ParamValue[] | undefined)[], i = 0, values: Record<string, ParamValue> = {}): number {
  if (i === dimensions.length) return 1;
  const d = dimensions[i]!;
  if (!paramActive(d, values)) return countOf(dimensions, levels, i + 1, values);
  const lv = levels[i] ?? [d.default];
  const readLater = dimensions.slice(i + 1).some((q) => q.when?.param === d.name);
  if (!readLater) return lv.length * countOf(dimensions, levels, i + 1, values);
  let sum = 0;
  for (const v of lv) sum += countOf(dimensions, levels, i + 1, { ...values, [d.name]: paramValue(d, v) });
  return sum;
}

/** This function gives the levels of each dimension of a sweep. A dimension outside the sweep has `undefined`, so it keeps its default. */
function sweepLevels(dimensions: readonly CorpusDimension[], options: CellsOptions, where: string): (readonly ParamValue[] | undefined)[] {
  const names = new Set(dimensions.map((d) => d.name));
  for (const name of [...(options.sweep ?? []), ...Object.keys(options.levels ?? {})]) if (!names.has(name)) throw new RangeError(`${where} has no dimension "${name}".`);
  return dimensions.map((d) => {
    if (options.sweep !== undefined && !options.sweep.includes(d.name)) return undefined;
    const lv = options.levels !== undefined && Object.hasOwn(options.levels, d.name) ? options.levels[d.name]! : levelsOf(d);
    for (const v of lv) {
      const bad = paramProblem(d, v);
      if (bad !== undefined) throw new RangeError(`${where}: a level of "${d.name}" is bad: ${bad}.`);
    }
    return lv;
  });
}

/** This function gives the values that make a dimension active: the first value of its `when`, and the values that make that dimension active. */
function activation(dimensions: readonly CorpusDimension[], dim: CorpusDimension): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  let d: CorpusDimension | undefined = dim;
  while (d?.when !== undefined) {
    const param: string = d.when.param;
    out[param] = d.when.in[0]!;
    d = dimensions.find((q) => q.name === param);
  }
  return out;
}

/** This function throws a `RangeError` when a seed is not a whole number of 0 or more. */
function checkSeed(seed: number): void {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError(`The seed is a whole number of 0 or more, not ${seed}.`);
}

/** This function gives a new registry with the families of the list. Each engine gives the list of its families. An import registers nothing. */
export function createFamilyRegistry<O = LayoutInput>(families: Iterable<CorpusFamily<O>> = []): FamilyRegistry<O> {
  const list: CorpusFamily<O>[] = [];
  const label = (f: CorpusFamily<O>): string => `The family "${f.name}" version ${f.version}`;
  const find = (name: string, version?: number): CorpusFamily<O> => {
    const named = list.filter((f) => f.name === name);
    if (named.length === 0) throw new RangeError(`The registry has no family "${name}".`);
    if (version === undefined) return named[0]!;
    const found = named.find((f) => f.version === version);
    if (found === undefined) throw new RangeError(`The family "${name}" has the versions ${named.map((f) => f.version).join(", ")}, not ${version}.`);
    return found;
  };
  /** This function removes the `kind` of a cell of `cellOf` when it is the `familyKind` of `f`. It throws a `RangeError` for another kind. */
  const ownDims = (f: CorpusFamily<O>, dims: Readonly<Record<string, ParamValue>> | undefined): Readonly<Record<string, ParamValue>> | undefined => {
    if (dims === undefined || !Object.hasOwn(dims, "kind")) return dims;
    const kind = familyKind(f.name, f.version);
    if (dims["kind"] !== kind) throw new RangeError(`${label(f)} has the kind "${kind}", not the kind ${JSON.stringify(dims["kind"])} of the cell.`);
    const { kind: _kind, ...rest } = dims;
    return rest;
  };
  const streamOf = (f: CorpusFamily<O>, seed: number, full: DimensionValues): { readonly rng: RngFactory; readonly random: () => number } => {
    const rng = f.rng ?? DEFAULT_RNG;
    return { rng, random: rng(f.rngSeed === undefined ? seed : f.rngSeed(seed, full)) };
  };
  const registry: FamilyRegistry<O> = {
    register(family) {
      if (!Number.isInteger(family.version) || family.version < 1) throw new RangeError(`${label(family)} has a version that is not a whole number of 1 or more.`);
      if (list.some((f) => f.name === family.name && f.version === family.version)) throw new RangeError(`${label(family)} is in the registry already.`);
      const problems = dimensionProblems(family.dimensions);
      const names = family.dimensions.map((d) => d.name);
      if (names.includes("kind")) problems.push('the dimension name "kind" is reserved: the cell of `cellOf` has the `familyKind` of the family in `kind`');
      for (const key of family.familyBy ?? []) {
        const d = family.dimensions.find((q) => q.name === key);
        if (d === undefined) problems.push(`the familyBy dimension "${key}" is not a dimension of the family`);
        else if (d.when !== undefined) problems.push(`the familyBy dimension "${key}" has a when, so a cell without it has no family key`);
      }
      if (problems.length > 0) throw new RangeError(`${label(family)} is not good: ${problems.join("; ")}.`);
      list.push(family);
      return registry;
    },
    family: find,
    families: () => [...list],
    resolve(name, dims, version) {
      const f = find(name, version);
      return resolveDimensions(f.dimensions, ownDims(f, dims), label(f));
    },
    generate(name, seed, dims, options = {}) {
      checkSeed(seed);
      const f = find(name, options.version);
      const full = resolveDimensions(f.dimensions, ownDims(f, dims), label(f));
      const context: GenerateContext = { ...streamOf(f, seed, full), ...(options.set === undefined ? {} : { set: options.set }) };
      return f.generate(seed, full, context);
    },
    cellOf(name, dims, version) {
      const f = find(name, version);
      return { kind: familyKind(f.name, f.version), ...activeValues(f.dimensions, resolveDimensions(f.dimensions, ownDims(f, dims), label(f))) };
    },
    *cells(name, options = {}) {
      const f = find(name, options.version);
      for (const values of sweepOf(f.dimensions, sweepLevels(f.dimensions, options, label(f)))) yield resolveDimensions(f.dimensions, values, label(f));
    },
    cellCount(name, options = {}) {
      const f = find(name, options.version);
      return countOf(f.dimensions, sweepLevels(f.dimensions, options, label(f)));
    },
    boundaryCells(name, version) {
      const f = find(name, version);
      const base = resolveDimensions(f.dimensions, {}, label(f));
      const out: DimensionValues[] = [base];
      const seen = new Set([JSON.stringify(base)]);
      for (const d of f.dimensions) {
        if (d.kind !== "int" && d.kind !== "real") continue;
        for (const end of [d.min, d.max]) {
          if (end === undefined) continue;
          const cell = resolveDimensions(f.dimensions, { ...activation(f.dimensions, d), [d.name]: end }, label(f));
          const key = JSON.stringify(cell);
          if (!seen.has(key)) {
            seen.add(key);
            out.push(cell);
          }
        }
      }
      return out;
    },
    rngOf(name, version) {
      const f = find(name, version);
      return (seed, dims) => {
        checkSeed(seed);
        return streamOf(f, seed, resolveDimensions(f.dimensions, ownDims(f, dims), label(f))).random;
      };
    },
    familyBy() {
      const out: Record<string, readonly string[]> = {};
      for (const f of list) out[familyKind(f.name, f.version)] = [...(f.familyBy ?? [])];
      return out;
    },
  };
  for (const f of families) registry.register(f);
  return registry;
}

/** A step of a composed family: a pure function that changes an input after its base family, as `edgeStep` does. */
export interface CorpusStep {
  readonly name: string;
  readonly version: number;
  /** The engine that owns the definition of the step. */
  readonly owner: string;
  readonly meaning: string;
  /** The dimensions of the step. Their names are not names of the dimensions of the base family. */
  readonly dimensions: readonly CorpusDimension[];
  /** The text of the rule that gives the random numbers of the step from the seed. */
  readonly seeding: string;
  readonly crossEngine: CrossEngine;
  /** This function gives the part of the family of the input that tells the values of the step. Without it, the family does not change. */
  readonly familyPart?: (dims: DimensionValues) => string;
  /** This function gives the changed input. It removes the old `hash` of the input. */
  apply(input: LayoutInput, seed: number, dims: DimensionValues): LayoutInput;
}

/** The options of `composeFamily`. */
export interface ComposeOptions {
  /** The default is the name of the base family and the names of the steps, with `+` between them. */
  readonly name?: string;
  /** The default is the owner of the base family. */
  readonly owner?: string;
  readonly meaning?: string;
  /** The hash of the composed input. The default is `documentHash` of `hash.ts`. */
  readonly hash?: (input: LayoutInput) => string;
}

/** This function gives the values of a list of dimensions from the full values. */
const pick = (dims: readonly CorpusDimension[], full: DimensionValues): DimensionValues => Object.fromEntries(dims.map((d) => [d.name, full[d.name]!]));

/**
 * This function gives a family that runs the base family and then each step, with the same seed.
 * The family of the input gets the part of each step after a dot. The id becomes `<set>/<family>/s<seed>`, and the input gets the hash of `options.hash`.
 * The function throws a `RangeError` when a step has a dimension with the name of an earlier dimension.
 */
export function composeFamily(base: CorpusFamily<LayoutInput>, steps: readonly CorpusStep[], options: ComposeOptions = {}): CorpusFamily<LayoutInput> {
  const dimensions = [...base.dimensions, ...steps.flatMap((s) => s.dimensions)];
  const seen = new Set<string>();
  for (const d of dimensions) {
    if (seen.has(d.name)) throw new RangeError(`composeFamily: the dimension "${d.name}" is in the base family or in an earlier step already.`);
    seen.add(d.name);
  }
  const hash = options.hash ?? documentHash;
  const libm = base.crossEngine === "libm-dependent" || steps.some((s) => s.crossEngine === "libm-dependent");
  return Object.freeze({
    name: options.name ?? [base.name, ...steps.map((s) => s.name)].join("+"),
    version: base.version,
    owner: options.owner ?? base.owner,
    meaning: options.meaning ?? `${base.meaning} Then the steps ${steps.map((s) => s.name).join(", ")}.`,
    dimensions,
    seeding: [base.seeding, ...steps.map((s) => `${s.name}: ${s.seeding}`)].join(" "),
    crossEngine: libm ? "libm-dependent" : "exact",
    ...(base.rng === undefined ? {} : { rng: base.rng }),
    ...(base.rngSeed === undefined ? {} : { rngSeed: (seed: number, full: DimensionValues) => base.rngSeed!(seed, pick(base.dimensions, full)) }),
    ...(base.familyBy === undefined ? {} : { familyBy: base.familyBy }),
    generate(seed: number, full: DimensionValues, context: GenerateContext): LayoutInput {
      let input = base.generate(seed, pick(base.dimensions, full), context);
      const parts: string[] = [];
      for (const step of steps) {
        const values = pick(step.dimensions, full);
        input = step.apply(input, seed, values);
        if (step.familyPart !== undefined) parts.push(step.familyPart(values));
      }
      const family = [input.family ?? base.name, ...parts].join(".");
      const set = input.set ?? context.set;
      const id = `${set === undefined ? "" : `${set}/`}${family}/s${seed}`;
      const stepped: LayoutInput = { ...input, id, family };
      return { ...stepped, hash: hash(stepped) };
    },
  });
}

/** The dimensions of `EDGES_STEP`: the parameters of `edgeStep`, from the shared table. */
const EDGE_DIMENSIONS: readonly CorpusDimension[] = Object.freeze(["edgeDensity", "edgeShape", "groups", "ports", "hubBy"].map((n) => CORPUS_DIMENSIONS[n]!));

/** This function gives the parameters of `edgeStep` from the values of the dimensions. It throws a `RangeError` for a missing or a bad value. */
function edgeParams(d: DimensionValues): EdgeStepParams {
  const text = (name: string): string => {
    const dim = EDGE_DIMENSIONS.find((q) => q.name === name)!;
    const value = Object.hasOwn(d, name) ? d[name] : undefined;
    const bad = value === undefined ? "the value is missing" : paramProblem(dim, value);
    if (bad !== undefined || typeof value !== "string") throw new RangeError(`EDGES_STEP: the dimension "${name}" is bad: ${bad ?? "it is not text"}.`);
    return value;
  };
  return {
    edgeDensity: text("edgeDensity") as EdgeStepParams["edgeDensity"],
    edgeShape: text("edgeShape") as EdgeStepParams["edgeShape"],
    groups: text("groups") as NonNullable<EdgeStepParams["groups"]>,
    ports: text("ports") as NonNullable<EdgeStepParams["ports"]>,
    hubBy: text("hubBy") as NonNullable<EdgeStepParams["hubBy"]>,
  };
}

/**
 * The step `edges` of `edgeStep` (version 1), as a corpus step. Its family part is `e-<edgeDensity>.<edgeShape>.<groups>.<ports>`.
 * The value `random` of `hubBy` adds the part `.hub-random`.
 */
export const EDGES_STEP: CorpusStep = Object.freeze({
  name: "edges",
  version: 1,
  owner: "layout-contract",
  meaning: "The edges, the groups and the ports of an input, from its topology alone.",
  dimensions: EDGE_DIMENSIONS,
  seeding: "stepRandom(seed, step) for the steps edges and ports.",
  crossEngine: "libm-dependent",
  familyPart: (d: DimensionValues) => `e-${d["edgeDensity"]}.${d["edgeShape"]}.${d["groups"]}.${d["ports"]}${d["hubBy"] === "random" ? ".hub-random" : ""}`,
  apply: (input: LayoutInput, seed: number, d: DimensionValues) => edgeStep(input, edgeParams(d), seed),
});

/** The set of `RECT_SCATTERED` when the caller gives no set. */
const XCHECK_SET = "xcheck-v1";

/**
 * The shared family `rect-scattered`, version 1: a fixed rectangle container, rectangle obstacles at random places and boxes without positions.
 * It is the one copy of the generator of `docs/FORMAT.md` of `packing`. Its input is the input of `packing`, byte for byte.
 * The steps `container`, `obstacles` and `boxes` each have a stream of `stepRandom`. Each value is a whole number, so the family is `exact`.
 */
export const RECT_SCATTERED: CorpusFamily<LayoutInput> = Object.freeze({
  name: "rect-scattered",
  version: 1,
  owner: "layout-contract",
  meaning: "Rectangle obstacles at random places in a fixed rectangle container, and boxes of random sizes.",
  dimensions: Object.freeze([sharedDimension("count", { default: 40 })]),
  seeding: "stepRandom(seed, container) gives w and h. stepRandom(seed, obstacles) gives n, then ow, oh, x and y of each obstacle. stepRandom(seed, boxes) gives bw and bh of each box.",
  crossEngine: "exact",
  generate(seed: number, dims: DimensionValues, context: GenerateContext): LayoutInput {
    const count = dims["count"];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) throw new RangeError(`rect-scattered: the count is a whole number of 0 or more, not ${String(count)}.`);
    const set = context.set ?? XCHECK_SET;
    let r = stepRandom(seed, "container");
    const w = randomInt(r, 600, 1000);
    const h = randomInt(r, 400, 800);
    r = stepRandom(seed, "obstacles");
    const n = randomInt(r, 3, 8);
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < n; i++) {
      const ow = randomInt(r, 40, 160);
      const oh = randomInt(r, 40, 160);
      const x = randomInt(r, 0, w - ow);
      const y = randomInt(r, 0, h - oh);
      obstacles.push({ id: `o${i}`, region: { kind: "rect", x, y, w: ow, h: oh } });
    }
    r = stepRandom(seed, "boxes");
    const boxes = Array.from({ length: count }, (_, i) => {
      const bw = randomInt(r, 20, 120);
      const bh = randomInt(r, 20, 80);
      return { id: `b${i}`, w: bw, h: bh };
    });
    const body: LayoutInput = {
      schema: "layout-input/1",
      id: `${set}/rect-scattered/s${seed}`,
      set,
      family: "rect-scattered",
      seed,
      source: "made-up",
      generator: { name: "rect-scattered", version: 1, params: { count }, seed },
      container: { w, h, fixed: "size" },
      obstacles,
      boxes,
      edges: [],
    };
    return { ...body, hash: documentHash(body) };
  },
});
