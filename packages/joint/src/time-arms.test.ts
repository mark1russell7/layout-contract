import { pooledVerdict } from "@mark1russell7/rigor-bench";
import { freshRun, pairOrder, type BenchEnv, type StartChild } from "@mark1russell7/rigor-bench/fresh";
import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it, vi } from "vitest";
import { BASELINE } from "./analysis.ts";
import { JOINT_TIME, jointTimeVerdict, TIME_DEFAULT, timeCases, timeFreshOptions, timeMarkdown, timeRecords, timeRunOptions, type TimeJob, type TimeRecord } from "./time-arms.ts";

// The mock keeps the code of pooledVerdict, and records its calls. Thus a test sees the input of the joint verdict.
vi.mock("@mark1russell7/rigor-bench", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mark1russell7/rigor-bench")>();
  return { ...original, pooledVerdict: vi.fn(original.pooledVerdict) };
});

const ENV: BenchEnv = { node: "v26.0.0", os: "linux", arch: "x64", runner: "test", cpu: "test cpu", cores: 4 };
const CANDIDATE = "select+portfolio";

/**
 * This function gives the seeded records of a bench: `jobs` jobs of `cases` cases and `rounds` rounds, in the order of `pairOrder` of rigor-bench.
 * Pair 0 is the candidate pair, and pair 1 is the A/A pair, as in `freshRun`.
 * Each case has its own log scale, and each arm of each round adds a normal noise of `sigma` to the log time.
 * The candidate time is the default time times `ratio`. The A/A pair has two arms of the default.
 */
function bench(seed: string, ratio: number, cases = 20, rounds = 5, jobs = 5, sigma = 0.1): TimeJob[] {
  const rng = random(seed);
  const scales = Array.from({ length: cases }, () => rng.range(Math.log(5), Math.log(500)));
  const out: TimeJob[] = [];
  for (let j = 0; j < jobs; j++) {
    const job = String(j);
    const records: TimeRecord[] = [];
    for (let r = 0; r < rounds; r++) {
      const round = j * rounds + r;
      for (let i = 0; i < cases; i++) {
        const time = (factor: number): number => Math.exp(scales[i]! + Math.log(factor) + rng.normal(0, sigma));
        const order = pairOrder(2, round, i);
        const first = (pair: number) => order.find((s) => s.pair === pair)!.first;
        const env = { ...ENV, cpu: `cpu of job ${j}` };
        records.push({ case: `c${i}`, round, first: first(0), a: time(1), b: time(ratio), kind: "candidate", job, baseline: TIME_DEFAULT, candidate: CANDIDATE, env });
        records.push({ case: `c${i}`, round, first: first(1), a: time(1), b: time(1), kind: "aa", job, baseline: TIME_DEFAULT, candidate: TIME_DEFAULT, env });
      }
    }
    out.push({ job, records, skipped: [] });
  }
  return out;
}

/** This function changes the records of each job with `f`. */
const mapRecords = (jobs: readonly TimeJob[], f: (r: TimeRecord) => TimeRecord): TimeJob[] => jobs.map((j) => ({ ...j, records: j.records.map(f) }));

describe("the time verdict of the joint bench (L84)", () => {
  it("gives same or cannot decide on equal arms, never faster or slower", () => {
    for (const seed of ["equal-1", "equal-2", "equal-3"]) {
      const result = jointTimeVerdict(bench(seed, 1), JOINT_TIME);
      expect(["same", "cannot decide"], `${seed}: ${result.reason}`).toContain(result.outcome);
    }
  });

  it("gives faster for a clear 30% speedup with 20 cases", () => {
    const result = jointTimeVerdict(bench("speedup-30", 0.7), JOINT_TIME);
    expect(result.outcome, result.reason).toBe("faster");
    expect(result.decided).toBe(true);
    expect(result.interval!.high).toBeLessThan(1);
    expect(result.cases).toBe(20);
    expect(result.aaCases).toBe(20);
  });

  it("gives slower for a clear 30% slowdown", () => {
    expect(jointTimeVerdict(bench("slowdown-30", 1.3), JOINT_TIME).outcome).toBe("slower");
  });

  it("gives cannot decide when a job decides the opposite direction of the pooled records", () => {
    // Jobs 0 to 3 have a 20% speedup. Job 4 has a 50% slowdown, so the pooled records give faster and job 4 gives slower.
    const fast = bench("guard", 0.8).filter((j) => j.job !== "4");
    const slow = bench("guard-slow", 1.5).filter((j) => j.job === "4");
    const result = jointTimeVerdict([...fast, ...slow], JOINT_TIME);
    expect(result.pooledOutcome).toBe("faster");
    expect(result.perJob.find((j) => j.job === "4")!.outcome).toBe("slower");
    expect(result.opposed).toEqual(["4"]);
    expect(result.outcome).toBe("cannot decide");
    expect(result.decided).toBe(false);
    expect(result.reason).toContain('the jobs "4" give "slower"');
    expect(result.derivation.join(" ")).toContain("Thus the outcome is cannot decide.");
  });

  it("keeps the pooled outcome when no job decides the opposite direction", () => {
    const result = jointTimeVerdict(bench("guard-none", 0.7), JOINT_TIME);
    expect(result.opposed).toEqual([]);
    expect(result.outcome).toBe(result.pooledOutcome);
    expect(result.derivation.join(" ")).toContain("No job gives the opposite direction");
  });

  it("merges the rounds of 5 jobs into one record for each case and round, and keeps a verdict for each job", () => {
    const result = jointTimeVerdict(bench("merge", 0.7), JOINT_TIME);
    expect(result.rounds).toEqual({ min: 25, max: 25 });
    expect(result.jobs).toEqual(["0", "1", "2", "3", "4"]);
    expect(result.perJob.map((j) => j.cases)).toEqual([20, 20, 20, 20, 20]);
    expect(result.perJob.map((j) => j.cpu)).toEqual([0, 1, 2, 3, 4].map((j) => `cpu of job ${j}`));
    expect(result.dropped).toEqual([]);
  });

  it("orders the jobs by the numbers of their labels", () => {
    const jobs = bench("labels", 0.7, 6, 5, 11);
    expect(jointTimeVerdict([...jobs].reverse(), JOINT_TIME).jobs).toEqual(jobs.map((j) => j.job));
  });

  it("balances the orders of a merged case when a job is missing", () => {
    const jobs = bench("missing", 0.7).filter((j) => j.job !== "1");
    // Without job 1, each case starts 11 rounds with arm a and 9 with arm b. balanceOrders of rigor-bench trims the extra rounds.
    const result = jointTimeVerdict(jobs, JOINT_TIME);
    expect(result.trimmed).toBe(2 * 20);
    expect(result.rounds).toEqual({ min: 19, max: 19 });
    expect(result.jobs).toEqual(["0", "2", "3", "4"]);
    expect(result.outcome).toBe("faster");
    expect(jointTimeVerdict(bench("complete", 0.7), JOINT_TIME).trimmed).toBe(0);
  });

  it("gives pooledVerdict the records of each job, its skipped cases and the margin", () => {
    const jobs = bench("glue", 0.7, 6, 2, 2);
    const skip = { arm: CANDIDATE, case: "c5", round: 2, reason: "too large" };
    const input = [jobs[0]!, { ...jobs[1]!, records: jobs[1]!.records.filter((r) => r.case !== "c5"), skipped: [skip] }];
    const calls = vi.mocked(pooledVerdict).mock.calls.length;
    jointTimeVerdict([...input].reverse(), { timeMargin: 0.07 });
    expect(vi.mocked(pooledVerdict).mock.calls).toHaveLength(calls + 1);
    const [given, options] = vi.mocked(pooledVerdict).mock.calls.at(-1)!;
    expect(options).toEqual({ margin: 0.07 });
    expect(given).toEqual(
      input.map((j) => ({ job: j.job, candidate: j.records.filter((r) => r.kind === "candidate"), aa: j.records.filter((r) => r.kind === "aa"), skipped: j.skipped })),
    );
  });

  it("drops a case that one job skipped from all jobs, and the Markdown names it", () => {
    const jobs = bench("skipped", 0.7);
    const skip = { arm: TIME_DEFAULT, case: "c3", round: 10, reason: "no route" };
    const input = jobs.map((j) => (j.job === "2" ? { ...j, records: j.records.filter((r) => r.case !== "c3"), skipped: [skip] } : j));
    const result = jointTimeVerdict(input, JOINT_TIME);
    expect(result.dropped).toEqual(["c3"]);
    expect(result.cases).toBe(19);
    expect(result.aaCases).toBe(19);
    expect(result.perJob.map((j) => j.cases)).toEqual([19, 19, 19, 19, 19]);
    expect(result.derivation.join(" ")).toContain("The jobs skipped the cases c3.");
    expect(timeMarkdown(result)).toContain("The skipped cases (dropped from all jobs): c3.");
    expect(timeMarkdown(jointTimeVerdict(jobs, JOINT_TIME))).toContain("The skipped cases (dropped from all jobs): none.");
  });

  it("refuses a record with the label of another job, by the guard of pooledVerdict", () => {
    const jobs = bench("label", 1, 5, 2, 2);
    const wrong = jobs.map((j) => (j.job === "1" ? { ...j, records: j.records.map((r) => ({ ...r, job: "0" })) } : j));
    expect(() => jointTimeVerdict(wrong, JOINT_TIME)).toThrow(/has the job "0"/);
  });

  it("writes the margin that it used, and the margin changes the zone of same", () => {
    const records = bench("margin", 1);
    expect(jointTimeVerdict(records, JOINT_TIME).timeMargin).toBe(JOINT_TIME.timeMargin);
    // A margin of 0 leaves no zone of same, so equal arms cannot decide.
    const none = jointTimeVerdict(records, { timeMargin: 0 });
    expect(none.timeMargin).toBe(0);
    expect(none.outcome).toBe("cannot decide");
    expect(none.decided).toBe(false);
    // A wide margin holds the interval of equal arms.
    expect(jointTimeVerdict(records, { timeMargin: 0.5 }).outcome).toBe("same");
  });

  it("cannot decide with fewer than 5 A/A cases", () => {
    const records = bench("few", 0.7, 4);
    const result = jointTimeVerdict(records, JOINT_TIME);
    expect(result.outcome).toBe("cannot decide");
    expect(result.decided).toBe(false);
    expect(result.interval).toBeNull();
    expect(timeMarkdown(result)).toContain("(no promotion)");
  });

  it("refuses two candidate pairs and an A/A record with another entry", () => {
    const jobs = bench("refuse", 1, 5, 2, 1);
    const other = mapRecords(jobs, (r) => (r.kind === "candidate" && r.case === "c0" ? { ...r, candidate: "shelf+portfolio" } : r));
    expect(() => jointTimeVerdict(other, JOINT_TIME)).toThrow(/2 candidate pairs/);
    const bad = mapRecords(jobs, (r) => (r.kind === "aa" && r.case === "c0" ? { ...r, candidate: CANDIDATE } : r));
    expect(() => jointTimeVerdict(bad, JOINT_TIME)).toThrow(/not two copies/);
  });

  it("gives the derivation with the margin, the counts and the outcome", () => {
    const result = jointTimeVerdict(bench("words", 0.7), JOINT_TIME);
    const text = result.derivation.join("\n");
    expect(text).toContain(`timeMargin is ${JOINT_TIME.timeMargin}`);
    expect(text).toContain("20 cases");
    expect(text).toContain(`The pooled outcome is ${result.pooledOutcome}.`);
    expect(timeMarkdown(result)).toContain(`| 4 | cpu of job 4 |`);
  });
});

describe("the fresh run of one job", () => {
  const plan = { baseline: TIME_DEFAULT, candidate: CANDIDATE, arm: ["node", "time-arms.ts"], cases: ["in/a", "in/b", "in/c"], files: ["0.json", "1.json", "2.json"], rounds: 4, job: 2 };

  it("gives freshRun the arms, the input file of each case, the global rounds and the label of the job", () => {
    const options = timeFreshOptions(plan);
    expect(options.base).toEqual({ id: TIME_DEFAULT, command: ["node", "time-arms.ts", "arm", "--pair", TIME_DEFAULT] });
    expect(options.candidates).toEqual([{ id: CANDIDATE, command: ["node", "time-arms.ts", "arm", "--pair", CANDIDATE] }]);
    expect(options.args!("in/b")).toEqual(["--input", "1.json"]);
    expect(options.roundOffset).toBe(8);
    expect(options.job).toBe("2");
    expect(options.aa).toBeUndefined();
    expect(() => timeFreshOptions({ ...plan, files: ["0.json"] })).toThrow(/3 cases and 1 input files/);
  });

  it("writes the records of the two pairs with their kinds and entries, and keeps the skip list of freshRun", async () => {
    const argvs: string[][] = [];
    // A fake child: each arm takes 10 ms, and the candidate skips the case in/c.
    const start: StartChild = async (argv) => {
      argvs.push([...argv]);
      const skip = argv.includes(CANDIDATE) && argv.includes("2.json");
      return { stdout: JSON.stringify(skip ? { skipped: "too large" } : { ms: 10, hash: "h" }) + "\n", stderr: "", code: 0 };
    };
    const run = await freshRun({ ...timeFreshOptions(plan), env: ENV, start });
    const { paired, aa } = timeRecords(run, TIME_DEFAULT, CANDIDATE);
    expect(run.skipped).toEqual([expect.objectContaining({ arm: CANDIDATE, case: "in/c", round: 8, reason: "too large" })]);
    expect(paired).toHaveLength(2 * 4);
    expect(aa).toHaveLength(2 * 4);
    expect(new Set(paired.map((r) => r.round))).toEqual(new Set([8, 9, 10, 11]));
    for (const r of paired) expect(r).toMatchObject({ kind: "candidate", job: "2", baseline: TIME_DEFAULT, candidate: CANDIDATE, a: 10, b: 10 });
    for (const r of aa) expect(r).toMatchObject({ kind: "aa", job: "2", baseline: TIME_DEFAULT, candidate: TIME_DEFAULT });
    expect(argvs[0]!.slice(0, 3)).toEqual(["node", "time-arms.ts", "arm"]);
    expect(argvs.every((a) => a.at(-2) === "--input")).toBe(true);
    // The job verdict takes the skip list from meta.json, and pooledVerdict removes the case from all jobs.
    const result = jointTimeVerdict([{ job: run.job, records: [...paired, ...aa], skipped: run.skipped }], JOINT_TIME);
    expect(result.dropped).toEqual(["in/c"]);
  });

  it("refuses a run without the pair of the candidate", () => {
    expect(() => timeRecords({ env: ENV, job: "0", pairs: {}, skipped: [] }, TIME_DEFAULT, CANDIDATE)).toThrow(/no pair select\+portfolio/);
  });
});

describe("the cases and the entries", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `in${String(i).padStart(2, "0")}`, boxes: i % 5 === 0 ? 1000 : 10 + i, edges: i % 7 === 0 ? 0 : 5, cost: 50 - i }));

  it("takes the cases at equal steps over the planned cost, without large inputs and inputs without edges", () => {
    const ids = timeCases(rows, 10, 100);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      expect(byId.get(id)!.boxes).toBeLessThanOrEqual(100);
      expect(byId.get(id)!.edges).toBeGreaterThan(0);
    }
    // The first case has the least cost and the last case has the most.
    expect(ids[0]).toBe("in48");
    expect(ids.at(-1)).toBe("in01");
    expect(timeCases(rows, 10, 100)).toEqual(ids);
    expect(() => timeCases(rows, 200, 100)).toThrow(/fewer than/);
  });

  it("gives the run options of a plain pair, a lane pair and an iteration pair", () => {
    expect(timeRunOptions(BASELINE)).toMatchObject({ routers: ["portfolio"], pairs: [BASELINE] });
    expect(timeRunOptions(BASELINE).packs?.map((p) => p.id)).toEqual(["rows"]);
    expect(timeRunOptions("lanes-sides.maxrects-cp.corners+corners").lanes?.map((l) => l.id)).toEqual(["lanes-sides.maxrects-cp.corners"]);
    expect(timeRunOptions("lanes-iter3.maxrects-cp.corners+corners").iterate?.map((l) => l.id)).toEqual(["lanes-iter3.maxrects-cp.corners"]);
    expect(() => timeRunOptions("rows+nowhere")).toThrow(/not a pair/);
    expect(() => timeRunOptions("nothing")).toThrow(/not a pair/);
  });
});
