// The formats of the data files of the site (`docs/SITE.md`), and their checks.
// The Vite config and the tests use the checks. Thus a bad data file stops the build.

/** The schema of a joint benchmark file in `data/joint/`. */
export const JOINT_SCHEMA = "site-joint/1";
/** The schema of a strategy-space file in `data/spaces/` or `data/examples/`. */
export const SPACE_FILE_SCHEMA = "site-space/1";
/** The schema of the news file `data/news.json`. */
export const NEWS_SCHEMA = "site-news/1";

/** A mean with its interval. The value `open` tells that the interval holds 0. */
export interface Interval {
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
  readonly open: boolean;
}

/** The best single pair of a cell: the pair with the fewest misses, and then the best mean score. */
export interface BestPair {
  readonly pair: string;
  readonly misses: number;
  readonly score: number;
}

/** The summary of one cell of the joint benchmark: one rule and one cap. */
export interface CellSummary {
  readonly rule: string;
  readonly cap: number;
  readonly best: BestPair;
  readonly oracle: { readonly score: number; readonly gain: Interval; readonly wins: number };
  readonly portfolios: readonly { readonly k: number; readonly share: Interval }[];
}

/** One row of the ranking of the output groups. */
export interface RankRow {
  readonly rank: number;
  readonly group: string;
  readonly members: readonly string[];
  readonly misses: number;
  readonly score: number;
}

/** The best pair of one router or one packer: the fewest misses of the pairs that use it. */
export interface PartBest {
  readonly id: string;
  readonly misses: number;
  readonly score: number;
  readonly pair: string;
}

/** A baseline pair and the gains of the picks over it. */
export interface Baseline {
  readonly pair: string;
  readonly misses: number;
  readonly score: number;
  readonly bestGain: Interval;
  readonly oracleGain: Interval;
  readonly portfolios: readonly { readonly k: number; readonly misses: number; readonly gain: Interval }[];
}

/** A comparison of two pairs on the same inputs. */
export interface Compare {
  readonly a: string;
  readonly b: string;
  readonly missesA: number;
  readonly missesB: number;
  readonly scoreA: number;
  readonly scoreB: number;
  readonly gain: Interval;
  readonly onlyA: number;
  readonly onlyB: number;
}

/** The headline cell of one set of inputs, with its ranking and its baselines. */
export interface CellView {
  readonly inputs: number;
  readonly cell: CellSummary;
  readonly ranking: readonly RankRow[];
  readonly byRouter: readonly PartBest[];
  readonly byPacker: readonly PartBest[];
  readonly baselines: readonly Baseline[];
  readonly compare: readonly Compare[];
}

/** A prediction of the run, and its verdict. */
export interface Prediction {
  readonly id: string;
  readonly held: boolean;
  readonly detail: string;
}

/** One result of the joint benchmark, made from the `report.json` of one CI run. */
export interface JointData {
  readonly schema: typeof JOINT_SCHEMA;
  /** The id of the CI run of `joint-bench.yml`. The file name is `<run>.json`. */
  readonly run: string;
  /** The date of the run, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The roadmap item of the run, for example `L32`. */
  readonly item: string;
  readonly corpus: string;
  /** The versions of the engines in the run. */
  readonly versions: Readonly<Record<string, string>>;
  readonly records: number;
  readonly pairs: number;
  /** The cells of the headline inputs, outside the stress cell. */
  readonly cells: readonly CellSummary[];
  /** The headline cell: the rule `all` with the cap 1.25. */
  readonly headline: CellView;
  /** The same cell on the stress inputs. */
  readonly stress: CellView;
  readonly predictions: readonly Prediction[];
}

/** One entry of the news. */
export interface NewsItem {
  readonly date: string;
  readonly item: string;
  readonly title: string;
  /** The npm version of `@mark1russell7/layout-contract` that the entry released, if any. */
  readonly release?: string;
  readonly prs: readonly number[];
  readonly summary: string;
}

/** The news file. */
export interface NewsData {
  readonly schema: typeof NEWS_SCHEMA;
  readonly items: readonly NewsItem[];
}

/** A strategy-space file. The field `space` is a `StrategySpace` of `@mark1russell7/layout-contract`. */
export interface SpaceFile {
  readonly schema: typeof SPACE_FILE_SCHEMA;
  /** The source of the space, for example an engine and its version. */
  readonly source: string;
  readonly date: string;
  /** The value `true` tells that the space is an example, not the space of an engine. */
  readonly example?: boolean;
  readonly note?: string;
  readonly space: unknown;
}

type Problems = string[];
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** This function adds a problem when the field `key` of `o` is not of the kind `kind`. */
function need(out: Problems, o: Obj, key: string, kind: "string" | "number" | "boolean" | "array" | "object" | "date", at: string): void {
  const v = o[key];
  const ok =
    kind === "array" ? Array.isArray(v)
    : kind === "object" ? isObj(v)
    : kind === "date" ? typeof v === "string" && DATE.test(v)
    : kind === "number" ? typeof v === "number" && Number.isFinite(v)
    : typeof v === kind;
  if (!ok) out.push(`${at}.${key} is not ${kind === "date" ? "a date YYYY-MM-DD" : `a ${kind}`}`);
}

function checkInterval(out: Problems, v: unknown, at: string): void {
  if (!isObj(v)) {
    out.push(`${at} is not an interval`);
    return;
  }
  for (const k of ["mean", "lo", "hi"]) need(out, v, k, "number", at);
  need(out, v, "open", "boolean", at);
}

function checkCell(out: Problems, v: unknown, at: string): void {
  if (!isObj(v)) {
    out.push(`${at} is not a cell`);
    return;
  }
  need(out, v, "rule", "string", at);
  need(out, v, "cap", "number", at);
  if (!isObj(v["best"])) out.push(`${at}.best is not an object`);
  else {
    need(out, v["best"], "pair", "string", `${at}.best`);
    need(out, v["best"], "misses", "number", `${at}.best`);
    need(out, v["best"], "score", "number", `${at}.best`);
  }
  const oracle = v["oracle"];
  if (!isObj(oracle)) out.push(`${at}.oracle is not an object`);
  else {
    need(out, oracle, "score", "number", `${at}.oracle`);
    need(out, oracle, "wins", "number", `${at}.oracle`);
    checkInterval(out, oracle["gain"], `${at}.oracle.gain`);
  }
  const portfolios = v["portfolios"];
  if (!Array.isArray(portfolios)) out.push(`${at}.portfolios is not an array`);
  else portfolios.forEach((p: unknown, i) => {
    if (!isObj(p)) return void out.push(`${at}.portfolios[${i}] is not an object`);
    need(out, p, "k", "number", `${at}.portfolios[${i}]`);
    checkInterval(out, p["share"], `${at}.portfolios[${i}].share`);
  });
}

function checkParts(out: Problems, v: unknown, at: string): void {
  if (!Array.isArray(v) || v.length === 0) return void out.push(`${at} is not a list with rows`);
  v.forEach((p: unknown, i) => {
    if (!isObj(p)) return void out.push(`${at}[${i}] is not an object`);
    need(out, p, "id", "string", `${at}[${i}]`);
    need(out, p, "pair", "string", `${at}[${i}]`);
    need(out, p, "misses", "number", `${at}[${i}]`);
    need(out, p, "score", "number", `${at}[${i}]`);
  });
}

function checkView(out: Problems, v: unknown, at: string): void {
  if (!isObj(v)) return void out.push(`${at} is not an object`);
  need(out, v, "inputs", "number", at);
  checkCell(out, v["cell"], `${at}.cell`);
  const ranking = v["ranking"];
  if (!Array.isArray(ranking) || ranking.length === 0) out.push(`${at}.ranking is not a list with rows`);
  else ranking.forEach((r: unknown, i) => {
    const a = `${at}.ranking[${i}]`;
    if (!isObj(r)) return void out.push(`${a} is not an object`);
    need(out, r, "rank", "number", a);
    need(out, r, "group", "string", a);
    need(out, r, "members", "array", a);
    need(out, r, "misses", "number", a);
    need(out, r, "score", "number", a);
  });
  checkParts(out, v["byRouter"], `${at}.byRouter`);
  checkParts(out, v["byPacker"], `${at}.byPacker`);
  const baselines = v["baselines"];
  if (!Array.isArray(baselines)) out.push(`${at}.baselines is not an array`);
  else baselines.forEach((b: unknown, i) => {
    const a = `${at}.baselines[${i}]`;
    if (!isObj(b)) return void out.push(`${a} is not an object`);
    need(out, b, "pair", "string", a);
    need(out, b, "misses", "number", a);
    need(out, b, "score", "number", a);
    checkInterval(out, b["bestGain"], `${a}.bestGain`);
    checkInterval(out, b["oracleGain"], `${a}.oracleGain`);
    need(out, b, "portfolios", "array", a);
  });
  const compare = v["compare"];
  if (!Array.isArray(compare)) out.push(`${at}.compare is not an array`);
  else compare.forEach((c: unknown, i) => {
    const a = `${at}.compare[${i}]`;
    if (!isObj(c)) return void out.push(`${a} is not an object`);
    for (const k of ["a", "b"]) need(out, c, k, "string", a);
    for (const k of ["missesA", "missesB", "scoreA", "scoreB", "onlyA", "onlyB"]) need(out, c, k, "number", a);
    checkInterval(out, c["gain"], `${a}.gain`);
  });
}

/** This function gives the problems of a joint benchmark file. An empty list tells that the file is good. */
export function checkJoint(v: unknown): Problems {
  const out: Problems = [];
  if (!isObj(v)) return ["the file is not an object"];
  if (v["schema"] !== JOINT_SCHEMA) out.push(`the schema is not ${JOINT_SCHEMA}`);
  need(out, v, "run", "string", "joint");
  need(out, v, "date", "date", "joint");
  need(out, v, "item", "string", "joint");
  need(out, v, "corpus", "string", "joint");
  need(out, v, "versions", "object", "joint");
  need(out, v, "records", "number", "joint");
  need(out, v, "pairs", "number", "joint");
  const cells = v["cells"];
  if (!Array.isArray(cells) || cells.length === 0) out.push("joint.cells is not a list with cells");
  else cells.forEach((c: unknown, i) => checkCell(out, c, `joint.cells[${i}]`));
  checkView(out, v["headline"], "joint.headline");
  checkView(out, v["stress"], "joint.stress");
  const predictions = v["predictions"];
  if (!Array.isArray(predictions)) out.push("joint.predictions is not an array");
  else predictions.forEach((p: unknown, i) => {
    if (!isObj(p)) return void out.push(`joint.predictions[${i}] is not an object`);
    need(out, p, "id", "string", `joint.predictions[${i}]`);
    need(out, p, "held", "boolean", `joint.predictions[${i}]`);
    need(out, p, "detail", "string", `joint.predictions[${i}]`);
  });
  return out;
}

/** This function gives the problems of the news file. The items go from the newest date to the oldest. */
export function checkNews(v: unknown): Problems {
  const out: Problems = [];
  if (!isObj(v)) return ["the file is not an object"];
  if (v["schema"] !== NEWS_SCHEMA) out.push(`the schema is not ${NEWS_SCHEMA}`);
  const items = v["items"];
  if (!Array.isArray(items) || items.length === 0) return [...out, "news.items is not a list with items"];
  items.forEach((n: unknown, i) => {
    const a = `news.items[${i}]`;
    if (!isObj(n)) return void out.push(`${a} is not an object`);
    need(out, n, "date", "date", a);
    need(out, n, "item", "string", a);
    need(out, n, "title", "string", a);
    need(out, n, "summary", "string", a);
    if (n["release"] !== undefined) need(out, n, "release", "string", a);
    const prs = n["prs"];
    if (!Array.isArray(prs) || !prs.every((p) => Number.isInteger(p) && (p as number) > 0)) out.push(`${a}.prs is not a list of PR numbers`);
    const prev = i > 0 && isObj(items[i - 1]) ? (items[i - 1] as Obj)["date"] : undefined;
    if (typeof prev === "string" && typeof n["date"] === "string" && n["date"] > prev) out.push(`${a} is newer than the item before it`);
  });
  return out;
}

/** This function gives the problems of the frame of a strategy-space file. `checkSpace` of `layout-contract` examines the space itself. */
export function checkSpaceFile(v: unknown): Problems {
  const out: Problems = [];
  if (!isObj(v)) return ["the file is not an object"];
  if (v["schema"] !== SPACE_FILE_SCHEMA) out.push(`the schema is not ${SPACE_FILE_SCHEMA}`);
  need(out, v, "source", "string", "space file");
  need(out, v, "date", "date", "space file");
  if (v["example"] !== undefined) need(out, v, "example", "boolean", "space file");
  const space = v["space"];
  if (!isObj(space)) out.push("space file.space is not an object");
  else {
    if (space["schema"] !== "strategy-space/1") out.push("space file.space.schema is not strategy-space/1");
    need(out, space, "engine", "string", "space file.space");
    need(out, space, "stages", "array", "space file.space");
  }
  return out;
}

/**
 * This function gives the problems of one data file, from its path below `data/` and its text.
 * It reads the JSON, and it picks the check from the folder. A joint file has the name `<run>.json`.
 */
export function checkDataFile(path: string, text: string): Problems {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return [`the file is not valid JSON: ${(error as Error).message}`];
  }
  const name = path.split("/").pop() ?? path;
  if (path.startsWith("joint/")) {
    const out = checkJoint(value);
    if (isObj(value) && `${String(value["run"])}.json` !== name) out.push(`the file name is not <run>.json for the run ${String(value["run"])}`);
    return out;
  }
  if (path.startsWith("spaces/") || path.startsWith("examples/")) return checkSpaceFile(value);
  if (path === "news.json") return checkNews(value);
  return [`the path ${path} is not a known data file`];
}

/** This function gives the latest joint result: the newest date, and then the largest run id. */
export function latestJoint(files: readonly JointData[]): JointData | undefined {
  return [...files].sort((a, b) => (a.date === b.date ? b.run.localeCompare(a.run, "en", { numeric: true }) : b.date.localeCompare(a.date)))[0];
}
