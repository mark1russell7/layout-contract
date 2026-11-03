import type { RunEnv } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { BASELINE } from "./analysis.ts";
import { JOINT_TIME, jointTimeVerdict, TIME_DEFAULT, TIME_MODE, timeArmOrder, timeCases, timeMarkdown, timeRunOptions, type TimeKind, type TimeRecord } from "./time-arms.ts";

const ENV: RunEnv = { node: "v26.0.0", os: "linux", arch: "x64", runner: "test", cpu: "test cpu", cpus: 4, mode: TIME_MODE, context: "ci" };
const CANDIDATE = "select+portfolio";

/**
 * This function gives the seeded records of a bench: `jobs` jobs of `cases` cases and `rounds` rounds, in the order of `timeArmOrder`.
 * Each case has its own log scale, and each arm of each round adds a normal noise of `sigma` to the log time.
 * The candidate time is the default time times `ratio`. The A/A pair has two arms of the default.
 */
function bench(seed: string, ratio: number, cases = 20, rounds = 5, jobs = 5, sigma = 0.1): TimeRecord[] {
  const rng = random(seed);
  const scales = Array.from({ length: cases }, () => rng.range(Math.log(5), Math.log(500)));
  const out: TimeRecord[] = [];
  for (let job = 0; job < jobs; job++) {
    for (let r = 0; r < rounds; r++) {
      const round = job * rounds + r;
      for (let i = 0; i < cases; i++) {
        const time = (factor: number): number => Math.exp(scales[i]! + Math.log(factor) + rng.normal(0, sigma));
        const order = timeArmOrder(round, i);
        const first = (kind: TimeKind) => order.find((s) => s.kind === kind)!.arm;
        const env = { ...ENV, cpu: `cpu of job ${job}` };
        out.push({ case: `c${i}`, round, first: first("candidate"), a: time(1), b: time(ratio), kind: "candidate", job, baseline: TIME_DEFAULT, candidate: CANDIDATE, env });
        out.push({ case: `c${i}`, round, first: first("aa"), a: time(1), b: time(1), kind: "aa", job, baseline: TIME_DEFAULT, candidate: TIME_DEFAULT, env });
      }
    }
  }
  return out;
}

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

  it("merges the rounds of 5 jobs into one record for each case and round, and keeps a verdict for each job", () => {
    const result = jointTimeVerdict(bench("merge", 0.7), JOINT_TIME);
    expect(result.rounds).toEqual({ min: 25, max: 25 });
    expect(result.jobs).toEqual([0, 1, 2, 3, 4]);
    expect(result.perJob.map((j) => j.cases)).toEqual([20, 20, 20, 20, 20]);
    expect(result.perJob.map((j) => j.cpu)).toEqual([0, 1, 2, 3, 4].map((j) => `cpu of job ${j}`));
    expect(result.modes).toEqual([TIME_MODE]);
  });

  it("balances the orders of a merged case when a job is missing", () => {
    const records = bench("missing", 0.7).filter((r) => r.job !== 1);
    // Without job 1, each case starts 11 rounds with arm a and 9 with arm b. caseRatios of rigor-bench refuses that order.
    const result = jointTimeVerdict(records, JOINT_TIME);
    expect(result.removed).toBe(2 * 20);
    expect(result.rounds).toEqual({ min: 19, max: 19 });
    expect(result.jobs).toEqual([0, 2, 3, 4]);
    expect(result.outcome).toBe("faster");
    expect(jointTimeVerdict(bench("complete", 0.7), JOINT_TIME).removed).toBe(0);
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
    const records = bench("refuse", 1, 5, 2, 1);
    const other = records.map((r) => (r.kind === "candidate" && r.case === "c0" ? { ...r, candidate: "shelf+portfolio" } : r));
    expect(() => jointTimeVerdict(other, JOINT_TIME)).toThrow(/2 candidate pairs/);
    const bad = records.map((r) => (r.kind === "aa" && r.case === "c0" ? { ...r, candidate: CANDIDATE } : r));
    expect(() => jointTimeVerdict(bad, JOINT_TIME)).toThrow(/not two copies/);
  });

  it("gives the derivation with the margin, the counts and the outcome", () => {
    const result = jointTimeVerdict(bench("words", 0.7), JOINT_TIME);
    const text = result.derivation.join("\n");
    expect(text).toContain(`timeMargin is ${JOINT_TIME.timeMargin}`);
    expect(text).toContain("20 cases");
    expect(text).toContain(`The outcome is ${result.outcome}.`);
    expect(timeMarkdown(result)).toContain(`| 4 | cpu of job 4 |`);
  });
});

describe("the order of the 4 arms", () => {
  it("runs 2 arms of each pair, turns the first arm of each pair each round, and turns the first pair each second round", () => {
    const blocks = new Set<string>();
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < 3; i++) {
        const order = timeArmOrder(round, i);
        expect(order).toHaveLength(4);
        for (const kind of ["candidate", "aa"] as const) expect(order.filter((s) => s.kind === kind).map((s) => s.arm).sort()).toEqual(["a", "b"]);
        const next = timeArmOrder(round + 1, i);
        expect(next.find((s) => s.kind === "candidate")!.arm).not.toBe(order.find((s) => s.kind === "candidate")!.arm);
        expect(next.find((s) => s.kind === "aa")!.arm).not.toBe(order.find((s) => s.kind === "aa")!.arm);
        if (i === 0) blocks.add(`${order[0]!.kind} ${order[0]!.arm}`);
      }
    }
    expect(blocks.size).toBe(4);
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
