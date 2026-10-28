import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalConfig,
  canonicalJson,
  checkConfig,
  checkSpace,
  configId,
  enumerateSpace,
  joinConfigs,
  paramLevels,
  productSpace,
  spaceSize,
  splitConfig,
  STRATEGY_SPACE_SCHEMA,
  type StrategyConfig,
  type StrategySpace,
} from "./index.ts";

// The strategy space of L34. A made-up packer with 4 stages, a conditional param, a constraint and a meta option.

const maxrectsCp: StrategyConfig = { space: "pack", stages: { order: { option: "area" }, placement: { option: "maxrects", params: { rule: "cp" } } } };
const shelfFirst: StrategyConfig = { space: "pack", stages: { order: { option: "height" }, placement: { option: "shelf", params: { fit: "first", k: 3 } } } };

const pack: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "pack",
  version: "0.0.1",
  stages: [
    {
      name: "order",
      options: [
        { id: "area", params: [] },
        { id: "height", params: [{ name: "reverse", kind: "bool", default: false }] },
      ],
    },
    {
      name: "placement",
      options: [
        {
          id: "maxrects",
          params: [
            { name: "rule", kind: "enum", values: ["bssf", "bl", "cp"], default: "bssf" },
            { name: "rotate", kind: "bool", default: false },
          ],
        },
        {
          id: "shelf",
          params: [
            { name: "fit", kind: "enum", values: ["next", "first"], default: "next" },
            { name: "band", kind: "real", min: 1, max: 100, scale: "log", default: 10 },
            { name: "k", kind: "int", min: 1, max: 5, default: 2, when: { param: "fit", in: ["first"] } },
          ],
        },
      ],
    },
    {
      name: "local",
      optional: true,
      options: [
        {
          id: "anneal",
          params: [
            { name: "steps", kind: "int", min: 10, max: 1000, scale: "log", default: 100 },
            { name: "temp", kind: "real", min: 0, max: 1, default: 0.5 },
          ],
        },
      ],
    },
    { name: "combine", optional: true, options: [{ id: "portfolio", params: [], members: { min: 2, max: 3, ordered: false } }] },
  ],
  constraints: [{ if: { stage: "local", option: "anneal" }, then: { stage: "placement", option: "maxrects" } }],
  named: {
    "maxrects-cp": maxrectsCp,
    "shelf-first": shelfFirst,
    "portfolio-k2": { space: "pack", stages: { combine: { option: "portfolio", members: [maxrectsCp, shelfFirst] } } },
  },
};

const route: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "route",
  version: "0.0.1",
  stages: [
    { name: "grouping", optional: true, options: [{ id: "rule", params: [] }] },
    { name: "lanes", options: [{ id: "bundle", params: [] }, { id: "run", params: [] }] },
    { name: "routing", options: [{ id: "shared", params: [{ name: "margin", kind: "real", min: 1, max: 20, default: 5 }] }] },
  ],
  named: { shared: { space: "route", stages: { grouping: { option: "rule" }, lanes: { option: "bundle" }, routing: { option: "shared" } } } },
};

/** The pinned id of `maxrectsCp`. The engines pin the same string. */
const PINNED = "11176301242c0f10";

const claims = (space: StrategySpace): string[] => checkSpace(space).map((b) => b.claim);
const withStage = (index: number, stage: object): StrategySpace => ({ ...pack, named: {}, stages: pack.stages.map((s, i) => (i === index ? { ...s, ...stage } : s)) as StrategySpace["stages"] });

describe("checkSpace", () => {
  it("gives no break for the made-up spaces", () => {
    expect(checkSpace(pack)).toEqual([]);
    expect(checkSpace(route)).toEqual([]);
  });

  it("finds duplicate names of stages, options, params and enum values", () => {
    expect(claims({ ...pack, named: {}, stages: [...pack.stages, pack.stages[0]!] })).toContain("duplicate");
    expect(claims(withStage(0, { options: [{ id: "area", params: [] }, { id: "area", params: [] }] }))).toEqual(["duplicate"]);
    const twice = { name: "x", kind: "bool", default: false } as const;
    expect(claims(withStage(0, { options: [{ id: "area", params: [twice, twice] }] }))).toEqual(["duplicate"]);
    expect(claims(withStage(0, { options: [{ id: "area", params: [{ name: "e", kind: "enum", values: ["a", "a"], default: "a" }] }] }))).toEqual(["duplicate"]);
  });

  it("finds an empty range, a default out of range, an enum without values and a bad log scale", () => {
    const one = (param: object): string[] => claims(withStage(0, { options: [{ id: "area", params: [param] }] }));
    expect(one({ name: "n", kind: "int", min: 5, max: 1, default: 3 })).toEqual(["range"]);
    expect(one({ name: "n", kind: "real", default: 3 })).toEqual(["range"]);
    expect(one({ name: "n", kind: "int", min: 1, max: 5, default: 9 })).toEqual(["default"]);
    expect(one({ name: "n", kind: "int", min: 1, max: 5, step: 2, default: 2 })).toEqual(["default"]);
    expect(one({ name: "e", kind: "enum", default: "a" })).toEqual(["values"]);
    expect(one({ name: "n", kind: "real", min: 0, max: 5, scale: "log", default: 1 })).toEqual(["scale"]);
  });

  it("finds a bad when, a stage without options and a required stage with only meta options", () => {
    const params = [
      { name: "k", kind: "int", min: 1, max: 5, default: 2, when: { param: "fit", in: ["first"] } },
      { name: "fit", kind: "enum", values: ["next", "first"], default: "next" },
    ];
    expect(claims(withStage(0, { options: [{ id: "area", params }] }))).toEqual(["when"]);
    expect(claims(withStage(0, { options: [{ id: "area", params: [{ ...params[0], when: { param: "nope", in: [1] } }] }] }))).toEqual(["unknown"]);
    expect(claims(withStage(0, { options: [] }))).toEqual(["options"]);
    expect(claims(withStage(3, { optional: false }))).toEqual(["meta"]);
  });

  it("finds unknown names in a constraint and in a named config, and a named config that breaks a constraint", () => {
    expect(claims({ ...pack, named: {}, constraints: [{ if: { stage: "nope", option: "x" }, then: { stage: "placement", option: "maxrects" } }] })).toEqual(["unknown"]);
    expect(claims({ ...pack, named: {}, constraints: [{ if: { stage: "order", option: null }, then: { not: { stage: "placement", option: "grid" } } }] })).toEqual(["unknown", "unknown"]);
    const bad = checkSpace({ ...pack, named: { odd: { space: "pack", stages: { order: { option: "spiral" }, placement: { option: "maxrects" } } } } });
    expect(bad.map((b) => [b.claim, b.inputs])).toEqual([["unknown", ["odd"]]]);
    const breaks = { space: "pack", stages: { order: { option: "area" }, placement: { option: "shelf" }, local: { option: "anneal" } } };
    expect(checkSpace({ ...pack, named: { breaks } }).map((b) => b.claim)).toEqual(["constraint"]);
  });
});

describe("checkConfig", () => {
  const base = (stages: StrategyConfig["stages"]): StrategyConfig => ({ space: "pack", stages });

  it("accepts a config that leaves out defaults and unused optional stages", () => {
    expect(checkConfig(pack, maxrectsCp)).toEqual([]);
  });

  it("refuses an inactive param, a missing stage, an unknown param and a value out of range", () => {
    const of = (c: StrategyConfig): string[] => checkConfig(pack, c).map((b) => b.claim);
    expect(of(base({ order: { option: "area" }, placement: { option: "shelf", params: { k: 3 } } }))).toEqual(["inactive"]);
    expect(of(base({ order: { option: "area" } }))).toEqual(["missing"]);
    expect(of(base({ order: { option: "area" }, placement: { option: "maxrects", params: { size: 3 } } }))).toEqual(["unknown"]);
    expect(of(base({ order: { option: "area" }, placement: { option: "shelf", params: { band: 0.5 } } }))).toEqual(["param"]);
    expect(of({ ...maxrectsCp, space: "route" })).toEqual(["space"]);
  });

  it("checks the members of a meta config: count, depth, duplicates and the other stages", () => {
    const of = (members: StrategyConfig[], extra: StrategyConfig["stages"] = {}): string[] =>
      checkConfig(pack, base({ ...extra, combine: { option: "portfolio", members } })).map((b) => b.claim);
    expect(of([maxrectsCp, shelfFirst])).toEqual([]);
    expect(of([maxrectsCp])).toEqual(["members"]);
    expect(of([maxrectsCp, { ...maxrectsCp, stages: { ...maxrectsCp.stages, placement: { option: "maxrects", params: { rule: "cp", rotate: false } } } }])).toEqual(["duplicate"]);
    const deep = base({ combine: { option: "portfolio", members: [maxrectsCp, shelfFirst] } });
    expect(of([maxrectsCp, deep])).toEqual(["depth"]);
    expect(of([maxrectsCp, shelfFirst], { order: { option: "area" } })).toEqual(["meta"]);
  });
});

describe("canonicalConfig and configId", () => {
  it("gives the pinned id, the SHA-256 of node:crypto of the canonical form, cut to 16 hex characters", () => {
    const canonical = canonicalConfig(pack, maxrectsCp);
    const text = canonicalJson(canonical);
    expect(text).toBe(
      '{"space":"pack","stages":{"combine":null,"local":null,"order":{"option":"area","params":{}},"placement":{"option":"maxrects","params":{"rotate":false,"rule":"cp"}}}}',
    );
    expect(configId(pack, maxrectsCp)).toBe(createHash("sha256").update(text).digest("hex").slice(0, 16));
    expect(configId(pack, maxrectsCp)).toBe(PINNED);
  });

  it("gives one id to two spellings of one config", () => {
    const spelled: StrategyConfig = {
      stages: { local: null, placement: { params: { rotate: false, rule: "cp" }, option: "maxrects" }, order: { option: "area", params: {} } },
      space: "pack",
    };
    expect(configId(pack, spelled)).toBe(configId(pack, maxrectsCp));
    const real = (temp: number): string =>
      configId(pack, { space: "pack", stages: { order: { option: "area" }, placement: { option: "maxrects" }, local: { option: "anneal", params: { temp } } } });
    expect(real(0.1 + 0.2)).toBe(real(0.3));
    expect(real(-0)).toBe(real(0));
  });

  it("sorts the members of an unordered meta option by their id", () => {
    const a = { space: "pack", stages: { combine: { option: "portfolio", members: [maxrectsCp, shelfFirst] } } };
    const b = { space: "pack", stages: { combine: { option: "portfolio", members: [shelfFirst, maxrectsCp] } } };
    expect(configId(pack, a)).toBe(configId(pack, b));
  });

  it("throws for a config with a break", () => {
    expect(() => canonicalConfig(pack, { space: "pack", stages: {} })).toThrow(/not good/);
  });
});

describe("paramLevels and spaceSize", () => {
  it("gives k levels on the scale of each numeric param", () => {
    const [shelf] = [pack.stages[1]!.options[1]!];
    expect(paramLevels(shelf.params[1]!, 3)).toEqual([1, 10, 100]);
    expect(paramLevels(shelf.params[2]!, 3)).toEqual([1, 3, 5]);
    expect(paramLevels(shelf.params[2]!, 9)).toEqual([1, 2, 3, 4, 5]);
    expect(paramLevels(pack.stages[2]!.options[0]!.params[0]!, 3)).toEqual([10, 100, 1000]);
    expect(paramLevels(pack.stages[2]!.options[0]!.params[1]!, 1)).toEqual([0.5]);
  });

  it("gives the counts of the grid by hand, with the constraint and the conditional param", () => {
    // order: area 1 + height 2. maxrects: 3 * 2 = 6. shelf: next 3 + first 3 * 3 = 12. anneal: 3 * 3 = 9, only with maxrects.
    // base = 3 * (6 * (9 + 1) + 12) = 216. meta = C(216, 2) + C(216, 3) = 23220 + 1656360.
    expect(spaceSize(pack, { levels: 3 })).toEqual({ base: 216n, meta: 1679580n });
    // With 1 level: 3 * (6 * 2 + 2) = 42.
    expect(spaceSize(pack, { levels: 1 }).base).toBe(42n);
    expect(spaceSize(pack, { levels: 3, maxMeta: 1000n }).meta).toBeNull();
  });

  it("refuses a bad space and a bad level count", () => {
    expect(() => spaceSize({ ...pack, schema: "x" as typeof STRATEGY_SPACE_SCHEMA }, { levels: 3 })).toThrow(/not good/);
    expect(() => spaceSize(pack, { levels: 0 })).toThrow(RangeError);
  });
});

describe("enumerateSpace", () => {
  it("gives each grid point once, in a stable order, with no meta option", () => {
    const grid = enumerateSpace(pack, { mode: "grid", levels: 3 });
    expect(grid).toHaveLength(216);
    expect(new Set(grid.map((c) => configId(pack, c))).size).toBe(216);
    expect(grid.every((c) => checkConfig(pack, c).length === 0 && c.stages["combine"] === null)).toBe(true);
    expect(grid[0]!.stages).toEqual({
      order: { option: "area", params: {} },
      placement: { option: "maxrects", params: { rule: "bssf", rotate: false } },
      local: { option: "anneal", params: { steps: 10, temp: 0 } },
      combine: null,
    });
    expect(enumerateSpace(pack, { mode: "grid", levels: 3 })).toEqual(grid);
    expect(() => enumerateSpace(pack, { mode: "grid", levels: 3, limit: 100 })).toThrow(RangeError);
  });

  it("gives the same sample for the same seed, and a different sample for another seed", () => {
    const a = enumerateSpace(pack, { mode: "sample", n: 40, seed: 7 });
    expect(a).toHaveLength(40);
    expect(enumerateSpace(pack, { mode: "sample", n: 40, seed: 7 })).toEqual(a);
    expect(enumerateSpace(pack, { mode: "sample", n: 40, seed: 8 })).not.toEqual(a);
    expect(a.every((c) => checkConfig(pack, c).length === 0)).toBe(true);
  });

  it("spreads a sample: each option and enum value appears, and the numbers cover the range", () => {
    const sample = enumerateSpace(pack, { mode: "sample", n: 60, seed: 1 });
    const placements = sample.map((c) => c.stages["placement"]!);
    expect(new Set(placements.map((p) => p.option))).toEqual(new Set(["maxrects", "shelf"]));
    const rules = placements.filter((p) => p.option === "maxrects").map((p) => p.params!["rule"]);
    expect(new Set(rules)).toEqual(new Set(["bssf", "bl", "cp"]));
    const temps = sample.flatMap((c) => (c.stages["local"] ? [c.stages["local"].params!["temp"] as number] : []));
    expect(temps.length).toBeGreaterThan(5);
    expect(Math.min(...temps)).toBeLessThan(0.2);
    expect(Math.max(...temps)).toBeGreaterThan(0.8);
    const bands = placements.filter((p) => p.option === "shelf").map((p) => p.params!["band"] as number);
    expect(Math.min(...bands)).toBeLessThan(2);
    expect(Math.max(...bands)).toBeGreaterThan(50);
    expect(placements.filter((p) => p.option === "shelf" && p.params!["fit"] === "next").every((p) => !("k" in p.params!))).toBe(true);
  });

  it("draws members from base samples with the option meta sample", () => {
    const sample = enumerateSpace(pack, { mode: "sample", n: 20, seed: 3, meta: "sample" });
    expect(enumerateSpace(pack, { mode: "sample", n: 20, seed: 3, meta: "sample" })).toEqual(sample);
    const metas = sample.filter((c) => c.stages["combine"] !== null);
    expect(metas.length).toBeGreaterThan(0);
    for (const c of metas) {
      expect(checkConfig(pack, c)).toEqual([]);
      expect(c.stages["order"]).toBeNull();
      expect(c.stages["combine"]!.members!.length).toBeGreaterThanOrEqual(2);
    }
    expect(enumerateSpace(pack, { mode: "sample", n: 20, seed: 3 }).every((c) => c.stages["combine"] === null)).toBe(true);
  });

  it("throws after a bounded count of tries when the constraints remove each point", () => {
    const closed: StrategySpace = {
      ...pack,
      named: {},
      constraints: [
        { if: { stage: "order", option: "area" }, then: { stage: "local", option: "anneal" } },
        { if: { stage: "order", option: "area" }, then: { not: { stage: "local", option: "anneal" } } },
        { if: { stage: "order", option: "height" }, then: { stage: "order", option: "area" } },
      ],
    };
    expect(spaceSize(closed, { levels: 3 }).base).toBe(0n);
    expect(() => enumerateSpace(closed, { mode: "sample", n: 5, seed: 1, maxTries: 50 })).toThrow(/remove too many points/);
  });
});

describe("productSpace", () => {
  const joint = productSpace(pack, route, "joint");

  it("prefixes the stages and the constraints, and joins the named configs", () => {
    expect(checkSpace(joint)).toEqual([]);
    expect(joint.stages.map((s) => s.name)).toEqual(["pack.order", "pack.placement", "pack.local", "pack.combine", "route.grouping", "route.lanes", "route.routing"]);
    expect(joint.constraints).toEqual([{ if: { stage: "pack.local", option: "anneal" }, then: { stage: "pack.placement", option: "maxrects" } }]);
    expect(Object.keys(joint.named!)).toEqual(["maxrects-cp+shared", "shelf-first+shared", "portfolio-k2+shared"]);
    expect(joint.version).toBe("pack@0.0.1+route@0.0.1");
    expect(() => productSpace(pack, pack, "twice")).toThrow(RangeError);
  });

  it("gives one id to a joint config, and splits it back into its parts", () => {
    const config = joinConfigs("joint", [maxrectsCp, route.named!["shared"]!]);
    const id = configId(joint, config);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).not.toBe(configId(pack, maxrectsCp));
    expect(configId(joint, joint.named!["maxrects-cp+shared"]!)).toBe(id);
    expect(configId(pack, splitConfig(config, "pack"))).toBe(configId(pack, maxrectsCp));
    expect(configId(route, splitConfig(config, "route"))).toBe(configId(route, route.named!["shared"]!));
    expect(() => splitConfig(config, "none")).toThrow(RangeError);
  });

  it("counts the product, and takes the members of a meta option from its own part", () => {
    // route: grouping 2 * lanes 2 * routing 3 = 12. The joint base is 216 * 12, and the joint meta is the pack meta * 12.
    expect(spaceSize(route, { levels: 3 })).toEqual({ base: 12n, meta: 0n });
    expect(spaceSize(joint, { levels: 3 })).toEqual({ base: 2592n, meta: 1679580n * 12n });
    expect(checkConfig(joint, joint.named!["portfolio-k2+shared"]!)).toEqual([]);
    const sample = enumerateSpace(joint, { mode: "sample", n: 12, seed: 5, meta: "sample" });
    expect(sample.every((c) => checkConfig(joint, c).length === 0)).toBe(true);
    const meta = sample.find((c) => c.stages["pack.combine"] !== null);
    expect(meta?.stages["pack.combine"]!.members!.every((m) => m.space === "pack")).toBe(true);
    expect(meta?.stages["route.lanes"]).not.toBeNull();
  });
});
