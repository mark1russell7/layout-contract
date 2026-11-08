// The "no read" lines of the gates of the joint bench. A gate prints each line as a warning annotation, so a no-read shows on the check and not only in a log.
// A case that a gate cannot read is not a pass, also while the gate is a report only.
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { CONFIRM_GUARDS, type ConfirmReport } from "./confirm.ts";
import type { PromoteReport } from "./promote.ts";
import type { JointTimeResult } from "./time-arms.ts";

/** The count of names that a line gives before it gives only the count of the other names. */
const SHOWN = 5;

/** This function gives the first names of a list and the count of the others. */
function names(list: readonly string[]): string {
  const shown = list.slice(0, SHOWN).join(", ");
  return list.length > SHOWN ? `${shown} and ${list.length - SHOWN} more` : shown;
}

/** This function gives the CPU models of the records, sorted. A record with no field `env` gives "unknown". */
export function cpuModels(records: readonly LayoutRecord[]): string[] {
  return [...new Set(records.map((r) => r.env?.cpu ?? "unknown"))].sort();
}

/** This function gives the text of the CPU models of a run. */
function cpuText(cpus: readonly string[]): string {
  if (cpus.length === 0) return "The run has no CPU model.";
  return cpus.length === 1 ? `The CPU is ${cpus[0]}.` : `The ${cpus.length} CPU models are ${cpus.join(" | ")}.`;
}

/** This function makes a line of one annotation: the white space becomes one space, so the line has no line break. */
const line = (text: string): string => `no read: ${text}`.replace(/\s+/gu, " ").trim();

/**
 * This function gives the no-read lines of a confirmation run.
 * - A scope with an incomplete input has no value of a confirm pair on that input.
 * - A guard with no paired value is a guard that nothing reads.
 */
export function confirmNoReads(report: ConfirmReport, cpus: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of [report.headline, report.stress]) {
    if (s.incomplete === 0) continue;
    out.push(line(`${s.incomplete} of ${s.inputs} ${s.scope} inputs have no record of a confirm pair. ${cpuText(cpus)}`));
  }
  if (report.unreadGuards.length > 0) {
    const n = report.unreadGuards.length;
    out.push(line(`${n} of ${CONFIRM_GUARDS.length} guards of the cap ${report.chosen} have no paired value: ${names(report.unreadGuards)}. ${cpuText(cpus)}`));
  }
  return out;
}

/**
 * This function gives the no-read lines of a promotion run, one line for each config with a no-read. A config has a no-read in three cases:
 * - A headline input has no value of the config or of the incumbent.
 * - The score of the config has no value.
 * - A guard of the config has no value.
 */
export function promoteNoReads(report: PromoteReport, cpus: readonly string[]): string[] {
  return report.rows.flatMap((row) => {
    const parts = [
      ...(row.incomplete > 0 ? [`${row.incomplete} of ${report.headlineInputs} headline inputs are incomplete`] : []),
      ...(row.compare === null ? ["the score has no value"] : []),
      ...(row.unreadGuards.length > 0 ? [`the guards ${names(row.unreadGuards)} have no value`] : []),
    ];
    return parts.length === 0 ? [] : [line(`the config ${row.config} (${row.label}) against ${report.incumbent}: ${parts.join(", ")}. ${cpuText(cpus)}`)];
  });
}

/**
 * This function gives the no-read lines of a Time row.
 * - The outcome "cannot decide" is a no-read of the whole row.
 * - A case that a job skipped leaves the verdict of all jobs.
 */
export function timeNoReads(result: JointTimeResult): string[] {
  const out: string[] = [];
  const shape = `${result.cases} cases, ${result.rounds.min} to ${result.rounds.max} rounds for each case, the jobs ${result.jobs.join(", ")}`;
  if (!result.decided) out.push(line(`the Time row of ${result.candidate} against ${result.baseline} cannot decide, with ${shape}. ${result.reason} ${cpuText(result.cpus)}`));
  if (result.dropped.length > 0) out.push(line(`the jobs skipped ${result.dropped.length} cases, so the verdict has no record of them: ${names(result.dropped)}. ${cpuText(result.cpus)}`));
  return out;
}

/**
 * This function gives the no-read line of the records of an analysis.
 * - A record that did not start has no measurement.
 * - A record over its budget has only a lower bound of its time.
 */
export function analysisNoReads(records: readonly LayoutRecord[]): string[] {
  const skipped = records.filter((r) => r.skipped !== undefined);
  if (skipped.length === 0) return [];
  const byReason = new Map<string, number>();
  for (const r of skipped) byReason.set(r.skipped!, (byReason.get(r.skipped!) ?? 0) + 1);
  const reasons = [...byReason].sort(([a], [b]) => a.localeCompare(b)).map(([reason, n]) => `${n} "${reason}"`);
  const first = names(skipped.map((r) => `${r.input} ${r.strategy}`));
  return [line(`${skipped.length} of ${records.length} records are skipped (${reasons.join(", ")}): ${first}. ${cpuText(cpuModels(records))}`)];
}
