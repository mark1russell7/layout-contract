// This script writes the manifest corpus/<set>/corpus.json of each joint corpus, or of the corpus of its argument. Start it with `pnpm corpus [set]`.
// joint-v1 is frozen: the script writes the same bytes again, and its test fails on a change.
import { mkdirSync, writeFileSync } from "node:fs";
import { jointCorpus, manifestJson, SETS, type JointSet } from "../src/corpus.ts";

/** This function tells if a name is the name of a joint corpus. */
const isSet = (name: string): name is JointSet => SETS.some((set) => set === name);

const wanted = process.argv[2];
if (wanted !== undefined && !isSet(wanted)) {
  console.error(`The corpus is ${SETS.join(" or ")}, not ${wanted}.`);
  process.exit(2);
}
for (const set of wanted === undefined ? SETS : [wanted]) {
  const file = new URL(`../corpus/${set}/corpus.json`, import.meta.url);
  mkdirSync(new URL(".", file), { recursive: true });
  const { manifest } = jointCorpus(set);
  writeFileSync(file, manifestJson(manifest));
  console.log(`${set}: ${manifest.specs.length} specs, ${manifest.inputs.length} inputs`);
}
