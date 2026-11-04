// The joint pack entries as points of `packSpace` (roadmap item L34). Each point has the output of its entry on a small set of inputs of `joint-v1`.
import { checkConfig, configId, type LayoutInput, type StrategySpace } from "@mark1russell7/layout-contract";
import { configOfStrategy, outputHash as packHash, packConfig, packSpace, packWith, UnsupportedCell, type PackOutput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointInput, jointSpecs, SET } from "./corpus.ts";
import { coverEntries } from "./cover.ts";
import { PACK_ENTRIES, packInputOf, readsLinks, type PackEntry } from "./runner.ts";

/** The strategy space of `packing`, with the type of `layout-contract`. */
const SPACE = packSpace as unknown as StrategySpace;

/** The strategies of the cover that `packSpace` does not hold. `packing` lists them apart from its registry, and each one wraps one standalone function. */
const OUTSIDE_SPACE: readonly string[] = ["sleator", "beam", "binary-height", "near-rects", "raster-nofit", "masonry", "treemap", "side-anchors"];

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

/** This function gives the output hash of a pack, or `unsupported` when the strategy does not support the input. A point and its entry have one of them. */
function hashOf(run: () => PackOutput): string {
  try {
    return packHash(run());
  } catch (error) {
    if (error instanceof UnsupportedCell) return "unsupported";
    throw error;
  }
}

describe("the pack entries of the cover as points of packSpace", () => {
  const entries: readonly PackEntry[] = [...PACK_ENTRIES, ...coverEntries()].filter((entry) => !OUTSIDE_SPACE.includes(entry.strategy));
  const points = entries.map((entry) => ({ entry, point: configOfStrategy(entry.strategy, entry.options) }));
  const inputs = testInputs();

  it("keeps the closed list of the strategies outside the space, and fails when one of them joins it", () => {
    const cover = coverEntries().map((entry) => entry.strategy);
    for (const id of OUTSIDE_SPACE) {
      expect(cover, id).toContain(id);
      expect(configOfStrategy(id, {}), id).toMatchObject({ ok: false });
    }
  });

  it("gives a point for each entry", () => {
    expect(entries.length).toBeGreaterThanOrEqual(32);
    for (const { entry, point } of points) expect(point, entry.id).toMatchObject({ ok: true });
  });

  it("gives points that pass the checks of packSpace, and an entry with no options has the id of its named config", () => {
    for (const { entry, point } of points) {
      if (!point.ok) continue;
      expect(checkConfig(SPACE, point.config), entry.id).toEqual([]);
      const named = SPACE.named?.[entry.id];
      if (named !== undefined && Object.keys(entry.options).length === 0) expect(configId(SPACE, point.config), entry.id).toBe(configId(SPACE, named));
    }
  });

  it("has 17 inputs of each container kind, with and without obstacles", () => {
    // `docs/STRATEGY-SPACE.md` gives this count.
    expect(inputs).toHaveLength(17);
    const kinds = new Set(inputs.map((input) => `${packInputOf(input).container.fixed}/${(packInputOf(input).obstacles?.length ?? 0) > 0}`));
    expect([...kinds].sort()).toEqual(["height/false", "height/true", "none/false", "none/true", "size/false", "size/true", "width/false", "width/true"]);
  });

  it("gives with packConfig the output hash of the entry on each input", () => {
    const packed = new Map<string, number>();
    for (const input of inputs) {
      const seed = input.seed ?? 0;
      for (const { entry, point } of points) {
        if (!point.ok) continue;
        const pack = inputFor(entry, input);
        const want = hashOf(() => packWith(entry.strategy, pack, entry.options, seed));
        expect(hashOf(() => packConfig(pack, point.config, seed)), `${entry.id} ${input.id}`).toBe(want);
        if (want !== "unsupported") packed.set(entry.id, (packed.get(entry.id) ?? 0) + 1);
      }
    }
    // An entry that is not supported on each input has no comparison of a hash.
    expect(entries.filter((entry) => !packed.has(entry.id))).toEqual([]);
  }, 300_000);
});
