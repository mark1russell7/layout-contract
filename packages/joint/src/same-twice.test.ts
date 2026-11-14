import { describe, expect, it } from "vitest";
import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { addSameTwice, SAME_TWICE_LIST, sameTwice, sameTwiceLine } from "./same-twice.ts";

/** This function gives a record of a test with the fields of the check. */
function rec(strategy: string, input: string, fields: Partial<Pick<LayoutRecord, "deterministic" | "oneRun" | "skipped">>): LayoutRecord {
  return { strategy, input, ...fields } as unknown as LayoutRecord;
}

describe("the check same twice (L117)", () => {
  it("counts each value of the field, and gives no break when each run gave the same hash", () => {
    const s = sameTwice([
      rec("a+r", "x/s1", { deterministic: true }),
      rec("a+r", "x/s2", { deterministic: true }),
      rec("b+r", "x/s1", { deterministic: null, oneRun: true }),
      rec("c+r", "x/s1", { deterministic: null, skipped: "no support" }),
      rec("d+r", "x/s1", {}),
    ]);
    expect(s).toEqual({ twice: 2, differ: 0, oneRun: 1, skipped: 1, unstated: 1, differs: [] });
    expect(sameTwiceLine(s)).toBe("Same twice: 2 records, 0 differ, 1 with one run and no claim, 1 skipped, 1 with no value.");
  });

  it("lists the records that differ in order, and the line states that the check fails", () => {
    // Flip: one record with false makes the check fail.
    const s = sameTwice([rec("b+r", "x/s2", { deterministic: false }), rec("a+r", "x/s9", { deterministic: true }), rec("a+r", "x/s1", { deterministic: false })]);
    expect(s.differ).toBe(2);
    expect(s.differs).toEqual([
      { strategy: "a+r", input: "x/s1" },
      { strategy: "b+r", input: "x/s2" },
    ]);
    expect(sameTwiceLine(s)).toContain("The check fails. The first pairs that differ: a+r on x/s1, b+r on x/s2.");
  });

  it("keeps the count of each record that differs, and lists at most the limit", () => {
    const many = Array.from({ length: SAME_TWICE_LIST + 5 }, (_, i) => rec("a+r", `x/s${String(i).padStart(2, "0")}`, { deterministic: false }));
    const s = sameTwice(many);
    expect(s.differ).toBe(SAME_TWICE_LIST + 5);
    expect(s.differs).toHaveLength(SAME_TWICE_LIST);
    expect(s.differs[0]).toEqual({ strategy: "a+r", input: "x/s00" });
  });

  it("adds two rounds, and the sum of the counts does not depend on the order of the rounds", () => {
    const one = sameTwice([rec("b+r", "x/s1", { deterministic: false }), rec("a+r", "x/s1", { deterministic: true })]);
    const two = sameTwice([rec("a+r", "x/s2", { deterministic: false }), rec("c+r", "x/s1", { deterministic: null, oneRun: true })]);
    const sum = addSameTwice(one, two);
    expect(sum).toEqual({ twice: 1, differ: 2, oneRun: 1, skipped: 0, unstated: 0, differs: [{ strategy: "a+r", input: "x/s2" }, { strategy: "b+r", input: "x/s1" }] });
    expect(addSameTwice(two, one)).toEqual(sum);
    expect(addSameTwice(undefined, one)).toEqual(one);
  });
});
