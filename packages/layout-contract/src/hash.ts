import { canonicalJson as homeCanonicalJson, sha256Hex as homeSha256Hex } from "@mark1russell7/rigor-generators";
import { canonicalInput, type LayoutInput } from "./input.ts";
import type { PackOutput } from "./output.ts";
import { RECORD_EPS } from "./tolerance.ts";

/**
 * This function gives the SHA-256 digest of the bytes of a string, as 64 lowercase hex characters. A lone surrogate gives the 3 bytes of its code.
 * Its home is `sha256Hex` of `@mark1russell7/rigor-generators`, with the option `input: "wtf8"`. This function keeps the name and the signature of the API.
 */
export function sha256Hex(text: string): string {
  return homeSha256Hex(text, { input: "wtf8" });
}

/**
 * This function gives the canonical form of a value: sorted keys and no whitespace, with the numbers of `JSON.stringify`.
 * A key with the value `undefined` is not in the form. An `undefined` in an array becomes `null`.
 * Its home is `canonicalJson` of `@mark1russell7/rigor-generators`, with the option `form: "json"`.
 * So a value with a method `toJSON`, for example a `Date`, gives the form of the result of that method. A function, a symbol and a cycle cause a `TypeError`.
 */
export function canonicalJson(value: unknown): string {
  return homeCanonicalJson(value, { form: "json" });
}

/** The options of `outputHash` and `documentHash`. */
export interface HashOptions {
  /**
   * The step of the grid of the numbers. The default is `RECORD_EPS`, so a number keeps 3 decimals.
   * The value `0` keeps the exact numbers. A negative value or a value that is not finite causes a `RangeError`.
   */
  readonly grid?: number;
  /**
   * The names of the fields that the hash does not read, at each depth. Use it for report fields, for example a trace or a time.
   * A field with one of these names is out of the form in each object of the value, also in an object in a list.
   */
  readonly skip?: readonly string[];
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
function onGrid(value: unknown, path: string, k: number | undefined, skip: ReadonlySet<string>): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`The value has the number ${value} at ${path}. JSON has no form for it.`);
    if (k === undefined) return value;
    const r = Math.round(value * k) / k;
    if (!Number.isFinite(r)) throw new RangeError(`The number at ${path} is too large for the grid.`);
    return r === 0 ? 0 : r;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown, i) => onGrid(v, `${path}[${i}]`, k, skip));
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(o)) if (!skip.has(key)) out[key] = onGrid(o[key], `${path}.${key}`, k, skip);
  return out;
}

/**
 * This function gives the hash of an output: the first 16 hex characters of the SHA-256 of its canonical form.
 * Before the canonical form, each number goes to the nearest point of the grid, and `-0` becomes `0`.
 * With the default grid, the rounding is `round3` of `packing`: `Math.round(x * 1000) / 1000`.
 * The function throws a `RangeError` for `NaN` and for an infinite number. The fields of `options.skip` are out of the form.
 *
 * The grid can split two outputs. Two numbers near a rounding boundary can go to two different points.
 * The grid can also merge two outputs whose numbers go to the same points. This merge is intentional: it removes the noise of floating-point numbers.
 */
export function outputHash(value: unknown, options: HashOptions = {}): string {
  return sha256Hex(canonicalJson(onGrid(value, "$", gridFactor(options), new Set(options.skip ?? [])))).slice(0, 16);
}

/** This function throws a `RangeError` when a list of the output has an id two times. A packer with this output has a bug. */
function uniqueIds(list: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new RangeError(`The list ${list} of the output has the id "${id}" two times.`);
    seen.add(id);
  }
}

/** The order of two ids by their UTF-16 code units. It does not change with the locale. */
function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * This function gives the normal form of the output of a packer, for a fingerprint.
 * The form has the placements, the overflow, the size and the moved obstacles. It does not have the trace.
 * The placements, the moved obstacles and the overflow are in the order of their ids. A placement without `turn` gets `turn: 0`.
 * Thus two packers with the same result in a different order have the same form.
 * The function throws a `RangeError` when `placements`, `overflow` or `moved` has an id two times.
 *
 * A placement has `w`, `h` and `shape` only when the packer set them, so the form of an output without a resize does not change.
 */
export function packOutputForm(output: PackOutput): unknown {
  uniqueIds("placements", output.placements.map((p) => p.id));
  uniqueIds("overflow", output.overflow);
  uniqueIds("moved", output.moved.map((m) => m.id));
  return {
    placements: output.placements
      .map((p) => ({ id: p.id, x: p.x, y: p.y, turn: p.turn ?? 0, ...(p.w === undefined ? {} : { w: p.w }), ...(p.h === undefined ? {} : { h: p.h }), ...(p.shape === undefined ? {} : { shape: p.shape }) }))
      .sort(byId),
    overflow: [...output.overflow].sort(),
    size: { w: output.size.w, h: output.size.h },
    moved: output.moved.map((m) => ({ id: m.id, x: m.x, y: m.y })).sort(byId),
  };
}

/** The hash of a probe that the strategy refused or does not support. It has no reason text, so a new text of a refusal does not change a fingerprint. */
export const REFUSED_PROBE = "refused";

/**
 * This function gives the hash of one probe of a strategy. It calls `run` and gives `outputHash` of its result, with exact numbers by default.
 * When `run` throws an error that `refused` accepts, the function gives `REFUSED_PROBE`. It throws each other error again.
 * The option `grid` of `options` puts the numbers on a grid. Its default here is `0`, so a change in a number changes the hash.
 */
export function probeHash(run: () => unknown, refused: (error: unknown) => boolean, options: HashOptions = {}): string {
  let value: unknown;
  try {
    value = run();
  } catch (error) {
    if (refused(error)) return REFUSED_PROBE;
    throw error;
  }
  return outputHash(value, { ...options, grid: options.grid ?? 0 });
}

/**
 * This function gives the fingerprint of the outputs of one strategy: one hash of the hashes of its probes.
 * The key of `hashes` is the id of a probe, and its value is the hash of the probe, from `probeHash`.
 * The order of the keys does not change the fingerprint. A new probe, a probe less or a changed hash changes it.
 * The function throws a `RangeError` when there is no probe.
 */
export function fingerprintOf(hashes: Readonly<Record<string, string>>): string {
  if (Object.keys(hashes).length === 0) throw new RangeError("A fingerprint needs one probe or more.");
  return sha256Hex(canonicalJson(hashes)).slice(0, 16);
}

/**
 * This function gives the hash of a document. It uses the rule of `outputHash`, but the form does not include the field `hash` of the document.
 * With the default grid, it is the input hash of `docs/FORMAT.md` of `packing`.
 * A document with the schema `layout-input/1` goes through `canonicalInput` first. Thus the order of its `pairGaps` does not change the hash.
 */
export function documentHash(doc: object, options: HashOptions = {}): string {
  const { hash: _hash, ...rest } = doc as { readonly hash?: unknown; readonly schema?: unknown };
  return outputHash(rest.schema === "layout-input/1" ? canonicalInput(rest as unknown as LayoutInput) : rest, options);
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
