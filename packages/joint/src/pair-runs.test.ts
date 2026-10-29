import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LayoutInput, LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { rankPairs } from "./analysis.ts";
import { jointCorpus, jointInput, jointSpecs, SET_V2 } from "./corpus.ts";
import { ITER_VARIANTS, iterEntries, LANE_VARIANTS, laneEntries } from "./lanes.ts";
import { PACK_ENTRIES, pairRuns, runInput } from "./runner.ts";

const three: LayoutInput = {
  schema: "layout-input/1",
  id: "test/three/s1",
  seed: 1,
  container: { fixed: "size", w: 200, h: 200 },
  boxes: [
    { id: "a", w: 20, h: 10 },
    { id: "b", w: 10, h: 10 },
    { id: "c", w: 30, h: 20 },
  ],
  edges: [
    { id: "e0", source: "a", target: "b", data: { collection: "c0" } },
    { id: "e1", source: "b", target: "c", data: { collection: "c1" } },
  ],
};

const small = { packs: PACK_ENTRIES.filter((p) => p.id === "rows" || p.id === "shelf" || p.id === "select"), routers: ["straight", "corners", "portfolio"] };

/** The facts of a record that do not depend on the clock. */
function stable(r: LayoutRecord): unknown {
  const measures = Object.fromEntries(Object.entries(r.measures).filter(([k]) => !k.endsWith(".ms") && !k.startsWith("time.")));
  return { strategy: r.strategy, options: r.options, hard: r.hard, outputHash: r.outputHash, skipped: r.skipped, measures };
}

describe("pairRuns", () => {
  it("gives the records of runInput, in the same order, with the pack and the routes of each pair", () => {
    const runs = [...pairRuns(three, undefined, small)];
    const records = runInput(three, undefined, small);
    expect(runs.map((r) => stable(r.record))).toEqual(records.map(stable));
    for (const run of runs) {
      expect(run.packed?.input.boxes).toHaveLength(3);
      expect(run.result?.routes).toHaveLength(2);
      expect(run.pack?.placements).toHaveLength(3);
    }
  });

  it("gives the same records with freeRoutes, with lane pairs, iteration pairs and shared pack outputs (L63)", () => {
    const lanes = laneEntries(LANE_VARIANTS.filter((v) => v.name === "lanes-sides"), ["rows"], ["corners"]);
    const iterate = iterEntries(ITER_VARIANTS.slice(0, 1), ["rows"], ["corners"]);
    const options = { ...small, lanes, iterate };
    const kept = [...pairRuns(three, undefined, options)];
    const freed = [...pairRuns(three, undefined, { ...options, freeRoutes: true })];
    expect(freed.map((r) => stable(r.record))).toEqual(kept.map((r) => stable(r.record)));
    // select gives the output of a member, so its pairs share a group. The freed router has no result there, and corners keeps it for the lane pairs.
    const select = freed.filter((r) => r.record.strategy.startsWith("select+"));
    expect(select.find((r) => r.record.strategy === "select+straight")?.result).toBeUndefined();
    expect(select.find((r) => r.record.strategy === "select+corners")?.result?.routes).toHaveLength(2);
  });

  it("routes with the options of a router entry, and writes them in the record", () => {
    const entry = { id: "corners-k2", router: "corners", options: { k: 2, margin: 12 } };
    const [plain, custom] = [...pairRuns(three, undefined, { packs: PACK_ENTRIES.slice(0, 1), routers: ["corners", entry] })];
    expect(plain!.record.strategy).toBe("rows+corners");
    expect(plain!.record.options).not.toHaveProperty("routerOptions");
    expect(custom!.record.strategy).toBe("rows+corners-k2");
    expect(custom!.record.options).toMatchObject({ router: "corners-k2", routerStrategy: "corners", routerOptions: { k: 2, margin: 12 } });
    expect(custom!.record.skipped).toBeUndefined();
  });

  it("stops after a pair when the caller stops", () => {
    const it = pairRuns(three, undefined, small);
    expect(it.next().value?.record.strategy).toBe("rows+straight");
    expect(it.return(undefined).done).toBe(true);
  });
});

describe("jointInput", () => {
  it("gives the input and the entry of the corpus for one seed of a spec", () => {
    const spec = jointSpecs(SET_V2).find((s) => s.array === "fixed")!;
    const { input, entry } = jointInput(spec, spec.seeds[0]!, SET_V2);
    const corpus = jointCorpus(SET_V2);
    const at = corpus.manifest.inputs.findIndex((e) => e.id === entry.id);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(entry).toEqual(corpus.manifest.inputs[at]);
    expect(input).toEqual(corpus.inputs[at]);
  });
});

describe("rankPairs", () => {
  it("ranks the pairs by the misses, then the score, and puts a skipped pair last", () => {
    const records = runInput(three, undefined, small);
    const skipped = { ...records[0]!, strategy: "push+straight", skipped: "The strategy does not support mode offline." };
    const ranks = rankPairs([...records, skipped]);
    expect(ranks).toHaveLength(records.length + 1);
    expect(ranks.at(-1)).toMatchObject({ pair: "push+straight", rank: undefined, misses: 1 });
    const ranked = ranks.filter((r) => r.rank !== undefined);
    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    for (let i = 1; i < ranked.length; i++) {
      const [a, b] = [ranked[i - 1]!, ranked[i]!];
      expect(a.misses <= b.misses).toBe(true);
      if (a.misses === b.misses) expect(a.score).toBeGreaterThanOrEqual(b.score - 0.001);
    }
    for (const r of ranked) expect(r.score === 0 || r.misses === 0).toBe(true);
  });
});

describe("the browser entry", () => {
  it("imports no Node module, in each file that it reaches", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(join(here, file), "utf8");
      expect(text, file).not.toMatch(/from "node:|from "(fs|os|path|crypto|worker_threads)"/);
      for (const m of text.matchAll(/from "\.\/([^"]+\.ts)"/g)) visit(m[1]!);
    };
    visit("browser.ts");
    expect(seen.has("runner.ts")).toBe(true);
    expect(seen.has("env.ts")).toBe(false);
  });
});
