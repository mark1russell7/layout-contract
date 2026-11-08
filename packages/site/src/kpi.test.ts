import { readdirSync, readFileSync } from "node:fs";
import { spaceSize, STRATEGY_SPACE_SCHEMA, type StrategySpace } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { latestFull, shownAge, shownRuns, type JointData } from "./data.ts";
import { COUNT_SOURCES_SCHEMA, countOverRuns, countSources, coverageRun, coverageRuns, enginesCurrent, enginesOnNpm, failedReadStops, type KpiCatalog, type NpmRead, packersMeasured, routersOnCompare, siteKpiInput, SPACE_LEVELS, type SpaceFile, spaceConfigMeasures } from "./kpi.ts";

/** A run of the fixture. Its id comes from its date, and its rankings have one group for each pair of a packer and a router. */
const run = (date: string, pairs: number, versions: Record<string, string>, packers: readonly string[] = ["shelf", "rows"], routers: readonly string[] = ["corners", "trunks"]): JointData => {
  const ranking = packers.flatMap((p) => routers.map((r) => ({ members: [`${p}+${r}`] })));
  return { run: date.replaceAll("-", ""), date, pairs, versions, headline: { ranking }, stress: { ranking, byPacker: packers.map((id) => ({ id })), byRouter: routers.map((id) => ({ id })) } } as unknown as JointData;
};

/** A short run of the fixture: it has the flag `short` (L132). */
const shortOf = (data: JointData): JointData => ({ ...data, short: true });

/** A cover run of the fixture: it has the flag `cover`. */
const coverOf = (data: JointData): JointData => ({ ...data, cover: true });

const catalog: KpiCatalog = { about: { packing: { shelf: "a", rows: "b", anneal: "c", skyline: "d" }, highways: {} } };

/** The router and highway entries of a registry of `highways`. */
const keyed = ["corners", "trunks", "steiner"];

const commitAt = "2026-11-04T12:00:00Z";

const npm: NpmRead = {
  at: "2026-11-05T05:40:00Z",
  engines: [
    { engine: "highways", used: "0.14.0", latest: "0.14.0", behind: 0 },
    { engine: "packing", used: "0.7.0", latest: "0.8.0", behind: 2 },
  ],
};

const entries = [
  { id: "shelf", strategy: "shelf" },
  { id: "shelf-next", strategy: "shelf" },
  { id: "rows", strategy: "rows" },
  { id: "anneal-maxrects-bl-k16", strategy: "anneal" },
  { id: "gone", strategy: "gone" },
];

describe("enginesOnNpm", () => {
  const times = ["0.6.0", "0.7.0", "0.7.1", "0.10.0", "0.11.0-rc.1"].map((version) => ({ name: "@mark1russell7/packing", version }));

  it("takes the newest stable version in version order, not in text order", () => {
    expect(enginesOnNpm({ packing: "0.7.0" }, times)).toEqual([{ engine: "packing", used: "0.7.0", latest: "0.10.0", behind: 2 }]);
  });

  it("gives no releases behind for the newest version", () => {
    expect(enginesOnNpm({ packing: "0.10.0" }, times)[0]?.behind).toBe(0);
  });

  it("does not read the versions of another package", () => {
    expect(() => enginesOnNpm({ highways: "0.14.0" }, times)).toThrow("npm has no stable version of @mark1russell7/highways");
  });
});

describe("failedReadStops", () => {
  const withRead = JSON.stringify({ measures: [{ id: "pairs-in-run" }, { id: "engines-current" }] });
  const withNoRead = JSON.stringify({ measures: [{ id: "pairs-in-run" }] });

  it("stops a scheduled build when the last deploy also has no read of npm", () => {
    expect(failedReadStops("schedule", withNoRead)).toBe(true);
  });

  it("passes the first failed read in a row", () => {
    expect(failedReadStops("schedule", withRead)).toBe(false);
  });

  it("passes a build that no schedule started", () => {
    expect(failedReadStops("push", withNoRead)).toBe(false);
    expect(failedReadStops(undefined, withNoRead)).toBe(false);
  });

  it("passes when the last file tells nothing", () => {
    expect(failedReadStops("schedule", undefined)).toBe(false);
    expect(failedReadStops("schedule", "<html>")).toBe(false);
    expect(failedReadStops("schedule", "{}")).toBe(false);
  });
});

describe("enginesCurrent", () => {
  it("counts only the engines with the newest version on npm", () => {
    expect(enginesCurrent(npm.engines)).toBe(1);
  });

  it("does not count a run on a prerelease as the newest stable version", () => {
    expect(enginesCurrent([{ engine: "packing", used: "0.9.0-rc.1", latest: "0.8.0", behind: 0 }])).toBe(0);
  });
});

describe("packersMeasured", () => {
  it("counts a strategy one time, for each of its entries", () => {
    expect(packersMeasured(run("2026-10-28", 130, {}, ["shelf", "shelf-next", "rows"]), catalog, entries)).toBe(2);
  });

  it("counts a strategy from an entry that has other options", () => {
    expect(packersMeasured(run("2026-10-28", 130, {}, ["anneal-maxrects-bl-k16"]), catalog, entries)).toBe(1);
  });

  it("does not count a strategy with no result in the run", () => {
    expect(packersMeasured(run("2026-10-28", 130, {}, []), catalog, entries)).toBe(0);
  });

  it("does not count a strategy that is not in the catalog", () => {
    expect(packersMeasured(run("2026-10-28", 130, {}, ["gone"]), catalog, entries)).toBe(0);
  });
});

describe("siteKpiInput", () => {
  it("gives no input without a run, because the time of the data is not known", () => {
    expect(siteKpiInput([], catalog, npm, entries, commitAt, keyed)).toBeUndefined();
  });

  it("takes the time of the data from the latest run, not from the build", () => {
    const input = siteKpiInput([run("2026-10-20", 90, {}), run("2026-10-28", 130, {})], catalog, npm, entries, commitAt, keyed);
    expect(input?.at).toBe("2026-10-28T00:00:00Z");
    expect(input?.measures.find((m) => m.id === "pairs-in-run")?.value).toBe(130);
  });

  it("gives each measure the time of its own data, so an old run does not age the measures of the build", () => {
    const input = siteKpiInput([run("2026-10-28", 130, {})], catalog, npm, entries, commitAt, keyed);
    expect(Object.fromEntries(input?.measures.map((m) => [m.id, m.at]) ?? [])).toEqual({
      "pairs-in-run": "2026-10-28T00:00:00Z",
      "pairs-shown": "2026-10-28T00:00:00Z",
      "packers-measured": "2026-10-28T00:00:00Z",
      "routers-on-compare": "2026-10-28T00:00:00Z",
      "routers-keyed": commitAt,
      "engines-current": npm.at,
      "engine-releases-behind-highways": npm.at,
      "engine-releases-behind-packing": npm.at,
    });
  });

  it("counts the releases behind for each engine", () => {
    const input = siteKpiInput([run("2026-10-28", 130, {})], catalog, npm, entries, commitAt, keyed);
    expect(input?.measures.find((m) => m.id === "engines-current")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "engine-releases-behind-packing")?.value).toBe(2);
  });

  it("leaves out each measure that reads npm when the read failed", () => {
    const input = siteKpiInput([run("2026-10-28", 130, {})], catalog, undefined, entries, commitAt, keyed);
    expect(input?.measures.map((m) => m.id)).toEqual(["pairs-in-run", "pairs-shown", "packers-measured", "routers-on-compare", "routers-keyed"]);
  });

  it("gives coverage-shown 1 only when the page shows a week view, with the date of the latest night (L52)", () => {
    const measure = (shown: boolean) => siteKpiInput([run("2026-10-28", 130, {})], catalog, undefined, entries, commitAt, keyed, { shown, night: "2026-11-10" })?.measures.find((m) => m.id === "coverage-shown");
    expect(measure(true)).toEqual({ id: "coverage-shown", value: 1, at: "2026-11-10T00:00:00Z" });
    expect(measure(false)).toMatchObject({ value: 0 });
    expect(siteKpiInput([run("2026-10-28", 130, {})], catalog, undefined, entries, commitAt, keyed)?.measures.some((m) => m.id === "coverage-shown")).toBe(false);
  });

  it("takes the age from the newest run, and the coverage from the newest cover run with its own date", () => {
    const cover = coverOf(run("2026-11-04", 650, {}, ["shelf", "rows", "anneal-maxrects-bl-k16"], ["corners", "trunks", "steiner"]));
    const input = siteKpiInput([cover, run("2026-11-10", 130, {}, ["shelf"], ["corners"])], catalog, npm, entries, commitAt, keyed);
    expect(input?.at).toBe("2026-11-10T00:00:00Z");
    expect(Object.fromEntries(input?.measures.filter((m) => !m.id.startsWith("engine")).map((m) => [m.id, [m.value, m.at]]) ?? [])).toEqual({
      "pairs-in-run": [650, "2026-11-04T00:00:00Z"],
      "pairs-shown": [1, "2026-11-10T00:00:00Z"],
      "packers-measured": [3, "2026-11-04T00:00:00Z"],
      "routers-on-compare": [3, "2026-11-04T00:00:00Z"],
      "routers-keyed": [3, commitAt],
    });
  });

  it("counts only the strategies of the runs at the engines of the latest run", () => {
    const old = { packing: "0.7.0", highways: "0.14.0" };
    const now = { packing: "0.10.2", highways: "0.15.0" };
    const input = siteKpiInput([run("2026-10-20", 90, old, ["shelf", "rows", "skyline"], ["corners", "trunks", "steiner"]), run("2026-10-28", 130, now, ["shelf"], ["corners"])], catalog, npm, entries, commitAt, keyed);
    expect(input?.measures.find((m) => m.id === "packers-measured")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "routers-on-compare")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "routers-keyed")?.value).toBe(3);
  });
});

describe("coverageRuns and countOverRuns", () => {
  const now = { packing: "0.10.2", highways: "0.15.0" };
  const old = { packing: "0.7.0", highways: "0.14.0" };

  it("adds a run of some pairs at the engines of the cover run, with the date of the oldest part", () => {
    const cover = coverOf(run("2026-11-07", 650, now, ["shelf", "rows"], ["corners", "trunks"]));
    const pairs = shortOf(run("2026-11-08", 30, now, ["anneal-maxrects-bl-k16"], ["steiner"]));
    const input = siteKpiInput([cover, pairs], catalog, npm, entries, commitAt, keyed);
    expect(input?.at).toBe("2026-11-07T00:00:00Z");
    expect(Object.fromEntries(input?.measures.filter((m) => /^(pairs|packers|routers-on)/.test(m.id)).map((m) => [m.id, [m.value, m.at]]) ?? [])).toEqual({
      "pairs-in-run": [650, "2026-11-07T00:00:00Z"],
      "pairs-shown": [5, "2026-11-07T00:00:00Z"],
      "packers-measured": [3, "2026-11-07T00:00:00Z"],
      "routers-on-compare": [3, "2026-11-07T00:00:00Z"],
    });
  });

  it("leaves out a run of other engines, also when it is newer", () => {
    const cover = coverOf(run("2026-11-07", 650, now, ["shelf"]));
    expect(coverageRuns([cover, run("2026-11-01", 130, old, ["rows"]), run("2026-11-09", 130, { ...now, highways: "0.16.0" }, ["anneal-maxrects-bl-k16"])])).toEqual([cover]);
    expect(coverageRuns([])).toEqual([]);
  });

  it("takes the newest run of each name, and the oldest of these dates", () => {
    const names = (r: JointData): string[] => r.stress.byPacker.map((p) => p.id);
    const runs = [run("2026-11-01", 1, now, ["shelf", "rows"]), run("2026-11-05", 1, now, ["shelf"]), run("2026-11-03", 1, now, ["rows", "anneal"])];
    const count = countOverRuns(runs, names, "x");
    expect([count.value, count.at]).toEqual([3, "2026-11-03T00:00:00Z"]);
    expect(count.sources.map((s) => [s.name, s.date])).toEqual([
      ["anneal", "2026-11-03"],
      ["rows", "2026-11-03"],
      ["shelf", "2026-11-05"],
    ]);
    expect(countOverRuns([], names, "2026-11-07T00:00:00Z")).toEqual({ value: 0, at: "2026-11-07T00:00:00Z", sources: [] });
  });
});

describe("the sources of the coverage counts (L140)", () => {
  const now = { packing: "0.10.2", highways: "0.15.0" };
  const cover = { ...coverOf(run("2026-11-07", 650, now, ["shelf", "rows"], ["corners", "trunks"])), corpus: "joint-v2" };
  const pairs = { ...shortOf(run("2026-11-08", 30, now, ["anneal-maxrects-bl-k16"], ["steiner"])), corpus: "joint-v3" };

  it("gives one source for each counted name, and the count does not change", () => {
    const input = siteKpiInput([cover, pairs], catalog, npm, entries, commitAt, keyed);
    const sources = countSources([cover, pairs], catalog, entries, keyed);
    expect(sources.schema).toBe(COUNT_SOURCES_SCHEMA);
    expect(sources.packers.length).toBe(input?.measures.find((m) => m.id === "packers-measured")?.value);
    expect(sources.routers.length).toBe(input?.measures.find((m) => m.id === "routers-on-compare")?.value);
    expect(new Set(sources.packers.map((s) => s.name)).size).toBe(sources.packers.length);
    expect(new Set(sources.routers.map((s) => s.name)).size).toBe(sources.routers.length);
  });

  it("names the run and the corpus of each name, so a join of two corpora shows", () => {
    const sources = countSources([cover, pairs], catalog, entries, keyed);
    expect(sources.packers.map((s) => [s.name, s.run, s.corpus])).toEqual([
      ["anneal", "20261108", "joint-v3"],
      ["rows", "20261107", "joint-v2"],
      ["shelf", "20261107", "joint-v2"],
    ]);
    expect(sources.routers.map((s) => [s.name, s.corpus])).toEqual([
      ["corners", "joint-v2"],
      ["steiner", "joint-v3"],
      ["trunks", "joint-v2"],
    ]);
  });

  it("gives empty lists with no run", () => {
    expect(countSources([], catalog, entries, keyed)).toEqual({ schema: COUNT_SOURCES_SCHEMA, packers: [], routers: [] });
  });
});

describe("short runs and the age of the shown pairs (L132)", () => {
  const full = run("2026-11-04", 650, {}, ["shelf", "rows"], ["corners", "trunks"]);

  it("opens on the newest full run, not on a newer short run", () => {
    const short = shortOf(run("2026-11-08", 12, {}, ["shelf"], ["corners"]));
    expect(latestFull([full, short])).toBe(full);
    expect(latestFull([short])).toBe(short);
    expect(latestFull([])).toBeUndefined();
  });

  it("shows the short runs of the date of the full run or later, and not an older short run", () => {
    const older = shortOf(run("2026-11-01", 12, {}, ["shelf"], ["corners"]));
    const newer = shortOf(run("2026-11-08", 12, {}, ["shelf"], ["corners"]));
    expect(shownRuns([older, full, newer])).toEqual([full, newer]);
  });

  it("refreshes only the pairs of a short run, so the oldest pair keeps the age of the full run", () => {
    const one = shortOf(run("2026-11-08", 2, {}, ["shelf", "exact-strip"], ["corners"]));
    expect(shownAge([full, one])).toEqual({ oldest: "2026-11-04", median: "2026-11-04", pairs: 5 });
    const three = shortOf(run("2026-11-08", 3, {}, ["shelf", "rows"], ["corners"]));
    const four = shortOf(run("2026-11-09", 1, {}, ["shelf"], ["trunks"]));
    expect(shownAge([full, three, four])).toEqual({ oldest: "2026-11-04", median: "2026-11-08", pairs: 4 });
    expect(shownAge([])).toBeUndefined();
  });

  it("gives the file the date of the oldest shown pair, not the date of the short run", () => {
    const short = shortOf(run("2026-11-08", 12, {}, ["shelf"], ["corners"]));
    const input = siteKpiInput([full, short], catalog, npm, entries, commitAt, keyed);
    expect(input?.at).toBe("2026-11-04T00:00:00Z");
    expect(input?.measures.find((m) => m.id === "pairs-shown")).toEqual({ id: "pairs-shown", value: 4, unit: "pairs", at: "2026-11-04T00:00:00Z" });
  });

  it("takes the newest full run for the pairs when no run is a cover run", () => {
    const short = shortOf(run("2026-11-08", 12, {}, ["shelf"], ["corners"]));
    expect(coverageRun([full, short])).toBe(full);
  });
});

describe("coverageRun", () => {
  it("gives the newest cover run, not a newer default run", () => {
    const cover = coverOf(run("2026-11-04", 650, {}));
    expect(coverageRun([run("2026-10-28", 130, {}), cover, run("2026-11-10", 130, {})])).toBe(cover);
  });

  it("gives the newest of two cover runs", () => {
    const newer = coverOf(run("2026-11-12", 700, {}));
    expect(coverageRun([coverOf(run("2026-11-04", 650, {})), newer])).toBe(newer);
  });

  it("gives the newest run when no run is a cover run", () => {
    const newest = run("2026-10-28", 130, {});
    expect(coverageRun([run("2026-10-20", 90, {}), newest])).toBe(newest);
    expect(coverageRun([])).toBeUndefined();
  });
});

describe("routersOnCompare", () => {
  it("counts each router of the registry with a row in the run", () => {
    expect(routersOnCompare(run("2026-10-28", 130, {}, [], ["corners", "trunks", "steiner"]), keyed)).toBe(3);
  });

  it("reads one fewer when a router of the registry has no row", () => {
    expect(routersOnCompare(run("2026-10-28", 130, {}, [], ["corners", "trunks"]), keyed)).toBe(2);
  });

  it("does not count a row of a router outside the registry", () => {
    expect(routersOnCompare(run("2026-10-28", 130, {}, [], ["corners", "shared-p2", "portfolio"]), keyed)).toBe(1);
  });

  it("counts a router one time", () => {
    expect(routersOnCompare(run("2026-10-28", 130, {}, [], ["corners", "corners"]), keyed)).toBe(1);
  });
});

describe("spaceConfigMeasures", () => {
  /** A made-up packer: 3 order options (a bool param gives 2) times 4 placement options (an enum of 3 values and 1 option), so 12 configs. */
  const pack: StrategySpace = {
    schema: STRATEGY_SPACE_SCHEMA,
    engine: "pack",
    version: "1",
    stages: [
      { name: "order", options: [{ id: "area", params: [] }, { id: "height", params: [{ name: "reverse", kind: "bool", default: false }] }] },
      { name: "placement", options: [{ id: "maxrects", params: [{ name: "rule", kind: "enum", values: ["a", "b", "c"], default: "a" }] }, { id: "shelf", params: [] }] },
    ],
  };
  /** A made-up router with 1 stage of 2 options, so 2 configs. */
  const route: StrategySpace = { schema: STRATEGY_SPACE_SCHEMA, engine: "route", version: "1", stages: [{ name: "path", options: [{ id: "straight", params: [] }, { id: "ortho", params: [] }] }] };
  const file = (space: StrategySpace, date: string): SpaceFile => ({ schema: "site-space/1", source: `${space.engine} 1.0.0`, date, space });

  it("counts the configs of each space and of the product, with the date of the older file for the product", () => {
    expect(spaceConfigMeasures([file(pack, "2026-11-07"), file(route, "2026-11-05")])).toEqual([
      { id: "space-configs-pack", value: 12, unit: "configs", at: "2026-11-07T00:00:00Z" },
      { id: "space-configs-route", value: 2, unit: "configs", at: "2026-11-05T00:00:00Z" },
      { id: "space-configs-product", value: 24, unit: "configs", at: "2026-11-05T00:00:00Z" },
    ]);
  });

  it("gives no product for one space, and no measure for no space", () => {
    expect(spaceConfigMeasures([file(route, "2026-11-05")]).map((m) => m.id)).toEqual(["space-configs-route"]);
    expect(spaceConfigMeasures([])).toEqual([]);
  });

  it("gives the count of spaceSize for each stored engine space", () => {
    const dir = new URL("../data/spaces/", import.meta.url);
    const files = readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => JSON.parse(readFileSync(new URL(n, dir), "utf8")) as SpaceFile);
    expect(files.length).toBeGreaterThanOrEqual(2);
    const measures = spaceConfigMeasures(files);
    for (const f of files) {
      const m = measures.find((x) => x.id === `space-configs-${f.space.engine}`);
      expect(m?.value, f.source).toBe(Number(spaceSize(f.space, { levels: SPACE_LEVELS }).base));
      expect(m!.value, f.source).toBeGreaterThan(1);
    }
  });
});
