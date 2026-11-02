// The check before a job writes a data tree to the branch `sweep-data` (`docs/SWEEP.md`).
// A night comes from the state that the branch had when the night started. If the branch got another night since then, a push of the tree removes that night.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The nights of a state of an epoch, as the data tree keeps them. */
export interface NightsState {
  readonly epoch: string;
  readonly nights: readonly { readonly date: string }[];
}

/**
 * This function gives the problem of a push of a tree, or `null` when the push adds only the last night of the tree.
 * The branch must have the nights of the tree before its last night, in the same order.
 */
export function nextNightProblem(tree: NightsState, branch: NightsState | null): string | null {
  const dates = tree.nights.map((n) => n.date);
  const last = dates.at(-1);
  if (last === undefined) return `The tree of the epoch ${tree.epoch} has no night.`;
  const expected = dates.slice(0, -1);
  const before = branch?.nights.map((n) => n.date) ?? [];
  if (JSON.stringify(before) === JSON.stringify(expected)) return null;
  return `The branch has the nights ${before.join(", ") || "none"} of the epoch ${tree.epoch}, but the night ${last} comes after ${expected.join(", ") || "none"}. A push removes the data of a night.`;
}

/** This function reads the state of the latest epoch of a data tree. It also reads the state of that epoch in a copy of the branch. */
export function readNights(treeDir: string, branchDir: string): { tree: NightsState; branch: NightsState | null } {
  const read = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
  const { latest } = read(join(treeDir, "index.json")) as { latest: string };
  const tree = read(join(treeDir, "epochs", latest, "state.json")) as NightsState;
  const file = join(branchDir, "epochs", latest, "state.json");
  return { tree, branch: existsSync(file) ? (read(file) as NightsState) : null };
}
