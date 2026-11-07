import { CIRCLE_SCATTERED, documentHash, EDGE_STEP_VERSION, type EdgeStepParams, type LayoutInput } from "@mark1russell7/layout-contract";
import { cellOf, countCell, generator, toPackInput, type CorpusCell, type GeneratorParams } from "@mark1russell7/packing";
import { pairwise, type Dimensions, type Row } from "./pairwise.ts";
import { JOINT_BASES, jointRegistry } from "./families.ts";
import { NO_OPEN_SIZE, OPEN_SIZE_NAMES, OPEN_SIZES_STEP_VERSION, type OpenSizesParams } from "./open-sizes.ts";
import { spacingParams, SPACINGS, SPACING_STEP_VERSION, type Spacing, type SpacingParams } from "./spacing.ts";

/** The name of the first corpus. Each input has it in `set`. It is frozen: the stress set of d7. */
export const SET = "joint-v1";

/** The name of the second corpus, with the dimension `spacing`. */
export const SET_V2 = "joint-v2";

/** The names of the joint corpora. */
/** The name of the third corpus: `joint-v2` with the open points of `OPEN_SIZES` as more values of `sizes`. */
export const SET_V3 = "joint-v3";

/** The joint corpora. */
export const SETS: readonly ["joint-v1", "joint-v2", "joint-v3"] = [SET, SET_V2, SET_V3];

/** The name of one joint corpus. */
export type JointSet = (typeof SETS)[number];

/** The seeds of each spec. */
export const SEEDS: readonly number[] = Object.freeze([1, 2, 3]);

/** The seed of the random numbers of the 2 covering arrays. */
export const ARRAY_SEED = 1;

/** The full parameters of `edgeStep`, with each default. */
export type EdgeParams = Required<EdgeStepParams>;

/** The 4 dimensions of the edges, with their values. `edgeShape` has the 7 shapes of `edgeStep`. */
export const EDGE_DIMENSIONS: Dimensions = Object.freeze({
  edgeDensity: ["sparse", "medium", "dense"],
  edgeShape: ["random", "clustered", "hubChain", "hubs", "longRange", "tree", "bundled"],
  groups: ["none", "flat", "nested"],
  ports: ["free", "sides", "fixed"],
});

/** The values of `containerSize` of `packing`. */
const CONTAINER_SIZES = ["fixed", "freeHeight", "freeWidth", "freeAspect", "freeArea"];

/** The counts of `rect-grid` for each value of the dimension `count`. A joint input has at most 1000 boxes. */
const COUNTS: Readonly<Record<string, number>> = Object.freeze({ "10": 10, "100": 100, "1k": 1000 });

/** The dimensions of the array of `rect-grid`: 5 dimensions of `packing` and the 4 dimensions of the edges. */
export const GRID_DIMENSIONS: Dimensions = Object.freeze({
  containerSize: CONTAINER_SIZES,
  containerShape: ["rect", "convex", "polygon", "circle", "ellipse", "holes"],
  obstacles: ["none", "center", "scattered", "wall", "corridors", "touching", "edge"],
  sizes: ["identical", "nearIdentical", "uniform", "heavyTail", "bimodal", "extremeAspect"],
  count: Object.keys(COUNTS),
  ...EDGE_DIMENSIONS,
});

/** The dimensions of the array of the families of a user interface. Each family has its default count. */
export const UI_DIMENSIONS: Dimensions = Object.freeze({
  family: ["gallery", "dashboard", "cards", "word-cloud"],
  containerSize: CONTAINER_SIZES,
  ...EDGE_DIMENSIONS,
});

/** The dimension `spacing` of `joint-v2`, with its values. */
export const SPACING_DIMENSION: Dimensions = Object.freeze({ spacing: [...SPACINGS] });

/** The dimensions of the array of `rect-grid` of `joint-v2`: the 9 dimensions of `joint-v1` and `spacing`. */
export const GRID_DIMENSIONS_V2: Dimensions = Object.freeze({ ...GRID_DIMENSIONS, ...SPACING_DIMENSION });

/** The dimensions of the array of the families of a user interface of `joint-v2`: the 6 dimensions of `joint-v1` and `spacing`. */
export const UI_DIMENSIONS_V2: Dimensions = Object.freeze({ ...UI_DIMENSIONS, ...SPACING_DIMENSION });

/** The dimensions of the array of `rect-grid` of `joint-v3`: the dimensions of `joint-v2`, and `sizes` with the names of `OPEN_SIZES` too. */
export const GRID_DIMENSIONS_V3: Dimensions = Object.freeze({ ...GRID_DIMENSIONS_V2, sizes: [...GRID_DIMENSIONS["sizes"]!, ...OPEN_SIZE_NAMES] });

/** This function gives the dimensions of the 2 arrays of a corpus. */
export function arrayDimensions(set: JointSet): { readonly grid: Dimensions; readonly ui: Dimensions } {
  if (set === SET) return { grid: GRID_DIMENSIONS, ui: UI_DIMENSIONS };
  return { grid: set === SET_V3 ? GRID_DIMENSIONS_V3 : GRID_DIMENSIONS_V2, ui: UI_DIMENSIONS_V2 };
}

/** The cases of `edge-cases` outside the arrays. They have the edges `random` and `medium`. */
export const FIXED_CASES: readonly string[] = Object.freeze(["empty", "one", "oversize"]);

/** The values of `spacing` of each fixed case of `joint-v2`. `empty` and `one` give no routes, so they get one value. `oversize` gets each value. */
export const FIXED_SPACINGS: Readonly<Record<string, readonly Spacing[]>> = Object.freeze({ empty: ["both"], one: ["both"], oversize: [...SPACINGS] });

/** The containers of the circle specs of `joint-v3`: the 2 containers of `circle-scattered`. */
export const CIRCLE_CONTAINERS: readonly string[] = Object.freeze(["rect", "circle"]);

/** The values of `spacing` of each circle spec of `joint-v3`. With 2 containers and 3 seeds, the board kind `circle-scattered` has 12 inputs, so it is not thin. */
export const CIRCLE_SPACINGS: readonly Spacing[] = Object.freeze(["stress", "both"]);

/**
 * The cuts of the small strips of `joint-v3`. Each strip uses `perfect-cut` in a strip of a fixed width, with boxes of whole sizes and no obstacle. Their spacing is `stress`, so they have no gap and no margin.
 * The strategy `exact-strip` takes such an input: at most 16 items of whole sizes, with no gap and no margin. The cut of a rectangle gives the best height.
 * The boxes of `rect-grid` do not have whole sizes, so `exact-strip` refuses each one.
 * With 2 cuts, 2 counts and 3 seeds, the board kind `perfect-cut` has 12 inputs, so it is not thin.
 */
export const STRIP_CUTS: readonly string[] = Object.freeze(["guillotine", "free"]);

/** The counts of the boxes of the small strips of `joint-v3`. Each one is below `EXACT_STRIP_MAX_ITEMS` of `packing`, 16. */
export const STRIP_COUNTS: readonly number[] = Object.freeze([8, 12]);

/** The edges of each fixed case and each spec of the array `shapes`: medium and random, with no groups and free ports. */
const FIXED_EDGES: EdgeParams = Object.freeze({ edgeDensity: "medium", edgeShape: "random", groups: "none", ports: "free", hubBy: "area" });

/**
 * The cell of a joint input: the cell of `packing`, with the 4 dimensions of the edges. `edgeShape` can be `hubs`.
 * A cell of `joint-v2` also has `spacing`. `LayoutCell` of the contract does not have it.
 */
export type JointCell = Omit<CorpusCell, "groups" | "sizes"> & { readonly sizes?: string } & Pick<EdgeParams, "edgeDensity" | "edgeShape" | "groups" | "ports"> & { readonly spacing?: Spacing };

/** The stamp of the step `edges` in a spec. */
export interface EdgesStamp {
  readonly name: "edges";
  readonly version: number;
  readonly params: EdgeParams;
}

/** The stamp of the step `spacing` in a spec of `joint-v2`. */
export interface SpacingStamp {
  readonly name: "spacing";
  readonly version: number;
  readonly params: SpacingParams;
}

/** The stamp of the step `open-sizes` in a spec of `joint-v3`. The step goes before the steps of the field `steps`. */
export interface OpenSizesStamp {
  readonly name: "open-sizes";
  readonly version: number;
  readonly params: OpenSizesParams;
}

/** One spec of the corpus: the base generator with its full parameters, the steps and the seeds. A spec of `joint-v2` also has the step `spacing`. */
export interface JointSpec {
  /** The array of the spec: `grid`, `ui`, `fixed` for a case of `edge-cases`, or `shapes` for a spec of `SHAPE_SPECS` in `joint-v3`. */
  readonly array: "grid" | "ui" | "fixed" | "shapes";
  readonly generator: string;
  readonly version: number;
  readonly params: GeneratorParams;
  readonly steps: readonly [EdgesStamp] | readonly [EdgesStamp, SpacingStamp];
  /** The open point of a spec of `joint-v3`. Without it, the boxes keep the sizes of the generator. */
  readonly openSizes?: OpenSizesStamp;
  readonly seeds: readonly number[];
}

/** One input in the index of the manifest. */
export interface JointEntry {
  readonly id: string;
  readonly hash: string;
  readonly cell: JointCell;
  /** This value is `true` for an input of the stress cell of d7: no margin and no gap. The analysis reports these inputs apart. */
  readonly stress?: true;
}

/** The design rules that a corpus states. `checkCorpus` examines them. The text is in `docs/JOINT-BENCH.md`. */
export interface CorpusClaims {
  /** The rule of d7: `margin + gap` above 0 on each input outside the stress cell, and margin 0 and gap 0 on each stress input. */
  readonly spacing?: true;
  /** This value is `true` when each input of the corpus is a stress input of d7: no gap above 0 and no margins. */
  readonly stressOnly?: true;
  /** The share of the pairs of values that each array covers, by the array: `grid` and `ui`. */
  readonly coverage: Readonly<Record<string, number>>;
  /** The least count of inputs of each board kind, and the kinds with fewer inputs. These kinds are known to be thin. */
  readonly minPerKind: { readonly count: number; readonly thin: readonly string[] };
  /** The largest count of boxes of an input. */
  readonly maxBoxes: number;
}

/** The manifest `corpus.json` of the corpus: `layout-corpus/1`, with the steps in each spec. A manifest of `joint-v2` also has `claims`. */
export interface JointManifest {
  readonly schema: "layout-corpus/1";
  readonly corpus: string;
  readonly claims?: CorpusClaims;
  readonly specs: readonly JointSpec[];
  readonly inputs: readonly JointEntry[];
}

/** The corpus: the manifest and the input files, in the order of the specs and the seeds. */
export interface JointCorpus {
  readonly manifest: JointManifest;
  readonly inputs: readonly LayoutInput[];
}

/** This function gives the full parameters of `edgeStep` of a row. */
export function jointEdgesOf(row: Row): EdgeParams {
  return {
    edgeDensity: row["edgeDensity"] as EdgeParams["edgeDensity"],
    edgeShape: row["edgeShape"] as EdgeParams["edgeShape"],
    groups: row["groups"] as EdgeParams["groups"],
    ports: row["ports"] as EdgeParams["ports"],
    hubBy: "area",
  };
}

/** This function gives a spec with the full parameters of its generator. With a value of `spacing`, the spec also has the step `spacing`. */
export function jointSpecOf(array: JointSpec["array"], name: string, params: GeneratorParams, edges: EdgeParams, spacing?: Spacing, openSize?: string): JointSpec {
  const gen = generator(name);
  const edgesStamp: EdgesStamp = { name: "edges", version: EDGE_STEP_VERSION, params: edges };
  return {
    array,
    generator: gen.name,
    version: gen.version,
    params: gen.withDefaults(params),
    steps: spacing === undefined ? [edgesStamp] : [edgesStamp, { name: "spacing", version: SPACING_STEP_VERSION, params: spacingParams(spacing) }],
    ...(openSize === undefined ? {} : { openSizes: { name: "open-sizes" as const, version: OPEN_SIZES_STEP_VERSION, params: { point: openSize } } }),
    seeds: [...SEEDS],
  };
}

/** This function gives the value of `spacing` of a row, or `undefined` for a row without it. */
const spacingOf = (row: Row): Spacing | undefined => row["spacing"] as Spacing | undefined;

/** This function gives the open point of a row, or `undefined` for a closed name of `sizes`. */
const openSizeOf = (row: Row): string | undefined => (OPEN_SIZE_NAMES.includes(row["sizes"]!) ? row["sizes"] : undefined);

/**
 * This function gives the specs of a corpus. The rows of the array `grid` come first, then the rows of the array `ui`, then the fixed cases.
 * The arrays come from `pairwise` with `ARRAY_SEED`. In `joint-v2`, each fixed case gets the values of `FIXED_SPACINGS`.
 */
export function jointSpecs(set: JointSet = SET): JointSpec[] {
  const dims = arrayDimensions(set);
  const grid = pairwise(dims.grid, ARRAY_SEED).map((row) =>
    jointSpecOf(
      "grid",
      "rect-grid",
      { containerSize: row["containerSize"]!, containerShape: row["containerShape"]!, obstacles: row["obstacles"]!, sizes: openSizeOf(row) === undefined ? row["sizes"]! : "uniform", count: COUNTS[row["count"]!]! },
      jointEdgesOf(row),
      spacingOf(row),
      openSizeOf(row),
    ),
  );
  const ui = pairwise(dims.ui, ARRAY_SEED).map((row) => jointSpecOf("ui", row["family"]!, { containerSize: row["containerSize"]! }, jointEdgesOf(row), spacingOf(row)));
  const fixed = FIXED_CASES.flatMap((c) =>
    set === SET ? [jointSpecOf("fixed", "edge-cases", { case: c }, FIXED_EDGES)] : FIXED_SPACINGS[c]!.map((s) => jointSpecOf("fixed", "edge-cases", { case: c }, FIXED_EDGES, s)),
  );
  return [...grid, ...ui, ...fixed, ...(set === SET_V3 ? shapeSpecs() : [])];
}

/** This function gives a circle spec of `joint-v3`: `circle-scattered` with its default count, in one container, then the steps `edges` and `spacing`. */
export function circleSpecOf(containerShape: string, spacing: Spacing): JointSpec {
  return {
    array: "shapes",
    generator: CIRCLE_SCATTERED.name,
    version: CIRCLE_SCATTERED.version,
    params: { count: CIRCLE_SCATTERED.dimensions.find((d) => d.name === "count")!.default as number, containerShape },
    steps: [
      { name: "edges", version: EDGE_STEP_VERSION, params: FIXED_EDGES },
      { name: "spacing", version: SPACING_STEP_VERSION, params: spacingParams(spacing) },
    ],
    seeds: [...SEEDS],
  };
}

/**
 * This function gives the specs of the array `shapes` of `joint-v3` (L94). They give inputs to the strategies that no other input of a joint corpus suits.
 * - A circle spec for each container of `CIRCLE_CONTAINERS` and each value of `CIRCLE_SPACINGS`. `hole-degree` takes the rectangle, and `circle-quasi-physical` takes the circle.
 * - A small strip of `perfect-cut` for each cut of `STRIP_CUTS` and each count of `STRIP_COUNTS`, with the spacing `stress`. `exact-strip` takes each one.
 */
export function shapeSpecs(): JointSpec[] {
  const circles = CIRCLE_CONTAINERS.flatMap((c) => CIRCLE_SPACINGS.map((s) => circleSpecOf(c, s)));
  const strips = STRIP_CUTS.flatMap((cut) => STRIP_COUNTS.map((count) => jointSpecOf("shapes", "perfect-cut", { cut, containerSize: "freeHeight", count }, FIXED_EDGES, "stress")));
  return [...circles, ...strips];
}

/** This function gives the part of the family that tells the edges, for example `e-medium.clustered.flat.sides`. */
export function edgeFamily(edges: EdgeParams): string {
  return `e-${edges.edgeDensity}.${edges.edgeShape}.${edges.groups}.${edges.ports}`;
}

/** This function gives the hash of an input file. It is `documentHash` of `@mark1russell7/layout-contract`. */
export function hashOf(file: LayoutInput): string {
  return documentHash(file);
}

/** The largest count of boxes of a joint input. */
export const MAX_BOXES = 1000;

/** The least count of inputs of a board kind that is not thin. It is `THIN_KIND` of the analysis. */
export const MIN_PER_KIND = 10;

/**
 * The claims of `joint-v1`. Its manifest is frozen, so the claims are here and not in the manifest.
 * Each input of `joint-v1` has no margins and no gap, thus the corpus is the stress set of d7.
 */
export const JOINT_V1_CLAIMS: CorpusClaims = Object.freeze({
  stressOnly: true,
  coverage: { grid: 1, ui: 1 },
  minPerKind: { count: MIN_PER_KIND, thin: ["edge-cases"] },
  maxBoxes: MAX_BOXES,
});

/** The claims of `joint-v2` and `joint-v3`, in the field `claims` of each manifest. */
export const JOINT_V2_CLAIMS: CorpusClaims = Object.freeze({
  spacing: true,
  coverage: { grid: 1, ui: 1 },
  minPerKind: { count: MIN_PER_KIND, thin: [] },
  maxBoxes: MAX_BOXES,
});

/**
 * This function gives the input file of one seed of a spec, and its entry in the manifest. `jointCorpus` makes each input with it.
 * The site makes one input with it, so it does not make the full corpus.
 * A generator of `packing` gives the cell from the params of the spec. A shape family of the contract gives no cell, so the cell comes from `cellOf` of the input of `packing`.
 */
export function jointInput(spec: JointSpec, seed: number, set: JointSet, registry: ReturnType<typeof jointRegistry> = jointRegistry(set)): { readonly input: LayoutInput; readonly entry: JointEntry } {
  const packing = JOINT_BASES.includes(spec.generator);
  const edges = spec.steps[0].params;
  const spacing = spec.steps[1]?.params.spacing;
  const open = spec.openSizes?.params.point;
  const dims = { ...spec.params, ...edges, ...(spacing === undefined ? {} : { spacing }), ...(set === SET_V3 && packing ? { openSize: open ?? NO_OPEN_SIZE } : {}) };
  const input = registry.generate(spec.generator, seed, dims, { set });
  const cell: JointCell = {
    ...(packing ? generator(spec.generator).cell(spec.params) : shapeCell(input)),
    ...(open === undefined ? {} : { sizes: open }),
    edgeDensity: edges.edgeDensity,
    edgeShape: edges.edgeShape,
    groups: edges.groups,
    ports: edges.ports,
    ...(spacing === undefined ? {} : { spacing }),
  };
  return { input, entry: { id: input.id, hash: input.hash!, cell, ...(spacing === "stress" ? { stress: true as const } : {}) } };
}

/**
 * This function gives the cell of an input of a shape family. The cell is `cellOf` of `packing` for the input. It has no obstacles, the sizes `uniform`, the count scale and the mode `offline`.
 * The radii of `circle-scattered` are random whole numbers from 8 to 40, so the sizes are `uniform`.
 */
function shapeCell(input: LayoutInput): CorpusCell {
  return { ...cellOf(toPackInput(input)), obstacles: "none", sizes: "uniform", count: countCell(input.boxes.length), mode: "offline" };
}

/**
 * This function gives a corpus: `joint-v1` (the default) or `joint-v2`. The same version of the packages gives the same files, byte for byte.
 * For each spec and seed, the family of `jointRegistry` gives the input: the generator of `packing`, then `edgeStep` with the same seed.
 * In `joint-v2`, `spacingStep` then sets the margins and the gap, and the part `.sp-<spacing>` ends the family.
 * The id is `<set>/<family>/s<seed>`. The family is the family of `packing` and the part of the edges.
 * The option `seeds` replaces the seeds of each spec, for a run on fresh seeds. Without it, the corpus does not change.
 */
export function jointCorpus(set: JointSet = SET, options: { readonly seeds?: readonly number[] } = {}): JointCorpus {
  const specs = jointSpecs(set).map((spec) => (options.seeds === undefined ? spec : { ...spec, seeds: [...options.seeds] }));
  const inputs: LayoutInput[] = [];
  const entries: JointEntry[] = [];
  const ids = new Set<string>();
  const registry = jointRegistry(set);
  for (const spec of specs) {
    for (const seed of spec.seeds) {
      const { input, entry } = jointInput(spec, seed, set, registry);
      if (ids.has(entry.id)) throw new RangeError(`The corpus has 2 inputs with the id "${entry.id}".`);
      ids.add(entry.id);
      inputs.push(input);
      entries.push(entry);
    }
  }
  const manifest: JointManifest = { schema: "layout-corpus/1", corpus: set, ...(set === SET ? {} : { claims: JOINT_V2_CLAIMS }), specs, inputs: entries };
  return { manifest, inputs };
}

/** This function gives the text of a manifest: one line for each spec and for each input, and a newline at the end. The claims come after the name. */
export function manifestJson(manifest: JointManifest): string {
  const list = (items: readonly unknown[]): string => (items.length === 0 ? "[]" : `[\n${items.map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ]`);
  const claims = manifest.claims === undefined ? "" : `\n  "claims": ${JSON.stringify(manifest.claims)},`;
  return `{\n  "schema": ${JSON.stringify(manifest.schema)},\n  "corpus": ${JSON.stringify(manifest.corpus)},${claims}\n  "specs": ${list(manifest.specs)},\n  "inputs": ${list(manifest.inputs)}\n}\n`;
}

/** This function gives the claims of a corpus: the field `claims` of `joint-v2`, and `JOINT_V1_CLAIMS` for `joint-v1`. Its manifest stays frozen. */
export function claimsOf(manifest: JointManifest): CorpusClaims | undefined {
  return manifest.claims ?? (manifest.corpus === SET ? JOINT_V1_CLAIMS : undefined);
}

