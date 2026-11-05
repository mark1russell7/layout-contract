// The step between two epochs: the change of the raw values of the baseline arm when an engine version changes (docs/SWEEP.md, "The step between two epochs").
// Each night runs the baseline arm on each input, so the step needs no extra run.
import { documentHash, type LayoutRecord } from "@mark1russell7/layout-contract";
import { quantileSorted } from "@mark1russell7/rigor-statistics";
import type { Reference } from "./sweep.ts";

/** The raw metrics of a step. A `sweep.score` does not pair across epochs, because it depends on the reference of its epoch. */
export const STEP_METRICS: readonly string[] = Object.freeze(["joint.fill", "hard", "joint.straight.crossings"]);

/**
 * The route values of a step. The state keeps them apart from the pick values, so no verdict reads them.
 * A pack change also moves a detour, because the straight length is its denominator. A move in a detour alone is no change of a router.
 * A router that shares segments cuts `route.crossings`, so that count alone is no win.
 * The plain `joint.route.length` stays beside a detour, because its denominator does not move it. A pack change moves it too.
 */
export const STEP_ROUTE_METRICS: readonly string[] = Object.freeze(["route.detour.mean", "route.detour.q95", "joint.route.length", "route.crossings"]);

/** The 0-or-1 measure that marks a route value as an estimate from a sample. An estimate over a full count is no ratio, because an estimate can read up to 16 % off. */
const STEP_ROUTE_ESTIMATE: Readonly<Record<string, string>> = Object.freeze({ "route.crossings": "route.crossings.estimated" });

/** This function gives the route values of a record for the state, or `null` for a skipped record. A measure that the record does not have stays absent. */
export function stepValuesOf(record: LayoutRecord): Readonly<Record<string, number>> | null {
  if (record.skipped !== undefined) return null;
  const values: Record<string, number> = {};
  for (const key of [...STEP_ROUTE_METRICS, ...Object.values(STEP_ROUTE_ESTIMATE)]) {
    const value = record.measures[key];
    if (value !== undefined) values[key] = value;
  }
  return values;
}

/**
 * The hash of the list of inputs of each epoch that has no field `inputHashes`.
 * The value comes from the manifest at the commit of the last night of the epoch.
 */
export const LEGACY_INPUT_LISTS: Readonly<Record<string, string>> = Object.freeze({
  "joint-v2_packing-0.4.1_highways-0.10.0_space-bench-3": "f723607620d2c12e",
});

/** One epoch of a step: the facts of its state that a pair needs. */
export interface StepSide {
  readonly epoch: string;
  readonly inputs: readonly string[];
  /** The hash of each input, in the order of `inputs`. `null` is a hash with no proof. */
  readonly hashes: readonly (string | null)[];
  /** The config ids of the baseline arm, in the order of each `Reference`. */
  readonly baseline: readonly string[];
  readonly reference: readonly (Reference | null)[];
  /** The route values of the baseline arm, in the order of `reference`. A state from before this field has none. */
  readonly stepValues?: readonly (Reference | null)[] | undefined;
}

/** The ratios of one metric: new value over old value, for each pair. */
export interface StepMetric {
  readonly n: number;
  readonly median: number;
  readonly q10: number;
  readonly q90: number;
}

/** One route value of a step. Each count is a count of pairs that passed the rule and give no ratio for this value. */
export interface StepRouteMetric {
  /** The ratios of new value over old value, or `null` when no pair has a ratio. A `null` is no pass. */
  readonly ratio: StepMetric | null;
  /** The old epoch has no value. */
  readonly noOld: number;
  /** The old epoch has a value and the new epoch has none. */
  readonly noNew: number;
  /** The old value is zero, so a ratio has no meaning. */
  readonly oldZero: number;
  /** One side is an estimate from a sample and the other side is a full count. */
  readonly mixed: number;
}

/** The reasons that remove a pair from a step. */
export interface StepDrops {
  /** The bench space differs, so each pair drops. */
  readonly space: number;
  /** The input of the old epoch is not an input of the new epoch. */
  readonly input: number;
  /** The input has a different hash, or a hash with no proof. */
  readonly hash: number;
  /** The config of the baseline arm of the old epoch is not in the new arm. */
  readonly config: number;
  /** One of the two epochs has no value for the pair. */
  readonly missing: number;
}

/** The step between two epochs. */
export interface EpochStep {
  readonly from: string;
  readonly to: string;
  /** The count of the pairs that passed the rule. A metric can have fewer, because a ratio needs an old value above zero. */
  readonly pairs: number;
  readonly dropped: StepDrops;
  readonly metrics: Readonly<Record<string, StepMetric>>;
  /** The route values of the pairs. No pick level reads them. */
  readonly routes: Readonly<Record<string, StepRouteMetric>>;
}

/** This function gives the bench space of an epoch name. */
export function spaceOfEpoch(epoch: string): string {
  return epoch.slice(epoch.lastIndexOf("_space-") + "_space-".length);
}

/** This function gives one hash for a list of inputs. Two equal lists have equal ids and equal hashes in the same order. */
export function inputListHash(ids: readonly string[], hashes: readonly string[]): string {
  return documentHash({ schema: "sweep-input-list/1", inputs: ids.map((id, i) => [id, hashes[i]]) });
}

/**
 * This function gives the input hashes of an old state. A state with no `inputHashes` has a proof only if `LEGACY_INPUT_LISTS` names its epoch
 * with the hash of the list of today. With no proof, each hash is `null`, so each pair drops.
 */
export function hashesOfState(
  state: { readonly epoch: string; readonly inputs: readonly string[]; readonly inputHashes?: readonly string[] },
  ids: readonly string[],
  hashes: readonly string[],
): readonly (string | null)[] {
  if (state.inputHashes !== undefined) return state.inputHashes;
  const today = new Map(ids.map((id, i) => [id, hashes[i]!]));
  const proved = LEGACY_INPUT_LISTS[state.epoch] === inputListHash(ids, hashes);
  return state.inputs.map((id) => (proved ? (today.get(id) ?? null) : null));
}

interface RouteTally {
  readonly ratios: number[];
  noOld: number;
  noNew: number;
  oldZero: number;
  mixed: number;
}

function metricOf(ratios: readonly number[]): StepMetric {
  const sorted = [...ratios].sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, median: 0, q10: 0, q90: 0 };
  return { n: sorted.length, median: quantileSorted(sorted, 0.5), q10: quantileSorted(sorted, 0.1), q90: quantileSorted(sorted, 0.9) };
}

/** This function adds one pair to the tally of one route value. */
function tallyRoute(tally: RouteTally, metric: string, before: Readonly<Record<string, number>> | null | undefined, after: Readonly<Record<string, number>> | null | undefined): void {
  const [old, now] = [before?.[metric], after?.[metric]];
  const estimate = STEP_ROUTE_ESTIMATE[metric];
  if (old === undefined) tally.noOld++;
  else if (now === undefined) tally.noNew++;
  else if (estimate !== undefined && (before?.[estimate] ?? 0) !== (after?.[estimate] ?? 0)) tally.mixed++;
  else if (old <= 0) tally.oldZero++;
  else tally.ratios.push(now / old);
}

/**
 * This function gives the step from the epoch `from` to the epoch `to`. A pair is one input and one config of the baseline arm.
 * A pair counts only when the input id, the input hash, the config id and the bench space are equal. Each other pair drops, and the step counts it.
 */
export function epochStep(from: StepSide, to: StepSide): EpochStep {
  const drops = { space: 0, input: 0, hash: 0, config: 0, missing: 0 };
  const ratios: Record<string, number[]> = Object.fromEntries(STEP_METRICS.map((m) => [m, []]));
  const tallies: Record<string, RouteTally> = Object.fromEntries(STEP_ROUTE_METRICS.map((m) => [m, { ratios: [], noOld: 0, noNew: 0, oldZero: 0, mixed: 0 }]));
  const inputAt = new Map(to.inputs.map((id, i) => [id, i]));
  const configAt = new Map(to.baseline.map((id, k) => [id, k]));
  const sameSpace = spaceOfEpoch(from.epoch) === spaceOfEpoch(to.epoch);
  let pairs = 0;
  from.inputs.forEach((id, i) => {
    from.baseline.forEach((config, k) => {
      const j = inputAt.get(id);
      const c = configAt.get(config);
      const hash = from.hashes[i];
      if (!sameSpace) drops.space++;
      else if (j === undefined) drops.input++;
      else if (hash === null || hash === undefined || hash !== to.hashes[j]) drops.hash++;
      else if (c === undefined) drops.config++;
      else {
        const before = from.reference[i]?.[k];
        const after = to.reference[j]?.[c];
        if (before === null || before === undefined || after === null || after === undefined) drops.missing++;
        else {
          pairs++;
          for (const metric of STEP_METRICS) {
            const [old, now] = [before[metric], after[metric]];
            if (old !== undefined && now !== undefined && old > 0) ratios[metric]!.push(now / old);
          }
          for (const metric of STEP_ROUTE_METRICS) tallyRoute(tallies[metric]!, metric, from.stepValues?.[i]?.[k], to.stepValues?.[j]?.[c]);
        }
      }
    });
  });
  const routes = Object.fromEntries(
    STEP_ROUTE_METRICS.map((m) => {
      const { ratios: list, ...counts } = tallies[m]!;
      return [m, { ratio: list.length === 0 ? null : metricOf(list), ...counts }];
    }),
  );
  return { from: from.epoch, to: to.epoch, pairs, dropped: drops, metrics: Object.fromEntries(STEP_METRICS.map((m) => [m, metricOf(ratios[m]!)])), routes };
}
