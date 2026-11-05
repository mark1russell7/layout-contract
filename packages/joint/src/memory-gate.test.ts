// The memory gate of L81: the probe inputs cover each family of the corpus, and the gate fails on each kind of bad probe.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { straightCrossings } from "./joint-measures.ts";
import {
  expectedProbes,
  familyOf,
  familyProbeGroups,
  GATE_FALLBACK_MINUTES,
  GATE_LANES,
  gateCost,
  gateEstimate,
  gateJobs,
  gateMarkdown,
  LIMITS_MODE,
  MEMORY_GATE_MB,
  MEMORY_LIMITS,
  memoryGate,
  type ProbeResult,
  STEP_FUNCTION,
  STEP_LINE_MB,
  stepCount,
} from "./memory-gate.ts";
import { plannedCost } from "./plan.ts";
import { PACK_ENTRIES, ROUTERS } from "./runner.ts";

/** The dense input with hubs that L77 did not probe. Its 3 seeds peaked at 3438-4287 MB in bench-4. */
const DENSE_HUBS_FAMILY = "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap";

describe("the probe inputs", () => {
  it("gives each input with the largest cost of each family, the tied seeds too", () => {
    const groups = familyProbeGroups([
      { id: "c/a/s1", cost: 2 },
      { id: "c/a/s2", cost: 5 },
      { id: "c/b/s1", cost: 1 },
      { id: "c/a/s3", cost: 5 },
    ]);
    expect(groups).toEqual([["c/a/s2", "c/a/s3"], ["c/b/s1"]]);
    expect(familyOf("c/a/s12")).toBe("c/a");
  });

  it("covers each family of joint-v2, and each seed of the dense input with hubs", () => {
    const pairs = PACK_ENTRIES.length * ROUTERS.length;
    const inputs = jointCorpus(SET_V2).inputs.map((input) => ({ id: input.id, cost: plannedCost(familyOf(input.id), input.boxes.length, input.edges?.length ?? 0, pairs) }));
    const groups = familyProbeGroups(inputs);
    const families = new Set(inputs.map((i) => familyOf(i.id)));
    expect(groups).toHaveLength(families.size);
    expect(new Set(groups.map((g) => familyOf(g[0]!)))).toEqual(families);
    expect(families.size).toBe(101);
    for (const g of groups) expect(new Set(g.map(familyOf)).size).toBe(1);
    expect(groups.find((g) => familyOf(g[0]!) === DENSE_HUBS_FAMILY)).toEqual([1, 2, 3].map((s) => `${DENSE_HUBS_FAMILY}/s${s}`));
  });
});

/** This function gives each input in each mode, the expected probes of a gate without limits. */
const each = (inputs: readonly string[], modes: readonly string[]) => modes.flatMap((mode) => inputs.map((input) => ({ input, mode })));

describe("the gate", () => {
  const ok = (input: string, peakRssMb: number): ProbeResult => ({ input, mode: "bench-6144", status: 0, peakRssMb });

  it("passes when each input has a probe under the limit", () => {
    const gate = memoryGate(each(["a", "b"], ["bench-6144"]), [ok("a", 900), ok("b", 3071)]);
    expect(gate.pass).toBe(true);
    expect(gate.rows.map((r) => r.input)).toEqual(["b", "a"]);
  });

  it("fails on a missing probe, an OOM, another status, no peak and a peak at the limit", () => {
    const gate = memoryGate(
      each(["a", "b", "c", "d", "e", "f"], ["bench-6144"]),
      [
        { input: "b", mode: "bench-6144", status: 134, peakRssMb: undefined },
        { input: "c", mode: "bench-6144", status: 1, peakRssMb: 500 },
        { input: "d", mode: "bench-6144", status: 0, peakRssMb: undefined },
        ok("e", MEMORY_GATE_MB),
        ok("f", 100),
      ],
    );
    expect(gate.pass).toBe(false);
    expect(Object.fromEntries(gate.rows.map((r) => [r.input, r.reason]))).toEqual({
      a: "no probe",
      b: "OOM (status 134)",
      c: "status 1",
      d: "no peak",
      e: `peak ${MEMORY_GATE_MB} MB, limit ${MEMORY_GATE_MB} MB`,
      f: "",
    });
  });

  it("fails when it examines nothing", () => {
    expect(memoryGate([], [ok("a", 100)]).pass).toBe(false);
  });

  it("examines each repeat of an input", () => {
    const gate = memoryGate(each(["a"], ["bench-6144"]), [ok("a", 100), ok("a", MEMORY_GATE_MB + 1), ok("a", 200)]);
    expect(gate.pass).toBe(false);
    expect(gate.rows.map((r) => r.peakRssMb)).toEqual([MEMORY_GATE_MB + 1, 200, 100]);
  });

  it("needs a probe in each mode", () => {
    const gate = memoryGate(each(["a"], ["bench-6144", "cap-2048"]), [ok("a", 100)]);
    expect(gate.rows.map((r) => `${r.mode} ${r.reason}`).sort()).toEqual(["bench-6144 ", "cap-2048 no probe"]);
    expect(gateMarkdown(gate)).toContain("### Memory gate: fail");
  });
});

describe("the steps of the allocation", () => {
  const site = (mb: number, name = STEP_FUNCTION) => ({ at: `${name} file:///x/joint-measures.ts:121`, mb });

  it("counts the pairs where the function allocates the line or more", () => {
    const pairs = [{ top: [site(27.8)] }, { top: [site(STEP_LINE_MB)] }, { top: [site(1076.3)] }, { top: [] }];
    expect(stepCount(pairs)).toBe(2);
  });

  it("does not count another function", () => {
    expect(stepCount([{ top: [site(5000, `${STEP_FUNCTION}Other`), site(5000, "hypot")] }])).toBe(0);
  });

  it("follows the name of the function", () => {
    expect(straightCrossings.name).toBe(STEP_FUNCTION);
  });

  it("shows the count next to the allocation, and an empty cell without a count", () => {
    const expected = [{ input: "a", mode: "measure-6144" }, { input: "b", mode: "bench-6144" }];
    const results = [{ input: "a", mode: "measure-6144", status: 0, peakRssMb: 100, allocMb: 7, steps: 2 }, { input: "b", mode: "bench-6144", status: 0, peakRssMb: 90 }];
    const text = gateMarkdown(memoryGate(expected, results));
    expect(text).toContain("| Allocation (MB) | Steps |");
    expect(text).toContain("| a | measure-6144 | 0 | 100 | 7 | 2 |");
    expect(text).toContain("| b | bench-6144 | 0 | 90 |  |  |");
  });
});

describe("the limits of input F", () => {
  const limits = { a: { allocMb: 1000, liveMaxMb: 300 } };
  const probe = (allocMb: number | undefined, liveMaxMb: number | undefined): ProbeResult => ({ input: "a", mode: LIMITS_MODE, status: 0, peakRssMb: 900, allocMb, liveMaxMb });
  const reason = (r: ProbeResult) => memoryGate([{ input: "a", mode: LIMITS_MODE }], [r], MEMORY_GATE_MB, limits).rows[0]!.reason;

  it("passes at the limit and fails above it, and fails without a value", () => {
    expect(reason(probe(1000, 300))).toBe("");
    expect(reason(probe(1001, 300))).toBe("allocation 1001 MB, limit 1000 MB");
    expect(reason(probe(1000, 301))).toBe("live heap 301 MB, limit 300 MB");
    expect(reason(probe(undefined, undefined))).toBe("no allocation, no live heap");
  });

  it("examines the limits only in their mode", () => {
    const gate = memoryGate([{ input: "a", mode: "bench-6144" }], [{ input: "a", mode: "bench-6144", status: 0, peakRssMb: 900, allocMb: 5000, liveMaxMb: 900 }], MEMORY_GATE_MB, limits);
    expect(gate.pass).toBe(true);
  });

  it("are the worst value of runs 41654875543 and 41769223049 plus the spread, with one step of 1 MB at least", () => {
    // The values of the 6 probes of each seed: [min, max] of allocMb and of liveMaxMb.
    const run = { s1: [2528117, 2531692, 393, 393], s2: [3306532, 3310056, 420, 420], s3: [3559272, 3566862, 502, 502] };
    for (const [seed, [aMin, aMax, lMin, lMax]] of Object.entries(run)) {
      const limit = MEMORY_LIMITS[`${DENSE_HUBS_FAMILY}/${seed}`]!;
      expect(limit.allocMb).toBe(aMax! + Math.max(aMax! - aMin!, 1));
      expect(limit.liveMaxMb).toBe(lMax! + Math.max(lMax! - lMin!, 1));
    }
    expect(Object.keys(MEMORY_LIMITS)).toHaveLength(3);
  });

  it("give each seed of F a job of its own in the limits mode, and keep F in its group", () => {
    const jobs = gateJobs(["x/s1", "f/s1,f/s2"], ["bench-6144"], 2, { "f/s1": limits.a, "f/s2": limits.a });
    expect(jobs.map((j) => `${j.repeat} ${j.mode} ${j.input}`)).toEqual([
      `1 ${LIMITS_MODE} f/s1`,
      `1 ${LIMITS_MODE} f/s2`,
      "1 bench-6144 x/s1",
      "1 bench-6144 f/s1,f/s2",
      `2 ${LIMITS_MODE} f/s1`,
      `2 ${LIMITS_MODE} f/s2`,
      "2 bench-6144 x/s1",
      "2 bench-6144 f/s1,f/s2",
    ]);
    expect(expectedProbes(jobs).map((p) => `${p.mode} ${p.input}`)).toEqual([`${LIMITS_MODE} f/s1`, `${LIMITS_MODE} f/s2`, "bench-6144 x/s1", "bench-6144 f/s1", "bench-6144 f/s2"]);
    expect(gateJobs(["x/s1"], ["bench-6144"], 1)).toEqual([{ input: "x/s1", mode: "bench-6144", repeat: 1 }]);
  });
});

/** This function gives a job with a start at a stated minute of a stated day, and a length in minutes. */
function timedJob(start: number, minutes: number): { conclusion: string; startedAt: string; completedAt: string } {
  const base = Date.parse("2026-11-04T00:00:00Z");
  return { conclusion: "success", startedAt: new Date(base + start * 60000).toISOString(), completedAt: new Date(base + (start + minutes) * 60000).toISOString() };
}

describe("the expected minutes of a gate", () => {
  it("is the longest job when the longest job is over the job minutes per lane", () => {
    const cost = gateCost([timedJob(0, 303), timedJob(0, 100), timedJob(0, 100)], 6);
    expect(cost.longest).toBe(303);
    expect(cost.jobMinutes).toBe(503);
    expect(cost.minutes).toBe(303);
  });

  it("is the job minutes per lane when no job is that long", () => {
    const jobs = Array.from({ length: 120 }, (_, i) => timedJob(i, 12));
    expect(gateCost(jobs, 6).minutes).toBe(240);
    expect(gateCost(jobs, 3).minutes).toBe(480);
  });

  it("does not read a wait in the concurrency group, because only the times of the jobs count", () => {
    const late = [timedJob(334, 171), timedJob(334, 171)];
    expect(gateCost(late, 6).minutes).toBe(171);
  });

  it("leaves out skipped jobs, jobs with no end and jobs with a start at the year 1", () => {
    const cost = gateCost([
      timedJob(0, 10),
      { conclusion: "skipped", startedAt: "2026-11-04T00:00:00Z", completedAt: "2026-11-04T09:00:00Z" },
      { conclusion: "success", startedAt: "2026-11-04T00:00:00Z", completedAt: null },
      { conclusion: "success", startedAt: "0001-01-01T00:00:00Z", completedAt: "2026-11-04T00:00:00Z" },
      { conclusion: "success" },
    ]);
    expect(cost.jobMinutes).toBe(10);
  });

  it("leaves out a job cancelled in the queue, because its time is a wait and it has no steps", () => {
    const queued = { conclusion: "cancelled", startedAt: "2026-11-04T00:00:00Z", completedAt: "2026-11-04T09:00:00Z", steps: [] };
    expect(gateCost([timedJob(0, 10), queued]).jobMinutes).toBe(10);
    expect(gateCost([timedJob(0, 10), { ...queued, steps: null }]).longest).toBe(10);
  });

  it("keeps a job cancelled at the time limit, because it ran and its steps show that", () => {
    const ran = { conclusion: "cancelled", startedAt: "2026-11-04T00:00:00Z", completedAt: "2026-11-04T05:40:00Z", steps: [{ name: "probe" }] };
    expect(gateCost([timedJob(0, 10), ran]).longest).toBe(340);
  });

  it("refuses a count of lanes that is not a whole number from 1", () => {
    expect(() => gateCost([], 0)).toThrow(RangeError);
    expect(() => gateCost([], 1.5)).toThrow(RangeError);
  });

  it("takes the median over the gates, and an odd gate does not move it", () => {
    expect(gateEstimate([[timedJob(0, 100)], [timedJob(0, 300)], [timedJob(0, 200)]])).toBe(200);
  });

  it("takes the fallback when no gate has job times", () => {
    expect(gateEstimate([])).toBe(GATE_FALLBACK_MINUTES);
    expect(gateEstimate([[{ conclusion: "skipped" }]])).toBe(GATE_FALLBACK_MINUTES);
  });

  it("reads the lanes of the nightly gate, and a dispatch keeps 3", () => {
    const text = readFileSync(new URL("../../../.github/workflows/memory-probe.yml", import.meta.url), "utf8");
    const line = /max-parallel: \$\{\{ github\.event_name == 'workflow_dispatch' && (\d+) \|\| (\d+) \}\}/.exec(text);
    expect(line?.[1]).toBe("3");
    expect(Number(line?.[2])).toBe(GATE_LANES);
  });
});
