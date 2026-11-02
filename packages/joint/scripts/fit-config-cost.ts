// The fit of the cost factors of the configs of the sweep (`docs/SWEEP.md`, "The cost factors of the configs"). It writes `data/config-cost.json`.
//
//   node scripts/fit-config-cost.ts --records <dir> --state <state.json> --plans <plan.json>,<plan.json> --run <run id> --night <date> [--out <file>]
//
// <dir> holds the artifacts `sweep-records-<round>-<shard>` of one run of `sweep.yml`. One call of gh downloads them:
//   gh run download <run id> -R mark1russell7/layout-contract -p "sweep-records-*" -D <dir>
// The records give the times, and the files `shard-<round>-<shard>.json` give the real minutes of each shard.
// <state.json> is the state of the last round of the run (the artifact `sweep-night-2`). It gives the config of each record and the corpus.
// The plans are the `plan.json` files of the rounds of the run (the artifacts `sweep-night-1` and `sweep-night-2`).
// `fitConfigCost` does the fit. `costScale` of `sweep.ts` uses its scale until the sweep has shards of the new model.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configRun, fitConfigCost, jobCost, JOINT_SPACE, jointCorpus, type ConfigRun, type CostRecord, type FitPlan, type FitShard } from "../src/index.ts";

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]!.replace(/^--/, "")] = process.argv[i + 1]!;
for (const name of ["records", "state", "plans", "run", "night"]) if (args[name] === undefined) throw new Error(`give --${name}`);
const out = args["out"] ?? "data/config-cost.json";

const state = JSON.parse(readFileSync(args["state"]!, "utf8")) as { corpus: Parameters<typeof jointCorpus>[0]; configs: Record<string, { config: Parameters<typeof configRun>[0] }> };
const runs = new Map<string, ConfigRun>();
function runOf(id: string): ConfigRun {
  const entry = state.configs[id];
  if (entry === undefined) throw new Error(`The state has no config ${id}.`);
  if (!runs.has(id)) runs.set(id, configRun(entry.config, JOINT_SPACE));
  return runs.get(id)!;
}

const records: CostRecord[] = [];
const shards: FitShard[] = [];
for (const dir of readdirSync(args["records"]!)) {
  for (const file of readdirSync(join(args["records"]!, dir))) {
    const text = readFileSync(join(args["records"]!, dir, file), "utf8");
    if (file.startsWith("shard-") && file.endsWith(".json")) shards.push(JSON.parse(text) as FitShard);
    if (!(file.startsWith("records-") && file.endsWith(".jsonl"))) continue;
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      const r = JSON.parse(line) as { strategy: string; input: string; ms: number };
      const c = runOf(r.strategy);
      records.push({ input: r.input, pack: c.pack, router: c.router, ms: r.ms });
    }
  }
}

const { manifest, inputs: corpus } = jointCorpus(state.corpus);
const inputs = new Map(manifest.inputs.map((e, i) => [e.id, { spec: e.id.replace(/\/s\d+$/, ""), boxes: corpus[i]!.boxes.length, edges: corpus[i]!.edges?.length ?? 0 }]));
const model = fitConfigCost({
  run: Number(args["run"]),
  night: args["night"]!,
  records,
  shards,
  plans: args["plans"]!.split(",").map((file) => JSON.parse(readFileSync(file, "utf8")) as FitPlan),
  job: (id, input) => {
    const c = runOf(id);
    // The cost without the factors: the run without its pack entry and its router.
    return { base: jobCost({ passes: c.passes, ...(c.iter === undefined ? {} : { iter: c.iter }) }, inputs.get(input)!), pack: c.pack, router: c.router };
  },
});
writeFileSync(out, JSON.stringify(model, null, 2) + "\n");
console.log(`${records.length} records, ${shards.length} shards, ${Object.keys(model.pack).length} pack entries, ${Object.keys(model.router).length} routers, level ${model.level}, scale ${model.scale}. Wrote ${out}.`);
