// The first-order sensitivity of the sweep score to the groups of the joint space (roadmap item L52, `docs/SWEEP.md`).
//
//   node scripts/sensitivity.mjs --state <state.json> [--within <group>=<level>] [--draws <n>] [--seed <n>] [--json <file>]
//
// <state.json> is the state of one epoch of the sweep (`epochs/<epoch>/state.json` of the branch `sweep-data`).
// The script writes the Markdown table to the output, and the result as JSON to <file> when --json is given.
import { readFileSync, writeFileSync } from "node:fs";
import { firstOrder, firstOrderMarkdown, JOINT_GROUPS } from "../src/index.ts";

const rest = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if (args.state === undefined) throw new RangeError("The script needs --state.");
const state = JSON.parse(readFileSync(args.state, "utf8"));
const [group, level] = (args.within ?? "").split("=");
const result = firstOrder(state, JOINT_GROUPS, {
  ...(args.draws === undefined ? {} : { draws: Number(args.draws) }),
  ...(args.seed === undefined ? {} : { seed: Number(args.seed) }),
  ...(args.within === undefined ? {} : { within: { group, level } }),
});
console.log(firstOrderMarkdown(result));
if (args.json !== undefined) writeFileSync(args.json, JSON.stringify(result, null, 2) + "\n");
