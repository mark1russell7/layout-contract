// The deadline inside a shard of the sweep (roadmap item L115, `docs/SWEEP.md`).
// A parent process holds a child to one fixed budget for the whole shard, also during the first unit. The parent then keeps each whole record line, and it writes a censored row.
// A job that the limit of 120 minutes cancels leaves no artifact. Thus no finished record may depend on the end of the job.

/** The id of the one supervised case of a shard. The child starts this case once, so the budget is a deadline from the start of the shard. */
export const SHARD_CASE = "shard";

/** The parts of a plan that a stop reads. */
export interface StopPlan {
  readonly round: number;
  readonly loads: readonly number[];
  readonly shards: readonly (readonly string[])[];
  readonly units: readonly { readonly id: string; readonly input: string; readonly configs: readonly string[] }[];
}

/** The reason for the end of a shard with a unit in progress. */
export type ShardStopReason = "hard deadline" | "child failed";

/** The row of a unit that a stop did not let end. No value of a config reads this row. */
export interface CensoredUnit {
  readonly unit: string;
  readonly input: string;
  /** The configs of the unit that have no record. */
  readonly configs: readonly string[];
  /** A lower bound of the time of the unit: its start to the stop. */
  readonly atLeastMs: number;
  readonly reason: ShardStopReason;
}

/**
 * This function gives the minutes that a shard held its job. A hard stop keeps the unit in progress out of `real`, so a total of a night reads `elapsedMinutes` for that shard.
 * The cost history reads `real`, because its ratio is over the planned minutes of the units that ended.
 */
export function shardWallMinutes(shard: { readonly real: number; readonly elapsedMinutes?: number }): number {
  return shard.elapsedMinutes ?? shard.real;
}

/** The shard file of a run. */
export interface ShardFile {
  readonly round: number;
  readonly shard: number;
  /** The planned minutes of the shard. */
  readonly planned: number;
  /** The real minutes of the units that ended. With a unit in progress, the time of that unit is not in this count. */
  readonly real: number;
  readonly stopped?: true;
  readonly done?: number;
  readonly units?: number;
  readonly plannedDone?: number;
  /** The time of the start of the last unit, in milliseconds from the epoch. */
  readonly unitAt?: number;
  readonly censored?: CensoredUnit;
  /** The minutes from the start of the child to the stop. */
  readonly elapsedMinutes?: number;
}

/** The facts of one stop. The times are in milliseconds from the epoch. */
export interface ShardStop {
  readonly startedAt: number;
  readonly at: number;
  readonly reason: ShardStopReason;
}

/** This function gives a text up to its last line end. A stop can cut the last line of a file. */
export function wholeLines(text: string): string {
  return text.slice(0, text.lastIndexOf("\n") + 1);
}

/** This function gives the keys of the records of a text, as `<strategy>|<input>`. */
function recordKeys(recordText: string): Set<string> {
  const keys = new Set<string>();
  for (const line of wholeLines(recordText).split("\n")) {
    if (line.trim() === "") continue;
    const record = JSON.parse(line) as { strategy: string; input: string };
    keys.add(`${record.strategy}|${record.input}`);
  }
  return keys;
}

/**
 * This function gives the shard file after a stop, with its censored row.
 * The child writes its shard file before each unit, so the file names the unit in progress. A child that ended before its first write has no file.
 * The times of the units that ended do not change, so the history of the cost model reads the same units as before.
 */
export function stoppedShard(plan: StopPlan, shard: number, file: ShardFile | null, recordText: string, stop: ShardStop): ShardFile {
  // A file with no `stopped` is the last write of a child that ran each unit. No unit is in progress.
  if (file !== null && file.stopped !== true) return file;
  const ids = plan.shards[shard] ?? [];
  const units = new Map(plan.units.map((u) => [u.id, u]));
  const keys = recordKeys(recordText);
  // With no file, the first unit with a config that has no record is the unit in progress.
  const done = file?.done ?? Math.max(0, ids.findIndex((id) => units.get(id)?.configs.some((c) => !keys.has(`${c}|${units.get(id)?.input}`)) === true));
  const unit = units.get(ids[done] ?? "");
  const base: ShardFile = file ?? { round: plan.round, shard, planned: (plan.loads[shard] ?? 0) / 60000, real: 0, stopped: true, done, units: ids.length, plannedDone: 0 };
  const elapsedMinutes = (stop.at - stop.startedAt) / 60000;
  if (unit === undefined) return { ...base, elapsedMinutes };
  const configs = unit.configs.filter((c) => !keys.has(`${c}|${unit.input}`));
  // With no start of the unit on the file, the unit has no time that this function can state.
  const atLeastMs = Math.max(0, stop.at - (file?.unitAt ?? stop.at));
  return { ...base, elapsedMinutes, censored: { unit: unit.id, input: unit.input, configs, atLeastMs, reason: stop.reason } };
}

/** One run of the flip of the stop. */
export interface StopFlipRun {
  readonly code: number | null;
  readonly minutes: number;
  readonly recordText: string;
  readonly shard: ShardFile | null;
}

/** The names of the flip of the stop. */
export interface StopFlipFacts {
  /** The config that ends before the deadline, and the config that runs past it. */
  readonly fast: string;
  readonly slow: string;
  readonly input: string;
  /** The largest minutes of a run. A copy that reaches this time did not stop at its deadline. */
  readonly limitMinutes: number;
}

/**
 * This function gives each fault of the flip of the stop. An empty list is a pass.
 * The fault copy has a first unit that runs past the deadline. Its finished record stays, the row reads censored, and the run ends in time.
 * The no-fault copy has only the fast config, and it has no stop and no censored row.
 */
export function stopFlipFindings(fault: StopFlipRun, clean: StopFlipRun, facts: StopFlipFacts): string[] {
  const findings: string[] = [];
  const keysOf = (run: StopFlipRun): Set<string> => recordKeys(run.recordText);
  const faultKeys = keysOf(fault);
  if (fault.code !== 0) findings.push(`The fault copy ended with the code ${String(fault.code)}, not 0.`);
  if (fault.minutes >= facts.limitMinutes) findings.push(`The fault copy took ${fault.minutes.toFixed(1)} minutes, and its limit is ${facts.limitMinutes}.`);
  if (!faultKeys.has(`${facts.fast}|${facts.input}`)) findings.push(`The fault copy lost the record of the finished config ${facts.fast}.`);
  if (faultKeys.has(`${facts.slow}|${facts.input}`)) findings.push(`The config ${facts.slow} ended before the deadline, so the fault copy tested no stop.`);
  if (fault.shard?.stopped !== true) findings.push("The shard file of the fault copy does not read stopped.");
  const row = fault.shard?.censored;
  if (row === undefined) findings.push("The fault copy has no censored row.");
  else {
    if (row.configs.join() !== facts.slow) findings.push(`The censored row names [${row.configs.join(", ")}], not ${facts.slow}.`);
    if (row.reason !== "hard deadline") findings.push(`The censored row has the reason "${row.reason}".`);
    if (!(row.atLeastMs > 0)) findings.push(`The censored row has the lower bound ${row.atLeastMs}.`);
  }
  if (clean.code !== 0) findings.push(`The no-fault copy ended with the code ${String(clean.code)}, not 0.`);
  if (clean.minutes >= facts.limitMinutes) findings.push(`The no-fault copy took ${clean.minutes.toFixed(1)} minutes, and its limit is ${facts.limitMinutes}.`);
  if (!keysOf(clean).has(`${facts.fast}|${facts.input}`)) findings.push(`The no-fault copy has no record of ${facts.fast}.`);
  if (clean.shard === null) findings.push("The no-fault copy has no shard file.");
  if (clean.shard?.stopped === true) findings.push("The no-fault copy reads stopped.");
  if (clean.shard?.censored !== undefined) findings.push("The no-fault copy has a censored row.");
  return findings;
}
