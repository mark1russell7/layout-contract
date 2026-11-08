// The paired-time arms of the joint bench (L84, `docs/JOINT-BENCH.md`, "The Time row"). The workflow `time-arms.yml` starts it in CI.
//
//   run --candidate <pair> [--default <pair>] [--cases <n> | --inputs <id[,id]>] [--rounds <n>] [--job <i>] [--out <dir>] [--corpus <set>] [--max-boxes <n>]
//       writes <dir>/paired.jsonl, <dir>/aa.jsonl and <dir>/meta.json
//   arm --pair <pair> --input <file>
//       runs one entry on one input in this process, and prints one JSON line with its time. The command run starts it.
//   verdict --records <dir> [--out <dir>]
//       reads each meta.json under <dir> with the .jsonl files of its folder, and writes <dir>/verdict.json and <dir>/verdict.md
//
// freshRun of rigor-bench runs each arm in a fresh child process: node with argv, no shell. The time of an arm is the time of runInput inside the child.
// Each case and round runs 4 arms: the default and the candidate (the candidate pair), and two copies of the default (the A/A pair).
// freshRun gives the order of the arms, the time limit of 10 minutes for each arm, the check of the hashes and the skip records.
// The defaults of the options are the settings JOINT_TIME and the entry TIME_DEFAULT of src/time-arms.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LayoutInput } from "@mark1russell7/layout-contract";
import { freshRun, type ChildLine, type FreshSkip } from "@mark1russell7/rigor-bench/fresh";
import { jointCorpus, plannedCost, runEnv, runInput, SET_V2, SETS, type JointSet } from "../src/index.ts";
import { timeNoReads } from "../src/no-read.ts";
import { JOINT_TIME, jointTimeVerdict, TIME_DEFAULT, TIME_MODE, timeCases, timeFreshOptions, timeMarkdown, timeRecords, timeRunOptions, type TimeJob, type TimeRecord } from "../src/time-arms.ts";

const SELF = fileURLToPath(import.meta.url);

const [command, ...rest] = process.argv.slice(2);
/** The names of the options of the commands. */
type Option = "pair" | "input" | "corpus" | "candidate" | "default" | "cases" | "inputs" | "rounds" | "job" | "out" | "max-boxes" | "records";
const args: Partial<Record<Option, string>> = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i]!.replace(/^--/, "") as Option] = rest[i + 1] ?? "";

/** This function reads a whole number of `min` or more from an option, or gives its default. */
function whole(name: Option, fallback: number, min: number): number {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!(Number.isInteger(value) && value >= min)) throw new RangeError(`The option --${name} is an integer of ${min} or more, not "${args[name]}".`);
  return value;
}

if (command === "arm") {
  const pair = args.pair ?? "";
  const file = args.input ?? "";
  const { input, cell } = JSON.parse(readFileSync(file, "utf8")) as { input: LayoutInput; cell: Readonly<Record<string, unknown>> };
  const options = timeRunOptions(pair);
  const t0 = performance.now();
  const records = runInput(input, cell, options);
  const ms = performance.now() - t0;
  const record = records.find((r) => r.strategy === pair);
  if (record === undefined || records.length !== 1) throw new Error(`The entry ${pair} gave ${records.length} records on ${input.id}, not 1 record of the entry.`);
  // The JSON line of a child of freshRun: the time, the output hash, and the reason of a skip.
  const out: ChildLine = record.skipped === undefined ? { ms, hash: record.outputHash ?? "" } : { skipped: record.skipped, ms };
  console.log(JSON.stringify(out));
} else if (command === "run") {
  const set = (args.corpus ?? SET_V2) as JointSet;
  if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
  const candidate = args.candidate ?? "";
  const baseline = args.default ?? TIME_DEFAULT;
  // Each entry must resolve before the first arm runs.
  timeRunOptions(candidate);
  timeRunOptions(baseline);
  if (candidate === baseline) throw new RangeError(`The candidate is the default ${baseline}. The A/A pair already times the default against itself.`);
  const rounds = whole("rounds", JOINT_TIME.rounds, 1);
  const job = whole("job", 0, 0);
  const maxBoxes = whole("max-boxes", JOINT_TIME.maxBoxes, 2);
  const out = args.out ?? "time-out";
  const { manifest, inputs } = jointCorpus(set);
  const rows = inputs.map((input, i) => ({ input, entry: manifest.inputs[i]! }));
  const byId = new Map(rows.map((row) => [row.entry.id, row]));
  const ids =
    args.inputs !== undefined && args.inputs !== ""
      ? args.inputs.split(",").map((s) => s.trim()).filter((s) => s !== "")
      : timeCases(
          rows.map(({ input, entry }) => {
            const edges = input.edges?.length ?? 0;
            return { id: entry.id, boxes: input.boxes.length, edges, cost: plannedCost(entry.id.replace(/\/s\d+$/, ""), input.boxes.length, edges, 1) };
          }),
          whole("cases", JOINT_TIME.cases, 1),
          maxBoxes,
        );
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new RangeError(`The corpus ${set} has no input ${unknown.join(", ")}.`);
  mkdirSync(join(out, "inputs"), { recursive: true });
  const files = ids.map((id, i) => {
    const file = join(out, "inputs", `${i}.json`);
    const row = byId.get(id)!;
    writeFileSync(file, JSON.stringify({ input: row.input, cell: row.entry.cell }));
    return file;
  });
  const flags = [process.env["NODE_OPTIONS"] ?? "", ...process.execArgv].filter((f) => f !== "").join(" ");
  const context = `${process.env["GITHUB_ACTIONS"] === "true" ? "ci" : "local"} node ${process.version}${flags === "" ? "" : ` ${flags}`}`;
  const env = { ...runEnv(), mode: TIME_MODE, context };
  // The label of the job is the index of its CI job. The records of freshRun and meta.json carry it.
  const meta = { candidate, baseline, job: String(job), rounds, cases: ids, settings: JOINT_TIME, maxBoxes, corpus: set, env, commit: process.env["GITHUB_SHA"] ?? null };
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`time arms: ${candidate} against ${baseline}, job ${job}, ${ids.length} cases, ${rounds} rounds, 4 arms, CPU ${env.cpu}`);
  const t0 = performance.now();
  const run = await freshRun(timeFreshOptions({ baseline, candidate, arm: [process.execPath, SELF], cases: ids, files, rounds, job }));
  const records = timeRecords(run, baseline, candidate);
  const lines = (list: readonly TimeRecord[]): string => list.map((r) => JSON.stringify(r) + "\n").join("");
  writeFileSync(join(out, "paired.jsonl"), lines(records.paired));
  writeFileSync(join(out, "aa.jsonl"), lines(records.aa));
  for (const s of run.skipped) console.log(`  case ${s.case}: skipped by ${s.arm}, ${s.reason}`);
  // The verdict gives the skip list of each job to pooledVerdict, so the skipped cases leave all jobs.
  writeFileSync(join(out, "meta.json"), JSON.stringify({ ...meta, skipped: run.skipped, seconds: Math.round((performance.now() - t0) / 1000) }, null, 2) + "\n");
  console.log(`${records.paired.length} records of the candidate pair and ${records.aa.length} records of the A/A pair: ${Math.round((performance.now() - t0) / 1000)} s`);
  if (run.skipped.length === ids.length) throw new Error("Each case skipped. The run has no time records.");
} else if (command === "verdict") {
  const dir = args.records ?? "time-out";
  const out = args.out ?? dir;
  // `gh run download` and download-artifact write each artifact into a folder of its name. Each folder has the meta.json of its job.
  const metas = readdirSync(dir, { recursive: true }).map(String).filter((n) => basename(n) === "meta.json").sort();
  if (metas.length === 0) throw new Error(`The folder ${dir} has no meta.json of a job.`);
  const jobs = metas.map((name): TimeJob => {
    const folder = join(dir, dirname(name));
    const meta = JSON.parse(readFileSync(join(dir, name), "utf8")) as { readonly job: string; readonly skipped?: readonly FreshSkip[] };
    const records: TimeRecord[] = [];
    for (const file of ["paired.jsonl", "aa.jsonl"].map((f) => join(folder, f)).filter((f) => existsSync(f)))
      for (const line of readFileSync(file, "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line) as TimeRecord);
    return { job: String(meta.job), records, skipped: meta.skipped ?? [] };
  });
  const result = jointTimeVerdict(jobs, JOINT_TIME);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "verdict.json"), JSON.stringify(result, null, 2) + "\n");
  const markdown = timeMarkdown(result);
  writeFileSync(join(out, "verdict.md"), markdown);
  console.log(markdown);
  // Each no-read is a warning annotation, so it shows on the check and not only in this log.
  for (const text of timeNoReads(result)) console.log(`::warning::${text}`);
} else {
  console.error("The command is run, arm or verdict.");
  process.exit(2);
}
