import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkSplit, corpusHashOf, leaveOneSeedOut, splitFileName } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { SEEDS, SETS, type JointManifest } from "./corpus.ts";
import { loadSplit, SPLITS_DIR } from "./split.ts";

// The split files of the joint corpus (L22). The manifests are the committed files. The job check of joint-bench.yml examines that they are the manifests of the code.

const manifestOf = (set: string): JointManifest => JSON.parse(readFileSync(new URL(`../corpus/${set}/corpus.json`, import.meta.url), "utf8")) as JointManifest;

/** The pinned corpus hashes. A change of an input id or an input hash changes them, and the split file needs a new name. */
const HASHES: Readonly<Record<string, string>> = { "joint-v1": "277ffd12181e74ef", "joint-v2": "1d0909caec40631e" };

describe("the split files of the joint corpus", () => {
  it("has one split file for each corpus, with the hash of its manifest in the name", () => {
    expect(readdirSync(SPLITS_DIR).filter((f) => f.endsWith(".json")).sort()).toEqual(SETS.map((s) => splitFileName(s, HASHES[s]!)).sort());
    for (const set of SETS) expect(corpusHashOf(set, manifestOf(set).inputs)).toBe(HASHES[set]);
  });

  it("passes checkSplit, and the split default holds out each seed once", () => {
    for (const set of SETS) {
      const manifest = manifestOf(set);
      const file: unknown = JSON.parse(readFileSync(join(SPLITS_DIR, splitFileName(set, HASHES[set]!)), "utf8"));
      expect(checkSplit(file, manifest, "default")).toEqual([]);
      expect(loadSplit(manifest)).toEqual(leaveOneSeedOut(SEEDS));
      expect(loadSplit(manifest)).toHaveLength(3);
    }
  });

  it("refuses a corpus with other inputs, and an unknown split name", () => {
    const manifest = manifestOf("joint-v2");
    expect(() => loadSplit({ ...manifest, inputs: manifest.inputs.slice(1) })).toThrow(/does not exist. The split files of the corpus are joint-v2.1d0909caec40631e.json, for other inputs/);
    expect(() => loadSplit(manifest, "loso")).toThrow(/has no split loso. Its splits are default/);
  });
});
