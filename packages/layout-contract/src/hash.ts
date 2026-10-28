import { RECORD_EPS } from "./tolerance.ts";
import { utf8 } from "./utf8.ts";

/** The round constants of SHA-256. */
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * This function gives the SHA-256 digest of the UTF-8 bytes of a string, as 64 lowercase hex characters.
 * It uses no API of Node or of the browser.
 */
export function sha256Hex(text: string): string {
  const bytes = utf8(text);
  const bits = bytes.length * 8;
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(total);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(total - 8, Math.floor(bits / 0x100000000));
  view.setUint32(total - 4, bits >>> 0);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + 4 * i);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + s1 + ch + K[i]! + w[i]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + k) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/**
 * This function gives the canonical form of a value: sorted keys and no whitespace, with the numbers of `JSON.stringify`.
 * A key with the value `undefined` is not in the form. An `undefined` in an array becomes `null`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v: unknown) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** The options of `outputHash` and `documentHash`. */
export interface HashOptions {
  /**
   * The step of the grid of the numbers. The default is `RECORD_EPS`, so a number keeps 3 decimals.
   * The value `0` keeps the exact numbers. A negative value or a value that is not finite causes a `RangeError`.
   */
  readonly grid?: number;
}

/** This function gives the factor of a grid: `1 / grid`, or `undefined` for the exact numbers. */
function gridFactor(options: HashOptions): number | undefined {
  const grid = options.grid ?? RECORD_EPS;
  if (!Number.isFinite(grid) || grid < 0) throw new RangeError(`The grid ${grid} is not a finite number of 0 or more.`);
  return grid === 0 ? undefined : 1 / grid;
}

/**
 * This function gives a copy of a value with each number on the grid. The value `-0` becomes `0`.
 * It throws a `RangeError` for a number that is not finite.
 */
function onGrid(value: unknown, path: string, k: number | undefined): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`The value has the number ${value} at ${path}. JSON has no form for it.`);
    if (k === undefined) return value;
    const r = Math.round(value * k) / k;
    if (!Number.isFinite(r)) throw new RangeError(`The number at ${path} is too large for the grid.`);
    return r === 0 ? 0 : r;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown, i) => onGrid(v, `${path}[${i}]`, k));
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(o)) out[key] = onGrid(o[key], `${path}.${key}`, k);
  return out;
}

/**
 * This function gives the hash of an output: the first 16 hex characters of the SHA-256 of its canonical form.
 * Before the canonical form, each number goes to the nearest point of the grid, and `-0` becomes `0`.
 * With the default grid, the rounding is `round3` of `packing`: `Math.round(x * 1000) / 1000`.
 * The function throws a `RangeError` for `NaN` and for an infinite number.
 *
 * The grid can split two outputs. Two numbers near a rounding boundary can go to two different points.
 * The grid can also merge two outputs whose numbers go to the same points. This merge is intentional: it removes the noise of floating-point numbers.
 */
export function outputHash(value: unknown, options: HashOptions = {}): string {
  return sha256Hex(canonicalJson(onGrid(value, "$", gridFactor(options)))).slice(0, 16);
}

/**
 * This function gives the hash of a document. It uses the rule of `outputHash`, but the form does not include the field `hash` of the document.
 * With the default grid, it is the input hash of `docs/FORMAT.md` of `packing`.
 */
export function documentHash(doc: object, options: HashOptions = {}): string {
  const { hash: _hash, ...rest } = doc as { readonly hash?: unknown };
  return outputHash(rest, options);
}

/** One output group: the candidates with the same output hash on each decision input. */
export interface OutputGroup {
  /** The id of the group: its first member. */
  readonly id: string;
  /** The ids of the candidates of the group, in sorted order. */
  readonly members: readonly string[];
}

/**
 * This function gives the output groups of the candidates. The key of `hashes` is the id of a candidate.
 * Its value is the list of the output hashes of the candidate, in the order of the decision inputs.
 * Candidates with equal lists make one group. The groups are in the order of their ids.
 * The function throws a `RangeError` when two lists have different lengths.
 */
export function outputGroups(hashes: Readonly<Record<string, readonly string[]>>): OutputGroup[] {
  const byList = new Map<string, string[]>();
  let first: string | undefined;
  for (const id of Object.keys(hashes)) {
    const list = hashes[id]!;
    if (first === undefined) first = id;
    else if (list.length !== hashes[first]!.length)
      throw new RangeError(`The candidate "${id}" has ${list.length} hashes, but "${first}" has ${hashes[first]!.length}.`);
    const key = JSON.stringify(list);
    const members = byList.get(key);
    if (members) members.push(id);
    else byList.set(key, [id]);
  }
  const groups = [...byList.values()].map((members): OutputGroup => {
    const sorted = [...members].sort();
    return { id: sorted[0]!, members: sorted };
  });
  return groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The evidence that a candidate is exercised on its decision inputs. */
export interface ExerciseEvidence {
  /** The move counts of the candidate, by name. A record keeps each one as the trace measure `move.<name>`. */
  readonly moves?: Readonly<Record<string, number>>;
  /** The output hashes of the candidate, in the order of the decision inputs. */
  readonly hashes?: readonly string[];
  /** The output hashes of the base of the candidate, in the same order. */
  readonly baseHashes?: readonly string[];
}

/**
 * This function tells if a candidate is exercised. It gives `true` when a move count is more than 0.
 * It also gives `true` when `hashes` and `baseHashes` are different at one place or more.
 * Without evidence, it gives `false`.
 * The function throws a `RangeError` when only one of the two lists is given, or when their lengths are different.
 */
export function exercised(evidence: ExerciseEvidence): boolean {
  const { moves, hashes, baseHashes } = evidence;
  if ((hashes === undefined) !== (baseHashes === undefined)) throw new RangeError("The evidence must have both hashes and baseHashes, or neither of them.");
  if (hashes && baseHashes && hashes.length !== baseHashes.length)
    throw new RangeError(`The candidate has ${hashes.length} hashes, but its base has ${baseHashes.length}.`);
  if (moves && Object.values(moves).some((n) => n > 0)) return true;
  if (hashes && baseHashes) return hashes.some((h, i) => h !== baseHashes[i]);
  return false;
}
