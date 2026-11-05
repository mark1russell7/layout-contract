// The cost claim of a sweep night (L111): the bands come from past nights of one model, and each miss has a side.
import { describe, expect, it } from "vitest";
import { type BudgetFacts, budgetLine, COST_INTERVAL, costBand, costClaimScore, costHistory, type CostNight, plannedWall, roundWallsOf } from "./cost-claim.ts";

const M = "model-a";
const shard = (round: number, planned: number, real: number, extra: { stopped?: boolean; plannedDone?: number } = {}) => ({ round, planned, real, costModel: M, ...extra });
const band = { lo: 1, hi: 2, width: 2, n: 4 };

describe("costBand", () => {
  it("gives the q10 and the q90 of the ratios, in any order", () => {
    expect(costBand([5, 1, 3, 2, 4, 6, 7, 8, 9, 10, 11])).toEqual({ lo: 2, hi: 10, width: 5, n: 11 });
  });

  it("gives no band under 3 ratios, because 2 ratios make a false narrow interval", () => {
    expect(costBand([2.3, 1.45])).toBeNull();
    expect(costBand([])).toBeNull();
  });
});

describe("costHistory", () => {
  it("reads only the nights before the date", () => {
    const nights: CostNight[] = [
      { date: "2026-01-01", shards: [shard(1, 10, 10), shard(1, 10, 20), shard(1, 10, 30)] },
      { date: "2026-01-02", shards: [shard(1, 10, 500), shard(1, 10, 500), shard(1, 10, 500)] },
    ];
    const h = costHistory(nights, M, "2026-01-02");
    expect(h.nights).toEqual(["2026-01-01"]);
    expect(h.shard!.hi).toBeLessThan(3);
  });

  it("leaves out the shards of another model", () => {
    const nights: CostNight[] = [{ date: "2026-01-01", shards: [shard(1, 10, 10), { round: 1, planned: 10, real: 900, costModel: "old" }, { round: 1, planned: 10, real: 900 }] }];
    expect(costHistory(nights, M, "2026-01-02").shard).toBeNull();
  });

  it("keeps the last 5 nights of the model", () => {
    const nights: CostNight[] = Array.from({ length: 7 }, (_, i) => ({ date: `2026-01-0${i + 1}`, shards: [shard(1, 10, 10)] }));
    expect(costHistory(nights, M, "2026-02-01").nights).toEqual(["2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07"]);
  });

  it("counts a stopped shard with the planned minutes of the units that it ran", () => {
    const nights: CostNight[] = [{ date: "2026-01-01", shards: [shard(1, 100, 50, { stopped: true, plannedDone: 25 }), shard(1, 100, 200), shard(1, 100, 200)] }];
    expect(costHistory(nights, M, "2026-01-02").shard).toEqual({ lo: 2, hi: 2, width: 1, n: 3 });
  });

  it("has one ratio for each round, and one wall ratio against the planned wall of the round", () => {
    const nights: CostNight[] = [1, 2, 3].map((d) => ({ date: `2026-01-0${d}`, shards: [shard(1, 30, 60), shard(1, 30, 60)], wall: { rounds: { "1": 60 } } }));
    const h = costHistory(nights, M, "2026-02-01");
    expect(h.round).toEqual({ lo: 2, hi: 2, width: 1, n: 3 });
    expect(h.wall).toEqual({ lo: 2, hi: 2, width: 1, n: 3 });
  });

  it("takes the wall of a past night from the dated table when its record has none", () => {
    const nights: CostNight[] = [
      { date: "2026-01-01", shards: [shard(1, 30, 60), shard(2, 30, 60)] },
      { date: "2026-01-02", shards: [shard(1, 30, 60)] },
    ];
    const h = costHistory(nights, M, "2026-02-01", { "2026-01-01": { "1": 90, "2": 60 }, "2026-01-02": { "1": 30 } });
    expect(h.wall).toMatchObject({ n: 3 });
    expect(costHistory(nights, M, "2026-02-01", {}).wall).toBeNull();
  });

  it("has a wall band for the first scored night, from the table of the nights of one model", () => {
    const nights: CostNight[] = [
      { date: "2026-11-03", shards: [shard(1, 48, 100), shard(1, 48, 100), shard(1, 48, 148), shard(2, 11, 5)] },
      { date: "2026-11-05", shards: [shard(1, 13, 24), shard(1, 13, 24), shard(1, 14, 24), shard(2, 12, 12), shard(2, 12, 12), shard(2, 11, 12)] },
    ];
    const h = costHistory(nights, M, "2026-11-06");
    expect(h.wall!.n).toBe(4);
    expect(h.wall!.lo).toBeGreaterThan(0.5);
    expect(h.wall!.hi).toBeLessThan(3.8);
  });
});

describe("plannedWall", () => {
  it("is the longest shard or the job minutes over the lanes", () => {
    expect(plannedWall(50, 90)).toBe(50);
    expect(plannedWall(10, 90)).toBe(30);
    expect(plannedWall(10, 90, 6)).toBe(15);
  });
});

describe("roundWallsOf", () => {
  const job = (name: string, from: number, to: number, extra: { conclusion?: string; steps?: readonly unknown[] } = {}) => ({
    name,
    conclusion: "success",
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, from)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, to)).toISOString(),
    steps: [{}],
    ...extra,
  });

  it("gives the first start to the last end of each round", () => {
    expect(roundWallsOf([job("round1 (0)", 0, 10), job("round1 (1)", 5, 30), job("round2 (0)", 40, 45), job("race", 30, 40), job("plan", 0, 1)])).toEqual({ "1": 30, "2": 5 });
  });

  it("does not count a job that was cancelled in the queue", () => {
    expect(roundWallsOf([job("round1 (0)", 0, 10), job("round1 (1)", 0, 300, { conclusion: "cancelled", steps: [] })])).toEqual({ "1": 10 });
  });

  it("counts a job that was cancelled while it ran", () => {
    expect(roundWallsOf([job("round1 (0)", 0, 10), job("round1 (1)", 0, 100, { conclusion: "cancelled" })])).toEqual({ "1": 100 });
  });
});

describe("costClaimScore", () => {
  const history = { model: M, nights: ["2026-01-01"], shard: band, round: band, wall: band };
  const cost = { "1": { plannedMinutes: 100, plannedWall: 40 }, "2": { plannedMinutes: 100, plannedWall: 10 } };

  it("scores the night first, with the planned minutes that the plan wrote", () => {
    const s = costClaimScore({ date: "d", history, cost, shards: [shard(1, 100, 150), shard(2, 100, 150)], wall: { rounds: { "1": 50, "2": 25 } } });
    expect(s.jobMinutes).toMatchObject({ planned: 200, lo: 200, hi: 400, real: 300, side: "hit" });
    expect(s.jobMinutes!.brier).toBeCloseTo(0.04);
    expect(s.wall).toMatchObject({ planned: 50, lo: 50, hi: 100, real: 75, side: "hit" });
    expect(s.wallStatus).toBe("scored");
  });

  it("gives each miss of a night its side", () => {
    const low = costClaimScore({ date: "d", history, cost, shards: [shard(1, 100, 50)], wall: { rounds: { "1": 10 } } });
    expect(low.jobMinutes!.side).toBe("low");
    expect(low.wall!.side).toBe("low");
    expect(low.jobMinutes!.brier).toBeCloseTo(0.64);
    const high = costClaimScore({ date: "d", history, cost, shards: [shard(1, 100, 900)], wall: { rounds: { "1": 900 } } });
    expect(high.jobMinutes!.side).toBe("high");
    expect(high.wall!.side).toBe("high");
  });

  it("counts the shards by side, and a stopped shard is a high miss", () => {
    const s = costClaimScore({ date: "d", history, cost, shards: [shard(1, 10, 15), shard(1, 10, 5), shard(1, 10, 50), shard(1, 10, 11, { stopped: true, plannedDone: 2 })] });
    expect(s.shards).toMatchObject({ shards: 4, hits: 1, low: 1, high: 2, stopped: 1, width: 2, overCap: false });
    expect(s.shards!.brier).toBeCloseTo((0.04 + 3 * 0.64) / 4);
  });

  it("marks a width over the provisional cap, and keeps the note beside it", () => {
    const wide = { lo: 0.5, hi: 3, width: 6, n: 15 };
    const s = costClaimScore({ date: "d", history: { ...history, shard: wide }, cost, shards: [shard(1, 10, 15)] });
    expect(s.shards!.overCap).toBe(true);
    expect(s.widthCap).toBe(COST_INTERVAL.widthCap);
    expect(s.capNote).toContain("after the back-test");
  });

  it("does not score a night with no history, and states that", () => {
    const s = costClaimScore({ date: "d", history: { model: M, nights: [], shard: null, round: null, wall: null }, cost, shards: [shard(1, 10, 15)], wall: { rounds: { "1": 5 } } });
    expect(s).toMatchObject({ jobMinutes: null, jobMinutesStatus: "no history", wall: null, wallStatus: "no history", shards: null });
    expect(costClaimScore({ date: "d", shards: [] })).toMatchObject({ history: null, jobMinutesStatus: "no history", wallStatus: "no history" });
  });

  it("states that the wall was not read when the read of the jobs failed", () => {
    for (const s of [costClaimScore({ date: "d", history, cost, shards: [shard(1, 10, 15)], wall: null }), costClaimScore({ date: "d", history, cost, shards: [shard(1, 10, 15)] })]) {
      expect(s.wall).toBeNull();
      expect(s.wallStatus).toBe("not read");
    }
  });
});

describe("budgetLine", () => {
  const facts: BudgetFacts = { gateMinutes: 276, estimate: "x", runsRead: 3, failedRead: null, fallback: false, windowEnd: "2026-11-06T14:00Z", lastGate: "abc" };

  it("states the gates that it read", () => {
    expect(budgetLine(facts)).toBe("The budget of the gate is 276 minutes, from 3 gates.");
  });

  it("states a failed read and the thin budget that follows", () => {
    expect(budgetLine({ ...facts, runsRead: 1, failedRead: "the run 41" })).toBe("The budget of the gate is 276 minutes, from 1 gate. The read of the run 41 failed after 4 tries, so the budget uses only the runs that it read.");
  });

  it("does not state a time for a gate that already ran on this commit", () => {
    expect(budgetLine({ ...facts, gateMinutes: 0 })).toBe("The gate already ran on this commit, so the budget holds no time for it.");
  });

  it("states the fallback", () => {
    expect(budgetLine({ ...facts, gateMinutes: 360, runsRead: 0, fallback: true })).toContain("the fallback");
  });
});
