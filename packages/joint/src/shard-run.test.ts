import type { LayoutInput, LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { pairId, PACK_ENTRIES, pairRuns } from "./runner.ts";
import {
  doneKey,
  keptRecordLines,
  measuredCost,
  type PairLine,
  pairFactors,
  parsePairLines,
  runShard,
  runStamp,
  type ShardRow,
  strategyCosts,
  strategyCostTable,
} from "./shard-run.ts";

const inputOf = (name: string, seed: number): LayoutInput => ({
  schema: "layout-input/1",
  id: `test/${name}/s${seed}`,
  hash: `hash-${name}`,
  seed,
  container: { fixed: "size", w: 200, h: 200 },
  boxes: [
    { id: "a", w: 20, h: 10 },
    { id: "b", w: 10, h: 10 },
    { id: "c", w: 30, h: 20 },
  ],
  edges: [
    { id: "e0", source: "a", target: "b", data: { collection: "c0" } },
    { id: "e1", source: "b", target: "c", data: { collection: "c1" } },
  ],
});

const packs = PACK_ENTRIES.filter((p) => p.id === "rows" || p.id === "shelf" || p.id === "select");
const routers = ["straight", "corners", "portfolio"];
const pairs = packs.flatMap((p) => routers.map((r) => pairId(p.id, r)));
const rows: ShardRow<LayoutInput>[] = [inputOf("one", 1), inputOf("two", 2), inputOf("three", 3)].map((input) => ({ id: input.id, inputHash: input.hash ?? "", row: input }));

/** This function gives a clock that moves by `step` at each read. */
function clock(step: number): () => number {
  let t = 0;
  return () => (t += step);
}

interface Written {
  readonly records: LayoutRecord[];
  readonly lines: PairLine[];
}

/** This function runs a shard of the test rows. It keeps what the shard writes. */
function shard(deadlineMs: number, done: ReadonlySet<string>, now: () => number) {
  const written: Written = { records: [], lines: [] };
  const seen: (readonly string[] | undefined)[] = [];
  const count = runShard<LayoutInput>({
    rows,
    pairs,
    done,
    stamp: "s",
    deadlineMs,
    now,
    runPairs: (input, missing) => {
      seen.push(missing);
      return pairRuns(input, undefined, { packs, routers, ...(missing === undefined ? {} : { pairs: missing }) });
    },
    write: (record, line) => {
      written.records.push(record as unknown as LayoutRecord);
      written.lines.push(line);
    },
  });
  return { ...written, count, seen };
}

/** The bytes of a record that do not depend on the clock or on the order of a run. */
function resultBytes(r: LayoutRecord): string {
  const measures = Object.entries(r.measures)
    .filter(([k]) => !k.endsWith(".ms") && !k.startsWith("time."))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify({ input: r.input, inputHash: r.inputHash, strategy: r.strategy, options: r.options, hard: r.hard, outputHash: r.outputHash, skipped: r.skipped, deterministic: r.deterministic, measures });
}

const sortedBytes = (records: readonly LayoutRecord[]): string[] => records.map(resultBytes).sort();

describe("runShard", () => {
  it("runs each pair of each input with no deadline, and writes each pair when it ends", () => {
    const { records, lines, count } = shard(Infinity, new Set(), clock(1));
    expect(count).toEqual({ pairsDone: 27, pairsMissing: 0, stopped: false });
    expect(records.map((r) => r.strategy)).toEqual(lines.map((l) => l.strategy));
    expect(lines.every((l) => l.stamp === "s" && l.wallMs >= 1 && l.inputHash.startsWith("hash-"))).toBe(true);
  });

  it("gives each line the time from the end of the pair before it", () => {
    const { lines } = shard(Infinity, new Set(), clock(5));
    expect(lines.every((l) => l.wallMs === 5)).toBe(true);
  });

  it("stops at the deadline at the end of a pair, and counts what is missing", () => {
    // The clock moves by 1 at each read: the start, the check of the input, the start of the input, and the end of the first pair.
    const { records, count } = shard(3, new Set(), clock(1));
    expect(records).toHaveLength(1);
    expect(count).toEqual({ pairsDone: 1, pairsMissing: 26, stopped: true });
  });

  it("stops inside an input and keeps each finished pair of a partial shard", () => {
    const { records, count } = shard(14, new Set(), clock(1));
    expect(count.stopped).toBe(true);
    expect(count.pairsDone).toBe(records.length);
    expect(count.pairsDone).toBeGreaterThan(0);
    expect(count.pairsDone + count.pairsMissing).toBe(27);
    expect(records.some((r) => r.input === rows[0]!.id)).toBe(true);
  });

  it("does not start an input when the deadline has passed", () => {
    expect(shard(0, new Set(), clock(1)).count).toEqual({ pairsDone: 0, pairsMissing: 27, stopped: true });
  });

  it("does not call an input after the deadline", () => {
    const { seen } = shard(3, new Set(), clock(1));
    expect(seen).toHaveLength(1);
  });

  it("counts the extra records of an input in the missing count", () => {
    const count = runShard<LayoutInput>({ rows, pairs, extra: 2, done: new Set(), stamp: "s", deadlineMs: 0, now: clock(1), runPairs: () => [], write: () => undefined });
    expect(count).toEqual({ pairsDone: 0, pairsMissing: 33, stopped: true });
  });

  it("runs only the missing pairs on a resume, and gives the same result bytes as one whole run", () => {
    const whole = shard(Infinity, new Set(), clock(1));
    const first = shard(14, new Set(), clock(1));
    expect(first.count.stopped).toBe(true);
    const done = new Set(first.lines.map((l) => doneKey(l.input, l.strategy)));
    const second = shard(Infinity, done, clock(1));
    expect(second.count).toEqual({ pairsDone: 27 - first.count.pairsDone, pairsMissing: 0, stopped: false });
    for (const r of second.records) expect(done.has(doneKey(r.input, r.strategy))).toBe(false);
    expect(sortedBytes([...first.records, ...second.records])).toEqual(sortedBytes(whole.records));
  });

  it("gives the same result bytes for each cut of an input", () => {
    const whole = sortedBytes(shard(Infinity, new Set(), clock(1)).records);
    for (let cut = 1; cut < pairs.length; cut++) {
      const done = new Set(pairs.slice(0, cut).map((p) => doneKey(rows[0]!.id, p)));
      const first = whole.filter((b) => pairs.slice(0, cut).some((p) => (JSON.parse(b) as { strategy: string; input: string }).strategy === p && (JSON.parse(b) as { input: string }).input === rows[0]!.id));
      const second = shard(Infinity, done, clock(1));
      expect([...first, ...second.records.map(resultBytes)].sort()).toEqual(whole);
    }
  });

  it("does nothing when a run recorded each pair", () => {
    const whole = shard(Infinity, new Set(), clock(1));
    const again = shard(Infinity, new Set(whole.lines.map((l) => doneKey(l.input, l.strategy))), clock(1));
    expect(again.count).toEqual({ pairsDone: 0, pairsMissing: 0, stopped: false });
    expect(again.seen).toEqual([]);
  });
});

describe("the stamp of a run", () => {
  it("does not depend on the order of the facts, and differs for another fact", () => {
    expect(runStamp({ a: "1", b: "2" })).toBe(runStamp({ b: "2", a: "1" }));
    expect(runStamp({ a: "1", b: "2" })).not.toBe(runStamp({ a: "1", b: "3" }));
    expect(runStamp({ a: "1", b: "2" })).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("the pair lines", () => {
  const line = (stamp: string, strategy = "p", wallMs = 5): string => JSON.stringify({ stamp, input: "i", inputHash: "h", strategy, wallMs });

  it("keeps the lines of the stamp, and counts the lines of another epoch or space", () => {
    const read = parsePairLines([line("s"), line("other"), line("s", "q")].join("\n"), "s");
    expect(read.lines.map((l) => l.strategy)).toEqual(["p", "q"]);
    expect(read.otherStamp).toBe(1);
    expect(read.broken).toBe(0);
  });

  it("does not stop on a line that a stopped job cut", () => {
    const read = parsePairLines(`${line("s")}\n{"stamp":"s","inp`, "s");
    expect(read.lines).toHaveLength(1);
    expect(read.broken).toBe(1);
  });

  it("refuses a line with no wall time", () => {
    expect(parsePairLines(JSON.stringify({ stamp: "s", input: "i", strategy: "p" }), "s").broken).toBe(1);
  });
});

describe("the records of a resume", () => {
  const record = (input: string, strategy: string): string => JSON.stringify({ input, strategy });

  it("keeps only accepted pairs, each one time, and no cut line", () => {
    const accepted = new Set([doneKey("a", "p"), doneKey("a", "q")]);
    const seen = new Set<string>();
    const first = keptRecordLines([record("a", "p"), record("b", "p"), '{"input":"a"'].join("\n"), accepted, seen);
    const second = keptRecordLines([record("a", "p"), record("a", "q")].join("\n"), accepted, seen);
    expect(first).toEqual([record("a", "p")]);
    expect(second).toEqual([record("a", "q")]);
  });
});

describe("the plan from measured times", () => {
  const lines: PairLine[] = [
    { stamp: "s", input: "a", inputHash: "h", strategy: "slow", wallMs: 90 },
    { stamp: "s", input: "b", inputHash: "h", strategy: "slow", wallMs: 110 },
    { stamp: "s", input: "a", inputHash: "h", strategy: "fast", wallMs: 10 },
    { stamp: "s", input: "z", inputHash: "h", strategy: "fast", wallMs: 999 },
  ];
  const planned = (input: string): number | undefined => (input === "a" || input === "b" ? 10 : undefined);

  it("gives each pair the ratio of its times, and leaves out an unknown input", () => {
    const f = pairFactors(lines, planned);
    expect(f.factors.get("slow")).toBeCloseTo(10);
    expect(f.factors.get("fast")).toBeCloseTo(1);
    expect(f.fallback).toBeCloseTo(7);
  });

  it("gives a pair with no time the mean of the run, and gives 1 with no lines", () => {
    const f = pairFactors(lines, planned);
    expect(measuredCost(10, ["slow", "new"], f)).toBeCloseTo(170);
    expect(measuredCost(10, ["a", "b"], pairFactors([], planned))).toBe(20);
  });

  it("gives a slow pair more cost than the mean of a pair", () => {
    const f = pairFactors(lines, planned);
    expect(measuredCost(10, ["slow"], f)).toBeGreaterThan(measuredCost(10, ["fast"], f) * 5);
  });
});

describe("the cost of each strategy", () => {
  const lines: PairLine[] = [
    { stamp: "s", input: "a", inputHash: "h", strategy: "slow", wallMs: 120000 },
    { stamp: "s", input: "b", inputHash: "h", strategy: "slow", wallMs: 60000 },
    { stamp: "s", input: "a", inputHash: "h", strategy: "fast", wallMs: 60000 },
  ];

  it("names the slowest strategy first, with its slowest input", () => {
    expect(strategyCosts(lines)[0]).toEqual({ strategy: "slow", pairs: 2, ms: 180000, slowestMs: 120000, slowestInput: "a" });
  });

  it("gives a table with the share of each strategy", () => {
    const table = strategyCostTable(strategyCosts(lines), 1);
    expect(table).toContain("| slow | 2 | 3.0 | 75.0 % | 2.0 | a |");
    expect(table).not.toContain("fast");
  });
});
