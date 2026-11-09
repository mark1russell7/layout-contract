// The check of the carry sources of a pull request (L147 rule B, `docs/JOINT-BENCH.md`).
// A change of the measure code makes a carry from an earlier run a code bridge. The check names each such run before the merge.
// This module has no package imports, so the job of the check starts with no install.

/** The file of the runner. The measure code is this file and its local imports (`localImports`). */
export const MEASURE_ENTRY = "runner.ts";

/** The line that names a carry source in the body or in a commit message of a pull request, for example `Carry-Source: 42428038369`. */
export const CARRY_SOURCE_LINE: RegExp = /^Carry-Source:[ \t]*(\d+)[ \t]*$/gim;

/**
 * This function gives the local files that a source file reads: the file, and each file of its `./*.ts` imports, again for each such file.
 * `read` gives the text of a file by its name in the folder. The result is sorted. A plain carry needs the same text of these files of `runner.ts` at the two commits.
 */
export function localImports(entry: string, read: (file: string) => string): string[] {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of read(file).matchAll(/from\s+"\.\/([^"]+\.ts)"/g)) todo.push(match[1]!);
  }
  return [...seen].sort();
}

/**
 * This function gives the measure files of a change: the local imports of `MEASURE_ENTRY` at the base and at the head, sorted.
 * `base` and `head` give the text of a file, or `undefined` for a file that is not at that commit.
 */
export function measureFiles(base: (file: string) => string | undefined, head: (file: string) => string | undefined): string[] {
  const at = (read: (file: string) => string | undefined): string[] => localImports(MEASURE_ENTRY, (file) => read(file) ?? "");
  return [...new Set([...at(base), ...at(head)])].sort();
}

/** An earlier manual run of the joint bench, with the text of each measure file at its commit. `text` is `undefined` when git does not have the commit. */
export interface CarrySource {
  /** The id of the run. */
  readonly run: string;
  /** The text of each measure file at the commit of the run. A file that is not at the commit has no entry. */
  readonly text: ReadonlyMap<string, string> | undefined;
}

/** The result of the check of the carry sources. */
export interface CarrySourceCheck {
  /** The measure files with other text at the base and at the head. */
  readonly changed: readonly string[];
  /** Each run with the measure code of the base. Before the merge, a carry from it is a plain carry. After the merge, it is a code bridge. */
  readonly bridged: readonly string[];
  /** Each run of `bridged` that no line `Carry-Source: <run>` names. The check fails when this list has a run. */
  readonly unnamed: readonly string[];
  /** Each run with a commit that git does not have. The check gives a note for each, and it does not fail. */
  readonly unknown: readonly string[];
}

/**
 * This function gives the check of the carry sources of a pull request.
 * `base` and `head` give the text of each file of `files` at the two commits. `named` holds the runs of the lines `Carry-Source`.
 */
export function carrySourceCheck(
  files: readonly string[],
  base: ReadonlyMap<string, string>,
  head: ReadonlyMap<string, string>,
  sources: readonly CarrySource[],
  named: ReadonlySet<string>,
): CarrySourceCheck {
  const changed = files.filter((file) => base.get(file) !== head.get(file));
  const bridged: string[] = [];
  const unknown: string[] = [];
  if (changed.length > 0) {
    for (const source of sources) {
      if (source.text === undefined) unknown.push(source.run);
      else if (files.every((file) => source.text!.get(file) === base.get(file))) bridged.push(source.run);
    }
  }
  return { changed, bridged, unnamed: bridged.filter((run) => !named.has(run)), unknown };
}

/** This function gives the runs of the lines `Carry-Source: <run>` of a text, for example of the body and the commit messages of a pull request. */
export function namedCarrySources(text: string): Set<string> {
  return new Set([...text.matchAll(CARRY_SOURCE_LINE)].map((m) => m[1]!));
}

/** This function gives the lines of the summary of a check. Each run of `bridged` has the line "This pull request ends the plain carry of run <run>". */
export function carrySourceLines(check: CarrySourceCheck): string[] {
  if (check.changed.length === 0) return ["The measure code does not change, so each carry source keeps a plain carry."];
  const lines = [`The measure code changes: ${check.changed.join(", ")}.`];
  if (check.bridged.length === 0) lines.push("No carry source has the measure code of the base, so no plain carry ends.");
  for (const run of check.bridged) {
    const state = check.unnamed.includes(run) ? "not named: add the line `Carry-Source: " + run + "` to the body or to a commit message" : "named";
    lines.push(`This pull request ends the plain carry of run ${run}. A carry from it is a code bridge after the merge (${state}).`);
  }
  for (const run of check.unknown) lines.push(`git does not have the commit of run ${run}, so the check does not compare it.`);
  return lines;
}
