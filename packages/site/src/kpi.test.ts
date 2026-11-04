import { describe, expect, it } from "vitest";
import type { JointData } from "./data.ts";
import { enginesCurrent, type KpiCatalog, siteKpiInput } from "./kpi.ts";

const run = (date: string, pairs: number, versions: Record<string, string>, packers: readonly string[] = ["shelf", "rows"]): JointData =>
  ({ run: "1", date, pairs, versions, stress: { byPacker: packers.map((id) => ({ id })) } }) as unknown as JointData;

const catalog: KpiCatalog = { routers: ["corners", "trunks"] };

describe("enginesCurrent", () => {
  it("counts only the engines with the version of the build", () => {
    expect(enginesCurrent({ packing: "0.7.0", highways: "0.13.0" }, { packing: "0.7.0", highways: "0.14.0" })).toBe(1);
  });

  it("does not count an engine that the build does not have", () => {
    expect(enginesCurrent({ packing: "0.7.0" }, {})).toBe(0);
  });
});

describe("siteKpiInput", () => {
  it("gives no input without a run, because the time of the data is not known", () => {
    expect(siteKpiInput([], catalog, {})).toBeUndefined();
  });

  it("takes the time of the data from the latest run, not from the build", () => {
    const input = siteKpiInput([run("2026-10-20", 90, {}), run("2026-10-28", 130, {})], catalog, {});
    expect(input?.at).toBe("2026-10-28T00:00:00Z");
    expect(input?.measures.find((m) => m.id === "pairs-in-run")?.value).toBe(130);
  });

  it("counts only the packers of the latest run, not the packers of the catalog", () => {
    const input = siteKpiInput([run("2026-10-20", 90, {}, ["shelf", "rows", "skyline"]), run("2026-10-28", 130, {}, ["shelf"])], catalog, {});
    expect(input?.measures.find((m) => m.id === "packers-measured")?.value).toBe(1);
    expect(input?.measures.find((m) => m.id === "routers-on-compare")?.value).toBe(2);
  });
});
