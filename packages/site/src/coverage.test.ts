import { describe, expect, it } from "vitest";
import { addDays, checkSweepIndex, checkTrendRecord, FLAT_WEEK, mainLine, parseTrend, type TrendRecord, weekView } from "./coverage.ts";
import { type Fetch, guardChart, loadSweep, nightNote, runUrl, skillChart, stepNote, SWEEP_RAW, sweepHtml, trendFileUrl } from "./sweep.ts";

const EPOCH = "joint-v2_packing-0.4.1_highways-0.10.0_space-bench-3";
// The first record of the branch `sweep-data`, as the nightly sweep wrote it.
const FIRST =
  '{"schema":"surrogate-trend/1","epoch":"joint-v2_packing-0.4.1_highways-0.10.0_space-bench-3","night":"2026-11-03","variant":"blocks","run":"41573500756","foldBy":"input","rows":8721,"configs":35,"skill":{"q10":-0.4858381183247665,"median":0.1091673779878829,"q90":0.4379401031847171},"inSampleSkill":{"q10":-0.27320447270642045,"median":0.19244943113745916,"q90":0.47591579372396925},"covered":130,"share":0.6190476190476191,"withRows":210,"eligible":139,"lambda":10,"lambdaAtEdge":false}';
const base = JSON.parse(FIRST) as TrendRecord;
const rec = (night: string, median: number | null, more: Partial<TrendRecord> = {}): TrendRecord => ({
  ...base,
  night,
  skill: median === null ? null : { q10: median - 0.5, median, q90: median + 0.3 },
  ...more,
});
const INDEX = {
  schema: "sweep-index/1",
  epochs: { [EPOCH]: { corpus: "joint-v2", nights: 3, last: "2026-11-03", configs: 219, counts: {} } },
  latest: EPOCH,
};

describe("the trend records", () => {
  it("reads the first record of the branch", () => {
    const file = parseTrend(`${FIRST}\n`);
    expect(file.bad).toBe(0);
    expect(file.records).toHaveLength(1);
    expect(file.records[0]!.skill!.median).toBeCloseTo(0.1092, 4);
  });

  it("skips the empty lines, and counts the bad JSON and the bad records", () => {
    const noSchema = FIRST.replace("surrogate-trend/1", "surrogate-trend/0");
    const badShare = FIRST.replace('"share":0.6190476190476191', '"share":1.5');
    const file = parseTrend(`\n${FIRST}\r\n{broken\n${noSchema}\n${badShare}\n  \n`);
    expect(file.records).toHaveLength(1);
    expect(file.bad).toBe(3);
  });

  it("takes a null skill, and names each bad field", () => {
    expect(checkTrendRecord({ ...base, skill: null })).toEqual([]);
    expect(checkTrendRecord({ ...base, night: "Nov 3", rows: -1, lambdaAtEdge: "no", skill: { q10: 0, median: "x", q90: 1 } })).toEqual([
      "night is not a date YYYY-MM-DD",
      "rows is not a count",
      "lambdaAtEdge is not a boolean",
      "skill.median is not a finite number",
    ]);
    expect(checkTrendRecord([])).toEqual(["the line is not an object"]);
  });

  it("keeps the variant blocks in night order, with the later record of a night", () => {
    const again = rec("2026-11-03", 0.2);
    const line = mainLine([rec("2026-11-03", 0.1), rec("2026-11-01", 0.05), rec("2026-11-02", 0.3, { variant: "pairs" }), again]);
    expect(line.map((r) => r.night)).toEqual(["2026-11-01", "2026-11-03"]);
    expect(line[1]).toBe(again);
  });
});

describe("the week view", () => {
  it("has no view without records, and a note with one record", () => {
    expect(weekView([]).kind).toBe("none");
    expect(weekView([base]).kind).toBe("one");
  });

  it("waits for a record of at least 7 days before the latest", () => {
    const view = weekView([rec("2026-11-03", 0.1), rec("2026-11-09", 0.2)]);
    expect(view).toMatchObject({ kind: "young", nights: 2, startsOn: "2026-11-10" });
  });

  it("compares with the newest record of at least 7 days before", () => {
    const view = weekView([rec("2026-11-01", 0.0), rec("2026-11-03", 0.1), rec("2026-11-05", 0.3), rec("2026-11-10", 0.105)]);
    expect(view.kind).toBe("flat");
    if (view.kind !== "flat") return;
    expect(view.prior.night).toBe("2026-11-03");
    expect(view.change).toBeCloseTo(0.005, 9);
  });

  it("tells a flat, a rising and a falling week by the threshold", () => {
    expect(FLAT_WEEK).toBe(0.01);
    const kind = (change: number) => weekView([rec("2026-11-03", 0.1), rec("2026-11-10", 0.1 + change)]).kind;
    expect(kind(0.0099)).toBe("flat");
    expect(kind(-0.0099)).toBe("flat");
    expect(kind(0.0101)).toBe("rising");
    expect(kind(-0.0101)).toBe("falling");
  });

  it("gives no change when a skill is null", () => {
    expect(weekView([rec("2026-11-03", null), rec("2026-11-10", 0.1)]).kind).toBe("no-skill");
  });

  it("adds days across a month", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
  });
});

describe("the index of sweep-data", () => {
  it("gives the latest epoch and its entry", () => {
    expect(checkSweepIndex(INDEX)).toEqual({ latest: EPOCH, entry: { corpus: "joint-v2", nights: 3, last: "2026-11-03", configs: 219, missing: null, step: null } });
  });

  it("gives the problems of a bad index", () => {
    expect(checkSweepIndex({ ...INDEX, schema: "x" })).toEqual(["schema is not sweep-index/1"]);
    expect(checkSweepIndex({ ...INDEX, latest: "other" })).toEqual(["epochs has no entry for other"]);
  });
});

const fake =
  (files: Record<string, string | number>): Fetch =>
  async (url) => {
    const v = files[url];
    if (v === undefined || typeof v === "number") return { ok: false, status: typeof v === "number" ? v : 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => v };
  };
const trendPath = `${SWEEP_RAW}/epochs/${EPOCH}/surrogate-trend.jsonl`;

describe("the section", () => {
  it("reads the index and the trend file, and shows one night", async () => {
    const state = await loadSweep(fake({ [`${SWEEP_RAW}/index.json`]: JSON.stringify(INDEX), [trendPath]: `${FIRST}\n` }));
    expect(state.kind).toBe("ready");
    const html = sweepHtml(state, 400);
    expect(html).toContain("One night so far. The trend starts with the next night.");
    expect(html).toContain(trendFileUrl(EPOCH));
    expect(html).toContain(`https://github.com/mark1russell7/layout-contract/blob/sweep-data/epochs/${EPOCH}/surrogate-trend.jsonl`);
    expect(html).toContain(runUrl("41573500756"));
    expect(html).toContain("2026-11-03");
    expect(html).toContain("0.109");
    expect(html).toContain("62%");
    expect(html).toContain("8,721");
    expect(html).not.toContain("at the edge");
  });

  it("marks a lambda at the edge, and a flat week", () => {
    const line = [rec("2026-11-03", 0.1), rec("2026-11-10", 0.104, { lambdaAtEdge: true, lambda: 10000 })];
    const html = sweepHtml({ kind: "ready", index: { latest: EPOCH, entry: { corpus: "joint-v2", nights: 8, last: "2026-11-10", configs: 9, missing: null, step: null } }, line, bad: 1, week: weekView(line) }, 500);
    expect(html).toContain("at the edge");
    expect(html).toContain("Flat week: a finding to explain.");
    expect(html).toContain("+0.004");
    expect(html).toContain("1 line of the file did not pass the check");
  });

  it("shows the failure with a link to the data", async () => {
    const state = await loadSweep(fake({ [`${SWEEP_RAW}/index.json`]: 500 }));
    expect(state).toEqual({ kind: "failed", message: "index.json gave HTTP 500" });
    expect(sweepHtml(state)).toContain("https://github.com/mark1russell7/layout-contract/tree/sweep-data");
    const thrown = await loadSweep(async () => Promise.reject(new Error("offline")));
    expect(thrown).toEqual({ kind: "failed", message: "offline" });
  });

  it("shows an epoch with no trend file yet", async () => {
    const state = await loadSweep(fake({ [`${SWEEP_RAW}/index.json`]: JSON.stringify(INDEX) }));
    expect(state).toMatchObject({ kind: "ready", line: [], week: { kind: "none" } });
    expect(sweepHtml(state)).toContain("no trend record yet");
  });

  it("shows the loading state", () => {
    expect(sweepHtml({ kind: "loading" })).toContain("Loading");
  });

  it("draws the charts inside their width, with a hover note for each night", () => {
    const line = [rec("2026-11-03", 0.1), rec("2026-11-04", null), rec("2026-11-05", 0.12), rec("2026-11-12", 0.15)];
    for (const svg of [skillChart(line, 330), guardChart(line, 330)]) {
      expect(svg).toContain('width="330"');
      expect(svg.match(/<title>/g)).toHaveLength(4);
      for (const [, x] of svg.matchAll(/ (?:x|cx|x1|x2)="(-?[\d.]+)"/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(-10);
        expect(Number(x)).toBeLessThanOrEqual(330);
      }
    }
    // The null skill splits the band into a bar for one night and a polygon for two nights.
    expect(skillChart(line, 330)).toMatch(/<rect class="band"/);
    expect(skillChart(line, 330)).toMatch(/<polygon class="band"/);
  });
});

describe("the step between two epochs", () => {
  const step = {
    from: "old-epoch",
    to: EPOCH,
    pairs: 909,
    dropped: { space: 0, input: 0, hash: 3, config: 0, missing: 0 },
    metrics: {
      "joint.fill": { n: 909, median: 1.002, q10: 1, q90: 1.01 },
      hard: { n: 909, median: 1, q10: 1, q90: 1 },
      "joint.straight.crossings": { n: 909, median: 0.98, q10: 0.9, q90: 1 },
    },
  };

  it("reads the step of the index, and gives null for a step with no metrics", () => {
    const entry = { corpus: "joint-v2", nights: 1, last: "2026-11-05", configs: 9, step };
    const read = checkSweepIndex({ schema: "sweep-index/1", latest: EPOCH, epochs: { [EPOCH]: entry } });
    expect(read).toMatchObject({ entry: { step: { from: "old-epoch", pairs: 909, dropped: 3, fill: 1.002, hard: 1, crossings: 0.98 } } });
    const bad = checkSweepIndex({ schema: "sweep-index/1", latest: EPOCH, epochs: { [EPOCH]: { ...entry, step: { ...step, metrics: {} } } } });
    expect(bad).toMatchObject({ entry: { step: null } });
  });

  it("states the ratios and the dropped pairs, or that no pair passed", () => {
    const facts = { from: "old-epoch", pairs: 909, dropped: 3, fill: 1.002, hard: 1, crossings: 0.98, routes: [] };
    expect(stepNote(facts)).toContain("fill ×1.002, hard constraints ×1.000 and crossings ×0.980, over 909 pairs, with 3 dropped");
    expect(stepNote({ ...facts, pairs: 0 })).toContain("no pair passed the rule");
    expect(stepNote(null)).toBe("");
  });

  it("reads the route values of a step, and leaves out a value in a bad form", () => {
    const routes = {
      "route.detour.mean": { ratio: { n: 900, median: 1.01, q10: 1, q90: 1.1 }, noOld: 9, noNew: 0, oldZero: 0, mixed: 0 },
      "route.detour.q95": { ratio: null, noOld: 909, noNew: 0, oldZero: 0, mixed: 0 },
      "route.crossings": { ratio: { n: 800 }, noOld: 0 },
    };
    const entry = { corpus: "joint-v2", nights: 1, last: "2026-11-05", configs: 9, step: { ...step, routes } };
    const read = checkSweepIndex({ schema: "sweep-index/1", latest: EPOCH, epochs: { [EPOCH]: entry } });
    expect(read).toMatchObject({
      entry: {
        step: {
          routes: [
            { label: "mean detour", median: 1.01, n: 900, noOld: 9 },
            { label: "q95 detour", median: null, n: 0, noOld: 909 },
          ],
        },
      },
    });
  });

  it("reads a step from before the route values as a step with none", () => {
    const entry = { corpus: "joint-v2", nights: 1, last: "2026-11-05", configs: 9, step };
    expect(checkSweepIndex({ schema: "sweep-index/1", latest: EPOCH, epochs: { [EPOCH]: entry } })).toMatchObject({ entry: { step: { routes: [] } } });
  });

  it("states the route values with their limits, and no old value is no pass", () => {
    const facts = { from: "old-epoch", pairs: 909, dropped: 3, fill: 1.002, hard: 1, crossings: 0.98 };
    const route = { label: "mean detour", median: 1.01, n: 900, noOld: 9, noNew: 0, oldZero: 0, mixed: 0 };
    const shown = stepNote({ ...facts, routes: [route] });
    expect(shown).toContain("mean detour ×1.010 over 900 pairs, 9 with no old value");
    expect(shown).toContain("a move in a detour alone is no change of a router");
    expect(shown).toContain("that count alone is no win");
    const none = stepNote({ ...facts, routes: [{ ...route, median: null, n: 0, noOld: 909 }] });
    expect(none).toContain("mean detour: no ratio (909 with no old value)");
    expect(none).toContain("The step reads routes only by violation and cap counts.");
    expect(none).not.toContain("mean detour ×");
    const old = stepNote({ ...facts, routes: [] });
    expect(old).toContain("This step has no route values. The step reads routes only by violation and cap counts.");
  });

  it("marks the step on the chart and stops the line there", () => {
    const line = [rec("2026-11-02", 0.1), rec("2026-11-03", 0.12), rec("2026-11-05", 0.2), rec("2026-11-06", 0.21)];
    const held = (html: string): string => /<path class="line s1" d="([^"]+)"/.exec(html)![1]!;
    const marked = skillChart(line, 640, 2);
    expect(marked).toContain("epoch-step");
    expect(held(marked).match(/M/g)).toHaveLength(2);
    expect(held(skillChart(line, 640)).match(/M/g)).toHaveLength(1);
  });
});

describe("the line of the last night", () => {
  const index = (last: string, missing: number | null) => ({ latest: EPOCH, entry: { corpus: "joint-v2", nights: 3, last, configs: 9, missing, step: null } });

  it("states the date of a night on time", () => {
    const html = nightNote(index("2026-11-03", 0), new Date("2026-11-04T10:00:00Z"));
    expect(html).toContain("On time");
    expect(html).toContain("Nov 3");
  });

  it("shows a late night after the hour of the rule, with a link to the runs", () => {
    const html = nightNote(index("2026-11-03", 0), new Date("2026-11-04T17:00:00Z"));
    expect(html).toContain("Late");
    expect(html).toContain("1 night has no result.");
    expect(html).toContain("actions/workflows/sweep.yml");
  });

  it("shows a partial night with its count", () => {
    const html = nightNote(index("2026-11-03", 541), new Date("2026-11-04T10:00:00Z"));
    expect(html).toContain("Partial");
    expect(html).toContain("541 jobs");
  });

  it("is part of the section at the time of the call", async () => {
    const state = await loadSweep(fake({ [`${SWEEP_RAW}/index.json`]: JSON.stringify(INDEX), [trendPath]: `${FIRST}\n` }));
    expect(sweepHtml(state, 400, new Date("2030-01-01T00:00:00Z"))).toContain("Late");
  });
});
