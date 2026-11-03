// The joint pack entries as points of `packSpace` (roadmap item L34). Each point has the output of its entry on a small set of inputs of `joint-v1`.
import { checkConfig, configId, type LayoutInput } from "@mark1russell7/layout-contract";
import { outputHash as packHash, packConfig, packWith } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointInput, jointSpecs, SET } from "./corpus.ts";
import { PACK_SPACE, packPointOf } from "./pack-points.ts";
import { PACK_ENTRIES, packInputOf, readsLinks, type PackEntry } from "./runner.ts";

/**
 * The pack entries with no point in `packSpace` of `packing` 0.5.0, with a part of the reason of `packPointOf`.
 * - `pack`: the param `combine.select.table` holds only the table `k66`. The table `PACK_DEFAULT_TABLE` of the entry is not a value of it.
 * - `rows-graph-bfs` and `maxrects-bl-graph-bfs`: the stage `order` has no graph order, so the sort order `graph-bfs` has no option.
 */
const KNOWN_MISSES: Readonly<Record<string, string>> = Object.freeze({
  pack: "the param table of the option combine.select is not in its range",
  "rows-graph-bfs": "the stage order has no option graph-bfs",
  "maxrects-bl-graph-bfs": "the stage order has no option graph-bfs",
});

/** The largest count of boxes of an input of the set. */
const MAX_BOXES = 100;

/**
 * This function gives the inputs of the test: the first input of each container kind, obstacle case and box count, with at most `MAX_BOXES` boxes.
 * Each input is the first seed of its spec in `joint-v1`. The set leaves out a container of free size with 100 boxes, because its size search takes approximately 6 to 15 s.
 */
function testInputs(): LayoutInput[] {
  const picks = new Map<string, LayoutInput>();
  for (const spec of jointSpecs(SET)) {
    const { input } = jointInput(spec, spec.seeds[0]!, SET);
    const pack = packInputOf(input);
    const count = input.boxes.length;
    if (count > MAX_BOXES || (pack.container.fixed === "none" && count === MAX_BOXES)) continue;
    const key = `${pack.container.fixed}/${(pack.obstacles?.length ?? 0) > 0}/${count}`;
    if (!picks.has(key)) picks.set(key, input);
  }
  return [...picks.values()];
}

/** This function gives the pack input of an entry, as the runner gives it: an entry of `readsLinks` gets the links of the edges. */
function inputFor(entry: PackEntry, input: LayoutInput): ReturnType<typeof packInputOf> {
  return packInputOf(input, readsLinks(entry) ? { links: true } : {});
}

describe("the pack entries as points of packSpace", () => {
  const points = PACK_ENTRIES.map((entry) => ({ entry, point: packPointOf(entry) }));
  const inputs = testInputs();

  it("gives a point for each entry, except the known misses with their reasons", () => {
    expect(PACK_ENTRIES).toHaveLength(20);
    for (const { entry, point } of points) {
      const miss = KNOWN_MISSES[entry.id];
      if (miss === undefined) expect(point, entry.id).toMatchObject({ ok: true });
      else expect(point.ok ? "a point" : point.reason, entry.id).toContain(miss);
    }
  });

  it("gives points that pass the checks of packSpace and have the id of the named config of the same name", () => {
    for (const { entry, point } of points) {
      if (!point.ok) continue;
      expect(checkConfig(PACK_SPACE, point.config), entry.id).toEqual([]);
      const named = PACK_SPACE.named?.[entry.id];
      if (named !== undefined) expect(configId(PACK_SPACE, point.config), entry.id).toBe(configId(PACK_SPACE, named));
    }
  });

  it("has 17 inputs of each container kind, with and without obstacles", () => {
    // `docs/STRATEGY-SPACE.md` gives this count.
    expect(inputs).toHaveLength(17);
    const kinds = new Set(inputs.map((input) => `${packInputOf(input).container.fixed}/${(packInputOf(input).obstacles?.length ?? 0) > 0}`));
    expect([...kinds].sort()).toEqual(["height/false", "height/true", "none/false", "none/true", "size/false", "size/true", "width/false", "width/true"]);
  });

  it("gives with packConfig the output hash of the entry on each input", () => {
    for (const input of inputs) {
      const seed = input.seed ?? 0;
      for (const { entry, point } of points) {
        if (!point.ok) continue;
        const pack = inputFor(entry, input);
        const want = packHash(packWith(entry.strategy, pack, entry.options, seed));
        expect(packHash(packConfig(pack, point.config, seed)), `${entry.id} ${input.id}`).toBe(want);
      }
    }
  }, 60_000);
});
