// The measure survey of L65: the measures of the contract and of the two engines that the joint bench runs.
// `node scripts/measure-survey.ts <YYYY-MM-DD>` writes `docs/measure-survey.json`. A test compares the file with `measureSurvey`.
import { createRequire } from "node:module";
import { MEASURES } from "@mark1russell7/highways";
import { MEASURE_REGISTRY, MEASURE_SURVEY_SCHEMA, type MeasureSpec, type MeasureSurvey, type SurveyMeasure, type SurveySource } from "@mark1russell7/layout-contract";
import { MEASURE_SPECS } from "@mark1russell7/packing";

const require = createRequire(import.meta.url);
const versionOf = (name: string): string => (require(`${name}/package.json`) as { version: string }).version;

/** This function gives the survey row of a spec of the contract type. JSON has no `Infinity`, so a spec without an upper limit gets `max: null`. */
export function surveyRow(spec: MeasureSpec): SurveyMeasure {
  return {
    id: spec.id,
    unit: spec.unit,
    direction: spec.direction,
    ...(spec.family === undefined ? {} : { family: spec.family }),
    min: spec.min,
    max: Number.isFinite(spec.max) ? spec.max : null,
  };
}

const byId = (a: SurveyMeasure, b: SurveyMeasure): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * This function gives the survey of the measures of the installed packages, on the day `date`.
 *
 * - The contract gives its registry, `MEASURE_REGISTRY`.
 * - `@mark1russell7/packing` gives `MEASURE_SPECS`, with the balance specs of the contract.
 * - `@mark1russell7/highways` gives `MEASURES`. Its rows have no range. The id is the name of the row, and the family is the id of the row.
 *
 * The versions are the versions that the joint bench installs. Thus the survey changes when the bench updates an engine.
 */
export function measureSurvey(date: string): MeasureSurvey {
  const sources: SurveySource[] = [
    { package: "@mark1russell7/layout-contract", version: versionOf("@mark1russell7/layout-contract"), measures: MEASURE_REGISTRY.map(surveyRow).sort(byId) },
    { package: "@mark1russell7/packing", version: versionOf("@mark1russell7/packing"), measures: Object.values(MEASURE_SPECS).map(surveyRow).sort(byId) },
    {
      package: "@mark1russell7/highways",
      version: versionOf("@mark1russell7/highways"),
      measures: MEASURES.map((m): SurveyMeasure => ({ id: m.name, unit: m.unit, direction: m.better, family: m.id })).sort(byId),
    },
  ];
  return { schema: MEASURE_SURVEY_SCHEMA, date, sources };
}
