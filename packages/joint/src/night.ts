// The state of the sweep and the steps of one night (`docs/SWEEP.md`): plan round 1, apply the records, race, plan round 2.
// The state is one JSON object. The workflow keeps it on the data branch `sweep-data`, and the script `scripts/sweep.mjs` reads and writes it.
import { configId, type LayoutRecord, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { stepValuesOf } from "./epoch-step.ts";
import type { CensoredUnit } from "./shard-stop.ts";
import { addSameTwice, sameTwice, type SameTwice } from "./same-twice.ts";
import { saltelliDesign, type SaltelliDesign } from "./sensitivity.ts";
import { configRun, JOINT_SPACE, spaceFingerprint, type ConfigRun } from "./space.ts";
import {
  addToSummary,
  BASELINE_ARM,
  baselineIds,
  INCUMBENT,
  jobCost,
  nightSeed,
  pickOf,
  planRound,
  race,
  rowKey,
  sampleConfigs,
  SCREEN_SHARE,
  screenInputs,
  strataCounts,
  SWEEP_FILL,
  SWEEP_SCHEMA,
  sweepValue,
  takeBudget,
  takeFitting,
  unitsOf,
  type ConfigStatus,
  type RaceOutcome,
  type RaceSigns,
  type Reference,
  type RoundPlan,
  type SummaryRow,
  type SweepInput,
  type SweepJob,
} from "./sweep.ts";

/** The origin of the label of a config: the race that gave it, and the night of that race. */
export interface LabelOrigin {
  /** `screen` is the race on the screen inputs. `race` is the full race on each input. */
  readonly kind: "screen" | "race";
  readonly night: string;
}

/** One config in the state. */
export interface ConfigEntry {
  readonly config: StrategyConfig;
  status: ConfigStatus;
  /** The date of the night that added the config. */
  readonly first: string;
  /** The date of the last race of the config, its label and its stratified mean against the incumbent. */
  decided?: string;
  label?: string;
  /** The origin of the label. A state from before this field has none. */
  labelFrom?: LabelOrigin;
  mean?: number;
  /** The mean of the inputs, `agree` and the sign test of the family signs of the last race (L37). A state before L37 has none. */
  pooled?: number;
  agree?: boolean;
  signs?: RaceSigns;
  /**
   * The date of the last night that gave a record of the config. The plans rotate: the config with the oldest date comes first.
   * A config that a stopped shard did not run keeps its old date, so it comes first on the next night. The atlas shows the age of each result.
   */
  ran?: string;
  /** The planned pairs of this config that gave no value by the end of a night, by input. A value clears the entry. A state from before L116 has none. */
  misses?: Record<string, PairMiss>;
  /** The nights that a plan left this config out while it had inputs to run. A plan that gives it a pair clears this list. */
  waited?: readonly string[];
  /** The censored rows of this config, by input (`noteMisses`). No row is a value, so the input does not count for this config. */
  censored?: Record<string, CensoredRow>;
}

/** The nights that planned one pair and got no value from it, and the largest lower bound of its time. */
export interface PairMiss {
  readonly nights: readonly string[];
  /** The lower bound of the time of the unit of a stopped shard. A pair with no such stop has `null`. */
  readonly atLeastMs: number | null;
}

/** The row of one input that a config did not get a value for on `MISS_BOUND` nights that planned it. The score of a skipped record is 0, so 0 is its bound on the score. */
export interface CensoredRow extends PairMiss {
  readonly input: string;
  readonly tag: "censored";
  readonly reason: LostReason;
}

/** The count of the planned nights with no value that gives a pair its censored row. A night that does not plan the pair does not add to the count and does not clear it. */
export const MISS_BOUND = 2;

/**
 * The nights that a plan can leave out a config with inputs to run. The config then goes first in the next plan. A config that the next plan also leaves out reads "no read".
 * On 3 of the 4 saved nights each alive config with missing inputs had a plan. Thus a rotation took 1 night, and this limit is 2 rotations.
 */
export const WAIT_BOUND = 2;

/** The largest share of the inputs with a censored row in a full race. Over it, the config reads "no read". `docs/SWEEP.md` tells how this share was chosen. */
export const CENSORED_SHARE = 0.005;

/** This function gives the largest count of censored rows that a config can have in a race on a count of inputs. */
export function censoredLimit(inputs: number): number {
  return Math.max(1, Math.round(inputs * CENSORED_SHARE));
}

/** The facts of one round of a night. */
export interface RoundFacts {
  readonly configs: number;
  /** The configs that the round adds to the state. */
  readonly sampled: number;
  readonly jobs: number;
  readonly units: number;
  readonly shards: number;
  /** The planned minutes of the round and of its longest shard. */
  readonly minutes: number;
  readonly longest: number;
}

/** One config that the race of a night held out, because values are missing. The config stays in the state, and round 2 plans the missing inputs. */
export interface HeldConfig {
  readonly config: string;
  readonly status: "screened" | "alive";
  /** The inputs of the race with no value, and the inputs of that race. */
  readonly missing: number;
  readonly of: number;
  readonly reason: string;
  /** The rows of this config pass the limit, or leave it no input to plan, so no plan can bring it to the race. A page gives it no effect. */
  readonly noRead?: true;
}

/** The facts of the race of a night. */
export interface RaceFacts {
  /** The screened configs of the race, and the counts of their outcomes. */
  readonly raced: number;
  readonly dropped: number;
  readonly halved: number;
  readonly alive: number;
  /** The alive configs with each input, and the count of them that the verdict drops. */
  readonly full: number;
  readonly fullDropped: number;
  /** The alive configs at the start of the race, and the configs that the race held out. A night from before L115 has neither. */
  readonly aliveAtStart?: number;
  readonly held?: readonly HeldConfig[];
  /** The configs of the full race with censored rows. A night with none has no field. */
  readonly withRows?: number;
}

/** The counts of the planned pairs of one round that gave no value. */
export interface LostCounts {
  readonly planned: number;
  /** The pairs with no record, the pairs with a record and no reference for their input, and the pairs of a censored unit. */
  readonly noRecord: number;
  readonly noReference: number;
  readonly censored: number;
}

/** The reason for one planned pair that gave no value. */
export type LostReason = "no-record" | "no-reference" | "censored";

/** One planned pair of a round that gave no value. */
export interface LostPair {
  readonly config: string;
  readonly input: string;
  readonly reason: LostReason;
}

/** The configs that a plan left with inputs to run, and the count of those pairs. */
/** The open configs at the end of an epoch. A new epoch starts with the baseline arm only, so these configs do not go on. */
export interface EpochEnd {
  readonly epoch: string;
  /** The screened and alive configs with an input that has no value and no row. */
  readonly open: number;
  /** The open configs that a plan left out on the last nights. An epoch from before the field reads null. */
  readonly leftOut: number | null;
}

export interface WaitingCounts {
  readonly configs: number;
  readonly pairs: number;
  /** The pairs and the distinct inputs with a cost over the whole budget of the round. Such a pair gets no plan and no miss. */
  readonly overBudgetPairs?: number;
  readonly overBudgetInputs?: number;
  /** True for a round where a backlog gave no fresh configs. */
  readonly noFresh?: boolean;
}

/** One night in the state. */
export interface NightEntry {
  readonly date: string;
  readonly seed: number;
  run?: string;
  round1?: RoundFacts;
  race?: RaceFacts;
  round2?: RoundFacts;
  /** The count of the inputs where a config of the baseline arm has another score than on an earlier night. The runs are deterministic, so 0 is the expected value. */
  drift: number;
  /** The counts of the check "same twice" over the records of the rounds (L117). A night from before L117 has none. */
  sameTwice?: SameTwice;
  /** The jobs that gave a value, and the planned pairs that gave no value by the end of the night (`LOST_METHOD_NOTE` of `night-check.ts` gives the older form). */
  values: number;
  missing: number;
  /** The counts of each round. A night from before L115 has none. */
  lost?: { rounds: Record<string, LostCounts> };
  /** The keys of the lost pairs between the rounds, as `<config>|<input>`. The summary removes this field. */
  pending?: string[];
  /** The configs and the pairs of each round that had no place in the budget. A night from before L116 has none. */
  waiting?: Record<string, WaitingCounts>;
  /** The kept records that gave a value on this night, after the reference of their input returned. A night with none has no field. */
  kept?: number;
  /** The end of the epoch before this one, on the first night of an epoch. */
  epochBefore?: EpochEnd;
  /** The planned and the real minutes of each shard. A stop writes the censored row of the unit in progress. */
  shards: { round: number; shard: number; planned: number; real: number; elapsedMinutes?: number; censored?: CensoredUnit }[];
}

/** The state of the sweep in one epoch: one corpus, one version of each engine and one version of the space. */
export interface SweepState {
  readonly schema: typeof SWEEP_SCHEMA;
  readonly epoch: string;
  readonly corpus: string;
  /** The ids of the inputs, in the order of the corpus. The arrays of `values` and `reference` have this order. */
  readonly inputs: readonly string[];
  /** The hash of each input, in the same order. A state of an epoch from before this field has none. */
  readonly inputHashes?: readonly string[];
  readonly configs: Record<string, ConfigEntry>;
  /** The `sweep.score` of each config with the status `baseline`, `screened` or `alive` on each input. `null` is no run. */
  readonly values: Record<string, (number | null)[]>;
  /** The pick values of the baseline arm on each input, as the last night gave them. */
  readonly reference: (Reference | null)[];
  /** The route values of the baseline arm on each input, for the step between two epochs. No verdict reads them. A state from before this field gets it at its first record. */
  stepValues?: (Reference | null)[];
  /** The fingerprint of the space of the epoch (`spaceFingerprint`, L133). A state from before this field gets it at its next plan. */
  spaceFingerprint?: string;
  readonly summary: SummaryRow[];
  readonly nights: NightEntry[];
  /** The Saltelli designs of the design nights (`planDesign`). The race keeps the values of their configs. */
  designs?: SaltelliDesign[];
}

/** This function gives a new state with the configs of the baseline arm. */
export function emptyState(epoch: string, corpus: string, inputs: readonly SweepInput[], space: StrategySpace = JOINT_SPACE, date = "1970-01-01"): SweepState {
  const configs: Record<string, ConfigEntry> = {};
  const values: Record<string, (number | null)[]> = {};
  for (const name of BASELINE_ARM) {
    const config = space.named![name]!;
    const id = configId(space, config);
    configs[id] = { config, status: "baseline", first: date };
    values[id] = inputs.map(() => null);
  }
  const hashes = inputs.flatMap((i) => (i.hash === undefined ? [] : [i.hash]));
  return { schema: SWEEP_SCHEMA, epoch, corpus, inputs: inputs.map((i) => i.id), ...(hashes.length === inputs.length ? { inputHashes: hashes } : {}), configs, values, reference: inputs.map(() => null), spaceFingerprint: spaceFingerprint(space), summary: [], nights: [] };
}

/**
 * This function examines the space of a state before a plan (L133). A state from before the field gets the fingerprint of the space.
 * A state with another fingerprint causes an error: the space changed, but the epoch key did not. Then the space takes a new `BENCH_SPACE_VERSION`.
 */
export function checkStateSpace(state: SweepState, space: StrategySpace = JOINT_SPACE): void {
  const now = spaceFingerprint(space);
  if (state.spaceFingerprint === undefined) state.spaceFingerprint = now;
  else if (state.spaceFingerprint !== now)
    throw new Error(`The epoch ${state.epoch} has the space ${state.spaceFingerprint}, but the space of this run is ${now}. A change of the space takes a new BENCH_SPACE_VERSION, so that a new epoch starts.`);
}

/** The options of a plan of a round. */
export interface PlanOptions {
  readonly date: string;
  /** The target of the planned cost of a shard, in milliseconds. */
  readonly target: number;
  readonly maxShards: number;
  /** The largest count of new configs of the round. */
  readonly maxConfigs: number;
  /** The largest planned cost of a unit, in milliseconds. The default is a quarter of `target`. */
  readonly maxUnit?: number;
  readonly space?: StrategySpace;
}

/** The plan of a round: the plan of the shards, and the config and the run of each config of the plan. */
export interface NightPlan {
  readonly round: 1 | 2;
  readonly date: string;
  readonly plan: RoundPlan;
  readonly configs: Readonly<Record<string, StrategyConfig>>;
  readonly runs: Readonly<Record<string, ConfigRun>>;
  readonly facts: RoundFacts;
}

/** This function gives the index of each input id of the state. */
function indexOf(state: SweepState): Map<string, number> {
  return new Map(state.inputs.map((id, i) => [id, i]));
}

/** This function gives the night entry of a date, and adds it when it is new. */
export function nightOf(state: SweepState, date: string): NightEntry {
  let night = state.nights.find((n) => n.date === date);
  if (night === undefined) {
    night = { date, seed: nightSeed(date), drift: 0, values: 0, missing: 0, shards: [] };
    state.nights.push(night);
  }
  return night;
}

/**
 * This function gives each planned pair of a round that gave no value. The caller reads it after `applyRecords` and before the race.
 * A record of an input with no reference gives no value (`applyRecords`), so a count of records alone does not see that pair.
 */
export function lostPairs(
  state: SweepState,
  units: readonly { readonly input: string; readonly configs: readonly string[] }[],
  records: readonly { readonly strategy: string; readonly input: string }[],
  censored: ReadonlySet<string> = new Set(),
): LostPair[] {
  const at = indexOf(state);
  const seen = new Set(records.map((r) => `${r.strategy}|${r.input}`));
  const lost: LostPair[] = [];
  for (const unit of units) {
    const i = at.get(unit.input);
    for (const config of unit.configs) {
      const key = `${config}|${unit.input}`;
      if (!seen.has(key)) {
        lost.push({ config, input: unit.input, reason: censored.has(key) ? "censored" : "no-record" });
        continue;
      }
      const value = i === undefined ? null : state.values[config]?.[i];
      if (value === null || value === undefined) lost.push({ config, input: unit.input, reason: "no-reference" });
    }
  }
  return lost;
}

/** This function gives the records that `applyRecords` read and kept out of each value: a known config on an input with no reference. */
export function noReferenceRecords<R extends { readonly strategy: string; readonly input: string }>(state: SweepState, records: readonly R[]): R[] {
  const at = indexOf(state);
  return records.filter((r) => {
    const i = at.get(r.input);
    if (i === undefined || state.configs[r.strategy] === undefined) return false;
    const reference = state.reference[i];
    return reference === null || reference === undefined;
  });
}

/**
 * This function adds the lost pairs of a round to a night. `night.missing` counts each planned pair with no value by this round.
 * A later round that runs a lost pair and gets its value takes it off the count. A pair that a round does not plan again stays on the count.
 */
export function noteLost(
  night: NightEntry,
  round: number,
  units: readonly { readonly input: string; readonly configs: readonly string[] }[],
  lost: readonly LostPair[],
): void {
  const count = (reason: LostReason): number => lost.filter((p) => p.reason === reason).length;
  const planned = units.reduce((n, u) => n + u.configs.length, 0);
  night.lost = { rounds: { ...night.lost?.rounds, [round]: { planned, noRecord: count("no-record"), noReference: count("no-reference"), censored: count("censored") } } };
  const lostNow = new Set(lost.map((p) => `${p.config}|${p.input}`));
  const plannedNow = new Set(units.flatMap((u) => u.configs.map((c) => `${c}|${u.input}`)));
  const pending = [...(night.pending ?? []).filter((key) => !plannedNow.has(key)), ...lostNow];
  night.pending = pending;
  night.missing = pending.length;
}

/** This function removes the empty maps of a config, so a config with no miss has the form of a state from before L116. */
function tidyMisses(entry: ConfigEntry): void {
  if (entry.misses !== undefined && Object.keys(entry.misses).length === 0) delete entry.misses;
  if (entry.censored !== undefined && Object.keys(entry.censored).length === 0) delete entry.censored;
}

/**
 * This function clears the misses and the rows that have no cause at this time.
 * A value clears both. A row with the reason `no-reference` clears when its reference returns, so the next plan has the pair again.
 */
export function settleRows(state: SweepState): void {
  const at = indexOf(state);
  for (const [id, entry] of Object.entries(state.configs)) {
    for (const input of Object.keys(entry.misses ?? {})) {
      const i = at.get(input);
      const hasValue = i !== undefined && state.values[id]?.[i] !== null && state.values[id]?.[i] !== undefined;
      const back = entry.censored?.[input]?.reason === "no-reference" && i !== undefined && state.reference[i] !== null && state.reference[i] !== undefined;
      if (!hasValue && !back) continue;
      delete entry.misses![input];
      if (entry.censored !== undefined) delete entry.censored[input];
    }
    tidyMisses(entry);
  }
}

/**
 * This function adds the lost pairs of a night to their misses, and writes a censored row for each pair at `MISS_BOUND` nights. The caller reads it at the end of a night, before `pending` goes.
 * The baseline arm gets no rows: the reference of an input reads its records.
 */
export function noteMisses(state: SweepState, night: NightEntry): void {
  const at = indexOf(state);
  const bounds = new Map<string, number>();
  for (const s of night.shards) {
    if (s.censored === undefined) continue;
    for (const c of s.censored.configs) bounds.set(`${c}|${s.censored.input}`, Math.max(s.censored.atLeastMs, bounds.get(`${c}|${s.censored.input}`) ?? 0));
  }
  for (const key of night.pending ?? []) {
    const cut = key.indexOf("|");
    const [config, input] = [key.slice(0, cut), key.slice(cut + 1)];
    const entry = state.configs[config];
    if (entry === undefined || (entry.status !== "screened" && entry.status !== "alive")) continue;
    const prior = entry.misses?.[input];
    if (prior?.nights.includes(night.date) === true) continue;
    const bound = bounds.get(key) ?? null;
    const atLeastMs = prior?.atLeastMs === null || prior?.atLeastMs === undefined ? bound : Math.max(prior.atLeastMs, bound ?? 0);
    const miss: PairMiss = { nights: [...(prior?.nights ?? []), night.date], atLeastMs };
    (entry.misses ??= {})[input] = miss;
    if (miss.nights.length < MISS_BOUND) continue;
    const i = at.get(input);
    const reference = i === undefined ? null : state.reference[i];
    const reason: LostReason = reference === null || reference === undefined ? "no-reference" : bounds.has(key) ? "censored" : "no-record";
    (entry.censored ??= {})[input] = { input, tag: "censored", reason, ...miss };
  }
  settleRows(state);
}

/**
 * This function gives a value to each kept record whose reference has returned, and gives the count. A config of the baseline arm or a config with no values takes no value.
 * The value is a score and no time: `ms` is not read, and the summary gets no row, because a time needs its own run. The file of the kept records is one for each epoch, so the name of the epoch states its engines and its space.
 * After the values, this function clears the rows that have no cause at this time.
 */
export function applyKept(state: SweepState, kept: readonly { readonly record: LayoutRecord }[], date: string): number {
  const at = indexOf(state);
  let added = 0;
  for (const { record } of kept) {
    const i = at.get(record.input);
    const entry = state.configs[record.strategy];
    const values = state.values[record.strategy];
    if (i === undefined || values === undefined || (entry?.status !== "screened" && entry?.status !== "alive")) continue;
    const reference = state.reference[i];
    if (reference === null || reference === undefined || (values[i] !== null && values[i] !== undefined)) continue;
    values[i] = Number(sweepValue(record, reference).score.toFixed(6));
    added++;
  }
  if (added > 0) nightOf(state, date).kept = added;
  settleRows(state);
  return added;
}

/** This function gives the lines of the censored rows of a state. A config reads these rows, and not a blank. */
export function censoredLines(state: SweepState): string[] {
  const rows = Object.entries(state.configs).flatMap(([id, c]) => (c.status === "screened" || c.status === "alive" ? Object.values(c.censored ?? {}).map((row) => ({ id, row })) : []));
  if (rows.length === 0) return ["Censored rows: 0."];
  const limit = censoredLimit(state.inputs.length);
  const lines = [
    `Censored rows: ${rows.length}, on ${new Set(rows.map((r) => r.id)).size} configs. A row never counts for its config. A config with more than ${limit} rows reads "no read".`,
    "",
    "| Config | Input | Reason | Nights that planned it | At least |",
    "|---|---|---|---|---|",
  ];
  for (const { id, row } of rows) lines.push(`| \`${id}\` | \`${row.input}\` | ${row.reason} | ${row.nights.join(", ")} | ${row.atLeastMs === null ? "no bound read" : `${(row.atLeastMs / 60000).toFixed(1)} min`} |`);
  return lines;
}

/** This function gives the line of the pairs of a night that had no place in the budget. */
export function waitingLine(night: Pick<NightEntry, "waiting">): string {
  const rounds = Object.entries(night.waiting ?? {}).map(([round, w]) => `round ${round}: ${w.configs} configs, ${w.pairs} pairs, ${w.overBudgetPairs ?? 0} pairs over the whole budget on ${w.overBudgetInputs ?? 0} inputs${w.noFresh === true ? ", no fresh configs" : ""}`);
  return `Waiting for the budget: ${rounds.length === 0 ? "not read" : rounds.join("; ")}.`;
}

/** This function reads the end of an epoch from its state. */
export function epochEnd(state: SweepState): EpochEnd {
  const open = Object.entries(state.configs).filter(([id, c]) => {
    if (c.status !== "screened" && c.status !== "alive") return false;
    const values = state.values[id];
    return state.inputs.some((input, i) => (values?.[i] ?? null) === null && c.censored?.[input] === undefined);
  });
  const read = state.nights.some((n) => n.waiting !== undefined);
  return { epoch: state.epoch, open: open.length, leftOut: read ? open.filter(([, c]) => (c.waited?.length ?? 0) > 0).length : null };
}

/** This function gives the line of the end of the epoch before a night, or no line after the first night of an epoch. */
export function epochEndLines(night: Pick<NightEntry, "epochBefore">): string[] {
  const end = night.epochBefore;
  if (end === undefined) return [];
  return [`The epoch \`${end.epoch}\` ended with ${end.open} open configs, and a plan left out ${end.leftOut ?? "a count not read"} of them. A new epoch carries no config and no age.`, ""];
}

/** This function gives the age of each config that a plan left out. It also gives the count of the rounds where a backlog gave no fresh configs. */
export function waitAgeLines(state: SweepState): string[] {
  const noFresh = state.nights.flatMap((n) => Object.values(n.waiting ?? {})).filter((w) => w.noFresh === true).length;
  const rows = Object.entries(state.configs)
    .filter(([, c]) => (c.status === "screened" || c.status === "alive") && (c.waited?.length ?? 0) > 0)
    .sort(([a, x], [b, y]) => y.waited!.length - x.waited!.length || (a < b ? -1 : 1));
  const lines = [`Rounds of this epoch where a backlog gave no fresh configs: ${noFresh}.`];
  if (rows.length === 0) return [...lines, "Configs that a plan left out: 0."];
  lines.push(`Configs that a plan left out: ${rows.length}. After ${WAIT_BOUND} nights a config goes first in the next plan. After ${WAIT_BOUND + 1} nights it reads no read.`, "", "| Config | Status | Nights left out | Nights |", "|---|---|---|---|");
  for (const [id, c] of rows) lines.push(`| \`${id}\` | ${c.status} | ${c.waited!.length} | ${c.waited!.join(", ")} |`);
  return lines;
}

/** The note on the race of 2026-11-02. It stays in each summary, because the summary of that night printed the 3 labels with no mark. */
export const RACE_NOTE_2026_11_02 =
  "The summary of the night 2026-11-02 printed `full: 0`, `Jobs without a record: 0`, and 3 held configs with the label `better` and no mark. Run 41442420950 printed it, after the first summarize job of run 41384329446 stopped on an error. These 3 labels came from the screen of 2026-11-01. The 13 alive configs of that night each had 12 or 13 inputs with no value.";

/** This function gives the lines of the race of a night. A night with nothing to race reads differently from a night that held each config out. */
export function raceLines(race: RaceFacts | undefined): string[] {
  if (race === undefined) return ["Race: none."];
  const { held, aliveAtStart, withRows, ...counts } = race;
  const lines = [`Race: ${JSON.stringify(counts)}.`];
  if (aliveAtStart === undefined) return lines;
  const heldOut = (held ?? []).filter((h) => h.status === "alive").length;
  lines.push(aliveAtStart === 0 ? "The full race had nothing to race: no config was alive at the start." : `The full race: ${aliveAtStart} alive configs at the start, ${race.full} with each input raced, ${heldOut} held out.`);
  if (withRows !== undefined) lines.push(`${withRows} of the raced configs have censored rows, so the race leaves those inputs out for them.`);
  if ((held ?? []).length > 0) {
    lines.push("", "| Held config | Status | Inputs with no value | Inputs of the race | Reason |", "|---|---|---|---|---|");
    for (const h of held ?? []) lines.push(`| \`${h.config}\` | ${h.status} | ${h.missing} | ${h.of} | ${h.reason} |`);
  }
  return lines;
}

/** This function gives the label of a config for a page or a summary. A held config reads as held, and a label from the screen alone reads as that. */
export function labelLine(entry: Pick<ConfigEntry, "label" | "labelFrom" | "decided" | "censored" | "waited">, heldMissing = 0, noRead = false): string {
  const label = entry.label ?? "";
  const from = entry.labelFrom;
  const rows = Object.keys(entry.censored ?? {}).length;
  const old = label === "" ? "no label" : `${label} from ${from === undefined ? "a race with no stated origin" : originText(from)}`;
  if (noRead) return `no read, ${rows === 0 ? `left out of the plan on ${entry.waited?.length ?? 0} nights` : `${rows} censored inputs`} (${old})`;
  const marked = rows === 0 ? "" : `, ${rows} censored inputs`;
  if (heldMissing > 0) return `held, ${heldMissing} inputs missing${marked} (${old})`;
  if (label === "") return rows === 0 ? "" : `${rows} censored inputs`;
  return (from === undefined ? `${label} (origin not stated)` : `${label} (${originText(from)})`) + marked;
}

/** This function gives the origin of a label in words. */
function originText(from: LabelOrigin): string {
  return from.kind === "screen" ? `the screen of ${from.night}` : `the full race of ${from.night}`;
}

/** This function gives the line of the lost pairs of a night. */
export function lostLine(night: Pick<NightEntry, "missing" | "lost">): string {
  const rounds = Object.entries(night.lost?.rounds ?? {}).map(([round, c]) => `round ${round}: ${c.noRecord} with no record, ${c.noReference} with no reference, ${c.censored} censored`);
  return `Planned pairs that gave no value by the end of the night: ${night.missing}${rounds.length === 0 ? "" : ` (${rounds.join("; ")})`}.`;
}

/** This function gives the inputs of a list that a config has no value for, with its censored rows. */
function absentOf(state: SweepState, id: string, inputs: readonly SweepInput[], at: ReadonlyMap<string, number>): SweepInput[] {
  const v = state.values[id];
  return inputs.filter((i) => v === undefined || v[at.get(i.id)!] === null);
}

/** This function gives the inputs of a list that a plan still owes a config: no value and no censored row. */
function missingOf(state: SweepState, id: string, inputs: readonly SweepInput[], at: ReadonlyMap<string, number>): SweepInput[] {
  const rows = state.configs[id]?.censored;
  return absentOf(state, id, inputs, at).filter((i) => rows?.[i.id] === undefined);
}

/** This function gives the count of the censored rows of a config. */
function rowsOf(state: SweepState, id: string): number {
  return Object.keys(state.configs[id]?.censored ?? {}).length;
}

/** This function makes the plan of a round from its jobs, and adds the new configs to the state with the status `screened`. */
function finish(
  state: SweepState,
  round: 1 | 2,
  jobs: readonly SweepJob[],
  fresh: readonly StrategyConfig[],
  inputs: readonly SweepInput[],
  options: PlanOptions,
): NightPlan {
  const space = options.space ?? JOINT_SPACE;
  for (const config of fresh) {
    const id = configId(space, config);
    state.configs[id] = { config, status: "screened", first: options.date };
    state.values[id] = state.inputs.map(() => null);
  }
  const ids = [...new Set(jobs.map((j) => j.config))];
  const configs = Object.fromEntries(ids.map((id) => [id, state.configs[id]!.config]));
  return planJobs(round, jobs, configs, fresh.length, inputs, options);
}

/** This function gives the plan of a list of jobs: the units, the shards and the facts of the round. The promotion test uses it with no state. */
export function planJobs(
  round: 1 | 2,
  jobs: readonly SweepJob[],
  configs: Readonly<Record<string, StrategyConfig>>,
  sampled: number,
  inputs: readonly SweepInput[],
  options: PlanOptions,
): NightPlan {
  const space = options.space ?? JOINT_SPACE;
  const ids = [...new Set(jobs.map((j) => j.config))];
  const runs = Object.fromEntries(ids.map((id) => [id, configRun(configs[id]!, space)]));
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const cost = (j: SweepJob): number => jobCost(runs[j.config]!, byId.get(j.input)!);
  const units = unitsOf(jobs, cost, options.maxUnit ?? options.target / 4);
  const plan = planRound(units, (input) => byId.get(input)!.spec, options.target, options.maxShards);
  const facts: RoundFacts = {
    configs: ids.length,
    sampled,
    jobs: jobs.length,
    units: units.length,
    shards: plan.shards.length,
    minutes: plan.loads.reduce((s, l) => s + l, 0) / 60000,
    longest: Math.max(0, ...plan.loads) / 60000,
  };
  return { round, date: options.date, plan, configs, runs, facts };
}

/**
 * This function sorts configs for the rotation. A config that a plan left out on `WAIT_BOUND` nights comes first, the longest wait first and then by id.
 * Then the config that a night planned the longest time ago comes first. A config that no night planned is the oldest.
 */
function byAge<T extends { readonly id: string }>(state: SweepState, items: readonly T[]): T[] {
  const age = (x: T): string => state.configs[x.id]!.ran ?? "";
  const overdue = (x: T): number => {
    const nights = state.configs[x.id]!.waited?.length ?? 0;
    return nights >= WAIT_BOUND ? nights : 0;
  };
  return [...items].sort((a, b) => overdue(b) - overdue(a) || (overdue(a) > 0 ? (a.id < b.id ? -1 : 1) : age(a) < age(b) ? -1 : age(a) > age(b) ? 1 : 0));
}

/** This function adds the night to each config of a status that the plan left out with inputs to run. A pair in the plan or no input to run clears the list. */
function noteWaits(state: SweepState, status: ConfigStatus, items: readonly { readonly id: string }[], planned: ReadonlySet<string>, date: string): void {
  const waiting = new Set(items.map((x) => x.id).filter((id) => !planned.has(id)));
  for (const [id, entry] of Object.entries(state.configs)) {
    if (entry.status !== status) continue;
    if (!waiting.has(id)) delete entry.waited;
    else if (entry.waited?.at(-1) !== date) entry.waited = [...(entry.waited ?? []), date];
  }
}

/**
 * This function takes the configs of a rotation while the budget lasts. The first config that does not fit runs in part, in the order of its inputs, so the oldest config makes progress on each night.
 * A config with a cost over the budget then cannot hold up the configs behind it. A record moves its date, so they come first on the next night.
 * A pair that does not fit does not stop the pairs behind it (`takeFitting`). A config with no pair that fits gets no plan, and the next config takes its place. The first such config waits, and its age rises (`noteWaits`).
 */
function takeOldest(
  state: SweepState,
  items: readonly { readonly id: string; readonly missing: readonly SweepInput[] }[],
  byId: ReadonlyMap<string, SweepInput>,
  budget: number,
  space: StrategySpace,
  status: ConfigStatus,
  date: string,
): { readonly jobs: SweepJob[]; readonly cost: number; readonly waiting: WaitingCounts } {
  const pairCost = (id: string): ((i: SweepInput) => number) => {
    const run = configRun(state.configs[id]!.config, space);
    return (i) => jobCost(run, byId.get(i.id)!);
  };
  const costOf = (a: (typeof items)[number]): number => {
    const one = pairCost(a.id);
    return a.missing.reduce((s, i) => s + one(i), 0);
  };
  const whole = takeBudget(items, costOf, budget);
  const jobs: SweepJob[] = whole.taken.flatMap((a) => a.missing.map((i) => ({ config: a.id, input: i.id })));
  let part = { taken: [] as SweepInput[], cost: 0 };
  let partOf: string | undefined;
  for (const a of items.slice(whole.taken.length)) {
    part = takeFitting(a.missing, pairCost(a.id), budget - whole.cost);
    if (part.taken.length === 0) continue;
    partOf = a.id;
    for (const i of part.taken) jobs.push({ config: a.id, input: i.id });
    break;
  }
  noteWaits(state, status, items, new Set([...whole.taken.map((a) => a.id), ...(partOf === undefined ? [] : [partOf])]), date);
  const over = items.flatMap((a) => {
    const one = pairCost(a.id);
    return a.missing.filter((i) => one(i) > budget).map((i) => i.id);
  });
  const left = items.slice(whole.taken.length);
  return {
    jobs,
    cost: whole.cost + part.cost,
    waiting: { configs: left.length, pairs: left.reduce((s, a) => s + a.missing.length, 0) - part.taken.length, overBudgetPairs: over.length, overBudgetInputs: new Set(over).size },
  };
}

/** This function gives the new configs of a round for a budget, in the order of their coverage need. */
function freshFor(state: SweepState, seed: number, screen: readonly SweepInput[], budget: number, options: PlanOptions): StrategyConfig[] {
  const space = options.space ?? JOINT_SPACE;
  const known = new Set(Object.keys(state.configs));
  const counts = strataCounts(
    Object.values(state.configs).map((c) => c.config),
    space,
  );
  const sample = sampleConfigs({ n: options.maxConfigs, seed, known, counts }, space);
  const configCost = (c: StrategyConfig): number => {
    const run = configRun(c, space);
    return screen.reduce((s, i) => s + jobCost(run, i), 0);
  };
  return takeBudget(sample, configCost, budget).taken;
}

/**
 * This function plans round 1 of a night, in the order of priority:
 * - the baseline arm on each input of the corpus, for the paired comparisons and the check of the drift,
 * - the screened configs without each input of the screen (seed 1 of each spec), the oldest first, while the budget lasts,
 * - a sample of new configs on the screen, seeded by the date, with the rest of the budget.
 * The first screened config that does not fit runs in part (`takeOldest`), and the rest wait for the next night.
 */
export function planRound1(state: SweepState, inputs: readonly SweepInput[], options: PlanOptions): NightPlan {
  const space = options.space ?? JOINT_SPACE;
  const at = indexOf(state);
  const screen = screenInputs(inputs);
  const jobs: SweepJob[] = [];
  for (const id of baselineIds(space)) for (const i of inputs) jobs.push({ config: id, input: i.id });
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const costOf = (id: string, missing: readonly SweepInput[]): number => {
    const run = configRun(state.configs[id]!.config, space);
    return missing.reduce((s, i) => s + jobCost(run, byId.get(i.id)!), 0);
  };
  const base = baselineIds(space).reduce((s, id) => s + costOf(id, inputs), 0);
  const screened = Object.entries(state.configs)
    .filter(([, c]) => c.status === "screened")
    .map(([id]) => ({ id, missing: missingOf(state, id, screen, at) }))
    .filter((s) => s.missing.length > 0);
  const old = takeOldest(state, byAge(state, screened), byId, options.maxShards * options.target * SWEEP_FILL - base, space, "screened", options.date);
  jobs.push(...old.jobs);
  const budget = options.maxShards * options.target * SWEEP_FILL - base - old.cost;
  const fresh = freshFor(state, nightSeed(options.date), screen, budget, options);
  for (const config of fresh) {
    const id = configId(space, config);
    for (const i of screen) jobs.push({ config: id, input: i.id });
  }
  const night = nightOf(state, options.date);
  night.waiting = { ...night.waiting, 1: { ...old.waiting, noFresh: old.waiting.pairs > 0 && fresh.length === 0 } };
  const plan = finish(state, 1, jobs, fresh, inputs, options);
  night.round1 = plan.facts;
  return plan;
}

/**
 * This function plans round 1 of a design night. The baseline arm runs on each input. The configs of a Saltelli design of `n` rows run on the screen.
 * A new config of the design gets the status `design`, and so does a config that the race dropped or halved.
 * A config of the state with values keeps its status. It runs only on the inputs of the screen with no value. The race keeps the values of each config of a design.
 * The race and round 2 of the night do not change.
 */
export function planDesign(state: SweepState, inputs: readonly SweepInput[], options: PlanOptions & { readonly n: number }): NightPlan {
  const space = options.space ?? JOINT_SPACE;
  const at = indexOf(state);
  const screen = screenInputs(inputs);
  const { design, configs } = saltelliDesign(space, options.n, nightSeed(options.date), options.date);
  const jobs: SweepJob[] = [];
  for (const id of baselineIds(space)) for (const i of inputs) jobs.push({ config: id, input: i.id });
  const baseline = new Set(baselineIds(space));
  for (const [id, config] of Object.entries(configs)) {
    // The baseline arm has its jobs on each input already.
    if (baseline.has(id)) continue;
    const known = state.configs[id];
    if (known === undefined || known.status === "dropped" || known.status === "halved") {
      state.configs[id] = { ...(known ?? {}), config, status: "design", first: known?.first ?? options.date };
      state.values[id] = state.inputs.map(() => null);
    }
    for (const i of missingOf(state, id, screen, at)) jobs.push({ config: id, input: i.id });
  }
  nightOf(state, options.date);
  const plan = finish(state, 1, jobs, [], inputs, options);
  nightOf(state, options.date).round1 = plan.facts;
  (state.designs ??= []).push(design);
  return plan;
}

/**
 * This function adds the records of a round to the state, and gives the count of the new values.
 * - The records of the baseline arm on an input give the reference of the input. Without them, the stored reference stays.
 * - A config gets a value on an input only once. A later record of the same input checks the drift of the baseline arm.
 * - Each new value goes into the summary, with the scores of the baseline arm on the input for the paired counts.
 * - The night adds the counts of the check "same twice" of all the records (`sameTwice`).
 */
export function applyRecords(state: SweepState, records: readonly LayoutRecord[], inputs: readonly SweepInput[], date: string): number {
  const at = indexOf(state);
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const base = Object.entries(state.configs)
    .filter(([, c]) => c.status === "baseline")
    .map(([id]) => id);
  const names = new Map(Object.entries(state.configs).map(([id]) => [id, id]));
  const space = JOINT_SPACE;
  for (const name of BASELINE_ARM) names.set(configId(space, space.named![name]!), name);
  const byInput = new Map<string, LayoutRecord[]>();
  for (const r of records) byInput.set(r.input, [...(byInput.get(r.input) ?? []), r]);
  const rows = new Map(state.summary.map((r) => [rowKey(r.config, r.cell, r.family), r]));
  const night = nightOf(state, date);
  night.sameTwice = addSameTwice(night.sameTwice, sameTwice(records));
  let added = 0;
  for (const [inputId, list] of byInput) {
    const i = at.get(inputId);
    const input = byId.get(inputId);
    if (i === undefined || input === undefined) continue;
    const mine = new Map(list.map((r) => [r.strategy, r]));
    const tonight = base.map((id) => mine.get(id));
    if (tonight.every((r) => r !== undefined)) {
      state.reference[i] = tonight.map((r) => pickOf(r!));
      (state.stepValues ??= state.inputs.map(() => null))[i] = tonight.map((r) => stepValuesOf(r!));
    }
    const reference = state.reference[i];
    if (reference === null || reference === undefined) continue;
    const scores = new Map<string, number>();
    const values = new Map<string, ReturnType<typeof sweepValue>>();
    for (const r of list) {
      if (state.configs[r.strategy] === undefined) continue;
      state.configs[r.strategy]!.ran = date;
      const v = sweepValue(r, reference);
      values.set(r.strategy, v);
      scores.set(r.strategy, v.score);
    }
    const baseline: Record<string, number | undefined> = {};
    for (const id of base) baseline[names.get(id)!] = scores.get(id) ?? state.values[id]?.[i] ?? undefined;
    let drifted = false;
    for (const [id, v] of values) {
      const arr = (state.values[id] ??= state.inputs.map(() => null));
      const old = arr[i];
      const stored = Number(v.score.toFixed(6));
      if (old !== null && old !== undefined) {
        if (state.configs[id]!.status === "baseline" && Math.abs(old - stored) > 1e-9) drifted = true;
        continue;
      }
      arr[i] = stored;
      addToSummary(rows, id, input, v, baseline);
      added++;
    }
    if (drifted) night.drift++;
  }
  state.summary.splice(0, state.summary.length, ...[...rows.values()].sort((a, b) => (rowKey(a.config, a.cell, a.family) < rowKey(b.config, b.cell, b.family) ? -1 : 1)));
  night.values += added;
  return added;
}

/** This function gives the scores of the state as maps, for `race`. */
export function valueMaps(state: SweepState): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [id, arr] of Object.entries(state.values)) {
    const m = new Map<string, number>();
    arr.forEach((v, i) => {
      if (v !== null) m.set(state.inputs[i]!, v);
    });
    out.set(id, m);
  }
  return out;
}

/** The options of `raceNight`. */
export interface RaceNightOptions {
  readonly date: string;
  readonly space?: StrategySpace;
  readonly eta?: number;
  readonly runs?: number;
  readonly draws?: number;
}

/**
 * This function races the configs of the state after round 1.
 * - Each screened config with `SCREEN_SHARE` of the screen or more takes part. The verdict drops a `worse` config, and the halving keeps 1 of each 3 of the rest.
 * - Each alive config with each input of the corpus gets the verdict on the full corpus. A `worse` config is dropped, and no halving applies.
 * A censored row takes the place of a value for this rule, up to `censoredLimit`. The verdict pairs values only, so the input of a row does not count. Over the limit, the config is held with "no read".
 * A dropped or halved config keeps its rows of the summary, and loses its values.
 */
export function raceNight(state: SweepState, inputs: readonly SweepInput[], options: RaceNightOptions): RaceOutcome[] {
  const space = options.space ?? JOINT_SPACE;
  const incumbent = configId(space, space.named![INCUMBENT]!);
  const at = indexOf(state);
  const screen = screenInputs(inputs);
  const values = valueMaps(state);
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const common = {
    incumbent,
    family: (input: string) => byId.get(input)?.spec ?? input,
    seed: (input: string) => byId.get(input)?.seed ?? 0,
    ...(options.runs === undefined ? {} : { runs: options.runs }),
    ...(options.draws === undefined ? {} : { draws: options.draws }),
  };
  const screened = Object.entries(state.configs)
    .filter(([id, c]) => c.status === "screened" && absentOf(state, id, screen, at).length <= screen.length * (1 - SCREEN_SHARE))
    .map(([id]) => id);
  const limit = censoredLimit(inputs.length);
  const full = Object.entries(state.configs)
    .filter(([id, c]) => c.status === "alive" && missingOf(state, id, inputs, at).length === 0 && rowsOf(state, id) <= limit)
    .map(([id]) => id);
  const heldOf = (id: string, status: "screened" | "alive", list: readonly SweepInput[], what: string): HeldConfig => {
    const missing = absentOf(state, id, list, at).length;
    const reason = `${missing} of ${list.length} ${what} have no value`;
    // No plan owes this config an input, so only a new epoch can bring it to the race.
    if (missingOf(state, id, list, at).length === 0) return { config: id, status, missing, of: list.length, reason: `${reason}: ${rowsOf(state, id)} censored rows, so it reads no read`, noRead: true };
    const waited = state.configs[id]!.waited?.length ?? 0;
    if (waited > WAIT_BOUND) return { config: id, status, missing, of: list.length, reason: `${reason}: a plan left it out on ${waited} nights, so it reads no read`, noRead: true };
    return { config: id, status, missing, of: list.length, reason };
  };
  const taking = new Set([...screened, ...full]);
  const held = Object.entries(state.configs).flatMap(([id, c]) => {
    if (taking.has(id)) return [];
    if (c.status === "screened") return [heldOf(id, "screened", screen, "screen inputs")];
    return c.status === "alive" ? [heldOf(id, "alive", inputs, "inputs")] : [];
  });
  const aliveAtStart = Object.values(state.configs).filter((c) => c.status === "alive").length;
  const fromFull = new Set(full);
  const first = race(values, screened, { ...common, ...(options.eta === undefined ? {} : { eta: options.eta }) });
  const second = race(values, full, { ...common, eta: Infinity });
  // The race keeps the values of a config of a design, so the design rows stay full.
  const designed = new Set((state.designs ?? []).flatMap((d) => d.rows.flatMap((r) => [r.a, r.b, ...Object.values(r.ab)])));
  for (const o of [...first, ...second]) {
    const c = state.configs[o.config]!;
    c.status = o.status;
    c.decided = options.date;
    c.label = o.label;
    c.labelFrom = { kind: fromFull.has(o.config) ? "race" : "screen", night: options.date };
    c.mean = Number(o.mean.toFixed(6));
    c.pooled = Number(o.pooled.toFixed(6));
    c.agree = o.agree;
    c.signs = { ...o.signs, p: Number(o.signs.p.toFixed(6)) };
    if (o.status !== "alive" && !designed.has(o.config)) delete state.values[o.config];
  }
  nightOf(state, options.date).race = {
    raced: first.length,
    dropped: first.filter((o) => o.status === "dropped").length,
    halved: first.filter((o) => o.status === "halved").length,
    alive: first.filter((o) => o.status === "alive").length,
    full: second.length,
    fullDropped: second.filter((o) => o.status === "dropped").length,
    aliveAtStart,
    held,
    ...(full.some((id) => rowsOf(state, id) > 0) ? { withRows: full.filter((id) => rowsOf(state, id) > 0).length } : {}),
  };
  return [...first, ...second];
}

/**
 * This function plans round 2 of a night, in the order of priority:
 * - the alive configs without each input of the corpus, the oldest first and then from the largest mean against the incumbent, while the budget lasts. The first config that does not fit runs in part (`takeOldest`),
 * - a second sample of new configs on the screen, from the least covered strata, with the rest of the budget.
 */
export function planRound2(state: SweepState, inputs: readonly SweepInput[], options: PlanOptions): NightPlan {
  const space = options.space ?? JOINT_SPACE;
  const at = indexOf(state);
  const screen = screenInputs(inputs);
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const alive = Object.entries(state.configs)
    .filter(([, c]) => c.status === "alive")
    .sort(([a, x], [b, y]) => (y.mean ?? 0) - (x.mean ?? 0) || (a < b ? -1 : 1))
    .map(([id]) => ({ id, missing: missingOf(state, id, inputs, at) }))
    .filter((a) => a.missing.length > 0);
  // The sort is stable, so the configs of one age keep the order of their means.
  const rotated = byAge(state, alive);
  const budget = options.maxShards * options.target * SWEEP_FILL;
  const old = takeOldest(state, rotated, byId, budget, space, "alive", options.date);
  const jobs = old.jobs;
  const fresh = freshFor(state, nightSeed(options.date) * 2 + 1, screen, budget - old.cost, options);
  for (const config of fresh) {
    const id = configId(space, config);
    for (const i of screen) jobs.push({ config: id, input: i.id });
  }
  const plan = finish(state, 2, jobs, fresh, inputs, options);
  const night = nightOf(state, options.date);
  night.round2 = plan.facts;
  night.waiting = { ...night.waiting, 2: { ...old.waiting, noFresh: old.waiting.pairs > 0 && fresh.length === 0 } };
  return plan;
}

/** This function gives the count of the configs of each status. */
export function statusCounts(state: SweepState): Record<ConfigStatus, number> {
  const out: Record<ConfigStatus, number> = { baseline: 0, screened: 0, alive: 0, dropped: 0, halved: 0, design: 0 };
  for (const c of Object.values(state.configs)) out[c.status]++;
  return out;
}
