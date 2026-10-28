// The build makes the catalog of the joint pages with this file. The Vite config reads the files and gives their text to it.
import { GRID_DIMENSIONS_V2, jointCorpus, jointSpecs, SET_V2 } from "@layout-contract/joint/browser";
import type { InputRow, JointCatalog } from "./catalog.ts";
import { engineCatalog } from "./engines.ts";

/** The largest count of boxes of an input of the full compare. A pair on 1000 boxes takes approximately 2 seconds in Node. Thus 160 pairs take minutes. */
export const COMPARE_MAX_BOXES = 100;

/** The versions of the engines and of the contract, from their `package.json` files. */
export interface EngineVersions {
  readonly packing: string;
  readonly highways: string;
  readonly contract: string;
}

/**
 * This function gives the catalog of the joint pages, with the joint space of `jointSpace`.
 * It makes each input of `joint-v2`, and it throws when the hash of an input is not the hash of the committed manifest.
 */
export function buildCatalog(manifestText: string, versions: EngineVersions): JointCatalog {
  const catalog = engineCatalog({ ...versions });
  const manifest = JSON.parse(manifestText) as { readonly inputs: readonly { readonly id: string; readonly hash: string }[] };
  const committed = new Map(manifest.inputs.map((e) => [e.id, e.hash]));
  const corpus = jointCorpus(SET_V2);
  const specs = jointSpecs(SET_V2);
  const inputs: InputRow[] = [];
  let at = 0;
  specs.forEach((spec, i) => {
    for (const seed of spec.seeds) {
      const input = corpus.inputs[at]!;
      const entry = corpus.manifest.inputs[at]!;
      at++;
      if (committed.get(entry.id) !== entry.hash) throw new Error(`The input ${entry.id} has the hash ${entry.hash}, not the hash of the committed manifest.`);
      inputs.push({ id: entry.id, spec: i, seed, boxes: input.boxes.length, edges: input.edges?.length ?? 0, hash: entry.hash, stress: entry.stress === true, array: spec.array });
    }
  });
  const { count: _count, ...grid } = GRID_DIMENSIONS_V2;
  return { ...catalog, inputs, grid, compareMaxBoxes: COMPARE_MAX_BOXES };
}
