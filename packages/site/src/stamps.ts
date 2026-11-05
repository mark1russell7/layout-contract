/**
 * The data stamps of the measured pages. The file `data/stamps.json` names the runs of each measured page.
 * The build puts the stamp line in the page, and the freshness gate of the Pages workflow reads the same file.
 * This file runs only at build time, because the root of `@mark1russell7/site-pages` imports Node.js.
 */

import { type DataStamps, parseDataStamps, renderDataStamp } from "@mark1russell7/site-pages";
import type { JointData } from "./data.ts";
import { ENGINE_SCOPE, type EngineOnNpm, HOLD_ROWS } from "./kpi.ts";

/** The mark in the html of a measured page. The build replaces the mark with the stamp line of the page. */
const MARK = "<!-- data-stamp -->";

/** The page that shows the joint runs. Each other stamped page gets the same comparison. */
const HOME = "index.html";

/** This function reads the text of `data/stamps.json`. A bad file stops the build with its faults. */
export function readStamps(text: string): DataStamps {
  const parsed = parseDataStamps(JSON.parse(text));
  if (!parsed.ok) throw new Error(`The file data/stamps.json is not good:\n- ${parsed.faults.join("\n- ")}`);
  return parsed.stamps;
}

/**
 * This function compares the stamp of each page with the newest joint run. An empty result tells that they agree.
 * Thus a new data file cannot land with the stamp of the run before it.
 *
 * @param stamps - The content of `data/stamps.json`.
 * @param run - The newest joint run of `data/joint/`.
 */
export function stampFaults(stamps: DataStamps, run: Pick<JointData, "run" | "date" | "versions">): string[] {
  if (!stamps.pages.some((p) => p.page === HOME)) return [`The file data/stamps.json has no stamp for ${HOME}.`];
  return stamps.pages.flatMap((page) => pageFaults(page, run));
}

/** This function compares the stamp of one page with the newest joint run. */
function pageFaults(page: DataStamps["pages"][number], run: Pick<JointData, "run" | "date" | "versions">): string[] {
  const stamped = page.runs.find((r) => r.id === run.run);
  if (stamped === undefined) return [`The stamp of ${page.page} does not name the run ${run.run}, the newest joint run.`];
  const faults: string[] = [];
  if (stamped.date.slice(0, 10) > run.date) faults.push(`The stamp of the run ${run.run} has the date ${stamped.date}, after the date ${run.date} of its data.`);
  for (const [name, version] of Object.entries(run.versions)) {
    const inStamp = stamped.engines[`${ENGINE_SCOPE}${name}`];
    if (inStamp !== version) faults.push(`The stamp of the run ${run.run} gives ${name} ${String(inStamp)}, and its data gives ${version}.`);
  }
  return faults;
}

/** The words of a page when the build did not read npm. */
export const NPM_NOT_READ = "npm not read at this build, so the gap is unknown.";

/**
 * This function gives the line that puts the versions of the run beside npm, in words. It tells which versions close the gap.
 * The file `kpi.json` has the same numbers, so the page and the file do not disagree.
 * With no read of npm, the line tells that, because a page with no line says nothing to a reader.
 */
export function npmLine(engines: readonly EngineOnNpm[] | undefined): string {
  if (engines === undefined) return `<p class="data-stamp">${NPM_NOT_READ}</p>`;
  const behind = engines.filter((e) => e.used !== e.latest && e.heldUntil === undefined);
  const parts = engines.map((e) => `${e.engine} ${e.used}, npm ${e.latest}${e.behind === 0 ? "" : `, ${e.behind} ${e.behind === 1 ? "release" : "releases"} behind`}${e.heldUntil === undefined ? "" : `, held to ${e.heldUntil} by <a href="${HOLD_ROWS}">this row</a>`}`);
  const held = engines.some((e) => e.heldUntil !== undefined);
  const end = behind.length > 0 ? `A run on ${behind.map((e) => `${e.engine} ${e.latest}`).join(" and ")} closes the gap.` : held ? "A run after the hold closes the gap." : "Each engine has the newest version on npm.";
  return `<p class="data-stamp">The engines of this data: ${parts.join(". ")}. ${end}</p>`;
}

/**
 * This function puts the stamp line in the html of a page.
 * A page with a mark and no stamp, or a stamp and no mark, stops the build.
 *
 * @param html - The html of the page.
 * @param filename - The path of the page.
 * @param stamps - The content of `data/stamps.json`.
 * @param engines - The engines of the newest run beside npm, or `undefined` when the build did not read npm.
 */
export function withDataStamp(html: string, filename: string, stamps: DataStamps, engines?: readonly EngineOnNpm[]): string {
  const page = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  const stamp = stamps.pages.find((p) => p.page === page);
  const marked = html.includes(MARK);
  if (stamp === undefined && marked) throw new Error(`The page ${page} has the mark of a data stamp, and data/stamps.json has no stamp for it.`);
  if (stamp === undefined) return html;
  if (!marked) throw new Error(`The file data/stamps.json has a stamp for the page ${page}, and the page has no mark.`);
  return html.replace(MARK, () => `${renderDataStamp(stamp)}${npmLine(engines)}`);
}
