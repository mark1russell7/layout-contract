// The joint pack entries as points of `packSpace` (roadmap item L34). Each point has the output of its entry on a small set of inputs of `joint-v1`.
import { checkConfig, configId, type LayoutInput, type StrategySpace } from "@mark1russell7/layout-contract";
import { configOfStrategy, outputHash as packHash, packConfig, packSpace, packWith, UnsupportedCell, type PackOutput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { CIRCLE_CONTAINERS, jointInput, jointSpecs, SET, SET_V3, shapeSpecs } from "./corpus.ts";
import { coverEntries } from "./cover.ts";
import { PACK_ENTRIES, packInputOf, readsLinks, type PackEntry } from "./runner.ts";

/** The strategy space of `packing`, with the type of `layout-contract`. */
const SPACE = packSpace as unknown as StrategySpace;

/**
 * The strategies of the cover that `packSpace` does not hold. Up to `packing` 0.7.0, 8 standalone strategies were outside the space.
 * Since `packing` 0.8.0, `packSpace` has a point for each of them (L129). Thus this list is empty, and each entry is a point of the test below.
 */
const OUTSIDE_SPACE: readonly string[] = [];

/**
 * The entries whose point gives, with `packConfig`, an output that is not the output of `packWith` (L129).
 * In `packing` 0.10.2, `packConfig` of the point of `side-anchors` packs 10 inputs that `packWith` refuses. On 1 more input, the two hashes are not equal.
 * On the circle input with a rectangle container, `packWith` packs `near-rects` and `raster-nofit`, but `packConfig` of their points refuses it (L94).
 * The runner uses `packWith`, so the records of the bench do not change. The fix belongs to `packing`.
 */
const KNOWN_DIFFER: readonly string[] = ["side-anchors", "near-rects", "raster-nofit"];

/**
 * The entries that support none of the inputs of the test, so the test compares no hash of them (L129).
 * In `packing` 0.10.2, `packWith` refuses each input of the set for `masonry` and `treemap`.
 */
const NO_TEST_INPUT: readonly string[] = ["masonry", "treemap"];

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

/**
 * This function gives the circle inputs of the test: the first input of each container of `CIRCLE_CONTAINERS`, from the array `shapes` of `joint-v3` (L94).
 * The inputs of `joint-v1` have only rectangle items, so `hole-degree` and `circle-quasi-physical` get a comparison of a hash only on these inputs.
 */
function circleInputs(): LayoutInput[] {
  const picks = new Map<string, LayoutInput>();
  for (const spec of shapeSpecs()) {
    const shape = spec.params["containerShape"];
    if (typeof shape !== "string" || picks.has(shape)) continue;
    picks.set(shape, jointInput(spec, spec.seeds[0]!, SET_V3).input);
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
  const circles = circleInputs();

  it("keeps the closed list of the strategies outside the space, and fails when one of them joins it", () => {
    const cover = coverEntries().map((entry) => entry.strategy);
    for (const id of OUTSIDE_SPACE) {
      expect(cover, id).toContain(id);
      expect(configOfStrategy(id, {}), id).toMatchObject({ ok: false });
    }
  });

  it("gives each strategy of the cover outside the list a point of packSpace", () => {
    const missing = coverEntries()
      .map((entry) => entry.strategy)
      .filter((id) => !OUTSIDE_SPACE.includes(id) && !configOfStrategy(id, {}).ok);
    expect(missing).toEqual([]);
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

  it("has one circle input for each container of CIRCLE_CONTAINERS", () => {
    expect(circles).toHaveLength(CIRCLE_CONTAINERS.length);
    for (const input of circles) expect(input.boxes.length, input.id).toBeLessThanOrEqual(MAX_BOXES);
  });

  it("gives with packConfig the output hash of the entry on each input", () => {
    const packed = new Map<string, number>();
    const differ = new Map<string, string[]>();
    for (const input of [...inputs, ...circles]) {
      const seed = input.seed ?? 0;
      for (const { entry, point } of points) {
        if (!point.ok) continue;
        const pack = inputFor(entry, input);
        const want = hashOf(() => packWith(entry.strategy, pack, entry.options, seed));
        const got = hashOf(() => packConfig(pack, point.config, seed));
        if (got !== want) differ.set(entry.id, [...(differ.get(entry.id) ?? []), `${input.id}: ${want} -> ${got}`]);
        if (want !== "unsupported") packed.set(entry.id, (packed.get(entry.id) ?? 0) + 1);
      }
    }
    // Each entry that differs is in the closed list, and each entry of the list differs. When `packing` fixes one, remove it from the list.
    expect([...differ.keys()].sort(), JSON.stringify(Object.fromEntries(differ), null, 1)).toEqual([...KNOWN_DIFFER].sort());
    // An entry that is not supported on each input has no comparison of a hash. The closed list `NO_TEST_INPUT` holds each such entry.
    expect(entries.filter((entry) => !packed.has(entry.id)).map((entry) => entry.id).sort()).toEqual([...NO_TEST_INPUT].sort());
  }, 300_000);
});
