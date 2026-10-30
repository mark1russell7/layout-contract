import { describe, expect, it } from "vitest";
import { checkSpace, configId, enumerateSpace, spaceSize, splitConfig } from "@mark1russell7/layout-contract";
import { iterEntries, iterPlanPairs, laneEntries, LANE_CAP, LANE_CLEARANCE, LANE_SPACE } from "./lanes.ts";
import { PACK_ENTRIES, ROUTERS } from "./runner.ts";
import { BENCH_ADAPTER, configLabel, configRun, JOINT_ENGINE, JOINT_SPACE, LANE_STAGE, namedId } from "./space.ts";

describe("the joint space of the sweep", () => {
  it("has no break, and the stages of the two parts and the stage of the lanes", () => {
    expect(checkSpace(JOINT_SPACE)).toEqual([]);
    expect(JOINT_SPACE.engine).toBe(JOINT_ENGINE);
    expect(JOINT_SPACE.stages.map((s) => s.name)).toEqual(["packing.entry", "highways.router", "lanes.mode"]);
    expect(JOINT_SPACE.stages[0]!.options).toHaveLength(PACK_ENTRIES.length);
    expect(JOINT_SPACE.stages[1]!.options).toHaveLength(ROUTERS.length);
  });

  it("has a named config for each pair of the bench, each lane pair of L13 and each iteration pair of L11", () => {
    const named = Object.keys(JOINT_SPACE.named ?? {});
    expect(named).toHaveLength(PACK_ENTRIES.length * ROUTERS.length + laneEntries().length + iterEntries().length);
    expect(named).toHaveLength(306);
    expect(named).toContain("rows+steiner");
    expect(named).toContain("select+interchanges");
    expect(named).toContain("lanes-iter2.rows.corners+corners");
    expect(named).toContain("rows+portfolio");
    expect(named).toContain("lanes-sides.maxrects-cp.corners+corners");
    expect(named).toContain("lanes-sides2.select.portfolio+portfolio");
  });

  it("gives the size of the grid: 270 pairs times (1 + 2 lane options with 4 params + the option iter with 1 param)", () => {
    const pairs = BigInt(PACK_ENTRIES.length * ROUTERS.length);
    expect(spaceSize(JOINT_SPACE, { levels: 1 })).toEqual({ base: pairs * 4n, meta: 0n });
    expect(spaceSize(JOINT_SPACE, { levels: 2 }).base).toBe(pairs * (1n + 2n * 16n + 2n));
    expect(spaceSize(JOINT_SPACE, { levels: 3 }).base).toBe(pairs * (1n + 2n * 81n + 3n));
    expect(spaceSize(JOINT_SPACE, { levels: 3 }).base).toBe(44820n);
  });

  it("runs a named config as the pair of the bench, with the same pair id", () => {
    for (const name of ["rows+portfolio", "select+portfolio", "maxrects-cp+corners"]) {
      const run = configRun(JOINT_SPACE.named![name]!);
      expect(run.pair).toBe(name);
      expect(run.lane).toBeUndefined();
      expect(run.passes).toBe(0);
    }
    for (const lane of laneEntries()) {
      const name = `${lane.id}+${lane.router}`;
      const run = configRun(JOINT_SPACE.named![name]!);
      expect(run.pair).toBe(name);
      expect(run.passes).toBe(lane.variant.passes);
      expect(run.lane?.variant).toEqual(lane.variant);
      expect(run.lane?.options).toEqual({ clearance: LANE_CLEARANCE, space: LANE_SPACE, cap: LANE_CAP });
    }
    for (const it of iterEntries()) {
      const name = `${it.id}+${it.router}`;
      const run = configRun(JOINT_SPACE.named![name]!);
      expect(run.pair).toBe(name);
      expect(run.iter).toEqual(it);
      expect(run.lane).toBeUndefined();
      expect(run.rounds).toBe(it.variant.rounds);
      expect(iterPlanPairs([run.iter!])).toBe(3 * it.variant.rounds);
    }
  });

  it("gives a lane config with other params another pair id and another config id", () => {
    const base = JOINT_SPACE.named!["lanes-sides.maxrects-cp.corners+corners"]!;
    const other = { ...base, stages: { ...base.stages, [LANE_STAGE]: { option: "sides", params: { passes: 1, clearance: 7, space: 4, cap: 8 } } } };
    expect(configId(JOINT_SPACE, other)).not.toBe(configId(JOINT_SPACE, base));
    expect(configRun(other).lane?.options).toEqual({ clearance: 7, space: 4, cap: 8 });
    // The lane id of a config with other params has the first 8 digits of its config id.
    expect(configRun(other).pair).toBe(`lanes-sides-${configId(JOINT_SPACE, other).slice(0, 8)}.maxrects-cp.corners+corners`);
    expect(configRun(other).lane?.variant.mode).toBe("sides");
  });

  it("gives a sample of configs that the runner can run, and the same sample for the same seed", () => {
    const a = enumerateSpace(JOINT_SPACE, { mode: "sample", n: 40, seed: 20261028 });
    const b = enumerateSpace(JOINT_SPACE, { mode: "sample", n: 40, seed: 20261028 });
    expect(a.map((c) => configId(JOINT_SPACE, c))).toEqual(b.map((c) => configId(JOINT_SPACE, c)));
    for (const c of a) {
      const run = configRun(c);
      expect(PACK_ENTRIES.map((e) => e.id)).toContain(run.pack);
      expect(ROUTERS).toContain(run.router);
    }
    expect(new Set(a.map((c) => c.stages[LANE_STAGE]?.option ?? "none")).size).toBeGreaterThan(1);
  });

  it("splits a joint config into the configs of the two engines", () => {
    const c = JOINT_SPACE.named!["rows+portfolio"]!;
    expect(splitConfig(c, "packing").stages).toEqual({ entry: { option: "rows" } });
    expect(BENCH_ADAPTER.router(c)).toBe("portfolio");
    expect(namedId("rows+portfolio")).toMatch(/^[0-9a-f]{16}$/);
    expect(configLabel(c)).toBe("rows+portfolio");
    expect(configLabel(JOINT_SPACE.named!["lanes-iter3.select.portfolio+portfolio"]!)).toBe("select+portfolio iter r3");
    expect(configLabel(JOINT_SPACE.named!["lanes-sides2.select.portfolio+portfolio"]!)).toBe("select+portfolio sides p2 c5 s4 k8");
  });
});
