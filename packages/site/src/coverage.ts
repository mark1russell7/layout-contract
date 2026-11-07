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
  /** The route values of the step. A step from before this field has none. */
  readonly routes: readonly StepRouteFacts[];
}

/** The facts of one route value of a step. */
export interface StepRouteFacts {
  readonly label: string;
  /** The median ratio of new to old, or `null` when no pair has a ratio. */
  readonly median: number | null;
  readonly n: number;
  readonly noOld: number;
  readonly noNew: number;
  readonly oldZero: number;
  readonly mixed: number;
}

/** A claim on a whole night: the real minutes, the interval and the side of a miss. */
export interface CostClaimFacts {
  readonly lo: number;
  readonly hi: number;
  readonly real: number;
  readonly side: "hit" | "low" | "high";
}

/** The shard claims of a night. */
export interface CostShardFacts {
  readonly hits: number;
  readonly shards: number;
  readonly low: number;
  readonly high: number;
}

/** The facts of the cost of the last night. A claim is `null` when it has no score, and its status tells why. */
export interface CostFacts {
  readonly date: string;
  readonly jobMinutes: CostClaimFacts | null;
  readonly jobMinutesStatus: string;
  readonly wall: CostClaimFacts | null;
  readonly wallStatus: string;
  readonly shards: CostShardFacts | null;
  /** The sentences of the budget of the night, or `null` for a night with no budget. */
  readonly budget: string | null;
  /** True when a read of the budget failed, or the budget took the fallback. */
  readonly thin: boolean;
}

/** The facts of one epoch in `index.json`. */
export interface EpochEntry {
  readonly corpus: string;
  readonly nights: number;
  readonly last: string;
  readonly configs: number;
  /** The count of the planned pairs of the last night that gave no value, or `null` when the index does not state it. An older night has the older form of the count (`LOST_METHOD_NOTE`). */
  readonly missing: number | null;
  /** The step from the epoch before this epoch, or `null` with no step. */
  readonly step: StepFacts | null;
  /** The cost of the last night, or `null` when the index does not state it. */
  readonly cost: CostFacts | null;
}

/** The facts of `index.json` that the page uses. */
export interface SweepIndex {
  readonly latest: string;
  readonly entry: EpochEntry;
  /** The latest epoch, and then each epoch before it through `step.from`, newest first. The week view reads across these epochs. */
  readonly chain: readonly string[];
}

/** The chain of the epochs has at most this count of epochs. */
export const MAX_CHAIN = 8;

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
  /** The records are all less than `WEEK_DAYS` days older than the latest record. `steps` counts the changes of epoch from the first record to the latest record. */
  | { readonly kind: "young"; readonly latest: TrendRecord; readonly first: TrendRecord; readonly nights: number; readonly startsOn: string; readonly steps: number }
  /** One of the two records has no held-out skill. */
  | { readonly kind: "no-skill"; readonly latest: TrendRecord; readonly prior: TrendRecord; readonly steps: number }
  /**
   * `steps` counts the changes of epoch from the prior record to the latest record. Each step changes the engines, so the change of the skill also holds the change of the engines.
   * `moves` gives the move of the skill at each of these steps, oldest first.
   */
  | { readonly kind: "flat" | "rising" | "falling"; readonly latest: TrendRecord; readonly prior: TrendRecord; readonly change: number; readonly steps: number; readonly moves: readonly StepMove[] };

/**
 * The move of the held-out median skill at one engine step. It goes from the last night of the old epoch to the first night of the new epoch.
 * The move is `null` when one of the two nights has no held-out skill.
 */
export interface StepMove {
  /** The first night of the new epoch. */
  readonly night: string;
  readonly move: number | null;
}

/** This function tells if a week view gives a change of the skill over a week. A view with no change gives `false`. */
export const weekShown = (week: WeekView): boolean => week.kind === "flat" || week.kind === "rising" || week.kind === "falling";

/**
 * This function joins the main lines of the epochs of a chain into one line in night order. The lines come newest epoch first, as `SweepIndex.chain` gives the epochs.
 * An older epoch keeps only its nights before the first night of the newer epochs, so each night has one record.
 */
export function chainLine(lines: readonly (readonly TrendRecord[])[]): TrendRecord[] {
  const out: TrendRecord[] = [];
  let before = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const kept = line.filter((r) => dayOf(r.night) < before);
    out.unshift(...kept);
    if (kept.length > 0) before = dayOf(kept[0]!.night);
  }
  return out;
}

/** This function gives the index of the first record of each new epoch in a line. The first record of the line is not in the list. */
export function epochStarts(line: readonly TrendRecord[]): number[] {
  const starts: number[] = [];
  for (let i = 1; i < line.length; i++) if (line[i]!.epoch !== line[i - 1]!.epoch) starts.push(i);
  return starts;
}

/** This function gives the move of the skill at each change of epoch in a line. It reads the records from the index `from` to the index `to`. */
function movesBetween(line: readonly TrendRecord[], from: number, to: number): StepMove[] {
  return epochStarts(line)
    .filter((i) => i > from && i <= to)
    .map((i) => {
      const [before, after] = [line[i - 1]!.skill, line[i]!.skill];
      return { night: line[i]!.night, move: before !== null && after !== null ? after.median - before.median : null };
    });
}

/** This function gives the date `days` days after the date `date`. */
export function addDays(date: string, days: number): string {
  return new Date((dayOf(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * This function gives the week view of a line in night order. It compares the latest record with the newest record of at least `WEEK_DAYS` days before it.
 * The line can hold the records of several epochs (`chainLine`). The view then counts the engine steps between the two records.
 * A change of the held-out median skill below `FLAT_WEEK` in absolute value is a flat week.
 */
export function weekView(line: readonly TrendRecord[]): WeekView {
  const end = line.length - 1;
  const latest = line[end];
  if (latest === undefined) return { kind: "none" };
  if (line.length === 1) return { kind: "one", latest };
  const day = dayOf(latest.night);
  let at = end - 1;
  while (at >= 0 && day - dayOf(line[at]!.night) < WEEK_DAYS) at--;
  if (at < 0) {
    const first = line[0]!;
    return { kind: "young", latest, first, nights: line.length, startsOn: addDays(first.night, WEEK_DAYS), steps: movesBetween(line, 0, end).length };
  }
  const prior = line[at]!;
  const moves = movesBetween(line, at, end);
  if (latest.skill === null || prior.skill === null) return { kind: "no-skill", latest, prior, steps: moves.length };
  const change = latest.skill.median - prior.skill.median;
  const kind = Math.abs(change) < FLAT_WEEK ? "flat" : change > 0 ? "rising" : "falling";
  return { kind, latest, prior, change, steps: moves.length, moves };
}

/** The route values of a step and their words on the page. */
const STEP_ROUTE_LABELS: readonly (readonly [string, string])[] = [
  ["route.detour.mean", "mean detour"],
  ["route.detour.q95", "q95 detour"],
  ["joint.route.length", "mean route length"],
  ["route.crossings", "routed crossings"],
];

/** This function gives the route values that `routes` of a step holds. A value in a bad form is left out, so it does not read as a pass. */
function stepRoutesOf(routes: unknown): StepRouteFacts[] {
  if (!isObject(routes)) return [];
  return STEP_ROUTE_LABELS.flatMap(([name, label]) => {
    const metric = routes[name];
    if (!isObject(metric) || !isCount(metric["noOld"]) || !isCount(metric["noNew"]) || !isCount(metric["oldZero"]) || !isCount(metric["mixed"])) return [];
    const ratio = metric["ratio"];
    const read = isObject(ratio) && isFiniteNumber(ratio["median"]) && isCount(ratio["n"]) ? { median: ratio["median"], n: ratio["n"] } : { median: null, n: 0 };
    return [{ label, ...read, noOld: metric["noOld"], noNew: metric["noNew"], oldZero: metric["oldZero"], mixed: metric["mixed"] }];
  });
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
  return { from: v["from"], pairs: v["pairs"], dropped, fill, hard, crossings, routes: stepRoutesOf(v["routes"]) };
}

function costClaimOf(v: unknown): CostClaimFacts | null {
  if (!isObject(v)) return null;
  const { lo, hi, real, side } = v;
  if (!isFiniteNumber(lo) || !isFiniteNumber(hi) || !isFiniteNumber(real) || (side !== "hit" && side !== "low" && side !== "high")) return null;
  return { lo, hi, real, side };
}

/** This function gives the cost facts of an entry, or `null` for an entry from before them or in a bad form. */
function costOf(v: unknown): CostFacts | null {
  if (!isObject(v) || typeof v["date"] !== "string" || typeof v["jobMinutesStatus"] !== "string" || typeof v["wallStatus"] !== "string") return null;
  const s = v["shards"];
  const shards = isObject(s) && isCount(s["hits"]) && isCount(s["shards"]) && isCount(s["low"]) && isCount(s["high"]) ? { hits: s["hits"], shards: s["shards"], low: s["low"], high: s["high"] } : null;
  return {
    date: v["date"],
    jobMinutes: costClaimOf(v["jobMinutes"]),
    jobMinutesStatus: v["jobMinutesStatus"],
    wall: costClaimOf(v["wall"]),
    wallStatus: v["wallStatus"],
    shards,
    budget: typeof v["budget"] === "string" ? v["budget"] : null,
    thin: v["thin"] === true,
  };
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
  const chain = chainOf(epochs as Record<string, unknown>, latest);
  return { latest, entry: { corpus: entry["corpus"], nights: entry["nights"], last: entry["last"], configs: entry["configs"], missing, step: stepOf(entry["step"]), cost: costOf(entry["cost"]) }, chain };
}

/**
 * This function gives the chain of the epochs from `latest` back through `step.from`, newest first.
 * The chain stops at an epoch with no step, or at an epoch that the index does not hold. It also stops at a repeated epoch and at `MAX_CHAIN` epochs.
 * A step of an older form gives no step facts, but its field `from` still links the epochs.
 */
function chainOf(epochs: Record<string, unknown>, latest: string): string[] {
  const chain = [latest];
  let entry = epochs[latest];
  while (chain.length < MAX_CHAIN && isObject(entry)) {
    const step = entry["step"];
    const from = isObject(step) ? step["from"] : undefined;
    if (typeof from !== "string" || from === "" || chain.includes(from)) break;
    chain.push(from);
    entry = epochs[from];
  }
  return chain;
}
