// The probes of a carry at the installed engine versions (docs/JOINT-BENCH.md, section "Carry", roadmap item L147).
// A pack probe packs one input with one pack entry one time, as the pack stage of `pairRuns` does, and hashes the output, the measures and the hard counts.
// A router probe runs the pairs of one pack entry and the router on the probe inputs with `pairRuns`, and hashes the records without the times.
import { probeHash, REFUSED_PROBE, type LayoutInput } from "@mark1russell7/layout-contract";
import { checkHard, measure, outputHash as packHash, packWith, strategy as packStrategy, unsupportedOf } from "@mark1russell7/packing";
import { CARRY_PROBE_SCHEMA, isTimeMeasure, packKey, routerFingerprint, type CarryProbe } from "./carry.ts";
import { packInputOf, pairRuns, readsLinks, routerEntryOf, type PackEntry, type RouterEntry } from "./runner.ts";

/**
 * This function gives the hash of the pack of one input with one pack entry.
 * It hashes the pack hash, the measures and the hard counts, as the pack stage of `pairRuns` gives them.
 * It leaves out the time measures of `isTimeMeasure`, for example `pack.search.ms` of a size search. Thus two probes of one pack give one hash.
 * It gives `REFUSED_PROBE` when the strategy does not support the cell of the input, or when the pack throws. Then the pair of the run has no measures.
 */
export function packProbe(entry: PackEntry, input: LayoutInput, cell: Readonly<Record<string, unknown>> | undefined): string {
  const s = packStrategy(entry.strategy);
  if (cell !== undefined && unsupportedOf(s.supports, { ...(cell as Record<string, string>), groups: "none", ...(entry.mode === undefined ? {} : { mode: entry.mode }) }) !== undefined) {
    return REFUSED_PROBE;
  }
  const score = packInputOf(input);
  const packInput = readsLinks(entry) ? packInputOf(input, { links: true }) : score;
  return probeHash(
    () => {
      const output = packWith(entry.strategy, packInput, entry.options, input.seed ?? 0);
      const hard = Object.fromEntries(Object.entries(checkHard(score, output, undefined, { exactContainer: true })).map(([k, v]) => [`pack.${k}`, v]));
      const measures = Object.fromEntries(Object.entries(measure(score, output)).filter(([name]) => !isTimeMeasure(name)));
      return { hash: packHash(output), measures, hard };
    },
    () => true,
  );
}

/** One input of a probe, with the cell of its manifest entry. */
export interface ProbeInput {
  readonly input: LayoutInput;
  readonly cell?: Readonly<Record<string, unknown>>;
}

/** The facts of one probe job, for `carryProbe`. */
export interface ProbeOptions {
  readonly corpus: string;
  /** The version of each engine of this process, by name. */
  readonly engines: Readonly<Record<string, string>>;
  /** The pack entries of the run. */
  readonly packs: readonly PackEntry[];
  /** The inputs of the pack probes: each input of the run, or the inputs of one shard of the probe job. */
  readonly inputs: readonly ProbeInput[];
  /** The routers of the run. Without routers, the probe has no router fingerprints: the other shards of the probe job give them. */
  readonly routers?: readonly (string | RouterEntry)[];
  /** The inputs of the router probes. `routerPack` packs them. */
  readonly routerInputs?: readonly ProbeInput[];
  /** The pack entry of the router probes. */
  readonly routerPack?: PackEntry;
  /** The probe uses this function after each probe, for the progress of a job. */
  readonly onProbe?: (kind: "pack" | "router", id: string) => void;
}

/**
 * This function gives the probe document of the installed engines.
 * It holds a pack fingerprint of each pack entry on each input, and a router fingerprint of each router over the router inputs.
 */
export function carryProbe(options: ProbeOptions): CarryProbe {
  const packs: Record<string, string> = {};
  for (const { input, cell } of options.inputs) {
    for (const entry of options.packs) {
      packs[packKey(entry.id, input.id)] = packProbe(entry, input, cell);
      options.onProbe?.("pack", `${entry.id} ${input.id}`);
    }
  }
  const routers: Record<string, string> = {};
  const routerInputs = options.routerInputs ?? [];
  if ((options.routers?.length ?? 0) > 0) {
    if (options.routerPack === undefined || routerInputs.length === 0) throw new RangeError("A router probe needs routerPack and routerInputs.");
    for (const router of options.routers ?? []) {
      const id = routerEntryOf(router).id;
      const records = routerInputs.flatMap(({ input, cell }) => [...pairRuns(input, cell, { packs: [options.routerPack!], routers: [router], corpus: options.corpus, freeRoutes: true })].map((run) => run.record));
      routers[id] = routerFingerprint(records);
      options.onProbe?.("router", id);
    }
  }
  return { schema: CARRY_PROBE_SCHEMA, corpus: options.corpus, engines: options.engines, packs, routers };
}

/**
 * This function gives the strategy and the full options of each pack entry, as the records hold them.
 * The full options are the defaults of the installed strategy and the options of the entry.
 */
export function packFacts(entries: readonly PackEntry[]): Map<string, { readonly strategy: string; readonly options: Readonly<Record<string, unknown>> }> {
  return new Map(entries.map((entry) => [entry.id, { strategy: entry.strategy, options: { ...(packStrategy(entry.strategy).defaults as Record<string, unknown>), ...entry.options } }]));
}
