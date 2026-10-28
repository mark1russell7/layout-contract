import { outputHash } from "./hash.ts";
import { compareMeasure, type MeasureSpec } from "./measures.ts";

/** The part of a `MeasureSpec` that a pick uses: the direction and the `minEffect`. */
export type PickSpec = Pick<MeasureSpec, "direction" | "minEffect">;

/** A member of a portfolio: a function with an id. A portfolio is also a member. */
export interface Member<I, O> {
  readonly id: string;
  /** This function gives the output of the member for an input. */
  run(input: I): O;
}

/** One level of the key of a portfolio: a measure of an output. */
export interface PortfolioLevel<I, O> {
  /** The id of the level. The id `hard` is reserved. */
  readonly id: string;
  readonly spec: PickSpec;
  /** This function gives the value of the measure for the output of a member. The value must be finite. */
  value(input: I, output: O): number;
}

/** The key of a portfolio: the hard level, then the other levels in order. */
export interface PortfolioKey<I, O> {
  /** This function gives the count of hard breaks. It is level 0, with the direction `lower` and the `minEffect` 0. */
  hard(input: I, output: O): number;
  /** The levels after the hard level, in the order of the pick. */
  readonly levels: readonly PortfolioLevel<I, O>[];
  /** This function gives the hash of an output. The default is `outputHash` with the default grid. */
  hash?(output: O): string;
}

/** The options of a portfolio. */
export interface PortfolioOptions {
  /** The time limit in milliseconds, 0 or more. The first member always starts. A member that starts always finishes. */
  readonly budgetMs?: number;
  /** The largest count of members that run, a whole number of 1 or more. The other members are cut. */
  readonly maxMembers?: number;
  /** The clock in milliseconds. The default is `performance.now`, or `Date.now` without `performance`. */
  readonly now?: () => number;
  /**
   * The members that get an output hash. The default `all` hashes each member with the status `ran`. A hash that throws then gives the status `error`.
   * With `pick`, only member 0 and the winner get a hash, and only when the winner is not member 0. Then a hash that throws makes `pick` throw.
   */
  readonly hashes?: "all" | "pick";
}

/** The status of a member in a pick. */
export type MemberStatus = "ran" | "cut" | "error";

/** The trace of one member in a pick. */
export interface MemberTrace {
  readonly id: string;
  readonly status: MemberStatus;
  /** The value of each level, with the key `hard` for the hard level. Only a member with the status `ran` has values. */
  readonly values?: Readonly<Record<string, number>>;
  /** The time of the run of the member, in milliseconds. */
  readonly ms?: number;
  /**
   * The hash of the output of the member. Under the option `hashes` "all" (the default), each member with the status `ran` has it.
   * Under `hashes` "pick", it is absent, except for member 0 and the winner when the winner is not member 0.
   */
  readonly outputHash?: string;
  /** The message of the error of a member with the status `error`. */
  readonly error?: string;
}

/** The trace of one pick of a portfolio. */
export interface PortfolioTrace {
  /** One entry for each member, in the order of the members. A cut member is also in the list. */
  readonly members: readonly MemberTrace[];
  readonly winner: string;
  /** The index of the winner in the list of the members. */
  readonly winnerIndex: number;
  /** The value `true` tells that the winner is not member 0 and has a different output hash. */
  readonly picked: boolean;
  /** The time of the full pick, in milliseconds. */
  readonly totalMs: number;
  readonly budgetMs?: number;
  readonly maxMembers?: number;
  /** The count of the cut members. */
  readonly cut: number;
  /** The value `false` tells that the time limit cut one member or more. Then a run on a different computer can give a different pick. */
  readonly deterministic: boolean;
  /** The ids of the members that stay in after each level of `selectBest`. The first list is for the hard level. */
  readonly kept: readonly (readonly string[])[];
}

/** The result of one pick of a portfolio: the output of the winner, its id and the trace. */
export interface PortfolioPick<O> {
  readonly output: O;
  readonly winner: string;
  readonly trace: PortfolioTrace;
}

/** A portfolio: a member that runs its members and gives the output of the best member. */
export interface Portfolio<I, O> extends Member<I, O> {
  /** This function starts the members on an input and gives the output of the winner with the trace. */
  pick(input: I): PortfolioPick<O>;
}

/** A candidate of `selectBest`: an id and the value of each level. */
export interface SelectCandidate {
  readonly id: string;
  readonly values: Readonly<Record<string, number>>;
}

/** A level of `selectBest`: the id of a value and its spec. */
export interface SelectLevel {
  readonly id: string;
  readonly spec: PickSpec;
}

/** The result of `selectBest`. */
export interface Selection {
  readonly winner: string;
  /** The ids of the candidates that stay in after each level, in the given order. */
  readonly kept: readonly (readonly string[])[];
}

/**
 * This function picks the best candidate. For each level, it finds the best value of the candidates that stay in.
 * It keeps each candidate that is not worse than that best value by `compareMeasure`.
 * The winner is the first candidate, in the given order, that stays in after the last level.
 * Without levels, the winner is the first candidate and `kept` is empty.
 *
 * The reason for the rule: a scan that compares each candidate with the current winner is not transitive, because of the `minEffect` ties.
 * Such a scan can drift away from the best value. An example: "a" is lower with the `minEffect` 0.005, and "b" is higher.
 * The candidates A (0, 1), B (0.004, 2) and C (0.008, 3) give the winner B.
 * The scan picks C, but A is better than C on "a".
 *
 * The function throws a `RangeError` for an empty list of candidates, for a missing value, and for a value that is not finite.
 */
export function selectBest(candidates: readonly SelectCandidate[], levels: readonly SelectLevel[]): Selection {
  if (candidates.length === 0) throw new RangeError("selectBest: the list of candidates is empty.");
  for (const level of levels) {
    for (const c of candidates) {
      const v = c.values[level.id];
      if (typeof v !== "number") throw new RangeError(`selectBest: the candidate "${c.id}" has no value for the level "${level.id}".`);
      if (!Number.isFinite(v)) throw new RangeError(`selectBest: the candidate "${c.id}" has the value ${v} for the level "${level.id}".`);
    }
  }
  let alive: readonly SelectCandidate[] = candidates;
  const kept: (readonly string[])[] = [];
  for (const level of levels) {
    const at = (c: SelectCandidate): number => c.values[level.id]!;
    let best = at(alive[0]!);
    for (const c of alive) best = level.spec.direction === "lower" ? Math.min(best, at(c)) : Math.max(best, at(c));
    alive = alive.filter((c) => compareMeasure(at(c), best, level.spec) !== "worse");
    kept.push(alive.map((c) => c.id));
  }
  return { winner: alive[0]!.id, kept };
}

/** This function gives the move `pick` of a pick: 1 when `picked` is true, else 0. A record keeps it as the trace measure `move.pick`. */
export function pickMoves(trace: Pick<PortfolioTrace, "picked">): { pick: number } {
  return { pick: trace.picked ? 1 : 0 };
}

/** This function gives the default clock: `performance.now`, or `Date.now` without `performance`. */
function defaultClock(): () => number {
  const perf = (globalThis as { readonly performance?: { now(): number } }).performance;
  return perf ? () => perf.now() : () => Date.now();
}

/** This function gives the message of an error value. */
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** This function throws a `RangeError` for an empty list of members or for two members with the same id. */
function checkMembers(id: string, members: readonly Member<unknown, unknown>[]): void {
  if (members.length === 0) throw new RangeError(`The portfolio "${id}" has no members.`);
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.id)) throw new RangeError(`The portfolio "${id}" has two members with the id "${m.id}".`);
    seen.add(m.id);
  }
}

/** The result of the run of one member. */
type Ran<O> = { readonly ok: true; readonly output: O; readonly values: Record<string, number>; readonly hash?: string } | { readonly ok: false; readonly error: unknown };

/**
 * This function makes a portfolio. Its `pick` starts the members in their order. `selectBest` picks the winner of the members with the status `ran`.
 * The first level is the hard level, then the levels of the key follow.
 * `members` is a list, or a function of the input that gives the list.
 *
 * A member that throws, or that gives a value that is not finite, gets the status `error`. It does not win.
 * When each member has an error, `pick` throws the error of the first member.
 * `docs/PORTFOLIO.md` tells the rules of the time limit, the trace and `picked`.
 *
 * The function throws a `RangeError` for a level with the id `hard`, for two levels with the same id and for a bad option.
 * It also throws a `RangeError` for an empty list of members, or for two members with the same id.
 */
export function portfolio<I, O>(
  id: string,
  members: readonly Member<I, O>[] | ((input: I) => readonly Member<I, O>[]),
  key: PortfolioKey<I, O>,
  options: PortfolioOptions = {},
): Portfolio<I, O> {
  const levelIds = new Set<string>();
  for (const level of key.levels) {
    if (level.id === "hard") throw new RangeError(`The portfolio "${id}" has a level with the reserved id "hard".`);
    if (levelIds.has(level.id)) throw new RangeError(`The portfolio "${id}" has two levels with the id "${level.id}".`);
    levelIds.add(level.id);
  }
  const { budgetMs, maxMembers, hashes = "all" } = options;
  if (budgetMs !== undefined && !(budgetMs >= 0)) throw new RangeError(`The portfolio "${id}" has the budgetMs ${budgetMs}. It must be 0 or more.`);
  if (maxMembers !== undefined && !(Number.isInteger(maxMembers) && maxMembers >= 1))
    throw new RangeError(`The portfolio "${id}" has the maxMembers ${maxMembers}. It must be a whole number of 1 or more.`);
  if (hashes !== "all" && hashes !== "pick") throw new RangeError(`The portfolio "${id}" has the hashes ${String(hashes)}. It must be "all" or "pick".`);
  if (typeof members !== "function") checkMembers(id, members);
  const levels: readonly SelectLevel[] = [{ id: "hard", spec: { direction: "lower", minEffect: 0 } }, ...key.levels.map((l) => ({ id: l.id, spec: l.spec }))];
  const now = options.now ?? defaultClock();

  /** This function gives the hash of the output of a member. A hash that throws causes a `RangeError`. */
  const hashOf = (m: Member<I, O>, output: O): string => {
    try {
      return key.hash ? key.hash(output) : outputHash(output);
    } catch (e) {
      throw new RangeError(`The hash of the member "${m.id}" of the portfolio "${id}" throws: ${messageOf(e)}`, { cause: e });
    }
  };

  const evaluate = (m: Member<I, O>, input: I, output: O): Ran<O> => {
    const values: Record<string, number> = {};
    const measure = (level: string, f: () => number): void => {
      let v: number;
      try {
        v = f();
      } catch (e) {
        throw new RangeError(`The level "${level}" of the member "${m.id}" of the portfolio "${id}" throws: ${messageOf(e)}`, { cause: e });
      }
      if (typeof v !== "number" || !Number.isFinite(v))
        throw new RangeError(`The member "${m.id}" of the portfolio "${id}" has the value ${v} for the level "${level}".`);
      values[level] = v;
    };
    try {
      measure("hard", () => key.hard(input, output));
      for (const level of key.levels) measure(level.id, () => level.value(input, output));
      if (hashes === "pick") return { ok: true, output, values };
      return { ok: true, output, values, hash: hashOf(m, output) };
    } catch (e) {
      return { ok: false, error: e };
    }
  };

  const pick = (input: I): PortfolioPick<O> => {
    const list = typeof members === "function" ? members(input) : members;
    if (typeof members === "function") checkMembers(id, list);
    const start = now();
    const traces: MemberTrace[] = [];
    const outputs = new Map<string, O>();
    const ran: SelectCandidate[] = [];
    let firstError: { readonly error: unknown } | undefined;
    let cut = 0;
    let outOfTime = false;
    for (let i = 0; i < list.length; i++) {
      const m = list[i]!;
      if (maxMembers !== undefined && i >= maxMembers) {
        traces.push({ id: m.id, status: "cut" });
        cut++;
        continue;
      }
      if (i > 0 && budgetMs !== undefined && (outOfTime || now() - start >= budgetMs)) {
        outOfTime = true;
        traces.push({ id: m.id, status: "cut" });
        cut++;
        continue;
      }
      const t0 = now();
      let result: Ran<O>;
      let ms: number;
      try {
        const output = m.run(input);
        ms = now() - t0;
        result = evaluate(m, input, output);
      } catch (e) {
        ms = now() - t0;
        result = { ok: false, error: e };
      }
      if (result.ok) {
        traces.push(
          result.hash === undefined
            ? { id: m.id, status: "ran", values: result.values, ms }
            : { id: m.id, status: "ran", values: result.values, ms, outputHash: result.hash },
        );
        outputs.set(m.id, result.output);
        ran.push({ id: m.id, values: result.values });
      } else {
        traces.push({ id: m.id, status: "error", ms, error: messageOf(result.error) });
        firstError ??= { error: result.error };
      }
    }
    if (ran.length === 0) throw firstError!.error;
    const { winner, kept } = selectBest(ran, levels);
    const winnerIndex = traces.findIndex((t) => t.id === winner);
    if (hashes === "pick" && winnerIndex > 0 && traces[0]!.status === "ran") {
      // Only member 0 and the winner get a hash. Their two trace entries are new objects with the hash.
      for (const i of [0, winnerIndex]) traces[i] = { ...traces[i]!, outputHash: hashOf(list[i]!, outputs.get(traces[i]!.id)!) };
    }
    const base = traces[0]!;
    const picked = winnerIndex > 0 && (base.status !== "ran" || traces[winnerIndex]!.outputHash !== base.outputHash);
    const trace: PortfolioTrace = {
      members: traces,
      winner,
      winnerIndex,
      picked,
      totalMs: now() - start,
      ...(budgetMs !== undefined ? { budgetMs } : {}),
      ...(maxMembers !== undefined ? { maxMembers } : {}),
      cut,
      deterministic: !outOfTime,
      kept,
    };
    return { output: outputs.get(winner)!, winner, trace };
  };

  return { id, pick, run: (input: I): O => pick(input).output };
}
