import { describe, expect, it } from "vitest";
import type { JointData } from "./data.ts";
import { enginesCurrent, enginesOnNpm, failedReadStops, type KpiCatalog, type NpmRead, packersMeasured, routersOnCompare, siteKpiInput } from "./kpi.ts";

const run = (date: string, pairs: number, versions: Record<string, string>, packers: readonly string[] = ["shelf", "rows"], routers: readonly string[] = ["corners", "trunks"]): JointData =>
  ({ run: "1", date, pairs, versions, stress: { byPacker: packers.map((id) => ({ id })), byRouter: routers.map((id) => ({ id })) } }) as unknown as JointData;

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
    expect(input?.measures.map((m) => m.id)).toEqual(["pairs-in-run", "packers-measured", "routers-on-compare", "routers-keyed"]);
  });

  it("counts only the strategies of the latest run", () => {
    const input = siteKpiInput([run("2026-10-20", 90, {}, ["shelf", "rows", "skyline"], ["corners", "trunks", "steiner"]), run("2026-10-28", 130, {}, ["shelf"], ["corners"])], catalog, npm, entries, commitAt, keyed);
    expect(input?.measures.find((m) => m.id === "packers-measured")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "routers-on-compare")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "routers-keyed")?.value).toBe(3);
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
