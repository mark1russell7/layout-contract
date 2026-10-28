import { createHash } from "node:crypto";
import { documentHash, outputHash, stepRandom } from "@mark1russell7/layout-contract";
import { canonicalJson, hashInput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointCorpus } from "./corpus.ts";

/** The hash of `packing`: the first 16 hex characters of the SHA-256 of its canonical form, with `round3`. */
const packingHash = (value: unknown): string => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex").slice(0, 16);

/** Placements with random coordinates, sorted by id, as a packer gives them. */
function placements(seed: number, count: number): { id: string; x: number; y: number; rotated?: boolean }[] {
  const r = stepRandom(seed, "placements");
  const list = Array.from({ length: count }, (_, i) => ({ id: `b${String(i).padStart(4, "0")}`, x: (r() - 0.5) * 2000, y: r() * 1e6, ...(r() < 0.3 ? { rotated: true } : {}) }));
  return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const values: readonly unknown[] = [
  0,
  -0,
  [-0, 0, -0.0004],
  0.0005,
  1.0005,
  -0.0005,
  -1.0005,
  2.0005,
  0.1 + 0.2,
  1e12 + 0.0005,
  2 ** 53,
  123456789.12345,
  { b: { d: [1.23456, { f: -0, e: 2.9995 }], c: "x" }, a: [true, null, "q"] },
  { skip: undefined, keep: 1 },
  { placements: placements(1, 50) },
  { placements: placements(2, 500), container: { w: 1000.0004, h: 999.9996 } },
];

describe("outputHash and packing", () => {
  it("gives the hash of the canonical form of packing for each value", () => {
    for (const v of values) expect(outputHash(v)).toBe(packingHash(v));
  });
});

describe("documentHash and packing", () => {
  it("gives the input hash of packing for the inputs of joint-v1", () => {
    const { inputs } = jointCorpus();
    const sample = inputs.filter((_, i) => i % 25 === 0);
    expect(sample.length).toBeGreaterThan(3);
    for (const f of sample) {
      expect(documentHash(f)).toBe(hashInput(f));
      expect(documentHash(f)).toBe(f.hash);
    }
  });
});
