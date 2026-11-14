import { REFUSED_PROBE, type LayoutInput, type LayoutRecord } from "@mark1russell7/layout-contract";
import { measure, packWith } from "@mark1russell7/packing";
import { wilson, Z95 } from "@mark1russell7/rigor-statistics";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIT_LEAST,
  auditCompare,
  auditForm,
  auditHash,
  auditSample,
  BUDGET_SKIPS,
  CARRY_PROBE_SCHEMA,
  carryPlan,
  codeAuditSample,
  codeAuditSeed,
  isTimeMeasure,
  lockVersions,
  mergeProbes,
  packKey,
  type CarryProbe,
} from "./carry.ts";
import { NOT_RUN_OVER_BUDGET, OVER_BUDGET } from "./analysis.ts";
import { carryProbe, packProbe } from "./carry-probe.ts";
import { localImports } from "./carry-sources.ts";
import { familyOf } from "./memory-gate.ts";
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

describe("a carry over a change of the measure code (L147 rule B)", () => {
  const code = { from: "ccf99ce0000000000000000000000000000000aa", to: "1c41dda0000000000000000000000000000000bb" };
  const same = probe(from, samePacks, sameRouters);

  it("keeps the records at the same engine versions, with the facts of the code audit", () => {
    const plan = carryPlan(records, { from: same, to: same, packs: packFacts, run: "42428038369", code });
    // The 4 records have 2 packs, 2 routers and 1 family. There are fewer than AUDIT_LEAST, so the audit has each of them.
    expect(plan.audit).toEqual(records.map((r) => doneKey(r.input, r.strategy)).sort());
    const facts = { ...code, audit: records.length, upper: wilson(0, records.length, Z95).high };
    expect(plan.code).toEqual(facts);
    expect(plan.carried).toHaveLength(records.length);
    for (const r of plan.carried) expect(r.carried).toEqual({ from, to: from, fingerprints: expect.any(Object), run: "42428038369", code: facts });
  });

  it("also takes the code audit when the engine versions changed", () => {
    const plan = carryPlan(records, { from: same, to: probe(to, samePacks, sameRouters), packs: packFacts, code });
    expect(plan.audit).toHaveLength(records.length);
    expect(plan.carried[0]?.carried?.to).toEqual(to);
    expect(plan.carried[0]?.carried?.code?.audit).toBe(records.length);
  });

  it("measures a record of an earlier code bridge again", () => {
    const bridged = carryPlan(records, { from: same, to: same, packs: packFacts, code }).carried;
    const later = { from: code.to, to: "2d52eeb0000000000000000000000000000000cc" };
    const plan = carryPlan(bridged, { from: same, to: same, packs: packFacts, code: later });
    expect(plan.counts["code bridge"]).toBe(records.length);
    expect(plan.carried).toEqual([]);
    expect(plan.code).toBeUndefined();
    expect(carryPlan(bridged, { from: same, to: probe(to, samePacks, sameRouters), packs: packFacts }).counts["code bridge"]).toBe(records.length);
  });

  it("keeps no record when the pack or router changed for each pair, and refuses a change with one commit", () => {
    const plan = carryPlan(records, { from: same, to: probe(from, { [packKey("rows", three.id)]: "x", [packKey("shelf", three.id)]: "y" }, sameRouters), packs: packFacts, code });
    expect(plan.carried).toEqual([]);
    expect(plan.audit).toEqual([]);
    expect(() => carryPlan(records, { from: same, to: same, packs: packFacts, code: { from: code.from, to: code.from } })).toThrow(/two commits/);
    expect(() => carryPlan(records, { from: same, to: same, packs: packFacts, code: { from: "", to: code.to } })).toThrow(/two commits/);
  });
});

describe("the code audit", () => {
  const packs = Array.from({ length: 31 }, (_, i) => `pack${i}`);
  const routers = Array.from({ length: 9 }, (_, i) => `router${i}`);
  const families = Array.from({ length: 12 }, (_, i) => `ui/family${i}`);
  const many: LayoutRecord[] = [];
  for (const family of families) for (let seed = 1; seed <= 2; seed += 1) for (const pack of packs) for (const router of routers) {
    many.push({ input: `joint-v2/${family}/s${seed}`, strategy: `${pack}+${router}`, options: { pack, router } } as unknown as LayoutRecord);
  }
  const code = { from: "ccf99ce0000000000000000000000000000000aa", to: "1c41dda0000000000000000000000000000000bb" };

  it("covers each pack entry, each router and each family, plus max(30, 5 %) of the other pairs", () => {
    const a = codeAuditSample(many, code);
    const byKey = new Map(many.map((r) => [doneKey(r.input, r.strategy), r]));
    const chosen = a.map((key) => byKey.get(key)!);
    expect(new Set(chosen.map((r) => r.options["pack"])).size).toBe(packs.length);
    expect(new Set(chosen.map((r) => r.options["router"])).size).toBe(routers.length);
    expect(new Set(chosen.map((r) => familyOf(r.input))).size).toBe(families.length);
    expect(new Set(a).size).toBe(a.length);
    expect([...a].sort()).toEqual(a);
    // The strata take 31 pairs or more (one for each pack), and at most 31 + 9 + 12. The seeded part has 5 % of 6696 pairs: 335.
    expect(a.length).toBeGreaterThanOrEqual(packs.length + Math.ceil(0.05 * many.length));
    expect(a.length).toBeLessThanOrEqual(packs.length + routers.length + families.length + Math.ceil(0.05 * many.length));
  });

  it("is the same for the same commits in any order of the records, and other for other commits", () => {
    const a = codeAuditSample(many, code);
    expect(codeAuditSample([...many].reverse(), code)).toEqual(a);
    expect(codeAuditSample(many, { ...code, to: "2d52eeb0000000000000000000000000000000cc" })).not.toEqual(a);
    expect(codeAuditSeed(code)).not.toBe(codeAuditSeed({ from: code.to, to: code.from }));
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
    expect(auditCompare(records, again)).toEqual({ pairs: records.length, differing: [], missing: [], unread: [], read: records.length, unreadStrata: [], upper: wilson(0, records.length, Z95).high, pass: true });
    const bent = again.map((r, i) => (i === 1 ? ({ ...r, outputHash: "0000000000000000" } as LayoutRecord) : r));
    const fail = auditCompare(records, bent);
    expect(fail.pass).toBe(false);
    expect(fail.differing).toEqual([{ key: doneKey(records[1]!.input, records[1]!.strategy), fields: ["outputHash"] }]);
    expect(auditCompare(records, again.slice(1)).missing).toEqual([doneKey(records[0]!.input, records[0]!.strategy)]);
  });

  // A/A run 43378909783: the run measured 2 of 9,516 audit pairs again over the time budget. The audit read these skips as differences and failed.
  it("counts a skip of the time budget as no read, not as a difference", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ input: `joint-v2/f${i % 2}/s${i}`, strategy: `p${i % 4}+r${i % 3}`, options: { pack: `p${i % 4}`, router: `r${i % 3}` }, outputHash: `h${i}`, measures: { fill: i } }) as unknown as LayoutRecord);
    const key0 = doneKey(many[0]!.input, many[0]!.strategy);
    expect(BUDGET_SKIPS).toEqual([OVER_BUDGET, NOT_RUN_OVER_BUDGET]);
    for (const skip of BUDGET_SKIPS) {
      const again = many.map((r, i) => (i === 0 ? ({ ...r, skipped: skip, outputHash: "", measures: {}, ms: 0 } as LayoutRecord) : r));
      const result = auditCompare(many, again);
      expect(result).toMatchObject({ differing: [], missing: [], unread: [key0], read: 39, unreadStrata: [], pass: true });
      expect(result.upper).toBe(wilson(0, 39, Z95).high);
    }
    // Another skip comes from the engines, so it is a difference.
    const refused = many.map((r, i) => (i === 0 ? ({ ...r, skipped: "unsupported" } as LayoutRecord) : r));
    expect(auditCompare(many, refused)).toMatchObject({ differing: [{ key: key0, fields: ["skipped"] }], unread: [], pass: false });
  });

  it("fails when a stratum of the audit or too many pairs give no read", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ input: `joint-v2/f${i % 2}/s${i}`, strategy: `p${i % 4}+r${i % 3}`, options: { pack: `p${i % 4}`, router: `r${i % 3}` }, measures: {} }) as unknown as LayoutRecord);
    // The pack entry "solo" has one pair. Its skip leaves the stratum with no read.
    const solo = many.map((r, i) => (i === 0 ? ({ ...r, strategy: "solo+r0", options: { pack: "solo", router: "r0" } } as unknown as LayoutRecord) : r));
    const skipSolo = solo.map((r, i) => (i === 0 ? ({ ...r, skipped: OVER_BUDGET } as LayoutRecord) : r));
    expect(auditCompare(solo, skipSolo)).toMatchObject({ differing: [], unreadStrata: ["pack\nsolo"], read: 39, pass: false });
    // An audit of 4 pairs needs 4 reads (min(AUDIT_LEAST, 4)).
    const again = runInput(three, undefined, { packs: [rows, shelf], routers: ["straight", "corners"] });
    const skipOne = again.map((r, i) => (i === 1 ? ({ ...r, skipped: OVER_BUDGET } as LayoutRecord) : r));
    expect(auditCompare(records, skipOne)).toMatchObject({ differing: [], unreadStrata: [], read: 3, pass: false });
    // With no read, the bound is 1.
    expect(auditCompare(many, many.map((r) => ({ ...r, skipped: NOT_RUN_OVER_BUDGET }) as LayoutRecord))).toMatchObject({ read: 0, upper: 1, pass: false });
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

describe("lockVersions", () => {
  const lock = [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  packages/joint:",
    "    dependencies:",
    "      '@mark1russell7/highways':",
    "        specifier: ^0.15.0",
    "        version: 0.15.0",
    "      '@mark1russell7/layout-contract':",
    "        specifier: workspace:*",
    "        version: link:../layout-contract",
    "      '@mark1russell7/packing':",
    "        specifier: ^0.10.2",
    "        version: 0.10.2(typescript@7.0.2)",
    "",
    "  packages/site:",
    "    dependencies:",
    "      '@mark1russell7/packing':",
    "        specifier: ^0.9.0",
    "        version: 0.9.0",
    "",
    "packages:",
    "",
  ].join("\n");

  it("gives the version of each engine of one importer, without the peer suffix", () => {
    expect(lockVersions(lock, "packages/joint")).toEqual({ "@mark1russell7/packing": "0.10.2", "@mark1russell7/highways": "0.15.0" });
    expect(lockVersions(lock, "packages/site", ["@mark1russell7/packing"])).toEqual({ "@mark1russell7/packing": "0.9.0" });
  });

  it("refuses a missing importer, a missing package and a link", () => {
    expect(() => lockVersions(lock, "packages/none")).toThrow(/no importer/);
    expect(() => lockVersions(lock, "packages/site")).toThrow(/no package @mark1russell7\/highways/);
    expect(() => lockVersions(lock, "packages/joint", ["@mark1russell7/layout-contract"])).toThrow(/not a version of npm/);
  });

  it("reads the lockfile of this repository", () => {
    const text = readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
    const versions = lockVersions(text, "packages/joint");
    expect(Object.keys(versions).sort()).toEqual(["@mark1russell7/highways", "@mark1russell7/packing"]);
  });
});
