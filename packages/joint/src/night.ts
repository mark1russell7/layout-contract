// The state of the sweep and the steps of one night (`docs/SWEEP.md`): plan round 1, apply the records, race, plan round 2.
// The state is one JSON object. The workflow keeps it on the data branch `sweep-data`, and the script `scripts/sweep.mjs` reads and writes it.
import { configId, type LayoutRecord, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
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
  type Reference,
  type RoundPlan,
  type SummaryRow,
  type SweepInput,
  type SweepJob,
} from "./sweep.ts";

/** One config in the state. */
export interface ConfigEntry {
  readonly config: StrategyConfig;
  status: ConfigStatus;
  /** The date of the night that added the config. */
  readonly first: string;
  /** The date of the last race of the config, its label and its stratified mean against the incumbent. */
  decided?: string;
  label?: string;
  mean?: number;
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
  /** The jobs that gave a value, and the jobs of the plans without a record. */
  values: number;
  missing: number;
  /** The planned and the real minutes of each shard. */
  shards: { round: number; shard: number; planned: number; real: number }[];
}

/** The state of the sweep in one epoch: one corpus, one version of each engine and one version of the space. */
export interface SweepState {
  readonly schema: typeof SWEEP_SCHEMA;
  readonly epoch: string;
  readonly corpus: string;
  /** The ids of the inputs, in the order of the corpus. The arrays of `values` and `reference` have this order. */
  readonly inputs: readonly string[];
  readonly configs: Record<string, ConfigEntry>;
  /** The `sweep.score` of each config with the status `baseline`, `screened` or `alive` on each input. `null` is no run. */
  readonly values: Record<string, (number | null)[]>;
  /** The pick values of the baseline arm on each input, as the last night gave them. */
  readonly reference: (Reference | null)[];
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
  return { schema: SWEEP_SCHEMA, epoch, corpus, inputs: inputs.map((i) => i.id), configs, values, reference: inputs.map(() => null), summary: [], nights: [] };
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
  const runs = Object.fromEntries(ids.map((id) => [id, configRun(configs[id]!, space)]));
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const cost = (j: SweepJob): number => jobCost(runs[j.config]!, byId.get(j.input)!);
  const units = unitsOf(jobs, cost, options.maxUnit ?? options.target / 4);
  const plan = planRound(units, (input) => byId.get(input)!.spec, options.target, options.maxShards);
  const facts: RoundFacts = {
    configs: ids.length,
    sampled: fresh.length,
    jobs: jobs.length,
    units: units.length,
    shards: plan.shards.length,
    minutes: plan.loads.reduce((s, l) => s + l, 0) / 60000,
    longest: Math.max(0, ...plan.loads) / 60000,
  };
  return { round, date: options.date, plan, configs, runs, facts };
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
 * - the screened configs without each input of the screen (seed 1 of each spec),
 * - a sample of new configs on the screen, seeded by the date, while the budget lasts.
 */
export function planRound1(state: SweepState, inputs: readonly SweepInput[], options: PlanOptions): NightPlan {
  const space = options.space ?? JOINT_SPACE;
  const at = indexOf(state);
  const screen = screenInputs(inputs);
  const jobs: SweepJob[] = [];
  for (const id of baselineIds(space)) for (const i of inputs) jobs.push({ config: id, input: i.id });
  for (const [id, c] of Object.entries(state.configs)) if (c.status === "screened") for (const i of missingOf(state, id, screen, at)) jobs.push({ config: id, input: i.id });
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const used = jobs.reduce((s, j) => s + jobCost(configRun(state.configs[j.config]!.config, space), byId.get(j.input)!), 0);
  const budget = options.maxShards * options.target * SWEEP_FILL - used;
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
    if (tonight.every((r) => r !== undefined)) state.reference[i] = tonight.map((r) => pickOf(r!));
    const reference = state.reference[i];
    if (reference === null || reference === undefined) continue;
    const scores = new Map<string, number>();
    const values = new Map<string, ReturnType<typeof sweepValue>>();
    for (const r of list) {
      if (state.configs[r.strategy] === undefined) continue;
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
      if (old !== null && old !== undefined) {
        if (state.configs[id]!.status === "baseline" && Math.abs(old - v.score) > 1e-9) drifted = true;
        continue;
      }
      arr[i] = Number(v.score.toFixed(6));
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
  const first = race(values, screened, { ...common, ...(options.eta === undefined ? {} : { eta: options.eta }) });
  const second = race(values, full, { ...common, eta: Infinity });
  // The race keeps the values of a config of a design, so the design rows stay full.
  const designed = new Set((state.designs ?? []).flatMap((d) => d.rows.flatMap((r) => [r.a, r.b, ...Object.values(r.ab)])));
  for (const o of [...first, ...second]) {
    const c = state.configs[o.config]!;
    c.status = o.status;
    c.decided = options.date;
    c.label = o.label;
    c.mean = Number(o.mean.toFixed(6));
    if (o.status !== "alive" && !designed.has(o.config)) delete state.values[o.config];
  }
  nightOf(state, options.date).race = {
    raced: first.length,
    dropped: first.filter((o) => o.status === "dropped").length,
    halved: first.filter((o) => o.status === "halved").length,
    alive: first.filter((o) => o.status === "alive").length,
    full: second.length,
    fullDropped: second.filter((o) => o.status === "dropped").length,
  };
  return [...first, ...second];
}

/**
 * This function plans round 2 of a night, in the order of priority:
 * - the alive configs without each input of the corpus, from the largest mean against the incumbent, while the budget lasts,
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
  const budget = options.maxShards * options.target * SWEEP_FILL;
  const costOf = (a: { id: string; missing: SweepInput[] }): number => {
    const run = configRun(state.configs[a.id]!.config, space);
    return a.missing.reduce((s, i) => s + jobCost(run, byId.get(i.id)!), 0);
  };
  const { taken, cost } = takeBudget(alive, costOf, budget);
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
