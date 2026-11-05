// The cost claim of a sweep night (roadmap item L111, `docs/SWEEP.md`, "The cost claim").
// The claim is an interval from past nights of the same cost model. The whole night comes first, because a plan decides by the night. The shards come second.
import { quantileSorted } from "@mark1russell7/rigor-statistics";
import { jobSpan, type GateJobTime } from "./memory-gate.ts";

/**
 * The form of the claim: the real value is between the q10 and the q90 of past ratios, at probability 0.8.
 * The history is the last 5 nights of the model. A band gets at least 3 ratios.
 * `widthCap` is provisional. It was chosen after the back-test read widths of x3.7 to x4.8, so it tests nothing yet.
 */
export const COST_INTERVAL = { p: 0.8, lo: 0.1, hi: 0.9, widthCap: 5, nights: 5, minRatios: 3 } as const;

/** The sentence that each record of the claim keeps beside the cap of the width. */
export const COST_CAP_NOTE = "The cap of the width is provisional, and it was chosen after the back-test.";

/** The count of the runners of a round of the sweep. */
export const SWEEP_LANES = 3;

/**
 * The real wall minutes of the rounds of the nights before the night record had a wall. Each value is the first start to the last end of the jobs of the round.
 * The nights leave the history after 5 nights of the model, and this table then has no effect.
 */
export const PAST_ROUND_WALLS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // Run 41573500756.
  "2026-11-03": { "1": 179, "2": 6 },
  // Run 41962938304.
  "2026-11-05": { "1": 31, "2": 17 },
};

/** One shard of a night, as the night record keeps it. */
export interface CostShard {
  readonly round: number;
  readonly planned: number;
  readonly real: number;
  readonly costModel?: string;
  readonly stopped?: boolean;
  readonly plannedDone?: number;
}

/** A night as the history reads it. */
export interface CostNight {
  readonly date: string;
  readonly shards: readonly CostShard[];
  readonly wall?: { readonly rounds: Readonly<Record<string, number>> } | null;
}

/** The q10 and the q90 of past ratios of real over planned, and their count. */
export interface CostBand {
  readonly lo: number;
  readonly hi: number;
  readonly width: number;
  readonly n: number;
}

/** The ratios of the history of a night. A band is `null` when the history has too few ratios. */
export interface CostHistory {
  readonly model: string;
  readonly nights: readonly string[];
  readonly shard: CostBand | null;
  readonly round: CostBand | null;
  readonly wall: CostBand | null;
}

/** The side of a claim: in the interval, under it or over it. */
export type CostSide = "hit" | "low" | "high";

/** A claim on a whole night. */
export interface CostNightClaim {
  readonly planned: number;
  readonly lo: number;
  readonly hi: number;
  readonly real: number;
  readonly side: CostSide;
  readonly brier: number;
}

/** The shard claims of a night, with the misses by side. A stopped shard is a miss on the high side. */
export interface CostShardClaims {
  readonly lo: number;
  readonly hi: number;
  readonly width: number;
  readonly overCap: boolean;
  readonly shards: number;
  readonly hits: number;
  readonly low: number;
  readonly high: number;
  readonly stopped: number;
  readonly brier: number | null;
}

/** The score of a night. A claim with no history or no reading is `null`, and its status tells why. It is not scored. */
export interface CostClaimScore {
  readonly p: number;
  readonly widthCap: number;
  readonly capNote: string;
  readonly history: CostHistory | null;
  readonly jobMinutes: CostNightClaim | null;
  readonly jobMinutesStatus: "scored" | "no history";
  readonly wall: CostNightClaim | null;
  readonly wallStatus: "scored" | "no history" | "not read";
  readonly shards: CostShardClaims | null;
}

/** The plan of one round in a night record. */
export interface CostRoundPlan {
  readonly plannedMinutes?: number;
  readonly plannedWall?: number;
}

/** A night as the score reads it. */
export interface CostScoredNight extends CostNight {
  readonly history?: CostHistory | null;
  readonly cost?: Readonly<Record<string, CostRoundPlan>>;
}

/** This function gives the planned wall of a round: the longest shard, or the job minutes over the lanes when that is larger. */
export function plannedWall(longest: number, minutes: number, lanes: number = SWEEP_LANES): number {
  return Math.max(longest, minutes / lanes);
}

/** This function gives the band of a list of ratios, or `null` with too few ratios. */
export function costBand(ratios: readonly number[]): CostBand | null {
  if (ratios.length < COST_INTERVAL.minRatios) return null;
  const sorted = [...ratios].sort((a, b) => a - b);
  const lo = quantileSorted(sorted, COST_INTERVAL.lo);
  const hi = quantileSorted(sorted, COST_INTERVAL.hi);
  return { lo, hi, width: hi / lo, n: sorted.length };
}

/**
 * This function gives the history of the night `date`: only nights before it, and only shards of the model `model`.
 * A stopped shard counts with the planned minutes of the units that it ran. A wall comes from the night record, or from `PAST_ROUND_WALLS`.
 */
export function costHistory(nights: readonly CostNight[], model: string, date: string, walls: Readonly<Record<string, Readonly<Record<string, number>>>> = PAST_ROUND_WALLS): CostHistory {
  const prior = nights
    .filter((n) => n.date < date && n.shards.some((s) => s.costModel === model))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-COST_INTERVAL.nights);
  const shardRatios: number[] = [];
  const roundRatios: number[] = [];
  const wallRatios: number[] = [];
  for (const night of prior) {
    const shards = night.shards.filter((s) => s.costModel === model);
    for (const s of shards) {
      const planned = s.stopped === true ? (s.plannedDone ?? 0) : s.planned;
      if (planned > 0 && s.real > 0) shardRatios.push(s.real / planned);
    }
    for (const round of new Set(shards.map((s) => s.round))) {
      const inRound = shards.filter((s) => s.round === round);
      const planned = inRound.reduce((sum, s) => sum + s.planned, 0);
      const real = inRound.reduce((sum, s) => sum + s.real, 0);
      if (!(planned > 0)) continue;
      if (real > 0) roundRatios.push(real / planned);
      const wall = night.wall?.rounds[String(round)] ?? walls[night.date]?.[String(round)];
      if (wall !== undefined && wall > 0) wallRatios.push(wall / plannedWall(Math.max(...inRound.map((s) => s.planned)), planned));
    }
  }
  return { model, nights: prior.map((n) => n.date), shard: costBand(shardRatios), round: costBand(roundRatios), wall: costBand(wallRatios) };
}

/** This function gives the wall minutes of each round from the jobs of its run. A wall is the first start to the last end of the jobs that ran. */
export function roundWallsOf(jobs: readonly (GateJobTime & { readonly name?: string })[]): Record<string, number> {
  const spans = new Map<string, { from: number; to: number }>();
  for (const job of jobs) {
    const round = /^round(\d+)\b/.exec(job.name ?? "")?.[1];
    const span = round === undefined ? null : jobSpan(job);
    if (round === undefined || span === null) continue;
    const seen = spans.get(round);
    spans.set(round, seen === undefined ? span : { from: Math.min(seen.from, span.from), to: Math.max(seen.to, span.to) });
  }
  return Object.fromEntries([...spans].map(([round, span]) => [round, (span.to - span.from) / 60000]));
}

const sideOf = (real: number, lo: number, hi: number): CostSide => (real < lo ? "low" : real > hi ? "high" : "hit");
const brierOf = (hit: boolean): number => (COST_INTERVAL.p - (hit ? 1 : 0)) ** 2;

function nightClaim(planned: number, band: CostBand, real: number): CostNightClaim {
  const lo = planned * band.lo;
  const hi = planned * band.hi;
  const side = sideOf(real, lo, hi);
  return { planned, lo, hi, real, side, brier: brierOf(side === "hit") };
}

function shardClaims(shards: readonly CostShard[], band: CostBand): CostShardClaims {
  let [hits, low, high, stopped] = [0, 0, 0, 0];
  for (const s of shards) {
    const side = s.stopped === true ? "high" : sideOf(s.real, s.planned * band.lo, s.planned * band.hi);
    if (s.stopped === true) stopped++;
    if (side === "hit") hits++;
    else if (side === "low") low++;
    else high++;
  }
  const brier = shards.length === 0 ? null : (hits * brierOf(true) + (shards.length - hits) * brierOf(false)) / shards.length;
  return { lo: band.lo, hi: band.hi, width: band.width, overCap: band.width > COST_INTERVAL.widthCap, shards: shards.length, hits, low, high, stopped, brier };
}

/**
 * This function scores the claim of a night. The bands come from the history that the plan wrote before the shards ran, so a later fact does not move them.
 * The wall of the night is the sum of the walls of its rounds. It does not count the jobs between two rounds.
 */
export function costClaimScore(night: CostScoredNight): CostClaimScore {
  const history = night.history ?? null;
  const plans = Object.values(night.cost ?? {});
  const planned = plans.reduce((sum, r) => sum + (r.plannedMinutes ?? 0), 0);
  const wallPlanned = plans.reduce((sum, r) => sum + (r.plannedWall ?? 0), 0);
  const real = night.shards.reduce((sum, s) => sum + s.real, 0);
  const walls = night.wall === undefined || night.wall === null ? null : Object.values(night.wall.rounds);
  const jobMinutes = history?.round == null || !(planned > 0) ? null : nightClaim(planned, history.round, real);
  const wall = history?.wall == null || walls === null || walls.length === 0 || !(wallPlanned > 0) ? null : nightClaim(wallPlanned, history.wall, walls.reduce((sum, w) => sum + w, 0));
  return {
    p: COST_INTERVAL.p,
    widthCap: COST_INTERVAL.widthCap,
    capNote: COST_CAP_NOTE,
    history,
    jobMinutes,
    jobMinutesStatus: jobMinutes === null ? "no history" : "scored",
    wall,
    wallStatus: wall !== null ? "scored" : history?.wall == null ? "no history" : "not read",
    shards: history?.shard == null ? null : shardClaims(night.shards, history.shard),
  };
}

/** The facts of the budget of a night, as the plan job of `sweep.yml` writes them. */
export interface BudgetFacts {
  readonly gateMinutes: number;
  readonly estimate: string;
  readonly runsRead: number;
  readonly failedRead: string | null;
  readonly fallback: boolean;
  readonly windowEnd: string;
  readonly lastGate: string | null;
}

/** This function gives the sentences of the budget of a night. A thin budget states what it lacks. */
export function budgetLine(budget: BudgetFacts): string {
  // A gate that already ran on this commit does not run again, so the plan holds no time for it.
  const read = budget.gateMinutes === 0 ? "The gate already ran on this commit, so the budget holds no time for it." : `The budget of the gate is ${budget.gateMinutes} minutes, from ${budget.runsRead} ${budget.runsRead === 1 ? "gate" : "gates"}.`;
  const failed = budget.failedRead === null ? "" : ` The read of ${budget.failedRead} failed after 4 tries, so the budget uses only the runs that it read.`;
  const fallback = budget.fallback ? " The estimate is the fallback, because no gate has job times." : "";
  return `${read}${failed}${fallback}`;
}
