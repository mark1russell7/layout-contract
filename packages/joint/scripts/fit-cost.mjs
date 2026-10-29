// The fit of the cost model of the shard plan (`docs/JOINT-BENCH.md`, roadmap items L29 and L35). It writes `data/cost-margins.json`.
//
//   node scripts/fit-cost.mjs --logs <dir> --run <run id> --commit <sha> [--corpus <set>] [--out <file>] [--terms auto|pair|lane|all]
//
// <dir> holds the logs of the `run (<i>)` jobs of one full run. One call of gh writes the logs of all jobs into one file:
//   gh run view <run id> -R mark1russell7/layout-contract --log > <dir>/run.log
// The logs of single jobs also work, one file for each job:
//   gh api repos/mark1russell7/layout-contract/actions/jobs/<job id>/logs > <dir>/run-<i>.log
// Each shard prints one line for each input: `<input id>: <records> records, <skipped> skipped, <wall ms> ms`.
// A shard of the sweep (`docs/SWEEP.md`) prints one line for each unit: `<input id>#<k>: ..., <pairs> pairs, <passes> lane passes`.
// The script adds the times, the pairs and the passes of the units of one input.
// The script counts the pairs and the lane passes of each input of the run:
// - A line with the counts gives them.
// - A line of the bench has PACK_ENTRIES times ROUTERS pairs (130 since L32, 195 since the space `bench-3`), and the lane pairs of `laneEntries` after them (18 pairs, 24 passes).
// The old fit of the R² lines is the model of the file <out> before the script writes it.
//
// The model: the time of an input is `pairs * pair(boxes, edges) + passes * lane(boxes, edges)` milliseconds.
// Each term has the form `base + square * boxes² / 1000 + cross * boxes * edges / 1000`.
// The coefficients are 0 or more, and they make the least sum of the squares of log(real / predicted).
// Thus the fit gives the typical input of a size, and the margin of each spec gives the spread.
// The option --terms selects the terms to fit. The other term comes from the file <out>. The default `auto`:
// - fits only the pair term when the run has no lane passes.
// - fits only the lane term when each input has the same ratio of passes to pairs. Then the run cannot split the two terms.
// - fits both terms when the ratio changes between the inputs, as in a sweep.
// The margin of a spec is the q90 of real / predicted over its seeds. The default margin is the q90 over all inputs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jointCorpus, laneEntries, lanePasses, PACK_ENTRIES, parseCostModel, ROUTERS, SET_V2, SETS } from "../src/index.ts";

const rest = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
const set = args.corpus ?? SET_V2;
if (!SETS.includes(set)) throw new RangeError(`The corpus is one of ${SETS.join(", ")}, not "${set}".`);
if (args.logs === undefined || args.run === undefined || args.commit === undefined) throw new RangeError("The script needs --logs, --run and --commit.");
const terms = args.terms ?? "auto";
if (!["auto", "pair", "lane", "all"].includes(terms)) throw new RangeError(`The option --terms is auto, pair, lane or all, not "${terms}".`);
const out = args.out ?? "data/cost-margins.json";
const QUANTILE = 0.9;
const PLAIN = PACK_ENTRIES.length * ROUTERS.length;
const LANES = laneEntries();
const before = existsSync(out) ? parseCostModel(readFileSync(out, "utf8")) : undefined;

// The wall time, the pairs and the lane passes of each input in the logs.
const wall = new Map();
const line = /\s(joint-v\d+\/[^\s#]+)(#\d+)?: (\d+) records, \d+ skipped, (\d+) ms(?:, (\d+) pairs, (\d+) lane passes)?\s*$/;
for (const name of readdirSync(args.logs).sort()) {
  for (const text of readFileSync(join(args.logs, name), "utf8").split("\n")) {
    const found = line.exec(text);
    if (found === null) continue;
    // A unit of the sweep has the id `<input id>#<k>`. The script adds the units of one input.
    const unit = found[2] !== undefined;
    const m = [found[0], found[1], found[3], found[4], found[5], found[6]];
    if (unit && m[4] === undefined) throw new RangeError(`The unit ${found[1]}${found[2]} has no count of pairs.`);
    if (unit && wall.has(m[1])) {
      const w = wall.get(m[1]);
      wall.set(m[1], { ms: w.ms + Number(m[3]), pairs: w.pairs + Number(m[4]), passes: w.passes + Number(m[5]) });
      continue;
    }
    if (wall.has(m[1])) throw new RangeError(`The input ${m[1]} has two times in the logs.`);
    let pairs;
    let passes;
    if (m[4] !== undefined) {
      pairs = Number(m[4]);
      passes = Number(m[5]);
    } else {
      const records = Number(m[2]);
      if (records !== PLAIN && records !== PLAIN + LANES.length)
        throw new RangeError(`The input ${m[1]} has ${records} records. A line of the bench has ${PLAIN} records, or ${PLAIN + LANES.length} with the lane pairs.`);
      pairs = PLAIN;
      passes = records === PLAIN ? 0 : lanePasses(LANES);
    }
    wall.set(m[1], { ms: Number(m[3]), pairs, passes });
  }
}
const rows = [];
for (const input of jointCorpus(set).inputs) {
  const w = wall.get(input.id);
  if (w === undefined) continue;
  rows.push({ id: input.id, spec: input.id.replace(/\/s\d+$/, ""), boxes: input.boxes.length, edges: input.edges?.length ?? 0, ...w });
}
if (rows.length === 0) throw new RangeError(`The logs in ${args.logs} have no input of ${set}.`);

const anyPasses = rows.some((r) => r.passes > 0);
const ratios = new Set(rows.map((r) => (r.pairs === 0 ? Infinity : r.passes / r.pairs)));
const mode = terms !== "auto" ? terms : !anyPasses ? "pair" : ratios.size === 1 ? "lane" : "all";
if (mode === "lane" && before === undefined) throw new RangeError(`The fit of the lane term alone needs the pair term of ${out}, and the file does not exist.`);
if (mode === "pair" && anyPasses && before === undefined) throw new RangeError(`The run has lane passes, so the fit of the pair term alone needs the lane term of ${out}.`);
if (mode === "lane" && !anyPasses) throw new RangeError("The run has no lane passes, so the lane term has no data.");

const shape = (r) => [1, (r.boxes * r.boxes) / 1000, (r.boxes * r.edges) / 1000];
const unit = (c, r) => shape(r).reduce((s, t, i) => s + t * c[i], 0);
const asArray = (f) => [f.base, f.square, f.cross];
const predict = (pair, lane, r) => r.pairs * unit(pair, r) + r.passes * unit(lane, r);
const loss = (pair, lane) => rows.reduce((s, r) => s + Math.log(predict(pair, lane, r) / r.ms) ** 2, 0);

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
const round = (x) => Number(x.toPrecision(3));
const keptPair = before === undefined ? [0, 0, 0] : asArray(before.fit);
const keptLane = before === undefined ? [0, 0, 0] : asArray(before.lane);
// The parameters of the search are the logs of the coefficients of the terms that the mode fits.
const split = (t) => {
  if (mode === "pair") return [coef(t), keptLane];
  if (mode === "lane") return [keptPair, coef(t)];
  return [coef(t.slice(0, 3)), coef(t.slice(3))];
};
const size = mode === "all" ? 6 : 3;
let best;
for (const start of [-2, 0, 2]) {
  const t = minimize((t) => loss(...split(t)), new Array(size).fill(start), size === 6 ? 8000 : 4000);
  if (best === undefined || loss(...split(t)) < loss(...split(best))) best = t;
}
const [pairC, laneC] = split(best).map((c) => c.map(round));
const toFit = ([base, square, cross]) => ({ base, square, cross });

/** The quantile of linear interpolation between the order statistics. */
function quantile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)] ?? s[lo]) - s[lo]);
}
/** The most frequent value of a list. Equal counts give the smaller value. */
const mostOf = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
const ratio = (r) => r.ms / predict(pairC, laneC, r);
const bySpec = new Map();
for (const r of rows) bySpec.set(r.spec, [...(bySpec.get(r.spec) ?? []), ratio(r)]);
const specs = {};
for (const spec of [...bySpec.keys()].sort()) specs[spec] = round(quantile(bySpec.get(spec), QUANTILE));
const run = Number(args.run);
const model = {
  corpus: set,
  run,
  commit: args.commit,
  pairs: mostOf(rows.map((r) => r.pairs)),
  lanePasses: mostOf(rows.map((r) => r.passes)),
  pairRun: mode === "lane" ? before.pairRun : run,
  quantile: QUANTILE,
  fit: toFit(pairC),
  lane: toFit(laneC),
  default: round(quantile(rows.map(ratio), QUANTILE)),
  specs,
};
writeFileSync(out, JSON.stringify(model, null, 2) + "\n");

// The R² of the old model and of the new model, on the wall times and on their logs.
const r2 = (pred, real) => {
  const mean = real.reduce((s, v) => s + v, 0) / real.length;
  return 1 - real.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0) / real.reduce((s, v) => s + (v - mean) ** 2, 0);
};
const real = rows.map((r) => r.ms);
for (const [name, p, l] of [...(before === undefined ? [] : [["old", keptPair, keptLane]]), ["new", pairC, laneC]]) {
  const pred = rows.map((r) => predict(p, l, r));
  console.log(`${name} model, pair ${p.join(", ")}, lane ${l.join(", ")}: R² ${r2(pred, real).toFixed(3)}, R² of the logs ${r2(pred.map(Math.log), real.map(Math.log)).toFixed(3)}`);
}
console.log(`${rows.length} inputs, ${bySpec.size} specs, the terms ${mode}, default margin ${model.default}. Wrote ${out}.`);
