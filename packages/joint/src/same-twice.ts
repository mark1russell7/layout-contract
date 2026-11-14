// The check "same twice" of the joint records (`docs/JOINT-BENCH.md`, roadmap item L117). The runner runs each pack and each route two times.
// The field `deterministic` of a record states if the two runs gave the same hash. This module reads that field. It has no file access.
import type { LayoutRecord } from "@mark1russell7/layout-contract";

/** The most pairs that `SameTwice.differs` lists. The count `differ` holds each pair. */
export const SAME_TWICE_LIST = 20;

/** One record whose two runs gave different hashes. */
export interface SameTwiceMiss {
  readonly strategy: string;
  readonly input: string;
}

/** The counts of the field `deterministic` over the records of a run. */
export interface SameTwice {
  /** The records with `deterministic: true`: the two runs gave the same hash. */
  readonly twice: number;
  /** The records with `deterministic: false`. The check fails when this count is above 0. */
  readonly differ: number;
  /** The records with `deterministic: null` and `oneRun: true`: a single timed run, so the record makes no claim. */
  readonly oneRun: number;
  /** The records with `skipped`. They ran nothing, so they make no claim. */
  readonly skipped: number;
  /** The records with no value in the field. An old record can have no field. */
  readonly unstated: number;
  /** The first records of `differ`, in the order of the strategy and the input, at most `SAME_TWICE_LIST`. */
  readonly differs: readonly SameTwiceMiss[];
}

/** This function orders two misses by the strategy, then by the input. */
function byPair(a: SameTwiceMiss, b: SameTwiceMiss): number {
  if (a.strategy !== b.strategy) return a.strategy < b.strategy ? -1 : 1;
  return a.input < b.input ? -1 : a.input > b.input ? 1 : 0;
}

/** This function counts the field `deterministic` of the records. It is pure: the order of the records does not change the result. */
export function sameTwice(records: Iterable<LayoutRecord>): SameTwice {
  let twice = 0;
  let oneRun = 0;
  let skipped = 0;
  let unstated = 0;
  const misses: SameTwiceMiss[] = [];
  for (const r of records) {
    if (r.skipped !== undefined) skipped++;
    else if (r.deterministic === true) twice++;
    else if (r.deterministic === false) misses.push({ strategy: r.strategy, input: r.input });
    else if (r.deterministic === null && r.oneRun === true) oneRun++;
    else unstated++;
  }
  misses.sort(byPair);
  return { twice, differ: misses.length, oneRun, skipped, unstated, differs: misses.slice(0, SAME_TWICE_LIST) };
}

/** This function adds the counts of two sets of records, for example two rounds of a night. The list keeps the first pairs of both, in order. */
export function addSameTwice(a: SameTwice | undefined, b: SameTwice): SameTwice {
  if (a === undefined) return b;
  const differs = [...a.differs, ...b.differs].sort(byPair);
  return {
    twice: a.twice + b.twice,
    differ: a.differ + b.differ,
    oneRun: a.oneRun + b.oneRun,
    skipped: a.skipped + b.skipped,
    unstated: a.unstated + b.unstated,
    differs: differs.slice(0, SAME_TWICE_LIST),
  };
}

/** This function gives the result in one sentence, with the first pairs that differ. */
export function sameTwiceLine(s: SameTwice): string {
  const counts = `Same twice: ${s.twice} records, ${s.differ} differ, ${s.oneRun} with one run and no claim, ${s.skipped} skipped, ${s.unstated} with no value.`;
  if (s.differ === 0) return counts;
  const list = s.differs.map((m) => `${m.strategy} on ${m.input}`).join(", ");
  return `${counts} The check fails. The first pairs that differ: ${list}.`;
}
