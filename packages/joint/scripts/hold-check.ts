// The check of the engine hold: `node scripts/hold-check.ts <renovate.json> <lag-holds.json>`.
// It stops with exit 1 on a fault. The rule is in `src/engine-hold.ts`, and docs/SWEEP.md states the hold.
import { readFileSync } from "node:fs";
import { engineHoldFaults, renovateHolds } from "../src/engine-hold.ts";

const [renovateFile, holdsFile] = process.argv.slice(2);
if (!renovateFile || !holdsFile) throw new Error("Usage: node scripts/hold-check.ts <renovate.json> <lag-holds.json>");
const renovate: unknown = JSON.parse(readFileSync(renovateFile, "utf8"));
const faults = engineHoldFaults(renovate, JSON.parse(readFileSync(holdsFile, "utf8")), new Date());
for (const fault of faults) console.error(`::error::${fault}`);
if (faults.length > 0) process.exit(1);
console.log(`The engine hold agrees: ${renovateHolds(renovate).size} package(s) held.`);
