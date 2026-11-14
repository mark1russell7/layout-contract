import { describe, expect, it } from "vitest";
import { LOST_COUNT_SINCE, nightDue, nightLine, nightVerdict, readNightIndex, sameTwiceBreak } from "./night-check.ts";

describe("nightDue", () => {
  it("gives yesterday before the hour of the rule, and today after it", () => {
    expect(nightDue(new Date("2026-11-04T15:59:00Z"))).toBe("2026-11-03");
    expect(nightDue(new Date("2026-11-04T16:00:00Z"))).toBe("2026-11-04");
  });

  it("gives today after the scheduled sweep ended, also before the hour of the rule", () => {
    expect(nightDue(new Date("2026-11-04T03:47:00Z"), true)).toBe("2026-11-04");
  });
});

describe("nightVerdict", () => {
  it("is current when the due night has each record", () => {
    expect(nightVerdict("2026-11-03", 0, "2026-11-03").state).toBe("current");
    expect(nightVerdict("2026-11-03", null, "2026-11-03").state).toBe("current");
  });

  it("is partial when the due night has missing records", () => {
    const v = nightVerdict("2026-11-03", 541, "2026-11-03");
    expect(v.state).toBe("partial");
    expect(nightLine(v)).toContain("541 planned pairs gave no value");
    expect(nightLine(v)).toContain(`Before ${LOST_COUNT_SINCE}`);
  });

  it("is late when a due night is absent, also with missing records", () => {
    const v = nightVerdict("2026-11-03", 541, "2026-11-04");
    expect(v.state).toBe("late");
    expect(v.lateNights).toBe(1);
    expect(nightLine(v)).toContain("1 due night has no result");
    expect(nightLine(nightVerdict("2026-11-01", 0, "2026-11-04"))).toContain("3 due nights have no result");
  });

  it("is not late when the branch has a night after the due night", () => {
    expect(nightVerdict("2026-11-05", 0, "2026-11-04").state).toBe("current");
  });
});

describe("readNightIndex", () => {
  it("reads the entry of the latest epoch", () => {
    const index = { latest: "b", epochs: { a: { last: "2026-10-29" }, b: { last: "2026-11-03", missing: 541 } } };
    expect(readNightIndex(index)).toEqual({ last: "2026-11-03", missing: 541, differ: null });
    expect(readNightIndex({ latest: "a", epochs: { a: { last: "2026-11-06", missing: 0, differ: 3 } } })).toEqual({ last: "2026-11-06", missing: 0, differ: 3 });
  });

  it("gives no missing count for an index of an older night", () => {
    expect(readNightIndex({ latest: "a", epochs: { a: { last: "2026-11-03" } } })).toEqual({ last: "2026-11-03", missing: null, differ: null });
  });

  it("gives a break of the check same twice only for a count above 0 (L117)", () => {
    expect(sameTwiceBreak("2026-11-06", null)).toBeUndefined();
    expect(sameTwiceBreak("2026-11-06", 0)).toBeUndefined();
    // Flip: one record that differs breaks the check.
    expect(sameTwiceBreak("2026-11-06", 1)).toBe("The night 2026-11-06 has 1 record whose two runs gave different hashes. The runs are deterministic, so the expected count is 0. The summary of the night lists the first pairs.");
    expect(sameTwiceBreak("2026-11-06", 4)).toContain("has 4 records whose");
  });

  it("gives a problem for an index with no date", () => {
    expect(typeof readNightIndex({ latest: "a", epochs: {} })).toBe("string");
    expect(typeof readNightIndex(null)).toBe("string");
  });
});
