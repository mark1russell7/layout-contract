import type { Tolerance } from "./tolerance.ts";
import type { LayoutInput } from "./input.ts";
import { isShapeKind, shapeKindsOf, type ShapeKind } from "./shapes.ts";

/** The stage of a record: the packer, the router, or both together. */
export type Stage = "pack" | "route" | "joint";

/** One run of one strategy on one input and seed: the format `layout-record/1`. A run writes one line of JSON Lines. */
export interface LayoutRecord {
  readonly schema: "layout-record/1";
  readonly stage: Stage;
  readonly step: string;
  readonly strategy: string;
  /** The options in full, with the defaults. */
  readonly options: Readonly<Record<string, unknown>>;
  readonly corpus: string;
  /** The id of the input. */
  readonly input: string;
  /** The `hash` of the input file. */
  readonly inputHash: string;
  readonly set: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  /** The shape kinds of the boxes of the input, in the order of `SHAPE_KINDS`. Without it, each box is a `rect`. */
  readonly shapes?: readonly ShapeKind[];
  /** The value of each measure, by its name: `pack.*`, `route.*` or `joint.*`. */
  readonly measures: Readonly<Record<string, number>>;
  /** The count of the breaks of each hard rule. A good run has 0 for each rule. */
  readonly hard: Readonly<Record<string, number>>;
  /** The tolerance of each hard rule of the run. */
  readonly tolerance?: Readonly<Partial<Tolerance>>;
  /** The version of the rules that made the counts of `hard`: `HARD_RULE_VERSION` at the run. `hardRuleOf` reads it. */
  readonly hardRule?: number;
  /**
   * The value is `true` when two runs with the same seed give the same positions.
   * A skipped record has `null`, because no run made a claim.
   * A record with `oneRun: true` can also have `null`: the pair had no second run to compare.
   * Each other record has a boolean.
   */
  readonly deterministic: boolean | null;
  /** The id of the prediction that was written before the run. */
  readonly prediction?: string;
  /** The median of `msRuns`, or the time of the one run. */
  readonly ms: number;
  /** The time of each timed repeat, in milliseconds. */
  readonly msRuns?: readonly number[];
  /**
   * The value is `true` when a measure of the pair chose 1 timed repeat and no warm-up.
   * Then `ms` is one time, so a time gate does not read this record.
   * A bench that runs such a pair only once writes `deterministic: null`, and its record makes no claim on determinism.
   */
  readonly oneRun?: boolean;
  /** The wall budget of the pair of a strategy and an input, in milliseconds. */
  readonly budgetMs?: number;
  /** The lower limit of the time of a pair that a stop ended, in milliseconds. This time is censored, so a mean does not read it. */
  readonly msAtLeast?: number;
  /** The pairs that caused a skip, for example the pairs over budget that stopped the larger inputs of a strategy. */
  readonly because?: readonly string[];
  /**
   * The first 16 hex characters of the SHA-256 of the canonical output of the stage.
   * The packer hashes its placements by the order of the ids. The router hashes its routes by the order of the edge ids.
   */
  readonly outputHash?: string;
  /** The facts of the computer of the run. */
  readonly env?: RunEnv;
  /** The reason when the strategy did not run, for example an input over its `maxNodes`. Then the record has no measures. */
  readonly skipped?: string;
  readonly commit?: string;
  /**
   * The facts of a carry: a later run kept this record after an engine release, with no new measure (L147).
   * Without the field, the engines of the run of the record measured it.
   * The measures, the hashes and the times stay the values of the versions of `carried.from`.
   */
  readonly carried?: Carried;
}

/**
 * The facts of a record that a run kept from an older run after an engine release (L147).
 * The run kept it because each strategy of the record has the same fingerprint at the two versions.
 */
export interface Carried {
  /** The version of each engine at the measure, by the name of the engine. */
  readonly from: Readonly<Record<string, string>>;
  /** The version of each engine of the run that keeps the record. The names are the names of `from`. */
  readonly to: Readonly<Record<string, string>>;
  /** The fingerprint of each strategy of the record, by its name: `fingerprintOf` of its probes, the same at the two versions. */
  readonly fingerprints: Readonly<Record<string, string>>;
  /** The id of the run that measured the record. */
  readonly run?: string;
  /** The facts of a change of the measure code between the measure and the run that keeps the record. Without the field, the measure code did not change. */
  readonly code?: CarriedCode;
}

/**
 * The facts of a carry over a change of the measure code (L147 rule B). A run kept the record because a code audit gave no difference.
 * Such a record is a bridge only: the next full run at the commit `to` or later measures it again.
 */
export interface CarriedCode {
  /** The commit of the measure code of the record. A record that a run carried before keeps this commit. */
  readonly from: string;
  /** The commit of the run that keeps the record. */
  readonly to: string;
  /** The count of the pairs of the code audit. Each pair had the same record, without the times, at the two commits. */
  readonly audit: number;
  /** The 95 % upper bound of the rate of a difference, from 0 differences in `audit` pairs (the Wilson interval). It is above 0 and not above 1. */
  readonly upper: number;
}

/**
 * The values that a strategy supports, for each dimension of a taxonomy.
 * The dimension names are in `docs/FORMAT.md` of `packing` and `docs/LAYOUT-RECORDS.md` of `highways`.
 */
export type Supports = Readonly<Record<string, readonly string[]>>;

/** The facts of the computer of a run. */
export interface RunEnv {
  readonly node: string;
  readonly os: string;
  readonly arch: string;
  /** The name of the runner, for example `ubuntu-latest` or `local`. */
  readonly runner: string;
  /** The model of the processor. */
  readonly cpu: string;
  /** The count of the logical processors. */
  readonly cpus: number;
  /** The mode of the timing, for example `process` or `fresh` of `paired-time/1`. Each timing record names its mode. */
  readonly mode?: string;
  /** The context of the run, for example `ci` or `local`, with the Node flags. */
  readonly context?: string;
}

/** The facts of a run that the input does not give. */
export type RunFacts = Omit<LayoutRecord, "schema" | "input" | "inputHash" | "set" | "nodes" | "edges" | "shapes">;

/**
 * This function gives the record of a run. The input gives its id, its hash, its set and the counts of the nodes and the edges.
 * The input also gives `shapes`. An input with only `rect` boxes gets no `shapes`, so its record does not change.
 */
export function toLayoutRecord(input: LayoutInput, run: RunFacts): LayoutRecord {
  const shapes = shapeKindsOf(input);
  const onlyRect = shapes.length === 0 || (shapes.length === 1 && shapes[0] === "rect");
  return {
    schema: "layout-record/1",
    ...run,
    input: input.id,
    inputHash: input.hash ?? "",
    set: input.set ?? "",
    nodes: input.boxes.length,
    edges: input.edges?.length ?? 0,
    ...(onlyRect ? {} : { shapes }),
  };
}

type Fields = Readonly<Record<string, unknown>>;

const isFields = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);

const STAGES: readonly string[] = ["pack", "route", "joint"];
const RECORD_STRINGS = ["step", "strategy", "corpus", "input", "inputHash", "set"] as const;
const RECORD_NUMBERS = ["seed", "nodes", "edges", "ms"] as const;
const RECORD_OPTIONAL_STRINGS = ["prediction", "outputHash", "skipped", "commit"] as const;
const RECORD_OPTIONAL_NUMBERS = ["budgetMs", "msAtLeast", "hardRule"] as const;
const ENV_STRINGS = ["node", "os", "arch", "runner", "cpu"] as const;
const ENV_OPTIONAL_STRINGS = ["mode", "context"] as const;

/** This function adds a problem for each value of a map that is not a number. */
function numberMap(out: string[], v: unknown, name: string): void {
  if (!isFields(v)) {
    out.push(`${name} is not an object`);
    return;
  }
  for (const [key, n] of Object.entries(v)) if (typeof n !== "number") out.push(`${name}.${key} is not a number`);
}

/** This function tells if a value is an object whose values are strings. */
const isStringMap = (v: unknown): v is Readonly<Record<string, string>> => isFields(v) && Object.values(v).every((s) => typeof s === "string");

/** This function gives the problems of the field `carried.code` of a record. */
function codeProblems(code: unknown): string[] {
  if (!isFields(code)) return ["carried.code is not an object"];
  const out: string[] = [];
  for (const key of ["from", "to"] as const) if (typeof code[key] !== "string" || code[key] === "") out.push(`carried.code.${key} is not a commit`);
  if (out.length === 0 && code["from"] === code["to"]) out.push("carried.code.to is the commit of carried.code.from");
  if (!Number.isInteger(code["audit"]) || (code["audit"] as number) < 1) out.push("carried.code.audit is not a count of 1 or more");
  const upper = code["upper"];
  if (typeof upper !== "number" || !(upper > 0 && upper <= 1)) out.push("carried.code.upper is not above 0 and at most 1");
  return out;
}

/** This function gives the problems of the field `carried` of a record. */
function carriedProblems(carried: unknown): string[] {
  if (!isFields(carried)) return ["carried is not an object"];
  const out: string[] = [];
  for (const key of ["from", "to", "fingerprints"] as const) if (!isStringMap(carried[key])) out.push(`carried.${key} is not a map of strings`);
  if (carried["run"] !== undefined && typeof carried["run"] !== "string") out.push("carried.run is not a string");
  if (carried["code"] !== undefined) out.push(...codeProblems(carried["code"]));
  if (out.length > 0) return out;
  const from = carried["from"] as Readonly<Record<string, string>>;
  const to = carried["to"] as Readonly<Record<string, string>>;
  const names = (m: Readonly<Record<string, string>>): string => Object.keys(m).sort().join(",");
  if (names(from) === "" || names(from) !== names(to)) out.push("carried.from and carried.to do not name the same engines");
  // A carry over a change of the measure code can keep the engine versions. Each other carry needs a change of a version.
  else if (carried["code"] === undefined && Object.keys(from).every((name) => from[name] === to[name])) out.push("carried.to has no other version than carried.from");
  if (Object.keys(carried["fingerprints"] as object).length === 0) out.push("carried.fingerprints is empty");
  return out;
}

/** This function gives the problems of the field `env` of a record. */
function envProblems(env: unknown): string[] {
  if (!isFields(env)) return ["env is not an object"];
  const out: string[] = [];
  for (const key of ENV_STRINGS) if (typeof env[key] !== "string") out.push(`env.${key} is not a string`);
  if (typeof env["cpus"] !== "number") out.push("env.cpus is not a number");
  for (const key of ENV_OPTIONAL_STRINGS) if (env[key] !== undefined && typeof env[key] !== "string") out.push(`env.${key} is not a string`);
  return out;
}

/**
 * This function gives the version of the rules that made the counts of `hard` of a record. A record without `hardRule` has version 1.
 * On version 1, a count on a circle is by its bounding box. So it is an upper bound, and a count over 0 proves nothing.
 */
export function hardRuleOf(record: Pick<LayoutRecord, "hardRule">): number {
  return record.hardRule ?? 1;
}

/**
 * This function gives the problems of one `layout-record/1` value. An empty list means a good record.
 * A record that has `skipped` has `deterministic: null`. An old skipped record with a boolean is also correct.
 * A record without `skipped` has a boolean, or `null` when it has `oneRun: true`. The check accepts fields that the format does not know.
 */
export function checkLayoutRecord(value: unknown): string[] {
  if (!isFields(value)) return ["the record is not an object"];
  const out: string[] = [];
  const v = value;
  if (v["schema"] !== "layout-record/1") out.push("schema is not layout-record/1");
  if (typeof v["stage"] !== "string" || !STAGES.includes(v["stage"])) out.push("stage is not pack, route or joint");
  for (const key of RECORD_STRINGS) if (typeof v[key] !== "string") out.push(`${key} is not a string`);
  for (const key of RECORD_NUMBERS) if (typeof v[key] !== "number") out.push(`${key} is not a number`);
  for (const key of RECORD_OPTIONAL_STRINGS) if (v[key] !== undefined && typeof v[key] !== "string") out.push(`${key} is not a string`);
  if (!isFields(v["options"])) out.push("options is not an object");
  numberMap(out, v["measures"], "measures");
  numberMap(out, v["hard"], "hard");
  if (v["tolerance"] !== undefined) numberMap(out, v["tolerance"], "tolerance");
  const shapes = v["shapes"];
  if (shapes !== undefined && (!Array.isArray(shapes) || !shapes.every(isShapeKind))) out.push("shapes is not a list of shape kinds");
  const msRuns = v["msRuns"];
  if (msRuns !== undefined && (!Array.isArray(msRuns) || !msRuns.every((n) => typeof n === "number"))) out.push("msRuns is not a list of numbers");
  if (v["oneRun"] !== undefined && typeof v["oneRun"] !== "boolean") out.push("oneRun is not a boolean");
  for (const key of RECORD_OPTIONAL_NUMBERS) if (v[key] !== undefined && typeof v[key] !== "number") out.push(`${key} is not a number`);
  const because = v["because"];
  if (because !== undefined && (!Array.isArray(because) || !because.every((s) => typeof s === "string"))) out.push("because is not a list of strings");
  if (v["env"] !== undefined) out.push(...envProblems(v["env"]));
  if (v["carried"] !== undefined) {
    out.push(...carriedProblems(v["carried"]));
    if (v["skipped"] !== undefined) out.push("a skipped record has carried");
  }
  const deterministic = v["deterministic"];
  if (v["skipped"] === undefined) {
    const noClaim = deterministic === null && v["oneRun"] === true;
    if (typeof deterministic !== "boolean" && !noClaim) out.push("deterministic is not a boolean, and the record has no skipped");
  } else if (deterministic !== null && typeof deterministic !== "boolean") out.push("deterministic of a skipped record is not null or a boolean");
  return out;
}

/**
 * This function reads one `layout-record/1` value, for example one parsed line of a JSON Lines file.
 * It throws a `TypeError` with the problems of `checkLayoutRecord`.
 * An old skipped record has a boolean `deterministic`. The result has `null` in its place, because no run made that claim.
 */
export function parseLayoutRecord(value: unknown): LayoutRecord {
  const problems = checkLayoutRecord(value);
  if (problems.length > 0) throw new TypeError(`The record is not a layout-record/1: ${problems.join(", ")}.`);
  const record = value as LayoutRecord;
  return record.skipped !== undefined && record.deterministic !== null ? { ...record, deterministic: null } : record;
}

/** The facts of one carry, for `carryRecord`. */
export interface CarryFacts {
  /** The version of each engine of the run that keeps the record. */
  readonly to: Readonly<Record<string, string>>;
  /** The fingerprint of each strategy of the record, the same at the two versions. */
  readonly fingerprints: Readonly<Record<string, string>>;
  /** The version of each engine at the measure. A record that a run carried before keeps its `carried.from`, and the function ignores this value. */
  readonly from?: Readonly<Record<string, string>>;
  /** The id of the run that measured the record. A record that a run carried before keeps its `carried.run`. */
  readonly run?: string;
  /**
   * The facts of a change of the measure code, for a carry over such a change. A record with `carried.code` keeps its `carried.code.from`.
   * Without this value, a record keeps its `carried.code`.
   */
  readonly code?: CarriedCode;
}

/**
 * This function gives a record that a run keeps after an engine release, with the field `carried` (L147).
 * With `facts.code`, the run keeps the record over a change of the measure code. Then the engine versions can be the same.
 * A record that a run carried before keeps the versions and the run of its measure, so `carried.from` always names the measure.
 * The function throws a `RangeError` for a skipped record: a skip makes no claim on an output, so the run measures the pair again.
 * It also throws a `RangeError` when `checkLayoutRecord` refuses the field `carried` of the result.
 */
export function carryRecord(record: LayoutRecord, facts: CarryFacts): LayoutRecord {
  if (record.skipped !== undefined) throw new RangeError(`The record of ${record.strategy} on ${record.input} is skipped, so a run measures it again.`);
  const from = record.carried?.from ?? facts.from;
  if (from === undefined) throw new RangeError(`The record of ${record.strategy} on ${record.input} has no carried.from, so the carry needs from.`);
  const run = record.carried?.run ?? facts.run;
  const before = record.carried?.code;
  const code = facts.code === undefined ? before : { ...facts.code, from: before?.from ?? facts.code.from };
  const carried: Carried = { from, to: facts.to, fingerprints: facts.fingerprints, ...(run === undefined ? {} : { run }), ...(code === undefined ? {} : { code }) };
  const problems = carriedProblems(carried);
  if (problems.length > 0) throw new RangeError(`The carry of ${record.strategy} on ${record.input} is bad: ${problems.join(", ")}.`);
  return { ...record, carried };
}
