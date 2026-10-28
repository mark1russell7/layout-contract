#!/usr/bin/env node
// This script checks the shared blocks of docs/PROMOTION.md against docs/shared.lock.json.
// The same file is in layout-contract, packing and highways. Do not change it in one repository only.
// A block is the text between "<!-- shared:<id> -->" and "<!-- /shared:<id> -->", each on its own line.
// The hash of a block is the SHA-256 of its text with LF line ends, without the two marker lines.
// Usage: node scripts/check-shared.mjs [--print]
//   --print writes the lock of the current blocks to stdout. Copy it only when all three repositories agree.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const DOC = "docs/PROMOTION.md";
const LOCK = "docs/shared.lock.json";

const text = readFileSync(DOC, "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const blocks = new Map();
const errors = [];
let open = null;
let body = [];
lines.forEach((line, i) => {
  const start = /^<!-- shared:([a-z0-9-]+) -->$/.exec(line);
  const end = /^<!-- \/shared:([a-z0-9-]+) -->$/.exec(line);
  if (start) {
    if (open !== null) errors.push(`line ${i + 1}: the block "${start[1]}" starts inside the block "${open}".`);
    open = start[1];
    body = [];
  } else if (end) {
    if (open !== end[1]) errors.push(`line ${i + 1}: the end of "${end[1]}" does not close the open block "${open}".`);
    else if (blocks.has(open)) errors.push(`line ${i + 1}: the block "${open}" occurs two times.`);
    else blocks.set(open, createHash("sha256").update(body.join("\n") + "\n").digest("hex"));
    open = null;
  } else if (open !== null) {
    body.push(line);
  } else if (/^\s*<!-- \/?shared:/.test(line)) {
    errors.push(`line ${i + 1}: a marker must be alone on its line.`);
  }
});
if (open !== null) errors.push(`the block "${open}" has no end marker.`);

const current = Object.fromEntries([...blocks].sort(([a], [b]) => a.localeCompare(b)));
if (process.argv.includes("--print")) {
  process.stdout.write(JSON.stringify({ file: DOC, blocks: current }, null, 2) + "\n");
  process.exit(errors.length === 0 ? 0 : 1);
}

const lock = JSON.parse(readFileSync(LOCK, "utf8")).blocks;
for (const [id, hash] of Object.entries(lock)) {
  if (!(id in current)) errors.push(`the shared block "${id}" is missing.`);
  else if (current[id] !== hash) errors.push(`the shared block "${id}" differs from the lock.`);
}
for (const id of Object.keys(current)) if (!(id in lock)) errors.push(`the block "${id}" is not in the lock.`);

if (errors.length > 0) {
  for (const e of errors) console.error(`check-shared: ${e}`);
  console.error(`check-shared: ${DOC} does not match ${LOCK}. A change of a shared block changes the lock in all three repositories.`);
  process.exit(1);
}
console.log(`check-shared: ${blocks.size} shared blocks match ${LOCK}.`);
