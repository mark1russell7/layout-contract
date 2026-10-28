// This script writes the manifest corpus/joint-v1/corpus.json of the corpus joint-v1. Start it with `pnpm corpus`.
import { mkdirSync, writeFileSync } from "node:fs";
import { jointCorpus, manifestJson } from "../src/corpus.ts";

const file = new URL("../corpus/joint-v1/corpus.json", import.meta.url);
mkdirSync(new URL(".", file), { recursive: true });
const { manifest } = jointCorpus();
writeFileSync(file, manifestJson(manifest));
console.log(`${manifest.specs.length} specs, ${manifest.inputs.length} inputs`);
