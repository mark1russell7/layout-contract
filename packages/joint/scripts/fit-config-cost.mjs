// The fit of the cost factors of the configs of the sweep (`docs/SWEEP.md`, "The cost factors of the configs"). It writes `data/config-cost.json`.
//
//   node scripts/fit-config-cost.mjs --records <dir> --state <state.json> --plans <plan.json>,<plan.json> --run <run id> --night <date> [--out <file>]
//
// <dir> holds the artifacts `sweep-records-<round>-<shard>` of one run of `sweep.yml`. One call of gh downloads them:
//   gh run download <run id> -R mark1russell7/layout-contract -p "sweep-records-*" -D <dir>
// <state.json> is the state of the last round of the run (the artifact `sweep-night-2`). It gives the config of each record and the corpus.
// The plans are the `plan.json` files of the rounds of the run (the artifacts `sweep-night-1` and `sweep-night-2`).
//
// The script fits `log(ms) = input + pack + router` over the records by medians (`fitConfigFactors`).
// Then it sets `level` so the jobs of the plans have the same planned minutes with the factors as without them.
// `scale` is the median of real over planned minutes of the shards of the run, with the factors. The files `shard-<round>-<shard>.json` of <dir> give the real minutes.
// `costScale` of `sweep.mjs` uses this scale until the sweep has shards of the new model.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { median } from "@mark1russell7/rigor-statistics";
import { configFactor, configRun, fitConfigFactors, jobCost, JOINT_SPACE, jointCorpus } from "../src/index.ts";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
for (const name of ["records", "state", "plans", "run", "night"]) if (args[name] === undefined) throw new Error(`give --${name}`);
const out = args.out ?? "data/config-cost.json";

const state = JSON.parse(readFileSync(args.state, "utf8"));
const runOf = new Map();
const run = (id) => {
  if (!runOf.has(id)) {
    const entry = state.configs[id];
    runOf.set(id, entry === undefined ? undefined : configRun(entry.config, JOINT_SPACE));
  }
  return runOf.get(id);
};

const records = [];
const shards = [];
let unknown = 0;
for (const dir of readdirSync(args.records)) {
  for (const file of readdirSync(join(args.records, dir)).filter((f) => f.startsWith("shard-") && f.endsWith(".json"))) shards.push(JSON.parse(readFileSync(join(args.records, dir, file), "utf8")));
  for (const file of readdirSync(join(args.records, dir)).filter((f) => f.startsWith("records-") && f.endsWith(".jsonl"))) {
    for (const line of readFileSync(join(args.records, dir, file), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const r = JSON.parse(line);
      const c = run(r.strategy);
      if (c === undefined) unknown++;
      else records.push({ input: r.input, pack: c.pack, router: c.router, ms: r.ms });
    }
  }
}
const { pack, router } = fitConfigFactors(records);

// The level keeps the planned minutes of the jobs of the plans.
const { manifest, inputs: corpus } = jointCorpus(state.corpus);
const inputs = new Map(manifest.inputs.map((e, i) => [e.id, { spec: e.id.replace(/\/s\d+$/, ""), boxes: corpus[i].boxes.length, edges: corpus[i].edges?.length ?? 0 }]));
const unit = { run: Number(args.run), night: args.night, records: records.length, level: 1, pack, router };
const plans = new Map(args.plans.split(",").map((file) => JSON.parse(readFileSync(file, "utf8"))).map((p) => [p.round, p]));
/** This function gives the planned milliseconds of a unit without the factors and with the factors of `model`. */
const price = (u, model) => {
  let before = 0;
  let after = 0;
  for (const id of u.configs) {
    const c = run(id);
    const base = jobCost({ passes: c.passes, iter: c.iter }, inputs.get(u.input));
    before += base;
    after += base * configFactor(c, model);
  }
  return { before, after };
};
const totals = [...plans.values()].flatMap((p) => p.units).map((u) => price(u, unit));
const level = Math.round((totals.reduce((s, x) => s + x.before, 0) / totals.reduce((s, x) => s + x.after, 0)) * 1000) / 1000;
const leveled = { ...unit, level };
// A stopped shard counts with the units that it ran, as in `costScale`.
const ratios = shards.map((s) => {
  const p = plans.get(s.round);
  const byId = new Map(p.units.map((u) => [u.id, u]));
  const ran = p.shards[s.shard].slice(0, s.stopped === true ? s.done : undefined);
  return s.real / (ran.reduce((sum, id) => sum + price(byId.get(id), leveled).after, 0) / 60000);
});
if (ratios.length === 0) throw new Error(`The folder ${args.records} has no shard files.`);
const model = { ...leveled, scale: Math.round(median(ratios) * 1000) / 1000 };
writeFileSync(out, JSON.stringify(model, null, 2) + "\n");
console.log(`${records.length} records (${unknown} without a config), ${Object.keys(pack).length} pack entries, ${Object.keys(router).length} routers, level ${model.level}, scale ${model.scale} from ${ratios.length} shards. Wrote ${out}.`);
