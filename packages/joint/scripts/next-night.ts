// The check before a job pushes a data tree to the branch `sweep-data`: `node scripts/next-night.ts <tree> <branch copy>`.
// It prints the date of the night of the tree, or it stops with exit 1 when the push removes the data of a night.
import { nextNightProblem, readNights } from "../src/next-night.ts";

const [treeDir, branchDir] = process.argv.slice(2);
if (!treeDir || !branchDir) throw new Error("Usage: node scripts/next-night.ts <tree> <branch copy>");
const { tree, branch } = readNights(treeDir, branchDir);
const problem = nextNightProblem(tree, branch);
if (problem) {
  console.error(problem);
  process.exit(1);
}
console.log(tree.nights.at(-1)?.date);
