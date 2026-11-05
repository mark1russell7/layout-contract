// The record `response-records/1` of a joint run, for the explorer of the site (`docs/JOINT-BENCH.md`, roadmap item L104).
//
//   node scripts/response.ts --records <dir> --corpus <corpus.json> --out <file> [--run <id>] [--seeds <n>] [--folds <n>]
//
// <dir> holds the files records-<shard>.jsonl of the run, in any folder below it.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { heldOutError } from "@mark1russell7/rigor-statistics";
import { fitJointResponse, jointResponseData, jointResponseTerms, type JointManifest, type JointResponseRow } from "../src/index.ts";

const { values } = parseArgs({ options: { records: { type: "string" }, corpus: { type: "string" }, out: { type: "string" }, run: { type: "string" }, seeds: { type: "string" }, folds: { type: "string" } } });
if (!values.records || !values.corpus || !values.out) throw new Error("Usage: node scripts/response.ts --records <dir> --corpus <corpus.json> --out <file> [--run <id>] [--seeds <n>] [--folds <n>]");

const files = readdirSync(values.records, { recursive: true, encoding: "utf8" }).filter((file) => /(^|[\\/])records-[^\\/]*\.jsonl$/.test(file));
if (files.length === 0) throw new Error(`The folder ${values.records} has no records.`);
const rows = files.flatMap((file) =>
  readFileSync(join(values.records!, file), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as JointResponseRow),
);
const manifest = JSON.parse(readFileSync(values.corpus, "utf8")) as JointManifest;
const name = values.run === undefined ? manifest.corpus : `${manifest.corpus}, run ${values.run}`;
const data = jointResponseData(rows, manifest, { name, ...(values.seeds === undefined ? {} : { seeds: Number(values.seeds) }) });
const start = performance.now();
const record = fitJointResponse(data, values.folds === undefined ? {} : { folds: Number(values.folds) });
const seconds = (performance.now() - start) / 1000;

mkdirSync(dirname(values.out), { recursive: true });
const text = JSON.stringify(record);
writeFileSync(values.out, text);
const pairs = new Set(data.points.map((point) => `${point.values["pack"]}+${point.values["router"]}`)).size;
const products = jointResponseTerms(data).filter((term) => term.length === 2 && term[0]?.dimension === "pack").length;
console.log(`${rows.length} records, ${data.points.length} points, ${data.dimensions.length} dimensions, ${pairs} pairs, ${products} products of a pack and a router, ${text.length} bytes. The fit took ${seconds.toFixed(1)} s.`);
for (const model of record.models) {
  const error = heldOutError(record, model.measure);
  console.log(`${model.measure}: the fit misses by ${error.mae.toPrecision(3)}, the mean misses by ${error.baselineMae.toPrecision(3)}.`);
}
