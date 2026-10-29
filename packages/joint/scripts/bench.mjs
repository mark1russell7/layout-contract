// The joint benchmark (`docs/JOINT-BENCH.md`). Start it with `pnpm bench <command>`.
//
//   check [--corpus <set>]                                                  examines the claims of the committed manifest and its split file
//   smoke [--corpus <set>]                                                  packs and routes 1 input of each value of spacing with corners
//   run --shards <n> --shard <i> --out <dir> [--slice pr] [--corpus <set>] [--lanes on] [--iterate on]   writes <dir>/records-<i>.jsonl
//   plan --shards <n> [--slice pr] [--corpus <set>] [--lanes on] [--iterate on]                           prints the planned cost of each shard
//   analyze --records <dir> --out <dir> [--slice pr] [--corpus <set>] [--allow-missing <file>] [--subset <file>] [--baseline <pair[,pair]>]
//           [--compare <a:b[,a:b]>] [--exclude-pack <id[,id]>] [--oracle-without <id[,id]>] [--times <spec[,spec]>] [--jobs <file>] [--rank-top <n>]
//                                                                            writes <dir>/report.json and <dir>/report.md
//                                                                            with lane pairs, also <dir>/report-without-lanes.json and .md
//
// The corpus is `joint-v2` by default. The slice `pr` is the small slice of the pull request: seed 1 of the specs with count 10 and of the fixed cases.
// The shards get the inputs by their planned cost (`plannedCost`, `planShards`). Each shard job computes the same plan.
// The cost model is data/cost-margins.json. scripts/fit-cost.mjs writes it from the shard logs of a full run.
// analyze gives the gains over each baseline pair of `--baseline`. The default is `BASELINE` (rows+portfolio), and select+portfolio when the records have it.
// `--compare a:b` gives the misses and the scores of the pairs a and b, and the gain of a over b. The default is select+portfolio:rows+portfolio when the records have both.
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
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyze,
  BASELINE,
  DENSE_HUBS,
  checkCorpus,
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
  manifestJson,
  PACK_ENTRIES,
  packOf,
  pairId,
  pairRuns,
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
  SET_V2,
  SETS,
  SPACINGS,
} from "../src/index.ts";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
const set = args.corpus ?? SET_V2;
if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
// The lane pairs of L13 run only with `--lanes on`. Thus the default plan and the default records do not change.
if (args.lanes !== undefined && args.lanes !== "on" && args.lanes !== "off") throw new RangeError(`The option --lanes is on or off, not "${args.lanes}".`);
const lanes = args.lanes === "on" ? laneEntries() : [];
// The iteration pairs of L11 run only with `--iterate on`, for the same reason.
if (args.iterate !== undefined && args.iterate !== "on" && args.iterate !== "off") throw new RangeError(`The option --iterate is on or off, not "${args.iterate}".`);
const iterate = args.iterate === "on" ? iterEntries() : [];

/** This function gives the inputs and their manifest entries, in the order of the corpus, for the slice of the arguments. */
function corpusSlice() {
  const { manifest, inputs } = jointCorpus(set);
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
  const pairs = PACK_ENTRIES.length * ROUTERS.length + iterPlanPairs(iterate);
  const passes = lanePasses(lanes);
  const items = rows.map(({ input, entry }) => {
    const spec = entry.id.replace(/\/s\d+$/, "");
    return { id: entry.id, spec, cost: plannedCost(spec, input.boxes.length, input.edges?.length ?? 0, pairs, passes) };
  });
  return { rows, shards, plan: planShards(items, shards) };
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
  const values = set === SET_V2 ? SPACINGS : ["none"];
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
  const { plan } = shardPlan();
  const min = (ms) => (ms / 60000).toFixed(1);
  const loads = plan.loads.map((l, i) => ({ l, i })).sort((a, b) => b.l - a.l);
  const sum = plan.loads.reduce((s, l) => s + l, 0);
  console.log(`${set}: ${plan.shards.length} shards, ${min(sum)} predicted minutes in all, ${min(sum / plan.shards.length)} on average.`);
  for (const { l, i } of loads.slice(0, 10)) console.log(`shard ${i}: ${min(l)} min, ${plan.shards[i].length} inputs, the most costly ${plan.shards[i].at(-1)}`);
} else if (command === "run") {
  const shard = Number(args.shard ?? 0);
  const out = args.out ?? "bench-out";
  mkdirSync(out, { recursive: true });
  const file = join(out, `records-${shard}.jsonl`);
  writeFileSync(file, "");
  const env = runEnv();
  const commit = process.env.GITHUB_SHA;
  const { rows: all, shards, plan } = shardPlan();
  if (!(Number.isInteger(shard) && shard >= 0 && shard < shards)) throw new RangeError(`The shard is an integer from 0 to ${shards - 1}, not ${shard}.`);
  // The plan gives the inputs of this shard from the least predicted cost to the most.
  const byId = new Map(all.map((row) => [row.entry.id, row]));
  const rows = plan.shards[shard].map((id) => byId.get(id));
  console.log(`${set} shard ${shard} of ${shards}: ${rows.length} inputs, ${(plan.loads[shard] / 60000).toFixed(1)} predicted minutes`);
  // A pair that runs for more than SLOW_PAIR_MS prints one line with its time and the heap, so a log shows the pair of a heap failure.
  // The lines have no "records", so fit-cost.mjs does not read them.
  const SLOW_PAIR_MS = 5000;
  const mb = (bytes) => Math.round(bytes / 2 ** 20);
  for (const { input, entry } of rows) {
    const t0 = performance.now();
    const records = [];
    let last = t0;
    // freeRoutes frees the routes that no lane pair and no iteration pair reads, so a large input fits in the heap (L63).
    for (const run of pairRuns(input, entry.cell, { env, corpus: set, lanes, iterate, freeRoutes: true, ...(commit === undefined ? {} : { commit }) })) {
      records.push(run.record);
      const now = performance.now();
      if (now - last > SLOW_PAIR_MS) console.log(`  pair ${run.record.strategy}: ${Math.round(now - last)} ms, heap ${mb(process.memoryUsage().heapUsed)} MB`);
      last = now;
    }
    appendFileSync(file, records.map((r) => JSON.stringify(r) + "\n").join(""));
    console.log(`  peak rss ${mb(process.resourceUsage().maxRSS * 1024)} MB after ${input.id}`);
    const skipped = records.filter((r) => r.skipped !== undefined).length;
    console.log(`${input.id}: ${records.length} records, ${skipped} skipped, ${Math.round(performance.now() - t0)} ms`);
  }
} else if (command === "analyze") {
  const dir = args.records ?? "bench-out";
  const out = args.out ?? dir;
  const records = [];
  // The files can be in folders: `gh run download` writes each artifact into a folder of its name.
  for (const name of readdirSync(dir, { recursive: true }).map(String).filter((n) => n.endsWith(".jsonl")).sort())
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line));
  const slice = corpusSlice();
  const inputs = slice.map(({ entry }) => ({
    id: entry.id,
    seed: Number(/\/s(\d+)$/.exec(entry.id)[1]),
    spec: entry.id.replace(/\/s\d+$/, ""),
    kind: entry.id.split("/")[1].split(".")[0],
    cell: entry.cell,
    ...(entry.stress === true ? { stress: true } : {}),
  }));
  /** This function reads a list of ids with commas. The value `none` gives an empty list, and no value gives `undefined`. */
  const list = (value) => (value === undefined ? undefined : value === "none" ? [] : value.split(",").map((v) => v.trim()).filter((v) => v !== ""));
  const exclude = list(args["exclude-pack"]) ?? [];
  const hasPair = (pair) => !exclude.includes(packOf(pair)) && records.some((r) => r.strategy === pair);
  const hasSelect = !exclude.includes(SELECT_PACK) && records.some((r) => packOf(r.strategy) === SELECT_PACK);
  const selectPortfolio = pairId(SELECT_PACK, PORTFOLIO_ROUTER);
  const baselines = list(args.baseline) ?? [BASELINE, ...(hasPair(selectPortfolio) ? [selectPortfolio] : [])];
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
  const defaultCompare = [...(hasPair(selectPortfolio) && hasPair(BASELINE) ? [`${selectPortfolio}:${BASELINE}`] : []), ...laneCompare];
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
    predictions: set === SET_V2 ? "joint-v2" : "joint-v1",
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
