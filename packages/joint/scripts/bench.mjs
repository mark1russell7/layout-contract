// The joint benchmark (`docs/JOINT-BENCH.md`). Start it with `pnpm bench <command>`.
//
//   check [--corpus <set>]                                                  examines the claims of the committed manifest and its split file
//   smoke [--corpus <set>]                                                  packs and routes 1 input of each value of spacing with corners
//   run --shards <n> --shard <i> --out <dir> [--slice pr] [--corpus <set>] [--lanes on] [--iterate on] [--cover on] [--pairs <id,id>]   writes <dir>/records-<i>.jsonl
//   plan --shards <n> [--slice pr] [--corpus <set>] [--lanes on] [--iterate on] [--cover on] [--pairs <id,id>]              prints the planned cost of each shard
//   Each of run, plan, resume and costs takes --pair-budget <text>: the time budget of each stage of a pair (parsePairBudget). A run with a budget holds its stamp.
//   resume --records <dir> --out <dir> [--slice pr] [--corpus <set>] [--cover on] [--pairs <id,id>]   keeps the pairs of an earlier run with the stamp of this code (L101)
//   costs --records <dir> [--corpus <set>] [--top <n>]                      prints the wall time of each pair, from the most time to the least
//   confirm --confirm on --records <dir> --out <dir>   writes the decision of L40: <dir>/confirm.json and <dir>/confirm.md
//   analyze --records <dir> --out <dir> [--slice pr] [--corpus <set>] [--allow-missing <file>] [--subset <file>] [--baseline <pair[,pair]>]
//           [--compare <a:b[,a:b]>] [--exclude-pack <id[,id]>] [--oracle-without <id[,id]>] [--times <spec[,spec]>] [--jobs <file>] [--rank-top <n>]
//                                                                            writes <dir>/report.json and <dir>/report.md
//   probe --inputs <id[,id]> --out <dir> [--corpus <set>]                  writes <dir>/records-probe.jsonl and <dir>/probe.jsonl (L77)
//   families [--corpus <set>]                                               prints the JSON list of the probe groups: the tied largest inputs of each family (L81)
//   jobs --groups <file> --modes <m[,m]> --repeats <n> [--limits on] [--limit-repeats <n|auto>]   prints the JSON list of the jobs of the gate (L81)
//   gate --probes <dir> --expected <file> [--limit-mb <n>]                 examines the probes of the jobs of <file> and writes <dir>/gate.md (L81)
//   engine-change                                                           prints each version of this process that is not the version of the limits, or an empty line (L81)
//   refit --probes <dir> --run <id> --url <url> --head <sha> --out <dir>   writes <dir>/refit.json and <dir>/refit.md: the refit of the limits from the probes (L81)
//   refit-pr --run <id> [--trailer <text>] [--body-end <text>]             opens the draft pull request of the refit of the artifact memory-refit of a run (L81)
//                                                                            with lane pairs, also <dir>/report-without-lanes.json and .md
//
// The corpus is `joint-v2` by default. The slice `pr` is the small slice of the pull request: seed 1 of the specs with count 10 and of the fixed cases.
// The shards get the inputs by their planned cost (`plannedCost`, `planShards`). Each shard job computes the same plan.
// run writes each pair when it ends: the record to records-<i>.jsonl, and its wall time to pairs-<i>.ndjson. It stops at a clean point after `--deadline-minutes` (default SHARD_DEADLINE_MINUTES).
// `--prior <file>` on run and plan runs only the pairs that the file does not hold, and plans them from their measured times. The command resume writes that file.
// The cost model is data/cost-margins.json. scripts/fit-cost.mjs writes it from the shard logs of a full run.
// analyze gives the gains over each baseline pair of `--baseline`. The default is `BASELINE` (rows+portfolio), and select+portfolio and pack+portfolio when the records have them.
// `--compare a:b` gives the misses and the scores of the pairs a and b, and the gain of a over b.
// The default compares select+portfolio and pack+portfolio with rows+portfolio, when the records have the two pairs. The entry `pack` is the choice of `pack()` of `packing`.
// The default also compares the graph-bfs pairs of L47 (`GRAPH_COMPARE`): each with rows+portfolio, and maxrects-bl-graph-bfs+portfolio with maxrects-bl+portfolio.
// `--exclude-pack` removes the records of the pack entries before the analysis. `--oracle-without` gives a second oracle without their pairs. Its default is select.
// When the records have the pack entry select, the report checks each of its records against the record of the member that its table picks.
// `--times` gives the route times of the specs. The default is `DENSE_HUBS`. `--jobs` reads the output of `gh run view <id> --json jobs` and gives the shard times.
// `--rank-top` is the count of the rows of the ranking of the output groups in report.md. The default is `RANK_TOP`. report.json holds each group.
// The value `none` removes the default of `--baseline`, `--compare`, `--oracle-without` and `--times`.
// `--lanes on` adds the lane pairs of L13 (`laneEntries`) to run and to plan. The default is off.
// With the records of lane pairs, analyze compares each lane pair with its base pair, and the default of `--oracle-without` is the lane entries.
// `--iterate on` adds the iteration pairs of L11 (`iterEntries`) to run and to plan. The default is off. An iteration pair is also a lane pair.
// analyze also compares each iteration pair with a cap above 1 with round 1 of its chain, the pair `lanes-iter1` of the same pack entry and router.
// analyze reads the folds of the greedy portfolios from the split "default" of the split file of the corpus (corpus/splits).
// analyze fails when an input of the manifest has no records, unless the file of `--allow-missing` lists it. The files list one input id on each line.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { caseProgress, startSupervisedProcess, superviseCases } from "@mark1russell7/rigor-bench/supervise";
import { Session } from "node:inspector";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyze,
  BASELINE,
  budgetCases,
  budgetTag,
  earlierOverruns,
  DENSE_HUBS,
  checkCorpus,
  CONFIRM_PLAIN_PAIRS,
  CONFIRM_SEEDS,
  confirmDefault,
  confirmIterate,
  confirmLanes,
  confirmMarkdown,
  expectedProbes,
  familyProbeGroups,
  gateJobs,
  GRAPH_COMPARE,
  gateMarkdown,
  idList,
  isLanePack,
  ITER_VARIANTS,
  iterEntries,
  iterPlanPairs,
  iterRoundsOf,
  jointCorpus,
  laneEntries,
  laneParts,
  lanePasses,
  loadSplit,
  MEMORY_GATE_MB,
  MEMORY_LIMITS,
  ENGINE_NAMES,
  engineChange,
  LIMIT_SOURCE,
  limitRepeatsFor,
  refitLimits,
  refitMarkdown,
  refitRefusal,
  memoryGate,
  manifestJson,
  PACK_ENTRIES,
  packOf,
  pairId,
  pairRuns,
  repairShard,
  PORTFOLIO_ROUTER,
  RANK_TOP,
  plannedCost,
  planShards,
  reportMarkdown,
  ROUTERS,
  runEnv,
  runInput,
  SELECT_PACK,
  selectMemberOf,
  SET,
  BENCH_SPACE_VERSION,
  chosenOptions,
  coverOptions,
  doneKey,
  keptRecordLines,
  keyParts,
  measuredCost,
  pairFactors,
  parsePairBudget,
  parsePairLines,
  PRIOR_PAIRS_FILE,
  runShard,
  runStamp,
  SHARD_DEADLINE_MINUTES,
  strategyCosts,
  strategyCostTable,
  SET_V2,
  SETS,
  SPACINGS,
  stepCount,
} from "../src/index.ts";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
const set = args.corpus ?? SET_V2;
if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
// The lane pairs of L13 run only with `--lanes on`. Thus the default plan and the default records do not change.
if (args.lanes !== undefined && args.lanes !== "on" && args.lanes !== "off") throw new RangeError(`The option --lanes is on or off, not "${args.lanes}".`);
// `--confirm on` is the run of L40: the pairs of `CONFIRM_PAIRS` on the seeds of `CONFIRM_SEEDS`. It replaces `--lanes` and `--iterate`.
if (args.confirm !== undefined && args.confirm !== "on" && args.confirm !== "off") throw new RangeError(`The option --confirm is on or off, not "${args.confirm}".`);
const confirming = args.confirm === "on";
const pairBudget = args["pair-budget"] === undefined ? undefined : parsePairBudget(args["pair-budget"]);
if (pairBudget !== undefined && (confirming || args.lanes === "on" || args.iterate === "on")) throw new RangeError("The option --pair-budget holds the plain pairs only, so it does not go with --confirm, --lanes or --iterate.");
// The supervisor of a shard with a budget starts this script again with --child on, so one process runs each pair until a pair passes its budget.
const supervised = args.child === "on";
if (confirming && (args.lanes !== undefined || args.iterate !== undefined)) throw new RangeError("The option --confirm replaces --lanes and --iterate.");
const lanes = confirming ? confirmLanes() : args.lanes === "on" ? laneEntries() : [];
// The iteration pairs of L11 run only with `--iterate on`, for the same reason.
if (args.iterate !== undefined && args.iterate !== "on" && args.iterate !== "off") throw new RangeError(`The option --iterate is on or off, not "${args.iterate}".`);
const iterate = confirming ? confirmIterate() : args.iterate === "on" ? iterEntries() : [];
// The pairs of the cover run only with `--cover on`, for the same reason.
if (args.cover !== undefined && args.cover !== "on" && args.cover !== "off") throw new RangeError(`The option --cover is on or off, not "${args.cover}".`);
if (confirming && args.cover === "on") throw new RangeError("The option --confirm replaces the option --cover.");
// `--pairs <id,id>` runs only these pairs of the cover and the baseline pair (L98). It replaces `--cover`, `--lanes` and `--iterate`.
if (args.pairs !== undefined && (confirming || args.cover !== undefined || args.lanes !== undefined || args.iterate !== undefined)) {
  throw new RangeError("The option --pairs replaces --cover, --lanes and --iterate, and --confirm replaces --pairs.");
}
const cover = args.pairs !== undefined ? chosenOptions(args.pairs.split(",").map((id) => id.trim()).filter((id) => id !== "")) : args.cover === "on" ? coverOptions() : {};
// A resume needs one list of the pairs of each input, so the lane pairs, the iteration pairs and `--confirm` do not take `--prior`.
if (args.prior !== undefined && (confirming || lanes.length > 0 || iterate.length > 0)) throw new RangeError("The option --prior does not go with --confirm, --lanes or --iterate.");
const expectedPairs = confirming ? CONFIRM_PLAIN_PAIRS : (cover.pairs ?? PACK_ENTRIES.flatMap((entry) => ROUTERS.map((router) => pairId(entry.id, router))));

/** This function gives the installed version of the package `@mark1russell7/<name>`. */
function installedVersion(name) {
  return JSON.parse(readFileSync(new URL(`../node_modules/@mark1russell7/${name}/package.json`, import.meta.url), "utf8")).version;
}

/** This function gives the versions of `ENGINE_NAMES` of this process: the node runtime and the installed engines. */
function engineVersions() {
  return Object.fromEntries(ENGINE_NAMES.map((name) => [name, name === "node" ? process.versions.node : installedVersion(name)]));
}

/**
 * This function gives the stamp of this code on this corpus. Records join only with records of the same stamp.
 * It holds the corpus, the version of the space, the versions of the engines and the contract, and the text of the runner and the cover.
 * The hash of each input is a second check, in `priorLines` and in the command resume.
 */
function benchStamp() {
  const version = installedVersion;
  const text = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  return runStamp({ corpus: set, space: BENCH_SPACE_VERSION, packing: version("packing"), highways: version("highways"), contract: version("layout-contract"), runner: text("runner.ts"), cover: text("cover.ts"), ...(pairBudget === undefined ? {} : { pairBudget: pairBudget.text }) });
}

/** This function gives the lines of a pair file that join this run: the lines of its stamp, for a pair of this run, on an input with the same hash. */
function joinLines(text, stamp, hashes, wanted) {
  const read = parsePairLines(text, stamp);
  return { ...read, lines: read.lines.filter((line) => hashes.get(line.input) === line.inputHash && wanted.has(line.strategy)) };
}

/** This function gives the pair lines of `--prior` for the rows of a slice. Without the option it gives undefined. */
function priorLines(rows) {
  if (args.prior === undefined) return undefined;
  const hashes = new Map(rows.map(({ input, entry }) => [entry.id, input.hash ?? ""]));
  return joinLines(readFileSync(args.prior, "utf8"), benchStamp(), hashes, new Set(expectedPairs)).lines;
}

/** This function gives the inputs and their manifest entries, in the order of the corpus, for the slice of the arguments. */
function corpusSlice() {
  const { manifest, inputs } = jointCorpus(set, confirming ? { seeds: CONFIRM_SEEDS } : {});
  const rows = inputs.map((input, i) => ({ input, entry: manifest.inputs[i] }));
  if (args.slice === undefined) return rows;
  if (args.slice !== "pr") throw new RangeError(`The slice is "pr", not "${args.slice}".`);
  return rows.filter(({ entry }) => entry.id.endsWith("/s1") && (entry.cell.count === "10" || entry.id.includes("/edge-cases.")));
}

/** This function gives the shard plan of the slice for the count of the shards of the arguments. Each input has the cost of `plannedCost`: the predicted cost times the margin of its spec. */
function shardPlan() {
  const shards = Number(args.shards ?? 1);
  const rows = corpusSlice();
  // The lane passes use the lane term of the cost model. The rounds of the iteration pairs have no fit yet, so they cost `LANE_PASS_COST` pairs.
  const pairs = expectedPairs.length + iterPlanPairs(iterate);
  const passes = lanePasses(lanes);
  const prior = priorLines(rows);
  if (prior === undefined) return { rows, shards, plan: planShards(costedRows(rows, pairs, passes), shards), done: new Set(), prior: [] };
  // With a prior run, each input costs only its missing pairs, and each pair costs its measured time against the plan.
  const done = new Set(prior.map((line) => doneKey(line.input, line.strategy)));
  const units = costedRows(rows, 1, 0);
  const unitOf = new Map(units.map((item) => [item.id, item.cost]));
  const factors = pairFactors(prior, (id) => unitOf.get(id));
  const items = units.map((item) => ({ ...item, cost: measuredCost(item.cost, expectedPairs.filter((pair) => !done.has(doneKey(item.id, pair))), factors) }));
  return { rows, shards, plan: planShards(items, shards), done, prior };
}

/**
 * This function runs one shard under the time budget. A child runs the pairs, and the supervisor writes the tagged record of each pair that did not finish.
 * A stop can cut the last line of a file, so the supervisor repairs the files before each child and each tag. A resume thus runs no pair two times.
 */
async function superviseShard({ rows, done, prior, file, pairFile, progressFile, stamp, deadlineMinutes, shard, env, commit }) {
  const started = Date.now();
  const byId = new Map(rows.map((row) => [row.entry.id, row]));
  const repair = () => {
    const recordText = readFileSync(file, "utf8");
    const pairText = readFileSync(pairFile, "utf8");
    const whole = repairShard(recordText, pairText, stamp);
    if (whole.records !== recordText) writeFileSync(file, whole.records);
    if (whole.pairs !== pairText) writeFileSync(pairFile, whole.pairs);
    return whole.keys;
  };
  const inputs = rows.map((row) => ({ id: row.entry.id, boxes: row.input.boxes.length }));
  const result = await superviseCases({
    cases: budgetCases(inputs, expectedPairs, pairBudget),
    done,
    earlier: earlierOverruns(prior, inputs),
    progressFile,
    start: () => {
      repair();
      const left = Math.max(0, deadlineMinutes - (Date.now() - started) / 60000);
      return startSupervisedProcess([process.execPath, ...process.execArgv, ...process.argv.slice(1), "--child", "on", "--deadline-minutes", String(left)]);
    },
    onEnd: (ended) => {
      // A pair can write its record just before the stop. That pair has its result.
      if (repair().has(ended.id)) return;
      const { input: id, pair } = keyParts(ended.id);
      const { input, entry } = byId.get(id);
      const tag = budgetTag(ended, pairBudget);
      const { record } = pairRuns(input, entry.cell, { env, corpus: set, ...cover, pairs: [pair], tags: new Map([[pair, tag]]), ...(commit === undefined ? {} : { commit }) }).next().value;
      appendFileSync(file, JSON.stringify(record) + "\n");
      appendFileSync(pairFile, JSON.stringify({ stamp, input: id, inputHash: input.hash ?? "", strategy: pair, wallMs: ended.kind === "over-budget" ? ended.budgetMs : 0, tag: ended.kind, ...(ended.kind === "over-budget" ? { stage: ended.stage } : {}) }) + "\n");
      console.log(`  pair ${pair} on ${id}: ${tag.reason}, budget ${pairBudget.text} min`);
    },
  });
  const lines = parsePairLines(readFileSync(pairFile, "utf8"), stamp).lines;
  const over = lines.filter((line) => line.tag === "over-budget").length;
  const notRun = lines.filter((line) => line.tag === "not-run").length;
  const end = `Shard ${shard}: ${lines.length} pairs done, ${result.left.length} pairs missing, ${over} over budget, ${notRun} not run, ${result.starts} processes`;
  console.log(end);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary !== undefined) appendFileSync(summary, `${end}\n\n${strategyCostTable(strategyCosts(lines), 10)}\n`);
  // A child that a signal stopped has the code null. Only the supervisor stops a child, and then it starts another child for the pairs that are left.
  const failed = result.code !== null ? result.code !== 0 : result.left.length > 0;
  if (failed) process.exit(result.code ?? 1);
}

/** This function reads the records of a folder. The files can be in folders: `gh run download` writes each artifact into a folder of its name. */
function readRecords(dir) {
  const records = [];
  for (const name of readdirSync(dir, { recursive: true }).map(String).filter((n) => n.endsWith(".jsonl")).sort())
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line));
  return records;
}

/** This function gives the facts of the inputs of a slice for the analysis. */
function analysisInputs(slice) {
  return slice.map(({ entry }) => ({
    id: entry.id,
    seed: Number(/\/s(\d+)$/.exec(entry.id)[1]),
    spec: entry.id.replace(/\/s\d+$/, ""),
    kind: entry.id.split("/")[1].split(".")[0],
    cell: entry.cell,
    ...(entry.stress === true ? { stress: true } : {}),
  }));
}

/** This function gives the id, the spec and the planned cost of each row. */
function costedRows(rows, pairs, passes) {
  return rows.map(({ input, entry }) => {
    const spec = entry.id.replace(/\/s\d+$/, "");
    return { id: entry.id, spec, cost: plannedCost(spec, input.boxes.length, input.edges?.length ?? 0, pairs, passes) };
  });
}

/** This function reads a file of input ids. An id outside the corpus is an error. */
function idFile(file) {
  const ids = idList(readFileSync(file, "utf8"));
  const known = new Set(jointCorpus(set).manifest.inputs.map((e) => e.id));
  const bad = ids.filter((id) => !known.has(id));
  if (bad.length > 0) throw new RangeError(`${file} has ${bad.length} ids outside the corpus ${set}, for example ${bad[0]}.`);
  return ids;
}

if (command === "check") {
  // The committed manifest must be the manifest of the code, and its claims must hold on the inputs of the code.
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "corpus", set, "corpus.json");
  const committed = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const { manifest, inputs } = jointCorpus(set);
  const fresh = manifestJson(manifest);
  let failed = false;
  if (committed !== fresh) {
    console.error(`${file} is not the manifest of the code. Start pnpm corpus ${set}.`);
    failed = true;
  }
  const breaks = checkCorpus(JSON.parse(committed), inputs);
  for (const b of breaks) console.error(`claim ${b.claim}: ${b.detail} Inputs: ${b.inputs.slice(0, 10).join(", ")}${b.inputs.length > 10 ? ` and ${b.inputs.length - 10} more` : ""}.`);
  if (breaks.length > 0) failed = true;
  try {
    const folds = loadSplit(JSON.parse(committed));
    console.log(`${set}: the split file has ${folds.length} folds in the split default.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    failed = true;
  }
  console.log(`${set}: ${inputs.length} inputs, ${breaks.length} broken claims.`);
  if (failed) process.exit(1);
} else if (command === "smoke") {
  // For each value of spacing: the first input of seed 1 with count 10 and edges, packed by the first pack entry with no overflow and no overlap, and routed by corners.
  const rows = corpusSlice().filter(({ entry, input }) => entry.id.endsWith("/s1") && entry.cell.count === "10" && (input.edges?.length ?? 0) > 0);
  const values = set === SET ? ["none"] : SPACINGS;
  let failed = false;
  for (const value of values) {
    const candidates = rows.filter(({ entry }) => (entry.cell.spacing ?? "none") === value);
    let done = false;
    for (const { input, entry } of candidates) {
      for (const pack of PACK_ENTRIES) {
        const [r] = runInput(input, entry.cell, { packs: [pack], routers: ["corners"], corpus: set });
        if (r === undefined || r.skipped !== undefined) continue;
        if ((r.measures["pack.overflow"] ?? 0) > 0 || (r.hard["pack.no-overlap"] ?? 0) > 0 || (r.measures["joint.routes"] ?? 0) === 0) continue;
        const breaks = r.hard["route.no-pass-through"] ?? 0;
        const stress = entry.stress === true;
        const ok = stress ? breaks > 0 : breaks === 0;
        console.log(`${value}: ${input.id} ${pack.id}+corners, ${r.measures["joint.routes"]} routes, ${breaks} breaks of no-pass-through: ${ok ? "ok" : "FAIL"}`);
        if (!ok) failed = true;
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) {
      console.error(`${value}: there is no input with routes and a clean pack.`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
} else if (command === "plan") {
  const { plan, done, rows } = shardPlan();
  const min = (ms) => (ms / 60000).toFixed(1);
  if (args.prior !== undefined) console.log(`${done.size} pairs of ${rows.length * expectedPairs.length} have records. The plan holds only the missing pairs.`);
  const loads = plan.loads.map((l, i) => ({ l, i })).sort((a, b) => b.l - a.l);
  const sum = plan.loads.reduce((s, l) => s + l, 0);
  console.log(`${set}: ${plan.shards.length} shards, ${min(sum)} predicted minutes in all, ${min(sum / plan.shards.length)} on average.`);
  for (const { l, i } of loads.slice(0, 10)) console.log(`shard ${i}: ${min(l)} min, ${plan.shards[i].length} inputs, the most costly ${plan.shards[i].at(-1)}`);
} else if (command === "run") {
  const shard = Number(args.shard ?? 0);
  const out = args.out ?? "bench-out";
  mkdirSync(out, { recursive: true });
  const file = join(out, `records-${shard}.jsonl`);
  const pairFile = join(out, `pairs-${shard}.ndjson`);
  const progressFile = join(out, `progress-${shard}.log`);
  // A child continues the files of its shard, and its supervisor made them empty.
  if (!supervised) {
    writeFileSync(file, "");
    writeFileSync(pairFile, "");
  }
  const deadlineMinutes = Number(args["deadline-minutes"] ?? SHARD_DEADLINE_MINUTES);
  if (!(Number.isFinite(deadlineMinutes) && deadlineMinutes >= 0)) throw new RangeError(`The option --deadline-minutes is a number of 0 or more, not "${args["deadline-minutes"]}".`);
  const env = runEnv();
  const commit = process.env.GITHUB_SHA;
  const { rows: all, shards, plan, done, prior } = shardPlan();
  if (!(Number.isInteger(shard) && shard >= 0 && shard < shards)) throw new RangeError(`The shard is an integer from 0 to ${shards - 1}, not ${shard}.`);
  // The plan gives the inputs of this shard from the least predicted cost to the most.
  const byId = new Map(all.map((row) => [row.entry.id, row]));
  const rows = plan.shards[shard].map((id) => byId.get(id));
  console.log(`${set} shard ${shard} of ${shards}: ${rows.length} inputs, ${(plan.loads[shard] / 60000).toFixed(1)} predicted minutes`);
  // A pair that runs for more than SLOW_PAIR_MS prints one line with its time and the heap, so a log shows the pair of a heap failure.
  // The lines have no "records", so fit-cost.mjs does not read them.
  const SLOW_PAIR_MS = 5000;
  const mb = (bytes) => Math.round(bytes / 2 ** 20);
  const stamp = benchStamp();
  if (pairBudget !== undefined && !supervised) {
    await superviseShard({ rows, done, prior, file, pairFile, progressFile, stamp, deadlineMinutes, shard, env, commit });
    process.exit(0);
  }
  const progress = supervised ? caseProgress(progressFile) : undefined;
  // A later child leaves out the pairs on the disk. The plan does not read them, so each child has the same shards.
  const finished = supervised ? new Set([...done, ...parsePairLines(readFileSync(pairFile, "utf8"), stamp).lines.map((line) => doneKey(line.input, line.strategy))]) : done;
  const lines = [];
  let recordCount = 0;
  let skipped = 0;
  const count = runShard({
    rows: rows.map((row) => ({ id: row.entry.id, inputHash: row.input.hash ?? "", row })),
    pairs: expectedPairs,
    extra: lanes.length + iterate.length,
    done: finished,
    stamp,
    deadlineMs: deadlineMinutes * 60000,
    now: () => performance.now(),
    // freeRoutes frees the routes that no lane pair and no iteration pair reads, so a large input fits in the heap (L63).
    runPairs: ({ input, entry }, missing) =>
      pairRuns(input, entry.cell, { env, corpus: set, lanes, iterate, freeRoutes: true, ...(progress === undefined ? {} : { onStart: (pair, phase) => progress.start(doneKey(input.id, pair), phase) }), ...cover, ...(confirming ? { pairs: CONFIRM_PLAIN_PAIRS } : {}), ...(missing === undefined ? {} : { pairs: missing }), ...(commit === undefined ? {} : { commit }) }),
    write: (record, line) => {
      appendFileSync(file, JSON.stringify(record) + "\n");
      appendFileSync(pairFile, JSON.stringify(line) + "\n");
      progress?.end(doneKey(line.input, line.strategy));
      lines.push(line);
      recordCount += 1;
      if (record.skipped !== undefined) skipped += 1;
      if (line.wallMs > SLOW_PAIR_MS) console.log(`  pair ${line.strategy}: ${Math.round(line.wallMs)} ms, heap ${mb(process.memoryUsage().heapUsed)} MB`);
    },
    onInput: ({ input }, ms) => {
      console.log(`  peak rss ${mb(process.resourceUsage().maxRSS * 1024)} MB after ${input.id}`);
      console.log(`${input.id}: ${recordCount} records, ${skipped} skipped, ${Math.round(ms)} ms`);
      recordCount = 0;
      skipped = 0;
    },
  });
  const end = `Shard ${shard}: ${count.pairsDone} pairs done, ${count.pairsMissing} pairs missing${count.stopped ? `, stopped at the deadline of ${deadlineMinutes} minutes` : ""}.`;
  console.log(end);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary !== undefined && !supervised) appendFileSync(summary, `${end}\n\n${strategyCostTable(strategyCosts(lines), 10)}\n`);
} else if (command === "resume") {
  if (args.records === undefined || args.out === undefined) throw new RangeError("The arguments of resume are --records <dir> --out <dir>.");
  mkdirSync(args.out, { recursive: true });
  const rows = corpusSlice();
  const hashes = new Map(rows.map(({ input, entry }) => [entry.id, input.hash ?? ""]));
  const wanted = new Set(expectedPairs);
  const stamp = benchStamp();
  const names = readdirSync(args.records, { recursive: true }).map(String).sort();
  const byKey = new Map();
  let otherStamp = 0;
  let broken = 0;
  let outside = 0;
  for (const name of names.filter((n) => n.endsWith(".ndjson"))) {
    const text = readFileSync(join(args.records, name), "utf8");
    const all = parsePairLines(text, stamp);
    const read = joinLines(text, stamp, hashes, wanted);
    otherStamp += all.otherStamp;
    broken += all.broken;
    outside += all.lines.length - read.lines.length;
    for (const line of read.lines) if (!byKey.has(doneKey(line.input, line.strategy))) byKey.set(doneKey(line.input, line.strategy), line);
  }
  // Each kept file comes from one file of the earlier run, so no file grows past the size that readRecords reads.
  const seen = new Set();
  const accepted = new Set(byKey.keys());
  let kept = 0;
  for (const name of names.filter((n) => n.endsWith(".jsonl"))) {
    const lines = keptRecordLines(readFileSync(join(args.records, name), "utf8"), accepted, seen);
    if (lines.length === 0) continue;
    writeFileSync(join(args.out, `prior-${kept}.jsonl`), lines.join("\n") + "\n");
    kept += 1;
  }
  // A pair line with no whole record is not a finished pair.
  const pairLines = [...seen].map((key) => byKey.get(key));
  writeFileSync(join(args.out, PRIOR_PAIRS_FILE), pairLines.map((line) => JSON.stringify(line) + "\n").join(""));
  console.log(`Stamp ${stamp}: ${pairLines.length} of ${rows.length * expectedPairs.length} pairs kept. Left out: ${otherStamp} of another stamp, ${outside} of another input or pair, ${broken} cut lines, ${byKey.size - pairLines.length} with no record.`);
} else if (command === "costs") {
  if (args.records === undefined) throw new RangeError("The argument of costs is --records <dir>.");
  const stamp = benchStamp();
  const names = readdirSync(args.records, { recursive: true }).map(String).filter((n) => n.endsWith(".ndjson")).sort();
  const lines = names.flatMap((name) => parsePairLines(readFileSync(join(args.records, name), "utf8"), stamp).lines);
  console.log(`${lines.length} finished pairs.\n\n${strategyCostTable(strategyCosts(lines), Number(args.top ?? 20))}`);
} else if (command === "probe") {
  // The memory probe of L77. It runs the inputs of `--inputs`, one after the other, and writes one line of memory facts for each pair.
  // With `node --expose-gc`, the probe forces a full GC after each pair. Then `heapLive` is the heap that the pair keeps.
  const out = args.out ?? "probe-out";
  mkdirSync(out, { recursive: true });
  // The gate compares these versions with the source of the limits. The file comes first, so a probe that stops with an OOM also has it.
  writeFileSync(join(out, "engines.json"), JSON.stringify(engineVersions()) + "\n");
  const ids = (args.inputs ?? "").split(",").filter((x) => x !== "");
  if (ids.length === 0) throw new RangeError("The probe needs --inputs <id[,id]>.");
  // With --pairs, the probe runs only these pairs of each input, in a fresh process (L81 step 2). The runner then packs only the entries of these pairs.
  const pairs = (args.pairs ?? "").split(",").filter((x) => x !== "");
  const byId = new Map(corpusSlice().map((row) => [row.entry.id, row]));
  const env = runEnv();
  // The modes alloc-6144 and measure-6144 sample the allocations of each pair, also of the objects that a GC collected before the end of the pair.
  // alloc.jsonl then has the 100 functions that allocated the most bytes in each pair. A diff of two inputs names the code that makes the larger peak.
  // The mode measure-6144 also forces a full GC after each pair and at the end of the input (the A/A repeat of L81). Its facts have the allocation and the retained heap.
  const sampler = process.env.MODE === "alloc-6144" || process.env.MODE === "measure-6144" ? new Session() : undefined;
  const post = (method, params = {}) => {
    let result;
    let failure;
    sampler.post(method, params, (error, value) => {
      failure = error;
      result = value;
    });
    if (failure) throw failure;
    if (result === undefined) throw new Error(`The inspector did not answer ${method} at once.`);
    return result;
  };
  const SAMPLE = { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };
  const allocTop = (profile) => {
    const bytes = new Map();
    const walk = (node) => {
      const frame = node.callFrame;
      const key = `${frame.functionName || "(anonymous)"} ${frame.url.replace(/^.*node_modules\//, "")}:${frame.lineNumber + 1}`;
      bytes.set(key, (bytes.get(key) ?? 0) + node.selfSize);
      for (const child of node.children) walk(child);
    };
    walk(profile.head);
    const total = [...bytes.values()].reduce((s, b) => s + b, 0);
    const mb1 = (b) => Math.round(b / 104857.6) / 10;
    return { totalMb: mb1(total), top: [...bytes].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([at, b]) => ({ at, mb: mb1(b) })) };
  };
  if (sampler !== undefined) {
    sampler.connect();
    post("HeapProfiler.enable");
  }
  const alloc = join(out, "alloc.jsonl");
  const commit = process.env.GITHUB_SHA;
  const gc = typeof globalThis.gc === "function" ? globalThis.gc : undefined;
  const mb = (bytes) => Math.round(bytes / 2 ** 20);
  const records = join(out, "records-probe.jsonl");
  const facts = join(out, "probe.jsonl");
  // summary.jsonl has one line for each input that ended: the sampled allocation of all pairs, the largest retained heap, the retained heap at the end and the peak RSS.
  const summary = join(out, "summary.jsonl");
  writeFileSync(records, "");
  writeFileSync(facts, "");
  writeFileSync(summary, "");
  console.log(`probe: ${ids.length} inputs, forced GC ${gc === undefined ? "off" : "on"}, ${process.execArgv.join(" ") || "no node flags"}`);
  for (const id of ids) {
    const row = byId.get(id);
    if (row === undefined) throw new RangeError(`The corpus ${set} has no input "${id}".`);
    gc?.();
    const t0 = performance.now();
    let last = t0;
    let peakHeap = 0;
    let peakPair = "";
    let allocMb = 0;
    let liveMax = 0;
    const lines = [];
    if (sampler !== undefined) post("HeapProfiler.startSampling", SAMPLE);
    for (const run of pairRuns(row.input, row.entry.cell, { env, corpus: set, lanes, iterate, freeRoutes: true, ...(pairs.length === 0 ? {} : { pairs }), ...(commit === undefined ? {} : { commit }) })) {
      appendFileSync(records, JSON.stringify(run.record) + "\n");
      let pairAlloc = null;
      if (sampler !== undefined) {
        const top = allocTop(post("HeapProfiler.stopSampling").profile);
        pairAlloc = top.totalMb;
        allocMb += top.totalMb;
        appendFileSync(alloc, JSON.stringify({ input: id, pair: run.record.strategy, cpu: env.cpu, sampling: SAMPLE, ...top }) + "\n");
        post("HeapProfiler.startSampling", SAMPLE);
      }
      const before = process.memoryUsage();
      gc?.();
      const after = process.memoryUsage();
      const now = performance.now();
      // Each fact has the CPU model and the heap mode, because a time and a peak are true only for them (the fleet rule of 2026-10-30).
      const fact = { input: id, pair: run.record.strategy, ms: Math.round(now - last), heapBefore: mb(before.heapUsed), heapLive: gc === undefined ? null : mb(after.heapUsed), rss: mb(before.rss), external: mb(before.external), buffers: mb(before.arrayBuffers), maxRss: mb(process.resourceUsage().maxRSS * 1024), allocMb: pairAlloc, cpu: env.cpu, mode: process.env.MODE ?? "none" };
      if (fact.heapLive !== null && fact.heapLive > liveMax) liveMax = fact.heapLive;
      lines.push(JSON.stringify(fact) + "\n");
      if (fact.heapBefore > peakHeap) {
        peakHeap = fact.heapBefore;
        peakPair = fact.pair;
      }
      last = performance.now();
    }
    appendFileSync(facts, lines.join(""));
    if (sampler !== undefined) post("HeapProfiler.stopSampling");
    gc?.();
    const end = process.memoryUsage();
    appendFileSync(
      summary,
      JSON.stringify({
        input: id,
        pairs: lines.length,
        allocMb: sampler === undefined ? null : Math.round(allocMb),
        liveMaxMb: gc === undefined ? null : liveMax,
        liveEndMb: gc === undefined ? null : mb(end.heapUsed),
        maxRss: mb(process.resourceUsage().maxRSS * 1024),
        ms: Math.round(performance.now() - t0),
        cpu: env.cpu,
        mode: process.env.MODE ?? "none",
        ...(sampler === undefined ? {} : { sampling: SAMPLE }),
      }) + "\n",
    );
    console.log(`  peak rss ${mb(process.resourceUsage().maxRSS * 1024)} MB after ${id}`);
    console.log(`  the largest heap after a pair: ${peakHeap} MB, after ${peakPair}`);
    console.log(`${id}: ${lines.length} pairs, ${Math.round(performance.now() - t0)} ms`);
  }
  // probe.md has the 10 pairs with the largest heap after the pair, for the summary of the job.
  const all = readFileSync(facts, "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l));
  const top = [...all].sort((a, b) => b.heapBefore - a.heapBefore).slice(0, 10);
  const md = [
    `### Memory probe: ${process.env.MODE ?? "no mode"} (${process.execArgv.join(" ") || "no node flags"}), CPU ${env.cpu}`,
    "",
    `The peak RSS is ${Math.max(...all.map((f) => f.maxRss))} MB. The largest live heap after a forced GC is ${gc === undefined ? "not measured" : `${Math.max(...all.map((f) => f.heapLive))} MB`}.`,
    "",
    "| Input | Pair | Heap after the pair (MB) | Live heap (MB) | RSS (MB) | ms |",
    "| --- | --- | --- | --- | --- | --- |",
    ...top.map((f) => `| ${f.input.replace(/^.*rect-grid\./, "")} | ${f.pair} | ${f.heapBefore} | ${f.heapLive ?? ""} | ${f.rss} | ${f.ms} |`),
  ];
  writeFileSync(join(out, "probe.md"), md.join("\n") + "\n");
} else if (command === "families") {
  // The groups of the memory gate: the inputs with the largest planned cost of each family, with the pairs of the default bench. Each group is one string with commas.
  console.log(JSON.stringify(familyProbeGroups(costedRows(corpusSlice(), PACK_ENTRIES.length * ROUTERS.length, 0)).map((group) => group.join(","))));
} else if (command === "jobs") {
  // The file of --groups is the JSON list of `families`, or another list of groups with commas. With `--limits on`, each input of `MEMORY_LIMITS` also gets a job in its mode.
  const groups = JSON.parse(readFileSync(args.groups, "utf8"));
  const modes = (args.modes ?? "").split(",").filter((m) => m !== "");
  const repeats = Number(args.repeats ?? 1);
  // `--limit-repeats auto` gives the jobs with limits the probes of a refit when the versions of this process are not the versions of the limits.
  const limitRepeats = args["limit-repeats"] === "auto" ? limitRepeatsFor(engineChange(LIMIT_SOURCE.engines, engineVersions()), repeats) : Number(args["limit-repeats"] ?? repeats);
  if (!(Number.isInteger(limitRepeats) && limitRepeats >= 1)) throw new RangeError(`The option --limit-repeats is auto or an integer above 0, not "${args["limit-repeats"]}".`);
  console.log(JSON.stringify(gateJobs(groups, modes, repeats, args.limits === "on" ? MEMORY_LIMITS : undefined, limitRepeats)));
} else if (command === "engine-change") {
  console.log(engineChange(LIMIT_SOURCE.engines, engineVersions()));
} else if (command === "refit") {
  // The probes of a run with the probes of a refit (`--limit-repeats auto`). The command writes the refit, also a refused refit, and does not fail.
  const run = { run: Number(args.run), url: String(args.url ?? ""), head: String(args.head ?? "") };
  if (!(Number.isInteger(run.run) && run.run > 0) || !/^[0-9a-f]{7,40}$/.test(run.head)) throw new RangeError("The command refit needs --run <id> and --head <commit>.");
  const refit = refitLimits(readProbeResults(args.probes ?? "probes"), run);
  const out = args.out ?? "refit";
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "refit.json"), JSON.stringify({ ...run, refused: refit.refused, data: refit.data }, null, 2) + "\n");
  writeFileSync(join(out, "refit.md"), refitMarkdown(refit, run));
  console.log(refit.data === undefined ? `refit: refused. ${refit.refused.join(" ")}` : "refit: valid.");
} else if (command === "refit-pr") {
  refitPullRequest(Number(args.run), args.trailer, args["body-end"]);
} else if (command === "gate") {
  // Each folder under --probes with an input.txt is the probe of one input: input.txt, mode.txt, status.txt, probe.jsonl and summary.jsonl. A job of one family has a folder for each seed.
  const dir = args.probes ?? "probes";
  // The file of --expected is the JSON list of `jobs`. The gate expects a probe of each input of each job in the mode of the job.
  const expected = expectedProbes(JSON.parse(readFileSync(args.expected, "utf8")));
  if (expected.length === 0) throw new RangeError(`The gate needs the expected probes, and ${args.expected} has none.`);
  const results = readProbeResults(dir);
  const gate = memoryGate(expected, results, Number(args["limit-mb"] ?? MEMORY_GATE_MB));
  writeFileSync(join(dir, "gate.md"), gateMarkdown(gate));
  console.log(`gate: ${gate.pass ? "pass" : "fail"}, ${gate.rows.filter((r) => r.reason !== "").length} of ${gate.rows.length} probes failed.`);
  if (!gate.pass) process.exitCode = 1;
} else if (command === "confirm") {
  // The decision of L40, from the records of a run with `--confirm on`.
  if (!confirming) throw new RangeError("The command confirm needs --confirm on.");
  const dir = args.records ?? "bench-out";
  const out = args.out ?? dir;
  const report = confirmDefault(readRecords(dir), analysisInputs(corpusSlice()));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "confirm.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(out, "confirm.md"), confirmMarkdown(report));
  console.log(`The confirmation: ${report.confirmed ? "confirmed" : "not confirmed"}, the chosen cap ${report.chosen}.`);
} else if (command === "analyze") {
  const dir = args.records ?? "bench-out";
  const out = args.out ?? dir;
  const records = readRecords(dir);
  const slice = corpusSlice();
  const inputs = analysisInputs(slice);
  /** This function reads a list of ids with commas. The value `none` gives an empty list, and no value gives `undefined`. */
  const list = (value) => (value === undefined ? undefined : value === "none" ? [] : value.split(",").map((v) => v.trim()).filter((v) => v !== ""));
  const exclude = list(args["exclude-pack"]) ?? [];
  const hasPair = (pair) => !exclude.includes(packOf(pair)) && records.some((r) => r.strategy === pair);
  const hasSelect = !exclude.includes(SELECT_PACK) && records.some((r) => packOf(r.strategy) === SELECT_PACK);
  const selectPortfolio = pairId(SELECT_PACK, PORTFOLIO_ROUTER);
  const packPortfolio = pairId("pack", PORTFOLIO_ROUTER);
  const baselines = list(args.baseline) ?? [BASELINE, ...[selectPortfolio, packPortfolio].filter(hasPair)];
  // The lane pairs of L13: each lane pair against its base pair, the pair of the same pack entry and router.
  const lanePairs = [...new Set(records.map((r) => r.strategy))].filter((p) => isLanePack(packOf(p)) && hasPair(p)).sort();
  const laneCompare = lanePairs.flatMap((p) => {
    const parts = laneParts(packOf(p));
    const base = parts === undefined ? undefined : pairId(parts.pack, parts.router);
    const own = base !== undefined && hasPair(base) ? [`${p}:${base}`] : [];
    // An iteration pair with a cap above 1 also gets a compare with round 1 of its chain: the layout of lanes-sides.
    const rounds = iterRoundsOf(packOf(p));
    const start = parts === undefined ? undefined : pairId([ITER_VARIANTS[0].name, parts.pack, parts.router].join("."), parts.router);
    return rounds !== undefined && rounds > 1 && start !== undefined && hasPair(start) ? [...own, `${p}:${start}`] : own;
  });
  const graphCompare = GRAPH_COMPARE.filter(([a, b]) => hasPair(a) && hasPair(b)).map(([a, b]) => `${a}:${b}`);
  const defaultCompare = [...(hasPair(BASELINE) ? [selectPortfolio, packPortfolio].filter(hasPair).map((p) => `${p}:${BASELINE}`) : []), ...graphCompare, ...laneCompare];
  const compare = (list(args.compare) ?? defaultCompare).map((c) => {
    const pair = c.split(":");
    if (pair.length !== 2) throw new RangeError(`A comparison is two pairs with a colon, for example ${selectPortfolio}:${BASELINE}, not "${c}".`);
    return pair;
  });
  const lanePacks = [...new Set(lanePairs.map(packOf))];
  const without = list(args["oracle-without"]) ?? (lanePacks.length > 0 ? lanePacks : hasSelect ? [SELECT_PACK] : []);
  const times = list(args.times) ?? (inputs.some((i) => i.spec === DENSE_HUBS) ? [DENSE_HUBS] : []);
  // The check of select reads all records, also with --exclude-pack select.
  const composite = records.some((r) => packOf(r.strategy) === SELECT_PACK)
    ? { pack: SELECT_PACK, members: Object.fromEntries(slice.map(({ input, entry }) => [entry.id, selectMemberOf(input)])) }
    : undefined;
  const jobs = args.jobs === undefined ? undefined : JSON.parse(readFileSync(args.jobs, "utf8")).jobs;
  if (args.jobs !== undefined && !Array.isArray(jobs)) throw new RangeError(`${args.jobs} has no list "jobs". Write it with gh run view <id> --json jobs.`);
  const rankTop = Number(args["rank-top"] ?? RANK_TOP);
  if (!(Number.isInteger(rankTop) && rankTop >= 0)) throw new RangeError(`The option --rank-top is an integer of 0 or more, not ${args["rank-top"]}.`);
  const options = {
    // The job check examines that the committed manifest is the manifest of the code.
    folds: loadSplit(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "corpus", set, "corpus.json"), "utf8"))),
    predictions: set === SET ? "joint-v1" : "joint-v2",
    ...(args["allow-missing"] === undefined ? {} : { allowMissing: idFile(args["allow-missing"]) }),
    ...(args.subset === undefined ? {} : { subset: idFile(args.subset) }),
    ...(baselines.length === 0 ? {} : { baseline: baselines }),
    ...(compare.length === 0 ? {} : { compare }),
    ...(exclude.length === 0 ? {} : { excludePacks: exclude }),
    ...(without.length === 0 ? {} : { without }),
    ...(times.length === 0 ? {} : { times }),
    ...(composite === undefined ? {} : { composite }),
    ...(jobs === undefined ? {} : { jobs }),
  };
  const report = analyze(records, inputs, options);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const markdown = reportMarkdown(report, { rankTop });
  writeFileSync(join(out, "report.md"), `Corpus: ${set}.\n\n` + markdown);
  // The lane pairs move the floor. The second report removes them, so the misses of the other pairs compare with the runs before L13.
  if (lanePacks.length > 0) {
    const { compare: _compare, without: _without, ...rest } = options;
    const old = analyze(records, inputs, {
      ...rest,
      excludePacks: [...exclude, ...lanePacks],
      ...(hasPair(selectPortfolio) && hasPair(BASELINE) ? { compare: [[selectPortfolio, BASELINE]] } : {}),
      ...(hasSelect ? { without: [SELECT_PACK] } : {}),
    });
    writeFileSync(join(out, "report-without-lanes.json"), JSON.stringify(old, null, 2) + "\n");
    writeFileSync(join(out, "report-without-lanes.md"), `Corpus: ${set}, without the lane pairs.\n\n` + reportMarkdown(old, { rankTop }));
  }
  console.log(markdown);
  const n = report.count;
  if (!n.ok) {
    console.error(`The record count check fails: ${n.recorded} of ${n.manifest} inputs have records, ${n.missing.length - n.allowed.length} missing inputs are not allowed, ${n.unknown.length} inputs are outside the manifest.`);
    process.exit(1);
  }
} else {
  console.error("The command is check, smoke, plan, run or analyze.");
  process.exit(2);
}

/** This function reads the probes under `dir`. Each folder with an input.txt is the probe of one input: input.txt, mode.txt, status.txt, probe.jsonl and summary.jsonl. */
function readProbeResults(dir) {
  const text = (sub, name) => readFileSync(join(dir, sub, name), "utf8").trim();
  const subs = readdirSync(dir, { recursive: true }).map(String).filter((n) => n.split(/[\\/]/).at(-1) === "input.txt").map((n) => dirname(n));
  return subs.map((sub) => {
    // The probe writes an empty probe.jsonl at its start, and the facts of an input at its end. Thus an OOM gives no facts for the input.
    const facts = readFileSync(join(dir, sub, "probe.jsonl"), "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l));
    // summary.jsonl has one line for the input when the probe ended. The modes without a sampler or a forced GC write null.
    const summaryFile = join(dir, sub, "summary.jsonl");
    const summary = existsSync(summaryFile) ? readFileSync(summaryFile, "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l)).at(-1) : undefined;
    // alloc.jsonl has one line for each pair in the modes that sample the allocation. The gate shows the count of the steps next to the allocation.
    const allocFile = join(dir, sub, "alloc.jsonl");
    const allocated = summary?.allocMb != null && existsSync(allocFile) ? readFileSync(allocFile, "utf8").split("\n").filter((l) => l !== "").map((l) => JSON.parse(l)) : undefined;
    return {
      input: text(sub, "input.txt"),
      mode: text(sub, "mode.txt"),
      status: Number(text(sub, "status.txt")),
      peakRssMb: facts.length === 0 ? undefined : Math.max(...facts.map((f) => f.maxRss)),
      allocMb: summary?.allocMb ?? undefined,
      steps: allocated === undefined ? undefined : stepCount(allocated),
      liveMaxMb: summary?.liveMaxMb ?? undefined,
      // A probe of an older commit has no engines.json, and the gate row then says "no versions".
      engines: existsSync(join(dir, sub, "engines.json")) ? JSON.parse(text(sub, "engines.json")) : undefined,
    };
  });
}

/** This function runs a command with its arguments and no shell, and gives its output. It stops the script when the command fails. */
function run(file, argv, options = {}) {
  const r = spawnSync(file, argv, { encoding: "utf8", ...options });
  if (r.status !== 0) throw new Error(`The command ${file} ${argv.join(" ")} failed with the status ${r.status}: ${(r.stderr ?? "").trim()}`);
  return r.stdout ?? "";
}

/**
 * This function opens the draft pull request of the refit of the run `id` (`docs/JOINT-BENCH.md`, "The refit of the limits").
 * It reads the artifact memory-refit of the run, and refuses a refused refit and a commit that is not an ancestor of `origin/main`.
 * It prints the change of each input before the push. The branch starts at `origin/main` in a worktree of its own, and only `data/memory-limits.json` changes.
 */
function refitPullRequest(id, trailer, bodyEnd) {
  if (!(Number.isInteger(id) && id > 0)) throw new RangeError("The command refit-pr needs --run <id>.");
  const work = mkdtempSync(join(tmpdir(), "memory-refit-"));
  run("gh", ["run", "download", String(id), "--name", "memory-refit", "--dir", join(work, "artifact")]);
  const refit = JSON.parse(readFileSync(join(work, "artifact", "refit.json"), "utf8"));
  const body = readFileSync(join(work, "artifact", "refit.md"), "utf8");
  run("git", ["fetch", "-q", "origin", "main"]);
  // The refusals are in `refitRefusal`, and its tests examine each of them. A refit that main took after the commit of the probes makes this refit old.
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", refit.head, "origin/main"]).status === 0;
  const limitsChanged = ancestor && spawnSync("git", ["diff", "--quiet", refit.head, "origin/main", "--", "data/memory-limits.json"]).status !== 0;
  const refusal = refitRefusal(refit, id, { ancestor, limitsChanged });
  if (refusal !== undefined) throw new RangeError(refusal);
  // The change of each input, before the push.
  console.log(body);
  const branch = `memory-refit-${id}`;
  const tree = join(work, "tree");
  run("git", ["worktree", "add", "-q", "-b", branch, tree, "origin/main"]);
  try {
    const file = join(tree, "packages", "joint", "data", "memory-limits.json");
    writeFileSync(file, JSON.stringify(refit.data, null, 2) + "\n");
    run("git", ["add", "packages/joint/data/memory-limits.json"], { cwd: tree });
    const message = `Refit the memory limits from the run ${id} (L81)\n\nThe probes ran on commit ${refit.head.slice(0, 7)}: ${refit.url}${trailer ? `\n\n${trailer}` : ""}\n`;
    run("git", ["commit", "-q", "-F", "-"], { cwd: tree, input: message });
    run("git", ["push", "-q", "origin", `HEAD:refs/heads/${branch}`], { cwd: tree });
    const bodyFile = join(work, "body.md");
    writeFileSync(bodyFile, bodyEnd ? `${body}\n${bodyEnd}\n` : body);
    const url = run("gh", ["pr", "create", "--draft", "--base", "main", "--head", branch, "--title", `Refit the memory limits from the run ${id} (L81)`, "--body-file", bodyFile], { cwd: tree });
    console.log(url.trim());
  } finally {
    run("git", ["worktree", "remove", "--force", tree]);
  }
}
