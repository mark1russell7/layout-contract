// The joint benchmark (`docs/JOINT-BENCH.md`). Start it with `pnpm bench <command>`.
//
//   run --shards <n> --shard <i> --out <dir> [--slice pr]   writes <dir>/records-<i>.jsonl
//   analyze --records <dir> --out <dir> [--slice pr]        writes <dir>/report.json and <dir>/report.md
//
// The slice `pr` is the small slice of the pull request: seed 1 of the specs with count 10 and of the fixed cases.
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, jointCorpus, reportMarkdown, runEnv, runInput, shardOf } from "../src/index.ts";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];

/** This function gives the inputs and their manifest entries, in the order of the corpus, for the slice of the arguments. */
function corpusSlice() {
  const { manifest, inputs } = jointCorpus();
  const rows = inputs.map((input, i) => ({ input, entry: manifest.inputs[i] }));
  if (args.slice === undefined) return rows;
  if (args.slice !== "pr") throw new RangeError(`The slice is "pr", not "${args.slice}".`);
  return rows.filter(({ entry }) => entry.id.endsWith("/s1") && (entry.cell.count === "10" || entry.id.includes("/edge-cases.")));
}

if (command === "run") {
  const shards = Number(args.shards ?? 1);
  const shard = Number(args.shard ?? 0);
  const out = args.out ?? "bench-out";
  mkdirSync(out, { recursive: true });
  const file = join(out, `records-${shard}.jsonl`);
  writeFileSync(file, "");
  const env = runEnv();
  const commit = process.env.GITHUB_SHA;
  // The largest inputs go first, so each shard gets a fair part of them.
  const ordered = corpusSlice().sort((a, b) => b.input.boxes.length - a.input.boxes.length);
  const rows = shardOf(ordered, shard, shards);
  console.log(`shard ${shard} of ${shards}: ${rows.length} inputs`);
  for (const { input, entry } of rows) {
    const t0 = performance.now();
    const records = runInput(input, entry.cell, { env, ...(commit === undefined ? {} : { commit }) });
    appendFileSync(file, records.map((r) => JSON.stringify(r) + "\n").join(""));
    const skipped = records.filter((r) => r.skipped !== undefined).length;
    console.log(`${input.id}: ${records.length} records, ${skipped} skipped, ${Math.round(performance.now() - t0)} ms`);
  }
} else if (command === "analyze") {
  const dir = args.records ?? "bench-out";
  const out = args.out ?? dir;
  const records = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort())
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line));
  const inputs = corpusSlice().map(({ entry }) => ({
    id: entry.id,
    seed: Number(/\/s(\d+)$/.exec(entry.id)[1]),
    spec: entry.id.replace(/\/s\d+$/, ""),
    kind: entry.id.split("/")[1].split(".")[0],
    cell: entry.cell,
  }));
  const report = analyze(records, inputs);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(out, "report.md"), reportMarkdown(report));
  console.log(reportMarkdown(report));
} else {
  console.error("The command is run or analyze.");
  process.exit(2);
}
