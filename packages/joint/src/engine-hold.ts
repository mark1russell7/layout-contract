/**
 * The check of the engine hold (docs/SWEEP.md, "One pair of engines to 11-17"). Two files hold an engine of this repository:
 * a rule in `renovate.json` and a row in `lag-holds.json` of release-train. This check compares the two.
 */

/** The name of this repository in the rows of release-train. */
export const HOLD_REPOSITORY = "layout-contract";

/** The form of a date in the description of a rule. */
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;

/** This function gives a value as a record with fields of unknown type, or null for another type. */
function recordOf<T extends object>(value: unknown): T | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as T) : null;
}

/**
 * This function gives each package that a rule of a Renovate file stops, with the date in the description of that rule.
 * A rule with `enabled: false` stops its packages. Another rule, for example one with `automerge: false`, stops nothing.
 *
 * @param renovate - The content of `renovate.json`.
 * @returns The date of each stopped package, or null for a rule with no date.
 */
export function renovateHolds(renovate: unknown): Map<string, string | null> {
  const held = new Map<string, string | null>();
  const rules = recordOf<{ packageRules?: unknown }>(renovate)?.packageRules;
  if (!Array.isArray(rules)) return held;
  for (const item of rules) {
    const rule = recordOf<{ enabled?: unknown; matchPackageNames?: unknown; description?: unknown }>(item);
    if (rule?.enabled !== false || !Array.isArray(rule.matchPackageNames)) continue;
    const date = typeof rule.description === "string" ? (DATE.exec(rule.description)?.[0] ?? null) : null;
    for (const name of rule.matchPackageNames) if (typeof name === "string") held.set(name, date);
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
 * This function gives the faults of the engine hold. No hold on both sides is no fault.
 * A fault is a missing row, a missing rule, a rule with no date, two different dates or a past date.
 *
 * @param renovate - The content of `renovate.json`.
 * @param holds - The content of `lag-holds.json` of release-train.
 * @param now - The time of the check. The date in a hold is its last day in UTC.
 * @returns One line for each fault.
 */
export function engineHoldFaults(renovate: unknown, holds: unknown, now: Date): string[] {
  const rows = trainHolds(holds);
  if (rows === null) return ["The hold file of release-train has no list of holds."];
  const rules = renovateHolds(renovate);
  const today = now.toISOString().slice(0, 10);
  const faults: string[] = [];
  for (const [name, date] of rules) {
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
  return faults;
}
