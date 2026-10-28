import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const load = (dir) => { const out = new Map(); const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".jsonl")) for (const l of readFileSync(p, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); out.set(r.input + " " + r.strategy, r); } } }; walk(dir); return out; };
const a = load(process.argv[2]), b = load(process.argv[3]);
for (const [k, r] of a) { const s = b.get(k); if (s && r.outputHash !== s.outputHash && /\+(trunks|portfolio)$/.test(r.strategy)) console.log(k, r.options?.router ?? "", JSON.stringify(Object.fromEntries(Object.entries(r.measures).filter(([m]) => /route\.(edges|bends|crossings|length)/.test(m)))).slice(0, 160)); }
