// The fit of the cost model of the shard plan (`docs/JOINT-BENCH.md`, roadmap item L29). It writes `data/cost-margins.json`.
//
//   node scripts/fit-cost.mjs --logs <dir> --run <run id> --commit <sha> [--corpus <set>] [--out <file>]
//
// <dir> holds the logs of the `run (<i>)` jobs of one full run. One call of gh writes the logs of all jobs into one file:
//   gh run view <run id> -R mark1russell7/layout-contract --log > <dir>/run.log
// The logs of single jobs also work, one file for each job:
//   gh api repos/mark1russell7/layout-contract/actions/jobs/<job id>/logs > <dir>/run-<i>.log
// Each shard prints one line for each input: `<input id>: <pairs> records, 0 skipped, <wall ms> ms`.
// The count of the pairs is PACK_ENTRIES times ROUTERS: 130 since L32. The fit divides the wall time by this count.
// The old fit of the R² lines is the fit of the file <out> before the script writes it.
//
// The fit: the time of one pair is `base + square * boxes² / 1000 + cross * boxes * edges / 1000` milliseconds.
// The coefficients are 0 or more, and they make the least sum of the squares of log(real / predicted).
// Thus the fit gives the typical input of a size, and the margin of each spec gives the spread.
// The margin of a spec is the q90 of real / predicted over its seeds. The default margin is the q90 over all inputs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jointCorpus, PACK_ENTRIES, parseCostModel, ROUTERS, SET_V2, SETS } from "../src/index.ts";

const rest = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
const set = args.corpus ?? SET_V2;
if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
if (args.logs === undefined || args.run === undefined || args.commit === undefined) throw new RangeError("The script needs --logs, --run and --commit.");
const out = args.out ?? "data/cost-margins.json";
const QUANTILE = 0.9;
const pairs = PACK_ENTRIES.length * ROUTERS.length;
const before = existsSync(out) ? parseCostModel(readFileSync(out, "utf8")).fit : undefined;

// The wall time of each input in the logs.
const wall = new Map();
const line = /\s(joint-v\d+\/\S+): \d+ records, \d+ skipped, (\d+) ms\s*$/;
for (const name of readdirSync(args.logs).sort()) {
  for (const text of readFileSync(join(args.logs, name), "utf8").split("\n")) {
    const m = line.exec(text);
    if (m === null) continue;
    if (wall.has(m[1])) throw new RangeError(`The input ${m[1]} has two times in the logs.`);
    wall.set(m[1], Number(m[2]));
  }
}
const rows = [];
for (const input of jointCorpus(set).inputs) {
  const ms = wall.get(input.id);
  if (ms === undefined) continue;
  rows.push({ id: input.id, spec: input.id.replace(/\/s\d+$/, ""), boxes: input.boxes.length, edges: input.edges?.length ?? 0, ms });
}
if (rows.length === 0) throw new RangeError(`The logs in ${args.logs} have no input of ${set}.`);

const terms = (r) => [1, (r.boxes * r.boxes) / 1000, (r.boxes * r.edges) / 1000];
const perPair = (c, r) => terms(r).reduce((s, t, i) => s + t * c[i], 0);
const loss = (c) => rows.reduce((s, r) => s + Math.log((pairs * perPair(c, r)) / r.ms) ** 2, 0);

/** The simplex search of Nelder and Mead on the logs of the coefficients. It is deterministic. */
function minimize(f, x0, iterations = 4000) {
  let s = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + 1 : v)))].map((x) => ({ x, v: f(x) }));
  const n = x0.length;
  for (let it = 0; it < iterations; it++) {
    s.sort((a, b) => a.v - b.v);
    const c = new Array(n).fill(0);
    for (const p of s.slice(0, n)) p.x.forEach((v, i) => (c[i] += v / n));
    const worst = s[n];
    const at = (t) => {
      const x = c.map((v, i) => v + t * (worst.x[i] - v));
      return { x, v: f(x) };
    };
    const r = at(-1);
    if (r.v < s[0].v) {
      const e = at(-2);
      s[n] = e.v < r.v ? e : r;
    } else if (r.v < s[n - 1].v) s[n] = r;
    else {
      const k = at(0.5);
      if (k.v < worst.v) s[n] = k;
      else s = s.map((p, i) => (i === 0 ? p : { x: p.x.map((v, j) => (s[0].x[j] + v) / 2) })).map((p) => ({ x: p.x, v: p.v ?? f(p.x) }));
    }
  }
  s.sort((a, b) => a.v - b.v);
  return s[0].x;
}
const coef = (t) => t.map(Math.exp);
let best;
for (const start of [-2, 0, 2]) {
  const t = minimize((t) => loss(coef(t)), [start, start, start]);
  if (best === undefined || loss(coef(t)) < loss(coef(best))) best = t;
}
const round = (x) => Number(x.toPrecision(3));
const [base, square, cross] = coef(best).map(round);
const fit = { base, square, cross };

/** The quantile of linear interpolation between the order statistics. */
function quantile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)] ?? s[lo]) - s[lo]);
}
const ratio = (r) => r.ms / (pairs * perPair([base, square, cross], r));
const bySpec = new Map();
for (const r of rows) bySpec.set(r.spec, [...(bySpec.get(r.spec) ?? []), ratio(r)]);
const specs = {};
for (const spec of [...bySpec.keys()].sort()) specs[spec] = round(quantile(bySpec.get(spec), QUANTILE));
const model = { corpus: set, run: Number(args.run), commit: args.commit, pairs, quantile: QUANTILE, fit, default: round(quantile(rows.map(ratio), QUANTILE)), specs };
writeFileSync(out, JSON.stringify(model, null, 2) + "\n");

// The R² of the old fit and of the new fit, on the wall times and on their logs.
const r2 = (pred, real) => {
  const mean = real.reduce((s, v) => s + v, 0) / real.length;
  return 1 - real.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0) / real.reduce((s, v) => s + (v - mean) ** 2, 0);
};
const real = rows.map((r) => r.ms);
for (const [name, c] of [
  ...(before === undefined ? [] : [["old", [before.base, before.square, before.cross]]]),
  ["new", [base, square, cross]],
]) {
  const pred = rows.map((r) => pairs * perPair(c, r));
  console.log(`${name} fit ${c.join(", ")}: R² ${r2(pred, real).toFixed(3)}, R² of the logs ${r2(pred.map(Math.log), real.map(Math.log)).toFixed(3)}`);
}
console.log(`${rows.length} inputs, ${bySpec.size} specs, default margin ${model.default}. Wrote ${out}.`);
