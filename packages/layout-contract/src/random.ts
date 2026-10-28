/** This function gives a generator of random numbers in [0, 1). It is `mulberry32`, as in `docs/FORMAT.md` of `packing`. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function gives the FNV-1a hash of 32 bits of the UTF-8 bytes of a string. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of utf8(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

/** The UTF-8 bytes of a string. The package has no runtime dependencies, thus it does not use `TextEncoder`. */
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return bytes;
}

/** This function gives the generator of one step of a seeded generator: `mulberry32(fnv1a32("<seed>:<step>"))`. */
export function stepRandom(seed: number, step: string): () => number {
  return mulberry32(fnv1a32(`${seed}:${step}`));
}

/** This function gives a whole number from `lo` to `hi`, both included. */
export function randomInt(r: () => number, lo: number, hi: number): number {
  return lo + Math.floor(r() * (hi - lo + 1));
}
