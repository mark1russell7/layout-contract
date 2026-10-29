import type { StrategyConfig } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import type { SweepState } from "./night.ts";
import { correlationRatio, firstOrder, firstOrderMarkdown, JOINT_GROUPS, saltelliDesign, totalOrder, totalOrderMarkdown } from "./sensitivity.ts";
import { JOINT_SPACE } from "./space.ts";

const config = (router: string, pack: string, lanes?: string): StrategyConfig => ({
  space: "joint",
  stages: { "packing.entry": { option: pack, params: {} }, "highways.router": { option: router, params: {} }, ...(lanes === undefined ? {} : { "lanes.mode": { option: lanes, params: {} } }) },
});

/** A state where the score is set by the router, with a small effect of the pack and noise by input. One config has no value on input 0. */
function state(): SweepState {
  const inputs = Array.from({ length: 40 }, (_, i) => `in${i}`);
  const configs: SweepState["configs"] = {};
  const values: SweepState["values"] = {};
  let n = 0;
  for (const router of ["a", "b", "c"]) {
    for (const pack of ["p", "q"]) {
      for (const lanes of [undefined, "max"]) {
        const id = `c${n++}`;
        configs[id] = { config: config(router, pack, lanes), status: "screened", first: "2026-10-29" };
        const base = { a: 0.2, b: 0.5, c: 0.8 }[router]! + (pack === "q" ? 0.01 : 0);
        values[id] = inputs.map((_, i) => base + (((i * 7 + n * 3) % 11) - 5) / 100);
      }
    }
  }
  values["c0"]![0] = null;
  return { schema: "sweep-state/1", epoch: "e", corpus: "joint-v2", inputs, configs, values, reference: inputs.map(() => null), summary: [], nights: [] };
}

describe("correlationRatio", () => {
  it("gives 1 when the levels set the values, and 0 when they do not", () => {
    expect(correlationRatio([1, 1, 2, 2], ["x", "x", "y", "y"]).eta2).toBe(1);
    expect(correlationRatio([1, 2, 1, 2], ["x", "x", "y", "y"]).eta2).toBe(0);
    expect(correlationRatio([1, 2, 1, 2], ["x", "x", "y", "y"]).eps2).toBeLessThan(0);
    expect(correlationRatio([3, 3, 3], ["x", "y", "y"])).toEqual({ eta2: 0, eps2: 0 });
  });
});

describe("firstOrder", () => {
  it("finds the group that sets the score, on the inputs that each config shares", () => {
    const r = firstOrder(state(), JOINT_GROUPS, { draws: 300 });
    expect(r.configs).toBe(12);
    expect(r.inputs).toBe(39);
    const [router, lanes, pack] = r.groups;
    expect(router!.name).toBe("router");
    expect(router!.eps2).toBeGreaterThan(0.9);
    expect(router!.low).toBeGreaterThan(Math.max(lanes!.high, pack!.high));
    expect(lanes!.levels).toEqual({ none: 6, max: 6 });
    expect(r.differences.map((d) => `${d.a}-${d.b}`)).toEqual(["router-lanes", "router-pack", "lanes-pack"]);
    expect(r.differences[0]!.low).toBeGreaterThan(0);
  });

  it("gives the same result for the same seed, and uses only one level with within", () => {
    expect(firstOrder(state(), JOINT_GROUPS, { draws: 50, seed: 3 })).toEqual(firstOrder(state(), JOINT_GROUPS, { draws: 50, seed: 3 }));
    const r = firstOrder(state(), JOINT_GROUPS, { draws: 50, within: { group: "router", level: "b" } });
    expect(r.configs).toBe(4);
    expect(r.inputs).toBe(40);
    expect(r.groups[0]!.eta2).toBe(0);
    expect(firstOrderMarkdown(r)).toContain("the configs with router = b");
    expect(() => firstOrder(state(), JOINT_GROUPS, { within: { group: "nope", level: "x" } })).toThrow(RangeError);
  });
});

describe("saltelliDesign and totalOrder", () => {
  const routerOf = (c: StrategyConfig): string => c.stages["highways.router"]?.option ?? "none";
  const lanesOf = (c: StrategyConfig): string => c.stages["lanes.mode"]?.option ?? "none";

  it("changes one stage from A to AB_i, with the choice of B", () => {
    const { design, configs } = saltelliDesign(JOINT_SPACE, 16, 3, "2026-10-29");
    expect(design.rows).toHaveLength(16);
    expect(design.stages).toEqual(JOINT_SPACE.stages.map((s) => s.name));
    expect(Object.keys(configs).length).toBeLessThanOrEqual(16 * (design.stages.length + 2));
    for (const r of design.rows) {
      for (const stage of design.stages) {
        const ab = configs[r.ab[stage]!]!;
        for (const other of design.stages) {
          const from = other === stage ? configs[r.b]! : configs[r.a]!;
          expect(JSON.stringify(ab.stages[other] ?? null)).toBe(JSON.stringify(from.stages[other] ?? null));
        }
      }
    }
    expect(() => saltelliDesign(JOINT_SPACE, 1, 3, "d")).toThrow(RangeError);
  });

  /** This function gives a state with the values of `f` for each config of a design, on 3 inputs. */
  function designState(f: (c: StrategyConfig) => number): { s: SweepState; design: ReturnType<typeof saltelliDesign>["design"] } {
    const { design, configs } = saltelliDesign(JOINT_SPACE, 200, 7, "2026-10-29");
    const inputs = ["i0", "i1", "i2"];
    const s: SweepState = { schema: "sweep-state/1", epoch: "e", corpus: "joint-v2", inputs, configs: {}, values: {}, reference: inputs.map(() => null), summary: [], nights: [] } as unknown as SweepState;
    for (const [id, c] of Object.entries(configs)) {
      s.configs[id] = { config: c, status: "design", first: "2026-10-29" };
      s.values[id] = inputs.map(() => f(c));
    }
    return { s, design };
  }

  it("gives a total of 0 to a stage that the score does not read, and equal indices with no interaction", () => {
    const routers = new Map(JOINT_SPACE.stages.find((st) => st.name === "highways.router")!.options.map((o, i) => [o.id, i]));
    const { s, design } = designState((c) => routers.get(routerOf(c))!);
    const result = totalOrder(s, design, { draws: 200 });
    const router = result.stages.find((x) => x.stage === "highways.router")!;
    expect(router.total).toBeGreaterThan(0.8);
    expect(router.first).toBeGreaterThan(0.8);
    for (const x of result.stages.filter((y) => y.stage !== "highways.router")) {
      expect(x.total).toBe(0);
      expect(x.first).toBe(0);
    }
    expect(result.rows).toBe(200);
    expect(totalOrderMarkdown(result)).toContain("| highways.router |");
  });

  it("shows an interaction as a total above the first index", () => {
    // The score is 1 only when the router is "straight" and the lanes are off, so neither stage acts alone.
    const { s, design } = designState((c) => (routerOf(c) === "straight" && lanesOf(c) === "none" ? 1 : 0));
    const result = totalOrder(s, design, { draws: 200 });
    const lanes = result.stages.find((x) => x.stage === "lanes.mode")!;
    expect(lanes.total).toBeGreaterThan(lanes.first + 0.1);
    const pack = result.stages.find((x) => x.stage === "packing.entry")!;
    expect(pack.total).toBe(0);
  });
});
