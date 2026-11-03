#!/usr/bin/env node
// This script checks the shared blocks of docs/PROMOTION.md against docs/shared.lock.json.
// The same file is in layout-contract, packing and highways. Do not change it in one repository only.
// A block is the text between "<!-- shared:<id> -->" and "<!-- /shared:<id> -->", each on its own line.
// The hash of a block is the SHA-256 of its text with LF line ends, without the two marker lines.
// A linked block has its home in another repository. The lock entry "linked.<id>" gives the repository, the path,
// the commit and the SHA-256 of the block in the home. PROMOTION.md has "<!-- linked:<id> -->" ... "<!-- /linked:<id> -->",
// with the link https://github.com/<repo>/blob/<commit>/<path> in it, and no copy of the block.
// Usage: node scripts/check-shared.mjs [--print] [--remote]
//   --print writes the lock of the current blocks to stdout. Copy it only when all three repositories agree.
//   --remote also downloads each linked block at its commit and compares its hash with the lock.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const DOC = "docs/PROMOTION.md";
const LOCK = "docs/shared.lock.json";

const hashOf = (body) => createHash("sha256").update(body.join("\n") + "\n").digest("hex");

/** Reads the blocks of one kind ("shared" or "linked") of a text, as a map from the id to the lines of the block. */
function blocksOf(text, kind, errors, where) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = new Map();
  const start = new RegExp(`^<!-- ${kind}:([a-z0-9-]+) -->$`);
  const end = new RegExp(`^<!-- /${kind}:([a-z0-9-]+) -->$`);
  const loose = new RegExp(`^\\s*<!-- /?${kind}:`);
  let open = null;
  let body = [];
  lines.forEach((line, i) => {
    const s = start.exec(line);
    const e = end.exec(line);
    if (s) {
      if (open !== null) errors.push(`${where} line ${i + 1}: the block "${s[1]}" starts inside the block "${open}".`);
      open = s[1];
      body = [];
    } else if (e) {
      if (open !== e[1]) errors.push(`${where} line ${i + 1}: the end of "${e[1]}" does not close the open block "${open}".`);
      else if (blocks.has(open)) errors.push(`${where} line ${i + 1}: the block "${open}" occurs two times.`);
      else blocks.set(open, body);
      open = null;
    } else if (open !== null) {
      body.push(line);
    } else if (loose.test(line)) {
      errors.push(`${where} line ${i + 1}: a marker must be alone on its line.`);
    }
  });
  if (open !== null) errors.push(`${where}: the block "${open}" has no end marker.`);
  return blocks;
}

const sorted = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
const linkOf = (l) => `https://github.com/${l.repo}/blob/${l.commit}/${l.path}`;

const errors = [];
const text = readFileSync(DOC, "utf8");
const shared = blocksOf(text, "shared", errors, DOC);
const linked = blocksOf(text, "linked", errors, DOC);
const current = sorted([...shared].map(([id, body]) => [id, hashOf(body)]));
const lockFile = JSON.parse(readFileSync(LOCK, "utf8"));
const lock = lockFile.blocks;
const links = lockFile.linked ?? {};

if (process.argv.includes("--print")) {
  const out = { file: DOC, blocks: current };
  if (Object.keys(links).length > 0) out.linked = links;
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(errors.length === 0 ? 0 : 1);
}

for (const [id, hash] of Object.entries(lock)) {
  if (!(id in current)) errors.push(`the shared block "${id}" is missing.`);
  else if (current[id] !== hash) errors.push(`the shared block "${id}" differs from the lock.`);
}
for (const id of Object.keys(current)) if (!(id in lock)) errors.push(`the block "${id}" is not in the lock.`);

for (const [id, l] of Object.entries(links)) {
  if (!/^[0-9a-f]{40}$/.test(l.commit ?? "")) errors.push(`the linked block "${id}" needs a full commit of 40 hex digits, not "${l.commit}".`);
  if (!/^[0-9a-f]{64}$/.test(l.sha256 ?? "")) errors.push(`the linked block "${id}" needs a SHA-256 of 64 hex digits.`);
  if (id in current) errors.push(`the linked block "${id}" also has a copy in ${DOC}. Remove the copy.`);
  if (!linked.has(id)) errors.push(`the linked block "${id}" has no "<!-- linked:${id} -->" block in ${DOC}.`);
  else if (!linked.get(id).join("\n").includes(linkOf(l))) errors.push(`the linked block "${id}" does not contain the link ${linkOf(l)}.`);
}
for (const id of linked.keys()) if (!(id in links)) errors.push(`the linked block "${id}" is not in the "linked" field of the lock.`);

if (process.argv.includes("--remote")) {
  for (const [id, l] of Object.entries(links)) {
    const url = `https://raw.githubusercontent.com/${l.repo}/${l.commit}/${l.path}`;
    const response = await fetch(url);
    if (!response.ok) {
      errors.push(`the home of the linked block "${id}" gives HTTP ${response.status} at ${url}.`);
      continue;
    }
    const home = blocksOf(await response.text(), "shared", errors, url);
    if (!home.has(id)) errors.push(`the home ${url} has no shared block "${id}".`);
    else if (hashOf(home.get(id)) !== l.sha256) errors.push(`the linked block "${id}" at ${url} has the hash ${hashOf(home.get(id))}, not the hash of the lock.`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`check-shared: ${e}`);
  console.error(`check-shared: ${DOC} does not match ${LOCK}. A change of a shared block changes the lock in all three repositories.`);
  process.exit(1);
}
const checked = process.argv.includes("--remote") ? "checked at their homes" : "not downloaded";
console.log(`check-shared: ${shared.size} shared blocks match ${LOCK}. ${linked.size} linked blocks have their links (${checked}).`);
