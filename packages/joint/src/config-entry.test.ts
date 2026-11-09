// The pack entries with a config of `packSpace` (roadmap item L148, step 7). A config entry packs with `packConfig`.
// The test pins that the config of a registry entry gives the records of that entry, and that a refusal of `packConfig` is a skip.
import { configId, type LayoutInput, type LayoutRecord, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { configOfStrategy, packSpace } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { packFacts, packProbe } from "./carry-probe.ts";
import { jointInput, jointSpecs, SET } from "./corpus.ts";
import { CONFIG_ID_PREFIX, CONFIG_PACK, configEntry, fullOptions, PACK_ENTRIES, readsLinks, runInput, type PackEntry } from "./runner.ts";

/** The strategy space of `packing`, with the type of `layout-contract`. */
const SPACE = packSpace as unknown as StrategySpace;

/** The registry entries of the test: single strategies, a graph order, and two meta strategies. */
const IDS: readonly string[] = ["rows", "skyline", "shelf-next", "maxrects-bl", "rows-graph-bfs", "select", "pack"];

/** The largest count of boxes of an input of the test. */
const MAX_BOXES = 30;

/** The count of inputs of `joint-v1` in the test. */
const INPUT_COUNT = 4;

/** The routers of the test. */
const ROUTERS: readonly string[] = ["straight", "corners"];

/** This function gives the registry entry with an id. */
function entryOf(id: string): PackEntry {
  const entry = PACK_ENTRIES.find((e) => e.id === id);
  if (entry === undefined) throw new RangeError(`There is no pack entry "${id}".`);
  return entry;
}

/** This function gives the config of `packSpace` of a registry entry. */
function pointOf(entry: PackEntry): StrategyConfig {
  const point = configOfStrategy(entry.strategy, entry.options);
  if (!point.ok) throw new RangeError(`The entry "${entry.id}" has no point: ${point.reason}`);
  return point.config;
}

/** This function gives the first inputs of `joint-v1` with at most `MAX_BOXES` boxes, each with the first seed of its spec. */
function testInputs(): LayoutInput[] {
  const out: LayoutInput[] = [];
  for (const spec of jointSpecs(SET)) {
    const { input } = jointInput(spec, spec.seeds[0]!, SET);
    if (input.boxes.length <= MAX_BOXES) out.push(input);
    if (out.length === INPUT_COUNT) break;
  }
  return out;
}

/** This function gives the facts of a record that a config entry and its registry entry share: the hashes, the skip and the measures without the times. */
function sameFacts(record: LayoutRecord): Record<string, unknown> {
  const measures = Object.fromEntries(Object.entries(record.measures).filter(([key]) => !key.endsWith(".ms") && !key.startsWith("time.")));
  return { input: record.input, outputHash: record.outputHash, skipped: record.skipped, hard: record.hard, measures };
}

describe("a pack entry with a config of packSpace", () => {
  const inputs = testInputs();

  it("has the canonical config, the strategy CONFIG_PACK, no options, and an id from configId", () => {
    const point = pointOf(entryOf("skyline"));
    const entry = configEntry(point);
    expect(entry.strategy).toBe(CONFIG_PACK);
    expect(entry.options).toEqual({});
    expect(entry.id).toBe(`${CONFIG_ID_PREFIX}${configId(SPACE, point)}`);
    expect(entry.id).toMatch(/^cfg-[0-9a-f]{16}$/);
    expect(configEntry(point, "my-skyline").id).toBe("my-skyline");
    expect(fullOptions(entry)).toEqual({ config: entry.config });
  });

  it("refuses a config with a break, and an id with the pair separator", () => {
    expect(() => configEntry({ space: SPACE.engine, stages: { placement: { option: "no-such-placement" } } })).toThrow(RangeError);
    expect(() => configEntry(pointOf(entryOf("rows")), "rows+corners")).toThrow(/pair separator/);
  });

  it("reads the links only for a config with a graph order", () => {
    expect(readsLinks(configEntry(pointOf(entryOf("rows-graph-bfs"))))).toBe(true);
    expect(readsLinks(configEntry(pointOf(entryOf("rows"))))).toBe(false);
    expect(readsLinks(configEntry(pointOf(entryOf("select"))))).toBe(false);
  });

  it("gives the records of its registry entry on each input, with the config in the options of the record", () => {
    expect(inputs).toHaveLength(INPUT_COUNT);
    for (const id of IDS) {
      const named = entryOf(id);
      const config = configEntry(pointOf(named));
      for (const input of inputs) {
        const a = runInput(input, undefined, { packs: [named], routers: ROUTERS });
        const b = runInput(input, undefined, { packs: [config], routers: ROUTERS });
        expect(b.map((r) => r.strategy)).toEqual(ROUTERS.map((router) => `${config.id}+${router}`));
        expect(b.map(sameFacts), `${id} ${input.id}`).toEqual(a.map(sameFacts));
        for (const r of b) {
          expect(r.options["packStrategy"]).toBe(CONFIG_PACK);
          expect(r.options["packOptions"]).toEqual({ config: config.config });
        }
      }
    }
  });

  it("gives the pack probe and the pack facts of the carry from the config", () => {
    const named = entryOf("maxrects-bl");
    const config = configEntry(pointOf(named));
    for (const input of inputs) expect(packProbe(config, input, undefined), input.id).toBe(packProbe(named, input, undefined));
    expect(packFacts([config]).get(config.id)).toEqual({ strategy: CONFIG_PACK, options: { config: config.config } });
  });

  it("skips a pair when packConfig refuses the shape kinds of the input", () => {
    const point = configOfStrategy("hole-degree", {});
    expect(point.ok).toBe(true);
    if (!point.ok) return;
    const [record] = runInput(inputs[0]!, undefined, { packs: [configEntry(point.config)], routers: ["straight"] });
    expect(record?.skipped).toMatch(/^The strategy does not support itemShape /);
  });
});
