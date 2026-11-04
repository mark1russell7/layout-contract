/**
 * The data stamps of the measured pages. The file `data/stamps.json` names the runs of each measured page.
 * The build puts the stamp line in the page, and the freshness gate of the Pages workflow reads the same file.
 * This file runs only at build time, because the root of `@mark1russell7/site-pages` imports Node.js.
 */

import { type DataStamps, parseDataStamps, renderDataStamp } from "@mark1russell7/site-pages";
import type { JointData } from "./data.ts";

/** The mark in the html of a measured page. The build replaces the mark with the stamp line of the page. */
const MARK = "<!-- data-stamp -->";

/** The page that shows the joint runs. */
const HOME = "index.html";

/** The npm scope of the engines of a joint run. */
const SCOPE = "@mark1russell7/";

/** This function reads the text of `data/stamps.json`. A bad file stops the build with its faults. */
export function readStamps(text: string): DataStamps {
  const parsed = parseDataStamps(JSON.parse(text));
  if (!parsed.ok) throw new Error(`The file data/stamps.json is not good:\n- ${parsed.faults.join("\n- ")}`);
  return parsed.stamps;
}

/**
 * This function compares the stamp of the home page with the newest joint run. An empty result tells that they agree.
 * Thus a new data file cannot land with the stamp of the run before it.
 *
 * @param stamps - The content of `data/stamps.json`.
 * @param run - The newest joint run of `data/joint/`.
 */
export function stampFaults(stamps: DataStamps, run: Pick<JointData, "run" | "date" | "versions">): string[] {
  const page = stamps.pages.find((p) => p.page === HOME);
  if (page === undefined) return [`The file data/stamps.json has no stamp for ${HOME}.`];
  const stamped = page.runs.find((r) => r.id === run.run);
  if (stamped === undefined) return [`The stamp of ${HOME} does not name the run ${run.run}, the newest joint run.`];
  const faults: string[] = [];
  if (stamped.date.slice(0, 10) > run.date) faults.push(`The stamp of the run ${run.run} has the date ${stamped.date}, after the date ${run.date} of its data.`);
  for (const [name, version] of Object.entries(run.versions)) {
    const inStamp = stamped.engines[`${SCOPE}${name}`];
    if (inStamp !== version) faults.push(`The stamp of the run ${run.run} gives ${name} ${String(inStamp)}, and its data gives ${version}.`);
  }
  return faults;
}

/**
 * This function puts the stamp line in the html of a page.
 * A page with a mark and no stamp, or a stamp and no mark, stops the build.
 *
 * @param html - The html of the page.
 * @param filename - The path of the page.
 * @param stamps - The content of `data/stamps.json`.
 */
export function withDataStamp(html: string, filename: string, stamps: DataStamps): string {
  const page = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  const stamp = stamps.pages.find((p) => p.page === page);
  const marked = html.includes(MARK);
  if (stamp === undefined && marked) throw new Error(`The page ${page} has the mark of a data stamp, and data/stamps.json has no stamp for it.`);
  if (stamp === undefined) return html;
  if (!marked) throw new Error(`The file data/stamps.json has a stamp for the page ${page}, and the page has no mark.`);
  return html.replace(MARK, renderDataStamp(stamp));
}
