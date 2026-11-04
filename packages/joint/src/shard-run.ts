// The run of one shard of the joint benchmark, with a deadline, and the resume of a run (docs/JOINT-BENCH.md, roadmap item L101).
// A shard writes each pair when the pair ends, so a stop keeps each finished pair. A resume runs only the pairs that a run of the same stamp did not record.
import { createHash } from "node:crypto";

/** The minutes after which a shard of the bench stops at a clean point. The job limit of GitHub is 360 minutes. */
export const SHARD_DEADLINE_MINUTES = 330;

/** The name of the file of the accepted pair lines of a resume. */
export const PRIOR_PAIRS_FILE = "prior-pairs.ndjson";

/** One finished pair of a shard. `wallMs` is the time from the end of the pair before it. The first pair of a pack entry thus holds the time of that pack. */
export interface PairLine {
  readonly stamp: string;
  readonly input: string;
  readonly inputHash: string;
  readonly strategy: string;
  readonly wallMs: number;
  /** The kind of a pair that did not finish. Its `wallMs` is no measurement of the pair, so the costs leave it out. */
  readonly tag?: "over-budget" | "not-run";
}

/** The counts of one shard. `stopped` is true when the deadline stopped the shard. */
export interface ShardCount {
  readonly pairsDone: number;
  readonly pairsMissing: number;
  readonly stopped: boolean;
}

/** One input of a shard. `row` holds the facts of the caller for the run of the input. */
export interface ShardRow<R> {
  readonly id: string;
  readonly inputHash: string;
  readonly row: R;
}

/** The arguments of `runShard`. */
export interface ShardOptions<R> {
  readonly rows: readonly ShardRow<R>[];
  /** The ids of the pairs of each input. */
  readonly pairs: readonly string[];
  /** The count of the records of each input after `pairs`: its lane pairs and its iteration pairs. The default is 0. */
  readonly extra?: number;
  /** The pairs that a run with the same stamp recorded, from `doneKey`. */
  readonly done: ReadonlySet<string>;
  readonly stamp: string;
  /** The time from the start of the shard at which it stops, in milliseconds. */
  readonly deadlineMs: number;
  /** The clock in milliseconds. */
  readonly now: () => number;
  /** This function runs one input. `missing` is undefined when each pair of the input is missing. */
  readonly runPairs: (row: R, missing: readonly string[] | undefined) => Iterable<{ readonly record: { readonly strategy: string } }>;
  /** This function writes one finished pair. It must not return before the pair is on the disk. */
  readonly write: <T extends { readonly strategy: string }>(record: T, line: PairLine) => void;
  /** This function is called after an input that the deadline did not cut. */
  readonly onInput?: (row: R, ms: number) => void;
}

/** This function gives the key of a pair of an input. */
export function doneKey(input: string, strategy: string): string {
  return `${input}\n${strategy}`;
}

/**
 * This function gives the stamp of a run: the first 16 hex characters of the SHA-256 of its facts, in the order of their names.
 * Only records of the same stamp join, so no result of another epoch or space joins.
 */
export function runStamp(facts: Readonly<Record<string, string>>): string {
  const sorted = Object.keys(facts).sort().map((name) => [name, facts[name]]);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 16);
}

/**
 * This function runs the missing pairs of each input and writes each pair when it ends.
 * It examines the deadline after each pair, so a pair runs to its end. After the deadline, it counts the pairs that did not run and returns.
 */
export function runShard<R>(options: ShardOptions<R>): ShardCount {
  const { rows, pairs, done, stamp, deadlineMs, now } = options;
  const extra = options.extra ?? 0;
  const start = now();
  let pairsDone = 0;
  let pairsMissing = 0;
  let stopped = false;
  for (const { id, inputHash, row } of rows) {
    const missing = pairs.filter((pair) => !done.has(doneKey(id, pair)));
    if (missing.length === 0) continue;
    const want = missing.length + extra;
    stopped ||= now() - start >= deadlineMs;
    if (stopped) {
      pairsMissing += want;
      continue;
    }
    const t0 = now();
    let last = t0;
    let ran = 0;
    for (const { record } of options.runPairs(row, missing.length === pairs.length ? undefined : missing)) {
      const end = now();
      options.write(record, { stamp, input: id, inputHash, strategy: record.strategy, wallMs: end - last });
      ran += 1;
      pairsDone += 1;
      last = end;
      if (end - start >= deadlineMs) {
        stopped = true;
        break;
      }
    }
    pairsMissing += Math.max(0, want - ran);
    if (ran >= want) options.onInput?.(row, now() - t0);
  }
  return { pairsDone, pairsMissing, stopped };
}

/** The pair lines of a text, the count of the lines of another stamp, and the count of the lines that are not whole. The last line of a stopped job can be cut. */
export interface PairLines {
  readonly lines: readonly PairLine[];
  readonly otherStamp: number;
  readonly broken: number;
}

/** This function reads the text of a pair file. It keeps the lines of `stamp`. */
export function parsePairLines(text: string, stamp: string): PairLines {
  const lines: PairLine[] = [];
  let otherStamp = 0;
  let broken = 0;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    let line: PairLine;
    try {
      line = JSON.parse(raw) as PairLine;
    } catch {
      broken += 1;
      continue;
    }
    if (typeof line.input !== "string" || typeof line.strategy !== "string" || !(Number.isFinite(line.wallMs) && line.wallMs >= 0)) broken += 1;
    else if (line.stamp !== stamp) otherStamp += 1;
    else lines.push(line);
  }
  return { lines, otherStamp, broken };
}

/**
 * This function gives the lines of a record file that a resume keeps: each line of an accepted pair, one time only.
 * `seen` holds the pairs of the files before this one, and the function adds to it. A line that is not whole goes out.
 */
export function keptRecordLines(text: string, accepted: ReadonlySet<string>, seen: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    let record: { readonly input?: unknown; readonly strategy?: unknown };
    try {
      record = JSON.parse(raw) as typeof record;
    } catch {
      continue;
    }
    const key = doneKey(String(record.input), String(record.strategy));
    if (!accepted.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** The whole lines of a record file and a pair file, and the keys of their pairs. */
export interface RepairedShard {
  readonly records: string;
  readonly pairs: string;
  readonly keys: ReadonlySet<string>;
}

/** This function gives the files of a shard after a stop: a pair with a whole record and a whole pair line stays, and each other line goes out. */
export function repairShard(recordText: string, pairText: string, stamp: string): RepairedShard {
  const { lines } = parsePairLines(pairText, stamp);
  const keys = new Set<string>();
  const records = keptRecordLines(recordText, new Set(lines.map((line) => doneKey(line.input, line.strategy))), keys);
  const kept = lines.filter((line) => keys.has(doneKey(line.input, line.strategy)));
  const text = (rows: readonly string[]): string => rows.map((row) => `${row}\n`).join("");
  return { records: text(records), pairs: text(kept.map((line) => JSON.stringify(line))), keys };
}

/** The measured cost of each pair against the plan: the sum of its wall times over the sum of its planned times. `fallback` is the same ratio over all pairs. */
export interface PairFactors {
  readonly factors: ReadonlyMap<string, number>;
  readonly fallback: number;
}

/** This function gives the factors of the pairs. `planned` gives the planned time of one pair on an input, in milliseconds. A line of an unknown input does not count. */
export function pairFactors(lines: readonly PairLine[], planned: (input: string) => number | undefined): PairFactors {
  const walls = new Map<string, { wall: number; plan: number }>();
  let wall = 0;
  let plan = 0;
  for (const line of lines) {
    const unit = planned(line.input);
    if (unit === undefined || line.tag !== undefined) continue;
    const entry = walls.get(line.strategy) ?? { wall: 0, plan: 0 };
    entry.wall += line.wallMs;
    entry.plan += unit;
    walls.set(line.strategy, entry);
    wall += line.wallMs;
    plan += unit;
  }
  const factors = new Map<string, number>();
  for (const [strategy, entry] of walls) if (entry.plan > 0) factors.set(strategy, entry.wall / entry.plan);
  return { factors, fallback: plan > 0 ? wall / plan : 1 };
}

/** This function gives the planned time of the missing pairs of an input. Each pair costs the planned time of one pair, times the factor of that pair. */
export function measuredCost(unit: number, missing: readonly string[], factors: PairFactors): number {
  return missing.reduce((sum, pair) => sum + unit * (factors.factors.get(pair) ?? factors.fallback), 0);
}

/** The wall time of one strategy over all its lines. */
export interface StrategyCost {
  readonly strategy: string;
  readonly pairs: number;
  readonly ms: number;
  readonly slowestMs: number;
  readonly slowestInput: string;
}

/** This function gives the wall time of each strategy, from the most time to the least. Equal times go in the order of the ids. */
export function strategyCosts(lines: readonly PairLine[]): StrategyCost[] {
  const costs = new Map<string, StrategyCost>();
  for (const line of lines) {
    if (line.tag !== undefined) continue;
    const c = costs.get(line.strategy);
    const slower = c === undefined || line.wallMs > c.slowestMs;
    costs.set(line.strategy, {
      strategy: line.strategy,
      pairs: (c?.pairs ?? 0) + 1,
      ms: (c?.ms ?? 0) + line.wallMs,
      slowestMs: slower ? line.wallMs : c.slowestMs,
      slowestInput: slower ? line.input : c.slowestInput,
    });
  }
  return [...costs.values()].sort((a, b) => b.ms - a.ms || (a.strategy < b.strategy ? -1 : 1));
}

/** This function gives the Markdown table of the first `top` strategy costs, with the share of each strategy. */
export function strategyCostTable(costs: readonly StrategyCost[], top: number): string {
  const all = costs.reduce((sum, c) => sum + c.ms, 0);
  const rows = costs.slice(0, top).map((c) => {
    const share = all > 0 ? ((100 * c.ms) / all).toFixed(1) : "0.0";
    return `| ${c.strategy} | ${c.pairs} | ${(c.ms / 60000).toFixed(1)} | ${share} % | ${(c.slowestMs / 60000).toFixed(1)} | ${c.slowestInput} |`;
  });
  return ["| Pair | Inputs | Minutes | Share | Slowest minutes | Slowest input |", "| --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
}
