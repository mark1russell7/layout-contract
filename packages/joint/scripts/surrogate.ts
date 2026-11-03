// The fit of the coverage surrogate for its trend (`docs/SWEEP.md`, "The trend", roadmap item L52).
//
//   node scripts/surrogate.ts <state.json> <corpus.json> <blocks|pairs> <out dir>
//
// <state.json> is the state of one epoch of the branch `sweep-data`. <corpus.json> is the manifest of the corpus of that epoch.
// The variant `blocks` has the feature blocks of the manifest. The variant `pairs` also has their products with the groups. Both variants use folds by input.
// The script writes <out>/surrogate.json, one line of the record `surrogate-trend/1`, and <out>/surrogate.md, the report of `surrogateMarkdown`.
// The record gets the run id from the variable GITHUB_RUN_ID, if it is set.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fitSurrogate, surrogateMarkdown, surrogateTrendOptions, surrogateTrendRecord, type JointManifest, type SweepState } from "../src/index.ts";

const [stateFile, manifestFile, variant, out] = process.argv.slice(2);
if (!stateFile || !manifestFile || !out || (variant !== "blocks" && variant !== "pairs")) throw new Error("Usage: node scripts/surrogate.ts <state.json> <corpus.json> <blocks|pairs> <out dir>");

const state = JSON.parse(readFileSync(stateFile, "utf8")) as SweepState;
const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as JointManifest;
const start = performance.now();
const result = fitSurrogate(state, surrogateTrendOptions(variant, manifest));
const seconds = (performance.now() - start) / 1000;
const record = surrogateTrendRecord(result, { epoch: state.epoch, night: state.nights.at(-1)?.date ?? "", variant, run: process.env["GITHUB_RUN_ID"] });

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "surrogate.json"), JSON.stringify(record) + "\n");
writeFileSync(join(out, "surrogate.md"), surrogateMarkdown(result));
console.log(JSON.stringify(record));
console.log(`The fit of the variant ${variant} took ${seconds.toFixed(1)} s.`);
