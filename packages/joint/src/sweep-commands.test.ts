// Each command of `scripts/sweep.mjs` on a small fixture, each in its own process, with the flags of `sweep.yml` (roadmap item L85).
// The commands of `bench.mjs` and `sensitivity.mjs` that no job of a pull request starts also run here, on small inputs.
// `fit-cost.mjs` needs the logs of a full run, so it is not here.
// A crash at load time or in a command then fails the pull request, not the night. The night of 2026-11-02 failed in summarize on such a crash.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CONFIG_COST, CONFIG_COST_ID } from "./config-cost.ts";
import type { EpochStep } from "./epoch-step.ts";

const root = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sweep-commands-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** This function starts one command of a script in a new process, from the package folder, and gives its output. */
function start(script: string, args: readonly string[]): string {
  return execFileSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_SHA: "" } });
}

/** The flags of the limits of a round in `sweep.yml`, with a budget, as on a night with an end time. */
const LIMITS = ["--max-shards", "2", "--target-minutes", "30", "--max-configs", "400", "--budget-minutes", "120", "--lanes", "3"];

interface Plan {
  units: { id: string; input: string; cost: number; configs: string[] }[];
  shards: string[][];
  loads: number[];
}

/**
 * This function keeps each unit of 3 inputs of a plan, in one shard, so each run of the fixture takes less than a second.
 * The inputs are those with the most configs, and the cheapest of them. The sensitivity script needs inputs that each config shares.
 */
function trim(night: string): void {
  const file = join(dir, night, "plan.json");
  const plan = JSON.parse(readFileSync(file, "utf8")) as Plan;
  const byInput = new Map<string, { configs: Set<string>; cost: number }>();
  for (const u of plan.units) {
    const old = byInput.get(u.input) ?? { configs: new Set<string>(), cost: 0 };
    for (const c of u.configs) old.configs.add(c);
    byInput.set(u.input, { configs: old.configs, cost: old.cost + u.cost });
  }
  const chosen = [...byInput].sort(([, a], [, b]) => b.configs.size - a.configs.size || a.cost - b.cost).slice(0, 3).map(([id]) => id);
  const units = plan.units.filter((u) => chosen.includes(u.input));
  writeFileSync(file, JSON.stringify({ ...plan, units, shards: [units.map((u) => u.id)], loads: [units.reduce((s, u) => s + u.cost, 0)] }));
  writeFileSync(join(dir, night, "matrix.json"), "[0]");
}

/** This function runs one night as `sweep.yml` does: plan, run, race, run, summarize, and the check before the push. It gives the date that the check prints. */
function night(date: string, data: string, branch: string, extra: readonly string[] = []): string {
  const at = (name: string) => join(dir, date, name);
  start("sweep.mjs", ["plan", "--data", data, "--out", at("night"), "--date", date, ...LIMITS, ...extra]);
  trim(join(date, "night"));
  start("sweep.mjs", ["run", "--plan", at("night"), "--shard", "0", "--out", at("records1"), "--deadline-minutes", "105"]);
  start("sweep.mjs", ["race", "--night", at("night"), "--records", at("records1"), "--out", at("night2"), ...LIMITS]);
  trim(join(date, "night2"));
  start("sweep.mjs", ["run", "--plan", at("night2"), "--shard", "0", "--out", at("records2"), "--deadline-minutes", "105"]);
  start("sweep.mjs", ["summarize", "--night", at("night2"), "--records", at("records2"), "--data", data, "--out", at("out"), "--run", "1"]);
  return start("next-night.ts", [at("out"), branch]).trim();
}

describe("the commands of the sweep script", () => {
  it("run two nights, the first on a new epoch and the second on the tree of the first", { timeout: 300_000 }, () => {
    const first = night("2026-01-01", join(dir, "no-data"), join(dir, "no-branch"));
    expect(first).toBe("2026-01-01");
    const tree = join(dir, "2026-01-01", "out");
    expect(readFileSync(join(tree, "night.md"), "utf8")).toContain("# Sweep of 2026-01-01");
    // A night without shards of the cost model plans with the scale of the fit of the model. Each shard entry keeps the model.
    expect((JSON.parse(readFileSync(join(dir, "2026-01-01", "night", "plan.json"), "utf8")) as { scale: number }).scale).toBe(CONFIG_COST.scale);
    const index1 = JSON.parse(readFileSync(join(tree, "index.json"), "utf8")) as { latest: string };
    const state1 = JSON.parse(readFileSync(join(tree, "epochs", index1.latest, "state.json"), "utf8")) as { nights: { shards: { costModel?: string }[] }[] };
    expect(state1.nights[0]!.shards.map((s) => s.costModel)).toEqual([CONFIG_COST_ID, CONFIG_COST_ID]);
    // The first night has no history, so its claim has no score, and its page facts state that.
    const costOfFirst = JSON.parse(readFileSync(join(tree, "index.json"), "utf8")) as { epochs: Record<string, { cost: unknown }> };
    expect(costOfFirst.epochs[index1.latest]!.cost).toMatchObject({ jobMinutes: null, jobMinutesStatus: "no history", wallStatus: "no history", shards: null, budget: null, thin: false });

    // The second night reads the state of the first night, and the check compares its tree with the tree of the first night.
    const second = night("2026-01-02", tree, tree);
    expect(second).toBe("2026-01-02");
    const index = JSON.parse(readFileSync(join(dir, "2026-01-02", "out", "index.json"), "utf8")) as { latest: string; epochs: Record<string, { nights: number }> };
    expect(index.epochs[index.latest]!.nights).toBe(2);
    expect(existsSync(join(dir, "2026-01-02", "out", "epochs", index.latest, "nights", "2026-01-01.json"))).toBe(true);

    // The check refuses the tree of the first night on a branch with 2 nights, because the push removes the second night.
    expect(() => start("next-night.ts", [tree, join(dir, "2026-01-02", "out")])).toThrow();

    // The sensitivity script reads the state of an epoch of the data branch.
    const state = join(dir, "2026-01-02", "out", "epochs", index.latest, "state.json");
    expect(start("sensitivity.mjs", ["--state", state, "--draws", "20", "--seed", "1"])).toContain("|");

    // The first night of a new epoch measures the step. Here the old epoch has the same engines, so each ratio is 1.
    const old = index.latest.replace("packing-", "packing-old-");
    const data = join(dir, "old-tree");
    cpSync(join(dir, "2026-01-02", "out"), data, { recursive: true });
    renameSync(join(data, "epochs", index.latest), join(data, "epochs", old));
    const oldState = join(data, "epochs", old, "state.json");
    writeFileSync(oldState, JSON.stringify({ ...JSON.parse(readFileSync(oldState, "utf8")), epoch: old }));
    writeFileSync(join(data, "index.json"), JSON.stringify({ ...index, latest: old, epochs: { [old]: index.epochs[index.latest] } }));
    const out = join(dir, "step-out");
    start("sweep.mjs", ["summarize", "--night", join(dir, "2026-01-02", "night2"), "--records", join(dir, "2026-01-02", "records2"), "--data", data, "--out", out, "--run", "1"]);
    const stepped = JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as { epochs: Record<string, { step: EpochStep }> };
    const step = stepped.epochs[index.latest]!.step;
    expect(step).toMatchObject({ from: old, dropped: { space: 0, input: 0, hash: 0, config: 0 } });
    expect(step.pairs).toBeGreaterThan(0);
    expect(step.metrics["joint.fill"]).toMatchObject({ median: 1, q10: 1, q90: 1 });
  });
});

describe("the command of the sweep script that reads the last gates", () => {
  it("gives the estimate as its first word, from the jobs of each gate", { timeout: 60_000 }, () => {
    const gates = join(dir, "gates");
    mkdirSync(gates);
    const jobs = [{ name: "probe", conclusion: "success", startedAt: "2026-11-04T00:00:00Z", completedAt: "2026-11-04T05:03:00Z" }];
    writeFileSync(join(gates, "1.json"), JSON.stringify({ headSha: "a", jobs }));
    const text = start("sweep.mjs", ["gate-estimate", "--runs", gates]);
    expect(text.split(" ")[0]).toBe("303");
    expect(text).toContain("1: longest job 303, 303 job minutes");
  });

  it("gives the fallback when the folder holds no gate", { timeout: 60_000 }, () => {
    const text = start("sweep.mjs", ["gate-estimate", "--runs", join(dir, "no-gates")]);
    expect(text.split(" ")[0]).toBe("360");
    expect(text).toContain("no gate, so the fallback");
  });
});

describe("the commands of the bench script that the nightly gate starts", () => {
  it("plan the gate, probe a small input and examine the probe", { timeout: 120_000 }, () => {
    const at = (name: string) => join(dir, "bench", name);
    const groups = start("bench.mjs", ["families"]);
    expect((JSON.parse(groups) as string[]).length).toBe(101);
    writeFileSync(join(dir, "groups.json"), groups);
    const jobs = JSON.parse(start("bench.mjs", ["jobs", "--groups", join(dir, "groups.json"), "--modes", "bench-6144", "--repeats", "1", "--limits", "on"])) as { mode: string }[];
    expect(jobs.filter((j) => j.mode === "measure-6144")).toHaveLength(3);
    expect(start("bench.mjs", ["plan", "--shards", "2", "--slice", "pr"])).not.toBe("");

    // The probe step of `memory-probe.yml` writes these files next to the output of the probe.
    const input = "joint-v2/edge-cases.empty.e-medium.random.none.free.sp-both/s2";
    start("bench.mjs", ["probe", "--inputs", input, "--out", at("probes/1")]);
    for (const [name, text] of [["status.txt", "0"], ["input.txt", input], ["mode.txt", "bench-6144"]]) writeFileSync(at(`probes/1/${name}`), `${text}
`);
    writeFileSync(at("jobs.json"), JSON.stringify([{ input, mode: "bench-6144", repeat: 1 }]));
    expect(start("bench.mjs", ["gate", "--probes", at("probes"), "--expected", at("jobs.json")])).toContain("gate: pass");
    expect(readFileSync(at("probes/gate.md"), "utf8")).toContain("### Memory gate: pass");
  });
});
