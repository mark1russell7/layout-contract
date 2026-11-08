import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { CONFIRM_GUARDS, type ConfirmReport } from "./confirm.ts";
import { analysisNoReads, confirmNoReads, cpuModels, promoteNoReads, timeNoReads } from "./no-read.ts";
import type { PromoteReport, PromoteRow } from "./promote.ts";
import type { JointTimeResult } from "./time-arms.ts";

const record = (input: string, strategy: string, cpu: string | undefined, skipped?: string): LayoutRecord =>
  ({ input, strategy, ...(cpu === undefined ? {} : { env: { cpu } }), ...(skipped === undefined ? {} : { skipped }) }) as unknown as LayoutRecord;

const scope = (name: "headline" | "stress", inputs: number, incomplete: number) => ({ scope: name, inputs, incomplete, pairs: [], compares: [] });

const confirm = (headline: number, stress: number, unreadGuards: string[]): ConfirmReport =>
  ({ headline: scope("headline", 40, headline), stress: scope("stress", 8, stress), chosen: "cap3", unreadGuards }) as unknown as ConfirmReport;

describe("the no-read lines", () => {
  it("gives the CPU models of the records, sorted, with unknown for a record with no env", () => {
    expect(cpuModels([record("a", "p", "B"), record("b", "p", "A"), record("c", "p", "B"), record("d", "p", undefined)])).toEqual(["A", "B", "unknown"]);
  });

  it("gives no line for a confirmation that reads each case", () => {
    expect(confirmNoReads(confirm(0, 0, []), ["A"])).toEqual([]);
  });

  it("gives a line for each incomplete scope and for the unread guards, with the counts and the CPU models", () => {
    const lines = confirmNoReads(confirm(3, 1, ["g1", "g2"]), ["A", "B"]);
    expect(lines).toEqual([
      "no read: 3 of 40 headline inputs have no record of a confirm pair. The 2 CPU models are A | B.",
      "no read: 1 of 8 stress inputs have no record of a confirm pair. The 2 CPU models are A | B.",
      `no read: 2 of ${CONFIRM_GUARDS.length} guards of the cap cap3 have no paired value: g1, g2. The 2 CPU models are A | B.`,
    ]);
  });

  it("gives one line for each config of a promotion with a no-read, and none for a config that reads", () => {
    const row = (config: string, incomplete: number, compare: object | null, unreadGuards: string[]): PromoteRow =>
      ({ config, label: `label ${config}`, incomplete, compare, unreadGuards }) as unknown as PromoteRow;
    const report = {
      incumbent: "base",
      headlineInputs: 40,
      rows: [row("c1", 0, {}, []), row("c2", 2, null, ["g1"]), row("c3", 0, {}, ["g2"])],
    } as unknown as PromoteReport;
    expect(promoteNoReads(report, ["A"])).toEqual([
      "no read: the config c2 (label c2) against base: 2 of 40 headline inputs are incomplete, the score has no value, the guards g1 have no value. The CPU is A.",
      "no read: the config c3 (label c3) against base: the guards g2 have no value. The CPU is A.",
    ]);
  });

  it("gives a line for a Time row that cannot decide and a line for the skipped cases", () => {
    const result = (decided: boolean, dropped: string[]): JointTimeResult =>
      ({
        decided,
        dropped,
        candidate: "cand",
        baseline: "base",
        cases: 12,
        rounds: { min: 5, max: 7 },
        jobs: ["1", "2"],
        reason: "The interval crosses the margin.",
        cpus: ["A"],
      }) as unknown as JointTimeResult;
    expect(timeNoReads(result(true, []))).toEqual([]);
    expect(timeNoReads(result(false, ["k1", "k2", "k3", "k4", "k5", "k6", "k7"]))).toEqual([
      "no read: the Time row of cand against base cannot decide, with 12 cases, 5 to 7 rounds for each case, the jobs 1, 2. The interval crosses the margin. The CPU is A.",
      "no read: the jobs skipped 7 cases, so the verdict has no record of them: k1, k2, k3, k4, k5 and 2 more. The CPU is A.",
    ]);
  });

  it("gives one line for the skipped records of an analysis, by reason, and none when no record is skipped", () => {
    expect(analysisNoReads([record("i1", "p", "A")])).toEqual([]);
    const records = [record("i1", "p", "A"), record("i2", "p", "A", "over budget"), record("i3", "q", "A", "not run: over budget on this input"), record("i4", "q", "A", "over budget")];
    expect(analysisNoReads(records)).toEqual([
      'no read: 3 of 4 records are skipped (1 "not run: over budget on this input", 2 "over budget"): i2 p, i3 q, i4 q. The CPU is A.',
    ]);
  });

  it("gives each line with no line break, so one line is one annotation", () => {
    const report = { ...confirm(1, 0, []), headline: { ...scope("headline", 4, 1) } } as ConfirmReport;
    for (const text of confirmNoReads(report, ["A\nB"])) expect(text).not.toMatch(/\n/u);
  });
});
