// Each option of the playground starts from a config that passes `checkConfig`, with no change by the user.
import { checkConfig } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import manifestText from "../../joint/corpus/joint-v2/corpus.json?raw";
import { buildCatalog } from "./build-catalog.ts";
import { PACK_STAGE, ROUTE_STAGE } from "./catalog.ts";
import { configOfState } from "./form.ts";
import { RECIPES } from "./recipes.ts";

const catalog = buildCatalog(manifestText, { packing: "test", highways: "test", contract: "test" });

describe("the defaults of the playground", () => {
  for (const [space, stage] of [
    [catalog.pack, PACK_STAGE],
    [catalog.route, ROUTE_STAGE],
  ] as const) {
    it(`gives a good config for each option of ${space.engine} with its defaults`, () => {
      const bad: string[] = [];
      for (const o of space.stages.find((s) => s.name === stage)!.options) {
        const config = configOfState(space, stage, { option: o.id, params: {} });
        for (const v of checkConfig(space, config)) bad.push(`${o.id}: ${v.detail}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it("gives a good config for each recipe, and each pair of a recipe is a named pair", () => {
    const named = Object.keys(catalog.joint.named ?? {});
    for (const r of RECIPES) {
      if (r.pair !== undefined) {
        expect(named, r.id).toContain(r.pair);
        continue;
      }
      expect(checkConfig(catalog.pack, configOfState(catalog.pack, PACK_STAGE, r.pack!)), r.id).toEqual([]);
      expect(checkConfig(catalog.route, configOfState(catalog.route, ROUTE_STAGE, r.route!)), r.id).toEqual([]);
    }
  });
});
