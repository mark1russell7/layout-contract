// The flip of the deadline inside a shard (roadmap item L115): `node scripts/sweep-stop-flip.ts`. The job `stop-flip` of `joint-bench.yml` starts it.
// A synthetic plan has one unit on a real slow input. Its fast config ends in seconds, and its slow config runs past the deadline as the first unit of the shard.
// The production script runs the plan, so no test hook is in the code of a night. The no-fault copy runs the same plan with the fast config only.
// The script exits with the code 1 and each reason when the stop does not hold. `stopFlipFindings` has the test of this reading.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pairId } from "../src/runner.ts";
import { stopFlipFindings, type ShardFile, type StopFlipFacts, type StopFlipRun } from "../src/shard-stop.ts";

// On the night of 2026-11-02, this pair took 2.88 minutes for each of its 2 packs on a runner, so it runs past 2 minutes on each CPU model of that night.
const INPUT = "joint-v2/rect-grid.freeAspect.polygon.none.extremeAspect.n1000.e-medium.random.flat.free.sp-margin/s1";
const FAST = pairId("rows", "straight");
const SLOW = pairId("anneal-skyline-k16", "straight");
const HARD_DEADLINE_MINUTES = 2;
const FACTS: StopFlipFacts = { fast: "fast", slow: "slow", input: INPUT, limitMinutes: 4 };

/** This function gives a plan of one shard with one unit and the configs of the list. */
function planOf(configs: readonly string[]): unknown {
  const pairs: Readonly<Record<string, string>> = { fast: FAST, slow: SLOW };
  return {
    round: 1,
    date: "2026-01-01",
    epoch: "stop-flip",
    corpus: "joint-v2",
    scale: 1,
    costModel: "stop-flip",
    shards: [["flip#0"]],
    loads: [60000],
    units: [{ id: "flip#0", input: INPUT, cost: 60000, configs }],
    runs: Object.fromEntries(configs.map((c) => [c, { pair: pairs[c], passes: 0 }])),
    facts: {},
  };
}

/** This function runs one copy of the plan with the production script and reads its files. */
function runCopy(root: string, name: string, configs: readonly string[]): StopFlipRun {
  const dir = join(root, name);
  const out = join(dir, "records");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.json"), JSON.stringify(planOf(configs)));
  const script = join(import.meta.dirname, "sweep.mjs");
  const at = Date.now();
  const args = [script, "run", "--plan", dir, "--shard", "0", "--out", out, "--deadline-minutes", "0.1", "--hard-deadline-minutes", String(HARD_DEADLINE_MINUTES)];
  const { status } = spawnSync(process.execPath, args, { stdio: "inherit", cwd: join(import.meta.dirname, "..") });
  const minutes = (Date.now() - at) / 60000;
  const records = join(out, "records-1-0.jsonl");
  const shard = join(out, "shard-1-0.json");
  return {
    code: status,
    minutes,
    recordText: existsSync(records) ? readFileSync(records, "utf8") : "",
    shard: existsSync(shard) ? (JSON.parse(readFileSync(shard, "utf8")) as ShardFile) : null,
  };
}

const root = mkdtempSync(join(tmpdir(), "stop-flip-"));
const fault = runCopy(root, "fault", ["fast", "slow"]);
const clean = runCopy(root, "clean", ["fast"]);
console.log(`The fault copy: code ${String(fault.code)}, ${fault.minutes.toFixed(2)} minutes, shard file ${JSON.stringify(fault.shard)}.`);
console.log(`The no-fault copy: code ${String(clean.code)}, ${clean.minutes.toFixed(2)} minutes, shard file ${JSON.stringify(clean.shard)}.`);
const findings = stopFlipFindings(fault, clean, FACTS);
for (const finding of findings) console.error(`::error::${finding}`);
if (findings.length > 0) process.exit(1);
console.log("The stop holds: the finished record stays, the row reads censored, and the job does not reach its limit.");
