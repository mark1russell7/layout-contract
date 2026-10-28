import { describe, expect, it } from "vitest";
import {
  canonicalInput,
  checkInput,
  countOverlaps,
  DEFAULT_TOLERANCE,
  documentHash,
  grow,
  outputHash,
  overlapOf,
  packHard,
  placedRect,
  stepRandom,
  toPackInput,
  type LayoutBox,
  type LayoutInput,
  type PairGap,
} from "./index.ts";

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

describe("the hard rule no-overlap and pairGaps", () => {
  // a and b are 3 units apart on the x axis. With margins of 2, the two rings overlap by 1.
  const a: LayoutBox = { id: "a", w: 10, h: 10, x: 0, y: 0, margin: 2 };
  const b: LayoutBox = { id: "b", w: 10, h: 10, x: 13, y: 0, margin: 2 };
  const bare = [{ ...a, margin: 0 }, { ...b, margin: 0 }];

  it("does not count a pair whose distance is at least its gap, also when the gap is less than both margins", () => {
    expect(countOverlaps([a, b])).toBe(1);
    expect(countOverlaps([a, b], DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 1 }])).toBe(0);
    expect(countOverlaps([a, b], DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 3 }])).toBe(0);
  });

  it("counts a pair whose distance is less than its gap, also without margins", () => {
    expect(countOverlaps(bare)).toBe(0);
    expect(countOverlaps(bare, DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 5 }])).toBe(1);
    expect(countOverlaps(bare, DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 3.0005 }])).toBe(0);
    expect(countOverlaps(bare, DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 3.01 }])).toBe(1);
    // Far apart on the y axis: the gap alone does not make an overlap.
    expect(countOverlaps([bare[0]!, { ...bare[1]!, y: 50 }], DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 5 }])).toBe(0);
  });

  it("reads a reversed pair as the same pair", () => {
    expect(countOverlaps([a, b], DEFAULT_TOLERANCE.overlap, [{ a: "b", b: "a", gap: 1 }])).toBe(0);
    expect(countOverlaps(bare, DEFAULT_TOLERANCE.overlap, [{ a: "b", b: "a", gap: 5 }])).toBe(1);
  });

  it("keeps the margins for the pairs that are not in the list", () => {
    const c: LayoutBox = { id: "c", w: 10, h: 10, x: -3, y: 13, margin: 2 };
    expect(countOverlaps([a, b, c])).toBe(2);
    expect(countOverlaps([a, b, c], DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "b", gap: 1 }])).toBe(1);
    expect(countOverlaps([a, b, c], DEFAULT_TOLERANCE.overlap, [{ a: "a", b: "x", gap: 1 }])).toBe(2);
    expect(countOverlaps([a, b, c], DEFAULT_TOLERANCE.overlap, [])).toBe(2);
  });

  it("goes through packHard", () => {
    const out = { overflow: [], size: { w: 100, h: 100 }, moved: [], placements: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 13, y: 0 }] };
    const i: LayoutInput = { schema: "layout-input/1", id: "t", container: { w: 100, h: 100, fixed: "size" }, boxes: [{ id: "a", w: 10, h: 10, margin: 2 }, { id: "b", w: 10, h: 10, margin: 2 }] };
    expect(packHard(i, out)["no-overlap"]).toBe(1);
    expect(packHard({ ...i, pairGaps: [{ a: "b", b: "a", gap: 1 }] }, out)["no-overlap"]).toBe(0);
    expect(packHard({ ...i, pairGaps: [{ a: "a", b: "b", gap: 4 }] }, out)["no-overlap"]).toBe(1);
  });

  it("gives the count of a pair by pair reference on random layouts, with and without pairGaps", () => {
    const tol = DEFAULT_TOLERANCE.overlap;
    /** The reference: each pair once, with the margins, or with the gap of its entry in place of the margins. */
    const reference = (boxes: readonly LayoutBox[], gapOf: (x: string, y: string) => number | undefined): number => {
      let n = 0;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const p = placedRect(boxes[i]!)!;
          const q = placedRect(boxes[j]!)!;
          const g = gapOf(boxes[i]!.id, boxes[j]!.id);
          const o = g === undefined ? overlapOf(grow(p, boxes[i]!.margin), grow(q, boxes[j]!.margin)) : overlapOf(grow(p, g), q);
          if (o.x > tol && o.y > tol) n++;
        }
      return n;
    };
    for (let seed = 1; seed <= 40; seed++) {
      const r = stepRandom(seed, "overlaps");
      const boxes: LayoutBox[] = Array.from({ length: 30 }, (_, i) => ({
        id: `n${i}`,
        w: 2 + r() * 12,
        h: 2 + r() * 12,
        x: r() * 80,
        y: r() * 80,
        ...(r() < 0.5 ? { margin: r() * 3 } : r() < 0.5 ? { margin: { top: r() * 3, right: r() * 3, bottom: r() * 3, left: r() * 3 } } : {}),
      }));
      expect(countOverlaps(boxes)).toBe(reference(boxes, () => undefined));
      const pairs: PairGap[] = [];
      const seen = new Set<string>();
      for (let k = 0; k < 25; k++) {
        const x = Math.floor(r() * 30);
        const y = Math.floor(r() * 30);
        const key = x < y ? `${x},${y}` : `${y},${x}`;
        if (x === y || seen.has(key)) continue;
        seen.add(key);
        pairs.push(r() < 0.5 ? { a: `n${x}`, b: `n${y}`, gap: r() * 8 } : { a: `n${y}`, b: `n${x}`, gap: r() * 8, lanes: 2 });
      }
      const gapOf = (x: string, y: string): number | undefined => pairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x))?.gap;
      expect(countOverlaps(boxes, tol, pairs)).toBe(reference(boxes, gapOf));
    }
  });
});
