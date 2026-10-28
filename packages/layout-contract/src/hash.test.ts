import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, documentHash, exercised, outputGroups, outputHash, RECORD_EPS, sha256Hex } from "./index.ts";

const nodeSha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const exact = { grid: 0 };

describe("sha256Hex", () => {
  it("gives the digest of node:crypto", () => {
    const texts = ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "a long text of more than one block. ".repeat(20), "Fréchet ✓ 日本語 😀"];
    for (const t of texts) expect(sha256Hex(t)).toBe(nodeSha(t));
  });

  it("gives the known digest of abc", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("canonicalJson", () => {
  it("sorts the keys at each level and has no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"e":2,"f":1}]},"b":1}');
  });

  it("drops a key with undefined, and writes undefined in an array as null", () => {
    expect(canonicalJson({ a: undefined, b: [1, undefined, null] })).toBe('{"b":[1,null,null]}');
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson("q")).toBe('"q"');
  });
});

describe("documentHash", () => {
  it("is outputHash of the document without hash", () => {
    const doc = { schema: "layout-input/1", hash: "0000000000000000", boxes: [{ id: "a", w: 1.25, h: 2 }] };
    const { hash: _hash, ...rest } = doc;
    expect(documentHash(doc)).toBe(nodeSha(canonicalJson(rest)).slice(0, 16));
    expect(documentHash({ ...doc, hash: "ffffffffffffffff" })).toBe(documentHash(doc));
    expect(documentHash(doc)).toBe(outputHash(rest));
  });

  it("puts the numbers on the default grid", () => {
    expect(documentHash({ hash: "x", w: 1.00001 })).toBe(documentHash({ w: 1 }));
    expect(documentHash({ w: 1.00001 }, exact)).not.toBe(documentHash({ w: 1 }, exact));
  });
});

describe("outputHash", () => {
  const sample = { id: "e1", points: [{ x: 0.1 + 0.2, y: -0 }, { x: 10, y: 2.0004 }] };

  it("pins the hashes of a sample, on the default grid and exact", () => {
    expect(outputHash(sample)).toBe("7bb07d56c02f44b1");
    expect(outputHash(sample, { grid: RECORD_EPS })).toBe("7bb07d56c02f44b1");
    expect(outputHash({ id: "e1", points: [{ x: 0.3, y: 0 }, { x: 10, y: 2 }] }, exact)).toBe("7bb07d56c02f44b1");
    expect(outputHash(sample, exact)).toBe("4c7354c724efcecf");
    expect(outputHash([])).toBe("4f53cda18c2baa0c");
  });

  it("does not change with the order of the keys", () => {
    expect(outputHash({ b: [1, 2], a: { y: 1, x: 2 } })).toBe(outputHash({ a: { x: 2, y: 1 }, b: [1, 2] }));
  });

  it("puts the numbers on the grid, and keeps them exact with grid 0", () => {
    expect(outputHash({ x: 0.0001 })).toBe(outputHash({ x: 0 }));
    expect(outputHash({ x: 0.0001 }, exact)).not.toBe(outputHash({ x: 0 }, exact));
    expect(outputHash({ x: 0.001 })).not.toBe(outputHash({ x: 0.002 }));
    expect(outputHash({ x: 0.004 }, { grid: 0.01 })).toBe(outputHash({ x: 0 }));
  });

  it("rounds as Math.round(x * 1000) / 1000 on the default grid", () => {
    for (const x of [0.0005, 1.0005, -0.0005, -1.0005, 0.1 + 0.2, 123456.7895, 2 ** 40 + 0.0005]) {
      const r = Math.round(x * 1000) / 1000;
      expect(outputHash([x])).toBe(outputHash([r === 0 ? 0 : r], exact));
    }
  });

  it("gives -0 the hash of 0 in both forms", () => {
    expect(outputHash({ x: -0 }, exact)).toBe(outputHash({ x: 0 }, exact));
    expect(outputHash({ x: -0.0001 })).toBe(outputHash({ x: 0 }));
  });

  it("throws on a number that is not finite, with its path", () => {
    expect(() => outputHash({ a: [1, Number.NaN] })).toThrow(RangeError);
    expect(() => outputHash({ a: [1, Number.NaN] })).toThrow("$.a[1]");
    expect(() => outputHash({ a: Number.POSITIVE_INFINITY }, exact)).toThrow(RangeError);
    expect(() => outputHash(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it("throws on a grid that is negative or not finite", () => {
    for (const g of [-0.001, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => outputHash(1, { grid: g })).toThrow(RangeError);
  });
});

describe("outputGroups", () => {
  it("puts the candidates with equal lists in one group, with sorted members and groups", () => {
    const groups = outputGroups({ d: ["h1", "h2"], b: ["h1", "h3"], c: ["h1", "h2"], a: ["h1", "h3"] });
    expect(groups).toEqual([
      { id: "a", members: ["a", "b"] },
      { id: "c", members: ["c", "d"] },
    ]);
  });

  it("keeps a candidate alone when one place is different", () => {
    expect(outputGroups({ x: ["1", "2"], y: ["2", "1"] })).toEqual([
      { id: "x", members: ["x"] },
      { id: "y", members: ["y"] },
    ]);
    expect(outputGroups({})).toEqual([]);
  });

  it("throws when two lists have different lengths", () => {
    expect(() => outputGroups({ a: ["1"], b: ["1", "2"] })).toThrow(RangeError);
  });
});

describe("exercised", () => {
  it("uses the move counts of a strategy without a base", () => {
    expect(exercised({ moves: { swap: 0, shift: 3 } })).toBe(true);
    expect(exercised({ moves: { swap: 0 } })).toBe(false);
  });

  it("compares the hashes with the hashes of the base", () => {
    expect(exercised({ hashes: ["a", "b"], baseHashes: ["a", "c"] })).toBe(true);
    expect(exercised({ hashes: ["a", "b"], baseHashes: ["a", "b"] })).toBe(false);
  });

  it("is true when the moves or the hashes tell so", () => {
    expect(exercised({ moves: { swap: 1 }, hashes: ["a"], baseHashes: ["a"] })).toBe(true);
    expect(exercised({ moves: { swap: 0 }, hashes: ["a"], baseHashes: ["b"] })).toBe(true);
    expect(exercised({ moves: { swap: 0 }, hashes: ["a"], baseHashes: ["a"] })).toBe(false);
  });

  it("is false without evidence", () => {
    expect(exercised({})).toBe(false);
    expect(exercised({ moves: {} })).toBe(false);
  });

  it("throws when only one list is given, or when the lengths are different", () => {
    expect(() => exercised({ hashes: ["a"] })).toThrow(RangeError);
    expect(() => exercised({ baseHashes: ["a"] })).toThrow(RangeError);
    expect(() => exercised({ hashes: ["a"], baseHashes: ["a", "b"] })).toThrow(RangeError);
  });
});
