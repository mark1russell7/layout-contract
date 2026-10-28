import { checkSpace, spaceSize, type StrategySpace } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkDataFile, checkJoint, checkNews, checkSpaceFile, latestJoint, type JointData, type SpaceFile } from "./data.ts";
import { HEADLINE, jointData } from "./joint-data.ts";

const raw = import.meta.glob<string>("../data/**/*.json", { eager: true, query: "?raw", import: "default" });
const files = Object.entries(raw).map(([path, text]) => [path.replace("../data/", ""), text] as const);
const joints = files.filter(([p]) => p.startsWith("joint/")).map(([, t]) => JSON.parse(t) as JointData);

describe("the data files", () => {
  it("has a joint result, a space and the news", () => {
    expect(joints.length).toBeGreaterThan(0);
    expect(files.some(([p]) => p.startsWith("examples/") || p.startsWith("spaces/"))).toBe(true);
    expect(files.some(([p]) => p === "news.json")).toBe(true);
  });

  it.each(files)("data/%s passes its check", (path, text) => {
    expect(checkDataFile(path, text)).toEqual([]);
  });

  it("keeps each joint file under 200 KB", () => {
    for (const [path, text] of files) if (path.startsWith("joint/")) expect(text.length).toBeLessThan(200 * 1024);
  });

  it("gives each space to checkSpace with no break", () => {
    for (const [path, text] of files) {
      if (!path.startsWith("examples/") && !path.startsWith("spaces/")) continue;
      const space = (JSON.parse(text) as SpaceFile).space as StrategySpace;
      expect(checkSpace(space), path).toEqual([]);
      expect(spaceSize(space, { levels: 3 }).base > 0n).toBe(true);
    }
  });

  it("gives the best pair of the headline as the first router and the first packer", () => {
    for (const d of joints) {
      const pair = d.headline.cell.best.pair;
      expect(d.headline.ranking[0]?.group).toBe(pair);
      expect(d.headline.byRouter[0]?.pair).toBe(pair);
      expect(d.headline.byPacker[0]?.pair).toBe(pair);
      expect(d.cells.some((c) => c.rule === HEADLINE.rule && c.cap === HEADLINE.cap)).toBe(true);
    }
  });
});

describe("the checks", () => {
  const good = JSON.parse(files.find(([p]) => p.startsWith("joint/"))![1]) as Record<string, unknown>;

  it("refuses a file that is not JSON", () => {
    expect(checkDataFile("news.json", "{ not json")[0]).toMatch(/not valid JSON/);
  });

  it("refuses a joint file with a missing field or a wrong name", () => {
    const { headline: _headline, ...rest } = good;
    expect(checkJoint(rest).some((p) => p.includes("joint.headline"))).toBe(true);
    expect(checkJoint({ ...good, date: "28 October" }).some((p) => p.includes("joint.date"))).toBe(true);
    expect(checkDataFile("joint/1.json", JSON.stringify(good)).some((p) => p.includes("file name"))).toBe(true);
  });

  it("refuses news out of order and a bad PR number", () => {
    const item = { date: "2026-10-01", item: "L1", title: "t", summary: "s", prs: [1] };
    expect(checkNews({ schema: "site-news/1", items: [item, { ...item, date: "2026-10-02" }] }).length).toBe(1);
    expect(checkNews({ schema: "site-news/1", items: [{ ...item, prs: [0] }] }).length).toBe(1);
  });

  it("refuses a space file without a space", () => {
    expect(checkSpaceFile({ schema: "site-space/1", source: "x", date: "2026-10-28" })).toEqual(["space file.space is not an object"]);
  });

  it("refuses an unknown data path", () => {
    expect(checkDataFile("other/x.json", "{}")).toEqual(["the path other/x.json is not a known data file"]);
  });
});

describe("jointData", () => {
  const cell = (rule: string, cap: number, misses: number) => ({
    rule,
    cap,
    best: { pair: "a+r1", members: ["a+r1"], misses, score: 0.5 },
    oracle: { score: 0.7, gain: { mean: 0.2, lo: 0.1, hi: 0.3, open: false, n: 3 }, wins: 2 },
    portfolios: [{ k: 3, share: { mean: 0.8, lo: 0.7, hi: 0.9, open: false, n: 3 } }],
    ranking: [
      { rank: 1, group: "a+r1", members: ["a+r1"], misses, score: 0.5 },
      { rank: 2, group: "b+r1", members: ["b+r1", "b+r2"], misses: misses + 1, score: 0.123456 },
    ],
    baselines: [],
    compare: [],
  });
  const report = { inputs: 3, records: 12, pairs: 4, cells: [cell("all", 1.25, 1)], stress: { inputs: 2, cells: [cell("all", 1.25, 2)] }, predictions: [] };
  const facts = { run: "7", date: "2026-10-28", item: "L0", corpus: "c", versions: { packing: "1.0.0" } };

  it("makes a file that passes checkJoint, with the best pair of each part", () => {
    const d = jointData(report, facts);
    expect(checkJoint(d)).toEqual([]);
    expect(d.headline.byRouter.map((b) => [b.id, b.misses])).toEqual([
      ["r1", 1],
      ["r2", 2],
    ]);
    expect(d.headline.byPacker.map((b) => b.id)).toEqual(["a", "b"]);
    expect(d.headline.ranking[1]?.score).toBe(0.1235);
    expect(d.stress.inputs).toBe(2);
  });

  it("throws when the report has no headline cell", () => {
    expect(() => jointData({ ...report, cells: [cell("collection", 1.5, 1)] }, facts)).toThrow(/no cell/);
  });

  it("picks the latest result by date, and then by run", () => {
    const a = jointData(report, facts);
    const b = { ...a, run: "10" };
    const c = { ...a, run: "99", date: "2026-10-01" };
    expect(latestJoint([a, b, c])?.run).toBe("10");
  });
});
