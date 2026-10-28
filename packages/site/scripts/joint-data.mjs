// This script makes the data file of the site from the report.json of one joint benchmark run (docs/SITE.md).
//
//   pnpm --filter @layout-contract/site run data:joint -- <report.json> --run <id> --date <YYYY-MM-DD> --item <id>
//        --versions highways=<v>,packing=<v> [--corpus <set>]
//
// It writes packages/site/data/joint/<run>.json, and it fails when the result does not pass checkJoint.
// The corpus is joint-v2 by default. Each new result adds one file. The site shows the latest result.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkJoint } from "../src/data.ts";
import { jointData } from "../src/joint-data.ts";

const args = process.argv.slice(2).filter((a) => a !== "--");
const flags = new Map();
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) flags.set(args[i].slice(2), args[++i]);
  else positional.push(args[i]);
}

const fail = (message) => {
  console.error(`joint-data: ${message}`);
  process.exit(1);
};

const [reportPath] = positional;
if (reportPath === undefined) fail("give the path of a report.json.");
for (const key of ["run", "date", "item", "versions"]) if (!flags.get(key)) fail(`give --${key}.`);
if (!/^\d+$/.test(flags.get("run"))) fail("--run is not the id of a CI run.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(flags.get("date"))) fail("--date is not YYYY-MM-DD.");

const versions = Object.fromEntries(
  flags
    .get("versions")
    .split(",")
    .map((pair) => {
      const [name, version] = pair.split("=");
      if (!name || !version) fail(`the version "${pair}" is not <name>=<version>.`);
      return [name.trim(), version.trim()];
    }),
);

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const data = jointData(report, {
  run: flags.get("run"),
  date: flags.get("date"),
  item: flags.get("item"),
  corpus: flags.get("corpus") ?? "joint-v2",
  versions,
});
const problems = checkJoint(data);
if (problems.length > 0) fail(`the result is not good: ${problems.join("; ")}`);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "joint", `${data.run}.json`);
mkdirSync(dirname(out), { recursive: true });
const text = `${JSON.stringify(data, null, 1)}\n`;
writeFileSync(out, text);
console.log(`joint-data: wrote data/joint/${data.run}.json (${Math.round(text.length / 1024)} KB).`);
