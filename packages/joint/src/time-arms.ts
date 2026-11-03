// The paired-time arms of the joint bench (L84): the candidate pair and the A/A pair, each arm in its own fresh process (`docs/JOINT-BENCH.md`, "The Time row").
// rigor-bench gives the records, the order of the arms and the verdict. This file gives only the parts of the joint bench: the entries, the cases and the settings.
import type { RunEnv } from "@mark1russell7/layout-contract";
import { firstArm, timeVerdict, type Arm, type PairedTime, type TimeOutcome, type TimeVerdict } from "@mark1russell7/rigor-bench";
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

/** The mode of the time records: each arm runs in a fresh process (the mode `fresh` of `paired-time/1`). */
export const TIME_MODE = "fresh";

/** The two pairs of a round: the candidate pair (the default against the candidate) and the A/A pair (the default against a copy of the default). */
export type TimeKind = "candidate" | "aa";

/** One paired-time record of the joint bench: the record of rigor-bench, with the job, the entries and the facts of the computer. */
export interface TimeRecord extends PairedTime {
  readonly kind: TimeKind;
  /** The index of the CI job, from 0. */
  readonly job: number;
  /** The entry of arm `a`: the default. */
  readonly baseline: string;
  /** The entry of arm `b`: the candidate, or the default in the A/A pair. */
  readonly candidate: string;
  /** The facts of the computer, with the mode `fresh` and the context of the run. */
  readonly env: RunEnv;
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

/** One timed arm of a round: the pair that it belongs to, and its arm of that pair. */
export interface ArmSlot {
  readonly kind: TimeKind;
  readonly arm: Arm;
}

/**
 * This function gives the order of the 4 arms of one case in one round. `round` is the global round: the job times the rounds of a job, plus the round of the job.
 * - The candidate pair starts with `firstArm(round, caseIndex)`, and the A/A pair starts with `firstArm(round, caseIndex + 1)`.
 * - The pair that runs first turns each second round, so the 4 orders of the two pairs come in each 4 rounds.
 */
export function timeArmOrder(round: number, caseIndex: number): ArmSlot[] {
  const pair = (kind: TimeKind, first: Arm): ArmSlot[] => [
    { kind, arm: first },
    { kind, arm: first === "a" ? "b" : "a" },
  ];
  const candidate = pair("candidate", firstArm(round, caseIndex));
  const aa = pair("aa", firstArm(round, caseIndex + 1));
  return (Math.floor(round / 2) + caseIndex) % 2 === 0 ? [...candidate, ...aa] : [...aa, ...candidate];
}

/** The verdict of one job alone. The result keeps it for each job, and the outcome of the result uses all jobs together. */
export interface JobTime {
  readonly job: number;
  readonly cpu: string;
  readonly outcome: TimeOutcome;
  readonly cases: number;
  /** The ends of the interval of the job against its A/A arm, or `null` without an A/A band. */
  readonly low: number | null;
  readonly high: number | null;
}

/** The result of the Time row of the joint bench. */
export interface JointTimeResult {
  readonly schema: "joint-time/1";
  /** The outcome of the rule `difference` of rigor-bench over the records of all jobs. */
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
  /** The jobs of the records. */
  readonly jobs: readonly number[];
  /** The CPU models and the modes of the records. */
  readonly cpus: readonly string[];
  readonly modes: readonly string[];
  /** The interval of the candidate median ratio over the A/A median ratio, or `null` without one. */
  readonly interval: { readonly estimate: number; readonly low: number; readonly high: number; readonly level: number; readonly runs: number } | null;
  /** The median ratio of the A/A cases, or `null` without an A/A band. A value far from 1 shows a bias of the order or of the arm slots. */
  readonly aaMedian: number | null;
  /** The count of the records that `balanceOrders` removed, so that the order of each merged case turns. It is 0 when each job ran each round. */
  readonly removed: number;
  readonly perJob: readonly JobTime[];
  /** The steps of the verdict, in words, with the values. */
  readonly derivation: readonly string[];
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * This function gives the records of each case with a turned order over the merged jobs, and the count of the records that it removes.
 * A job with an odd count of rounds starts one more round with one arm. Thus a missing job or a job that stopped early can leave a case with 2 more rounds of one order.
 * `caseRatios` of rigor-bench refuses such a case. This function removes the records of the larger order with the highest rounds, until the two counts differ by 1 or less.
 */
export function balanceOrders<T extends PairedTime>(records: readonly T[]): { readonly records: T[]; readonly removed: number } {
  const byCase = new Map<string, T[]>();
  for (const r of records) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
  const drop = new Set<T>();
  for (const list of byCase.values()) {
    const a = list.filter((r) => r.first === "a").sort((x, y) => y.round - x.round);
    const b = list.filter((r) => r.first === "b").sort((x, y) => y.round - x.round);
    const [more, fewer] = a.length > b.length ? [a, b] : [b, a];
    for (const r of more.slice(0, Math.max(0, more.length - fewer.length - 1))) drop.add(r);
  }
  return { records: records.filter((r) => !drop.has(r)), removed: drop.size };
}

/**
 * This function gives the Time row of a candidate from the merged records of all jobs. It calls `timeVerdict` of rigor-bench with the rule `difference`.
 * - The records of the kind `candidate` are the candidate pair, and the records of the kind `aa` are the A/A pair.
 * - All records of the candidate pair have one baseline and one candidate. The A/A records have that baseline in their two arms.
 * - `settings.timeMargin` is the margin of the verdict, and the result writes it.
 */
export function jointTimeVerdict(records: readonly TimeRecord[], settings: Pick<TimeSettings, "timeMargin">): JointTimeResult {
  const pairsBalanced = balanceOrders(records.filter((r) => r.kind === "candidate"));
  const aaBalanced = balanceOrders(records.filter((r) => r.kind === "aa"));
  const pairs = pairsBalanced.records;
  const aa = aaBalanced.records;
  const removed = pairsBalanced.removed + aaBalanced.removed;
  const other = records.find((r) => r.kind !== "candidate" && r.kind !== "aa");
  if (other !== undefined) throw new RangeError(`A time record has the kind "${String(other.kind)}", not candidate or aa.`);
  const names = new Set(pairs.map((r) => `${r.baseline} ${r.candidate}`));
  if (names.size > 1) throw new RangeError(`The records have ${names.size} candidate pairs: ${[...names].join(", ")}. A verdict reads one pair.`);
  const baseline = pairs[0]?.baseline ?? aa[0]?.baseline ?? "";
  const candidate = pairs[0]?.candidate ?? "";
  const strange = aa.find((r) => r.baseline !== baseline || r.candidate !== baseline);
  if (strange !== undefined) throw new RangeError(`An A/A record has the arms ${strange.baseline} and ${strange.candidate}, not two copies of ${baseline}.`);
  const options = { margin: settings.timeMargin };
  const verdict = timeVerdict(pairs, aa, options);
  const jobs = [...new Set(records.map((r) => r.job))].sort((x, y) => x - y);
  const perJob = jobs.map((job): JobTime => {
    const v = timeVerdict(
      records.filter((r) => r.kind === "candidate" && r.job === job),
      records.filter((r) => r.kind === "aa" && r.job === job),
      options,
    );
    const cpu = records.find((r) => r.job === job)?.env.cpu ?? "unknown";
    return { job, cpu, outcome: v.outcome, cases: v.cases.length, low: v.band === undefined || v.interval === undefined ? null : r4(v.interval.low), high: v.band === undefined || v.interval === undefined ? null : r4(v.interval.high) };
  });
  const rounds = verdict.cases.map((c) => c.rounds);
  const aaCases = new Set(aa.map((r) => r.case)).size;
  const interval = verdict.band === undefined || verdict.interval === undefined ? null : verdict.interval;
  const derivation = [
    `The ratio of each case is exp(median(log(b / a))) over its rounds, with arm a the default ${baseline} and arm b the candidate ${candidate}.`,
    `The candidate pair has ${verdict.cases.length} cases and ${pairs.length} records. The A/A pair has ${aaCases} cases and ${aa.length} records, from the jobs ${jobs.join(", ")}. The balance of the orders removed ${removed} records.`,
    `The rule ${verdict.rule} gives the bootstrap interval of the median log ratio of the candidate minus the median log ratio of the A/A pair.`,
    interval === null
      ? "The verdict has no interval against the A/A arm."
      : `The interval of the ratio is ${r4(interval.low)} to ${r4(interval.high)} at the level ${interval.level}, and the A/A median ratio is ${r4(verdict.band!.median)}.`,
    `The margin timeMargin is ${settings.timeMargin}. Thus same is an interval in [${r4(Math.exp(-settings.timeMargin))}, ${r4(Math.exp(settings.timeMargin))}].`,
    `The outcome is ${verdict.outcome}. ${verdict.reason}`,
  ];
  return {
    schema: "joint-time/1",
    outcome: verdict.outcome,
    decided: verdict.outcome !== "cannot decide",
    reason: verdict.reason,
    rule: verdict.rule,
    timeMargin: settings.timeMargin,
    baseline,
    candidate,
    cases: verdict.cases.length,
    aaCases,
    rounds: { min: rounds.length === 0 ? 0 : Math.min(...rounds), max: rounds.length === 0 ? 0 : Math.max(...rounds) },
    jobs,
    cpus: [...new Set(records.map((r) => r.env.cpu))].sort(),
    modes: [...new Set(records.map((r) => r.env.mode ?? "none"))].sort(),
    interval: interval === null ? null : { estimate: r4(interval.estimate), low: r4(interval.low), high: r4(interval.high), level: interval.level, runs: interval.runs },
    aaMedian: verdict.band === undefined ? null : r4(verdict.band.median),
    removed,
    perJob,
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
    `The margin is timeMargin = ${result.timeMargin}. The run has ${result.cases} cases, ${result.aaCases} A/A cases, ${result.rounds.min} to ${result.rounds.max} rounds for each case, the jobs ${result.jobs.join(", ")} and the modes ${result.modes.join(", ")}.`,
    "",
    "| Job | CPU | Outcome of the job alone | Cases | Interval |",
    "| --- | --- | --- | --- | --- |",
    ...result.perJob.map((j) => `| ${j.job} | ${j.cpu.trim()} | ${j.outcome} | ${j.cases} | ${j.low === null ? "" : `${j.low} to ${j.high}`} |`),
    "",
    ...result.derivation.map((d) => `- ${d}`),
    "",
  ].join("\n");
}
