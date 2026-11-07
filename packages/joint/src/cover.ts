// The cover of the bench: each strategy of `packing` and each router of `highways` gets pairs, with far fewer pairs than the full cross product (`docs/JOINT-BENCH.md`, "The cover of the catalogs").
import { allStrategies } from "@mark1russell7/packing";
import { BASELINE } from "./analysis.ts";
import { OPEN_ROUTERS, PACK_ENTRIES, pairId, ROUTERS, type PackEntry, type RunOptions } from "./runner.ts";

/** The routers that each new pack entry meets: the routers of the headline pairs. */
export const COVER_ROUTERS: readonly string[] = Object.freeze(["corners", "portfolio"]);

/** The pack entries that each router outside `ROUTERS` meets: the best plain entry of L11, and the composite baseline. */
export const COVER_PACKS: readonly string[] = Object.freeze(["maxrects-cp", "select"]);

/** The count of the other routers of `ROUTERS` that each new pack entry meets, in turn. */
export const COVER_TURNS = 2;

/** One strategy that no input of the joint corpora can run. */
export interface CoverException {
  readonly reason: string;
  /** The roadmap item that removes the exception. */
  readonly removedBy: string;
}

/**
 * The closed list of the strategies with no entry. A test fails when the list has another strategy, and when this strategy starts to run.
 * The list is empty since L94. The array `shapes` of `joint-v3` has circle items for `hole-degree` and `circle-quasi-physical`, and small strips for `exact-strip`.
 * On `joint-v2`, these 3 strategies skip each input, because the cell of each input is outside their supports.
 */
export const COVER_EXCEPTIONS: Readonly<Record<string, CoverException>> = Object.freeze({});

/**
 * The settings of the strategies that do not run with their defaults. The reason of each skip names the setting.
 * - `aspect-fit` needs the strategy that it wraps.
 * - `push` needs the mode `incremental`, and each input of the joint corpora has the mode `offline`.
 */
const COVER_SETTINGS: Readonly<Record<string, Pick<PackEntry, "options" | "mode">>> = Object.freeze({
  "aspect-fit": { options: { strategy: "maxrects", options: { rule: "bl" } } },
  push: { options: {}, mode: "incremental" },
});

/** This function gives the id of each strategy of `packing`, from its one list of all strategies. */
export function packStrategyIds(): string[] {
  return allStrategies.map((s) => s.id);
}

/** This function gives a pack entry for each strategy that has no entry in `PACK_ENTRIES`, without the exceptions. The list follows the registry of `packing`. */
export function coverEntries(): PackEntry[] {
  const used = new Set(PACK_ENTRIES.map((e) => e.strategy));
  return packStrategyIds()
    .filter((id) => !used.has(id) && COVER_EXCEPTIONS[id] === undefined)
    .map((id) => ({ id, strategy: id, options: {}, ...COVER_SETTINGS[id] }));
}

/** This function gives the routers that are not in `ROUTERS`. Only the pairs of `coverPairs` run them. */
export function coverRouters(): string[] {
  return OPEN_ROUTERS.filter((name) => !ROUTERS.includes(name));
}

/**
 * This function gives the pairs of the cover, without a pair of the product of `PACK_ENTRIES` and `ROUTERS`.
 * - Each new pack entry meets `COVER_ROUTERS`, and `COVER_TURNS` other routers of `ROUTERS` in turn. Thus the new entries meet each router when the list is long enough.
 * - Each new router meets `COVER_PACKS`.
 */
export function coverPairs(): string[] {
  const others = ROUTERS.filter((r) => !COVER_ROUTERS.includes(r));
  const out: string[] = [];
  coverEntries().forEach((entry, i) => {
    const turns = Array.from({ length: COVER_TURNS }, (_, t) => others[(i * COVER_TURNS + t) % others.length]!);
    for (const router of [...COVER_ROUTERS, ...turns]) out.push(pairId(entry.id, router));
  });
  for (const router of coverRouters()) for (const pack of COVER_PACKS) out.push(pairId(pack, router));
  return out;
}

/** This function gives the options of `pairRuns` for a run with the cover: the product of the bench, then the pairs of the cover. */
export function coverOptions(): Pick<RunOptions, "packs" | "routers" | "pairs"> {
  const product = PACK_ENTRIES.flatMap((entry) => ROUTERS.map((router) => pairId(entry.id, router)));
  return { packs: [...PACK_ENTRIES, ...coverEntries()], routers: [...ROUTERS, ...coverRouters()], pairs: [...product, ...coverPairs()] };
}

/**
 * This function gives the options of `pairRuns` for a run of chosen pairs of the cover. A new strategy thus does not need a whole cover run.
 * The baseline pair always runs, because the analysis compares each pair with it. An id that is not a pair of the cover stops the run.
 */
export function chosenOptions(ids: readonly string[]): Pick<RunOptions, "packs" | "routers" | "pairs"> {
  const cover = coverOptions();
  const known = new Set(cover.pairs);
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new RangeError(`These ids are not pairs of the cover: ${unknown.join(", ")}.`);
  if (ids.length === 0) throw new RangeError("Name at least one pair of the cover.");
  return { ...cover, pairs: [...new Set([BASELINE, ...ids])] };
}
