/**
 * The check of the engine hold (docs/SWEEP.md, "One pair of engines to 11-17"). Two files hold an engine of this repository:
 * a rule in `renovate.json` and a row in `lag-holds.json` of release-train. This check compares the two.
 * The lock of main is the pin, so this check also compares the lock with the version of each rule.
 */

/** The name of this repository in the rows of release-train. */
export const HOLD_REPOSITORY = "layout-contract";

/** The form of a date in the description of a rule. */
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;

/** The form of one exact version in the field `allowedVersions` of a rule. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** The form of a key in the section `packages` of a pnpm lock: a name and its version, with two spaces before them. */
const LOCK_KEY = /^ {2}'?(.+)@([^@']+)'?:\s*$/;

/** One package that a rule of a Renovate file stops. */
export interface RenovateHold {
  /** The date in the description of the rule, or null for a rule with no date. */
  readonly until: string | null;
  /** The exact version in `allowedVersions` of the rule, or null for a rule with no exact version. */
  readonly version: string | null;
}

/** This function gives a value as a record with fields of unknown type, or null for another type. */
function recordOf<T extends object>(value: unknown): T | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as T) : null;
}

/**
 * This function gives each package that a rule of a Renovate file stops, with the date and the version of that rule.
 * A rule with `enabled: false` stops its packages. Another rule, for example one with `automerge: false`, stops nothing.
 *
 * @param renovate - The content of `renovate.json`.
 * @returns The date and the version of each stopped package.
 */
export function renovateHolds(renovate: unknown): Map<string, RenovateHold> {
  const held = new Map<string, RenovateHold>();
  const rules = recordOf<{ packageRules?: unknown }>(renovate)?.packageRules;
  if (!Array.isArray(rules)) return held;
  for (const item of rules) {
    const rule = recordOf<{ enabled?: unknown; matchPackageNames?: unknown; description?: unknown; allowedVersions?: unknown }>(item);
    if (rule?.enabled !== false || !Array.isArray(rule.matchPackageNames)) continue;
    const until = typeof rule.description === "string" ? (DATE.exec(rule.description)?.[0] ?? null) : null;
    const version = typeof rule.allowedVersions === "string" && EXACT_VERSION.test(rule.allowedVersions) ? rule.allowedVersions : null;
    for (const name of rule.matchPackageNames) if (typeof name === "string") held.set(name, { until, version });
  }
  return held;
}

/**
 * This function gives each package that the hold file of release-train holds in one repository, with its last day.
 *
 * @param holds - The content of `lag-holds.json`.
 * @param repository - The repository of the rows.
 * @returns The last day of each held package, or null when the file has no list of holds.
 */
export function trainHolds(holds: unknown, repository: string = HOLD_REPOSITORY): Map<string, string> | null {
  const rows = recordOf<{ holds?: unknown }>(holds)?.holds;
  if (!Array.isArray(rows)) return null;
  const held = new Map<string, string>();
  for (const item of rows) {
    const row = recordOf<{ repo?: unknown; package?: unknown; until?: unknown }>(item);
    if (row?.repo === repository && typeof row.package === "string" && typeof row.until === "string") held.set(row.package, row.until);
  }
  return held;
}

/**
 * This function gives each version of a package in a pnpm lock. Each version that any part of the workspace resolves has a key in the section `packages`.
 * The function reads the text, because the job of the check runs with no install.
 *
 * @param lock - The text of `pnpm-lock.yaml`.
 * @param name - The name of the package.
 * @returns The versions of the package, in the order of the lock.
 */
export function lockVersions(lock: string, name: string): string[] {
  const versions: string[] = [];
  let inPackages = false;
  for (const line of lock.split(/\r?\n/)) {
    if (/^\S/.test(line)) inPackages = line.startsWith("packages:");
    const key = inPackages ? LOCK_KEY.exec(line) : null;
    if (key?.[1] === name && key[2] !== undefined) versions.push(key[2]);
  }
  return versions;
}

/**
 * This function compares the lock with each rule that states a hold. A raise by hand changes the lock and no rule, so only this compare sees it.
 *
 * @param rules - The result of `renovateHolds`.
 * @param lock - The text of `pnpm-lock.yaml`.
 * @returns One line for each fault: a rule with no version, a package that is not in the lock, or another version in the lock.
 */
export function lockFaults(rules: ReadonlyMap<string, RenovateHold>, lock: string): string[] {
  const faults: string[] = [];
  for (const [name, { version }] of rules) {
    if (version === null) {
      faults.push(`The Renovate rule of ${name} states no exact version.`);
      continue;
    }
    const versions = lockVersions(lock, name);
    if (versions.length === 0) faults.push(`The lock has no version of ${name}, and the hold states ${version}.`);
    for (const other of versions) if (other !== version) faults.push(`The lock resolves ${name} to ${other}, and the hold states ${version}.`);
  }
  return faults;
}

/**
 * This function gives the faults of the engine hold. No hold on both sides is no fault.
 * A fault is a missing row, a missing rule, a rule with no date, two different dates or a past date.
 * A lock that does not resolve the held version is also a fault.
 *
 * @param renovate - The content of `renovate.json`.
 * @param holds - The content of `lag-holds.json` of release-train.
 * @param lock - The text of `pnpm-lock.yaml`.
 * @param now - The time of the check. The date in a hold is its last day in UTC.
 * @returns One line for each fault.
 */
export function engineHoldFaults(renovate: unknown, holds: unknown, lock: string, now: Date): string[] {
  const rows = trainHolds(holds);
  if (rows === null) return ["The hold file of release-train has no list of holds."];
  const rules = renovateHolds(renovate);
  const today = now.toISOString().slice(0, 10);
  const faults: string[] = [];
  for (const [name, { until: date }] of rules) {
    const until = rows.get(name);
    if (date === null) faults.push(`The Renovate rule of ${name} states no date.`);
    if (until === undefined) faults.push(`The Renovate rule of ${name} has no row in release-train.`);
    else if (date !== null && date !== until) faults.push(`The hold of ${name} has two dates: ${date} in Renovate and ${until} in release-train.`);
    if (date !== null && date < today) faults.push(`The Renovate rule of ${name} ended on ${date}.`);
  }
  for (const [name, until] of rows) {
    if (!rules.has(name)) faults.push(`The row of ${name} in release-train, to ${until}, has no Renovate rule.`);
    if (until < today) faults.push(`The row of ${name} in release-train ended on ${until}.`);
  }
  faults.push(...lockFaults(rules, lock));
  return faults;
}
