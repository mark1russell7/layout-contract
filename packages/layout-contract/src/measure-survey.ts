import type { Direction } from "./measures.ts";

/** The schema of a measure survey. */
export const MEASURE_SURVEY_SCHEMA = "measure-survey/1";

/** One measure of a source, as the source declares it. A source without a range has no `min` and no `max`. */
export interface SurveyMeasure {
  readonly id: string;
  readonly unit: string;
  readonly direction: Direction;
  readonly family?: string;
  readonly min?: number;
  /** The highest value. JSON has no `Infinity`, so `null` tells that the measure has no upper limit. */
  readonly max?: number | null;
}

/** The measures of one package at one version. */
export interface SurveySource {
  readonly package: string;
  readonly version: string;
  readonly measures: readonly SurveyMeasure[];
}

/** A list of the measures of each package, kept as data in `docs/measure-survey.json`. */
export interface MeasureSurvey {
  readonly schema: typeof MEASURE_SURVEY_SCHEMA;
  /** The day of the survey, as `YYYY-MM-DD`. */
  readonly date: string;
  readonly sources: readonly SurveySource[];
}

/**
 * Two measures of two sources with one name after the stage, for example `pack.fill` and `joint.fill`, and another unit or direction.
 * The name after the stage is the id without its first part.
 */
export interface TwinConflict {
  readonly name: string;
  readonly field: "unit" | "direction";
  /** The id and the value of each measure of the twins. */
  readonly values: readonly { readonly id: string; readonly source: string; readonly value: string }[];
}

/** The facts of a survey that feed the idea queue. */
export interface SurveyFindings {
  /** The count of the distinct ids over all sources. */
  readonly ids: number;
  /** The count of the measures of each source. */
  readonly bySource: Readonly<Record<string, number>>;
  /** The ids that two sources declare, with another unit or direction. */
  readonly conflicts: readonly { readonly id: string; readonly field: "unit" | "direction"; readonly sources: readonly string[] }[];
  /** The twins of two sources with another unit or another direction. */
  readonly twins: readonly TwinConflict[];
  /** The ids without a range. An objective cannot normalize them with the rule `range` or `scale`. */
  readonly noRange: readonly string[];
  /** The distinct units, with the count of the measures of each. */
  readonly units: Readonly<Record<string, number>>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** This function gives the faults of a survey, as plain text. An empty list tells that the survey is good. */
export function checkSurvey(v: unknown): string[] {
  const out: string[] = [];
  if (!isObj(v)) return ["the survey is not an object"];
  if (v["schema"] !== MEASURE_SURVEY_SCHEMA) out.push(`the schema is not ${MEASURE_SURVEY_SCHEMA}`);
  if (typeof v["date"] !== "string" || !DATE.test(v["date"])) out.push("the date is not YYYY-MM-DD");
  const sources = v["sources"];
  if (!Array.isArray(sources) || sources.length === 0) return [...out, "the survey has no sources"];
  const names = new Set<string>();
  for (const [i, s] of sources.entries()) {
    const at = `sources[${i}]`;
    if (!isObj(s)) {
      out.push(`${at} is not an object`);
      continue;
    }
    if (typeof s["package"] !== "string" || s["package"].length === 0) out.push(`${at}.package is empty`);
    else if (names.has(s["package"])) out.push(`${at}.package ${s["package"]} is not unique`);
    else names.add(s["package"]);
    if (typeof s["version"] !== "string" || s["version"].length === 0) out.push(`${at}.version is empty`);
    const measures = s["measures"];
    if (!Array.isArray(measures)) {
      out.push(`${at}.measures is not a list`);
      continue;
    }
    const ids = new Set<string>();
    for (const [j, m] of measures.entries()) {
      const mat = `${at}.measures[${j}]`;
      if (!isObj(m)) {
        out.push(`${mat} is not an object`);
        continue;
      }
      if (typeof m["id"] !== "string" || m["id"].length === 0) out.push(`${mat}.id is empty`);
      else if (ids.has(m["id"])) out.push(`${mat}.id ${m["id"]} is not unique in its source`);
      else ids.add(m["id"]);
      if (typeof m["unit"] !== "string" || m["unit"].length === 0) out.push(`${mat}.unit is empty`);
      if (m["direction"] !== "lower" && m["direction"] !== "higher") out.push(`${mat}.direction is not lower or higher`);
      const min = m["min"];
      const max = m["max"];
      if ((min === undefined) !== (max === undefined)) out.push(`${mat} has min or max, not both`);
      if (min !== undefined && (typeof min !== "number" || !Number.isFinite(min))) out.push(`${mat}.min is not a finite number`);
      if (max !== undefined && max !== null && (typeof max !== "number" || !Number.isFinite(max) || !(typeof min === "number" && max > min))) out.push(`${mat}.max is not a number above min, or null`);
    }
  }
  return out;
}

/** This function gives the name of an id after its stage: the id without its first part. An id without a dot is its own name. */
export function nameAfterStage(id: string): string {
  const dot = id.indexOf(".");
  return dot < 0 ? id : id.slice(dot + 1);
}

/** This function gives the findings of a good survey. `checkSurvey` examines the survey first. */
export function surveyFindings(survey: MeasureSurvey): SurveyFindings {
  const bySource: Record<string, number> = {};
  const byId = new Map<string, { source: string; m: SurveyMeasure }[]>();
  const units: Record<string, number> = {};
  const noRange = new Set<string>();
  for (const s of survey.sources) {
    bySource[s.package] = s.measures.length;
    for (const m of s.measures) {
      const list = byId.get(m.id) ?? [];
      list.push({ source: s.package, m });
      byId.set(m.id, list);
      units[m.unit] = (units[m.unit] ?? 0) + 1;
      if (m.min === undefined) noRange.add(m.id);
    }
  }
  const conflicts: { id: string; field: "unit" | "direction"; sources: string[] }[] = [];
  for (const [id, list] of byId)
    for (const field of ["unit", "direction"] as const)
      if (new Set(list.map((e) => e.m[field])).size > 1) conflicts.push({ id, field, sources: list.map((e) => e.source) });

  const byName = new Map<string, { id: string; source: string; m: SurveyMeasure }[]>();
  for (const [id, list] of byId) {
    const name = nameAfterStage(id);
    const group = byName.get(name) ?? [];
    for (const e of list) group.push({ id, ...e });
    byName.set(name, group);
  }
  const twins: TwinConflict[] = [];
  for (const [name, group] of [...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (new Set(group.map((e) => e.source)).size < 2) continue;
    for (const field of ["unit", "direction"] as const)
      if (new Set(group.map((e) => e.m[field])).size > 1) twins.push({ name, field, values: group.map((e) => ({ id: e.id, source: e.source, value: e.m[field] })) });
  }
  return { ids: byId.size, bySource, conflicts, twins, noRange: [...noRange].sort(), units };
}
