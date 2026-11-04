// The check that a night of the sweep has a result (`docs/SWEEP.md`, "The check of each night").
// The job `night-check.yml` and the page of the site use the same rule. This module has no DOM, no file access and no network.

/** A night of a date is due at this hour UTC. The window of a night ends at 14:00 UTC, and the last jobs of a night end before this hour. */
export const NIGHT_DUE_HOUR = 16;

const MS_PER_DAY = 86_400_000;

/** The state of the last night: `current` with each record, `partial` with records that are missing, or `late` when a due night is absent. */
export type NightState = "current" | "partial" | "late";

/** The result of the check. */
export interface NightVerdict {
  readonly state: NightState;
  /** The date of the last night of the branch `sweep-data`. */
  readonly last: string;
  /** The date of the last night that is due. */
  readonly due: string;
  /** The count of the due nights after `last`. */
  readonly lateNights: number;
  /** The count of the jobs of the last night with no record, or `null` when the index does not state it. */
  readonly missing: number | null;
}

const dateOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * This function gives the date of the last night that is due at the time `now`.
 * The value `ended` states that the scheduled sweep of today ended, so its night is due before the hour of the rule.
 */
export function nightDue(now: Date, ended = false): string {
  const today = now.getTime();
  const passed = ended || now.getUTCHours() >= NIGHT_DUE_HOUR;
  return dateOf(passed ? today : today - MS_PER_DAY);
}

/** This function compares the last night of the branch with the night that is due. */
export function nightVerdict(last: string, missing: number | null, due: string): NightVerdict {
  const lateNights = Math.max(0, Math.round((Date.parse(due) - Date.parse(last)) / MS_PER_DAY));
  const state: NightState = lateNights > 0 ? "late" : (missing ?? 0) > 0 ? "partial" : "current";
  return { state, last, due, lateNights, missing };
}

/** This function gives the result in one sentence. */
export function nightLine(v: NightVerdict): string {
  if (v.state === "late") return `The last night of the branch sweep-data is ${v.last}, and the night ${v.due} is due. ${v.lateNights} due ${v.lateNights === 1 ? "night has" : "nights have"} no result.`;
  if (v.state === "partial") return `The last night is ${v.last}, and it is partial: ${v.missing} jobs have no record.`;
  return `The last night is ${v.last}, and the night ${v.due} is due.`;
}

/** This function reads the last night and its missing count from `index.json` of the branch, or it gives a problem as text. */
export function readNightIndex(value: unknown): { readonly last: string; readonly missing: number | null } | string {
  const index = value as { latest?: unknown; epochs?: Record<string, { last?: unknown; missing?: unknown }> } | null;
  const latest = index?.latest;
  if (typeof latest !== "string") return "index.json states no latest epoch.";
  const entry = index?.epochs?.[latest];
  if (typeof entry?.last !== "string" || Number.isNaN(Date.parse(entry.last))) return `index.json states no date for the epoch ${latest}.`;
  return { last: entry.last, missing: typeof entry.missing === "number" ? entry.missing : null };
}
