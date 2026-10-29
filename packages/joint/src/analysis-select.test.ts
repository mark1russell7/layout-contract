import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { analyze, compositeCheck, reportMarkdown, routeTimes, shardTimes, type AnalysisInput } from "./analysis.ts";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { selectMemberOf } from "./runner.ts";

/** This function makes a fake record of one pair on one input. */
function rec(input: string, strategy: string, measures: Record<string, number>, options: { hard?: Record<string, number>; hash?: string; skipped?: string } = {}): LayoutRecord {
  return {
    schema: "layout-record/1",
    stage: "joint",
    step: "joint",
    strategy,
    options: {},
    corpus: "test",
    input,
    inputHash: "",
    set: "test",
    seed: 1,
    nodes: 3,
    edges: 2,
    measures: { "pack.overflow": 0, "pack.overflow.excessArea": 0, "pack.fill": 0.5, "route.mixed": 0, "route.cap.1.1": 0, "route.cap.1.25": 0, "route.cap.1.5": 0, ...measures },
    hard: { "pack.no-overlap": 0, "route.violations": 0, ...options.hard },
    deterministic: true,
    ms: 1,
    ...(options.skipped === undefined ? { outputHash: options.hash ?? `${strategy}:${input}` } : { skipped: options.skipped }),
  };
}

/** Two specs with 3 seeds each. */
const inputs: AnalysisInput[] = ["p", "q"].flatMap((spec) =>
  [1, 2, 3].map((seed) => ({ id: `${spec}/s${seed}`, seed, spec, kind: spec, cell: { containerSize: "fixed", count: "10" } })),
);

/** The member of `select` on each input: `rows` on the spec `p`, `maxrects-bl` on the spec `q`. */
const members: Record<string, string> = Object.fromEntries(inputs.map((i) => [i.id, i.spec === "p" ? "rows" : "maxrects-bl"]));

/**
 * The routers `shared-all` and `portfolio`. The router `portfolio` gives 0.05 less fill.
 * - On `p`: `rows` fills 0.8 and `maxrects-bl` fills 0.6.
 * - On `q`: `rows` breaks the cap 1.25 with the fill 0.5, and `maxrects-bl` fills 0.7.
 * - The records of `select` are copies of the records of the member, with the same hashes.
 * - The route time of `maxrects-bl` is 3000 ms, and 1000 ms for the other entries.
 */
function records(): LayoutRecord[] {
  const out: LayoutRecord[] = [];
  for (const i of inputs) {
    const p = i.spec === "p";
    for (const router of ["shared-all", "portfolio"]) {
      const less = router === "portfolio" ? 0.05 : 0;
      const of = (pack: string, fill: number, cap: number, ms: number): LayoutRecord =>
        rec(i.id, `${pack}+${router}`, { "joint.fill": fill - less, "route.cap.1.25": cap, "route.ms": ms }, { hash: `${pack}:${router}:${i.id}` });
      const rows = of("rows", p ? 0.8 : 0.5, p ? 0 : 1, 1000);
      const bl = of("maxrects-bl", p ? 0.6 : 0.7, 0, 3000);
      const member = p ? rows : bl;
      out.push(rows, bl, { ...member, strategy: `select+${router}`, measures: { ...member.measures, "route.ms": 1000 } });
    }
  }
  return out;
}

describe("the ranking of the output groups", () => {
  const report = analyze(records(), inputs, { resamples: 100 });
  const cell = report.cells.find((c) => c.rule === "all" && c.cap === 1.25)!;

  it("ranks each group by the misses, then the score, with the best pair first", () => {
    expect(cell.ranking.map((r) => r.group)).toEqual([
      "select+shared-all",
      "select+portfolio",
      "maxrects-bl+shared-all",
      "maxrects-bl+portfolio",
      "rows+shared-all",
      "rows+portfolio",
    ]);
    expect(cell.ranking[0]!.group).toBe(cell.best.pair);
    expect(cell.ranking[0]).toMatchObject({ rank: 1, misses: 0, members: ["select+shared-all"] });
    expect(cell.ranking[0]!.score).toBeCloseTo(0.75, 9);
    expect(cell.ranking[4]).toMatchObject({ rank: 5, misses: 3 });
    expect(cell.packRanks).toEqual({ select: 1, "maxrects-bl": 3, rows: 5 });
  });

  it("writes the top rows of the ranking of the headline cell", () => {
    const md = reportMarkdown(report, { rankTop: 2 });
    expect(md).toContain("### The ranking of the output groups (rule all, cap 1.25)");
    expect(md).toContain("The table shows 2 of 6 groups.");
    expect(md).toContain("| 2 | select+portfolio | 0 | 0.700 | select+portfolio |");
    expect(md).not.toContain("| 3 | maxrects-bl+shared-all |");
    expect(md).toContain("| Inputs | Rule | Cap | maxrects-bl | rows | select |");
    expect(md).toContain("| all (6) | all | 1.25 | 3 | 5 | 1 |");
    expect(reportMarkdown(report)).toContain("The table shows 6 of 6 groups.");
  });
});

describe("the oracle without a pack entry, and the removal of a pack entry", () => {
  it("gives the oracle without the pairs of select next to the oracle with them", () => {
    const report = analyze(records(), inputs, { resamples: 100, without: ["select"] });
    for (const c of report.cells) {
      expect(c.without!.packs).toEqual(["select"]);
      expect(c.without!.score).toBeCloseTo(c.oracle.score, 12);
      expect(c.without!.differ).toBe(0);
      expect(c.without!.gain.mean).toBeCloseTo(0, 12);
    }
    expect(reportMarkdown(report)).toContain("### The oracle without select");
  });

  it("counts the inputs where the oracle needs the pairs of an entry", () => {
    const report = analyze(records(), inputs, { resamples: 100, without: ["maxrects-bl", "select"] });
    const cell = report.cells.find((c) => c.rule === "all" && c.cap === 1.25)!;
    // Without maxrects-bl and select, only the pairs of rows stay on q. They have a hard break, but they are the floor, with the fill 0.5.
    expect(cell.without!.differ).toBe(3);
    expect(cell.without!.gain.mean).toBeCloseTo((3 * (0.7 - 0.5)) / 6, 9);
  });

  it("removes the records of an entry before the analysis", () => {
    const report = analyze(records(), inputs, { resamples: 100, excludePacks: ["select"] });
    expect(report.pairs).toBe(4);
    expect(report.excluded).toEqual(["select"]);
    const full = analyze(records(), inputs, { resamples: 100 });
    for (const [i, c] of report.cells.entries()) expect(c.oracle.score).toBeCloseTo(full.cells[i]!.oracle.score, 12);
    expect(reportMarkdown(report)).toContain("The analysis ignores the records of the pack entries select.");
  });

  it("refuses an entry that the records do not have", () => {
    expect(() => analyze(records(), inputs, { resamples: 50, excludePacks: ["none"] })).toThrow(RangeError);
    expect(() => analyze(records(), inputs, { resamples: 50, without: ["none"] })).toThrow(RangeError);
    expect(() => analyze(records(), inputs, { resamples: 50, excludePacks: ["select"], baseline: "select+portfolio" })).toThrow(RangeError);
  });
});

describe("two baselines and the pairwise comparison", () => {
  const report = analyze(records(), inputs, {
    resamples: 200,
    baseline: ["rows+portfolio", "select+portfolio"],
    compare: [["select+portfolio", "rows+portfolio"]],
  });
  const cell = report.cells.find((c) => c.rule === "all" && c.cap === 1.25)!;

  it("gives each baseline, and keeps the first in the field baseline", () => {
    expect(cell.baselines!.map((b) => b.pair)).toEqual(["rows+portfolio", "select+portfolio"]);
    expect(cell.baseline).toEqual(cell.baselines![0]);
    expect(cell.baselines![0]!.misses).toBe(3);
    expect(cell.baselines![1]!.misses).toBe(0);
    expect(cell.baselines![1]!.score).toBeCloseTo(0.7, 9);
  });

  it("compares two pairs: the misses, the scores and the gain with its interval", () => {
    const c = cell.compare![0]!;
    expect(c).toMatchObject({ a: "select+portfolio", b: "rows+portfolio", missesA: 0, missesB: 3, onlyA: 3, onlyB: 0 });
    expect(c.onlyAInputs).toHaveLength(3);
    expect(c.onlyBInputs).toEqual([]);
    expect(c.scoreA).toBeCloseTo(0.7, 9);
    expect(c.scoreB).toBeCloseTo(0.375, 9);
    expect(c.gain.mean).toBeCloseTo(0.325, 9);
    // The pairs are the same on p and differ by 0.65 on q. A sample of 2 specs can draw p twice or q twice.
    expect(c.gain.lo).toBeCloseTo(0, 9);
    expect(c.gain.hi).toBeCloseTo(0.65, 9);
  });

  it("writes a table for each baseline and the table of the comparisons", () => {
    const md = reportMarkdown(report);
    expect(md).toContain("### The baseline rows+portfolio");
    expect(md).toContain("### The baseline select+portfolio");
    expect(md).toContain("### The pairwise comparisons");
    expect(md).toContain("| all (6) | all | 1.25 | select+portfolio | rows+portfolio | 0 | 3 | -3 | 0.700 | 0.375 | 0.325 [");
  });

  it("refuses a comparison with a pair that the records do not have", () => {
    expect(() => analyze(records(), inputs, { resamples: 50, compare: [["select+portfolio", "none+portfolio"]] })).toThrow(RangeError);
  });
});

describe("the check of a composite pack entry", () => {
  it("finds each record of select equal to the record of its member", () => {
    const c = analyze(records(), inputs, { resamples: 50, composite: { pack: "select", members } }).composite!;
    expect(c.records).toBe(12);
    expect(c.skipped).toEqual({});
    expect(c.members).toEqual([
      { member: "maxrects-bl", inputs: 3, records: 6, skipped: 0, same: 6, differ: 0, missing: 0 },
      { member: "rows", inputs: 3, records: 6, skipped: 0, same: 6, differ: 0, missing: 0 },
    ]);
    expect(c.matches).toEqual({ "maxrects-bl": 3, rows: 3 });
    expect(c.bad).toEqual([]);
  });

  it("counts the skipped records, the records that differ and the records without a member", () => {
    const list = records().map((r) => {
      if (r.input === "p/s1" && r.strategy === "select+portfolio") return rec(r.input, r.strategy, {}, { skipped: "error: no" });
      if (r.input === "q/s2" && r.strategy === "select+shared-all") return { ...r, outputHash: "other" };
      return r;
    });
    const c = compositeCheck(list, inputs, "select", { ...members, "q/s3": "shelf" });
    expect(c.skipped).toEqual({ "error: no": 1 });
    expect(c.members).toEqual([
      { member: "maxrects-bl", inputs: 2, records: 4, skipped: 0, same: 3, differ: 1, missing: 0 },
      { member: "rows", inputs: 3, records: 6, skipped: 1, same: 5, differ: 0, missing: 0 },
      { member: "shelf", inputs: 1, records: 2, skipped: 0, same: 0, differ: 0, missing: 2 },
    ]);
    expect(c.bad).toEqual(["q/s2", "q/s3"]);
    expect(c.matches).toEqual({ "maxrects-bl": 2, rows: 3 });
    const md = reportMarkdown(analyze(list, inputs, { resamples: 50, composite: { pack: "select", members } }));
    expect(md).toContain("### The check of the pack entry select");
    expect(md).toContain("Skipped: 1 (error: no).");
    expect(md).toContain("| maxrects-bl | 3 | 6 | 0 | 5 | 1 | 0 |");
  });

  it("gives the member of the table of select on each input of joint-v2", () => {
    const { manifest, inputs: files } = jointCorpus(SET_V2);
    const count = (stress: boolean | undefined): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const [i, f] of files.entries()) {
        if (stress !== undefined && (manifest.inputs[i]!.stress === true) !== stress) continue;
        const m = selectMemberOf(f);
        out[m] = (out[m] ?? 0) + 1;
      }
      return out;
    };
    expect(count(undefined)).toEqual({ rows: 216, "maxrects-bl": 87 });
    expect(count(false)).toEqual({ rows: 159, "maxrects-bl": 63 });
    expect(count(true)).toEqual({ rows: 57, "maxrects-bl": 24 });
  });
});

describe("the route times and the shard times", () => {
  it("gives the median and the maximum route.ms of each router on each seed, with shared-all first", () => {
    const [p] = routeTimes(records(), inputs, ["p"]);
    expect(p!.seeds.map((s) => s.seed)).toEqual([1, 2, 3]);
    expect(p!.seeds[0]!.routers).toEqual([
      { router: "shared-all", records: 3, median: 1000, max: 3000 },
      { router: "portfolio", records: 3, median: 1000, max: 3000 },
    ]);
    const report = analyze(records(), inputs, { resamples: 50, times: ["p", "x"] });
    const md = reportMarkdown(report);
    expect(md).toContain("### The route times of p");
    expect(md).toContain("| shared-all | 1.0 | 3.0 | 1.0 | 3.0 | 1.0 | 3.0 |");
    expect(md).toContain("The analysis has no input of this spec.");
  });

  it("gives the time of each shard job and the verdict of the limit", () => {
    const step = (start: string, end: string) => [{ name: "Set up job", startedAt: start, completedAt: start }, { name: "Run one shard", startedAt: start, completedAt: end }];
    const jobs = [
      { name: "run (0)", conclusion: "success", startedAt: "2026-10-28T10:00:00Z", completedAt: "2026-10-28T10:32:00Z", steps: step("2026-10-28T10:01:00Z", "2026-10-28T10:31:00Z") },
      { name: "run (1)", conclusion: "success", startedAt: "2026-10-28T10:00:00Z", completedAt: "2026-10-28T11:03:00Z", steps: step("2026-10-28T10:01:00Z", "2026-10-28T11:02:00Z") },
      { name: "analyze", conclusion: "success", startedAt: "2026-10-28T11:03:00Z", completedAt: "2026-10-28T11:05:00Z" },
    ];
    const t = shardTimes(jobs);
    expect(t.shards.map((s) => s.shard)).toEqual([1, 0]);
    expect(t.shards[0]!.step).toBeCloseTo(61, 9);
    expect(t.shards[1]!.job).toBeCloseTo(32, 9);
    expect(t).toMatchObject({ limit: 60, max: 61, over: 1, held: false });
    expect(shardTimes(jobs.slice(0, 1)).held).toBe(true);
    expect(shardTimes([{ ...jobs[0]!, conclusion: "cancelled" }]).held).toBe(false);
    // In a call from ci.yml, the names of the shard jobs have the prefix of the calling job. Another prefix does not count.
    const called = jobs.map((j) => ({ ...j, name: `joint-bench / ${j.name}` }));
    expect(shardTimes(called).shards.map((s) => s.shard)).toEqual([1, 0]);
    expect(shardTimes(jobs.map((j) => ({ ...j, name: `other / ${j.name}` }))).shards).toEqual([]);
    const md = reportMarkdown(analyze(records(), inputs, { resamples: 50, jobs }));
    expect(md).toContain("### The shard times");
    expect(md).toContain("The longest step `Run one shard` took 61.0 minutes. Shards at 60 minutes or more, or without a step time: 1. Held: no.");
    expect(md).toContain("| 1 | success | 61.0 | 63.0 |");
  });
});
