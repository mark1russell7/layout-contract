// The carry of the records of a run over an engine release (docs/JOINT-BENCH.md, section "Carry", roadmap item L147).
// A probe gives a fingerprint of each pack entry on each input and of each router, at one set of engine versions.
// A record keeps its measures when its pack and its router have the same fingerprints at the two versions. A seeded audit then measures a sample again.
import { canonicalJson, carryRecord, fingerprintOf, sha256Hex, type CarriedCode, type LayoutRecord } from "@mark1russell7/layout-contract";
import { random } from "@mark1russell7/rigor-generators";
import { wilson, Z95 } from "@mark1russell7/rigor-statistics";
import { NOT_RUN_OVER_BUDGET, OVER_BUDGET } from "./analysis.ts";
import { familyOf } from "./memory-gate.ts";
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

/**
 * The reasons for a pair to go to the run again, in the counts of `CarryPlan`.
 * `code bridge`: an earlier run kept the record over a change of the measure code. Such a record is a bridge only, so a later carry does not keep it.
 */
export type AgainReason = "skipped" | "code bridge" | "no pack probe" | "no router probe" | "options changed" | "pack changed" | "router changed";

/** The plan of one carry: the carried records, and the keys of the pairs that the run measures again, by reason. */
export interface CarryPlan {
  /** The records that the run keeps, each with its field `carried`. */
  readonly carried: readonly LayoutRecord[];
  /** The `doneKey` of each pair that the run measures again, with its reason. */
  readonly again: readonly { readonly key: string; readonly reason: AgainReason }[];
  /** The count of the pairs of each reason. */
  readonly counts: Readonly<Record<AgainReason, number>>;
  /** The `doneKey` of each pair of the code audit (`codeAuditSample`). Only a carry over a change of the measure code has this field. */
  readonly audit?: readonly string[];
  /** The field `carried.code` of each carried record. Only a carry over a change of the measure code with 1 audit pair or more has this field. */
  readonly code?: CarriedCode;
}

/** A change of the measure code between the measure of the records and the run that keeps them: the two commits (L147 rule B). */
export interface CodeChange {
  /** The commit of the measure code of the records (`--from-commit`). */
  readonly from: string;
  /** The commit of the run that keeps the records. */
  readonly to: string;
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
  /** The change of the measure code. With it, the plan takes a code audit, and the engine versions can be the same. */
  readonly code?: CodeChange;
}

/**
 * This function gives the plan of a carry. A record goes to the run again in each of these cases:
 * - The record is skipped.
 * - An earlier run kept the record over a change of the measure code (`carried.code`).
 * - Its pack entry or its router has no probe.
 * - Its pack strategy or its full pack options changed.
 * - The fingerprint of its pack on its input changed.
 * - The fingerprint of its router changed.
 *
 * With `facts.code`, the plan also gives the code audit (`codeAuditSample`). Each carried record then gets `carried.code`.
 * It holds the size of the audit and the 95 % upper bound of the rate of a difference (`wilson` of `rigor-statistics` with 0 differences).
 *
 * The function throws a `RangeError` when the two probes have other corpora or other engine names.
 * It also throws a `RangeError` for the same versions with no change of the code, because a resume then keeps the records.
 */
export function carryPlan(records: readonly LayoutRecord[], facts: CarryFacts): CarryPlan {
  const { from, to, code } = facts;
  if (from.corpus !== to.corpus) throw new RangeError(`The probes have the corpora ${from.corpus} and ${to.corpus}.`);
  const names = (m: Readonly<Record<string, string>>): string => Object.keys(m).sort().join(",");
  if (names(from.engines) !== names(to.engines)) throw new RangeError("The probes do not name the same engines.");
  if (code === undefined && Object.keys(from.engines).every((name) => from.engines[name] === to.engines[name])) {
    throw new RangeError("The probes have the same engine versions, so a resume keeps the records with no carry.");
  }
  if (code !== undefined && (code.from === "" || code.from === code.to)) throw new RangeError(`A change of the code needs two commits, not "${code.from}" and "${code.to}".`);
  const chosen: { record: LayoutRecord; fingerprints: Record<string, string> }[] = [];
  const again: { key: string; reason: AgainReason }[] = [];
  const counts: Record<AgainReason, number> = { skipped: 0, "code bridge": 0, "no pack probe": 0, "no router probe": 0, "options changed": 0, "pack changed": 0, "router changed": 0 };
  const miss = (record: LayoutRecord, reason: AgainReason): void => {
    again.push({ key: doneKey(record.input, record.strategy), reason });
    counts[reason] += 1;
  };
  for (const record of records) {
    if (record.skipped !== undefined) {
      miss(record, "skipped");
      continue;
    }
    if (record.carried?.code !== undefined) {
      miss(record, "code bridge");
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
    chosen.push({ record, fingerprints: { [pack]: to.packs[key]!, [router]: to.routers[router]! } });
  }
  const audit = code === undefined ? undefined : codeAuditSample(chosen.map((c) => c.record), code);
  const bridge: CarriedCode | undefined = audit === undefined || audit.length === 0 ? undefined : { ...code!, audit: audit.length, upper: wilson(0, audit.length, Z95).high };
  const run = facts.run === undefined ? {} : { run: facts.run };
  // With a change of the code and no record to audit, nothing joins: the contract needs an audit of 1 pair or more.
  const carried = code !== undefined && bridge === undefined ? [] : chosen.map(({ record, fingerprints }) => carryRecord(record, { from: from.engines, to: to.engines, fingerprints, ...run, ...(bridge === undefined ? {} : { code: bridge }) }));
  return { carried, again, counts, ...(audit === undefined ? {} : { audit }), ...(bridge === undefined ? {} : { code: bridge }) };
}

/** This function gives the strata of a pair of an audit: its pack entry, its router and the family of its input (`familyOf`). */
export function auditStrata(record: LayoutRecord): string[] {
  return [`pack\n${String(record.options["pack"])}`, `router\n${String(record.options["router"])}`, `family\n${familyOf(record.input)}`];
}

/** This function gives the seed of a code audit from the two commits, so each change of the code gets a new sample. */
export function codeAuditSeed(code: CodeChange): string {
  return `code-audit\n${code.from}\n${code.to}`;
}

/**
 * This function gives the keys of the pairs of a code audit (L147 rule B). The audit is a gate over the kept records:
 * 1. One pair or more for each pack entry, each router and each input family (`familyOf`) of the records. The function reads the keys in a seeded order.
 *    It takes each key with a pack entry, a router or a family that has no pair yet.
 * 2. Then a seeded sample of max(`AUDIT_LEAST`, `AUDIT_SHARE` of the records) of the other keys, or all of them when there are fewer.
 *
 * The seed is `codeAuditSeed` of the two commits. The result is sorted.
 */
export function codeAuditSample(records: readonly LayoutRecord[], code: CodeChange): string[] {
  const byKey = new Map(records.map((r) => [doneKey(r.input, r.strategy), r]));
  const sorted = [...byKey.keys()].sort();
  const rng = random(codeAuditSeed(code));
  const covered = new Set<string>();
  const picked = new Set<string>();
  for (const key of rng.shuffle(sorted)) {
    const strata = auditStrata(byKey.get(key)!);
    if (strata.every((s) => covered.has(s))) continue;
    for (const s of strata) covered.add(s);
    picked.add(key);
  }
  const rest = sorted.filter((key) => !picked.has(key));
  const count = Math.min(rest.length, Math.max(AUDIT_LEAST, Math.ceil(AUDIT_SHARE * sorted.length)));
  for (const key of rng.sample(rest, count)) picked.add(key);
  return [...picked].sort();
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
  /** The keys of the pairs with a skip of the time budget (`BUDGET_SKIPS`) on one side. These pairs give no read. */
  readonly unread: readonly string[];
  /** The count of the pairs that give a read: the pairs with a measured record and no skip of the time budget. */
  readonly read: number;
  /** The strata (`auditStrata`) of the pairs of the audit with no pair that gives a read. */
  readonly unreadStrata: readonly string[];
  /** The 95 % upper bound of the rate of a difference from the read pairs with 0 differences (`wilson` of `rigor-statistics`), or 1 with no read. */
  readonly upper: number;
  /**
   * This value is `true` when no pair differs and no pair is missing.
   * Also, each stratum of the audit has a read, and at least min(`AUDIT_LEAST`, `pairs`) pairs give a read.
   */
  readonly pass: boolean;
}

/**
 * The skips of a run that come from its time budget (docs/JOINT-BENCH.md, "A time budget for each pair"), not from the engines.
 * The time of a stage depends on the load of the runner and on the order of the pairs.
 * So the same engines can give a record in one run and this skip in another run.
 */
export const BUDGET_SKIPS: readonly string[] = Object.freeze([OVER_BUDGET, NOT_RUN_OVER_BUDGET]);

/**
 * This function compares the carried records of an audit with the records that the run measured again.
 * One pair with another audit form or with no measured record fails the audit, so the run measures each pair again.
 * A pair with a skip of the time budget on one side gives no read, not a difference (A/A run 43378909783: 2 of 9,516 pairs).
 * A gate that cannot read a case does not pass. So the audit also fails when a stratum of its pairs has no read, or when fewer than min(`AUDIT_LEAST`, `pairs`) pairs give a read.
 */
export function auditCompare(carried: readonly LayoutRecord[], measured: readonly LayoutRecord[]): AuditResult {
  const byKey = new Map(measured.map((r) => [doneKey(r.input, r.strategy), r]));
  const differing: { key: string; fields: string[] }[] = [];
  const missing: string[] = [];
  const unread: string[] = [];
  const budgetSkip = (r: LayoutRecord): boolean => r.skipped !== undefined && BUDGET_SKIPS.includes(r.skipped);
  for (const record of carried) {
    const key = doneKey(record.input, record.strategy);
    const other = byKey.get(key);
    if (other === undefined) {
      missing.push(key);
      continue;
    }
    if (budgetSkip(record) || budgetSkip(other)) {
      unread.push(key);
      continue;
    }
    const a = auditForm(record);
    const b = auditForm(other);
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((name) => canonicalJson(a[name] ?? null) !== canonicalJson(b[name] ?? null)).sort();
    if (fields.length > 0) differing.push({ key, fields });
  }
  const skipped = new Set([...missing, ...unread]);
  const strata = new Set(carried.flatMap(auditStrata));
  for (const record of carried) if (!skipped.has(doneKey(record.input, record.strategy))) for (const s of auditStrata(record)) strata.delete(s);
  const unreadStrata = [...strata].sort();
  const read = carried.length - missing.length - unread.length;
  const upper = read === 0 ? 1 : wilson(0, read, Z95).high;
  const pass = differing.length === 0 && missing.length === 0 && unreadStrata.length === 0 && read >= Math.min(AUDIT_LEAST, carried.length);
  return { pairs: carried.length, differing, missing, unread, read, unreadStrata, upper, pass };
}

/** This function gives the fingerprint of the probes of one router. It is `fingerprintOf` of the audit hash of the record of each probe input. */
export function routerFingerprint(records: readonly LayoutRecord[]): string {
  return fingerprintOf(Object.fromEntries(records.map((r) => [r.input, auditHash(r)])));
}

/** The engines of a probe of a carry, by the package name of npm. */
export const CARRY_ENGINE_PACKAGES: readonly string[] = Object.freeze(["@mark1russell7/packing", "@mark1russell7/highways"]);

/**
 * This function gives the installed version of each package of `names` for one importer of a lockfile of pnpm (lockfile version 9).
 * The probe of a carry installs these versions to probe the engines of an earlier run. A missing importer, a missing package or a link causes a `RangeError`.
 */
export function lockVersions(lock: string, importer: string, names: readonly string[] = CARRY_ENGINE_PACKAGES): Record<string, string> {
  const lines = lock.replaceAll("\r\n", "\n").split("\n");
  const start = lines.indexOf(`  ${importer}:`);
  if (start < 0) throw new RangeError(`The lockfile has no importer ${importer}.`);
  const out: Record<string, string> = {};
  let name: string | undefined;
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line)) break;
    const key = /^ {6}'?([^':]+)'?:$/.exec(line);
    if (key !== null) {
      name = key[1];
      continue;
    }
    const version = /^ {8}version: (\S+)$/.exec(line);
    if (version !== null && name !== undefined && names.includes(name) && out[name] === undefined) out[name] = version[1]!.replace(/\(.*$/, "");
  }
  for (const n of names) {
    const v = out[n];
    if (v === undefined) throw new RangeError(`The importer ${importer} of the lockfile has no package ${n}.`);
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)) throw new RangeError(`The package ${n} of the importer ${importer} has the version "${v}", not a version of npm.`);
  }
  return out;
}
