// The first-order sensitivity of the sweep score to the groups of the joint space (roadmap item L52, `docs/SWEEP.md`).
//
//   node scripts/sensitivity.ts --state <state.json> [--within <group>=<level>] [--draws <n>] [--seed <n>] [--json <file>]
//   node scripts/sensitivity.ts --state <state.json> --total [<date>] [--draws <n>] [--seed <n>] [--json <file>]
//
// With --total, the script gives the first and total indices of the Saltelli design of a design night (`totalOrder`).
// The design is the design of <date> in `state.designs`, or the last design without a date.
// <state.json> is the state of one epoch of the sweep (`epochs/<epoch>/state.json` of the branch `sweep-data`).
// The script writes the Markdown table to the output, and the result as JSON to <file> when --json is given.
import { readFileSync, writeFileSync } from "node:fs";
import { firstOrder, firstOrderMarkdown, JOINT_GROUPS, totalOrder, totalOrderMarkdown, type SweepState } from "../src/index.ts";

const rest = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) {
  const name = rest[i]!.replace(/^--/, "");
  const next = rest[i + 1];
  // A flag with no value (--total with no date) gets the value "".
  if (next === undefined || next.startsWith("--")) args[name] = "";
  else args[name] = rest[++i]!;
}
if (args["state"] === undefined) throw new RangeError("The script needs --state.");
const state = JSON.parse(readFileSync(args["state"], "utf8")) as SweepState;
const draws = {
  ...(args["draws"] === undefined ? {} : { draws: Number(args["draws"]) }),
  ...(args["seed"] === undefined ? {} : { seed: Number(args["seed"]) }),
};
if (args["total"] !== undefined) {
  const designs = state.designs ?? [];
  const design = args["total"] === "" ? designs.at(-1) : designs.find((d) => d.date === args["total"]);
  if (design === undefined) throw new RangeError(`The state has no design${args["total"] === "" ? "" : ` of ${args["total"]}`}. It has ${designs.length} designs.`);
  const result = totalOrder(state, design, draws);
  console.log(totalOrderMarkdown(result));
  if (args["json"] !== undefined) writeFileSync(args["json"], JSON.stringify(result, null, 2) + "\n");
  process.exit(0);
}
const [group, level] = (args["within"] ?? "").split("=");
const result = firstOrder(state, JOINT_GROUPS, {
  ...draws,
  ...(args["within"] === undefined ? {} : { within: { group: group!, level: level! } }),
});
console.log(firstOrderMarkdown(result));
if (args["json"] !== undefined) writeFileSync(args["json"], JSON.stringify(result, null, 2) + "\n");
