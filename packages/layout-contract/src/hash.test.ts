import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  documentHash,
  exercised,
  fingerprintOf,
  outputGroups,
  outputHash,
  type PackOutput,
  packOutputForm,
  probeHash,
  RECORD_EPS,
  REFUSED_PROBE,
  sha256Hex,
} from "./index.ts";
import { utf8, utf8Write } from "./utf8.ts";

const nodeSha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const exact = { grid: 0 };

describe("sha256Hex", () => {
  it("gives the digest of node:crypto", () => {
    const texts = ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "a long text of more than one block. ".repeat(20), "Fréchet ✓ 日本語 😀"];
    for (const t of texts) expect(sha256Hex(t)).toBe(nodeSha(t));
  });

  it("gives the bytes of the earlier encoder, also for a lone surrogate", () => {
    // The encoder before L81: a list of the bytes, from the code points of `for...of`.
    const earlier = (text: string): number[] => {
      const bytes: number[] = [];
      for (const ch of text) {
        const c = ch.codePointAt(0)!;
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return bytes;
    };
    const texts = ["", "abc", "Fréchet ✓ 日本語 😀", "\ud800", "a\udc00b", "\ud83d", "😀\ud83d", "\udc00𐀀", "x߿ࠀ￿"];
    for (const t of texts) expect([...utf8(t)]).toEqual(earlier(t));
    expect(utf8Write("😀é", new Uint8Array(8), 2)).toBe(8);
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

describe("skip", () => {
  it("leaves the named fields out at each depth, also in a list", () => {
    const value = { a: 1, through: [1, 2], b: [{ x: 1, through: 3 }, { x: 2 }], c: { through: { y: 1 }, z: 0 } };
    const without = { a: 1, b: [{ x: 1 }, { x: 2 }], c: { z: 0 } };
    expect(outputHash(value, { ...exact, skip: ["through"] })).toBe(outputHash(without, exact));
    expect(outputHash(value, exact)).not.toBe(outputHash(without, exact));
  });

  it("does not read a skipped field, so a number that is not finite there does not throw", () => {
    expect(outputHash({ a: 1, ms: Number.NaN }, { skip: ["ms"] })).toBe(outputHash({ a: 1 }));
  });

  it("keeps the old hash with an empty list", () => {
    expect(outputHash({ id: "e1", points: [{ x: 0.3, y: 0 }] }, { skip: [] })).toBe(outputHash({ id: "e1", points: [{ x: 0.3, y: 0 }] }));
  });
});

describe("packOutputForm", () => {
  const output: PackOutput = {
    placements: [
      { id: "b", x: 2, y: 0, turn: 90 },
      { id: "a", x: 0, y: 0 },
    ],
    overflow: ["z", "c"],
    size: { w: 10, h: 4 },
    moved: [
      { id: "o2", x: 1, y: 1 },
      { id: "o1", x: 0, y: 3 },
    ],
    trace: [{ id: "stage", ms: 12.5 }],
  };

  it("sorts by id, gives turn 0 when it is absent, and has no trace", () => {
    expect(packOutputForm(output)).toEqual({
      placements: [
        { id: "a", x: 0, y: 0, turn: 0 },
        { id: "b", x: 2, y: 0, turn: 90 },
      ],
      overflow: ["c", "z"],
      size: { w: 10, h: 4 },
      moved: [
        { id: "o1", x: 0, y: 3 },
        { id: "o2", x: 1, y: 1 },
      ],
    });
  });

  it("gives one hash for the same result in another order, with another trace, or with turn 0 written", () => {
    const other: PackOutput = {
      placements: [
        { id: "a", x: 0, y: 0, turn: 0 },
        { id: "b", x: 2, y: 0, turn: 90 },
      ],
      overflow: ["c", "z"],
      size: { w: 10, h: 4 },
      moved: [...output.moved].reverse(),
      trace: [{ id: "stage", ms: 99 }],
    };
    expect(outputHash(packOutputForm(other), exact)).toBe(outputHash(packOutputForm(output), exact));
  });

  it("gives another hash when a position, a turn, the size, the overflow or a move changes", () => {
    const base = outputHash(packOutputForm(output), exact);
    const changes: PackOutput[] = [
      { ...output, placements: [{ id: "b", x: 2.0001, y: 0, turn: 90 }, output.placements[1]!] },
      { ...output, placements: [{ id: "b", x: 2, y: 0 }, output.placements[1]!] },
      { ...output, size: { w: 10, h: 5 } },
      { ...output, overflow: ["c"] },
      { ...output, moved: [{ id: "o2", x: 1, y: 2 }, output.moved[1]!] },
    ];
    for (const change of changes) expect(outputHash(packOutputForm(change), exact)).not.toBe(base);
  });

  it("throws on an id two times in a list, with the name of the list", () => {
    expect(() => packOutputForm({ ...output, placements: [...output.placements, { id: "a", x: 5, y: 5 }] })).toThrow("placements");
    expect(() => packOutputForm({ ...output, overflow: ["c", "c"] })).toThrow(RangeError);
    expect(() => packOutputForm({ ...output, moved: [...output.moved, { id: "o1", x: 0, y: 0 }] })).toThrow("moved");
  });

  it("does not change the output", () => {
    const copy = structuredClone(output);
    packOutputForm(output);
    expect(output).toEqual(copy);
  });
});

describe("probeHash", () => {
  class Refused extends Error {}

  it("gives outputHash of the result with exact numbers by default", () => {
    expect(probeHash(() => ({ x: 0.0001 }), () => false)).toBe(outputHash({ x: 0.0001 }, exact));
    expect(probeHash(() => ({ x: 0.0001 }), () => false)).not.toBe(outputHash({ x: 0 }, exact));
    expect(probeHash(() => ({ x: 0.0001 }), () => false, { grid: RECORD_EPS })).toBe(outputHash({ x: 0 }));
  });

  it("keeps exact numbers when the options have the key grid with no value", () => {
    // The types refuse this form. A JavaScript caller or a spread of a partial object can give it.
    const noGrid = { grid: undefined } as unknown as Parameters<typeof probeHash>[2];
    expect(probeHash(() => ({ x: 0.0001 }), () => false, noGrid)).toBe(outputHash({ x: 0.0001 }, exact));
  });

  it("uses the skip list of the options", () => {
    expect(probeHash(() => ({ a: 1, through: 2 }), () => false, { skip: ["through"] })).toBe(outputHash({ a: 1 }, exact));
  });

  it("gives the token of a refusal for an accepted error, with no reason text", () => {
    const refused = (error: unknown): boolean => error instanceof Refused;
    expect(probeHash(() => { throw new Refused("one reason"); }, refused)).toBe(REFUSED_PROBE);
    expect(probeHash(() => { throw new Refused("another reason"); }, refused)).toBe(REFUSED_PROBE);
  });

  it("throws each other error again", () => {
    const refused = (error: unknown): boolean => error instanceof Refused;
    expect(() => probeHash(() => { throw new TypeError("bug"); }, refused)).toThrow(TypeError);
  });

  it("has a token that is not the form of a hash", () => {
    expect(REFUSED_PROBE).not.toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("fingerprintOf", () => {
  const hashes = { "p-small": "0123456789abcdef", "p-large": REFUSED_PROBE };

  it("is the first 16 hex characters of the SHA-256 of the canonical JSON of the hashes", () => {
    expect(fingerprintOf(hashes)).toBe(nodeSha('{"p-large":"refused","p-small":"0123456789abcdef"}').slice(0, 16));
  });

  it("does not change with the order of the probes", () => {
    expect(fingerprintOf({ "p-large": REFUSED_PROBE, "p-small": "0123456789abcdef" })).toBe(fingerprintOf(hashes));
  });

  it("changes with a changed hash, a new probe or a probe less", () => {
    const base = fingerprintOf(hashes);
    expect(fingerprintOf({ ...hashes, "p-small": "0123456789abcdee" })).not.toBe(base);
    expect(fingerprintOf({ ...hashes, "p-new": "fedcba9876543210" })).not.toBe(base);
    expect(fingerprintOf({ "p-small": "0123456789abcdef" })).not.toBe(base);
  });

  it("changes when a probe goes from refused to a result", () => {
    expect(fingerprintOf({ ...hashes, "p-large": "0000000000000000" })).not.toBe(fingerprintOf(hashes));
  });

  it("throws without a probe", () => {
    expect(() => fingerprintOf({})).toThrow(RangeError);
  });
});
