import type { Tolerance } from "./tolerance.ts";
import type { LayoutInput } from "./input.ts";

/** The stage of a record: the packer, the router, or both together. */
export type Stage = "pack" | "route" | "joint";

/** One run of one strategy on one input and seed: the format `layout-record/1`. A run writes one line of JSON Lines. */
export interface LayoutRecord {
  readonly schema: "layout-record/1";
  readonly stage: Stage;
  readonly step: string;
  readonly strategy: string;
  /** The options in full, with the defaults. */
  readonly options: Readonly<Record<string, unknown>>;
  readonly corpus: string;
  /** The id of the input. */
  readonly input: string;
  /** The `hash` of the input file. */
  readonly inputHash: string;
  readonly set: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  /** The value of each measure, by its name: `pack.*`, `route.*` or `joint.*`. */
  readonly measures: Readonly<Record<string, number>>;
  /** The count of the breaks of each hard rule. A good run has 0 for each rule. */
  readonly hard: Readonly<Record<string, number>>;
  /** The tolerance of each hard rule of the run. */
  readonly tolerance?: Readonly<Partial<Tolerance>>;
  /** `true` when two runs with the same seed give the same positions. */
  readonly deterministic: boolean;
  /** The id of the prediction that was written before the run. */
  readonly prediction?: string;
  readonly ms: number;
  /** The reason when the strategy did not run, for example an input over its `maxNodes`. Then the record has no measures. */
  readonly skipped?: string;
  readonly commit?: string;
}

/**
 * The values that a strategy supports, for each dimension of a taxonomy.
 * The dimension names are in `docs/FORMAT.md` of `packing` and `docs/LAYOUT-RECORDS.md` of `highways`.
 */
export type Supports = Readonly<Record<string, readonly string[]>>;

/** The facts of a run that the input does not give. */
export type RunFacts = Omit<LayoutRecord, "schema" | "input" | "inputHash" | "set" | "nodes" | "edges">;

/** This function gives the record of a run. The input gives its id, its hash, its set and the counts of the nodes and the edges. */
export function toLayoutRecord(input: LayoutInput, run: RunFacts): LayoutRecord {
  return {
    schema: "layout-record/1",
    ...run,
    input: input.id,
    inputHash: input.hash ?? "",
    set: input.set ?? "",
    nodes: input.boxes.length,
    edges: input.edges?.length ?? 0,
  };
}
