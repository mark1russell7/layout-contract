import { describe, expect, it } from "vitest";
import { exercised, type Member, outputHash, pickMoves, portfolio, type PortfolioKey, selectBest } from "./index.ts";

const lower = { direction: "lower", minEffect: 0 } as const;
const higher = { direction: "higher", minEffect: 0 } as const;

describe("selectBest", () => {
  it("does not drift on minEffect ties (A, B, C)", () => {
    const candidates = [
      { id: "A", values: { a: 0, b: 1 } },
      { id: "B", values: { a: 0.004, b: 2 } },
      { id: "C", values: { a: 0.008, b: 3 } },
    ];
    const levels = [
      { id: "a", spec: { direction: "lower", minEffect: 0.005 } },
      { id: "b", spec: { direction: "higher", minEffect: 0 } },
    ] as const;
    expect(selectBest(candidates, levels)).toEqual({ winner: "B", kept: [["A", "B"], ["B"]] });
  });

  it("gives a tie to the earliest candidate", () => {
    const candidates = [
      { id: "x", values: { v: 5 } },
      { id: "y", values: { v: 3 } },
      { id: "z", values: { v: 3 } },
    ];
    expect(selectBest(candidates, [{ id: "v", spec: lower }])).toEqual({ winner: "y", kept: [["y", "z"]] });
    expect(selectBest(candidates.slice(1).reverse(), [{ id: "v", spec: lower }]).winner).toBe("z");
  });

  it("uses the direction of the level", () => {
    const candidates = [
      { id: "p", values: { v: 1 } },
      { id: "q", values: { v: 9 } },
    ];
    expect(selectBest(candidates, [{ id: "v", spec: lower }]).winner).toBe("p");
    expect(selectBest(candidates, [{ id: "v", spec: higher }]).winner).toBe("q");
  });

  it("uses a relative minEffect", () => {
    const candidates = [
      { id: "p", values: { v: 100, w: 1 } },
      { id: "q", values: { v: 104, w: 2 } },
      { id: "r", values: { v: 120, w: 3 } },
    ];
    const levels = [
      { id: "v", spec: { direction: "lower", minEffect: { rel: 0.05 } } },
      { id: "w", spec: higher },
    ] as const;
    expect(selectBest(candidates, levels)).toEqual({ winner: "q", kept: [["p", "q"], ["q"]] });
  });

  it("gives the kept list of each level", () => {
    const candidates = [
      { id: "a", values: { h: 0, f: 1, g: 2 } },
      { id: "b", values: { h: 0, f: 1, g: 1 } },
      { id: "c", values: { h: 0, f: 2, g: 9 } },
      { id: "d", values: { h: 1, f: 1, g: 0 } },
    ];
    const levels = [
      { id: "h", spec: lower },
      { id: "f", spec: lower },
      { id: "g", spec: lower },
    ];
    expect(selectBest(candidates, levels)).toEqual({ winner: "b", kept: [["a", "b", "c"], ["a", "b"], ["b"]] });
  });

  it("gives the first candidate without levels", () => {
    expect(selectBest([{ id: "k", values: {} }, { id: "l", values: {} }], [])).toEqual({ winner: "k", kept: [] });
  });

  it("throws a RangeError for an empty list, a missing value and a value that is not finite", () => {
    expect(() => selectBest([], [])).toThrow(RangeError);
    expect(() => selectBest([{ id: "a", values: {} }], [{ id: "v", spec: lower }])).toThrow(/"a".*"v"/);
    expect(() => selectBest([{ id: "a", values: { v: Number.NaN } }], [{ id: "v", spec: lower }])).toThrow(RangeError);
    expect(() => selectBest([{ id: "a", values: { v: 1 } }, { id: "b", values: { v: Infinity } }], [{ id: "v", spec: lower }])).toThrow(/"b".*"v"/);
  });
});

/** An output of the test members: a hard count and a score. */
interface Out {
  readonly hard: number;
  readonly score: number;
  readonly tag?: string;
}

const constant = (id: string, out: Out): Member<number, Out> => ({ id, run: () => out });
const key: PortfolioKey<number, Out> = {
  hard: (_input, o) => o.hard,
  levels: [{ id: "score", spec: higher, value: (_input, o) => o.score }],
};
/** This function gives a fake clock that adds 10 at each call. */
const fakeClock = (): (() => number) => {
  let t = 0;
  return () => (t += 10);
};

describe("portfolio", () => {
  it("is a member with an id, and run gives the output of the winner", () => {
    const p = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 })], key);
    expect(p.id).toBe("p");
    expect(p.run(0)).toEqual({ hard: 0, score: 2 });
  });

  it("lets the hard level win over each other level", () => {
    const p = portfolio("p", [constant("broken", { hard: 1, score: 100 }), constant("ok", { hard: 0, score: 1 })], key);
    const r = p.pick(0);
    expect(r.winner).toBe("ok");
    expect(r.trace.kept).toEqual([["ok"], ["ok"]]);
    expect(r.trace.members[0]!.values).toEqual({ hard: 1, score: 100 });
  });

  it("accepts a function of the input that gives the members", () => {
    const p = portfolio("p", (n: number) => [constant("a", { hard: 0, score: n }), constant("b", { hard: 0, score: 10 - n })], key);
    expect(p.pick(8).winner).toBe("a");
    expect(p.pick(2).winner).toBe("b");
  });

  it("cuts the members after maxMembers, and stays deterministic", () => {
    const p = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 }), constant("c", { hard: 0, score: 3 })], key, { maxMembers: 2 });
    const { trace } = p.pick(0);
    expect(trace.winner).toBe("b");
    expect(trace.cut).toBe(1);
    expect(trace.maxMembers).toBe(2);
    expect(trace.deterministic).toBe(true);
    expect(trace.members.map((m) => m.status)).toEqual(["ran", "ran", "cut"]);
  });

  it("cuts the members after the time limit with an injected clock", () => {
    const members = [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 }), constant("c", { hard: 0, score: 3 }), constant("d", { hard: 0, score: 4 })];
    // start 10, a runs 20 to 30, b: check 40 (30 < 35), runs 50 to 60, c: check 70 (60 >= 35) is cut, d is cut.
    const { trace } = portfolio("p", members, key, { budgetMs: 35, now: fakeClock() }).pick(0);
    expect(trace.members.map((m) => m.status)).toEqual(["ran", "ran", "cut", "cut"]);
    expect(trace.members[2]).toEqual({ id: "c", status: "cut" });
    expect(trace.members[0]!.ms).toBe(10);
    expect(trace.winner).toBe("b");
    expect(trace.cut).toBe(2);
    expect(trace.budgetMs).toBe(35);
    expect(trace.deterministic).toBe(false);
  });

  it("always runs the first member, also with a time limit of 0", () => {
    const { trace } = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 })], key, { budgetMs: 0, now: fakeClock() }).pick(0);
    expect(trace.members.map((m) => m.status)).toEqual(["ran", "cut"]);
    expect(trace.winner).toBe("a");
    expect(trace.deterministic).toBe(false);
  });

  it("gives the same pick as no limit when the limit cuts nothing", () => {
    const members = [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 3 }), constant("c", { hard: 0, score: 2 })];
    const free = portfolio("p", members, key).pick(0);
    const timed = portfolio("p", members, key, { budgetMs: 1000, now: fakeClock() }).pick(0);
    expect(timed.winner).toBe(free.winner);
    expect(timed.trace.cut).toBe(0);
    expect(timed.trace.deterministic).toBe(true);
    expect(timed.trace.kept).toEqual(free.trace.kept);
  });

  it("skips a member that throws", () => {
    const bad: Member<number, Out> = {
      id: "bad",
      run: () => {
        throw new Error("boom");
      },
    };
    const { trace } = portfolio("p", [constant("a", { hard: 0, score: 1 }), bad], key).pick(0);
    expect(trace.winner).toBe("a");
    expect(trace.members[1]).toMatchObject({ id: "bad", status: "error", error: "boom" });
  });

  it("throws the first error when each member throws", () => {
    const first = new Error("first");
    const thrower = (id: string, e: Error): Member<number, Out> => ({
      id,
      run: () => {
        throw e;
      },
    });
    const p = portfolio("p", [thrower("a", first), thrower("b", new Error("second"))], key);
    let caught: unknown;
    try {
      p.pick(0);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(first);
  });

  it("gives the status error to a member with a NaN value", () => {
    const { trace } = portfolio("p", [constant("nan", { hard: 0, score: Number.NaN }), constant("b", { hard: 0, score: 1 })], key).pick(0);
    expect(trace.winner).toBe("b");
    expect(trace.members[0]!.status).toBe("error");
    expect(trace.members[0]!.error).toMatch(/"nan".*"score"/);
    expect(trace.picked).toBe(true);
  });

  it("gives the status error when a level throws", () => {
    const throwing: PortfolioKey<number, Out> = {
      hard: () => 0,
      levels: [
        {
          id: "score",
          spec: higher,
          value: (_i, o) => {
            if (o.tag === "x") throw new Error("no score");
            return o.score;
          },
        },
      ],
    };
    const { trace } = portfolio("p", [constant("a", { hard: 0, score: 9, tag: "x" }), constant("b", { hard: 0, score: 1 })], throwing).pick(0);
    expect(trace.winner).toBe("b");
    expect(trace.members[0]!.error).toMatch(/"score".*"a".*no score/);
  });

  it("sets picked only for a winner after member 0 with a different output hash", () => {
    const same = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 1 })], key).pick(0);
    expect(same.trace.winnerIndex).toBe(0);
    expect(same.trace.picked).toBe(false);

    const sameHash: PortfolioKey<number, Out> = { ...key, hash: () => "h" };
    const copy = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 })], sameHash).pick(0);
    expect(copy.trace.winnerIndex).toBe(1);
    expect(copy.trace.picked).toBe(false);

    const moved = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 })], key).pick(0);
    expect(moved.trace.winnerIndex).toBe(1);
    expect(moved.trace.picked).toBe(true);
    expect(moved.trace.members[1]!.outputHash).toBe(outputHash({ hard: 0, score: 2 }));
  });

  it("uses a custom key.hash", () => {
    const tagged: PortfolioKey<number, Out> = { ...key, hash: (o) => `tag-${o.score}` };
    const { trace } = portfolio("p", [constant("a", { hard: 0, score: 1 })], tagged).pick(0);
    expect(trace.members[0]!.outputHash).toBe("tag-1");
  });

  it("gives move.pick for a record, and exercised reads it", () => {
    const moved = portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 2 })], key).pick(0).trace;
    const still = portfolio("p", [constant("a", { hard: 0, score: 2 }), constant("b", { hard: 0, score: 1 })], key).pick(0).trace;
    expect(pickMoves(moved)).toEqual({ "move.pick": 1 });
    expect(pickMoves(still)).toEqual({ "move.pick": 0 });
    expect(exercised({ moves: pickMoves(moved) })).toBe(true);
    expect(exercised({ moves: pickMoves(still) })).toBe(false);
  });

  it("accepts a portfolio as a member of a portfolio", () => {
    const inner = portfolio("inner", [constant("a", { hard: 0, score: 1 }), constant("b", { hard: 0, score: 5 })], key);
    const outer = portfolio("outer", [constant("c", { hard: 0, score: 3 }), inner], key);
    const r = outer.pick(0);
    expect(r.winner).toBe("inner");
    expect(r.output).toEqual({ hard: 0, score: 5 });
  });

  it("throws a RangeError for duplicate ids, an empty list and the level id hard", () => {
    expect(() => portfolio("p", [constant("a", { hard: 0, score: 1 }), constant("a", { hard: 0, score: 2 })], key)).toThrow(RangeError);
    expect(() => portfolio("p", [], key)).toThrow(RangeError);
    expect(() => portfolio("p", () => [], key).pick(0)).toThrow(RangeError);
    const reserved: PortfolioKey<number, Out> = { hard: () => 0, levels: [{ id: "hard", spec: lower, value: () => 0 }] };
    expect(() => portfolio("p", [constant("a", { hard: 0, score: 1 })], reserved)).toThrow(/"hard"/);
  });

  it("throws a RangeError for a bad option", () => {
    const members = [constant("a", { hard: 0, score: 1 })];
    expect(() => portfolio("p", members, key, { maxMembers: 0 })).toThrow(RangeError);
    expect(() => portfolio("p", members, key, { maxMembers: 1.5 })).toThrow(RangeError);
    expect(() => portfolio("p", members, key, { budgetMs: -1 })).toThrow(RangeError);
  });
});
