// The trend of the space coverage (`docs/SWEEP.md`, "The trend"): the records of `surrogate-trend.jsonl`, their checks and the week view.
// This module has no DOM and no network. The section in `sweep.ts` reads the files and shows the result.

/** The schema of one line of `surrogate-trend.jsonl`. */
export const TREND_SCHEMA = "surrogate-trend/1";
/** The schema of `index.json` of the branch `sweep-data`. */
export const SWEEP_INDEX_SCHEMA = "sweep-index/1";
/** The variant of the main line of the trend. The page keeps only the records of this variant. */
export const TREND_VARIANT = "blocks";
/** The week view compares the latest record with a record of at least this count of days before it. */
export const WEEK_DAYS = 7;
/** A change of the held-out median skill below this value in absolute value is a flat week. */
export const FLAT_WEEK = 0.01;

/** The q10, the median and the q90 of the skill inside the cells. */
export interface SkillQuantiles {
  readonly q10: number;
  readonly median: number;
  readonly q90: number;
}

/** One record `surrogate-trend/1`: the fit of the coverage surrogate after one night. */
export interface TrendRecord {
  readonly schema: typeof TREND_SCHEMA;
  readonly epoch: string;
  /** The date of the last night of the state, as `YYYY-MM-DD`. */
  readonly night: string;
  readonly variant: string;
  /** The id of the CI run that wrote the record. */
  readonly run: string;
  readonly foldBy: string;
  readonly rows: number;
  readonly configs: number;
  /** The held-out skill. It is `null` when no cell has 20 rows or more. */
  readonly skill: SkillQuantiles | null;
  /** The in-sample skill of the same cells. */
  readonly inSampleSkill: SkillQuantiles | null;
  readonly covered: number;
  /** The covered cells as a share of the cells with rows. */
  readonly share: number;
  readonly withRows: number;
  /** The cells with 20 rows or more. */
  readonly eligible: number;
  readonly lambda: number;
  readonly lambdaAtEdge: boolean;
}

/** The records of one file, and the count of the lines that did not pass the check. */
export interface TrendFile {
  readonly records: readonly TrendRecord[];
  readonly bad: number;
}

/** The entry of one epoch in `index.json`. */
export interface StepFacts {
  /** The epoch before this epoch. */
  readonly from: string;
  readonly pairs: number;
  /** The count of the pairs that the rule dropped. */
  readonly dropped: number;
  /** The median of new value over old value for the fill, the hard constraints and the crossings. */
  readonly fill: number;
  readonly hard: number;
  readonly crossings: number;
}

/** The facts of one epoch in `index.json`. */
export interface EpochEntry {
  readonly corpus: string;
  readonly nights: number;
  readonly last: string;
  readonly configs: number;
  /** The count of the jobs of the last night with no record, or `null` when the index does not state it. */
  readonly missing: number | null;
  /** The step from the epoch before this epoch, or `null` with no step. */
  readonly step: StepFacts | null;
}

/** The facts of `index.json` that the page uses. */
export interface SweepIndex {
  readonly latest: string;
  readonly entry: EpochEntry;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** This function gives the count of days since 1970-01-01 for a date `YYYY-MM-DD`, or `NaN` for a bad date. */
export function dayOf(date: string): number {
  if (!DATE.test(date)) return Number.NaN;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : Number.NaN;
}

function checkSkill(v: unknown, name: string): string[] {
  if (v === null) return [];
  if (!isObject(v)) return [`${name} is not an object or null`];
  return (["q10", "median", "q90"] as const).filter((k) => !isFiniteNumber(v[k])).map((k) => `${name}.${k} is not a finite number`);
}

/** This function examines one record of the trend. It gives the problems, and an empty list for a good record. */
export function checkTrendRecord(v: unknown): string[] {
  if (!isObject(v)) return ["the line is not an object"];
  const problems: string[] = [];
  if (v["schema"] !== TREND_SCHEMA) problems.push(`schema is not ${TREND_SCHEMA}`);
  for (const k of ["epoch", "variant", "run", "foldBy"] as const) if (typeof v[k] !== "string" || v[k] === "") problems.push(`${k} is not a text`);
  if (typeof v["night"] !== "string" || !Number.isFinite(dayOf(v["night"]))) problems.push("night is not a date YYYY-MM-DD");
  for (const k of ["rows", "configs", "covered", "withRows", "eligible"] as const) if (!isCount(v[k])) problems.push(`${k} is not a count`);
  if (!isFiniteNumber(v["share"]) || v["share"] < 0 || v["share"] > 1) problems.push("share is not a number from 0 to 1");
  if (!isFiniteNumber(v["lambda"]) || v["lambda"] <= 0) problems.push("lambda is not a positive number");
  if (typeof v["lambdaAtEdge"] !== "boolean") problems.push("lambdaAtEdge is not a boolean");
  problems.push(...checkSkill(v["skill"], "skill"), ...checkSkill(v["inSampleSkill"], "inSampleSkill"));
  return problems;
}

/**
 * This function reads the text of `surrogate-trend.jsonl`. Each line holds one record. The function skips the empty lines.
 * A line with bad JSON or a bad record does not stop the read. The function counts it in `bad`.
 */
export function parseTrend(text: string): TrendFile {
  const records: TrendRecord[] = [];
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      bad++;
      continue;
    }
    if (checkTrendRecord(value).length === 0) records.push(value as TrendRecord);
    else bad++;
  }
  return { records, bad };
}

/**
 * This function gives the records of the main line in night order: the variant `blocks`, one record for each night.
 * A night with two records keeps the later line, because a summary that runs again appends a new record.
 */
export function mainLine(records: readonly TrendRecord[]): TrendRecord[] {
  const byNight = new Map<string, TrendRecord>();
  for (const r of records) if (r.variant === TREND_VARIANT) byNight.set(r.night, r);
  return [...byNight.values()].sort((a, b) => dayOf(a.night) - dayOf(b.night));
}

/** The week view of the trend. */
export type WeekView =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly latest: TrendRecord }
  /** The records are all less than `WEEK_DAYS` days older than the latest record. */
  | { readonly kind: "young"; readonly latest: TrendRecord; readonly first: TrendRecord; readonly nights: number; readonly startsOn: string }
  /** One of the two records has no held-out skill. */
  | { readonly kind: "no-skill"; readonly latest: TrendRecord; readonly prior: TrendRecord }
  | { readonly kind: "flat" | "rising" | "falling"; readonly latest: TrendRecord; readonly prior: TrendRecord; readonly change: number };

/** This function gives the date `days` days after the date `date`. */
export function addDays(date: string, days: number): string {
  return new Date((dayOf(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * This function gives the week view of the main line. It compares the latest record with the newest record of at least `WEEK_DAYS` days before it.
 * A change of the held-out median skill below `FLAT_WEEK` in absolute value is a flat week.
 */
export function weekView(line: readonly TrendRecord[]): WeekView {
  const latest = line.at(-1);
  if (latest === undefined) return { kind: "none" };
  if (line.length === 1) return { kind: "one", latest };
  const end = dayOf(latest.night);
  const prior = [...line].reverse().find((r) => end - dayOf(r.night) >= WEEK_DAYS);
  if (prior === undefined) {
    const first = line[0]!;
    return { kind: "young", latest, first, nights: line.length, startsOn: addDays(first.night, WEEK_DAYS) };
  }
  if (latest.skill === null || prior.skill === null) return { kind: "no-skill", latest, prior };
  const change = latest.skill.median - prior.skill.median;
  const kind = Math.abs(change) < FLAT_WEEK ? "flat" : change > 0 ? "rising" : "falling";
  return { kind, latest, prior, change };
}

/** This function examines `index.json` of the branch `sweep-data`. It gives the latest epoch and its entry, or the problems. */
function stepOf(v: unknown): StepFacts | null {
  if (!isObject(v) || typeof v["from"] !== "string" || !isCount(v["pairs"]) || !isObject(v["dropped"]) || !isObject(v["metrics"])) return null;
  const storedRatio = (name: string): number | null => {
    const metric = (v["metrics"] as Record<string, unknown>)[name];
    return isObject(metric) && typeof metric["median"] === "number" ? metric["median"] : null;
  };
  const [fill, hard, crossings] = [storedRatio("joint.fill"), storedRatio("hard"), storedRatio("joint.straight.crossings")];
  if (fill === null || hard === null || crossings === null) return null;
  const dropped = Object.values(v["dropped"]).reduce<number>((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
  return { from: v["from"], pairs: v["pairs"], dropped, fill, hard, crossings };
}

/** This function checks the value of `index.json`. It gives the facts of the latest epoch, or the list of the problems. */
export function checkSweepIndex(v: unknown): SweepIndex | string[] {
  if (!isObject(v)) return ["index.json is not an object"];
  if (v["schema"] !== SWEEP_INDEX_SCHEMA) return [`schema is not ${SWEEP_INDEX_SCHEMA}`];
  const latest = v["latest"];
  if (typeof latest !== "string" || latest === "") return ["latest is not a text"];
  const epochs = v["epochs"];
  const entry = isObject(epochs) ? epochs[latest] : undefined;
  if (!isObject(entry)) return [`epochs has no entry for ${latest}`];
  if (typeof entry["corpus"] !== "string" || !isCount(entry["nights"]) || typeof entry["last"] !== "string" || !isCount(entry["configs"]))
    return [`the entry of ${latest} has no corpus, nights, last or configs`];
  const missing = isCount(entry["missing"]) ? entry["missing"] : null;
  return { latest, entry: { corpus: entry["corpus"], nights: entry["nights"], last: entry["last"], configs: entry["configs"], missing, step: stepOf(entry["step"]) } };
}
