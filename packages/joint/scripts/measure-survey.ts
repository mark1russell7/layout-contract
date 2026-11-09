// The write of the measure survey (L65): `node scripts/measure-survey.ts <YYYY-MM-DD>`.
// It writes `docs/measure-survey.json` at the root of the repository and prints the findings.
import { writeFileSync } from "node:fs";
import { checkSurvey, surveyFindings } from "@mark1russell7/layout-contract";
import { measureSurvey } from "../src/measure-survey.ts";

const [date] = process.argv.slice(2);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Usage: node scripts/measure-survey.ts <YYYY-MM-DD>");
const survey = measureSurvey(date);
const faults = checkSurvey(survey);
if (faults.length > 0) throw new Error(`The survey has faults:\n${faults.join("\n")}`);
writeFileSync(new URL("../../../docs/measure-survey.json", import.meta.url), `${JSON.stringify(survey, null, 2)}\n`);
const f = surveyFindings(survey);
console.log(`Distinct ids: ${f.ids}. By source: ${JSON.stringify(f.bySource)}.`);
console.log(`Conflicts of one id: ${f.conflicts.length}. Twins with another unit or direction: ${f.twins.length}. Ids without a range: ${f.noRange.length}.`);
for (const t of f.twins) console.log(`  ${t.name} (${t.field}): ${t.values.map((v) => `${v.id}=${v.value}`).join(", ")}`);
