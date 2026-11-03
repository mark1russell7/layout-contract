// The paired-time arms of the joint bench (L84): the candidate pair and the A/A pair, each arm in its own fresh process (`docs/JOINT-BENCH.md`, "The Time row").
// rigor-bench gives the fresh runner, the order of the arms, the balance of the orders, the pooled verdict and the guard of the jobs.
// This file gives only the parts of the joint bench: the settings, the entries, the cases, the run options, the records and the Markdown.
import { pooledVerdict, type JobRecords, type TimeOutcome, type TimeVerdict } from "@mark1russell7/rigor-bench";
import type { FreshOptions, FreshRecord, FreshRun, FreshSkip } from "@mark1russell7/rigor-bench/fresh";
import { BASELINE } from "./analysis.ts";
import { iterEntries, laneEntries } from "./lanes.ts";
import { PACK_ENTRIES, PAIR_SEPARATOR, pairId, ROUTERS, type RunOptions } from "./runner.ts";

/** The settings of the time arms of a bench. Each value is a named setting, and the result writes each value that it uses. */
export interface TimeSettings {
  /**
   * The half width on a log scale of the ratios that the rule `difference` of rigor-bench calls `same`.
   * An interval of the candidate median over the A/A median in `[exp(-timeMargin), exp(timeMargin)]` is `same`.
   */
  readonly timeMargin: number;
  /** The count of the cases (inputs) of each job. The power test of rigor-bench finds a true 7% speedup with power 0.71 at 20 cases. */
  readonly cases: number;
  /** The count of the rounds of each case in each job. */
  readonly rounds: number;
  /** The count of the CI jobs. Each job runs each case and each round on its own runner. */
  readonly jobs: number;
  /** The largest count of boxes of a case. An input of 1000 boxes takes seconds to minutes for each arm, so the default cases leave them out. */
  readonly maxBoxes: number;
}

/** The time settings of the joint bench. A change of a value is a measured decision, as for a parameter of `docs/PROMOTION.md`. */
export const JOINT_TIME: TimeSettings = Object.freeze({ timeMargin: 0.05, cases: 20, rounds: 5, jobs: 5, maxBoxes: 100 });

/** The default entry of the time arms: the baseline pair of the joint bench, `rows+portfolio` (`BASELINE`). Arm `a` of each pair runs it. */
export const TIME_DEFAULT: string = BASELINE;

/** The mode of the time arms: each arm runs in a fresh process (the mode `fresh` of `paired-time/1`). The file `meta.json` of a job writes it. */
export const TIME_MODE = "fresh";

/** The two pairs of a round: the candidate pair (the default against the candidate) and the A/A pair (the default against a copy of the default). */
export type TimeKind = "candidate" | "aa";

/**
 * One paired-time record of the joint bench: the record of `freshRun`, with the kind of its pair and the entries of its arms.
 * The record of `freshRun` has the label of the job and the computer of the job (`benchEnv`).
 */
export interface TimeRecord extends FreshRecord {
  readonly kind: TimeKind;
  /** The entry of arm `a`: the default. */
  readonly baseline: string;
  /** The entry of arm `b`: the candidate, or the default in the A/A pair. */
  readonly candidate: string;
}

/** The records of one CI job, as its artifact keeps them: the label of the job from `meta.json`, its records and its skipped cases. */
export interface TimeJob {
  /** The label of the job. `pooledVerdict` of rigor-bench refuses a record with another label. */
  readonly job: string;
  readonly records: readonly TimeRecord[];
  /** The cases that the job skipped, as `freshRun` gives them. No job keeps a record of these cases in the verdict. */
  readonly skipped: readonly FreshSkip[];
}

/** The plan of the time arms of one CI job. */
export interface TimePlan {
  /** The default entry: arm `a` of each pair. */
  readonly baseline: string;
  /** The candidate entry: arm `b` of the candidate pair. */
  readonly candidate: string;
  /** The program and the script of the command `arm`, for example `process.execPath` and the path of `scripts/time-arms.ts`. */
  readonly arm: readonly string[];
  /** The input ids of the cases. */
  readonly cases: readonly string[];
  /** The input file of each case, in the order of `cases`. */
  readonly files: readonly string[];
  /** The count of the rounds of the job. */
  readonly rounds: number;
  /** The index of the CI job, from 0. */
  readonly job: number;
}

/**
 * This function gives the options of `freshRun` of rigor-bench for one CI job.
 * - The base arm is the default, and the one candidate is the candidate entry. `freshRun` adds the A/A pair of the default.
 * - The child of an arm is the command `arm --pair <entry>` with the arguments `--input <file>` of the case.
 * - The rounds of job `j` start at the global round `j * rounds`. Thus the merged records have one record for each case and round.
 */
export function timeFreshOptions(plan: TimePlan): FreshOptions {
  if (plan.files.length !== plan.cases.length) throw new RangeError(`The plan has ${plan.cases.length} cases and ${plan.files.length} input files.`);
  const files = new Map(plan.cases.map((id, i) => [id, plan.files[i]!]));
  const arm = (id: string): FreshOptions["base"] => ({ id, command: [...plan.arm, "arm", "--pair", id] });
  return {
    base: arm(plan.baseline),
    candidates: [arm(plan.candidate)],
    cases: plan.cases,
    rounds: plan.rounds,
    roundOffset: plan.job * plan.rounds,
    job: String(plan.job),
    args: (id) => ["--input", files.get(id)!],
  };
}

/**
 * This function gives the records of a fresh run for the files `paired.jsonl` and `aa.jsonl`.
 * The pair of the candidate has the id of the candidate. The A/A pair has the id `<baseline>~aa` of `freshRun`.
 */
export function timeRecords(run: FreshRun, baseline: string, candidate: string): { readonly paired: TimeRecord[]; readonly aa: TimeRecord[] } {
  const of = (pair: string, kind: TimeKind, b: string): TimeRecord[] => {
    const records = run.pairs[pair];
    if (records === undefined) throw new RangeError(`The fresh run has no pair ${pair}. Its pairs are ${Object.keys(run.pairs).join(", ")}.`);
    return records.map((r) => ({ ...r, kind, baseline, candidate: b }));
  };
  return { paired: of(candidate, "candidate", candidate), aa: of(`${baseline}~aa`, "aa", baseline) };
}

/**
 * This function gives the run options of one entry: a pair id of the joint bench, for example `rows+portfolio`.
 * A lane pair (L13) and an iteration pair (L11) get their own entry. The other pairs get the pack entry and the router of their id.
 * An unknown pair is an error.
 */
export function timeRunOptions(pair: string): RunOptions {
  const lane = laneEntries().find((l) => pairId(l.id, l.router) === pair);
  if (lane !== undefined) return { packs: [], routers: [], pairs: [pair], lanes: [lane] };
  const iter = iterEntries().find((i) => pairId(i.id, i.router) === pair);
  if (iter !== undefined) return { packs: [], routers: [], pairs: [pair], iterate: [iter] };
  const cut = pair.lastIndexOf(PAIR_SEPARATOR);
  const pack = PACK_ENTRIES.find((p) => p.id === pair.slice(0, cut));
  const router = pair.slice(cut + 1);
  if (cut < 0 || pack === undefined || !ROUTERS.includes(router)) throw new RangeError(`The entry "${pair}" is not a pair of the joint bench, a lane pair or an iteration pair.`);
  return { packs: [pack], routers: [router], pairs: [pair] };
}

/** A candidate case of the time arms: one input of the corpus, with its counts and its planned cost (`plannedCost`). */
export interface TimeCaseRow {
  readonly id: string;
  readonly boxes: number;
  readonly edges: number;
  readonly cost: number;
}

/**
 * This function gives the ids of `count` cases. The cases are the inputs with edges and with 2 to `maxBoxes` boxes.
 * It sorts them by the planned cost and then by the id. It takes inputs at equal steps from the least cost to the most.
 * Thus the cases cover the small and the large inputs, and nobody picks them by hand.
 */
export function timeCases(rows: readonly TimeCaseRow[], count: number, maxBoxes: number): string[] {
  if (!(Number.isInteger(count) && count >= 1)) throw new RangeError(`The count of the cases is an integer of 1 or more, not ${count}.`);
  const pool = rows.filter((r) => r.boxes >= 2 && r.boxes <= maxBoxes && r.edges > 0).sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (pool.length < count) throw new RangeError(`The corpus has ${pool.length} inputs with edges and 2 to ${maxBoxes} boxes, fewer than the ${count} cases.`);
  if (count === 1) return [pool[0]!.id];
  return Array.from({ length: count }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (count - 1))]!.id);
}

/** The verdict of one job alone. The result keeps it for each job, and the outcome of the result uses all jobs together. */
export interface JobTime {
  readonly job: string;
  readonly cpu: string;
  readonly outcome: TimeOutcome;
  readonly cases: number;
  /** The ends of the interval of the job against its A/A arm, or `null` without an A/A band. */
  readonly low: number | null;
  readonly high: number | null;
}

/** The result of the Time row of the joint bench. */
export interface JointTimeResult {
  readonly schema: "joint-time/2";
  /** The outcome of `pooledVerdict` of rigor-bench over the records of all jobs, with the rule `difference`. */
  readonly outcome: TimeOutcome;
  /** This field is `false` for `cannot decide`. A candidate without a decision does not promote. */
  readonly decided: boolean;
  readonly reason: string;
  readonly rule: TimeVerdict["rule"];
  /** The value of `timeMargin` that the verdict used. */
  readonly timeMargin: number;
  readonly baseline: string;
  readonly candidate: string;
  /** The count of the cases of the candidate pair and of the A/A pair. */
  readonly cases: number;
  readonly aaCases: number;
  /** The least and the largest count of the rounds of a case, over the jobs. */
  readonly rounds: { readonly min: number; readonly max: number };
  /** The labels of the jobs. */
  readonly jobs: readonly string[];
  /** The CPU models of the records. */
  readonly cpus: readonly string[];
  /** The interval of the candidate median ratio over the A/A median ratio, or `null` without one. */
  readonly interval: { readonly estimate: number; readonly low: number; readonly high: number; readonly level: number; readonly runs: number } | null;
  /** The median ratio of the A/A cases, or `null` without an A/A band. A value far from 1 shows a bias of the order or of the arm slots. */
  readonly aaMedian: number | null;
  /** The count of the records that `balanceOrders` of rigor-bench removed, so that the order of each merged case turns. It is 0 when each job ran each round. */
  readonly trimmed: number;
  /** The cases that a job skipped, in sorted order. `pooledVerdict` removes them from all jobs. */
  readonly dropped: readonly string[];
  readonly perJob: readonly JobTime[];
  /** The outcome of the pooled records before the guard of the jobs. It differs from `outcome` only when a job decides the opposite direction. */
  readonly pooledOutcome: TimeOutcome;
  /** The jobs whose own outcome is the opposite direction of the pooled outcome: `slower` against `faster`, or `faster` against `slower`. */
  readonly opposed: readonly string[];
  /** The steps of the verdict, in words, with the values. */
  readonly derivation: readonly string[];
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** This function orders the labels of the jobs by their numbers: "2" comes before "10". */
const byLabel = (x: string, y: string): number => x.localeCompare(y, "en", { numeric: true });

/**
 * This function gives the Time row of a candidate from the records of all jobs. It calls `pooledVerdict` of rigor-bench with the rule `difference`.
 * - Each job gives its label, its records of the kind `candidate`, its records of the kind `aa` and its skipped cases.
 * - `pooledVerdict` refuses a record with the label of another job. It removes each skipped case from all jobs.
 * - `pooledVerdict` balances the orders, and a job against the pooled direction makes the outcome `cannot decide`.
 * - All records of the candidate pair have one baseline and one candidate. The A/A records have that baseline in their two arms.
 * - `settings.timeMargin` is the margin of the verdict, and the result writes it.
 */
export function jointTimeVerdict(jobs: readonly TimeJob[], settings: Pick<TimeSettings, "timeMargin">): JointTimeResult {
  const sorted = [...jobs].sort((x, y) => byLabel(x.job, y.job));
  const records = sorted.flatMap((j) => j.records);
  const other = records.find((r) => r.kind !== "candidate" && r.kind !== "aa");
  if (other !== undefined) throw new RangeError(`A time record has the kind "${String(other.kind)}", not candidate or aa.`);
  const pairs = records.filter((r) => r.kind === "candidate");
  const names = new Set(pairs.map((r) => `${r.baseline} ${r.candidate}`));
  if (names.size > 1) throw new RangeError(`The records have ${names.size} candidate pairs: ${[...names].join(", ")}. A verdict reads one pair.`);
  const baseline = pairs[0]?.baseline ?? records[0]?.baseline ?? "";
  const candidate = pairs[0]?.candidate ?? "";
  const strange = records.find((r) => r.kind === "aa" && (r.baseline !== baseline || r.candidate !== baseline));
  if (strange !== undefined) throw new RangeError(`An A/A record has the arms ${strange.baseline} and ${strange.candidate}, not two copies of ${baseline}.`);
  const input = sorted.map(
    (j): JobRecords => ({ job: j.job, candidate: j.records.filter((r) => r.kind === "candidate"), aa: j.records.filter((r) => r.kind === "aa"), skipped: j.skipped }),
  );
  const v = pooledVerdict(input, { margin: settings.timeMargin });
  const { pooled } = v;
  const gone = new Set(v.dropped);
  const aaKept = records.filter((r) => r.kind === "aa" && !gone.has(r.case));
  const aaCases = new Set(aaKept.map((r) => r.case)).size;
  const perJob = v.jobs.map(({ job, verdict: jv }): JobTime => {
    const cpu = records.find((r) => r.job === job)?.env.cpu ?? "unknown";
    const ends = jv.band === undefined || jv.interval === undefined ? null : jv.interval;
    return { job, cpu, outcome: jv.outcome, cases: jv.cases.length, low: ends === null ? null : r4(ends.low), high: ends === null ? null : r4(ends.high) };
  });
  const labels = sorted.map((j) => j.job);
  const rounds = pooled.cases.map((c) => c.rounds);
  const interval = pooled.band === undefined || pooled.interval === undefined ? null : pooled.interval;
  const derivation = [
    `The ratio of each case is exp(median(log(b / a))) over its rounds, with arm a the default ${baseline} and arm b the candidate ${candidate}.`,
    v.dropped.length === 0 ? "No job skipped a case." : `The jobs skipped the cases ${v.dropped.join(", ")}. Thus the verdict uses no record of these cases from any job.`,
    `The candidate pair has ${pooled.cases.length} cases. The A/A pair has ${aaCases} cases and ${aaKept.length} records, from the jobs ${labels.join(", ")}. The balance of the orders removed ${v.trimmed} records.`,
    `The rule ${pooled.rule} gives the bootstrap interval of the median log ratio of the candidate minus the median log ratio of the A/A pair.`,
    interval === null
      ? "The verdict has no interval against the A/A arm."
      : `The interval of the ratio is ${r4(interval.low)} to ${r4(interval.high)} at the level ${interval.level}, and the A/A median ratio is ${r4(pooled.band!.median)}.`,
    `The margin timeMargin is ${settings.timeMargin}. Thus same is an interval in [${r4(Math.exp(-settings.timeMargin))}, ${r4(Math.exp(settings.timeMargin))}].`,
    `The pooled outcome is ${pooled.outcome}. ${pooled.reason}`,
    v.opposed.length > 0 ? `The jobs ${v.opposed.join(", ")} give the opposite direction of the pooled outcome. Thus the outcome is cannot decide.` : "No job gives the opposite direction of the pooled outcome.",
  ];
  return {
    schema: "joint-time/2",
    outcome: v.outcome,
    decided: v.outcome !== "cannot decide",
    reason: v.reason,
    rule: pooled.rule,
    timeMargin: settings.timeMargin,
    baseline,
    candidate,
    cases: pooled.cases.length,
    aaCases,
    rounds: { min: rounds.length === 0 ? 0 : Math.min(...rounds), max: rounds.length === 0 ? 0 : Math.max(...rounds) },
    jobs: labels,
    cpus: [...new Set(records.map((r) => r.env.cpu))].sort(),
    interval: interval === null ? null : { estimate: r4(interval.estimate), low: r4(interval.low), high: r4(interval.high), level: interval.level, runs: interval.runs },
    aaMedian: pooled.band === undefined ? null : r4(pooled.band.median),
    trimmed: v.trimmed,
    dropped: v.dropped,
    perJob,
    pooledOutcome: pooled.outcome,
    opposed: v.opposed,
    derivation,
  };
}

/** This function gives the Markdown of a Time row result, for the summary of a CI job. */
export function timeMarkdown(result: JointTimeResult): string {
  return [
    `### Time row: ${result.candidate} against ${result.baseline}`,
    "",
    `**${result.outcome}**${result.decided ? "" : " (no promotion)"}. ${result.reason}`,
    "",
    `The margin is timeMargin = ${result.timeMargin}. The run has ${result.cases} cases, ${result.aaCases} A/A cases, ${result.rounds.min} to ${result.rounds.max} rounds for each case and the jobs ${result.jobs.join(", ")}.`,
    "",
    `The skipped cases (dropped from all jobs): ${result.dropped.length === 0 ? "none" : result.dropped.join(", ")}. The balance of the orders removed ${result.trimmed} records.`,
    "",
    "| Job | CPU | Outcome of the job alone | Cases | Interval |",
    "| --- | --- | --- | --- | --- |",
    ...result.perJob.map((j) => `| ${j.job} | ${j.cpu.trim()} | ${j.outcome} | ${j.cases} | ${j.low === null ? "" : `${j.low} to ${j.high}`} |`),
    "",
    ...result.derivation.map((d) => `- ${d}`),
    "",
  ].join("\n");
}
