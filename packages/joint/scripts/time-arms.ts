// The paired-time arms of the joint bench (L84, `docs/JOINT-BENCH.md`, "The Time row"). The workflow `time-arms.yml` starts it in CI.
//
//   run --candidate <pair> [--default <pair>] [--cases <n> | --inputs <id[,id]>] [--rounds <n>] [--job <i>] [--out <dir>] [--corpus <set>] [--max-boxes <n>]
//       writes <dir>/paired.jsonl, <dir>/aa.jsonl and <dir>/meta.json
//   arm --pair <pair> --input <file>
//       runs one entry on one input in this process, and prints one JSON line with its time. The command run starts it.
//   verdict --records <dir> [--out <dir>]
//       reads each .jsonl file under <dir>, and writes <dir>/verdict.json and <dir>/verdict.md
//
// Each arm is a fresh child process: node with argv, no shell. The time of an arm is the time of runInput inside the child, not the start of the process.
// Each case and round runs 4 arms: the default and the candidate (the candidate pair), and two copies of the default (the A/A pair).
// The defaults of the options are the settings JOINT_TIME and the entry TIME_DEFAULT of src/time-arms.ts.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LayoutInput } from "@mark1russell7/layout-contract";
import type { Arm } from "@mark1russell7/rigor-bench";
import { jointCorpus, plannedCost, runEnv, runInput, SET_V2, SETS, type JointSet } from "../src/index.ts";
import { JOINT_TIME, jointTimeVerdict, TIME_DEFAULT, TIME_MODE, timeArmOrder, timeCases, timeMarkdown, timeRunOptions, type TimeKind, type TimeRecord } from "../src/time-arms.ts";

const SELF = fileURLToPath(import.meta.url);
/** The longest time of one arm. A case of `maxBoxes` boxes takes seconds, so an arm at this limit is a fault. */
const ARM_TIMEOUT_MS = 10 * 60 * 1000;

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

/** The output of the command arm: the time of the entry, the output hash of its record, and the reason of a skip. */
interface ArmOutput {
  readonly ms: number;
  readonly hash: string;
  readonly skipped?: string;
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
  const out: ArmOutput = { ms, hash: record.outputHash ?? "", ...(record.skipped === undefined ? {} : { skipped: record.skipped }) };
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
  const paired = join(out, "paired.jsonl");
  const aa = join(out, "aa.jsonl");
  writeFileSync(paired, "");
  writeFileSync(aa, "");
  const meta = { candidate, baseline, job, rounds, cases: ids, settings: JOINT_TIME, maxBoxes, corpus: set, env, commit: process.env["GITHUB_SHA"] ?? null };
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`time arms: ${candidate} against ${baseline}, job ${job}, ${ids.length} cases, ${rounds} rounds, 4 arms, CPU ${env.cpu}`);

  /** This function runs one entry on one input in a fresh child process, and gives its output. */
  const arm = (pair: string, file: string): ArmOutput => {
    const child = spawnSync(process.execPath, [SELF, "arm", "--pair", pair, "--input", file], { encoding: "utf8", timeout: ARM_TIMEOUT_MS, maxBuffer: 1 << 24 });
    if (child.error !== undefined) throw child.error;
    if (child.status !== 0) throw new Error(`The arm ${pair} on ${file} stopped with ${child.status ?? child.signal}: ${child.stderr}`);
    const last = child.stdout.trim().split("\n").at(-1) ?? "";
    return JSON.parse(last) as ArmOutput;
  };
  const skipped = new Map<string, string>();
  const hashes = new Map<string, string>();
  const t0 = performance.now();
  for (let r = 0; r < rounds; r++) {
    // The global round makes the rounds of the jobs different, so the merged records have one record of each case and round.
    const round = job * rounds + r;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      if (skipped.has(id)) continue;
      const times: Record<TimeKind, Partial<Record<Arm, number>>> = { candidate: {}, aa: {} };
      let skip: string | undefined;
      for (const slot of timeArmOrder(round, i)) {
        const pair = slot.kind === "candidate" && slot.arm === "b" ? candidate : baseline;
        const result = arm(pair, files[i]!);
        if (result.skipped !== undefined) {
          skip = `${pair}: ${result.skipped}`;
          break;
        }
        // Each run of an entry on an input gives the same output. A change of the hash is a fault of the arm.
        const key = `${pair} ${id}`;
        const known = hashes.get(key);
        if (known !== undefined && known !== result.hash) throw new Error(`The entry ${pair} gave two outputs on ${id}: ${known} and ${result.hash}.`);
        hashes.set(key, result.hash);
        times[slot.kind][slot.arm] = result.ms;
      }
      if (skip !== undefined) {
        // A skip depends only on the entry and the input, so it comes in the first round.
        if (r > 0) throw new Error(`The case ${id} skipped in round ${r}, after a run in round 0: ${skip}`);
        skipped.set(id, skip);
        console.log(`  case ${id}: skipped, ${skip}`);
        continue;
      }
      const order = timeArmOrder(round, i);
      const firstOf = (kind: TimeKind): Arm => order.find((s) => s.kind === kind)!.arm;
      const recordOf = (kind: TimeKind): TimeRecord => ({
        case: id,
        round,
        first: firstOf(kind),
        a: times[kind].a!,
        b: times[kind].b!,
        kind,
        job,
        baseline,
        candidate: kind === "candidate" ? candidate : baseline,
        env,
      });
      appendFileSync(paired, JSON.stringify(recordOf("candidate")) + "\n");
      appendFileSync(aa, JSON.stringify(recordOf("aa")) + "\n");
    }
    console.log(`round ${r + 1} of ${rounds} (global round ${round}): ${Math.round((performance.now() - t0) / 1000)} s`);
  }
  writeFileSync(join(out, "meta.json"), JSON.stringify({ ...meta, skipped: Object.fromEntries(skipped), seconds: Math.round((performance.now() - t0) / 1000) }, null, 2) + "\n");
  if (skipped.size === ids.length) throw new Error("Each case skipped. The run has no time records.");
} else if (command === "verdict") {
  const dir = args.records ?? "time-out";
  const out = args.out ?? dir;
  const records: TimeRecord[] = [];
  // `gh run download` and download-artifact write each artifact into a folder of its name.
  for (const name of readdirSync(dir, { recursive: true }).map(String).filter((n) => n.endsWith(".jsonl")).sort())
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) if (line.trim() !== "") records.push(JSON.parse(line) as TimeRecord);
  const result = jointTimeVerdict(records, JOINT_TIME);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "verdict.json"), JSON.stringify(result, null, 2) + "\n");
  const markdown = timeMarkdown(result);
  writeFileSync(join(out, "verdict.md"), markdown);
  console.log(markdown);
} else {
  console.error("The command is run, arm or verdict.");
  process.exit(2);
}
