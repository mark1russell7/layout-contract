import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, checkDeclared, checkSplit, corpusHashOf, type CorpusSplit, type DeclaredClaim, declaredClaimOf, declaredCounts, familyOf, leaveOneSeedOut, SPLIT_SCHEMA, splitFileName, splitFolds } from "./index.ts";

// The corpus checks of L22. The made-up manifest is the manifest of the split tests of packing.

const manifest = { corpus: "t", specs: [{ seeds: [1, 2, 3] }], inputs: [{ id: "t/a/s1", hash: "h1" }, { id: "t/a/s2", hash: "h2" }, { id: "t/a/s3", hash: "h3" }] };

/** The pinned hash of the made-up manifest. packing and highways pin the same string. */
const PINNED = "85baebbf77017041";

const fileOf = (splits: CorpusSplit["splits"], extra: Partial<CorpusSplit> = {}): CorpusSplit => ({
  schema: SPLIT_SCHEMA,
  corpus: "t",
  corpusHash: corpusHashOf(manifest.corpus, manifest.inputs),
  splits,
  ...extra,
});

const good = fileOf({ default: { folds: [{ train: [1, 2], heldOut: [3] }] } });
const details = (file: unknown, name?: string): string[] => checkSplit(file, manifest, name).map((b) => b.detail);

describe("corpusHashOf", () => {
  it("gives the pinned hash of a fixed list of inputs", () => {
    expect(corpusHashOf(manifest.corpus, manifest.inputs)).toBe(PINNED);
  });

  it("is the SHA-256 of node:crypto, cut to 16 hex characters", () => {
    const text = canonicalJson({ corpus: "t", inputs: manifest.inputs.map((i) => [i.id, i.hash]) });
    expect(text).toBe('{"corpus":"t","inputs":[["t/a/s1","h1"],["t/a/s2","h2"],["t/a/s3","h3"]]}');
    expect(corpusHashOf("t", manifest.inputs)).toBe(createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16));
  });

  it("changes with the corpus id, the hash or the order of an input", () => {
    const h = corpusHashOf("t", manifest.inputs);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(corpusHashOf("u", manifest.inputs)).not.toBe(h);
    expect(corpusHashOf("t", [{ id: "t/a/s1", hash: "hX" }, ...manifest.inputs.slice(1)])).not.toBe(h);
    expect(corpusHashOf("t", [...manifest.inputs].reverse())).not.toBe(h);
    expect(splitFileName("t", h)).toBe(`t.${h}.json`);
  });
});

describe("checkSplit", () => {
  it("finds no break in a good file", () => {
    expect(checkSplit(good, manifest)).toEqual([]);
    expect(checkSplit(good, manifest, "default")).toEqual([]);
  });

  it("gives breaks with the claim split and no inputs", () => {
    const breaks = checkSplit(null, manifest);
    expect(breaks).toEqual([{ claim: "split", detail: "the split file is not an object", inputs: [] }]);
  });

  it("refuses a bad schema, corpus or corpus hash", () => {
    expect(details(fileOf(good.splits, { schema: "x" as typeof SPLIT_SCHEMA }))).toEqual(["the schema is x, not corpus-split/1"]);
    expect(details(fileOf(good.splits, { corpus: "u" }))).toEqual(["the corpus is u, not t"]);
    expect(details(fileOf(good.splits, { corpusHash: "0" }))).toEqual([`the corpusHash is 0, but the corpus gives ${PINNED}`]);
  });

  it("refuses a corpus hash of other inputs", () => {
    const other = { ...manifest, inputs: manifest.inputs.slice(0, 2) };
    expect(checkSplit(good, other).map((b) => b.detail)[0]).toMatch(/^the corpusHash is 85baebbf77017041, but the corpus gives [0-9a-f]{16}$/);
  });

  it("refuses a split with no folds", () => {
    expect(details(fileOf({ none: { folds: [] } }))).toEqual(["the split none has no folds"]);
    expect(details(fileOf({ none: {} as { folds: [] } }))).toEqual(["the split none has no folds"]);
  });

  it("refuses an empty train or heldOut", () => {
    expect(details(fileOf({ empty: { folds: [{ train: [], heldOut: [3] }, { train: [1], heldOut: [] }] } }))).toEqual([
      "the fold 0 of the split empty has no train seeds",
      "the fold 1 of the split empty has no heldOut seeds",
    ]);
  });

  it("refuses train and heldOut that overlap", () => {
    expect(details(fileOf({ common: { folds: [{ train: [1, 2], heldOut: [2, 3] }] } }))).toEqual(["the fold 0 of the split common has the seeds 2 in train and in heldOut"]);
  });

  it("refuses a seed that is not in the corpus", () => {
    expect(details(fileOf({ unknown: { folds: [{ train: [1, 9], heldOut: [3] }] } }))).toEqual(["the fold 0 of the split unknown has the seeds 9, which are not in the corpus"]);
  });

  it("refuses an unknown split name", () => {
    expect(details(good, "loso")).toEqual(["the split file has no split loso. Its splits are default"]);
  });

  it("gives the problems in the order of packing", () => {
    const bad = fileOf({
      none: { folds: [] },
      empty: { folds: [{ train: [], heldOut: [3] }, { train: [1], heldOut: [] }] },
      common: { folds: [{ train: [1, 2], heldOut: [2, 3] }] },
      unknown: { folds: [{ train: [1, 9], heldOut: [3] }] },
    });
    expect(details(bad)).toEqual([
      "the split none has no folds",
      "the fold 0 of the split empty has no train seeds",
      "the fold 1 of the split empty has no heldOut seeds",
      "the fold 0 of the split common has the seeds 2 in train and in heldOut",
      "the fold 0 of the split unknown has the seeds 9, which are not in the corpus",
    ]);
  });
});

describe("splitFolds", () => {
  it("gives a copy of the folds of a split", () => {
    const folds = splitFolds(good, manifest, "default");
    expect(folds).toEqual([{ train: [1, 2], heldOut: [3] }]);
    expect(folds[0]!.train).not.toBe(good.splits["default"]!.folds[0]!.train);
  });

  it("throws for a problem, and then for an unknown split name", () => {
    expect(() => splitFolds(fileOf({ default: { folds: [{ train: [1, 3], heldOut: [3] }] } }), manifest, "default", "The split file x.json")).toThrow(
      new Error("The split file x.json is not good: the fold 0 of the split default has the seeds 3 in train and in heldOut."),
    );
    expect(() => splitFolds(good, manifest, "loso")).toThrow(new Error("The split file has no split loso. Its splits are default."));
    expect(() => splitFolds(good, manifest, "constructor")).toThrow(/has no split constructor/);
  });
});

describe("leaveOneSeedOut", () => {
  it("holds out each seed once, in the order of the seeds", () => {
    expect(leaveOneSeedOut([3, 1, 2, 1])).toEqual([
      { train: [2, 3], heldOut: [1] },
      { train: [1, 3], heldOut: [2] },
      { train: [1, 2], heldOut: [3] },
    ]);
    expect(checkSplit(fileOf({ loso: { folds: leaveOneSeedOut([1, 2, 3]) } }), manifest)).toEqual([]);
  });
});

describe("the declared properties", () => {
  type Input = { readonly id: string; readonly props: readonly string[] };
  const inputs: Input[] = [
    { id: "a", props: ["order", "aspect"] },
    { id: "b", props: ["order"] },
    { id: "c", props: [] },
  ];
  const declares = (i: Input): readonly string[] => i.props;
  const IDS = ["order", "aspect", "shaped"];
  const claim = { minCount: 2, thin: ["aspect", "shaped"], counts: { order: 2, aspect: 1, shaped: 0 } };
  const details = (c: typeof claim, ids?: readonly string[], list: Input[] = inputs): string[] => checkDeclared(list, declares, c, ids).map((b) => b.detail);

  it("counts the inputs for each id, with 0 for an id without inputs", () => {
    expect(declaredCounts(inputs, declares, IDS)).toEqual({ order: 2, aspect: 1, shaped: 0 });
    expect(Object.keys(declaredCounts(inputs, declares))).toEqual(["order", "aspect"]);
  });

  it("finds no break in a true claim", () => {
    expect(checkDeclared(inputs, declares, claim, IDS)).toEqual([]);
    expect(checkDeclared(inputs, declares, claim)).toEqual([]);
  });

  it("gives a break declared for a wrong count, a missing count and an unknown id", () => {
    expect(checkDeclared(inputs, declares, { ...claim, counts: { order: 3, aspect: 1, shaped: 0 } }, IDS)).toEqual([
      { claim: "declared", detail: 'the property "order" has the count 3, but the inputs give 2', inputs: [] },
    ]);
    expect(details({ ...claim, counts: { order: 2, aspect: 1 } } as typeof claim, IDS)).toEqual(['the property "shaped" has no count']);
    expect(details({ ...claim, counts: { ...claim.counts, x: 0 } } as typeof claim, IDS)).toEqual(['"x" is not a declared property']);
  });

  it("gives a break for a thin property that is not in thin, and for an unknown id in thin", () => {
    expect(details({ ...claim, thin: ["shaped"] }, IDS)).toEqual(['the property "aspect" has 1 inputs, below minCount 2, and it is not in thin']);
    expect(details({ ...claim, thin: ["aspect", "shaped", "y"] }, IDS)).toEqual(['"y" of thin is not a declared property']);
  });

  it("gives a break for an id from declares that is not an id", () => {
    const list = [...inputs, { id: "d", props: ["z"] }];
    expect(details(claim, IDS, list)).toEqual(['1 inputs declare "z", which is not a declared property']);
  });
});

describe("declaredClaimOf", () => {
  it("reads the claim, and gives undefined without it", () => {
    expect(declaredClaimOf({})).toBeUndefined();
    expect(declaredClaimOf({ claims: {} })).toBeUndefined();
    expect(declaredClaimOf({ claims: { declared: { minCount: 2, thin: ["a"], counts: { a: 1 } } } })).toEqual({ minCount: 2, thin: ["a"], counts: { a: 1 } });
  });

  it("refuses a claim that is not whole", () => {
    expect(() => declaredClaimOf({ claims: 1 })).toThrow("The field claims of a corpus file is an object.");
    expect(() => declaredClaimOf({ claims: { declared: [] } })).toThrow("The field claims.declared of a corpus file is an object.");
    expect(() => declaredClaimOf({ claims: { declared: { minCount: 1.5, thin: [], counts: {} } } })).toThrow(/minCount is a whole number/);
    expect(() => declaredClaimOf({ claims: { declared: { minCount: 1, thin: [1], counts: {} } } })).toThrow(/thin is a list of property ids/);
    expect(() => declaredClaimOf({ claims: { declared: { minCount: 1, thin: [], counts: { a: -1 } } } })).toThrow(/gives a whole count/);
  });
});

describe("familyOf", () => {
  it("joins the values of the dimensions of the flat form, in order", () => {
    expect(familyOf({ edgeDensity: "dense", groups: "flat", ports: "free" }, ["groups", "edgeDensity"])).toBe("flat/dense");
    expect(familyOf({ count: 10 }, ["count"])).toBe("10");
    expect(familyOf({ a: "x" }, [])).toBe("");
  });

  it("chooses the entry of the map form by kind, else the entry *", () => {
    const by = { "rect-grid": ["obstacles"], "*": [] };
    expect(familyOf({ kind: "rect-grid", obstacles: "wall" }, by)).toBe("rect-grid/wall");
    expect(familyOf({ kind: "gallery", obstacles: "wall" }, by)).toBe("gallery");
  });

  it("throws for a missing dimension, a missing kind and a kind with no entry", () => {
    expect(() => familyOf({ groups: "flat" }, ["groups", "ports"])).toThrow(new RangeError('familyOf: a cell without the dimension "ports" of familyBy.'));
    expect(() => familyOf({ kind: "rect-grid" }, { "rect-grid": ["obstacles"] })).toThrow(/of the kind "rect-grid" without the dimension "obstacles"/);
    expect(() => familyOf({ obstacles: "wall" }, { "*": [] })).toThrow(/a cell without kind/);
    expect(() => familyOf({ kind: "cards" }, { "rect-grid": [] })).toThrow(/the kind "cards", which has no entry in familyBy and no entry "\*"/);
  });
});

describe("the families of checkDeclared", () => {
  type Cell = Record<string, string>;
  type Input = { readonly id: string; readonly cell?: Cell };
  const declares = (): readonly string[] => [];
  const base = { minCount: 0, thin: [], counts: {} };
  const check = (inputs: Input[], extra: Partial<DeclaredClaim>): { detail: string; inputs: readonly string[] }[] =>
    checkDeclared(inputs, declares, { ...base, ...extra }).map((b) => ({ detail: b.detail, inputs: b.inputs }));
  const grid = (id: string, obstacles?: string): Input => ({ id, cell: { kind: "rect-grid", ...(obstacles === undefined ? {} : { obstacles }) } });

  it("finds no break when each cell gives its key", () => {
    const inputs = [grid("g1", "wall"), grid("g2", "wall"), { id: "u1", cell: { kind: "gallery" } }];
    expect(check(inputs, { familyBy: { "rect-grid": ["obstacles"], "*": [] }, familyMin: 1 })).toEqual([]);
  });

  it("gives a break for a cell without a dimension of its kind", () => {
    expect(check([grid("g1", "wall"), grid("g2")], { familyBy: { "rect-grid": ["obstacles"], "*": [] } })).toEqual([
      { detail: '1 inputs have a cell of the kind "rect-grid" without the dimension "obstacles" of familyBy', inputs: ["g2"] },
    ]);
    expect(check([{ id: "a", cell: { groups: "flat" } }], { familyBy: ["groups", "ports"] })).toEqual([
      { detail: '1 inputs have a cell without the dimension "ports" of familyBy', inputs: ["a"] },
    ]);
  });

  it("gives a break for a cell without kind in the map form, and for a kind with no entry and no *", () => {
    expect(check([{ id: "a", cell: { obstacles: "wall" } }], { familyBy: { "*": [] } })).toEqual([
      { detail: "1 inputs have a cell without kind, which the map form of familyBy needs", inputs: ["a"] },
    ]);
    expect(check([{ id: "u1", cell: { kind: "cards" } }, { id: "u2", cell: { kind: "cards" } }], { familyBy: { "rect-grid": [] } })).toEqual([
      { detail: '2 inputs have the kind "cards", which has no entry in familyBy and no entry "*"', inputs: ["u1", "u2"] },
    ]);
  });

  it("gives a break for an input without a cell", () => {
    expect(check([{ id: "a" }], { familyBy: ["groups"] })).toEqual([{ detail: "1 inputs have no cell, which familyBy needs", inputs: ["a"] }]);
  });

  it("gives a break when two different cells give the same key", () => {
    const inputs = [
      { id: "a", cell: { x: "p/q", y: "r" } },
      { id: "b", cell: { x: "p", y: "q/r" } },
      { id: "c", cell: { x: "p", y: "s" } },
    ];
    expect(check(inputs, { familyBy: ["x", "y"] })).toEqual([{ detail: 'the family "p/q/r" comes from different dimension values: ["p/q","r"] and ["p","q/r"]', inputs: ["a", "b"] }]);
  });

  it("gives a break for a family below familyMin", () => {
    const inputs = [grid("g1", "wall"), grid("g2", "wall"), grid("g3", "edge")];
    expect(check(inputs, { familyBy: { "rect-grid": ["obstacles"] }, familyMin: 2 })).toEqual([{ detail: 'the family "rect-grid/edge" has 1 inputs, below familyMin 2', inputs: ["g3"] }]);
  });

  it("reads the cells with the hook cellOf", () => {
    const inputs = [{ id: "rect-grid/a/s1" }, { id: "gallery/b/s1" }];
    const cellOf = (i: { id: string }): Cell => ({ kind: i.id.split("/")[0]! });
    expect(checkDeclared(inputs, declares, { ...base, familyBy: { "*": [] }, familyMin: 1 }, undefined, cellOf)).toEqual([]);
  });

  it("reads familyBy and familyMin in declaredClaimOf, and refuses a bad value", () => {
    const declared = { minCount: 1, thin: [], counts: {}, familyBy: { "rect-grid": ["obstacles"], "*": [] }, familyMin: 10 };
    expect(declaredClaimOf({ claims: { declared } })).toEqual(declared);
    expect(() => declaredClaimOf({ claims: { declared: { ...declared, familyBy: [1] } } })).toThrow(/familyBy is a list of dimensions/);
    expect(() => declaredClaimOf({ claims: { declared: { ...declared, familyBy: { a: "x" } } } })).toThrow(/familyBy is a list of dimensions/);
    expect(() => declaredClaimOf({ claims: { declared: { ...declared, familyMin: -1 } } })).toThrow(/familyMin is a whole number/);
  });
});
