import { describe, expect, it } from "vitest";
import { checkSurvey, MEASURE_SURVEY_SCHEMA, nameAfterStage, surveyFindings, type MeasureSurvey } from "./index.ts";

const survey: MeasureSurvey = {
  schema: MEASURE_SURVEY_SCHEMA,
  date: "2026-11-09",
  sources: [
    {
      package: "a",
      version: "1.0.0",
      measures: [
        { id: "pack.fill", unit: "share", direction: "higher", min: 0, max: 1 },
        { id: "pack.mean", unit: "W", direction: "lower", min: 0, max: null },
        { id: "shared.x", unit: "count", direction: "lower", min: 0, max: null },
      ],
    },
    {
      package: "b",
      version: "2.0.0",
      measures: [
        { id: "joint.fill", unit: "0 to 1", direction: "higher", min: 0, max: 1 },
        { id: "joint.mean", unit: "W", direction: "higher", min: 0, max: null },
        { id: "shared.x", unit: "count", direction: "higher" },
      ],
    },
  ],
};

describe("checkSurvey", () => {
  it("accepts a good survey", () => {
    expect(checkSurvey(survey)).toEqual([]);
  });

  it("names each fault", () => {
    const m = survey.sources[0]!.measures[0]!;
    const one = (patch: Record<string, unknown>): string[] => checkSurvey({ ...survey, sources: [{ ...survey.sources[0]!, measures: [{ ...m, ...patch }] }] });
    expect(checkSurvey(null)).toEqual(["the survey is not an object"]);
    expect(checkSurvey({ ...survey, schema: "x", date: "11-09" })).toEqual([`the schema is not ${MEASURE_SURVEY_SCHEMA}`, "the date is not YYYY-MM-DD"]);
    expect(checkSurvey({ ...survey, sources: [] })).toEqual(["the survey has no sources"]);
    expect(checkSurvey({ ...survey, sources: [survey.sources[0], survey.sources[0]] })).toEqual(["sources[1].package a is not unique"]);
    expect(one({ id: "" })).toEqual(["sources[0].measures[0].id is empty"]);
    expect(one({ unit: 3 })).toEqual(["sources[0].measures[0].unit is empty"]);
    expect(one({ direction: "up" })).toEqual(["sources[0].measures[0].direction is not lower or higher"]);
    expect(one({ max: undefined })).toEqual(["sources[0].measures[0] has min or max, not both"]);
    expect(one({ min: Number.NaN })).toContain("sources[0].measures[0].min is not a finite number");
    expect(one({ max: 0 })).toEqual(["sources[0].measures[0].max is not a number above min, or null"]);
    expect(checkSurvey({ ...survey, sources: [{ ...survey.sources[0]!, measures: [m, m] }] })).toEqual(["sources[0].measures[1].id pack.fill is not unique in its source"]);
  });
});

describe("surveyFindings", () => {
  it("counts the ids, and finds the conflicts of one id, the twins and the ids without a range", () => {
    const f = surveyFindings(survey);
    expect(f.ids).toBe(5);
    expect(f.bySource).toEqual({ a: 3, b: 3 });
    expect(f.conflicts).toEqual([{ id: "shared.x", field: "direction", sources: ["a", "b"] }]);
    expect(f.twins).toEqual([
      { name: "fill", field: "unit", values: [{ id: "pack.fill", source: "a", value: "share" }, { id: "joint.fill", source: "b", value: "0 to 1" }] },
      { name: "mean", field: "direction", values: [{ id: "pack.mean", source: "a", value: "lower" }, { id: "joint.mean", source: "b", value: "higher" }] },
      { name: "x", field: "direction", values: [{ id: "shared.x", source: "a", value: "lower" }, { id: "shared.x", source: "b", value: "higher" }] },
    ]);
    expect(f.noRange).toEqual(["shared.x"]);
    expect(f.units).toEqual({ share: 1, W: 2, count: 2, "0 to 1": 1 });
  });

  it("finds no twin inside one source", () => {
    const one: MeasureSurvey = { ...survey, sources: [{ package: "a", version: "1", measures: [{ id: "p.fill", unit: "share", direction: "higher" }, { id: "q.fill", unit: "0 to 1", direction: "higher" }] }] };
    expect(surveyFindings(one).twins).toEqual([]);
  });

  it("gives the name after the stage", () => {
    expect(nameAfterStage("pack.stability.mean")).toBe("stability.mean");
    expect(nameAfterStage("ink")).toBe("ink");
  });
});
