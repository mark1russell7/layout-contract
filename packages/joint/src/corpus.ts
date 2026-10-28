import { documentHash, EDGE_STEP_VERSION, edgeStep, type EdgeStepParams, type LayoutInput } from "@mark1russell7/layout-contract";
import { generator, type CorpusCell, type GeneratorParams } from "@mark1russell7/packing";
import { pairwise, type Dimensions, type Row } from "./pairwise.ts";

/** The name of the corpus. Each input has it in `set`. */
export const SET = "joint-v1";

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

/** The cases of `edge-cases` outside the arrays. They have the edges `random` and `medium`. */
export const FIXED_CASES: readonly string[] = Object.freeze(["empty", "one", "oversize"]);

/** The cell of a joint input: the cell of `packing`, with the 4 dimensions of the edges. `edgeShape` can be `hubs`. */
export type JointCell = Omit<CorpusCell, "groups"> & Pick<EdgeParams, "edgeDensity" | "edgeShape" | "groups" | "ports">;

/** The stamp of the step `edges` in a spec. */
export interface EdgesStamp {
  readonly name: "edges";
  readonly version: number;
  readonly params: EdgeParams;
}

/** One spec of the corpus: the base generator with its full parameters, the step `edges` and the seeds. */
export interface JointSpec {
  /** The array of the spec: `grid`, `ui`, or `fixed` for a case of `edge-cases`. */
  readonly array: "grid" | "ui" | "fixed";
  readonly generator: string;
  readonly version: number;
  readonly params: GeneratorParams;
  readonly steps: readonly [EdgesStamp];
  readonly seeds: readonly number[];
}

/** One input in the index of the manifest. */
export interface JointEntry {
  readonly id: string;
  readonly hash: string;
  readonly cell: JointCell;
}

/** The manifest `corpus.json` of the corpus: `layout-corpus/1`, with the step `edges` in each spec. */
export interface JointManifest {
  readonly schema: "layout-corpus/1";
  readonly corpus: string;
  readonly specs: readonly JointSpec[];
  readonly inputs: readonly JointEntry[];
}

/** The corpus: the manifest and the input files, in the order of the specs and the seeds. */
export interface JointCorpus {
  readonly manifest: JointManifest;
  readonly inputs: readonly LayoutInput[];
}

/** This function gives the full parameters of `edgeStep` of a row. */
function edgesOf(row: Row): EdgeParams {
  return {
    edgeDensity: row["edgeDensity"] as EdgeParams["edgeDensity"],
    edgeShape: row["edgeShape"] as EdgeParams["edgeShape"],
    groups: row["groups"] as EdgeParams["groups"],
    ports: row["ports"] as EdgeParams["ports"],
    hubBy: "area",
  };
}

/** This function gives a spec with the full parameters of its generator. */
function specOf(array: JointSpec["array"], name: string, params: GeneratorParams, edges: EdgeParams): JointSpec {
  const gen = generator(name);
  return {
    array,
    generator: gen.name,
    version: gen.version,
    params: gen.withDefaults(params),
    steps: [{ name: "edges", version: EDGE_STEP_VERSION, params: edges }],
    seeds: [...SEEDS],
  };
}

/**
 * This function gives the specs of the corpus. The rows of the array `grid` come first, then the rows of the array `ui`, then the fixed cases.
 * The arrays come from `pairwise` with `ARRAY_SEED`.
 */
export function jointSpecs(): JointSpec[] {
  const grid = pairwise(GRID_DIMENSIONS, ARRAY_SEED).map((row) =>
    specOf(
      "grid",
      "rect-grid",
      { containerSize: row["containerSize"]!, containerShape: row["containerShape"]!, obstacles: row["obstacles"]!, sizes: row["sizes"]!, count: COUNTS[row["count"]!]! },
      edgesOf(row),
    ),
  );
  const ui = pairwise(UI_DIMENSIONS, ARRAY_SEED).map((row) => specOf("ui", row["family"]!, { containerSize: row["containerSize"]! }, edgesOf(row)));
  const fixed = FIXED_CASES.map((c) => specOf("fixed", "edge-cases", { case: c }, edgesOf({ edgeDensity: "medium", edgeShape: "random", groups: "none", ports: "free" })));
  return [...grid, ...ui, ...fixed];
}

/** This function gives the part of the family that tells the edges, for example `e-medium.clustered.flat.sides`. */
export function edgeFamily(edges: EdgeParams): string {
  return `e-${edges.edgeDensity}.${edges.edgeShape}.${edges.groups}.${edges.ports}`;
}

/** This function gives the hash of an input file. It is `documentHash` of `@mark1russell7/layout-contract`. */
export function hashOf(file: LayoutInput): string {
  return documentHash(file);
}

/**
 * This function gives the corpus `joint-v1`. The same version of the packages gives the same files, byte for byte.
 * For each spec and seed, the generator of `packing` gives the base input, and `edgeStep` adds the edges with the same seed.
 * The id is `joint-v1/<family>/s<seed>`. The family is the family of `packing` and the part of the edges.
 */
export function jointCorpus(): JointCorpus {
  const specs = jointSpecs();
  const inputs: LayoutInput[] = [];
  const entries: JointEntry[] = [];
  const ids = new Set<string>();
  for (const spec of specs) {
    const gen = generator(spec.generator);
    const edges = spec.steps[0].params;
    const cell: JointCell = { ...gen.cell(spec.params), edgeDensity: edges.edgeDensity, edgeShape: edges.edgeShape, groups: edges.groups, ports: edges.ports };
    for (const seed of spec.seeds) {
      const base = gen.generate(seed, spec.params, SET);
      const family = `${base.family}.${edgeFamily(edges)}`;
      const id = `${SET}/${family}/s${seed}`;
      if (ids.has(id)) throw new RangeError(`The corpus has 2 inputs with the id "${id}".`);
      ids.add(id);
      const withEdges: LayoutInput = { ...edgeStep(base, edges, seed), id, family };
      const file: LayoutInput = { ...withEdges, hash: hashOf(withEdges) };
      inputs.push(file);
      entries.push({ id, hash: file.hash!, cell });
    }
  }
  return { manifest: { schema: "layout-corpus/1", corpus: SET, specs, inputs: entries }, inputs };
}

/** This function gives the text of a manifest: one line for each spec and for each input, and a newline at the end. */
export function manifestJson(manifest: JointManifest): string {
  const list = (items: readonly unknown[]): string => (items.length === 0 ? "[]" : `[\n${items.map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ]`);
  return `{\n  "schema": ${JSON.stringify(manifest.schema)},\n  "corpus": ${JSON.stringify(manifest.corpus)},\n  "specs": ${list(manifest.specs)},\n  "inputs": ${list(manifest.inputs)}\n}\n`;
}

