// The nightly sweep over the joint space (`docs/SWEEP.md`, roadmap item L35). The workflow `sweep.yml` starts each command. Do not start the runs on a local computer.
//
//   plan --data <dir> --out <dir> [--date YYYY-MM-DD] [--target-minutes 30] [--max-shards 20] [--max-configs 400] [--corpus <set>] [--design <rows>]
//        reads the state of the epoch from the data branch in <dir>, plans round 1, and writes <out>/state.json, <out>/plan.json and <out>/matrix.json
//        with --design, round 1 runs a Saltelli design of <rows> rows (`planDesign`, L52) instead of a new sample
//   run --plan <dir> --shard <i> --out <dir>
//        runs the units of shard <i> of <dir>/plan.json, and writes <out>/records-<round>-<i>.jsonl and <out>/shard-<round>-<i>.json
//   race --night <dir> --records <dir> --out <dir> [--target-minutes 30] [--max-shards 20] [--max-configs 400]
//        adds the records of round 1 to the state, races the configs, plans round 2, and writes the same files as plan
//   summarize --night <dir> --records <dir> --data <dir> --out <dir> [--run <id>]
//        adds the records of round 2, and writes the new tree of the data branch to <out>, with <out>/night.md for the summary of the job
//
// The date is the night of the run in UTC. It seeds the sample, so a rerun of a night has the same plan.
// Each unit is one call of `runInput` on one input with the pairs and the lane entries of its configs. The records get the config id as their strategy.
// Each unit prints `<input id>#<k>: <records> records, <skipped> skipped, <wall ms> ms, <pairs> pairs, <passes> lane passes`. `fit-cost.mjs` reads these lines.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  applyRecords,
  BASELINE_ARM,
  BENCH_SPACE_VERSION,
  baselineIds,
  configLabel,
  emptyState,
  INCUMBENT,
  iterPlanPairs,
  jointCorpus,
  planDesign,
  planRound1,
  planRound2,
  raceNight,
  runEnv,
  runInput,
  SET_V2,
  SETS,
  statusCounts,
  summaryRows,
  summaryTable,
} from "../src/index.ts";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];

/** This function reads a JSON file. */
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
/** This function writes a JSON file, and makes its folder. */
function writeJson(file, value, indent = 1) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, indent) + "\n");
}
/** This function gives the version of an installed engine. */
const versionOf = (name) => readJson(new URL(`../node_modules/@mark1russell7/${name}/package.json`, import.meta.url)).version;
/** This function gives a number argument with a default. */
function numberArg(name, fallback) {
  const v = Number(args[name] ?? fallback);
  if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`The option --${name} is a number above 0, not "${args[name]}".`);
  return v;
}

/** This function gives the inputs of the corpus as the sweep sees them, and the manifest entry of each input. */
function corpusOf(set) {
  if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
  const { manifest, inputs } = jointCorpus(set);
  const rows = inputs.map((input, i) => ({ input, entry: manifest.inputs[i] }));
  const sweep = rows.map(({ input, entry }) => ({
    id: entry.id,
    spec: entry.id.replace(/\/s\d+$/, ""),
    kind: entry.id.split("/")[1].split(".")[0],
    seed: Number(/\/s(\d+)$/.exec(entry.id)[1]),
    stress: entry.stress === true,
    boxes: input.boxes.length,
    edges: input.edges?.length ?? 0,
  }));
  return { rows, sweep };
}

/** This function gives the options of the plans of a round. */
function planOptions(date) {
  return {
    date,
    target: numberArg("target-minutes", 30) * 60000,
    maxShards: numberArg("max-shards", 20),
    maxConfigs: numberArg("max-configs", 400),
  };
}

/** This function writes the files of a plan: the state, the plan of the shards and the matrix of the workflow. */
function writePlan(out, state, night) {
  writeJson(join(out, "state.json"), state, 0);
  writeJson(join(out, "plan.json"), {
    round: night.round,
    date: night.date,
    epoch: state.epoch,
    corpus: state.corpus,
    shards: night.plan.shards,
    loads: night.plan.loads,
    units: night.plan.units,
    runs: night.runs,
    facts: night.facts,
  });
  writeJson(join(out, "matrix.json"), night.plan.shards.map((_, i) => i));
  const f = night.facts;
  console.log(
    `round ${night.round} of ${night.date}: ${f.configs} configs (${f.sampled} new), ${f.jobs} jobs, ${f.units} units, ${f.shards} shards, ` +
      `${f.minutes.toFixed(1)} planned minutes, the longest shard ${f.longest.toFixed(1)}`,
  );
}

/** This function reads the records and the shard files of a folder, also in the folders of `gh run download`. */
function readRecords(dir) {
  const records = [];
  const shards = [];
  if (!existsSync(dir)) return { records, shards };
  for (const name of readdirSync(dir, { recursive: true }).map(String).sort()) {
    if (name.endsWith(".jsonl")) for (const line of readFileSync(join(dir, name), "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line));
    if (/(^|[\\/])shard-\d+-\d+\.json$/.test(name)) shards.push(readJson(join(dir, name)));
  }
  return { records, shards };
}

/** This function adds the records and the shard times of a round to the state, and counts the jobs of the plan without a record. */
function applyRound(state, inputs, dir, plan) {
  const { records, shards } = readRecords(dir);
  applyRecords(state, records, inputs, plan.date);
  const night = state.nights.find((n) => n.date === plan.date);
  for (const s of shards) night.shards.push({ round: s.round, shard: s.shard, planned: s.planned, real: s.real });
  const seen = new Set(records.map((r) => `${r.strategy}|${r.input}`));
  night.missing += plan.units.reduce((n, u) => n + u.configs.filter((c) => !seen.has(`${c}|${u.input}`)).length, 0);
  console.log(`round ${plan.round}: ${records.length} records of ${shards.length} shards.`);
}

/** The date of today in UTC. */
const today = () => new Date().toISOString().slice(0, 10);

if (command === "plan") {
  const set = args.corpus ?? SET_V2;
  const date = args.date || today();
  const { sweep } = corpusOf(set);
  const epoch = `${set}_packing-${versionOf("packing")}_highways-${versionOf("highways")}_space-${BENCH_SPACE_VERSION}`;
  const file = join(args.data ?? "data", "epochs", epoch, "state.json");
  // The data branch keeps the summary in its own file, so the state of the branch has no summary.
  const summaryFile = join(dirname(file), "summary.json");
  const state = existsSync(file) ? { ...readJson(file), summary: existsSync(summaryFile) ? summaryRows(readJson(summaryFile)) : [] } : emptyState(epoch, set, sweep, undefined, date);
  console.log(existsSync(file) ? `The epoch ${epoch} has ${state.nights.length} nights.` : `The epoch ${epoch} is new.`);
  const out = args.out ?? "night";
  if (state.nights.some((n) => n.date === date)) {
    // A second run of one date, for example a manual run and the schedule on the same night, does nothing. The workflow skips the other jobs.
    console.log(`The state has the night ${date} already. The run skips it.`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "skip.txt"), `${date}\n`);
    writeJson(join(out, "matrix.json"), []);
  } else if (args.design !== undefined) writePlan(out, state, planDesign(state, sweep, { ...planOptions(date), n: numberArg("design", 0) }));
  else writePlan(out, state, planRound1(state, sweep, planOptions(date)));
} else if (command === "run") {
  const dir = args.plan ?? "night";
  const plan = readJson(join(dir, "plan.json"));
  const shard = Number(args.shard ?? 0);
  if (!(Number.isInteger(shard) && shard >= 0 && shard < plan.shards.length)) throw new RangeError(`The shard is an integer from 0 to ${plan.shards.length - 1}, not ${args.shard}.`);
  const out = args.out ?? "records";
  mkdirSync(out, { recursive: true });
  const file = join(out, `records-${plan.round}-${shard}.jsonl`);
  writeFileSync(file, "");
  const { rows } = corpusOf(plan.corpus);
  const byInput = new Map(rows.map((row) => [row.entry.id, row]));
  const units = new Map(plan.units.map((u) => [u.id, u]));
  const env = runEnv();
  const commit = process.env.GITHUB_SHA;
  const start = performance.now();
  console.log(`round ${plan.round} shard ${shard} of ${plan.shards.length}: ${plan.shards[shard].length} units, ${(plan.loads[shard] / 60000).toFixed(1)} planned minutes`);
  for (const id of plan.shards[shard]) {
    const unit = units.get(id);
    const { input, entry } = byInput.get(unit.input);
    const runs = unit.configs.map((c) => ({ id: c, run: plan.runs[c] }));
    const pairs = runs.filter((r) => r.run.lane === undefined && r.run.iter === undefined).map((r) => r.run.pair);
    const lanes = runs.filter((r) => r.run.lane !== undefined).map((r) => r.run.lane);
    const iterate = runs.filter((r) => r.run.iter !== undefined).map((r) => r.run.iter);
    const byPair = new Map(runs.map((r) => [r.run.pair, r.id]));
    const t0 = performance.now();
    const records = runInput(input, entry.cell, { env, corpus: plan.corpus, pairs, lanes, iterate, ...(commit === undefined ? {} : { commit }) })
      .filter((r) => byPair.has(r.strategy))
      .map((r) => ({ ...r, strategy: byPair.get(r.strategy), options: { ...r.options, pair: r.strategy } }));
    appendFileSync(file, records.map((r) => JSON.stringify(r) + "\n").join(""));
    const skipped = records.filter((r) => r.skipped !== undefined).length;
    const passes = runs.reduce((n, r) => n + r.run.passes, 0);
    // The rounds of the iteration chains count as pairs, at `iterPlanPairs` (3 pairs for each round), as the plan counts them.
    const pairCount = runs.length + iterPlanPairs(iterate);
    console.log(`${unit.id}: ${records.length} records, ${skipped} skipped, ${Math.round(performance.now() - t0)} ms, ${pairCount} pairs, ${passes} lane passes`);
  }
  writeJson(join(out, `shard-${plan.round}-${shard}.json`), { round: plan.round, shard, planned: plan.loads[shard] / 60000, real: (performance.now() - start) / 60000 });
} else if (command === "race") {
  const dir = args.night ?? "night";
  const state = readJson(join(dir, "state.json"));
  const plan = readJson(join(dir, "plan.json"));
  const { sweep } = corpusOf(state.corpus);
  applyRound(state, sweep, args.records ?? "records", plan);
  const outcomes = raceNight(state, sweep, { date: plan.date });
  const labels = {};
  for (const o of outcomes) labels[o.label] = (labels[o.label] ?? 0) + 1;
  console.log(`race of ${plan.date}: ${JSON.stringify(state.nights.at(-1).race)}, labels ${JSON.stringify(labels)}`);
  writePlan(args.out ?? "night2", state, planRound2(state, sweep, planOptions(plan.date)));
} else if (command === "summarize") {
  const dir = args.night ?? "night2";
  const state = readJson(join(dir, "state.json"));
  const plan = readJson(join(dir, "plan.json"));
  const { sweep } = corpusOf(state.corpus);
  applyRound(state, sweep, args.records ?? "records", plan);
  const night = state.nights.find((n) => n.date === plan.date);
  if (args.run) night.run = args.run;
  const out = args.out ?? "out";
  const data = args.data ?? "data";
  // The new tree of the data branch: each file of the old tree, and the files of this epoch.
  mkdirSync(out, { recursive: true });
  if (existsSync(data)) cpSync(data, out, { recursive: true, filter: (from) => !/[\\/]\.git([\\/]|$)/.test(from) });
  const epochDir = join(out, "epochs", state.epoch);
  const { summary, ...rest } = state;
  writeJson(join(epochDir, "state.json"), rest, 0);
  writeJson(join(epochDir, "summary.json"), { schema: "sweep-summary/1", epoch: state.epoch, ids: baselineIds(), ...summaryTable(summary) }, 0);
  const counts = statusCounts(state);
  const facts = nightFacts(state, night);
  writeJson(join(epochDir, "nights", `${plan.date}.json`), { ...night, counts, facts });
  const indexFile = join(out, "index.json");
  const index = existsSync(indexFile) ? readJson(indexFile) : { schema: "sweep-index/1", epochs: {} };
  index.latest = state.epoch;
  index.epochs[state.epoch] = { corpus: state.corpus, nights: rest.nights.length, last: plan.date, configs: Object.keys(state.configs).length, counts };
  writeJson(indexFile, index);
  writeFileSync(join(out, "night.md"), nightMarkdown(state, night, counts, facts));
  console.log(readFileSync(join(out, "night.md"), "utf8"));
} else {
  throw new RangeError(`The command is plan, run, race or summarize, not "${command}".`);
}

/** This function gives the facts of a night that the prediction of `docs/SWEEP.md` scores. */
function nightFacts(state, night) {
  const misses = {};
  const ids = baselineIds();
  BASELINE_ARM.forEach((name, k) => {
    const rows = state.summary.filter((r) => r.config === ids[k] && r.cell === "headline");
    misses[name] = { misses: rows.reduce((s, r) => s + r.misses, 0), of: rows.reduce((s, r) => s + r.n, 0) };
  });
  const better = Object.values(state.configs).filter((c) => c.decided === night.date && c.label === "better").length;
  const planned = night.shards.reduce((s, x) => s + x.planned, 0);
  const real = night.shards.reduce((s, x) => s + x.real, 0);
  return {
    longestShard: Math.max(0, ...night.shards.map((s) => s.real)),
    newConfigs: (night.round1?.sampled ?? 0) + (night.round2?.sampled ?? 0),
    raced: night.race?.raced ?? 0,
    dropShare: night.race && night.race.raced > 0 ? night.race.dropped / night.race.raced : null,
    better,
    plannedMinutes: planned,
    realMinutes: real,
    misses,
    incumbent: INCUMBENT,
  };
}

/** This function gives the summary of a night in Markdown. */
function nightMarkdown(state, night, counts, facts) {
  const lines = [`# Sweep of ${night.date}`, "", `Epoch \`${state.epoch}\`, seed ${night.seed}${night.run ? `, run ${night.run}` : ""}.`, ""];
  lines.push("| Round | Configs | New | Jobs | Units | Shards | Planned minutes | Longest planned shard |", "|---|---|---|---|---|---|---|---|");
  for (const [k, r] of [["1", night.round1], ["2", night.round2]]) if (r) lines.push(`| ${k} | ${r.configs} | ${r.sampled} | ${r.jobs} | ${r.units} | ${r.shards} | ${r.minutes.toFixed(1)} | ${r.longest.toFixed(1)} |`);
  lines.push("", `Race: ${JSON.stringify(night.race ?? {})}.`, "", `Status counts: ${JSON.stringify(counts)}.`, "");
  lines.push(`Shards: ${night.shards.length}, the longest ${facts.longestShard.toFixed(1)} real minutes. Planned ${facts.plannedMinutes.toFixed(1)} minutes in all, real ${facts.realMinutes.toFixed(1)}.`);
  lines.push(`Drift of the baseline arm: ${night.drift} inputs. Values: ${night.values}. Jobs without a record: ${night.missing}.`, "");
  lines.push("| Baseline config | Headline misses of the reference floor | Inputs |", "|---|---|---|");
  for (const [name, m] of Object.entries(facts.misses)) lines.push(`| \`${name}\` | ${m.misses} | ${m.of} |`);
  const best = Object.entries(state.configs)
    .filter(([, c]) => c.status === "alive")
    .sort(([, a], [, b]) => (b.mean ?? 0) - (a.mean ?? 0))
    .slice(0, 10);
  lines.push("", "| Alive config | Label | Mean against the incumbent |", "|---|---|---|");
  for (const [id, c] of best) lines.push(`| \`${id}\` \`${configLabel(c.config)}\` | ${c.label ?? ""} | ${(c.mean ?? 0).toFixed(4)} |`);
  return lines.join("\n") + "\n";
}
