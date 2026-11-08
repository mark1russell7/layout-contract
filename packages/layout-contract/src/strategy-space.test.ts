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
  SHAPE_KIND_IDS,
  spaceShapeKinds,
  spaceSize,
  splitConfig,
  STRATEGY_SPACE_SCHEMA,
  type MemberRule,
  type OptionSupports,
  type SampleOptions,
  type ShapeKind,
  type SpaceStage,
  type StageOption,
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

describe("spaceSize with constraints over many stages", () => {
  const ids = ["a", "b", "c"] as const;
  const stages = ["s0", "s1", "s2", "s3", "s4"].map((name, i) => ({ name, ...(i % 2 === 0 ? { optional: true } : {}), options: ids.map((id) => ({ id, params: [] })) }));
  const space: StrategySpace = {
    schema: STRATEGY_SPACE_SCHEMA,
    engine: "walk",
    version: "1",
    stages,
    constraints: [
      { if: { stage: "s0", option: "a" }, then: { stage: "s4", option: "b" } },
      { if: { stage: "s3", option: "b" }, then: { not: { stage: "s1", option: "c" } } },
      { if: { stage: "s2", option: null }, then: { stage: "s1", option: "a" } },
      { if: { stage: "s4", option: "c" }, then: { stage: "s2", option: null } },
    ],
  };

  it("counts the configs that checkConfig accepts", () => {
    const choices = stages.map((s) => [...s.options.map((o) => o.id), ...(s.optional === true ? [null] : [])]);
    let good = 0n;
    const visit = (i: number, picked: Record<string, { option: string } | null>): void => {
      if (i === stages.length) {
        if (checkConfig(space, { space: "walk", stages: picked }).length === 0) good += 1n;
        return;
      }
      for (const id of choices[i]!) visit(i + 1, { ...picked, [stages[i]!.name]: id === null ? null : { option: id } });
    };
    visit(0, {});
    expect(good).toBeGreaterThan(0n);
    expect(spaceSize(space, { levels: 1 }).base).toBe(good);
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

describe("the walk draw of a sample", () => {
  // 40 routers, and each router permits only its own 2 of the 12 options of each smaller stage. Few draws of the default keep these constraints.
  const small = (name: string, count: number): SpaceStage => ({ name, optional: true, options: Array.from({ length: count }, (_, i) => ({ id: `${name}${i}`, params: [] })) });
  const routers = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, params: [{ name: "w", kind: "int" as const, min: 1, max: 9, default: 1 }] }));
  const tightOver = (names: readonly string[]): StrategySpace => ({
    schema: STRATEGY_SPACE_SCHEMA,
    engine: "tight",
    version: "1",
    stages: [small(names[0]!, 12), { name: "router", options: routers }, ...names.slice(1).map((name) => small(name, 12))],
    constraints: routers.flatMap((r, i) =>
      names.flatMap((stage) =>
        Array.from({ length: 12 }, (_, k) => k)
          .filter((k) => k !== i % 12 && k !== (i + 1) % 12)
          .map((k) => ({ if: { stage: "router", option: r.id }, then: { not: { stage, option: `${stage}${k}` } } })),
      ),
    ),
  });
  const tight = tightOver(["a", "b", "c"]);
  const options = { mode: "sample", n: 200, seed: 7 } as const;

  it("gives a full sample where the default draw throws", () => {
    expect(() => enumerateSpace(tight, { ...options, maxTries: 2000 })).toThrow(/remove too many points: \d+ of 200 configs after 2000 tries\. The option draw: "walk" gets a sample/);
    // A walk that keeps each constraint draws each point one time, so 200 tries are sufficient for 200 configs.
    const out = enumerateSpace(tight, { ...options, draw: "walk", maxTries: 200 });
    expect(out).toHaveLength(200);
    for (const c of out) expect(checkConfig(tight, c)).toEqual([]);
  });

  it("keeps the equal strata of the largest stage, and draws from each permitted option", () => {
    const out = enumerateSpace(tight, { ...options, draw: "walk" });
    const count = (stage: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const c of out) m.set(c.stages[stage]?.option ?? "none", (m.get(c.stages[stage]?.option ?? "none") ?? 0) + 1);
      return m;
    };
    const shares = [...count("router").values()];
    expect(shares).toHaveLength(40);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    expect(count("a").size).toBe(13);
    expect(count("b").size).toBe(13);
  });

  it("is not uniform over the valid configs: each option of the largest stage gets an equal share", () => {
    // The option x0 permits 1 option of y, and each other option of x permits 9 options of y.
    const space: StrategySpace = {
      schema: STRATEGY_SPACE_SCHEMA,
      engine: "share",
      version: "1",
      stages: [
        { name: "x", options: Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, params: [] })) },
        { name: "y", options: Array.from({ length: 9 }, (_, i) => ({ id: `y${i}`, params: [] })) },
      ],
      constraints: [{ if: { stage: "x", option: "x0" }, then: { stage: "y", option: "y0" } }],
    };
    const share = (list: readonly StrategyConfig[]): number => list.filter((c) => c.stages["x"]?.option === "x0").length / list.length;
    expect(share(enumerateSpace(space, { mode: "grid", levels: 1 }))).toBeCloseTo(1 / 82, 10);
    expect(share(enumerateSpace(space, { mode: "sample", n: 100, seed: 11, draw: "walk" }))).toBeCloseTo(0.1, 10);
  });

  it("draws the member lists of a meta option with the walk", () => {
    // A reject draw of the pool of this space throws, so this sample holds only if the member lists use the walk.
    const deep = tightOver(["a", "b", "c", "d", "e", "f"]);
    const meta: StrategySpace = { ...deep, stages: [...deep.stages, { name: "combine", optional: true, options: [{ id: "best", params: [], members: { min: 2, max: 2, ordered: false } }] }] };
    // 40 draws hold each check of this test. The 200 draws of `options` took 2.3 to 5.3 s in CI and passed the limit of 5 s.
    const out = enumerateSpace(meta, { ...options, n: 40, meta: "sample", draw: "walk" });
    expect(out).toHaveLength(40);
    for (const c of out) expect(checkConfig(meta, c)).toEqual([]);
    expect(out.some((c) => c.stages["combine"] != null)).toBe(true);
    // The walk of 200 samples took 5064 ms in CI run 42388503014, over the default limit of 5000 ms. Thus the test has its own limit.
  }, 30_000);

  it("is deterministic, and the seed moves it", () => {
    const a = enumerateSpace(tight, { ...options, draw: "walk" });
    expect(enumerateSpace(tight, { ...options, draw: "walk" })).toEqual(a);
    expect(enumerateSpace(tight, { ...options, seed: 8, draw: "walk" })).not.toEqual(a);
  });

  it("follows a rule that asks for an option of a later stage", () => {
    const stages: SpaceStage[] = [
      { name: "x", options: [{ id: "x0", params: [] }, { id: "x1", params: [] }, { id: "x2", params: [] }] },
      { name: "y", options: [{ id: "y0", params: [] }, { id: "y1", params: [] }] },
    ];
    const space: StrategySpace = { schema: STRATEGY_SPACE_SCHEMA, engine: "ask", version: "1", stages, constraints: [{ if: { stage: "x", option: "x0" }, then: { stage: "y", option: "y1" } }] };
    const out = enumerateSpace(space, { mode: "sample", n: 30, seed: 3, draw: "walk" });
    expect(out).toHaveLength(30);
    for (const c of out) expect(checkConfig(space, c)).toEqual([]);
    expect(out.some((c) => c.stages["x"]?.option === "x0")).toBe(true);
  });

  it("keeps a meta option of a part apart from the other stages of that part", () => {
    const base: StrategySpace = {
      schema: STRATEGY_SPACE_SCHEMA,
      engine: "meta",
      version: "1",
      stages: [
        { name: "place", options: [{ id: "p0", params: [] }, { id: "p1", params: [] }, { id: "p2", params: [] }] },
        { name: "combine", optional: true, options: [{ id: "best", params: [], members: { min: 2, max: 2, ordered: false } }] },
      ],
    };
    const out = enumerateSpace(base, { mode: "sample", n: 40, seed: 5, meta: "sample", draw: "walk" });
    expect(out).toHaveLength(40);
    for (const c of out) expect(checkConfig(base, c)).toEqual([]);
    expect(out.some((c) => c.stages["combine"] != null)).toBe(true);
  });

  it("throws when no config keeps the constraints, and refuses another value", () => {
    const closed: StrategySpace = { ...tight, constraints: [{ if: { stage: "router", option: "r0" }, then: { stage: "router", option: "r1" } }, ...routers.slice(1).map((r) => ({ if: { stage: "router", option: r.id }, then: { stage: "router", option: "r0" } }))] };
    expect(() => enumerateSpace(closed, { ...options, n: 5, draw: "walk", maxTries: 50 })).toThrow(/remove too many points: \d+ of 5 configs after 50 tries\.$/);
    expect(() => enumerateSpace(tight, { ...options, draw: "other" as never })).toThrow(RangeError);
  });

  it("leaves the default draw as it was", () => {
    const open: StrategySpace = { ...tight, constraints: [] };
    expect(enumerateSpace(open, { ...options, draw: "reject" })).toEqual(enumerateSpace(open, options));
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

describe("shape kinds of the options (L46)", () => {
  const supports: Readonly<Record<string, OptionSupports>> = {
    "placement.maxrects": { shape: ["rect"] },
    "placement.shelf": { shape: ["rect", "circle"] },
    "local.anneal": { shape: ["rect"] },
  };
  const shaped: StrategySpace = {
    ...pack,
    stages: pack.stages.map((s) => ({
      ...s,
      options: s.options.map((o) => {
        const own = supports[`${s.name}.${o.id}`];
        return own === undefined ? o : { ...o, supports: own };
      }),
    })),
  };
  const one = (option: object): string[] =>
    claims({ ...shaped, named: {}, stages: shaped.stages.map((s, i) => (i === 1 ? { ...s, options: [{ ...s.options[0]!, ...option }, s.options[1]!] } : s)) as StrategySpace["stages"] });

  it("keeps the configId pin and the counts of a space without a shape filter", () => {
    expect(checkSpace(shaped)).toEqual([]);
    expect(configId(shaped, maxrectsCp)).toBe(PINNED);
    expect(canonicalConfig(shaped, maxrectsCp)).toEqual(canonicalConfig(pack, maxrectsCp));
    expect(spaceSize(shaped, { levels: 3 })).toEqual(spaceSize(pack, { levels: 3 }));
    expect(enumerateSpace(shaped, { mode: "grid", levels: 3 })).toEqual(enumerateSpace(pack, { mode: "grid", levels: 3 }));
    expect(enumerateSpace(shaped, { mode: "sample", n: 40, seed: 7 })).toEqual(enumerateSpace(pack, { mode: "sample", n: 40, seed: 7 }));
    expect(spaceSize(shaped, { levels: 1, shapes: ["rect"] }).base).toBe(42n);
  });

  it("finds bad supports", () => {
    expect(one({ supports: { shape: [] } })).toEqual(["shape"]);
    expect(one({ supports: { shape: ["hexagon"] } })).toEqual(["shape"]);
    expect(one({ supports: { shape: ["rect", "rect"] } })).toEqual(["duplicate"]);
    expect(one({ supports: 3 })).toEqual(["shape"]);
    expect(one({ supports: {} })).toEqual([]);
  });

  it("refuses a config with an option that does not support a kind of the input, also in a member", () => {
    expect(checkConfig(shaped, maxrectsCp)).toEqual([]);
    expect(checkConfig(shaped, maxrectsCp, { shapes: ["rect"] })).toEqual([]);
    const breaks = checkConfig(shaped, maxrectsCp, { shapes: ["rect", "circle"] });
    expect(breaks.map((b) => b.claim)).toEqual(["shape"]);
    expect(breaks[0]!.detail).toBe("the option placement.maxrects supports the shape kinds rect, not circle");
    expect(checkConfig(shaped, shelfFirst, { shapes: ["circle"] })).toEqual([]);
    expect(checkConfig(pack, maxrectsCp, { shapes: ["free"] })).toEqual([]);
    const portfolio = shaped.named!["portfolio-k2"]!;
    expect(checkConfig(shaped, portfolio, { shapes: ["circle"] }).map((b) => b.detail)).toEqual([
      "the member 0 of the option combine.portfolio: the option placement.maxrects supports the shape kinds rect, not circle",
    ]);
  });

  it("counts and enumerates only the options that support the kinds", () => {
    expect(spaceSize(shaped, { levels: 1, shapes: ["circle"] }).base).toBe(6n);
    expect(spaceSize(shaped, { levels: 1, shapes: ["polygon"] }).base).toBe(0n);
    const grid = enumerateSpace(shaped, { mode: "grid", levels: 1, shapes: ["circle"] });
    expect(grid).toHaveLength(6);
    const all = new Set(enumerateSpace(shaped, { mode: "grid", levels: 1 }).map((c) => configId(shaped, c)));
    for (const c of grid) {
      expect(c.stages["placement"]?.option).toBe("shelf");
      expect(c.stages["local"]).toBeNull();
      expect(all.has(configId(shaped, c))).toBe(true);
    }
    expect(enumerateSpace(shaped, { mode: "grid", levels: 1, shapes: ["polygon"] })).toEqual([]);
    const sample = enumerateSpace(shaped, { mode: "sample", n: 20, seed: 1, meta: "sample", shapes: ["circle"] });
    expect(sample).toHaveLength(20);
    for (const c of sample) expect(checkConfig(shaped, c, { shapes: ["circle"] })).toEqual([]);
    expect(() => enumerateSpace(shaped, { mode: "sample", n: 5, seed: 1, shapes: ["polygon"] })).toThrow(/placement/);
    expect(() => spaceSize(shaped, { levels: 1, shapes: ["hexagon" as never] })).toThrow(RangeError);
  });

  it("derives the kinds of a space from its options, and keeps supports in a product space", () => {
    expect(spaceShapeKinds(pack)).toEqual(["rect", "polygon", "circle", "free"]);
    expect(spaceShapeKinds(shaped)).toEqual(["rect", "circle"]);
    const joint = productSpace(shaped, route, "joint");
    expect(checkSpace(joint)).toEqual([]);
    expect(spaceSize(joint, { levels: 1, shapes: ["circle"] }).base).toBe(6n * spaceSize(route, { levels: 1 }).base);
    expect(enumerateSpace(joint, { mode: "grid", levels: 1, shapes: ["circle"] })).toHaveLength(24);
    expect(spaceShapeKinds(joint)).toEqual(["rect", "circle"]);
  });
});

describe("a meta option with no member list", () => {
  const noList = { min: 0, max: 0, ordered: false };
  const over = (members: object): StrategySpace => ({
    schema: STRATEGY_SPACE_SCHEMA,
    engine: "route",
    version: "1",
    stages: [
      { name: "routing", options: [{ id: "a", params: [] }, { id: "b", params: [] }] },
      { name: "combine", optional: true, options: [{ id: "portfolio", params: [{ name: "cap", kind: "int", min: 1, max: 3, default: 2 }], members: members as MemberRule }] },
    ],
  });
  const space = over(noList);
  const config = (members?: readonly StrategyConfig[]): StrategyConfig => ({
    space: "route",
    stages: { routing: null, combine: { option: "portfolio", params: { cap: 2 }, ...(members === undefined ? {} : { members }) } },
  });
  const member: StrategyConfig = { space: "route", stages: { routing: { option: "a" }, combine: null } };

  it("is a good form of a space and of a config", () => {
    expect(checkSpace(space)).toEqual([]);
    expect(checkConfig(space, config([]))).toEqual([]);
  });

  it("refuses a config that lists a member or gives no list", () => {
    expect(checkConfig(space, config([member])).map((b) => b.claim)).toEqual(["members"]);
    expect(checkConfig(space, config()).map((b) => b.claim)).toEqual(["members"]);
  });

  it("refuses each other rule with a count of 0", () => {
    for (const rule of [{ min: 0, max: 1, ordered: false }, { min: 1, max: 0, ordered: false }, { min: -1, max: 0, ordered: false }]) {
      expect(checkSpace(over(rule)).map((b) => b.claim)).toEqual(["members"]);
    }
  });

  it("refuses a pool or a view on this form", () => {
    expect(checkSpace(over({ ...noList, pool: [[]] })).map((b) => b.detail)).toContain("the option combine.portfolio has no member list, so its member rule cannot have a pool or a view");
    expect(checkSpace(over({ ...noList, view: "bounds" })).map((b) => b.claim)).toEqual(["members"]);
  });

  it("counts one member list for each value of its params", () => {
    expect(spaceSize(space, { levels: 3 }).meta).toBe(3n);
  });

  it("stays out of a default sample, and a meta sample holds it with no members", () => {
    expect(enumerateSpace(space, { mode: "sample", n: 40, seed: 3 }).filter((c) => c.stages["combine"] !== null)).toEqual([]);
    const out = enumerateSpace(space, { mode: "sample", n: 40, seed: 3, meta: "sample" });
    const held = out.filter((c) => c.stages["combine"] !== null);
    expect(held.length).toBeGreaterThan(0);
    for (const c of held) expect(c.stages["combine"]!.members).toEqual([]);
    expect(out.filter((c) => checkConfig(space, c).length > 0)).toEqual([]);
  });

  it("stays usable when no base config supports the kinds of the input", () => {
    const shaped: StrategySpace = {
      ...space,
      stages: [
        { name: "routing", options: [{ id: "a", params: [], supports: { shape: ["rect"] } }] },
        { name: "combine", optional: true, options: [{ id: "portfolio", params: [], supports: { shape: ["rect", "circle"] }, members: noList }] },
      ],
    };
    expect(spaceSize(shaped, { levels: 1, shapes: ["circle"] }).meta).toBe(1n);
    expect(enumerateSpace(shaped, { mode: "sample", n: 4, seed: 3, meta: "sample", shapes: ["circle"] }).every((c) => c.stages["combine"]?.option === "portfolio")).toBe(true);
  });
});

describe("the pool of a meta option (L39)", () => {
  // A model of cell-portfolio of packing: one fixed list of 11 members, unordered, with a param of 3 values.
  const grid = enumerateSpace(pack, { mode: "grid", levels: 3 });
  const eleven = grid.slice(0, 11);
  const cellPortfolio = (pool?: readonly (readonly StrategyConfig[])[]): StageOption => ({
    id: "cell-portfolio",
    params: [{ name: "k", kind: "enum", values: ["cell", 2, 3], default: "cell" }],
    members: { min: 11, max: 11, ordered: false, ...(pool === undefined ? {} : { pool }) },
  });
  const withCell = (option: StageOption, from: StrategySpace = pack): StrategySpace => ({
    ...from,
    stages: from.stages.map((s) => (s.name === "combine" ? { ...s, options: [...s.options, option] } : s)),
  });
  const pooled = withCell(cellPortfolio([eleven]));
  const open = withCell(cellPortfolio());
  const cellConfig = (members: readonly StrategyConfig[], k: string | number = "cell"): StrategyConfig => ({
    space: "pack",
    stages: { combine: { option: "cell-portfolio", params: { k }, members } },
  });
  const choose = (n: bigint, k: bigint): bigint => {
    let out = 1n;
    for (let i = 0n; i < k; i++) out = (out * (n - i)) / (i + 1n);
    return out;
  };

  it("keeps each configId: the pool is not part of a config or of its id", () => {
    expect(checkSpace(pooled)).toEqual([]);
    expect(configId(pooled, maxrectsCp)).toBe(PINNED);
    expect(configId(pooled, pack.named!["portfolio-k2"]!)).toBe(configId(pack, pack.named!["portfolio-k2"]!));
    expect(configId(pooled, cellConfig(eleven))).toBe(configId(open, cellConfig(eleven)));
    expect(configId(pooled, cellConfig([...eleven].reverse()))).toBe(configId(pooled, cellConfig(eleven)));
  });

  it("counts the option once for each pool entry: a pool of 1 list gives the multiplier 1", () => {
    const portfolio = spaceSize(pack, { levels: 3 }).meta!;
    expect(spaceSize(pooled, { levels: 3 })).toEqual({ base: 216n, meta: portfolio + 3n * 1n });
    expect(spaceSize(open, { levels: 3, maxMeta: 10n ** 30n }).meta).toBe(portfolio + 3n * choose(216n, 11n));
    const two = withCell(cellPortfolio([eleven, grid.slice(11, 22)]));
    expect(spaceSize(two, { levels: 3 }).meta).toBe(portfolio + 3n * 2n);
    expect(spaceSize(pooled, { levels: 3, maxMeta: portfolio }).meta).toBeNull();
  });

  it("refuses a member list that is not in the pool, in any order of an unordered rule", () => {
    expect(checkConfig(pooled, cellConfig(eleven))).toEqual([]);
    expect(checkConfig(pooled, cellConfig([...eleven].reverse(), 2))).toEqual([]);
    const other = checkConfig(pooled, cellConfig([...eleven.slice(1), grid[11]!]));
    expect(other.map((b) => [b.claim, b.detail])).toEqual([["pool", "the option combine.cell-portfolio has a member list that is not in its pool of 1 list"]]);
    expect(checkConfig(pooled, cellConfig(eleven.slice(1))).map((b) => b.claim)).toEqual(["members"]);
    expect(checkConfig(open, cellConfig([...eleven.slice(1), grid[11]!]))).toEqual([]);
  });

  it("keeps the order of the members in an ordered pool", () => {
    const ordered = withCell({ ...cellPortfolio(), members: { min: 2, max: 2, ordered: true, pool: [[maxrectsCp, shelfFirst]] } });
    expect(checkSpace(ordered)).toEqual([]);
    expect(checkConfig(ordered, cellConfig([maxrectsCp, shelfFirst]))).toEqual([]);
    expect(checkConfig(ordered, cellConfig([shelfFirst, maxrectsCp])).map((b) => b.claim)).toEqual(["pool"]);
  });

  it("finds a bad pool in checkSpace", () => {
    const of = (pool: unknown): string[][] => checkSpace(withCell(cellPortfolio(pool as StrategyConfig[][]))).map((b) => [b.claim, b.detail]);
    expect(of([])).toEqual([["pool", "the option combine.cell-portfolio has a pool that is not a list of one or more member lists"]]);
    expect(of([eleven, 3])).toEqual([["pool", "the option combine.cell-portfolio has a pool that is not a list of one or more member lists"]]);
    expect(of([eleven.slice(1)])).toEqual([["members", "the pool entry 0 of the option combine.cell-portfolio has 10 members, not 11 to 11"]]);
    expect(of([eleven, [...eleven].reverse()])).toEqual([["duplicate", "the pool entries 0 and 1 of the option combine.cell-portfolio have the same members"]]);
    const bad = [...eleven.slice(1), { space: "pack", stages: { order: { option: "area" }, placement: { option: "guillotine" } } }];
    expect(of([bad]).map((b) => b[0])).toEqual(["unknown"]);
    expect(of([[...eleven.slice(1), eleven[0]!]])).toEqual([]);
  });

  it("gives only pool entries in a sample, and no meta option in a grid", () => {
    const two = withCell(cellPortfolio([eleven, grid.slice(11, 22)]));
    const keys = new Set([eleven, grid.slice(11, 22)].map((e) => e.map((m) => configId(pack, m)).sort().join(",")));
    const sample = enumerateSpace(two, { mode: "sample", n: 60, seed: 4, meta: "sample" });
    expect(enumerateSpace(two, { mode: "sample", n: 60, seed: 4, meta: "sample" })).toEqual(sample);
    const cells = sample.filter((c) => c.stages["combine"]?.option === "cell-portfolio");
    expect(cells.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const c of cells) {
      expect(checkConfig(two, c)).toEqual([]);
      const key = c.stages["combine"]!.members!.map((m) => configId(pack, m)).join(",");
      expect(keys.has(key)).toBe(true);
      seen.add(key);
    }
    expect(seen.size).toBe(2);
    expect(enumerateSpace(two, { mode: "grid", levels: 3 })).toEqual(grid);
  });

  it("applies the shape filter to the members of each pool entry", () => {
    const shaped: StrategySpace = {
      ...pack,
      stages: pack.stages.map((s) => ({
        ...s,
        options: s.options.map((o) => (s.name !== "placement" ? o : { ...o, supports: { shape: o.id === "maxrects" ? ["rect"] : ["rect", "circle"] } })),
      })),
    };
    const circles = enumerateSpace(shaped, { mode: "grid", levels: 3, shapes: ["circle"] });
    expect(circles).toHaveLength(36);
    const round = circles.slice(0, 11);
    const space = withCell(cellPortfolio([round, eleven]), shaped);
    expect(checkSpace(space)).toEqual([]);
    // circle: 36 base configs. portfolio: C(36, 2) + C(36, 3) = 7770. cell-portfolio: 3 params x 1 entry that fits.
    expect(spaceSize(space, { levels: 3, shapes: ["circle"] })).toEqual({ base: 36n, meta: 7770n + 3n });
    expect(spaceSize(space, { levels: 3 }).meta).toBe(spaceSize(pack, { levels: 3 }).meta! + 3n * 2n);
    expect(spaceSize(space, { levels: 3, shapes: ["polygon"] })).toEqual({ base: 0n, meta: 0n });
    const sample = enumerateSpace(space, { mode: "sample", n: 40, seed: 2, meta: "sample", shapes: ["circle"] });
    const cells = sample.filter((c) => c.stages["combine"]?.option === "cell-portfolio");
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(checkConfig(space, c, { shapes: ["circle"] })).toEqual([]);
      expect(c.stages["combine"]!.members!.every((m) => m.stages["placement"]!.option === "shelf")).toBe(true);
    }
    const breaks = checkConfig(space, cellConfig(eleven), { shapes: ["circle"] });
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.every((b) => b.claim === "shape")).toBe(true);
  });
});

describe("the member view bounds (L57)", () => {
  // The placements support only rect. The meta option portfolio gives its members the bounding box of each item.
  const rectOnly: StrategySpace = {
    ...pack,
    stages: pack.stages.map((s) => ({ ...s, options: s.options.map((o) => (s.name === "placement" ? { ...o, supports: { shape: ["rect"] } } : o)) })),
  };
  const withMembers = (from: StrategySpace, change: (o: StageOption) => StageOption): StrategySpace => ({
    ...from,
    stages: from.stages.map((s) => (s.name === "combine" ? { ...s, options: s.options.map(change) } : s)),
  });
  const space = withMembers(rectOnly, (o) => ({ ...o, members: { ...o.members!, view: "bounds" } }));
  const k2 = pack.named!["portfolio-k2"]!;

  it("changes no count, config or id without a shape filter, or with rect only", () => {
    expect(checkSpace(space)).toEqual([]);
    expect(configId(space, k2)).toBe(configId(pack, k2));
    expect(spaceSize(space, { levels: 3 })).toEqual(spaceSize(pack, { levels: 3 }));
    expect(spaceSize(space, { levels: 3, shapes: ["rect"] })).toEqual(spaceSize(rectOnly, { levels: 3, shapes: ["rect"] }));
    expect(enumerateSpace(space, { mode: "sample", n: 30, seed: 3, meta: "sample" })).toEqual(enumerateSpace(pack, { mode: "sample", n: 30, seed: 3, meta: "sample" }));
    expect(enumerateSpace(space, { mode: "sample", n: 30, seed: 3, meta: "sample", shapes: ["rect"] })).toEqual(
      enumerateSpace(rectOnly, { mode: "sample", n: 30, seed: 3, meta: "sample", shapes: ["rect"] }),
    );
  });

  it("counts the meta configs of a non-rect input from the rect members", () => {
    // Without view, no member supports circle, so the count is 0. With view, the 216 rect configs give C(216, 2) + C(216, 3).
    expect(spaceSize(rectOnly, { levels: 3, shapes: ["circle"] })).toEqual({ base: 0n, meta: 0n });
    expect(spaceSize(space, { levels: 3, shapes: ["circle"] })).toEqual({ base: 0n, meta: 1679580n });
    expect(spaceSize(space, { levels: 3, shapes: ["polygon", "free"] }).meta).toBe(1679580n);
    expect(spaceShapeKinds(space)).toEqual(["rect"]);
  });

  it("checks the members with rect, and the option with the kinds of the input", () => {
    expect(checkConfig(rectOnly, k2, { shapes: ["circle"] }).map((b) => b.claim)).toEqual(["shape", "shape"]);
    expect(checkConfig(space, k2, { shapes: ["circle"] })).toEqual([]);
    expect(checkConfig(space, k2, { shapes: [] })).toEqual([]);
    const own = withMembers(space, (o) => ({ ...o, supports: { shape: ["rect"] } }));
    expect(checkSpace(own)).toEqual([]);
    expect(checkConfig(own, k2, { shapes: ["circle"] }).map((b) => b.detail)).toEqual(["the option combine.portfolio supports the shape kinds rect, not circle"]);
    expect(spaceSize(own, { levels: 3, shapes: ["circle"] })).toEqual({ base: 0n, meta: 0n });
  });

  it("samples meta configs with rect members for a non-rect input", () => {
    const sample = enumerateSpace(space, { mode: "sample", n: 20, seed: 1, meta: "sample", shapes: ["circle"] });
    expect(sample).toHaveLength(20);
    expect(enumerateSpace(space, { mode: "sample", n: 20, seed: 1, meta: "sample", shapes: ["circle"] })).toEqual(sample);
    for (const c of sample) {
      expect(c.stages["combine"]?.option).toBe("portfolio");
      expect(checkConfig(space, c, { shapes: ["circle"] })).toEqual([]);
    }
    expect(() => enumerateSpace(space, { mode: "sample", n: 5, seed: 1, shapes: ["circle"] })).toThrow(/placement/);
    expect(() => enumerateSpace(rectOnly, { mode: "sample", n: 5, seed: 1, meta: "sample", shapes: ["circle"] })).toThrow(/placement/);
    expect(enumerateSpace(space, { mode: "grid", levels: 1, shapes: ["circle"] })).toEqual([]);
  });

  it("keeps the pool entries whose members fit the rect space", () => {
    const grid = enumerateSpace(pack, { mode: "grid", levels: 1 });
    const cell = (view?: "bounds"): StageOption => ({
      id: "cell",
      params: [],
      members: { min: 2, max: 2, ordered: false, pool: [grid.slice(0, 2)], ...(view === undefined ? {} : { view }) },
    });
    const add = (option: StageOption): StrategySpace => ({
      ...space,
      stages: space.stages.map((s) => (s.name === "combine" ? { ...s, options: [...s.options, option] } : s)),
    });
    const portfolio = spaceSize(space, { levels: 1, shapes: ["circle"] }).meta!;
    expect(portfolio).toBe(42n * 41n / 2n + 42n * 41n * 40n / 6n);
    expect(checkSpace(add(cell("bounds")))).toEqual([]);
    expect(spaceSize(add(cell("bounds")), { levels: 1, shapes: ["circle"] })).toEqual({ base: 0n, meta: portfolio + 1n });
    expect(spaceSize(add(cell()), { levels: 1, shapes: ["circle"] })).toEqual({ base: 0n, meta: portfolio });
    const sample = enumerateSpace(add(cell("bounds")), { mode: "sample", n: 10, seed: 2, meta: "sample", shapes: ["circle"] });
    expect(sample.some((c) => c.stages["combine"]?.option === "cell")).toBe(true);
  });

  it("refuses an unknown view", () => {
    const bad = withMembers(pack, (o) => ({ ...o, members: { ...o.members!, view: "hull" as never } }));
    expect(checkSpace(bad).map((b) => [b.claim, b.detail])).toEqual([["view", 'the option combine.portfolio has the member view "hull", not "bounds"']]);
  });
});

describe("a sample with a shape filter (0.2.17)", () => {
  const onPlacement = (from: StrategySpace, shape: (id: string) => readonly ShapeKind[]): StrategySpace => ({
    ...from,
    stages: from.stages.map((s) => ({ ...s, options: s.options.map((o) => (s.name === "placement" ? { ...o, supports: { shape: shape(o.id) } } : o)) })),
  });
  const withCombine = (from: StrategySpace, options: (list: readonly StageOption[]) => StageOption[]): StrategySpace => ({
    ...from,
    stages: from.stages.map((s) => (s.name === "combine" ? { ...s, options: options(s.options) } : s)),
  });
  const shaped = onPlacement(pack, (id) => (id === "maxrects" ? ["rect"] : ["rect", "circle"]));
  const rectOnly = onPlacement(pack, () => ["rect"]);
  const bounds = withCombine(rectOnly, (list) => list.map((o) => ({ ...o, members: { ...o.members!, view: "bounds" as const } })));
  // The gap of 0.2.16: a meta option without view next to a meta option with the view bounds. For circle, no member of cell supports the kind.
  const cell: StageOption = { id: "cell", params: [], members: { min: 2, max: 2, ordered: false } };
  const twoMeta = withCombine(bounds, (list) => [...list, cell]);
  const base = enumerateSpace(pack, { mode: "grid", levels: 1 });
  const pooled = withCombine(shaped, (list) => [...list, { id: "fixed", params: [], members: { min: 2, max: 2, ordered: false, pool: [base.slice(0, 2), base.slice(30, 32)] } }]);
  const spaces: Readonly<Record<string, StrategySpace>> = { pack, route, joint: productSpace(pack, route, "joint"), shaped, rectOnly, bounds, twoMeta, pooled };
  const filters: readonly (readonly ShapeKind[] | undefined)[] = [undefined, ...SHAPE_KIND_IDS.map((k) => [k]), ["rect", "circle"]];

  interface Run {
    readonly key: string;
    readonly group: string;
    readonly options: SampleOptions;
  }
  const runs: Run[] = [];
  for (const shapes of filters)
    for (const meta of ["skip", "sample"] as const)
      for (const seed of [1, 2])
        for (const n of [1, 3, 17]) {
          const group = `${shapes?.join("+") ?? "-"}/${meta}`;
          runs.push({ key: `${group}/${seed}/${n}`, group, options: { mode: "sample", n, seed, meta, ...(shapes === undefined ? {} : { shapes }) } });
        }
  /** This function gives the short form of the keys of the runs that threw: `<group>/*` when each run of the group threw. */
  const short = (keys: readonly string[]): string[] => {
    const groups = [...new Set(runs.map((r) => r.group))];
    return groups.flatMap((g) => {
      const own = runs.filter((r) => r.group === g).map((r) => r.key);
      const threw = own.filter((k) => keys.includes(k));
      return threw.length === own.length ? [`${g}/*`] : threw;
    });
  };
  const threwIn = (list: readonly string[], run: Run): boolean => list.includes(run.key) || list.includes(`${run.group}/*`);

  it("gives the samples of 0.2.16 byte for byte for each run that 0.2.16 completed", () => {
    // The code of 0.2.16 gave these pins: the count of the completed runs, the SHA-256 of their samples, and the runs that threw.
    // A run with n = 1 and the option skip draws the first option of each stage in each round, so a constraint on that option throws for shaped and pooled.
    const PINS_0_2_16: Readonly<Record<string, { readonly done: string; readonly threw: readonly string[] }>> = {
      pack: { done: "72:964f5a1e6a059d72", threw: [] },
      route: { done: "72:798cff91671ff7b8", threw: [] },
      joint: { done: "72:63c9b13de727abc3", threw: [] },
      shaped: {
        done: "44:9097d25dab8f14de",
        threw: ["polygon/skip/*", "polygon/sample/*", "circle/skip/1/1", "circle/skip/2/1", "free/skip/*", "free/sample/*", "rect+circle/skip/1/1", "rect+circle/skip/2/1"],
      },
      rectOnly: {
        done: "24:628909e64f6ed175",
        threw: ["polygon/skip/*", "polygon/sample/*", "circle/skip/*", "circle/sample/*", "free/skip/*", "free/sample/*", "rect+circle/skip/*", "rect+circle/sample/*"],
      },
      bounds: { done: "48:943e118883d2a2e5", threw: ["polygon/skip/*", "circle/skip/*", "free/skip/*", "rect+circle/skip/*"] },
      twoMeta: {
        done: "32:afdf82edad9da223",
        threw: [
          "polygon/skip/*",
          "polygon/sample/1/3",
          "polygon/sample/1/17",
          "polygon/sample/2/3",
          "polygon/sample/2/17",
          "circle/skip/*",
          "circle/sample/1/3",
          "circle/sample/1/17",
          "circle/sample/2/3",
          "circle/sample/2/17",
          "free/skip/*",
          "free/sample/1/3",
          "free/sample/1/17",
          "free/sample/2/3",
          "free/sample/2/17",
          "rect+circle/skip/*",
          "rect+circle/sample/1/3",
          "rect+circle/sample/1/17",
          "rect+circle/sample/2/3",
          "rect+circle/sample/2/17",
        ],
      },
      pooled: {
        done: "44:182754e9cb2e9ccc",
        threw: ["polygon/skip/*", "polygon/sample/*", "circle/skip/1/1", "circle/skip/2/1", "free/skip/*", "free/sample/*", "rect+circle/skip/1/1", "rect+circle/skip/2/1"],
      },
    };
    const got: Record<string, { done: string; threw: string[] }> = {};
    for (const [name, space] of Object.entries(spaces)) {
      const skip = PINS_0_2_16[name]?.threw ?? [];
      const hash = createHash("sha256");
      let done = 0;
      const threw: string[] = [];
      for (const run of runs) {
        if (threwIn(skip, run)) continue;
        let sample: StrategyConfig[];
        try {
          sample = enumerateSpace(space, run.options);
        } catch {
          threw.push(run.key);
          continue;
        }
        done++;
        hash.update(`${run.key}\n${canonicalJson(sample)}\n`);
      }
      got[name] = { done: `${done}:${hash.digest("hex").slice(0, 16)}`, threw: short(threw) };
    }
    // Each run that 0.2.16 completed gives the same samples, and none of them throws.
    const want = Object.fromEntries(Object.entries(PINS_0_2_16).map(([k, p]) => [k, { done: p.done, threw: [] }]));
    expect(got).toEqual(want);
  });

  it("skips a meta option without a member list, as spaceSize gives it 0", () => {
    // For circle, portfolio has rect members through its view, and cell has no member config.
    expect(spaceSize(twoMeta, { levels: 3, shapes: ["circle"] })).toEqual(spaceSize(bounds, { levels: 3, shapes: ["circle"] }));
    for (const seed of [1, 2, 3]) {
      const sample = enumerateSpace(twoMeta, { mode: "sample", n: 17, seed, meta: "sample", shapes: ["circle"] });
      expect(sample).toHaveLength(17);
      for (const c of sample) {
        expect(c.stages["combine"]?.option).toBe("portfolio");
        expect(checkConfig(twoMeta, c, { shapes: ["circle"] })).toEqual([]);
      }
    }
    // For rect, cell has members, so the sample can choose it.
    const rect = enumerateSpace(twoMeta, { mode: "sample", n: 40, seed: 1, meta: "sample", shapes: ["rect"] });
    expect(rect.some((c) => c.stages["combine"]?.option === "cell")).toBe(true);
  });

  it("throws a RangeError that names the shapes, the stages and the meta options only for a space without a config", () => {
    const error = (space: StrategySpace, options: Omit<SampleOptions, "mode" | "n" | "seed">): string => {
      try {
        enumerateSpace(space, { mode: "sample", n: 5, seed: 1, ...options });
      } catch (e) {
        expect(e).toBeInstanceOf(RangeError);
        return (e as Error).message;
      }
      return "no error";
    };
    expect(error(rectOnly, { meta: "sample", shapes: ["circle"] })).toBe(
      'The space pack has no config for a sample with the shape kinds circle. The stage placement has no option for these kinds. The meta option combine.portfolio has no member config for these kinds. Set members.view to "bounds" when the members see only the bounding boxes.',
    );
    expect(error(twoMeta, { shapes: ["circle"] })).toBe("The space pack has no config for a sample with the shape kinds circle. The stage placement has no option for these kinds.");
    expect(error(spaces["joint"]!, { meta: "sample", shapes: ["polygon"] })).toBe("no error");
    const closed = onPlacement(twoMeta, () => ["rect"]);
    const both = withCombine(closed, (list) => list.map((o) => ({ ...o, supports: { shape: ["rect"] } })));
    expect(error(both, { meta: "sample", shapes: ["free"] })).toBe("The space pack has no config for a sample with the shape kinds free. The stage placement has no option for these kinds.");
  });

  it("gives only configs that checkConfig accepts for the same shapes, and throws the RangeError exactly when the space has no config", () => {
    let completed = 0;
    for (const [name, space] of Object.entries(spaces))
      for (const shapes of filters)
        for (const meta of ["skip", "sample"] as const) {
          const size = spaceSize(space, { levels: 3, maxMeta: 10n ** 30n, ...(shapes === undefined ? {} : { shapes }) });
          const none = size.base + (meta === "sample" ? size.meta! : 0n) === 0n;
          for (let seed = 1; seed <= 4; seed++)
            for (const n of [1, 3, 17]) {
              const at = `${name}/${shapes?.join("+") ?? "-"}/${meta}/${seed}/${n}`;
              let sample: StrategyConfig[] = [];
              let message = "";
              try {
                sample = enumerateSpace(space, { mode: "sample", n, seed, meta, ...(shapes === undefined ? {} : { shapes }) });
              } catch (e) {
                message = e instanceof RangeError ? `RangeError ${(e as Error).message}` : (e as Error).message;
              }
              expect(message.startsWith("RangeError The space"), at).toBe(none);
              if (message !== "") continue;
              completed++;
              expect(sample, at).toHaveLength(n);
              for (const c of sample) expect(checkConfig(space, c, shapes === undefined ? {} : { shapes }), at).toEqual([]);
            }
        }
    expect(completed).toBeGreaterThan(700);
  });
});

describe("the fixed options of a sample (L122)", () => {
  const options = { mode: "sample", n: 60, seed: 3 } as const;

  it("gives the fixed option at the fixed stage of each config, and each config keeps the constraints", () => {
    const out = enumerateSpace(pack, { ...options, fixed: { placement: "shelf" } });
    expect(out).toHaveLength(60);
    for (const c of out) {
      expect(c.stages["placement"]?.option).toBe("shelf");
      expect(checkConfig(pack, c)).toEqual([]);
    }
    // Flip: without fixed, the sample has more than one placement.
    expect(new Set(enumerateSpace(pack, options).map((c) => c.stages["placement"]?.option)).size).toBeGreaterThan(1);
  });

  it("gives the same configs for the same seed, and fixes an optional stage with the walk draw", () => {
    const one = enumerateSpace(pack, { ...options, fixed: { local: "anneal" }, draw: "walk" });
    expect(enumerateSpace(pack, { ...options, fixed: { local: "anneal" }, draw: "walk" })).toEqual(one);
    // The constraint of anneal needs maxrects, so each config has maxrects.
    for (const c of one) expect([c.stages["local"]?.option, c.stages["placement"]?.option]).toEqual(["anneal", "maxrects"]);
  });

  it("draws a fixed stage first with the walk draw, so a large stage draws only the options that keep the constraints with it", () => {
    // The stage small with b1 needs the option a0 of the stage wide, so 1 of 40 options of wide is open.
    const narrow: StrategySpace = {
      schema: STRATEGY_SPACE_SCHEMA,
      engine: "narrow",
      version: "0.0.1",
      stages: [
        { name: "wide", options: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, params: [] })) },
        { name: "small", options: [{ id: "b0", params: [] }, { id: "b1", params: [] }] },
      ],
      constraints: [{ if: { stage: "small", option: "b1" }, then: { stage: "wide", option: "a0" } }],
    };
    const tight = { ...options, maxTries: 200, fixed: { small: "b1" } };
    const out = enumerateSpace(narrow, { ...tight, draw: "walk" });
    expect(out).toHaveLength(60);
    for (const c of out) expect([c.stages["wide"]?.option, c.stages["small"]?.option]).toEqual(["a0", "b1"]);
    // Flip: the reject draw draws wide with no regard to small, and 200 tries give approximately 5 configs of 60.
    expect(() => enumerateSpace(narrow, { ...tight, draw: "reject" })).toThrow(/remove too many points/);
  });

  it("refuses a fixed option that the constraints forbid, with the broken constraint in the reason", () => {
    expect(() => enumerateSpace(pack, { ...options, fixed: { local: "anneal", placement: "shelf" } })).toThrow(
      "The constraints of the space pack forbid the fixed options local.anneal, placement.shelf. The broken constraints: if local is anneal, then placement is maxrects.",
    );
    // Flip: the same fixed options in a space with no constraints give a sample.
    const free = { ...pack, constraints: [] };
    for (const c of enumerateSpace(free, { ...options, fixed: { local: "anneal", placement: "shelf" } })) expect(c.stages["placement"]?.option).toBe("shelf");
  });

  it("refuses a fixed option that the constraints with the other stages forbid", () => {
    const chain: StrategySpace = {
      ...pack,
      named: {},
      constraints: [
        { if: { stage: "local", option: "anneal" }, then: { stage: "placement", option: "maxrects" } },
        { if: { stage: "placement", option: "maxrects" }, then: { not: { stage: "local", option: "anneal" } } },
      ],
    };
    expect(() => enumerateSpace(chain, { ...options, fixed: { local: "anneal" } })).toThrow(/^The space pack has no config with the fixed options local\.anneal\. No constraint between two fixed options breaks/);
  });

  it("refuses a stage or an option that the space does not have, and a meta option without meta sample", () => {
    expect(() => enumerateSpace(pack, { ...options, fixed: { nowhere: "shelf" } })).toThrow("The option fixed names the stage nowhere, and the space pack has no such stage.");
    expect(() => enumerateSpace(pack, { ...options, fixed: { placement: "none" } })).toThrow("The option fixed names the option none of the stage placement, and the stage has no such option.");
    const metaStage = pack.stages.find((s) => s.options.some((o) => o.members !== undefined))!;
    const metaOption = metaStage.options.find((o) => o.members !== undefined)!;
    expect(() => enumerateSpace(pack, { ...options, fixed: { [metaStage.name]: metaOption.id } })).toThrow(/a sample with meta skip has no meta option\. Set meta to "sample"\.$/);
    // A bad key refuses also for n 0, so a caller sees the error before a large run.
    expect(() => enumerateSpace(pack, { ...options, n: 0, fixed: { nowhere: "shelf" } })).toThrow(RangeError);
  });

  it("gives a fixed meta option with meta sample, and no other stage of its part has an option", () => {
    const metaStage = pack.stages.find((s) => s.options.some((o) => o.members !== undefined))!;
    const metaOption = metaStage.options.find((o) => o.members !== undefined)!;
    const out = enumerateSpace(pack, { ...options, meta: "sample", fixed: { [metaStage.name]: metaOption.id } });
    expect(out).toHaveLength(60);
    for (const c of out) {
      expect(c.stages[metaStage.name]?.option).toBe(metaOption.id);
      expect(checkConfig(pack, c)).toEqual([]);
    }
  });

  it("keeps a fixed base option when a meta option of another stage of its part can be drawn", () => {
    const metaStage = pack.stages.find((s) => s.options.some((o) => o.members !== undefined))!;
    const base = pack.stages.find((s) => s !== metaStage && !s.optional)!;
    const id = base.options.find((o) => o.members === undefined)!.id;
    const out = enumerateSpace(pack, { ...options, meta: "sample", fixed: { [base.name]: id } });
    expect(out).toHaveLength(60);
    for (const c of out) expect(c.stages[base.name]?.option).toBe(id);
  });

  it("refuses a fixed option that the shape filter removes", () => {
    const rectOnly: StrategySpace = {
      ...pack,
      named: {},
      stages: pack.stages.map((s) => (s.name === "placement" ? { ...s, options: s.options.map((o) => (o.id === "shelf" ? { ...o, supports: { shape: ["rect"] } } : o)) } : s)),
    };
    const other = SHAPE_KIND_IDS.find((k) => k !== "rect")!;
    expect(() => enumerateSpace(rectOnly, { ...options, shapes: [other], fixed: { placement: "shelf" } })).toThrow(
      `The fixed option placement.shelf of the space pack does not support the shape kinds ${other}.`,
    );
    // Flip: with the kind rect, the fixed option stays.
    for (const c of enumerateSpace(rectOnly, { ...options, shapes: ["rect"], fixed: { placement: "shelf" } })) expect(c.stages["placement"]?.option).toBe("shelf");
  });
});
