// The check of the carry sources of a pull request (L147 rule B): `node scripts/carry-sources.ts <base sha> <head ref> <runs.json> <names.txt> [days]`.
// runs.json is the output of `gh run list --json databaseId,headSha,createdAt` for the manual runs of the joint bench.
// names.txt holds the body and the commit messages of the pull request. The rule is in `src/carry-sources.ts`.
// It stops with exit 1 when the change ends the plain carry of a run that no line `Carry-Source: <run>` names.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { carrySourceCheck, carrySourceLines, measureFiles, namedCarrySources, type CarrySource } from "../src/carry-sources.ts";

const [base, head, runsFile, namesFile, daysText] = process.argv.slice(2);
if (!base || !head || !runsFile || !namesFile) throw new Error("Usage: node scripts/carry-sources.ts <base sha> <head ref> <runs.json> <names.txt> [days]");
const days = Number(daysText ?? "30");

/** The text of a file of `packages/joint/src` at a commit, with LF line ends, or `undefined` when the commit or the file is not there. */
function textAt(commit: string, file: string): string | undefined {
  const r = spawnSync("git", ["show", `${commit}:packages/joint/src/${file}`], { encoding: "utf8", maxBuffer: 1 << 26 });
  return r.status === 0 ? r.stdout.replaceAll("\r\n", "\n") : undefined;
}

/** This function tells if git has a commit. A commit of a deleted branch is not in the clone, so the function fetches it by its sha first. */
function hasCommit(commit: string): boolean {
  const has = (): boolean => spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`]).status === 0;
  if (has()) return true;
  spawnSync("git", ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", commit]);
  return has();
}

const files = measureFiles((f) => textAt(base, f), (f) => textAt(head, f));
const textsAt = (commit: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const file of files) {
    const text = textAt(commit, file);
    if (text !== undefined) out.set(file, text);
  }
  return out;
};
const since = Date.now() - days * 24 * 3600 * 1000;
const runs = (JSON.parse(readFileSync(runsFile, "utf8")) as { databaseId: number; headSha: string; createdAt: string }[]).filter((r) => Date.parse(r.createdAt) >= since);
const sources: CarrySource[] = runs.map((r) => ({ run: String(r.databaseId), text: hasCommit(r.headSha) ? textsAt(r.headSha) : undefined }));
const check = carrySourceCheck(files, textsAt(base), textsAt(head), sources, namedCarrySources(readFileSync(namesFile, "utf8")));
console.log(`Carry sources: ${runs.length} manual runs of the joint bench in the last ${days} days.`);
for (const line of carrySourceLines(check)) console.log(`- ${line}`);
for (const run of check.bridged) {
  const line = `This pull request ends the plain carry of run ${run}. A carry from it is a code bridge after the merge (L147 rule B).`;
  if (check.unnamed.includes(run)) console.error(`::error::${line} Add the line "Carry-Source: ${run}" to the body or to a commit message of the pull request.`);
  else console.log(`::notice::${line}`);
}
if (check.unnamed.length > 0) process.exit(1);
