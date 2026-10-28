// node compare.mjs <dirA> <dirB>: matches records by input and strategy, and compares outputHash, options, hard and each measure except time.*.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function load(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".jsonl"))
        for (const line of readFileSync(p, "utf8").split("\n")) {
          if (line.trim() === "") continue;
          const r = JSON.parse(line);
          const k = `${r.input}\u0000${r.strategy}`;
          if (out.has(k)) throw new Error(`duplicate ${k}`);
          out.set(k, r);
        }
    }
  };
  walk(dir);
  return out;
}
const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);
const strip = (r) => {
  const { env: _e, commit: _c, ms: _ms, measures = {}, ...rest } = r;
  const m = Object.fromEntries(Object.entries(measures).filter(([k]) => !k.startsWith("time.") && !(process.env.NOMS && k.endsWith(".ms"))));
  return { ...rest, measures: m };
};
const a = load(process.argv[2]);
const b = load(process.argv[3]);
let equal = 0;
const diff = [];
const fields = new Map();
for (const [k, ra] of a) {
  const rb = b.get(k);
  if (rb === undefined) continue;
  const sa = strip(ra);
  const sb = strip(rb);
  if (canon(sa) === canon(sb)) equal++;
  else {
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
    const which = [];
    for (const f of keys) {
      if (f === "measures") {
        for (const m of new Set([...Object.keys(sa.measures), ...Object.keys(sb.measures)])) if (canon(sa.measures[m]) !== canon(sb.measures[m])) which.push(`measures.${m}`);
      } else if (canon(sa[f]) !== canon(sb[f])) which.push(f);
    }
    for (const w of which) fields.set(w, (fields.get(w) ?? 0) + 1);
    diff.push({ k: k.replace("\u0000", " "), which });
  }
}
const onlyA = [...a.keys()].filter((k) => !b.has(k)).length;
const onlyB = [...b.keys()].filter((k) => !a.has(k)).length;
const hard = (m) => {
  const t = {};
  for (const r of m.values()) for (const [h, n] of Object.entries(r.hard ?? {})) t[h] = (t[h] ?? 0) + n;
  return t;
};
console.log(`records A ${a.size}, B ${b.size}, matched ${a.size - onlyA}, only A ${onlyA}, only B ${onlyB}`);
console.log(`equal ${equal}, different ${diff.length}`);
console.log("differing fields:", JSON.stringify(Object.fromEntries(fields)));
console.log("hard totals A:", JSON.stringify(hard(a)));
console.log("hard totals B:", JSON.stringify(hard(b)));
const router = (k) => k.split(" ")[1].split("+").pop();
const by = {};
for (const d of diff) { const r = router(d.k); by[r] ??= {}; for (const w of d.which) by[r][w] = (by[r][w] ?? 0) + 1; by[r]._records = (by[r]._records ?? 0) + 1; }
console.log("differences by router:", JSON.stringify(by));
const hardBy = (m) => { const t = {}; for (const r of m.values()) { const ro = r.strategy.split("+").pop(); for (const [h, n] of Object.entries(r.hard ?? {})) { t[ro] ??= {}; t[ro][h] = (t[ro][h] ?? 0) + n; } } return t; };
console.log("hard by router A:", JSON.stringify(hardBy(a)));
console.log("hard by router B:", JSON.stringify(hardBy(b)));
const all = {}; for (const r0 of a.values()) { const r = r0.strategy.split("+").pop(); all[r] = (all[r] ?? 0) + 1; } console.log("records by router:", JSON.stringify(all));
