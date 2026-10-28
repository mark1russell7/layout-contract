// The checks of the claims of a corpus (`docs/CORPUS-CHECKS.md`). The joint corpus, `packing` and `highways` use the same checks.
import { canonicalJson, sha256Hex } from "./hash.ts";

/** One broken claim of a corpus, with the ids of the inputs that break it. */
export interface ClaimBreak {
  /** The name of the claim, for example `declared`, `split` or `index`. */
  readonly claim: string;
  /** The text of the break. */
  readonly detail: string;
  /** The ids of the inputs that break the claim. The list is empty when the break has no input. */
  readonly inputs: readonly string[];
}

/** The claim `claims.declared` of a manifest: the count of the inputs for each declared property. */
export interface DeclaredClaim {
  /** A property with fewer inputs than this count is thin. */
  readonly minCount: number;
  /** The ids of the properties with a count below `minCount`. */
  readonly thin: readonly string[];
  /** The count of the inputs for each property id. */
  readonly counts: Readonly<Record<string, number>>;
}

/** The hook that gives the ids of the properties that one input declares. */
export type Declares<I> = (input: I) => readonly string[];

/**
 * This function gives the count of the inputs for each property id. Each id of `ids` has a count, also when the count is 0.
 * An id from `declares` that is not in `ids` comes after the ids of `ids`, in the order of the first input that declares it.
 */
export function declaredCounts<I>(inputs: Iterable<I>, declares: Declares<I>, ids: readonly string[] = []): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const input of inputs) for (const id of declares(input)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** This function tells if a value is a plain object. */
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * This function reads the field `claims.declared` of a manifest. A manifest without it gives `undefined`.
 * It throws an `Error` for a claim without a whole `minCount`, a list `thin` of ids and a whole count for each id.
 */
export function declaredClaimOf(manifest: object): DeclaredClaim | undefined {
  const claims = (manifest as Record<string, unknown>)["claims"];
  if (claims === undefined) return undefined;
  if (!isObject(claims)) throw new Error("The field claims of a corpus file is an object.");
  const declared = claims["declared"];
  if (declared === undefined) return undefined;
  if (!isObject(declared)) throw new Error("The field claims.declared of a corpus file is an object.");
  const { minCount, thin, counts } = declared;
  if (!Number.isInteger(minCount) || (minCount as number) < 0) throw new Error("The field claims.declared.minCount is a whole number of 0 or more.");
  if (!Array.isArray(thin) || !thin.every((id) => typeof id === "string")) throw new Error("The field claims.declared.thin is a list of property ids.");
  if (!isObject(counts) || !Object.values(counts).every((n) => Number.isInteger(n) && (n as number) >= 0)) {
    throw new Error("The field claims.declared.counts gives a whole count for each property id.");
  }
  return { minCount: minCount as number, thin: [...(thin as string[])], counts: { ...(counts as Record<string, number>) } };
}

/**
 * This function checks the claim `claims.declared` against the inputs. It gives one break `declared` for each problem. An empty list tells that the claim is true.
 *
 * - `ids` are the property ids. The default is the ids of `claim.counts`.
 * - Each id of `ids` has a count in `claim.counts`, and `claim.counts` has no other id. Each count is the count of the inputs.
 * - An id with a count below `minCount` is in `thin`. Each id of `thin` is an id of `ids`.
 * - Each id that `declares` gives is an id of `ids`.
 */
export function checkDeclared<I>(inputs: Iterable<I>, declares: Declares<I>, claim: DeclaredClaim, ids: readonly string[] = Object.keys(claim.counts)): ClaimBreak[] {
  const computed = declaredCounts(inputs, declares, ids);
  const out: string[] = [];
  for (const id of ids) {
    if (!(id in claim.counts)) out.push(`the property "${id}" has no count`);
    else if (claim.counts[id] !== computed[id]) out.push(`the property "${id}" has the count ${claim.counts[id]}, but the inputs give ${computed[id]}`);
  }
  for (const id of Object.keys(claim.counts)) if (!ids.includes(id)) out.push(`"${id}" is not a declared property`);
  for (const id of ids) {
    const thin = (computed[id] ?? 0) < claim.minCount;
    if (thin && !claim.thin.includes(id)) out.push(`the property "${id}" has ${computed[id]} inputs, below minCount ${claim.minCount}, and it is not in thin`);
  }
  for (const id of claim.thin) if (!ids.includes(id)) out.push(`"${id}" of thin is not a declared property`);
  for (const id of Object.keys(computed)) if (!ids.includes(id)) out.push(`${computed[id]} inputs declare "${id}", which is not a declared property`);
  return out.map((detail) => ({ claim: "declared", detail, inputs: [] }));
}

/** The id and the hash of one input of a corpus. */
export interface CorpusEntry {
  readonly id: string;
  readonly hash: string;
}

/**
 * This function gives the hash of a corpus: the first 16 hex characters of a SHA-256. The text of the SHA-256 is `canonicalJson`
 * of the corpus id and the `[id, hash]` of each input, in the order of the manifest. A change of one input changes the hash.
 */
export function corpusHashOf(corpus: string, inputs: readonly CorpusEntry[]): string {
  return sha256Hex(canonicalJson({ corpus, inputs: inputs.map((i) => [i.id, i.hash]) })).slice(0, 16);
}

/** The schema of a split file. */
export const SPLIT_SCHEMA = "corpus-split/1";

/** One fold of a split: the seeds that fit a selector and the seeds that score it. */
export interface SplitFold {
  readonly train: readonly number[];
  readonly heldOut: readonly number[];
}

/** A split file `corpus-split/1`. Its name is `<corpus id>.<corpus hash>.json`. It is beside the corpus, so the corpus does not change. */
export interface CorpusSplit {
  readonly schema: typeof SPLIT_SCHEMA;
  readonly corpus: string;
  /** The hash of the corpus: `corpusHashOf` of its manifest. */
  readonly corpusHash: string;
  /** The splits by name. Each split has one fold or more. */
  readonly splits: Readonly<Record<string, { readonly folds: readonly SplitFold[] }>>;
}

/** The fields of a manifest that the split check reads. */
export interface SplitCorpus {
  readonly corpus: string;
  readonly specs: readonly { readonly seeds: readonly number[] }[];
  readonly inputs: readonly CorpusEntry[];
}

/** This function gives the name of the split file of a corpus. */
export function splitFileName(corpus: string, hash: string): string {
  return `${corpus}.${hash}.json`;
}

/** This function tells if a value is a list of whole numbers. */
const isSeeds = (value: unknown): value is number[] => Array.isArray(value) && value.every((s) => Number.isInteger(s));

/**
 * This function checks a split file against a manifest. It gives one break `split` for each problem. An empty list tells that the file is good.
 *
 * - The schema is `corpus-split/1`, the corpus is the id of the manifest and `corpusHash` is `corpusHashOf` of the manifest.
 * - Each split has one fold or more. In each fold, `train` and `heldOut` are lists of seeds, not empty and with no common seed.
 * - Each seed is a seed of a spec of the manifest.
 * - With `name`, the file has the split `name`.
 */
export function checkSplit(split: unknown, corpus: SplitCorpus, name?: string): ClaimBreak[] {
  const out: string[] = [];
  const done = (): ClaimBreak[] => out.map((detail) => ({ claim: "split", detail, inputs: [] }));
  const f = split as Partial<CorpusSplit> | null;
  if (f === null || typeof f !== "object") {
    out.push("the split file is not an object");
    return done();
  }
  if (f.schema !== SPLIT_SCHEMA) out.push(`the schema is ${String(f.schema)}, not ${SPLIT_SCHEMA}`);
  if (f.corpus !== corpus.corpus) out.push(`the corpus is ${String(f.corpus)}, not ${corpus.corpus}`);
  const hash = corpusHashOf(corpus.corpus, corpus.inputs);
  if (f.corpusHash !== hash) out.push(`the corpusHash is ${String(f.corpusHash)}, but the corpus gives ${hash}`);
  const seeds = new Set(corpus.specs.flatMap((s) => s.seeds));
  if (f.splits === null || typeof f.splits !== "object") {
    out.push("the field splits is not an object");
    return done();
  }
  for (const [key, value] of Object.entries(f.splits)) {
    const folds = (value as { folds?: unknown } | null)?.folds;
    if (!Array.isArray(folds) || folds.length === 0) {
      out.push(`the split ${key} has no folds`);
      continue;
    }
    folds.forEach((fold: Partial<SplitFold> | null, k) => {
      const at = `the fold ${k} of the split ${key}`;
      const { train, heldOut } = fold ?? {};
      if (!isSeeds(train) || train.length === 0) out.push(`${at} has no train seeds`);
      if (!isSeeds(heldOut) || heldOut.length === 0) out.push(`${at} has no heldOut seeds`);
      if (!isSeeds(train) || !isSeeds(heldOut)) return;
      const common = train.filter((s) => heldOut.includes(s));
      if (common.length > 0) out.push(`${at} has the seeds ${common.join(", ")} in train and in heldOut`);
      const unknown = [...train, ...heldOut].filter((s) => !seeds.has(s));
      if (unknown.length > 0) out.push(`${at} has the seeds ${unknown.join(", ")}, which are not in the corpus`);
    });
  }
  if (name !== undefined && !Object.hasOwn(f.splits, name)) out.push(`the split file has no split ${name}. Its splits are ${Object.keys(f.splits).join(", ")}`);
  return done();
}

/**
 * This function gives a copy of the folds of the split `name` of a split file. `where` names the file in the text of an error.
 * It throws an `Error` for each problem of `checkSplit`, and then for an unknown split name.
 */
export function splitFolds(split: unknown, corpus: SplitCorpus, name: string, where: string = "The split file"): SplitFold[] {
  const breaks = checkSplit(split, corpus);
  if (breaks.length > 0) throw new Error(`${where} is not good: ${breaks.map((b) => b.detail).join("; ")}.`);
  const splits = (split as CorpusSplit).splits;
  const found = Object.hasOwn(splits, name) ? splits[name] : undefined;
  if (found === undefined) throw new Error(`${where} has no split ${name}. Its splits are ${Object.keys(splits).join(", ")}.`);
  return found.folds.map((f) => ({ train: [...f.train], heldOut: [...f.heldOut] }));
}

/** This function gives the folds that hold out one seed each, in the order of the seeds. Each fold trains on the other seeds. */
export function leaveOneSeedOut(seeds: readonly number[]): SplitFold[] {
  const sorted = [...new Set(seeds)].sort((a, b) => a - b);
  return sorted.map((s) => ({ train: sorted.filter((t) => t !== s), heldOut: [s] }));
}
