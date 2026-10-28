import { describe, expect, it } from "vitest";
import { canonicalInput, checkInput, documentHash, outputHash, toPackInput, type LayoutInput, type PairGap } from "./index.ts";

// L49: the pair gaps of an input. The pins come from `documentHash` of 0.2.13 (main at e6b9550), before the field existed.

const example: LayoutInput = {
  schema: "layout-input/1",
  id: "example",
  container: { w: 200, fixed: "width" },
  gap: 4,
  boxes: [{ id: "a", w: 40, h: 20, margin: 2 }],
};

const full: LayoutInput = {
  schema: "layout-input/1",
  id: "pins/full",
  set: "pins",
  family: "pins",
  seed: 3,
  source: "made-up",
  generator: { name: "pins", version: 1, params: { count: 3 }, seed: 3 },
  cell: { containerSize: "fixed", count: "10" },
  container: { w: 120.5, h: 80, fixed: "size", inset: 2 },
  gap: 6,
  boxes: [
    { id: "b0", w: 10, h: 12, margin: 1 },
    { id: "b1", w: 20.25, h: 8, locked: true, x: 4, y: 5 },
    { id: "b2", w: 7, h: 7, ports: [{ id: "p", side: "top" }] },
  ],
  edges: [{ id: "e0", source: "b0", target: "b2" }],
  obstacles: [{ id: "o0", region: { kind: "rect", x: 50, y: 50, w: 10, h: 10 } }],
};

const gaps: readonly PairGap[] = [
  { a: "b2", b: "b0", gap: 12, lanes: 3 },
  { a: "b0", b: "b1", gap: 0 },
];

describe("the hash of an input without pairGaps", () => {
  it("keeps the pinned hashes of 0.2.13", () => {
    expect(documentHash(example)).toBe("e3fa7525a3cfc1e2");
    expect(documentHash(full)).toBe("0746483e60d84784");
    expect(documentHash({ ...full, hash: "0000000000000000" })).toBe("0746483e60d84784");
  });

  it("is the same object in its canonical form", () => {
    expect(canonicalInput(full)).toBe(full);
    expect(documentHash(full)).toBe(outputHash(full));
  });
});

describe("the canonical form of pairGaps", () => {
  it("puts a before b in each pair, and sorts the list by a and then by b", () => {
    expect(canonicalInput({ ...full, pairGaps: gaps }).pairGaps).toEqual([
      { a: "b0", b: "b1", gap: 0 },
      { a: "b0", b: "b2", gap: 12, lanes: 3 },
    ]);
    expect(canonicalInput({ ...full, pairGaps: [] }).pairGaps).toEqual([]);
  });

  it("gives one hash to each order of the pairs and of the two ids", () => {
    const a = documentHash({ ...full, pairGaps: gaps });
    const b = documentHash({ ...full, pairGaps: [{ a: "b1", b: "b0", gap: 0 }, { a: "b0", b: "b2", gap: 12, lanes: 3 }] });
    expect(a).toBe(b);
    expect(a).not.toBe(documentHash(full));
    expect(documentHash({ ...full, pairGaps: [{ a: "b0", b: "b1", gap: 1 }, gaps[0]!] })).not.toBe(a);
  });

  it("does not change a document of another schema", () => {
    const doc = { schema: "other/1", pairGaps: [{ a: "z", b: "y", gap: 1 }] };
    expect(documentHash(doc)).toBe(outputHash(doc));
  });

  it("goes to the packer input", () => {
    expect(toPackInput({ ...full, pairGaps: gaps }).pairGaps).toBe(gaps);
    expect("pairGaps" in toPackInput(full)).toBe(false);
  });
});

describe("checkInput and pairGaps", () => {
  const check = (pairGaps: readonly PairGap[]): readonly string[] => checkInput({ ...full, pairGaps });

  it("accepts good pairs", () => {
    expect(check(gaps)).toEqual([]);
    expect(check([])).toEqual([]);
    expect(check([{ a: "b0", b: "b1", gap: 2.5, lanes: 0 }])).toEqual([]);
  });

  it("refuses an unknown box, a pair of one box and a repeated pair in either order", () => {
    expect(check([{ a: "b0", b: "x", gap: 1 }])).toEqual(["pair gap 0 (b0, x): the box x is not in the input"]);
    expect(check([{ a: "b1", b: "b1", gap: 1 }])).toEqual(["pair gap 0 (b1, b1): the two ids are the same box"]);
    expect(check([{ a: "b0", b: "b1", gap: 1 }, { a: "b1", b: "b0", gap: 2 }])).toEqual(["pair gap 1 (b1, b0): the pair is also pair gap 0"]);
    expect(check([{ a: "b0", b: "b1", gap: 1 }, { a: "b0", b: "b1", gap: 1 }])).toEqual(["pair gap 1 (b0, b1): the pair is also pair gap 0"]);
  });

  it("refuses a gap that is negative or not finite, and lanes that are not a whole number of 0 or more", () => {
    expect(check([{ a: "b0", b: "b1", gap: -1 }])).toEqual(["pair gap 0 (b0, b1): the gap -1 is not a finite number of 0 or more"]);
    expect(check([{ a: "b0", b: "b1", gap: Number.NaN }])).toEqual(["pair gap 0 (b0, b1): the gap NaN is not a finite number of 0 or more"]);
    expect(check([{ a: "b0", b: "b1", gap: Infinity }])).toEqual(["pair gap 0 (b0, b1): the gap Infinity is not a finite number of 0 or more"]);
    expect(check([{ a: "b0", b: "b1", gap: 1, lanes: 1.5 }])).toEqual(["pair gap 0 (b0, b1): the lanes value 1.5 is not a whole number of 0 or more"]);
    expect(check([{ a: "b0", b: "b1", gap: 1, lanes: -2 }])).toEqual(["pair gap 0 (b0, b1): the lanes value -2 is not a whole number of 0 or more"]);
  });

  it("refuses an entry without string ids and a value that is not a list", () => {
    expect(check([{ a: 3, b: "b1", gap: 1 } as unknown as PairGap])).toEqual(["pair gap 0: the entry has no string ids a and b"]);
    expect(checkInput({ ...full, pairGaps: {} as unknown as readonly PairGap[] })).toEqual(["pairGaps: the value is not a list"]);
  });
});
