// The completeness test of the joint pages: each strategy and each option of the engines has a place on the compare page and in the playground.
import { iterEntries, JOINT_SPACE, laneEntries, laneSpace, OPEN_ROUTERS, PACK_ENTRIES, pairId, ROUTERS } from "@layout-contract/joint/browser";
import { checkSpace } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import manifestText from "../../joint/corpus/joint-v2/corpus.json?raw";
import { buildCatalog } from "./build-catalog.ts";
import { LANE_STAGE, laneFormSpace, LANE_TEXT, PACK_STAGE, ROUTE_STAGE, VARIANT_TEXT } from "./catalog.ts";
import { declaredOptions, inForms, packExtraKeys, registryIds } from "./engines.ts";
import { formHtml } from "./form.ts";
import { PRESETS } from "./inputs.ts";

const versions = { packing: "test", highways: "test", contract: "test" };
const catalog = buildCatalog(manifestText, versions);
const ids = registryIds();
const packs = [...catalog.benchPacks, ...catalog.extraPacks];
const stageOf = (engine: string): string => (engine === "packing" ? PACK_STAGE : ROUTE_STAGE);
const spaceOf = (engine: string) => (engine === "packing" ? catalog.pack : catalog.route);

describe("the lists of the joint pages", () => {
  it("has each strategy of the registry of packing, and marks the entries of the benchmark", () => {
    expect([...new Set(packs.map((p) => p.strategy))].sort()).toEqual([...ids.packing].sort());
    const shown = PACK_ENTRIES.filter(inForms);
    expect(catalog.benchPacks.map((p) => p.id)).toEqual(shown.map((e) => e.id));
    for (const p of catalog.extraPacks) expect(shown.some((e) => e.strategy === p.strategy)).toBe(false);
  });

  it("has each router of the registry of highways, as a router of the benchmark or an open router", () => {
    expect([...catalog.routers, ...catalog.openRouters].sort()).toEqual([...ids.highways].sort());
    expect(catalog.routers).toEqual([...ROUTERS]);
    expect(catalog.openRouters).toEqual([...OPEN_ROUTERS]);
    for (const r of catalog.openRouters) expect(ROUTERS).not.toContain(r);
  });

  it("has an option of the space for each strategy and each router", () => {
    const options = (engine: string) => spaceOf(engine).stages.find((s) => s.name === stageOf(engine))!.options.map((o) => o.id);
    expect(options("packing").sort()).toEqual([...ids.packing].sort());
    expect(options("highways").sort()).toEqual([...ids.highways].sort());
  });

  it("has a pair of the joint space for each pack entry and each router, and each lane pair and iteration pair", () => {
    const named = Object.keys(catalog.joint.named ?? {});
    expect(named).toHaveLength(packs.length * catalog.routers.length + catalog.jointPairs.length);
    for (const p of packs) for (const r of catalog.routers) expect(named).toContain(`${p.id}+${r}`);
    for (const j of catalog.jointPairs) expect(named).toContain(j.pair);
  });

  it("has each lane pair and each iteration pair of the joint package, with the names of JOINT_SPACE", () => {
    const expected = [...laneEntries().map((e) => pairId(e.id, e.router)), ...iterEntries().map((e) => pairId(e.id, e.router))];
    expect(catalog.jointPairs.map((j) => j.pair)).toEqual(expected);
    const plain = new Set(PACK_ENTRIES.flatMap((p) => ROUTERS.map((r) => pairId(p.id, r))));
    const joint = Object.keys(JOINT_SPACE.named ?? {}).filter((n) => !plain.has(n));
    expect(catalog.jointPairs.map((j) => j.pair).sort()).toEqual(joint.sort());
    for (const j of catalog.jointPairs) {
      const base = j.lane ?? j.iter!;
      expect(catalog.benchPacks.map((p) => p.id)).toContain(base.pack);
      expect(catalog.routers).toContain(base.router);
      expect(VARIANT_TEXT[base.variant.name], base.variant.name).toBeTruthy();
    }
  });

  it("has the stage of the joint options of the joint package, and a line for each option", () => {
    expect(catalog.lanes).toEqual(laneSpace());
    const options = catalog.lanes.stages.find((s) => s.name === LANE_STAGE)!.options.map((o) => o.id);
    expect(options.length).toBeGreaterThan(0);
    for (const o of laneFormSpace(catalog.lanes).stages[0]!.options) expect(LANE_TEXT[o.id], o.id).toBeTruthy();
  });
});

describe("the controls of the playground", () => {
  it("has a control for each declared option of each strategy", () => {
    const declared = declaredOptions();
    const extras = packExtraKeys();
    const missing: string[] = [];
    for (const engine of ["packing", "highways"] as const) {
      for (const [id, keys] of Object.entries(declared[engine])) {
        const all = [...keys, ...(engine === "packing" ? (extras[id] ?? []) : [])];
        for (const key of all) if (!catalog.controls.some((c) => c.engine === engine && c.option === id && c.key === key)) missing.push(`${engine} ${id}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("leaves out only the benchmark entries with a member or a table, until roadmap item L80", () => {
    expect(PACK_ENTRIES.filter((e) => !inForms(e)).map((e) => e.id)).toEqual(["anneal-maxrects-bl-k16", "anneal-skyline-k16", "genetic-maxrects-bl-k16", "tabu-maxrects-bl-k16", "pack"]);
  });

  it("gives each option of the benchmark entries a param or a fixed control", () => {
    const missing: string[] = [];
    for (const e of PACK_ENTRIES.filter(inForms))
      for (const key of Object.keys(e.options)) if (!catalog.controls.some((c) => c.engine === "packing" && c.option === e.strategy && c.key === key)) missing.push(`${e.id}.${key}`);
    expect(missing).toEqual([]);
  });

  it("draws an input for each param of each option of the two spaces", () => {
    const missing: string[] = [];
    for (const engine of ["packing", "highways"] as const) {
      const space = spaceOf(engine);
      const stage = stageOf(engine);
      const facts = { controls: catalog.controls.filter((c) => c.engine === engine), about: {} };
      for (const option of space.stages[0]!.options) {
        const html = formHtml(space, stage, { option: option.id, params: {} }, facts, "t.");
        for (const p of option.params) if (!html.includes(`data-p="${p.name}"`)) missing.push(`${engine} ${option.id}.${p.name}`);
        for (const c of facts.controls.filter((x) => x.option === option.id && x.kind === "fixed")) if (!html.includes(`<code>${c.key}</code>`)) missing.push(`${engine} ${option.id}.${c.key} (fixed)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives each param control the params of the space", () => {
    for (const c of catalog.controls) {
      const option = spaceOf(c.engine).stages[0]!.options.find((o) => o.id === c.option)!;
      for (const name of c.params) expect(option.params.map((p) => p.name)).toContain(name);
      if (c.kind === "param") expect(c.params.length).toBeGreaterThan(0);
    }
  });
});

describe("the spaces of the joint pages", () => {
  it("passes checkSpace for the pack space, the route space, the lane space and the joint space", () => {
    expect(checkSpace(catalog.pack)).toEqual([]);
    expect(checkSpace(catalog.route)).toEqual([]);
    expect(checkSpace(catalog.lanes)).toEqual([]);
    expect(checkSpace(laneFormSpace(catalog.lanes))).toEqual([]);
    expect(checkSpace(catalog.joint)).toEqual([]);
  });
});

describe("the inputs of the joint pages", () => {
  it("has each input of the committed manifest", () => {
    const manifest = JSON.parse(manifestText) as { inputs: { id: string }[] };
    expect(catalog.inputs.map((i) => i.id)).toEqual(manifest.inputs.map((i) => i.id));
  });

  it("gives each preset a valid value of each dimension, and 100 boxes or fewer", () => {
    for (const p of PRESETS) {
      expect(Object.keys(p.dims).sort()).toEqual(Object.keys(catalog.grid).sort());
      for (const [name, value] of Object.entries(p.dims)) expect(catalog.grid[name]).toContain(value);
      expect(p.count).toBeLessThanOrEqual(catalog.compareMaxBoxes);
    }
  });
});
