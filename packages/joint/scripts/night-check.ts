// The check of the last night: `node scripts/night-check.ts <index.json> [--ended]`.
// It stops with exit 1 when a due night has no result, or when a record of the last night differs between its two runs. A partial night gives a warning.
// The rules are in `src/night-check.ts`.
import { readFileSync } from "node:fs";
import { nightDue, nightLine, nightVerdict, readNightIndex, sameTwiceBreak } from "../src/night-check.ts";

const [file, flag] = process.argv.slice(2);
if (!file) throw new Error("Usage: node scripts/night-check.ts <index.json> [--ended]");
const read = readNightIndex(JSON.parse(readFileSync(file, "utf8")));
if (typeof read === "string") {
  console.error(`::error::${read}`);
  process.exit(1);
}
const verdict = nightVerdict(read.last, read.missing, nightDue(new Date(), flag === "--ended"));
const line = nightLine(verdict);
if (verdict.state === "late") {
  console.error(`::error::${line}`);
  process.exit(1);
}
console.log(verdict.state === "partial" ? `::warning::${line}` : line);
const twice = sameTwiceBreak(read.last, read.differ);
if (twice !== undefined) {
  console.error(`::error::${twice}`);
  process.exit(1);
}
