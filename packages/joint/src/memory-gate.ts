// The memory gate of roadmap item L81. The probe runs the largest input of each family of the corpus, and the gate examines the peak RSS of each probe.
// For the inputs of `MEMORY_LIMITS`, the gate also examines the allocation and the live heap in the mode `LIMITS_MODE`.
// The bench gives the list of the inputs, so the gate cannot leave out a family.

import { median } from "@mark1russell7/rigor-statistics";

/** One input of the corpus with its planned cost (`plannedCost`). */
export interface CostedInput {
  readonly id: string;
  readonly cost: number;
}

/**
 * The ceiling of the peak RSS in MB, for each probe (`docs/JOINT-BENCH.md`, "The limits of the memory gate").
 * The peak RSS changes with the time of the GC, so this ceiling is a guard against a crash, not a regression gate.
 * The value is the worst peak of the 15 probes of the run 41408115284 plus their spread: 4503 + (4503 - 3215) = 5791.
 */
export const MEMORY_GATE_MB = 5791;

/** The heap mode of the probes that the limits of `MEMORY_LIMITS` examine. This mode samples the allocation and forces a GC after each pair. */
export const LIMITS_MODE = "measure-6144";

/** The limits of one input in the mode `LIMITS_MODE`. A probe fails when a value is more than its limit. */
export interface MemoryLimit {
  /** The limit of the sampled allocation of all pairs, in MB. */
  readonly allocMb: number;
  /** The limit of the largest retained heap after a pair, in MB. */
  readonly liveMaxMb: number;
  /** The worst allocation of the probes of `LIMIT_SOURCE`, in MB. The gate gives the change of a probe from this value. */
  readonly fromAllocMb?: number;
  /** The worst live heap of the probes of `LIMIT_SOURCE`, in MB. The gate gives the change of a probe from this value. */
  readonly fromLiveMb?: number;
}

/** The names of the versions that a probe writes in `engines.json`: the node runtime and the engines of the pairs. */
export const ENGINE_NAMES = ["node", "highways", "packing"] as const;

/** The probes that the limits of `MEMORY_LIMITS` come from: their runs, their commit and the versions of `ENGINE_NAMES`. */
export interface LimitSource {
  readonly runs: readonly number[];
  readonly head: string;
  readonly engines: Readonly<Record<string, string>>;
}

/**
 * The source of the limits of `MEMORY_LIMITS`. The live heap is the same in each probe of one seed on one set of versions.
 * Thus a change of an engine can move a value over its limit, and the gate names the change (roadmap item L81, the ruling of 2026-11-05).
 */
export const LIMIT_SOURCE: LimitSource = {
  runs: [41654875543, 41769223049],
  head: "5a00107",
  engines: { node: "26.13.0", highways: "0.10.0", packing: "0.5.0" },
};

/**
 * The limits of the inputs that have 5 or more probes on `main` (`docs/JOINT-BENCH.md`, "The limits of the memory gate").
 * Each limit is the worst value of 6 probes plus their spread, rounded up to 1 MB. The probes are the 5 of the run 41654875543 and the 1 of the run 41769223049.
 * The margin is at least one step of the measure, so the step of `liveMaxMb` is 1 MB.
 * The probes of all CPU models count together. In the run 41408115284, the CPU models changed the allocation by at most 0.16%, less than the spread of that run.
 */
export const MEMORY_LIMITS: Readonly<Record<string, MemoryLimit>> = {
  "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s1": { allocMb: 2535267, liveMaxMb: 394, fromAllocMb: 2531692, fromLiveMb: 393 },
  "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s2": { allocMb: 3313580, liveMaxMb: 421, fromAllocMb: 3310056, fromLiveMb: 420 },
  "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap/s3": { allocMb: 3574452, liveMaxMb: 503, fromAllocMb: 3566862, fromLiveMb: 502 },
};

/** The function of the joint measures that gives the steps of the allocation (`docs/JOINT-BENCH.md`, "The limits of the memory gate"). */
export const STEP_FUNCTION = "straightCrossings";

/**
 * The line in MB between a plain call of `STEP_FUNCTION` and a step.
 * In the 18 probes of the runs 41654875543 and 41769223049, a plain call allocates at most 27.8 MB, and a step allocates at least 1076.3 MB.
 */
export const STEP_LINE_MB = 500;

/** One line of `alloc.jsonl`: the functions that allocated the most in one pair. */
export interface PairAllocation {
  readonly top: readonly { readonly at: string; readonly mb: number }[];
}

/** This function gives the count of the pairs of a probe where `STEP_FUNCTION` allocates `STEP_LINE_MB` or more. */
export function stepCount(pairs: readonly PairAllocation[]): number {
  return pairs.filter((pair) => pair.top.some((site) => site.at.startsWith(`${STEP_FUNCTION} `) && site.mb >= STEP_LINE_MB)).length;
}

/**
 * The jobs at once of the nightly gate: `max-parallel` of `memory-probe.yml`. A test compares them.
 * The number is a stated exception to the fleet limit of 3, on trial for 3 nights (`docs/JOINT-BENCH.md`, "The trial of the gate with 6 jobs at once").
 */
export const GATE_LANES = 6;

/** The expected minutes of a gate with no job record to read: the safe side of the budget of the sweep. */
export const GATE_FALLBACK_MINUTES = 360;

/** The times of one job of a gate, as `gh run view --json jobs` gives them. */
export interface GateJobTime {
  readonly conclusion?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly steps?: readonly unknown[] | null;
}

/**
 * This function gives the start and the end of a job that ran, in milliseconds, or `null` for a job that did not run.
 * A skipped job has no time, and GitHub can give it a start at the year 1. A job cancelled in the queue has a start and an end, but no steps, so its time is a wait.
 * A job cancelled while it ran has steps, and its time is a real cost.
 */
export function jobSpan(job: GateJobTime): { readonly from: number; readonly to: number } | null {
  if (job.conclusion === "skipped" || job.startedAt == null || job.completedAt == null) return null;
  if (job.conclusion === "cancelled" && (job.steps?.length ?? 0) === 0) return null;
  const from = Date.parse(job.startedAt);
  const to = Date.parse(job.completedAt);
  return from > 0 && to > from ? { from, to } : null;
}

/** The expected minutes of one gate from its jobs. */
export interface GateCost {
  /** The minutes of the longest job. No count of lanes can lower this floor. */
  readonly longest: number;
  /** The sum of the minutes of the jobs. */
  readonly jobMinutes: number;
  /** The larger of `longest` and `jobMinutes` over the lanes, up to a whole minute. */
  readonly minutes: number;
}

/**
 * This function gives the expected minutes of a gate from its jobs: the larger of the longest job and the job minutes over the lanes.
 * Wall time is not an input. The gate 41433146680 waited 334 of its 704 minutes in its concurrency group, with no job running.
 * A job counts only when it ran (`jobSpan`).
 */
export function gateCost(jobs: readonly GateJobTime[], lanes: number = GATE_LANES): GateCost {
  if (!Number.isInteger(lanes) || lanes < 1) throw new RangeError(`The lanes are a whole number from 1, not ${lanes}.`);
  let longest = 0;
  let jobMinutes = 0;
  for (const job of jobs) {
    const span = jobSpan(job);
    if (span === null) continue;
    const minutes = (span.to - span.from) / 60000;
    jobMinutes += minutes;
    if (minutes > longest) longest = minutes;
  }
  return { longest, jobMinutes, minutes: Math.ceil(Math.max(longest, jobMinutes / lanes)) };
}

/**
 * This function gives the expected minutes of the next gate: the median of `gateCost` over the gates that have job times.
 * With no such gate, it gives `GATE_FALLBACK_MINUTES`.
 * Each gate counts at the lanes of the next gate, so a gate of the old count of lanes does not raise the estimate.
 */
export function gateEstimate(gates: readonly (readonly GateJobTime[])[], lanes: number = GATE_LANES): number {
  const costs = gates.map((jobs) => gateCost(jobs, lanes)).filter((cost) => cost.jobMinutes > 0);
  if (costs.length === 0) return GATE_FALLBACK_MINUTES;
  return Math.ceil(median(costs.map((cost) => cost.minutes)));
}

/** One job of the gate: a group of inputs with commas, one heap mode, and the number of the repeat. */
export interface GateJob {
  readonly input: string;
  readonly mode: string;
  readonly repeat: number;
}

/**
 * This function gives the jobs of the gate: each group in each mode, for each repeat.
 * With `limits`, each input with a limit also gets a job of its own in the mode `LIMITS_MODE`.
 * One seed of input F takes 50 to 192 minutes in that mode, so each seed has its own job. These jobs come first, because they are long.
 */
export function gateJobs(groups: readonly string[], modes: readonly string[], repeats: number, limits?: Readonly<Record<string, MemoryLimit>>): GateJob[] {
  const limited = limits === undefined ? [] : Object.keys(limits);
  const jobs: GateJob[] = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const input of limited) jobs.push({ input, mode: LIMITS_MODE, repeat });
    for (const mode of modes) for (const input of groups) if (input !== "") jobs.push({ input, mode, repeat });
  }
  return jobs;
}

/** This function gives each input of each job with the mode of the job, one time. The gate expects a probe for each of them. */
export function expectedProbes(jobs: readonly GateJob[]): { input: string; mode: string }[] {
  const seen = new Map<string, { input: string; mode: string }>();
  for (const job of jobs) for (const input of job.input.split(",")) if (input !== "") seen.set(`${job.mode}|${input}`, { input, mode: job.mode });
  return [...seen.values()];
}

/** This function gives the family of an input id: the id without its seed. For example, `joint-v2/cards.x/s2` gives `joint-v2/cards.x`. */
export function familyOf(id: string): string {
  return id.replace(/\/s\d+$/, "");
}

/**
 * This function gives the probe group of each family: each input with the largest planned cost of the family, in the order of the families.
 * The seeds of a family often have the same cost. Then the group has each of these seeds, because the peak of a seed can be 25% above the peak of seed 1.
 */
export function familyProbeGroups(inputs: readonly CostedInput[]): string[][] {
  const best = new Map<string, { cost: number; ids: string[] }>();
  for (const input of inputs) {
    const family = familyOf(input.id);
    const old = best.get(family);
    if (old === undefined || input.cost > old.cost) best.set(family, { cost: input.cost, ids: [input.id] });
    else if (input.cost === old.cost) old.ids.push(input.id);
  }
  return [...best.values()].map((group) => group.ids);
}

/** The result of the probe of one input in one heap mode. The peak is `undefined` when the probe wrote no facts, for example after an OOM. */
export interface ProbeResult {
  readonly input: string;
  readonly mode: string;
  readonly status: number;
  readonly peakRssMb: number | undefined;
  /** The sampled allocation from `summary.jsonl`, in the modes that sample it. */
  readonly allocMb?: number | undefined;
  /** The count of the steps from `alloc.jsonl` (`stepCount`), in the modes that sample the allocation. */
  readonly steps?: number | undefined;
  /** The largest retained heap from `summary.jsonl`, in the modes that force a GC. */
  readonly liveMaxMb?: number | undefined;
  /** The versions of `ENGINE_NAMES` from `engines.json`. An older probe has no such file. */
  readonly engines?: Readonly<Record<string, string>> | undefined;
}

/** One row of the gate: one input in one mode. The field `reason` tells why the row fails, and it is empty when the row passes. */
export interface GateRow {
  readonly family: string;
  readonly input: string;
  readonly mode: string;
  readonly status: number | undefined;
  readonly peakRssMb: number | undefined;
  readonly allocMb: number | undefined;
  readonly steps: number | undefined;
  readonly liveMaxMb: number | undefined;
  readonly reason: string;
  /** For a row with limits, the change from the worst probe of `LIMIT_SOURCE` (`limitChange`). Else an empty string. */
  readonly change: string;
  /** For a row with limits, the change of the versions from `LIMIT_SOURCE` (`engineChange`). Else an empty string. */
  readonly engines: string;
}

/** The result of the gate. It passes when each row passes. */
export interface GateResult {
  readonly pass: boolean;
  readonly limitMb: number;
  readonly rows: readonly GateRow[];
  /** The source of the limits. */
  readonly source: LimitSource;
  /** Each different change of the versions in the rows with limits, sorted. It is empty when each of these probes ran on the versions of `source`. */
  readonly engineChanges: readonly string[];
}

/**
 * This function examines the probes of each expected input in its mode. A row fails in these conditions:
 *
 * - The input has no probe in the mode.
 * - The status is not 0. The status 134 is an OOM of V8.
 * - The probe has no peak, or the peak is the limit or more.
 * - In the mode `LIMITS_MODE`, the input has an entry in `limits`, and the probe has no value or a value above its limit.
 *
 * The gate also fails when it has no rows: no expected input or no mode.
 *
 * Each probe gives one row, so each repeat of an input counts (the A/A repeat of L81).
 *
 * The rows with the largest peaks come first, and the rows without a peak come before them.
 */
export function memoryGate(
  expected: readonly { input: string; mode: string }[],
  results: readonly ProbeResult[],
  limitMb: number = MEMORY_GATE_MB,
  limits: Readonly<Record<string, MemoryLimit>> = MEMORY_LIMITS,
  source: LimitSource = LIMIT_SOURCE,
): GateResult {
  const byKey = new Map<string, ProbeResult[]>();
  for (const r of results) byKey.set(`${r.mode}|${r.input}`, [...(byKey.get(`${r.mode}|${r.input}`) ?? []), r]);
  const rows: GateRow[] = [];
  for (const { input, mode } of expected) {
    const limit = mode === LIMITS_MODE ? limits[input] : undefined;
    const probes = byKey.get(`${mode}|${input}`) ?? [undefined];
    for (const r of probes) {
      const reason =
        r === undefined ? "no probe" : r.status === 134 ? "OOM (status 134)" : r.status !== 0 ? `status ${r.status}` : r.peakRssMb === undefined ? "no peak" : r.peakRssMb >= limitMb ? `peak ${r.peakRssMb} MB, limit ${limitMb} MB` : limitReason(r, limit);
      const change = limit === undefined || r === undefined ? "" : limitChange(r, limit);
      const engines = limit === undefined || r === undefined ? "" : engineChange(source.engines, r.engines);
      rows.push({ family: familyOf(input), input, mode, status: r?.status, peakRssMb: r?.peakRssMb, allocMb: r?.allocMb, steps: r?.steps, liveMaxMb: r?.liveMaxMb, reason, change, engines });
    }
  }
  rows.sort((a, b) => (b.peakRssMb ?? Infinity) - (a.peakRssMb ?? Infinity));
  const engineChanges = [...new Set(rows.map((r) => r.engines).filter((e) => e !== ""))].sort();
  // A gate with no rows examined nothing, so it fails.
  return { pass: rows.length > 0 && rows.every((r) => r.reason === ""), limitMb, rows, source, engineChanges };
}

/**
 * This function gives each version of a probe that is not the version of the source, in the order of the source.
 * For example, `highways 0.10.0 to 0.13.0, packing 0.5.0 to 0.6.1`. It gives an empty string when no version changed, and `no versions` for a probe with no `engines.json`.
 */
export function engineChange(source: Readonly<Record<string, string>>, probe: Readonly<Record<string, string>> | undefined): string {
  if (probe === undefined) return "no versions";
  return Object.keys(source)
    .filter((name) => probe[name] !== source[name])
    .map((name) => `${name} ${source[name]} to ${probe[name] ?? "none"}`)
    .join(", ");
}

/** This function gives a signed change in MB and in percent, for example `+2 MB (+0.51 %)`. */
function signedChange(from: number, value: number): string {
  const sign = (x: number, text: string) => (x > 0 ? `+${text}` : x < 0 ? `-${text}` : text);
  const mb = value - from;
  const percent = from === 0 ? 0 : (mb / from) * 100;
  return `${sign(mb, String(Math.abs(mb)))} MB (${sign(percent, Math.abs(percent).toFixed(2))} %)`;
}

/**
 * This function gives the change of a probe from the worst probe of the source of its limit, for the live heap and the allocation.
 * For example, `live heap +2 MB (+0.51 %), allocation -14067 MB (-0.56 %)`. A value that the probe or the limit does not have gives no part.
 */
export function limitChange(r: ProbeResult, limit: MemoryLimit): string {
  const parts: string[] = [];
  if (r.liveMaxMb !== undefined && limit.fromLiveMb !== undefined) parts.push(`live heap ${signedChange(limit.fromLiveMb, r.liveMaxMb)}`);
  if (r.allocMb !== undefined && limit.fromAllocMb !== undefined) parts.push(`allocation ${signedChange(limit.fromAllocMb, r.allocMb)}`);
  return parts.join(", ");
}

/** This function gives the reason why a probe breaks its limits, or an empty string. It gives an empty string when the input has no limits. */
function limitReason(r: ProbeResult, limit: MemoryLimit | undefined): string {
  if (limit === undefined) return "";
  const problems: string[] = [];
  if (r.allocMb === undefined) problems.push("no allocation");
  else if (r.allocMb > limit.allocMb) problems.push(`allocation ${r.allocMb} MB, limit ${limit.allocMb} MB`);
  if (r.liveMaxMb === undefined) problems.push("no live heap");
  else if (r.liveMaxMb > limit.liveMaxMb) problems.push(`live heap ${r.liveMaxMb} MB, limit ${limit.liveMaxMb} MB`);
  return problems.join(", ");
}

/** This function gives the versions of a source as text, for example `node 26.13.0, highways 0.10.0, packing 0.5.0`. */
function versionsText(engines: Readonly<Record<string, string>>): string {
  return Object.entries(engines)
    .map(([name, version]) => `${name} ${version}`)
    .join(", ");
}

/**
 * This function gives the gate as Markdown. The text has the result, the count of the failed rows, the versions of the limits, and a table of all rows.
 * When a probe with limits ran on other versions than the source of the limits, the text names each change.
 */
export function gateMarkdown(gate: GateResult): string {
  const failed = gate.rows.filter((r) => r.reason !== "");
  const limited = gate.rows.some((r) => r.change !== "" || r.engines !== "");
  const runs = gate.source.runs.join(" and ");
  const versions = limited
    ? [
        "",
        `The limits come from the runs ${runs}, on commit \`${gate.source.head}\`, with ${versionsText(gate.source.engines)}.`,
        gate.engineChanges.length === 0
          ? "Each probe with limits ran on these versions."
          : `The probes with limits ran on other versions: ${gate.engineChanges.join("; ")}. The live heap is the same in each probe of one seed on one set of versions. Thus this change alone can move a value over its limit. The column "Change" gives the change from the worst probe of the limits. To accept the change, refit the limits on these versions (\`docs/JOINT-BENCH.md\`, "The limits of the memory gate").`,
      ]
    : [];
  return [
    `### Memory gate: ${gate.pass ? "pass" : "fail"}`,
    "",
    `The gate examined ${gate.rows.length} probes, with the limit ${gate.limitMb} MB. ${failed.length} failed.`,
    ...versions,
    "",
    "| Input | Mode | Status | Peak RSS (MB) | Allocation (MB) | Steps | Largest live heap (MB) | Change | Result |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...gate.rows.map((r) => `| ${r.input} | ${r.mode} | ${r.status ?? ""} | ${r.peakRssMb ?? ""} | ${r.allocMb ?? ""} | ${r.steps ?? ""} | ${r.liveMaxMb ?? ""} | ${r.change} | ${r.reason === "" ? "pass" : r.reason} |`),
  ].join("\n") + "\n";
}
