import { readFileSync } from "node:fs";
import { checkSurvey, surveyFindings, type MeasureSurvey } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { measureSurvey, surveyRow } from "./measure-survey.ts";

const file = JSON.parse(readFileSync(new URL("../../../docs/measure-survey.json", import.meta.url), "utf8")) as MeasureSurvey;

describe("docs/measure-survey.json", () => {
  it("is the survey of the installed packages. After an engine update, node scripts/measure-survey.ts <date> writes it again", () => {
    expect(checkSurvey(file)).toEqual([]);
    expect(file).toEqual(measureSurvey(file.date));
  });

  it("has the predictions of L65: 60 or more ids (R1), and a share of twin conflicts under 15 % (R2 does not hold)", () => {
    const f = surveyFindings(file);
    expect(f.ids).toBeGreaterThanOrEqual(60);
    expect(f.conflicts).toEqual([]);
    const twinIds = new Set(f.twins.flatMap((t) => t.values.map((v) => v.id)));
    expect(twinIds.size / f.ids).toBeLessThan(0.15);
  });
});

describe("surveyRow", () => {
  it("writes an open upper limit as null", () => {
    expect(surveyRow({ id: "a.b", unit: "count", direction: "lower", min: 0, max: Infinity })).toEqual({ id: "a.b", unit: "count", direction: "lower", min: 0, max: null });
  });
});
