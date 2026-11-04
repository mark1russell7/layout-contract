import { describe, expect, it } from "vitest";
import type { JointData } from "./data.ts";
import { enginesCurrent, type KpiCatalog, packersMeasured, siteKpiInput } from "./kpi.ts";

const run = (date: string, pairs: number, versions: Record<string, string>, packers: readonly string[] = ["shelf", "rows"]): JointData =>
  ({ run: "1", date, pairs, versions, stress: { byPacker: packers.map((id) => ({ id })) } }) as unknown as JointData;

const catalog: KpiCatalog = { about: { packing: { shelf: "a", rows: "b", anneal: "c", skyline: "d" }, highways: {} }, routers: ["corners", "trunks"] };

const commitAt = "2026-11-04T12:00:00Z";

const entries = [
  { id: "shelf", strategy: "shelf" },
  { id: "shelf-next", strategy: "shelf" },
  { id: "rows", strategy: "rows" },
  { id: "anneal-maxrects-bl-k16", strategy: "anneal" },
  { id: "gone", strategy: "gone" },
];

describe("enginesCurrent", () => {
  it("counts only the engines with the version of the build", () => {
    expect(enginesCurrent({ packing: "0.7.0", highways: "0.13.0" }, { packing: "0.7.0", highways: "0.14.0" })).toBe(1);
  });

  it("does not count an engine that the build does not have", () => {
    expect(enginesCurrent({ packing: "0.7.0" }, {})).toBe(0);
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
    expect(siteKpiInput([], catalog, {}, entries, commitAt)).toBeUndefined();
  });

  it("takes the time of the data from the latest run, not from the build", () => {
    const input = siteKpiInput([run("2026-10-20", 90, {}), run("2026-10-28", 130, {})], catalog, {}, entries, commitAt);
    expect(input?.at).toBe("2026-10-28T00:00:00Z");
    expect(input?.measures.find((m) => m.id === "pairs-in-run")?.value).toBe(130);
  });

  it("gives each measure the time of its own data, so an old run does not age the measures of the build", () => {
    const input = siteKpiInput([run("2026-10-28", 130, {})], catalog, {}, entries, commitAt);
    expect(Object.fromEntries(input?.measures.map((m) => [m.id, m.at]) ?? [])).toEqual({
      "pairs-in-run": "2026-10-28T00:00:00Z",
      "packers-measured": "2026-10-28T00:00:00Z",
      "routers-on-compare": commitAt,
      "engines-current": commitAt,
    });
  });

  it("counts only the strategies of the latest run", () => {
    const input = siteKpiInput([run("2026-10-20", 90, {}, ["shelf", "rows", "skyline"]), run("2026-10-28", 130, {}, ["shelf"])], catalog, {}, entries, commitAt);
    expect(input?.measures.find((m) => m.id === "packers-measured")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "routers-on-compare")?.value).toBe(2);
  });
});
