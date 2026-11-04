import { composites, shapeStrategies, strategies } from "@mark1russell7/packing";
import { listStrategies, MEMBER_FORMS, routerStrategies, STRATEGIES } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { COVER_EXCEPTIONS, COVER_PACKS, COVER_ROUTERS, coverEntries, coverOptions, coverPairs, coverRouters, packStrategyIds } from "./cover.ts";
import { jointInput, jointSpecs, SET_V2 } from "./corpus.ts";
import { OPEN_ROUTERS, PACK_ENTRIES, pairId, pairRuns, ROUTERS } from "./runner.ts";

/** This function gives the pack part of a pair id. A router name can hold the separator, and a pack id does not. */
const packOf = (pair: string): string => pair.slice(0, pair.indexOf("+"));
/** This function gives the router part of a pair id. */
const routerOf = (pair: string): string => pair.slice(pair.indexOf("+") + 1);

describe("the cover of the catalogs", () => {
  it("reads each list of the registry of packing", () => {
    const ids = packStrategyIds();
    for (const list of [strategies, composites, shapeStrategies]) for (const s of list) expect(ids).toContain(s.id);
  });

  it("gives each strategy an entry, with only the listed exceptions", () => {
    const entries = new Set([...PACK_ENTRIES, ...coverEntries()].map((e) => e.strategy));
    expect(packStrategyIds().filter((id) => !entries.has(id)).sort()).toEqual(Object.keys(COVER_EXCEPTIONS).sort());
  });

  it("keeps the list of exceptions closed", () => {
    expect(Object.keys(COVER_EXCEPTIONS)).toEqual(["hole-degree"]);
    for (const e of Object.values(COVER_EXCEPTIONS)) {
      expect(e.reason).not.toBe("");
      expect(e.removedBy).toMatch(/^L\d+$/);
    }
  });

  it("fails on a router of the registry of highways that no list holds", () => {
    const held = new Set([...ROUTERS, ...coverRouters()]);
    const names = [...Object.keys(routerStrategies), ...listStrategies(STRATEGIES, "highway").map((s) => s.name), ...Object.keys(MEMBER_FORMS)];
    expect(names.filter((name) => !held.has(name))).toEqual([]);
  });

  it("gives no pair of the product, and each pair once", () => {
    const product = new Set(PACK_ENTRIES.flatMap((e) => ROUTERS.map((r) => pairId(e.id, r))));
    const pairs = coverPairs();
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.filter((p) => product.has(p))).toEqual([]);
  });

  it("gives each new entry the headline routers and each new router the anchor packs", () => {
    const pairs = new Set(coverPairs());
    for (const entry of coverEntries()) for (const router of COVER_ROUTERS) expect(pairs.has(pairId(entry.id, router)), entry.id).toBe(true);
    for (const router of coverRouters()) for (const pack of COVER_PACKS) expect(pairs.has(pairId(pack, router)), router).toBe(true);
  });

  it("names only known packs and routers, and holds each open router", () => {
    const { packs, routers, pairs } = coverOptions();
    const packIds = new Set(packs!.map((p) => p.id));
    const routerIds = new Set(routers as readonly string[]);
    expect(pairs!.filter((p) => !packIds.has(packOf(p)) || !routerIds.has(routerOf(p)))).toEqual([]);
    for (const name of OPEN_ROUTERS) expect(routerIds.has(name), name).toBe(true);
  });

  it("is far smaller than the full cross product", () => {
    const { packs, routers, pairs } = coverOptions();
    expect(pairs!.length).toBeLessThan((packs!.length * routers!.length) / 4);
  });
});

describe("the entries of the cover on the corpus", () => {
  // The small inputs of the corpus, with each container size, because a strategy can support only some sizes.
  const specs = jointSpecs(SET_V2).map((spec) => jointInput(spec, 1, SET_V2)).filter((made) => made.input.boxes.length > 0 && made.input.boxes.length < 50 && (made.input.edges?.length ?? 0) > 0);

  it("runs each new entry on some input, and an exception on no input", () => {
    const entries = coverEntries();
    const running = new Set<string>();
    for (const { input, entry } of specs) {
      const pending = entries.filter((e) => !running.has(e.id));
      if (pending.length === 0) break;
      for (const run of pairRuns(input, entry.cell, { corpus: SET_V2, packs: pending, routers: ["corners"], freeRoutes: true })) {
        if (run.record.skipped === undefined) running.add(packOf(run.record.strategy));
      }
    }
    expect(entries.map((e) => e.id).filter((id) => !running.has(id))).toEqual([]);
  }, 300_000);

  it("fails when an exception starts to run", () => {
    const exceptions = Object.keys(COVER_EXCEPTIONS).map((id) => ({ id, strategy: id, options: {} }));
    for (const { input, entry } of specs.slice(0, 3)) {
      for (const run of pairRuns(input, entry.cell, { corpus: SET_V2, packs: exceptions, routers: ["corners"], freeRoutes: true })) {
        expect(run.record.skipped, run.record.strategy).toBeDefined();
      }
    }
  }, 60_000);
});
