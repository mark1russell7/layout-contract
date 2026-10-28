// The record count check of the analysis (`docs/JOINT-BENCH.md`, roadmap item L28). It is the empty guard of the joint run: each input of the manifest must have records.

/** The result of the record count check. */
export interface RecordCount {
  /** The count of the inputs of the manifest: the specs times the seeds. */
  readonly manifest: number;
  /** The count of the inputs of the manifest with one record or more. */
  readonly recorded: number;
  /** The inputs of the manifest without a record, in the order of the manifest. */
  readonly missing: readonly string[];
  /** The missing inputs that the list of permitted inputs holds. */
  readonly allowed: readonly string[];
  /** The inputs with records that the manifest does not hold, in the order of the ids. */
  readonly unknown: readonly string[];
  /** This value is true when each missing input is permitted, and each input with records is in the manifest. */
  readonly ok: boolean;
}

/**
 * This function counts the inputs from the input ids of the records, not from the manifest.
 * The check fails when an input of the manifest has no record and `allow` does not hold it.
 * The check also fails when a record has an input outside the manifest.
 */
export function recordCount(manifest: readonly string[], recordInputs: Iterable<string>, allow: readonly string[] = []): RecordCount {
  const expected = new Set(manifest);
  const seen = new Set(recordInputs);
  const allowSet = new Set(allow);
  const missing = manifest.filter((id) => !seen.has(id));
  const allowed = missing.filter((id) => allowSet.has(id));
  const unknown = [...seen].filter((id) => !expected.has(id)).sort();
  return { manifest: expected.size, recorded: expected.size - missing.length, missing, allowed, unknown, ok: allowed.length === missing.length && unknown.length === 0 };
}

/** This function reads a list of input ids: one id on each line. It ignores the empty lines and the lines that start with `#`. */
export function idList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}
