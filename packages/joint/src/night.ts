// The state of the sweep and the steps of one night (`docs/SWEEP.md`): plan round 1, apply the records, race, plan round 2.
// The state is one JSON object. The workflow keeps it on the data branch `sweep-data`, and the script `scripts/sweep.mjs` reads and writes it.
import { configId, type LayoutRecord, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { stepValuesOf } from "./epoch-step.ts";
import type { CensoredUnit } from "./shard-stop.ts";
import { saltelliDesign, type SaltelliDesign } from "./sensitivity.ts";
import { configRun, JOINT_SPACE, type ConfigRun } from "./space.ts";
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
  /** The jobs that gave a value, and the planned pairs that gave no value by the end of the night (`LOST_METHOD_NOTE` of `night-check.ts` gives the older form). */
  values: number;
  missing: number;
  /** The counts of each round. A night from before L115 has none. */
  lost?: { rounds: Record<string, LostCounts> };
  /** The keys of the lost pairs between the rounds, as `<config>|<input>`. The summary removes this field. */
  pending?: string[];
  /** The planned and the real minutes of each shard. A stop writes the censored row of the unit in progress. */
  shards: { round: number; shard: number; planned: number; real: number; censored?: CensoredUnit }[];
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
  return { schema: SWEEP_SCHEMA, epoch, corpus, inputs: inputs.map((i) => i.id), ...(hashes.length === inputs.length ? { inputHashes: hashes } : {}), configs, values, reference: inputs.map(() => null), summary: [], nights: [] };
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

/** The note on the race of 2026-11-02. It stays in each summary, because the summary of that night printed the 3 labels with no mark. */
export const RACE_NOTE_2026_11_02 =
  "The summary of the night 2026-11-02 printed `full: 0`, `Jobs without a record: 0`, and 3 held configs with the label `better` and no mark. Run 41442420950 printed it, after the first summarize job of run 41384329446 stopped on an error. These 3 labels came from the screen of 2026-11-01. The 13 alive configs of that night each had 12 or 13 inputs with no value.";

/** This function gives the lines of the race of a night. A night with nothing to race reads differently from a night that held each config out. */
export function raceLines(race: RaceFacts | undefined): string[] {
  if (race === undefined) return ["Race: none."];
  const { held, aliveAtStart, ...counts } = race;
  const lines = [`Race: ${JSON.stringify(counts)}.`];
  if (aliveAtStart === undefined) return lines;
  const heldOut = (held ?? []).filter((h) => h.status === "alive").length;
  lines.push(aliveAtStart === 0 ? "The full race had nothing to race: no config was alive at the start." : `The full race: ${aliveAtStart} alive configs at the start, ${race.full} with each input raced, ${heldOut} held out.`);
  if ((held ?? []).length > 0) {
    lines.push("", "| Held config | Status | Inputs with no value | Inputs of the race | Reason |", "|---|---|---|---|---|");
    for (const h of held ?? []) lines.push(`| \`${h.config}\` | ${h.status} | ${h.missing} | ${h.of} | ${h.reason} |`);
  }
  return lines;
}

/** This function gives the label of a config for a page or a summary. A held config reads as held, and a label from the screen alone reads as that. */
export function labelLine(entry: Pick<ConfigEntry, "label" | "labelFrom" | "decided">, heldMissing = 0): string {
  const label = entry.label ?? "";
  const from = entry.labelFrom;
  if (heldMissing > 0) return `held, ${heldMissing} inputs missing (${label === "" ? "no label" : `${label} from ${from === undefined ? "a race with no stated origin" : originText(from)}`})`;
  if (label === "") return "";
  return from === undefined ? `${label} (origin not stated)` : `${label} (${originText(from)})`;
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

/** This function gives the inputs of a list that a config has no value for. */
function missingOf(state: SweepState, id: string, inputs: readonly SweepInput[], at: ReadonlyMap<string, number>): SweepInput[] {
  const v = state.values[id];
  return inputs.filter((i) => v === undefined || v[at.get(i.id)!] === null);
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

/** This function sorts configs for the rotation: the config that a night planned the longest time ago comes first. A config that no night planned is the oldest. */
function byAge<T extends { readonly id: string }>(state: SweepState, items: readonly T[]): T[] {
  const age = (x: T): string => state.configs[x.id]!.ran ?? "";
  return [...items].sort((a, b) => (age(a) < age(b) ? -1 : age(a) > age(b) ? 1 : 0));
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
 * A screened config that does not fit waits for the next night.
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
  const { taken, cost } = takeBudget(byAge(state, screened), (s) => costOf(s.id, s.missing), options.maxShards * options.target * SWEEP_FILL - base);
  for (const s of taken) for (const i of s.missing) jobs.push({ config: s.id, input: i.id });
  const budget = options.maxShards * options.target * SWEEP_FILL - base - cost;
  const fresh = freshFor(state, nightSeed(options.date), screen, budget, options);
  for (const config of fresh) {
    const id = configId(space, config);
    for (const i of screen) jobs.push({ config: id, input: i.id });
  }
  nightOf(state, options.date);
  const plan = finish(state, 1, jobs, fresh, inputs, options);
  nightOf(state, options.date).round1 = plan.facts;
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
    .filter(([id, c]) => c.status === "screened" && missingOf(state, id, screen, at).length <= screen.length * (1 - SCREEN_SHARE))
    .map(([id]) => id);
  const full = Object.entries(state.configs)
    .filter(([id, c]) => c.status === "alive" && missingOf(state, id, inputs, at).length === 0)
    .map(([id]) => id);
  const heldOf = (id: string, status: "screened" | "alive", list: readonly SweepInput[], what: string): HeldConfig => {
    const missing = missingOf(state, id, list, at).length;
    return { config: id, status, missing, of: list.length, reason: `${missing} of ${list.length} ${what} have no value` };
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
  };
  return [...first, ...second];
}

/**
 * This function plans round 2 of a night, in the order of priority:
 * - the alive configs without each input of the corpus, the oldest first and then from the largest mean against the incumbent, while the budget lasts,
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
  const costOf = (a: { id: string; missing: SweepInput[] }): number => {
    const run = configRun(state.configs[a.id]!.config, space);
    return a.missing.reduce((s, i) => s + jobCost(run, byId.get(i.id)!), 0);
  };
  const { taken, cost } = takeBudget(rotated, costOf, budget);
  const jobs: SweepJob[] = taken.flatMap((a) => a.missing.map((i) => ({ config: a.id, input: i.id })));
  const fresh = freshFor(state, nightSeed(options.date) * 2 + 1, screen, budget - cost, options);
  for (const config of fresh) {
    const id = configId(space, config);
    for (const i of screen) jobs.push({ config: id, input: i.id });
  }
  const plan = finish(state, 2, jobs, fresh, inputs, options);
  nightOf(state, options.date).round2 = plan.facts;
  return plan;
}

/** This function gives the count of the configs of each status. */
export function statusCounts(state: SweepState): Record<ConfigStatus, number> {
  const out: Record<ConfigStatus, number> = { baseline: 0, screened: 0, alive: 0, dropped: 0, halved: 0, design: 0 };
  for (const c of Object.values(state.configs)) out[c.status]++;
  return out;
}
