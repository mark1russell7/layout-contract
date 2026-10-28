// The split files of the joint corpus (`docs/JOINT-BENCH.md`, "The split files", roadmap item L22). A split file is beside the manifest, so the manifest does not change.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusHashOf, splitFileName, splitFolds, type SplitCorpus, type SplitFold } from "@mark1russell7/layout-contract";

/** The folder of the split files of the joint corpus. */
export const SPLITS_DIR: string = fileURLToPath(new URL("../corpus/splits", import.meta.url));

/** The name of the split of the analysis: 3 folds, and each fold holds out one seed. */
export const DEFAULT_SPLIT = "default";

/**
 * This function reads the split `name` of the corpus of a manifest from `dir`. The file is `<corpus>.<corpus hash>.json`.
 * It throws an `Error` when no file has the hash of the corpus, for each problem of `checkSplit` and for an unknown split name.
 */
export function loadSplit(manifest: SplitCorpus, name: string = DEFAULT_SPLIT, dir: string = SPLITS_DIR): SplitFold[] {
  const hash = corpusHashOf(manifest.corpus, manifest.inputs);
  const path = join(dir, splitFileName(manifest.corpus, hash));
  if (!existsSync(path)) {
    const others = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${manifest.corpus}.`) && f.endsWith(".json")) : [];
    const known = others.length === 0 ? "No split file of the corpus exists." : `The split files of the corpus are ${others.join(", ")}, for other inputs.`;
    throw new Error(`The corpus ${manifest.corpus} has the hash ${hash}, and ${splitFileName(manifest.corpus, hash)} does not exist. ${known}`);
  }
  return splitFolds(JSON.parse(readFileSync(path, "utf8")), manifest, name, `The split file ${path}`);
}
