import { fnv1a32 as homeFnv1a32, mulberry32 as homeMulberry32 } from "@mark1russell7/rigor-generators";

/**
 * This function gives a generator of random numbers in [0, 1). It is `mulberry32`, as in `docs/FORMAT.md` of `packing`.
 * Its home is `@mark1russell7/rigor-generators`. This function keeps the name and the signature of the API.
 */
export function mulberry32(seed: number): () => number {
  return homeMulberry32(seed);
}

/**
 * This function gives the FNV-1a hash of 32 bits of the UTF-8 bytes of a string. A lone surrogate gives the 3 bytes of its code.
 * Its home is `fnv1a32` of `@mark1russell7/rigor-generators`, with the option `input: "wtf8"`. This function keeps the name and the signature of the API.
 */
export function fnv1a32(text: string): number {
  return homeFnv1a32(text, { input: "wtf8" });
}

/** This function gives the generator of one step of a seeded generator: `mulberry32(fnv1a32("<seed>:<step>"))`. */
export function stepRandom(seed: number, step: string): () => number {
  return mulberry32(fnv1a32(`${seed}:${step}`));
}

/** This function gives a whole number from `lo` to `hi`, both included. */
export function randomInt(r: () => number, lo: number, hi: number): number {
  return lo + Math.floor(r() * (hi - lo + 1));
}
