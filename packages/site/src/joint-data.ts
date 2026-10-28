// The step from the report.json of a joint benchmark run to the compact data file of the site.
// scripts/joint-data.mjs starts it. Node runs this file with its type stripping, so it uses no TypeScript-only syntax.
import { JOINT_SCHEMA, type Baseline, type CellSummary, type CellView, type Compare, type Interval, type JointData, type PartBest, type RankRow } from "./data.ts";

/** The rule and the cap of the headline cell (`docs/JOINT-BENCH.md`). */
export const HEADLINE = { rule: "all", cap: 1.25 } as const;

/** The facts of a run that the report does not hold. */
export interface RunFacts {
  readonly run: string;
  readonly date: string;
  readonly item: string;
  readonly corpus: string;
  readonly versions: Readonly<Record<string, string>>;
}

type Obj = Record<string, any>;

const round = (v: number, digits = 4): number => {
  const r = Number(v.toFixed(digits));
  return r === 0 ? 0 : r;
};

const interval = (v: Obj): Interval => ({ mean: round(v["mean"]), lo: round(v["lo"]), hi: round(v["hi"]), open: Boolean(v["open"]) });

function cellSummary(c: Obj): CellSummary {
  return {
    rule: c["rule"],
    cap: c["cap"],
    best: { pair: c["best"]["pair"], misses: c["best"]["misses"], score: round(c["best"]["score"]) },
    oracle: { score: round(c["oracle"]["score"]), gain: interval(c["oracle"]["gain"]), wins: c["oracle"]["wins"] },
    portfolios: (c["portfolios"] ?? []).map((p: Obj) => ({ k: p["k"], share: interval(p["share"]) })),
  };
}

/**
 * This function gives the best pair of each part of the pairs: the packer (`0`) or the router (`1`).
 * The best pair of a part is its first group in the ranking. Thus the order is the order of the ranking.
 */
function bestOf(ranking: readonly RankRow[], side: 0 | 1): PartBest[] {
  const best = new Map<string, PartBest>();
  for (const row of [...ranking].sort((a, b) => a.rank - b.rank))
    for (const pair of row.members) {
      const id = pair.split("+")[side]!;
      if (!best.has(id)) best.set(id, { id, misses: row.misses, score: row.score, pair });
    }
  return [...best.values()];
}

function baseline(b: Obj): Baseline {
  return {
    pair: b["pair"],
    misses: b["misses"],
    score: round(b["score"]),
    bestGain: interval(b["best"]),
    oracleGain: interval(b["oracle"]),
    portfolios: (b["portfolios"] ?? []).map((p: Obj) => ({ k: p["k"], misses: p["misses"], gain: interval(p["gain"]) })),
  };
}

function compare(c: Obj): Compare {
  return {
    a: c["a"],
    b: c["b"],
    missesA: c["missesA"],
    missesB: c["missesB"],
    scoreA: round(c["scoreA"]),
    scoreB: round(c["scoreB"]),
    gain: interval(c["gain"]),
    onlyA: c["onlyA"],
    onlyB: c["onlyB"],
  };
}

function view(c: Obj, inputs: number): CellView {
  const ranking: RankRow[] = (c["ranking"] ?? []).map((r: Obj) => ({ rank: r["rank"], group: r["group"], members: [...r["members"]], misses: r["misses"], score: round(r["score"]) }));
  return {
    inputs,
    cell: cellSummary(c),
    ranking,
    byPacker: bestOf(ranking, 0),
    byRouter: bestOf(ranking, 1),
    baselines: (c["baselines"] ?? (c["baseline"] ? [c["baseline"]] : [])).map(baseline),
    compare: (c["compare"] ?? []).map(compare),
  };
}

const isHeadline = (c: Obj): boolean => c["rule"] === HEADLINE.rule && c["cap"] === HEADLINE.cap;

/**
 * This function makes the data file of the site from the `report.json` of `pnpm bench analyze`, and the facts of the run.
 * It throws an `Error` when the report has no headline cell.
 */
export function jointData(report: Obj, facts: RunFacts): JointData {
  const cells: Obj[] = report["cells"] ?? [];
  const head = cells.find(isHeadline);
  const stress = (report["stress"]?.["cells"] ?? []).find(isHeadline);
  if (head === undefined || stress === undefined) throw new Error(`The report has no cell with the rule ${HEADLINE.rule} and the cap ${HEADLINE.cap}.`);
  return {
    schema: JOINT_SCHEMA,
    run: facts.run,
    date: facts.date,
    item: facts.item,
    corpus: facts.corpus,
    versions: { ...facts.versions },
    records: report["records"],
    pairs: report["pairs"],
    cells: cells.map(cellSummary),
    headline: view(head, report["inputs"]),
    stress: view(stress, report["stress"]["inputs"]),
    predictions: (report["predictions"] ?? []).map((p: Obj) => ({ id: p["id"], held: Boolean(p["held"]), detail: String(p["detail"]) })),
  };
}
