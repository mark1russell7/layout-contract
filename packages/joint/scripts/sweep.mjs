// The nightly sweep over the joint space (`docs/SWEEP.md`, roadmap item L35). The workflow `sweep.yml` starts each command. Do not start the runs on a local computer.
//
//   plan --data <dir> --out <dir> [--date YYYY-MM-DD] [--target-minutes 30] [--max-shards 20] [--max-configs 400] [--corpus <set>] [--design <rows>]
//        [--budget-minutes <wall minutes of the round> --lanes 3 --overhead-minutes 6] [--scale <real minutes of a planned minute>] [--budget-facts <file>]
//        reads the state of the epoch from the data branch in <dir>, plans round 1, and writes <out>/state.json, <out>/plan.json and <out>/matrix.json
//        with --design, round 1 runs a Saltelli design of <rows> rows (`planDesign`, L52) instead of a new sample
//   run --plan <dir> --shard <i> --out <dir> [--deadline-minutes <m>] [--hard-deadline-minutes <m>]
//        runs the units of shard <i> of <dir>/plan.json, and writes <out>/records-<round>-<i>.jsonl and <out>/shard-<round>-<i>.json
//        with --hard-deadline-minutes, a child runs the shard, and the parent stops it at that time, also in its first unit. The parent then keeps each whole record and writes a censored row (L115).
//   race --night <dir> --records <dir> --out <dir> [--target-minutes 30] [--max-shards 20] [--max-configs 400]
//        adds the records of round 1 to the state, races the configs, plans round 2, and writes the same files as plan
//   promote-plan --out <dir> [--target-minutes 30] [--max-shards 20] [--corpus <set>]
//        plans the promotion test of L61 on its fresh seeds, and writes <out>/plan.json and <out>/matrix.json. The command run reads the seeds from the plan.
//   promote --plan <dir> --records <dir> --out <dir>
//        gives the result of the promotion test: <out>/promotion.json and <out>/promotion.md
//   summarize --night <dir> --records <dir> --data <dir> --out <dir> [--run <id>] [--run-jobs <file>]
//        adds the records of round 2, and writes the new tree of the data branch to <out>, with <out>/night.md for the summary of the job
//        --run-jobs is the output of `gh run view --json jobs`. It gives the wall of the rounds. With no such file, the wall reads "not read".
//
// The date is the night of the run in UTC. It seeds the sample, so a rerun of a night has the same plan.
// Each unit is one run of `pairRuns` on one input with the pairs and the lane entries of its configs. The records get the config id as their strategy, and each goes to the file when it ends.
// Each unit prints `<input id>#<k>: <records> records, <skipped> skipped, <wall ms> ms, <pairs> pairs, <passes> lane passes`. `fit-cost.mjs` reads these lines.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { caseProgress, startSupervisedProcess, superviseCases } from "@mark1russell7/rigor-bench/supervise";
import {
  applyRecords,
  BASELINE_ARM,
  GATE_LANES,
  gateCost,
  gateEstimate,
  BENCH_SPACE_VERSION,
  baselineIds,
  budgetLine,
  costClaimScore,
  costHistory,
  CONFIG_COST,
  CONFIG_COST_ID,
  configLabel,
  emptyState,
  epochStep,
  hashesOfState,
  INCUMBENT,
  iterPlanPairs,
  jointCorpus,
  labelLine,
  LOST_METHOD_NOTE,
  lostLine,
  lostPairs,
  noReferenceRecords,
  noteLost,
  noteMisses,
  applyKept,
  censoredLines,
  waitingLine,
  pairRuns,
  planDesign,
  planRound1,
  plannedWall,
  planRound2,
  promoteConfigs,
  promoteMarkdown,
  promotePlan,
  PROMOTE_SEEDS,
  RACE_NOTE_2026_11_02,
  raceLines,
  raceNight,
  roundWallsOf,
  runEnv,
  SET_V2,
  SETS,
  SHARD_CASE,
  statusCounts,
  shardWallMinutes,
  stoppedShard,
  summaryRows,
  summaryTable,
  unitExpected,
  wholeLines,
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
function corpusOf(set, seeds) {
  if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
  const { manifest, inputs } = jointCorpus(set, seeds === undefined ? {} : { seeds });
  const rows = inputs.map((input, i) => ({ input, entry: manifest.inputs[i] }));
  const sweep = rows.map(({ input, entry }) => ({
    id: entry.id,
    hash: entry.hash,
    spec: entry.id.replace(/\/s\d+$/, ""),
    kind: entry.id.split("/")[1].split(".")[0],
    seed: Number(/\/s(\d+)$/.exec(entry.id)[1]),
    stress: entry.stress === true,
    boxes: input.boxes.length,
    edges: input.edges?.length ?? 0,
  }));
  return { rows, sweep };
}

/**
 * This function gives the real minutes of one planned minute: the median of real over planned of the shards of the last 5 nights (L81).
 * Only the shards of the cost model `CONFIG_COST_ID` count, because a shard of another model has another scale.
 * A stopped shard counts with the planned minutes of the units that it ran.
 * A new epoch has no shards. Then the scale comes from the epoch of the data branch with the latest night, because the cost model is the same.
 * With no shard of the model, the scale is the scale of the fit of the model (`CONFIG_COST.scale`).
 */
function costScale(state, data) {
  const ratiosOf = (s) =>
    s.nights
      .slice(-5)
      .flatMap((n) => n.shards)
      .filter((x) => x.costModel === CONFIG_COST_ID)
      .map((x) => ({ planned: x.stopped === true ? x.plannedDone : x.planned, real: x.real }))
      .filter((x) => x.planned > 0 && x.real > 0)
      .map((x) => x.real / x.planned);
  let ratios = ratiosOf(state);
  const epochs = data === undefined ? "" : join(data, "epochs");
  if (ratios.length === 0 && epochs !== "" && existsSync(epochs)) {
    const last = (s) => s.nights.at(-1)?.date ?? "";
    const others = readdirSync(epochs)
      .map((e) => join(epochs, e, "state.json"))
      .filter((file) => existsSync(file))
      .map((file) => readJson(file))
      .filter((s) => ratiosOf(s).length > 0)
      .sort((a, b) => (last(a) < last(b) ? 1 : last(a) > last(b) ? -1 : 0));
    if (others.length > 0) ratios = ratiosOf(others[0]);
  }
  ratios.sort((a, b) => a - b);
  return ratios.length === 0 ? CONFIG_COST.scale : ratios[Math.floor(ratios.length / 2)];
}

/** This function gives each night of the state and of the other epochs of the data branch. */
function nightsOfAllEpochs(state, data) {
  const epochs = data === undefined ? "" : join(data, "epochs");
  const others = epochs !== "" && existsSync(epochs) ? readdirSync(epochs).filter((e) => e !== state.epoch).map((e) => join(epochs, e, "state.json")).filter((file) => existsSync(file)) : [];
  return [...state.nights, ...others.flatMap((file) => readJson(file).nights)];
}

/**
 * This function gives the options of the plans of a round. The target is in real minutes, so the plan divides it by the measured scale.
 * With --budget-minutes, the round has at most the waves of shards that end in that wall time on --lanes runners. Each job has --overhead-minutes of setup.
 */
function planOptions(date, state) {
  const scale = args.scale === undefined ? costScale(state, args.data) : numberArg("scale", 1);
  const target = numberArg("target-minutes", 30);
  let maxShards = numberArg("max-shards", 20);
  const budget = args["budget-minutes"] === undefined ? null : numberArg("budget-minutes", 1);
  if (budget !== null) maxShards = Math.min(maxShards, numberArg("lanes", 3) * Math.max(1, Math.floor(budget / (target + numberArg("overhead-minutes", 6)))));
  return { date, target: (target * 60000) / scale, maxShards, maxConfigs: numberArg("max-configs", 400), scale, budget };
}

/** This function writes the files of a plan: the state, the plan of the shards and the matrix of the workflow. */
function writePlan(out, state, night, options) {
  // The night keeps the scale and the budget of each round, so the summary scores the cost model.
  const entry = state.nights.find((n) => n.date === night.date);
  // The cost claim comes from the plan, before each shard runs. The history comes once, at round 1, because the race has no other epochs at hand.
  entry.history ??= costHistory(nightsOfAllEpochs(state, args.data), CONFIG_COST_ID, night.date);
  entry.cost = { ...(entry.cost ?? {}), [night.round]: { scale: options.scale, budget: options.budget, maxShards: options.maxShards, plannedMinutes: night.facts.minutes, plannedWall: plannedWall(night.facts.longest, night.facts.minutes) } };
  // A missing file is a night with no budget, for example a dispatch. A thin budget stays on the record, and the page shows it.
  if (args["budget-facts"] !== undefined && existsSync(args["budget-facts"])) entry.budget = readJson(args["budget-facts"]);
  writeJson(join(out, "state.json"), state, 0);
  writeJson(join(out, "plan.json"), {
    round: night.round,
    date: night.date,
    epoch: state.epoch,
    corpus: state.corpus,
    scale: options.scale,
    costModel: CONFIG_COST_ID,
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
      `${f.minutes.toFixed(1)} planned minutes, the longest shard ${f.longest.toFixed(1)}, scale ${options.scale.toFixed(2)}, ` +
      `budget ${options.budget === null ? "none" : `${options.budget} minutes`}, at most ${options.maxShards} shards`,
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

/**
 * This function adds the records and the shard times of a round to the state, and counts the planned pairs that gave no value.
 * It gives the lines of the records with no reference. These records are in no value. The night keeps them in a file, each with its tag.
 */
function applyRound(state, inputs, dir, plan) {
  const { records, shards } = readRecords(dir);
  // A round with jobs and no records examined nothing: the download failed, or each shard stopped. The sweep stops, and the state does not change.
  if (plan.units.length > 0 && records.length === 0)
    throw new Error(`Round ${plan.round} has ${plan.units.length} units, but the folder ${dir} has no records (*.jsonl). The sweep expected the records of each shard of the round.`);
  applyRecords(state, records, inputs, plan.date);
  const night = state.nights.find((n) => n.date === plan.date);
  const kept = noReferenceRecords(state, records).map((record) => JSON.stringify({ tag: "no reference", night: plan.date, round: plan.round, record }) + "\n");
  for (const s of shards)
    night.shards.push({ round: s.round, shard: s.shard, planned: s.planned, real: s.real, ...(plan.costModel === undefined ? {} : { costModel: plan.costModel }), ...(s.stopped === true ? { stopped: true, plannedDone: s.plannedDone, done: s.done, units: s.units } : {}), ...(s.elapsedMinutes === undefined ? {} : { elapsedMinutes: s.elapsedMinutes }), ...(s.censored === undefined ? {} : { censored: s.censored }) });
  const censored = new Set(shards.flatMap((s) => (s.censored?.configs ?? []).map((c) => `${c}|${s.censored.input}`)));
  noteLost(night, plan.round, plan.units, lostPairs(state, plan.units, records, censored));
  console.log(`round ${plan.round}: ${records.length} records of ${shards.length} shards. ${lostLine(night)}`);
  return kept;
}

/** The file of the night with the kept records of the earlier nights of the epoch. */
const KEPT_EARLIER = "kept-earlier.jsonl";

/** The date of today in UTC. */
const today = () => new Date().toISOString().slice(0, 10);

/** The claim of the cost model for each shard (`docs/SWEEP.md`): the real minutes are within 25% of the planned minutes times the scale. */
const COST_CLAIM = { p: 0.6, within: 0.25 };

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
  } else {
    const options = planOptions(date, state);
    if (args.design !== undefined) writePlan(out, state, planDesign(state, sweep, { ...options, n: numberArg("design", 0) }), options);
    else writePlan(out, state, planRound1(state, sweep, options), options);
    // The race has no data branch, so the kept records of the epoch go with the night in its artifact.
    const keptFile = join(dirname(file), "no-reference.jsonl");
    if (existsSync(keptFile)) cpSync(keptFile, join(out, KEPT_EARLIER));
  }
} else if (command === "run") {
  const dir = args.plan ?? "night";
  const plan = readJson(join(dir, "plan.json"));
  const shard = Number(args.shard ?? 0);
  if (!(Number.isInteger(shard) && shard >= 0 && shard < plan.shards.length)) throw new RangeError(`The shard is an integer from 0 to ${plan.shards.length - 1}, not ${args.shard}.`);
  const out = args.out ?? "records";
  mkdirSync(out, { recursive: true });
  const file = join(out, `records-${plan.round}-${shard}.jsonl`);
  const shardFile = join(out, `shard-${plan.round}-${shard}.json`);
  // The folder of the records keeps this file. `readRecords` reads no file with this name.
  const progressFile = join(out, `progress-${plan.round}-${shard}.log`);
  const hard = args["hard-deadline-minutes"] === undefined ? null : numberArg("hard-deadline-minutes", 1);
  if (hard !== null && args.child === undefined) {
    // One case for the whole shard: the clock starts once in the child, so the budget is a deadline from the start of the shard. The first unit gets no exception.
    const startedAt = Date.now();
    const result = await superviseCases({
      cases: [{ id: SHARD_CASE, budgetMs: hard * 60000 }],
      progressFile,
      start: () => startSupervisedProcess([process.execPath, ...process.execArgv, ...process.argv.slice(1), "--child", "on"]),
      onEnd: () => {},
    });
    // A code above 0 or a signal with the case not ended is a crash of the child, for example the limit of the heap. The finished records stay in that case too.
    const over = result.ends.length > 0;
    if (over || result.left.length > 0) {
      const text = existsSync(file) ? readFileSync(file, "utf8") : "";
      const whole = wholeLines(text);
      if (whole !== text) writeFileSync(file, whole);
      let written = null;
      // A stop can cut the shard file too. A cut file reads as no file.
      try {
        written = readJson(shardFile);
      } catch {
        written = null;
      }
      const row = stoppedShard(plan, shard, written, whole, { startedAt, at: Date.now(), reason: over ? "hard deadline" : "child failed" });
      writeJson(shardFile, row);
      console.log(`The shard stopped after ${row.elapsedMinutes?.toFixed(1)} minutes: ${over ? "the hard deadline" : `the child failed with the code ${result.code}`}. The censored row: ${JSON.stringify(row.censored ?? null)}.`);
      if (!over) process.exit(result.code || 1);
    }
    process.exit(0);
  }
  const progress = hard === null ? null : caseProgress(progressFile);
  progress?.start(SHARD_CASE);
  writeFileSync(file, "");
  const { rows } = corpusOf(plan.corpus, plan.seeds);
  const byInput = new Map(rows.map((row) => [row.entry.id, row]));
  const units = new Map(plan.units.map((u) => [u.id, u]));
  const env = runEnv();
  const commit = process.env.GITHUB_SHA;
  const start = performance.now();
  // With --deadline-minutes, a unit that the cost model does not see ending before the deadline does not start (L81). The shard then stops cleanly.
  // The expected time of a unit uses the real time of the units that the shard ran (`unitExpected`), so a shard that runs slow stops in time.
  // Each record is in the file when its pair ends, so a stop keeps the finished work, also inside a unit. The next nights plan the rest.
  // The shard file is written before each unit as a stopped shard. If the step stops at its timeout, the file gives the units that ended.
  const deadline = args["deadline-minutes"] === undefined ? Infinity : numberArg("deadline-minutes", 1) * 60000;
  const scale = plan.scale ?? 1;
  let done = 0;
  let plannedDone = 0;
  const count = plan.shards[shard].length;
  const writeShard = (stopped) =>
    writeJson(shardFile, {
      round: plan.round,
      shard,
      planned: plan.loads[shard] / 60000,
      real: (performance.now() - start) / 60000,
      ...(stopped ? { stopped: true, done, units: count, plannedDone: plannedDone / 60000, unitAt: Date.now() } : {}),
    });
  console.log(`round ${plan.round} shard ${shard} of ${plan.shards.length}: ${plan.shards[shard].length} units, ${(plan.loads[shard] / 60000).toFixed(1)} planned minutes`);
  for (const id of plan.shards[shard]) {
    const unit = units.get(id);
    // The first unit always runs, so a unit that is longer than the deadline does not wait for ever.
    const expected = unitExpected(unit.cost, scale, performance.now() - start, plannedDone);
    if (done > 0 && performance.now() - start + expected > deadline) {
      console.log(`The shard stops before ${unit.id}: it is ${((performance.now() - start) / 60000).toFixed(1)} minutes in, and the unit has ${(expected / 60000).toFixed(1)} expected minutes.`);
      break;
    }
    writeShard(true);
    const { input, entry } = byInput.get(unit.input);
    const runs = unit.configs.map((c) => ({ id: c, run: plan.runs[c] }));
    const pairs = runs.filter((r) => r.run.lane === undefined && r.run.iter === undefined).map((r) => r.run.pair);
    const lanes = runs.filter((r) => r.run.lane !== undefined).map((r) => r.run.lane);
    const iterate = runs.filter((r) => r.run.iter !== undefined).map((r) => r.run.iter);
    const byPair = new Map(runs.map((r) => [r.run.pair, r.id]));
    const t0 = performance.now();
    // With freeRoutes, the runner frees each route after its record (L63). The records do not change.
    let written = 0;
    let skipped = 0;
    for (const { record } of pairRuns(input, entry.cell, { env, corpus: plan.corpus, pairs, lanes, iterate, freeRoutes: true, ...(commit === undefined ? {} : { commit }) })) {
      if (!byPair.has(record.strategy)) continue;
      appendFileSync(file, JSON.stringify({ ...record, strategy: byPair.get(record.strategy), options: { ...record.options, pair: record.strategy } }) + "\n");
      written++;
      if (record.skipped !== undefined) skipped++;
    }
    const passes = runs.reduce((n, r) => n + r.run.passes, 0);
    // The rounds of the iteration chains count as pairs, at `iterPlanPairs` (3 pairs for each round), as the plan counts them.
    const pairCount = runs.length + iterPlanPairs(iterate);
    console.log(`${unit.id}: ${written} records, ${skipped} skipped, ${Math.round(performance.now() - t0)} ms, ${pairCount} pairs, ${passes} lane passes`);
    done++;
    plannedDone += unit.cost;
  }
  writeShard(done < count);
  progress?.end(SHARD_CASE);
} else if (command === "promote-plan") {
  const set = args.corpus ?? SET_V2;
  const date = today();
  const options = planOptions(date, { nights: [] });
  const { sweep } = corpusOf(set, PROMOTE_SEEDS);
  const night = promotePlan(sweep, { ...options, maxConfigs: 0, date });
  const out = args.out ?? "night";
  writeJson(join(out, "plan.json"), {
    round: night.round,
    date,
    corpus: set,
    seeds: night.seeds,
    scale: options.scale,
    costModel: CONFIG_COST_ID,
    shards: night.plan.shards,
    loads: night.plan.loads,
    units: night.plan.units,
    runs: night.runs,
    facts: night.facts,
  });
  writeJson(join(out, "matrix.json"), night.plan.shards.map((_, i) => i));
  const f = night.facts;
  console.log(`The promotion test: ${f.configs} configs, ${f.jobs} jobs, ${f.units} units, ${f.shards} shards, ${f.minutes.toFixed(1)} planned minutes, the longest shard ${f.longest.toFixed(1)}.`);
} else if (command === "promote") {
  const plan = readJson(join(args.plan ?? "night", "plan.json"));
  const { rows } = corpusOf(plan.corpus, plan.seeds);
  const inputs = corpusOf(plan.corpus, plan.seeds).sweep.map((s, i) => ({ ...s, cell: rows[i].entry.cell }));
  const report = promoteConfigs(readRecords(args.records ?? "records").records, inputs);
  const out = args.out ?? "promotion";
  writeJson(join(out, "promotion.json"), report, 2);
  writeFileSync(join(out, "promotion.md"), promoteMarkdown(report));
  console.log(`The promotion test: ${report.passed.length} of ${report.rows.length} configs pass.`);
} else if (command === "race") {
  const dir = args.night ?? "night";
  const state = readJson(join(dir, "state.json"));
  const plan = readJson(join(dir, "plan.json"));
  const { sweep } = corpusOf(state.corpus);
  const kept = applyRound(state, sweep, args.records ?? "records", plan);
  // This file goes with the night in its artifact. The job summarize adds it to the file of the epoch.
  if (kept.length > 0) {
    mkdirSync(args.out ?? "night2", { recursive: true });
    writeFileSync(join(args.out ?? "night2", "no-reference.jsonl"), kept.join(""));
  }
  // A kept record gives a value once its reference returns. A kept file comes only from the plan of this night, so the records of this round wait for the next night.
  const keptEarlier = join(dir, KEPT_EARLIER);
  const given = applyKept(state, existsSync(keptEarlier) ? readFileSync(keptEarlier, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line)) : [], plan.date);
  console.log(`Kept records that gave a value: ${given}.`);
  const outcomes = raceNight(state, sweep, { date: plan.date });
  const labels = {};
  for (const o of outcomes) labels[o.label] = (labels[o.label] ?? 0) + 1;
  console.log(`race of ${plan.date}: ${JSON.stringify(state.nights.at(-1).race)}, labels ${JSON.stringify(labels)}`);
  const options = planOptions(plan.date, state);
  writePlan(args.out ?? "night2", state, planRound2(state, sweep, options), options);
} else if (command === "gate-estimate") {
  // Each file under --runs is one gate, as `gh run view --json jobs` writes it. The first word of the output is the estimate in minutes, and the rest is the reason for the summary.
  const files = existsSync(args.runs) ? readdirSync(args.runs).filter((f) => f.endsWith(".json")).sort() : [];
  const gates = files.map((f) => readJson(join(args.runs, f)).jobs ?? []);
  const parts = gates.map((jobs, i) => {
    const cost = gateCost(jobs);
    return `${files[i].replace(/\.json$/, "")}: longest job ${Math.round(cost.longest)}, ${Math.round(cost.jobMinutes)} job minutes`;
  });
  console.log(`${gateEstimate(gates)} the median at ${GATE_LANES} lanes over ${gates.every((jobs) => !(gateCost(jobs).jobMinutes > 0)) ? "no gate with job times, so the fallback" : parts.join("; ")}`);
} else if (command === "summarize") {
  const dir = args.night ?? "night2";
  const state = readJson(join(dir, "state.json"));
  const plan = readJson(join(dir, "plan.json"));
  const { sweep } = corpusOf(state.corpus);
  const kept = applyRound(state, sweep, args.records ?? "records", plan);
  const night = state.nights.find((n) => n.date === plan.date);
  noteMisses(state, night);
  delete night.pending;
  if (args.run) night.run = args.run;
  // A failed read of the jobs does not stop the night. The wall then reads "not read".
  if (args["run-jobs"] !== undefined) night.wall = existsSync(args["run-jobs"]) ? { rounds: roundWallsOf(readJson(args["run-jobs"]).jobs ?? []) } : null;
  const out = args.out ?? "out";
  const data = args.data ?? "data";
  // The new tree of the data branch: each file of the old tree, and the files of this epoch.
  mkdirSync(out, { recursive: true });
  if (existsSync(data)) cpSync(data, out, { recursive: true, filter: (from) => !/[\\/]\.git([\\/]|$)/.test(from) });
  const epochDir = join(out, "epochs", state.epoch);
  const { summary, ...rest } = state;
  writeJson(join(epochDir, "state.json"), rest, 0);
  // The records with no reference stay in one file for each epoch, each with its tag. No value reads them (L115).
  const firstRound = join(dir, "no-reference.jsonl");
  const allKept = [...(existsSync(firstRound) ? [readFileSync(firstRound, "utf8")] : []), ...kept].join("");
  if (allKept !== "") appendFileSync(join(epochDir, "no-reference.jsonl"), allKept);
  writeJson(join(epochDir, "summary.json"), { schema: "sweep-summary/1", epoch: state.epoch, ids: baselineIds(), ...summaryTable(summary) }, 0);
  const counts = statusCounts(state);
  const facts = nightFacts(state, night);
  writeJson(join(epochDir, "nights", `${plan.date}.json`), { ...night, counts, facts });
  const indexFile = join(out, "index.json");
  const index = existsSync(indexFile) ? readJson(indexFile) : { schema: "sweep-index/1", epochs: {} };
  // The first night of an epoch measures the step from the epoch before it. Later nights keep that step.
  const step = index.epochs[state.epoch]?.step ?? (index.latest === undefined || index.latest === state.epoch ? undefined : stepFrom(join(data, "epochs", index.latest, "state.json"), state, sweep));
  index.latest = state.epoch;
  index.epochs[state.epoch] = { corpus: state.corpus, nights: rest.nights.length, last: plan.date, missing: night.missing, configs: Object.keys(state.configs).length, counts, ...(step === undefined ? {} : { step }), cost: costIndexFacts(night, facts) };
  writeJson(indexFile, index);
  writeFileSync(join(out, "night.md"), nightMarkdown(state, night, counts, facts));
  console.log(readFileSync(join(out, "night.md"), "utf8"));
} else {
  throw new RangeError(`The command is plan, run, race or summarize, not "${command}".`);
}

/** This function gives the step from the state in the file `file` to `state`, or `undefined` with no such file. */
function stepFrom(file, state, sweep) {
  if (!existsSync(file)) return undefined;
  const old = readJson(file);
  const [ids, hashes] = [sweep.map((i) => i.id), sweep.map((i) => i.hash)];
  const baselineOf = (s) => Object.keys(s.configs).filter((id) => s.configs[id].status === "baseline");
  return epochStep(
    { epoch: old.epoch, inputs: old.inputs, hashes: hashesOfState(old, ids, hashes), baseline: baselineOf(old), reference: old.reference, stepValues: old.stepValues },
    { epoch: state.epoch, inputs: ids, hashes, baseline: baselineOf(state), reference: state.reference, stepValues: state.stepValues },
  );
}

/** This function gives the facts of the cost of a night for the page. */
function costIndexFacts(night, facts) {
  const { jobMinutes, jobMinutesStatus, wall, wallStatus, shards, widthCap } = facts.costModel.interval;
  return { date: night.date, jobMinutes, jobMinutesStatus, wall, wallStatus, shards, widthCap, budget: night.budget === undefined ? null : budgetLine(night.budget), thin: night.budget !== undefined && (night.budget.failedRead !== null || night.budget.fallback) };
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
  const real = night.shards.reduce((s, x) => s + shardWallMinutes(x), 0);
  return {
    costModel: costModelScore(night),
    longestShard: Math.max(0, ...night.shards.map(shardWallMinutes)),
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

/**
 * This function scores the cost model of a night. `interval` holds the claim of the plan (`docs/SWEEP.md`, "The cost claim").
 * The older claim stays beside it: one claim for each shard at p 0.6 within 25%, scored by Brier, with a stopped shard as a miss.
 */
function costModelScore(night) {
  const rows = night.shards.map((s) => {
    const expected = s.planned * (night.cost?.[s.round]?.scale ?? 1);
    const hit = s.stopped !== true && Math.abs(s.real - expected) <= COST_CLAIM.within * expected;
    return { hit, brier: (COST_CLAIM.p - (hit ? 1 : 0)) ** 2 };
  });
  const hits = rows.filter((r) => r.hit).length;
  return { ...COST_CLAIM, shards: rows.length, hits, stopped: night.shards.filter((s) => s.stopped === true).length, brier: rows.length === 0 ? null : rows.reduce((s, r) => s + r.brier, 0) / rows.length, cost: night.cost ?? {}, interval: costClaimScore(night) };
}

/** This function gives the lines of the cost claim of a night. The night comes first, and the shards second. */
function costClaimLines(c, budget) {
  const claim = (name, x, status) => (x === null ? `${name}: ${status}, so it has no score.` : `${name}: ${x.real.toFixed(0)} real minutes, claim ${x.lo.toFixed(0)} to ${x.hi.toFixed(0)} from ${x.planned.toFixed(0)} planned, ${x.side}, Brier ${x.brier.toFixed(3)}.`);
  const lines = ["", `Cost claim at p ${c.p}, from the nights ${c.history?.nights.join(", ") || "none"}:`, "", `- ${claim("Job minutes of the night", c.jobMinutes, c.jobMinutesStatus)}`, `- ${claim("Wall of the rounds of the night", c.wall, c.wallStatus)}`];
  const s = c.shards;
  lines.push(s === null ? "- Shards: no history, so they have no score." : `- Shards: ${s.hits} of ${s.shards} in the interval x${s.lo.toFixed(2)} to x${s.hi.toFixed(2)}, ${s.low} low, ${s.high} high, ${s.stopped} stopped. Brier ${s.brier === null ? "none" : s.brier.toFixed(3)}. Width x${s.width.toFixed(2)}${s.overCap ? ` is over the cap x${c.widthCap}` : `, cap x${c.widthCap}`}. ${c.capNote}`);
  if (budget !== undefined) lines.push(`- ${budgetLine(budget)}`);
  lines.push("");
  return lines;
}

/** This function gives the summary of a night in Markdown. */
function nightMarkdown(state, night, counts, facts) {
  const lines = [`# Sweep of ${night.date}`, "", `Epoch \`${state.epoch}\`, seed ${night.seed}${night.run ? `, run ${night.run}` : ""}.`, ""];
  lines.push("| Round | Configs | New | Jobs | Units | Shards | Planned minutes | Longest planned shard |", "|---|---|---|---|---|---|---|---|");
  for (const [k, r] of [["1", night.round1], ["2", night.round2]]) if (r) lines.push(`| ${k} | ${r.configs} | ${r.sampled} | ${r.jobs} | ${r.units} | ${r.shards} | ${r.minutes.toFixed(1)} | ${r.longest.toFixed(1)} |`);
  lines.push("", ...raceLines(night.race), "", `Note: ${RACE_NOTE_2026_11_02}`, "", `Status counts: ${JSON.stringify(counts)}.`, "");
  lines.push(`Shards: ${night.shards.length}, the longest ${facts.longestShard.toFixed(1)} real minutes. Planned ${facts.plannedMinutes.toFixed(1)} minutes in all, real ${facts.realMinutes.toFixed(1)}.`);
  const cm = facts.costModel;
  lines.push(`Cost model: scale ${Object.entries(cm.cost).map(([r, c]) => `round ${r} ${c.scale.toFixed(2)}`).join(", ") || "none"}. ${cm.hits} of ${cm.shards} shards within ${cm.within * 100}% of the expected minutes, ${cm.stopped} stopped. Brier ${cm.brier === null ? "none" : cm.brier.toFixed(3)} at p ${cm.p}.`);
  lines.push(...costClaimLines(cm.interval, night.budget));
  for (const s of night.shards) if (s.censored !== undefined) lines.push(`Round ${s.round} shard ${s.shard} stopped in the unit \`${s.censored.unit}\` (${s.censored.reason}). The unit took at least ${(s.censored.atLeastMs / 60000).toFixed(1)} minutes, and ${s.censored.configs.length} configs have no record.`);
  lines.push(`Drift of the baseline arm: ${night.drift} inputs. Values: ${night.values}. ${lostLine(night)}`, "", LOST_METHOD_NOTE, "");
  lines.push(waitingLine(night), `Kept records that gave a value on this night: ${night.kept ?? 0}.`, "", ...censoredLines(state), "");
  lines.push("| Baseline config | Headline misses of the reference floor | Inputs |", "|---|---|---|");
  for (const [name, m] of Object.entries(facts.misses)) lines.push(`| \`${name}\` | ${m.misses} | ${m.of} |`);
  const best = Object.entries(state.configs)
    .filter(([, c]) => c.status === "alive")
    .sort(([, a], [, b]) => (b.mean ?? 0) - (a.mean ?? 0))
    .slice(0, 10);
  // Both weightings of the gain (L37): the mean of the family means and the mean of the inputs, with the family signs and their sign test.
  const num = (x) => (x === undefined ? "" : x.toFixed(4));
  const signs = (s) => (s === undefined ? "" : `${s.wins} / ${s.losses} / ${s.ties}`);
  lines.push("", "| Alive config | Label | Mean of the family means | Mean of the inputs | Families +/-/0 | Sign test p |", "|---|---|---|---|---|---|");
  for (const [id, c] of best) lines.push(`| \`${id}\` \`${configLabel(c.config)}\` | ${labelLine(c, night.race?.held?.find((h) => h.config === id)?.missing ?? 0, night.race?.held?.find((h) => h.config === id)?.noRead === true)} | ${(c.mean ?? 0).toFixed(4)} | ${num(c.pooled)} | ${signs(c.signs)} | ${num(c.signs?.p)} |`);
  return lines.join("\n") + "\n";
}
