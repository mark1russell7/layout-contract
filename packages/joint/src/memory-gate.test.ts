// The memory gate of L81: the probe inputs cover each family of the corpus, and the gate fails on each kind of bad probe.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { straightCrossings } from "./joint-measures.ts";
import {
  ENGINE_NAMES,
  engineChange,
  expectedProbes,
  familyOf,
  familyProbeGroups,
  GATE_FALLBACK_MINUTES,
  GATE_LANES,
  gateCost,
  gateEstimate,
  gateJobs,
  gateMarkdown,
  LIMIT_DATA,
  LIMIT_SOURCE,
  limitChange,
  limitRepeatsFor,
  LIMITS_MODE,
  limitsOf,
  MEMORY_GATE_MB,
  MEMORY_LIMITS,
  memoryGate,
  parseLimitData,
  type ProbeResult,
  REFIT_PROBES,
  refitLimits,
  refitMarkdown,
  refitRefusal,
  sourceOf,
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

  it("are the worst value of the probes of the limit data plus the spread, with one step of 1 MB at least", () => {
    for (const [input, values] of Object.entries(LIMIT_DATA.probes)) {
      const limit = MEMORY_LIMITS[input]!;
      for (const [list, max, worst] of [[values.allocMb, limit.allocMb, limit.fromAllocMb], [values.liveMaxMb, limit.liveMaxMb, limit.fromLiveMb]] as const) {
        expect(worst).toBe(Math.max(...list));
        expect(max).toBe(Math.max(...list) + Math.max(Math.max(...list) - Math.min(...list), 1));
      }
    }
    expect(Object.keys(MEMORY_LIMITS).sort()).toEqual(["s1", "s2", "s3"].map((s) => `${DENSE_HUBS_FAMILY}/${s}`));
    expect(LIMIT_SOURCE).toEqual(sourceOf(LIMIT_DATA));
  });

  it("give the limits of 2026-11-03 for the 6 probes of seed s1 of the runs 41654875543 and 41769223049", () => {
    const s1 = { allocMb: [2530026, 2531692, 2528117, 2530655, 2528456, 2529563], liveMaxMb: [393, 393, 393, 393, 393, 393] };
    expect(limitsOf({ ...LIMIT_DATA, probes: { s1 } })["s1"]).toEqual({ allocMb: 2535267, liveMaxMb: 394, fromAllocMb: 2531692, fromLiveMb: 393 });
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

  it("give the jobs with limits their own count of repeats", () => {
    const jobs = gateJobs(["x/s1"], ["bench-6144"], 1, { "f/s1": limits.a }, 3);
    expect(jobs.map((j) => `${j.repeat} ${j.mode} ${j.input}`)).toEqual([`1 ${LIMITS_MODE} f/s1`, "1 bench-6144 x/s1", `2 ${LIMITS_MODE} f/s1`, `3 ${LIMITS_MODE} f/s1`]);
    expect(gateJobs(["x/s1"], ["bench-6144"], 2, { "f/s1": limits.a }, 1).map((j) => `${j.repeat} ${j.mode}`)).toEqual([`1 ${LIMITS_MODE}`, "1 bench-6144", "2 bench-6144"]);
    expect(limitRepeatsFor("", 1)).toBe(1);
    expect(limitRepeatsFor("highways 0.10.0 to 0.13.0", 1)).toBe(REFIT_PROBES);
    expect(limitRepeatsFor("highways 0.10.0 to 0.13.0", 7)).toBe(7);
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

  it("reads the lanes of the gate from the workflow, at the limit of 3", () => {
    const text = readFileSync(new URL("../../../.github/workflows/memory-probe.yml", import.meta.url), "utf8");
    const lines = [...text.matchAll(/max-parallel: (\S+)/g)].map((m) => m[1]);
    expect(lines).toEqual([String(GATE_LANES)]);
    expect(GATE_LANES).toBe(3);
  });
});

describe("the versions of the limits", () => {
  const source = { runs: [1, 2], head: "abc1234", engines: { node: "26.13.0", highways: "0.10.0", packing: "0.5.0" } };
  const limits = { a: { allocMb: 2535267, liveMaxMb: 394, fromAllocMb: 2531692, fromLiveMb: 393 } };
  const probe = (engines?: Record<string, string>): ProbeResult => ({ input: "a", mode: LIMITS_MODE, status: 0, peakRssMb: 4447, allocMb: 2517625, liveMaxMb: 395, engines });
  const gate = (r: ProbeResult) => memoryGate([{ input: "a", mode: LIMITS_MODE }], [r], MEMORY_GATE_MB, limits, source);

  it("names each version that changed, in the order of the source", () => {
    expect(engineChange(source.engines, source.engines)).toBe("");
    expect(engineChange(source.engines, { node: "26.13.0", highways: "0.13.0", packing: "0.6.1" })).toBe("highways 0.10.0 to 0.13.0, packing 0.5.0 to 0.6.1");
    expect(engineChange(source.engines, { node: "26.13.0", highways: "0.10.0" })).toBe("packing 0.5.0 to none");
    expect(engineChange(source.engines, undefined)).toBe("no versions");
  });

  it("gives the change from the worst probe of the source, in MB and in percent", () => {
    // The values of seed s1 in the gate 41971168014.
    expect(limitChange(probe(), limits.a)).toBe("live heap +2 MB (+0.51 %), allocation -14067 MB (-0.56 %)");
    expect(limitChange({ ...probe(), liveMaxMb: 393, allocMb: undefined }, limits.a)).toBe("live heap 0 MB (0.00 %)");
    expect(limitChange(probe(), { allocMb: 1, liveMaxMb: 1 })).toBe("");
  });

  it("states the change of the versions when a probe with limits fails after it", () => {
    const g = gate(probe({ node: "26.13.0", highways: "0.13.0", packing: "0.6.1" }));
    expect(g.pass).toBe(false);
    expect(g.rows[0]!.reason).toBe("live heap 395 MB, limit 394 MB");
    expect(g.rows[0]!.engines).toBe("highways 0.10.0 to 0.13.0, packing 0.5.0 to 0.6.1");
    expect(g.engineChanges).toEqual(["highways 0.10.0 to 0.13.0, packing 0.5.0 to 0.6.1"]);
    const text = gateMarkdown(g);
    expect(text).toContain("The limits come from the runs 1 and 2, on commit `abc1234`, with node 26.13.0, highways 0.10.0, packing 0.5.0.");
    expect(text).toContain("The probes with limits ran on other versions: highways 0.10.0 to 0.13.0, packing 0.5.0 to 0.6.1.");
    expect(text).toContain("| 395 | live heap +2 MB (+0.51 %), allocation -14067 MB (-0.56 %) | live heap 395 MB, limit 394 MB |");
  });

  it("says that the versions are the same, and counts a probe with no versions as a change", () => {
    expect(gate(probe(source.engines)).engineChanges).toEqual([]);
    expect(gateMarkdown(gate(probe(source.engines)))).toContain("Each probe with limits ran on these versions.");
    expect(gate(probe()).engineChanges).toEqual(["no versions"]);
  });

  it("gives no change and no versions to a row without limits", () => {
    const g = memoryGate([{ input: "b", mode: "bench-6144" }], [{ input: "b", mode: "bench-6144", status: 0, peakRssMb: 90 }], MEMORY_GATE_MB, limits, source);
    expect(g.rows[0]!.change).toBe("");
    expect(g.engineChanges).toEqual([]);
    expect(gateMarkdown(g)).not.toContain("The limits come from");
  });

  it("has a version of each name in the source of MEMORY_LIMITS", () => {
    expect(Object.keys(LIMIT_SOURCE.engines)).toEqual([...ENGINE_NAMES]);
  });
});

describe("the refit of the limits", () => {
  const engines = { node: "26.13.0", highways: "0.13.0", packing: "0.6.1" };
  const source = { runs: [1, 2], head: "abc1234", engines: { node: "26.13.0", highways: "0.10.0", packing: "0.5.0" } };
  const old = { a: { allocMb: 2535267, liveMaxMb: 394, fromAllocMb: 2531692, fromLiveMb: 393 } };
  const run = { run: 41971168014, url: "https://example.test/runs/41971168014", head: "ef71e84000000000000000000000000000000000" };
  const probe = (allocMb: number, over: Partial<ProbeResult> = {}): ProbeResult => ({ input: "a", mode: LIMITS_MODE, status: 0, peakRssMb: 4400, allocMb, liveMaxMb: 395, engines, ...over });
  const five = [2517625, 2516000, 2519000, 2518100, 2515500].map((a) => probe(a));

  it("gives the worst value plus the spread of 5 probes, and new limit data of this run", () => {
    const refit = refitLimits(five, run, old);
    expect(refit.refused).toEqual([]);
    expect(refit.rows[0]!.next).toEqual({ allocMb: 2519000 + 3500, liveMaxMb: 396, fromAllocMb: 2519000, fromLiveMb: 395 });
    expect(refit.data).toEqual({ runs: [41971168014], head: "ef71e84", engines, probes: { a: { allocMb: five.map((r) => r.allocMb), liveMaxMb: [395, 395, 395, 395, 395] } } });
    // The new data is valid limit data, and its limits are the limits of the refit.
    expect(limitsOf(parseLimitData(JSON.stringify(refit.data)))["a"]).toEqual(refit.rows[0]!.next);
  });

  it("counts only the probes of the mode of the limits with the status 0 and both values", () => {
    const extra = [probe(9_000_000, { status: 134 }), probe(9_000_000, { mode: "bench-6144" }), probe(9_000_000, { liveMaxMb: undefined }), probe(9_000_000, { input: "b" })];
    expect(refitLimits([...five, ...extra], run, old).rows[0]!.next!.fromAllocMb).toBe(2519000);
  });

  it("refuses too few probes, a probe with no versions and two sets of versions", () => {
    expect(refitLimits(five.slice(0, 4), run, old).refused).toEqual(["The input a has 4 probes with values, and a refit needs 5."]);
    expect(refitLimits([...five.slice(0, 4), probe(2517000, { engines: undefined })], run, old).refused).toEqual(["A probe has no engines.json, so the refit cannot name its versions."]);
    const two = refitLimits([...five.slice(0, 4), probe(2517000, { engines: { ...engines, packing: "0.7.0" } })], run, old);
    expect(two.refused).toEqual(["The probes ran on 2 sets of versions, and a refit needs one set."]);
    expect(two.data).toBeUndefined();
  });

  it("names the runs, both sets of versions and the change of each input in the body", () => {
    const text = refitMarkdown(refitLimits(five, run, old), run, source);
    expect(text).toContain("The probes of the run [41971168014](https://example.test/runs/41971168014), on commit `ef71e84`, give new limits");
    expect(text).toContain("- The old limits come from the runs 1 and 2, on commit `abc1234`, with node 26.13.0, highways 0.10.0, packing 0.5.0.");
    expect(text).toContain("The change of the versions: highways 0.10.0 to 0.13.0, packing 0.5.0 to 0.6.1.");
    expect(text).toContain("| a | 5 | 393 to 395 (+2 MB (+0.51 %)) | 394 to 396 (+2 MB (+0.51 %)) |");
    expect(refitMarkdown(refitLimits(five.slice(0, 4), run, old), run, source)).toContain("### Refit of the memory limits: refused");
  });

  it("refuses limit data with too few probes, no version of a name or a bad value", () => {
    const good = JSON.stringify(LIMIT_DATA);
    expect(parseLimitData(good)).toEqual(LIMIT_DATA);
    const bad = (change: (d: Record<string, unknown>) => void) => {
      const d = JSON.parse(good) as Record<string, unknown>;
      change(d);
      return () => parseLimitData(JSON.stringify(d));
    };
    expect(bad((d) => { d["probes"] = { a: { allocMb: [1, 2, 3, 4], liveMaxMb: [1, 2, 3, 4] } }; })).toThrow(/5 or more probes/);
    expect(bad((d) => { d["probes"] = { a: { allocMb: [1, 2, 3, 4, 0], liveMaxMb: [1, 2, 3, 4, 5] } }; })).toThrow(/above 0/);
    expect(bad((d) => { d["engines"] = { node: "26.13.0" }; })).toThrow("The limit data has no version of highways.");
    expect(bad((d) => { d["head"] = "main"; })).toThrow(/is a commit/);
    expect(bad((d) => { d["runs"] = []; })).toThrow(/run ids/);
  });
});

describe("the refusals of the command refit-pr", () => {
  const data = { ...LIMIT_DATA, runs: [7], head: "ef71e84" };
  const file = { run: 7, url: "https://example.test/7", head: "ef71e84000", refused: [], data };
  const clean = { ancestor: true, limitsChanged: false };

  it("passes a valid refit of this run on a commit of main with no later change of the limits", () => {
    expect(refitRefusal(file, 7, clean)).toBeUndefined();
  });

  it("refuses a refused refit, and passes the same file with its data", () => {
    expect(refitRefusal({ ...file, refused: ["The input a has 4 probes with values, and a refit needs 5."], data: null }, 7, clean)).toBe(
      "The refit of the run 7 is refused: The input a has 4 probes with values, and a refit needs 5.",
    );
    expect(refitRefusal({ ...file, data: undefined }, 7, clean)).toMatch(/^The refit of the run 7 is refused/);
  });

  it("refuses the artifact of another run", () => {
    expect(refitRefusal(file, 8, clean)).toBe("The artifact of the run 8 holds the refit of the run 7.");
  });

  it("refuses a commit that is not an ancestor of main, and passes when it is", () => {
    expect(refitRefusal(file, 7, { ...clean, ancestor: false })).toBe("The commit ef71e84000 of the probes is not an ancestor of origin/main, so the refit is refused.");
    expect(refitRefusal(file, 7, { ...clean, ancestor: true })).toBeUndefined();
  });

  it("refuses a commit before a change of the limit file on main, and passes without the change", () => {
    expect(refitRefusal(file, 7, { ...clean, limitsChanged: true })).toBe(
      "The file data/memory-limits.json changed on origin/main after the commit ef71e84000 of the probes, so the refit is refused.",
    );
    expect(refitRefusal(file, 7, { ...clean, limitsChanged: false })).toBeUndefined();
  });
});
