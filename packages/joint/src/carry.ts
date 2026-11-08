// The carry of the records of a run over an engine release (docs/JOINT-BENCH.md, section "Carry", roadmap item L147).
// A probe gives a fingerprint of each pack entry on each input and of each router, at one set of engine versions.
// A record keeps its measures when its pack and its router have the same fingerprints at the two versions. A seeded audit then measures a sample again.
import { canonicalJson, carryRecord, fingerprintOf, sha256Hex, type LayoutRecord } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { doneKey } from "./shard-run.ts";

/** The schema of a probe document. */
export const CARRY_PROBE_SCHEMA = "carry-probe/1";

/** The fingerprints of one probe: the facts of one set of engine versions. `carry-probe.ts` makes them. */
export interface CarryProbe {
  readonly schema: typeof CARRY_PROBE_SCHEMA;
  /** The id of the corpus of the inputs. */
  readonly corpus: string;
  /** The version of each engine of the probe, by the name of the engine. */
  readonly engines: Readonly<Record<string, string>>;
  /** The fingerprint of each pack entry on each input, by `packKey`. */
  readonly packs: Readonly<Record<string, string>>;
  /** The fingerprint of each router over the probe inputs, by the id of the router. */
  readonly routers: Readonly<Record<string, string>>;
}

/** This function gives the key of a pack entry on an input in `CarryProbe.packs`. */
export function packKey(pack: string, input: string): string {
  return `${pack}\n${input}`;
}

/** This function gives one probe document from the probe documents of the shards of one probe job. Each shard has the same corpus and engines. */
export function mergeProbes(parts: readonly CarryProbe[]): CarryProbe {
  if (parts.length === 0) throw new RangeError("A merge of probes needs one probe or more.");
  const first = parts[0]!;
  const packs: Record<string, string> = {};
  const routers: Record<string, string> = {};
  for (const part of parts) {
    if (part.schema !== CARRY_PROBE_SCHEMA) throw new RangeError(`A probe has the schema "${String(part.schema)}", not "${CARRY_PROBE_SCHEMA}".`);
    if (part.corpus !== first.corpus || canonicalJson(part.engines) !== canonicalJson(first.engines)) {
      throw new RangeError("The probes of one merge have other corpora or other engine versions.");
    }
    for (const [key, value] of Object.entries(part.packs)) {
      if (packs[key] !== undefined && packs[key] !== value) throw new RangeError(`Two probes give other fingerprints of ${key.replaceAll("\n", " on ")}.`);
      packs[key] = value;
    }
    for (const [key, value] of Object.entries(part.routers)) {
      if (routers[key] !== undefined && routers[key] !== value) throw new RangeError(`Two probes give other fingerprints of the router ${key}.`);
      routers[key] = value;
    }
  }
  return { schema: CARRY_PROBE_SCHEMA, corpus: first.corpus, engines: first.engines, packs, routers };
}

/** The fields of a record that an audit leaves out: the times, the run facts and the facts of a carry. */
export const AUDIT_LEFT_OUT: readonly string[] = Object.freeze(["ms", "msRuns", "msAtLeast", "oneRun", "budgetMs", "env", "commit", "prediction", "carried"]);

/** This function tells if a measure is a time: its name ends with `.ms` or starts with `time.`. An audit leaves these measures out. */
export function isTimeMeasure(name: string): boolean {
  return name.endsWith(".ms") || name.startsWith("time.");
}

/** This function gives the form of a record that an audit compares: the record without `AUDIT_LEFT_OUT` and without the time measures. */
export function auditForm(record: LayoutRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) if (!AUDIT_LEFT_OUT.includes(key)) out[key] = value;
  out["measures"] = Object.fromEntries(Object.entries(record.measures).filter(([name]) => !isTimeMeasure(name)));
  return out;
}

/** This function gives the hash of the audit form of a record. Two records with the same hash have the same text of their audit forms. */
export function auditHash(record: LayoutRecord): string {
  return sha256Hex(canonicalJson(auditForm(record))).slice(0, 16);
}

/** The reasons for a pair to go to the run again, in the counts of `CarryPlan`. */
export type AgainReason = "skipped" | "no pack probe" | "no router probe" | "options changed" | "pack changed" | "router changed";

/** The plan of one carry: the carried records, and the keys of the pairs that the run measures again, by reason. */
export interface CarryPlan {
  /** The records that the run keeps, each with its field `carried`. */
  readonly carried: readonly LayoutRecord[];
  /** The `doneKey` of each pair that the run measures again, with its reason. */
  readonly again: readonly { readonly key: string; readonly reason: AgainReason }[];
  /** The count of the pairs of each reason. */
  readonly counts: Readonly<Record<AgainReason, number>>;
}

/** The facts of a carry for `carryPlan`. */
export interface CarryFacts {
  /** The probe at the versions of the measure of the records. */
  readonly from: CarryProbe;
  /** The probe at the versions of the run that keeps the records. */
  readonly to: CarryProbe;
  /** The strategy and the full options of each pack entry of the run that keeps the records, by the id of the entry. */
  readonly packs: ReadonlyMap<string, { readonly strategy: string; readonly options: Readonly<Record<string, unknown>> }>;
  /** The id of the run that measured the records. */
  readonly run?: string;
}

/**
 * This function gives the plan of a carry. A record goes to the run again in each of these cases:
 * - The record is skipped.
 * - Its pack entry or its router has no probe.
 * - Its pack strategy or its full pack options changed.
 * - The fingerprint of its pack on its input changed.
 * - The fingerprint of its router changed.
 *
 * The function throws a `RangeError` when the two probes have other corpora, other engine names, or the same versions.
 */
export function carryPlan(records: readonly LayoutRecord[], facts: CarryFacts): CarryPlan {
  const { from, to } = facts;
  if (from.corpus !== to.corpus) throw new RangeError(`The probes have the corpora ${from.corpus} and ${to.corpus}.`);
  const names = (m: Readonly<Record<string, string>>): string => Object.keys(m).sort().join(",");
  if (names(from.engines) !== names(to.engines)) throw new RangeError("The probes do not name the same engines.");
  if (Object.keys(from.engines).every((name) => from.engines[name] === to.engines[name])) {
    throw new RangeError("The probes have the same engine versions, so a resume keeps the records with no carry.");
  }
  const carried: LayoutRecord[] = [];
  const again: { key: string; reason: AgainReason }[] = [];
  const counts: Record<AgainReason, number> = { skipped: 0, "no pack probe": 0, "no router probe": 0, "options changed": 0, "pack changed": 0, "router changed": 0 };
  const miss = (record: LayoutRecord, reason: AgainReason): void => {
    again.push({ key: doneKey(record.input, record.strategy), reason });
    counts[reason] += 1;
  };
  for (const record of records) {
    if (record.skipped !== undefined) {
      miss(record, "skipped");
      continue;
    }
    const pack = String(record.options["pack"]);
    const router = String(record.options["router"]);
    const key = packKey(pack, record.input);
    const entry = facts.packs.get(pack);
    if (entry === undefined || from.packs[key] === undefined || to.packs[key] === undefined) {
      miss(record, "no pack probe");
      continue;
    }
    if (from.routers[router] === undefined || to.routers[router] === undefined) {
      miss(record, "no router probe");
      continue;
    }
    if (record.options["packStrategy"] !== entry.strategy || canonicalJson(record.options["packOptions"]) !== canonicalJson(entry.options)) {
      miss(record, "options changed");
      continue;
    }
    if (from.packs[key] !== to.packs[key]) {
      miss(record, "pack changed");
      continue;
    }
    if (from.routers[router] !== to.routers[router]) {
      miss(record, "router changed");
      continue;
    }
    const fingerprints = { [pack]: to.packs[key]!, [router]: to.routers[router]! };
    carried.push(carryRecord(record, { from: from.engines, to: to.engines, fingerprints, ...(facts.run === undefined ? {} : { run: facts.run }) }));
  }
  return { carried, again, counts };
}

/** The least count of the pairs of an audit. */
export const AUDIT_LEAST = 30;
/** The share of the carried pairs of an audit. The audit takes the larger count of `AUDIT_LEAST` and this share. */
export const AUDIT_SHARE = 0.05;

/**
 * This function gives the keys of the carried pairs that an audit measures again.
 * It is a seeded sample of max(`AUDIT_LEAST`, `AUDIT_SHARE` of the pairs), or all pairs when there are fewer.
 * The sample reads the keys in their sorted order, so the same keys and the same seed give the same sample.
 */
export function auditSample(keys: readonly string[], seed: number | string): string[] {
  const sorted = [...new Set(keys)].sort();
  const count = Math.min(sorted.length, Math.max(AUDIT_LEAST, Math.ceil(AUDIT_SHARE * sorted.length)));
  return random(seed).sample(sorted, count);
}

/** The result of an audit. */
export interface AuditResult {
  /** The count of the pairs of the audit. */
  readonly pairs: number;
  /** The keys of the pairs with another audit form, each with the names of the fields that differ. */
  readonly differing: readonly { readonly key: string; readonly fields: readonly string[] }[];
  /** The keys of the pairs of the audit with no measured record. */
  readonly missing: readonly string[];
  /** This value is `true` when each pair of the audit has a measured record with the same audit form. */
  readonly pass: boolean;
}

/**
 * This function compares the carried records of an audit with the records that the run measured again.
 * One pair with another audit form or with no measured record fails the audit, so the run measures each pair again.
 */
export function auditCompare(carried: readonly LayoutRecord[], measured: readonly LayoutRecord[]): AuditResult {
  const byKey = new Map(measured.map((r) => [doneKey(r.input, r.strategy), r]));
  const differing: { key: string; fields: string[] }[] = [];
  const missing: string[] = [];
  for (const record of carried) {
    const key = doneKey(record.input, record.strategy);
    const other = byKey.get(key);
    if (other === undefined) {
      missing.push(key);
      continue;
    }
    const a = auditForm(record);
    const b = auditForm(other);
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((name) => canonicalJson(a[name] ?? null) !== canonicalJson(b[name] ?? null)).sort();
    if (fields.length > 0) differing.push({ key, fields });
  }
  return { pairs: carried.length, differing, missing, pass: differing.length === 0 && missing.length === 0 };
}

/**
 * This function gives the local files that a source file reads: the file, and each file of its `./*.ts` imports, again for each such file.
 * `read` gives the text of a file by its name in the folder. The result is sorted. A carry needs the same text of these files of `runner.ts` at the two commits.
 */
export function localImports(entry: string, read: (file: string) => string): string[] {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of read(file).matchAll(/from\s+"\.\/([^"]+\.ts)"/g)) todo.push(match[1]!);
  }
  return [...seen].sort();
}

/** This function gives the fingerprint of the probes of one router. It is `fingerprintOf` of the audit hash of the record of each probe input. */
export function routerFingerprint(records: readonly LayoutRecord[]): string {
  return fingerprintOf(Object.fromEntries(records.map((r) => [r.input, auditHash(r)])));
}
