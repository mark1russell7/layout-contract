import { REFUSED_PROBE, type LayoutInput, type LayoutRecord } from "@mark1russell7/layout-contract";
import { measure, packWith } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { AUDIT_LEAST, auditCompare, auditForm, auditHash, auditSample, CARRY_PROBE_SCHEMA, carryPlan, isTimeMeasure, localImports, mergeProbes, packKey, type CarryProbe } from "./carry.ts";
import { carryProbe, packProbe } from "./carry-probe.ts";
import { jointInput, jointSpecs, SET } from "./corpus.ts";
import { PACK_ENTRIES, packInputOf, runInput } from "./runner.ts";
import { doneKey } from "./shard-run.ts";

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

const rows = PACK_ENTRIES.find((p) => p.id === "rows")!;
const shelf = PACK_ENTRIES.find((p) => p.id === "shelf")!;
const records = runInput(three, undefined, { packs: [rows, shelf], routers: ["straight", "corners"] });
const from = { packing: "0.10.2", highways: "0.15.0" };
const to = { packing: "0.10.5", highways: "0.15.2" };

function probe(engines: Record<string, string>, packs: Record<string, string>, routers: Record<string, string>): CarryProbe {
  return { schema: CARRY_PROBE_SCHEMA, corpus: "joint-v1", engines, packs, routers };
}

const packFacts = new Map(records.map((r) => [String(r.options["pack"]), { strategy: String(r.options["packStrategy"]), options: r.options["packOptions"] as Record<string, unknown> }]));
const samePacks = { [packKey("rows", three.id)]: "p1", [packKey("shelf", three.id)]: "p2" };
const sameRouters = { straight: "r1", corners: "r2" };

describe("carryPlan", () => {
  it("carries each record when the fingerprints of its pack and its router are the same at the two versions", () => {
    const plan = carryPlan(records, { from: probe(from, samePacks, sameRouters), to: probe(to, samePacks, sameRouters), packs: packFacts, run: "42428038369" });
    expect(plan.again).toEqual([]);
    expect(plan.carried).toHaveLength(records.length);
    for (const [i, r] of plan.carried.entries()) {
      expect(r.carried).toEqual({ from, to, fingerprints: { [String(r.options["pack"])]: expect.any(String), [String(r.options["router"])]: expect.any(String) }, run: "42428038369" });
      expect(auditHash(r)).toBe(auditHash(records[i]!));
    }
  });

  it("measures a pair again when its pack or its router changed, when a probe is missing, or when its options changed", () => {
    const changedPack = { ...samePacks, [packKey("shelf", three.id)]: "p2b" };
    const plan = carryPlan(records, { from: probe(from, samePacks, sameRouters), to: probe(to, changedPack, { ...sameRouters, corners: "r2b" }), packs: packFacts });
    expect(plan.carried.map((r) => r.strategy)).toEqual(["rows+straight"]);
    expect(plan.counts["pack changed"]).toBe(2);
    expect(plan.counts["router changed"]).toBe(1);
    expect(plan.again.map((a) => a.key)).toContain(doneKey(three.id, "rows+corners"));

    const noRouter = carryPlan(records, { from: probe(from, samePacks, { straight: "r1" }), to: probe(to, samePacks, sameRouters), packs: packFacts });
    expect(noRouter.counts["no router probe"]).toBe(2);
    const noPack = carryPlan(records, { from: probe(from, samePacks, sameRouters), to: probe(to, samePacks, sameRouters), packs: new Map([["rows", packFacts.get("rows")!]]) });
    expect(noPack.counts["no pack probe"]).toBe(2);
    const otherOptions = new Map(packFacts);
    otherOptions.set("rows", { ...packFacts.get("rows")!, options: { ...packFacts.get("rows")!.options, extra: 1 } });
    expect(carryPlan(records, { from: probe(from, samePacks, sameRouters), to: probe(to, samePacks, sameRouters), packs: otherOptions }).counts["options changed"]).toBe(2);
  });

  it("measures a skipped record again", () => {
    const skipped = { ...records[0]!, measures: {}, skipped: "The strategy does not support count 10." } as LayoutRecord;
    const plan = carryPlan([skipped], { from: probe(from, samePacks, sameRouters), to: probe(to, samePacks, sameRouters), packs: packFacts });
    expect(plan.counts.skipped).toBe(1);
    expect(plan.carried).toEqual([]);
  });

  it("refuses probes of other corpora, other engines, or the same versions", () => {
    const a = probe(from, samePacks, sameRouters);
    expect(() => carryPlan(records, { from: a, to: { ...a, engines: to, corpus: "joint-v2" }, packs: packFacts })).toThrow(/corpora/);
    expect(() => carryPlan(records, { from: a, to: probe({ packing: "0.10.5" }, samePacks, sameRouters), packs: packFacts })).toThrow(/same engines/);
    expect(() => carryPlan(records, { from: a, to: a, packs: packFacts })).toThrow(/same engine versions/);
  });
});

describe("the audit", () => {
  it("leaves out the times, the run facts and the carry", () => {
    expect(isTimeMeasure("pack.ms")).toBe(true);
    expect(isTimeMeasure("time.hash.ms")).toBe(true);
    expect(isTimeMeasure("route.length")).toBe(false);
    const r = records[0]!;
    const other = { ...r, ms: r.ms + 5, env: { node: "x", os: "y", arch: "z", runner: "local", cpu: "c", cpus: 1 }, commit: "abc", measures: { ...r.measures, "pack.ms": 99, "time.bench.ms": 7 } } as LayoutRecord;
    expect(auditForm(other)).toEqual(auditForm(r));
    expect(auditForm(r)).not.toHaveProperty("ms");
    expect(Object.keys(auditForm(r)["measures"] as object).some(isTimeMeasure)).toBe(false);
  });

  it("samples max(30, 5 %) of the keys, the same for the same seed", () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`);
    const a = auditSample(keys, "42428038369");
    expect(a).toHaveLength(50);
    expect(new Set(a).size).toBe(50);
    expect(auditSample([...keys].reverse(), "42428038369")).toEqual(a);
    expect(auditSample(keys, "other")).not.toEqual(a);
    expect(auditSample(keys.slice(0, 100), 1)).toHaveLength(AUDIT_LEAST);
    expect(auditSample(keys.slice(0, 12), 1).sort()).toEqual(keys.slice(0, 12).sort());
  });

  it("passes on equal records, and fails on one differing or missing pair", () => {
    const again = runInput(three, undefined, { packs: [rows, shelf], routers: ["straight", "corners"] });
    expect(auditCompare(records, again)).toEqual({ pairs: records.length, differing: [], missing: [], pass: true });
    const bent = again.map((r, i) => (i === 1 ? ({ ...r, outputHash: "0000000000000000" } as LayoutRecord) : r));
    const fail = auditCompare(records, bent);
    expect(fail.pass).toBe(false);
    expect(fail.differing).toEqual([{ key: doneKey(records[1]!.input, records[1]!.strategy), fields: ["outputHash"] }]);
    expect(auditCompare(records, again.slice(1)).missing).toEqual([doneKey(records[0]!.input, records[0]!.strategy)]);
  });
});

describe("the probes", () => {
  it("gives the same pack hash two times, and REFUSED_PROBE for a cell that the strategy does not support", () => {
    expect(packProbe(rows, three, undefined)).toBe(packProbe(rows, three, undefined));
    expect(packProbe(rows, three, undefined)).not.toBe(packProbe(shelf, three, undefined));
    expect(packProbe(rows, three, { itemShape: "circle" })).toBe(REFUSED_PROBE);
  });

  it("gives the same pack hash two times for a container of free size, without the time of the size search", () => {
    const spec = jointSpecs(SET).find((s) => packInputOf(jointInput(s, s.seeds[0]!, SET).input).container.fixed === "none" && jointInput(s, s.seeds[0]!, SET).input.boxes.length <= 10);
    expect(spec).toBeDefined();
    const { input } = jointInput(spec!, spec!.seeds[0]!, SET);
    const maxrects = PACK_ENTRIES.find((e) => e.id === "maxrects-bl")!;
    // The measures of a size search hold a time. Without this time measure, the test does not test the rule.
    const pack = packInputOf(input);
    const names = Object.keys(measure(pack, packWith(maxrects.strategy, pack, maxrects.options, input.seed ?? 0)));
    expect(names.filter(isTimeMeasure)).not.toEqual([]);
    const hashes = new Set([0, 1, 2].map(() => packProbe(maxrects, input, undefined)));
    expect(hashes.size).toBe(1);
  });

  it("gives a probe document that merges with the probe of another shard", () => {
    const options = { corpus: "joint-v1", engines: from, packs: [rows, shelf] };
    const one = carryProbe({ ...options, inputs: [{ input: three }], routers: ["straight"], routerInputs: [{ input: three }], routerPack: rows });
    expect(Object.keys(one.packs).sort()).toEqual([packKey("rows", three.id), packKey("shelf", three.id)]);
    expect(Object.keys(one.routers)).toEqual(["straight"]);
    const shard = carryProbe({ ...options, inputs: [{ input: { ...three, id: "test/three/s2" } }] });
    const merged = mergeProbes([one, shard]);
    expect(Object.keys(merged.packs)).toHaveLength(4);
    expect(merged.routers).toEqual(one.routers);
    expect(() => mergeProbes([one, { ...shard, engines: to }])).toThrow(/other engine versions/);
    expect(() => mergeProbes([one, { ...one, routers: { straight: "x" } }])).toThrow(/router straight/);
  });
});

describe("localImports", () => {
  it("follows the ./*.ts imports of a file", () => {
    const files: Record<string, string> = { "a.ts": 'import { b } from "./b.ts";\nimport x from "pkg";', "b.ts": 'export * from "./c.ts";', "c.ts": 'import { a } from "./a.ts";' };
    expect(localImports("a.ts", (f) => files[f]!)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
});
