// The read of the gate waits: `node scripts/queue-read.ts <facts.jsonl> <report.md> <rows.json> [cut]`.
// The workflow `queue-read.yml` writes the facts. The rule is in `src/gate-wait.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { gateSpans, parseFacts, waitReport, waitRows } from "../src/gate-wait.ts";

const [facts, report, rowsFile, cut = "0"] = process.argv.slice(2);
if (!facts || !report || !rowsFile) throw new Error("Usage: node scripts/queue-read.ts <facts.jsonl> <report.md> <rows.json> [cut]");
const left = Number(cut);
if (!Number.isInteger(left) || left < 0) throw new Error(`The count of runs left out is a whole number, not ${cut}.`);
const runs = parseFacts(readFileSync(facts, "utf8"));
const spans = gateSpans(runs, Date.now());
const rows = waitRows(runs, spans);
writeFileSync(report, waitReport(rows, spans, left));
writeFileSync(rowsFile, JSON.stringify({ rows, spans }));
console.log(`Runs read: ${rows.length}. Gates: ${spans.length}. Runs left out: ${left}.`);
