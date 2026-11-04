// The numbers of the file `kpi.json` of the site. Each value comes from the joint data or the catalog of the build.
// So no reader copies a number from a page, and no number has a person as its source.
import type { JointCatalog } from "./catalog.ts";
import { latestJoint, type JointData } from "./data.ts";

/** The name of the project in the file. */
export const KPI_PROJECT = "layout-contract";

/** One measure of the file. */
export interface SiteMeasure {
  readonly id: string;
  readonly value: number;
  readonly unit?: string;
}

/** The input of the writer of `kpi.json`. */
export interface SiteKpi {
  readonly project: string;
  /** The time of the data: the date of the last joint run. It is not the time of the build. */
  readonly at: string;
  measures: SiteMeasure[];
}

/** The parts of the catalog that the measures read. */
export type KpiCatalog = Pick<JointCatalog, "routers">;

/** This function counts the engines of the run that have the version of the build of the site. */
export function enginesCurrent(run: Readonly<Record<string, string>>, built: Readonly<Record<string, string>>): number {
  return Object.keys(run).filter((engine) => run[engine] === built[engine]).length;
}

/**
 * This function gives the input of the writer. It gives undefined when no joint run exists, because the time of the data is then not known.
 *
 * The measure `packers-measured` counts the packers of the run. A packer of the catalog with no row in the run has no result.
 *
 * @param files - The data files of `data/joint/`.
 * @param catalog - The catalog of the build.
 * @param built - The version of each engine in the build of the site.
 */
export function siteKpiInput(files: readonly JointData[], catalog: KpiCatalog, built: Readonly<Record<string, string>>): SiteKpi | undefined {
  const run = latestJoint(files);
  if (run === undefined) return undefined;
  return {
    project: KPI_PROJECT,
    at: `${run.date}T00:00:00Z`,
    measures: [
      { id: "pairs-in-run", value: run.pairs, unit: "pairs" },
      { id: "packers-measured", value: run.stress.byPacker.length, unit: "packers" },
      { id: "routers-on-compare", value: catalog.routers.length, unit: "routers" },
      { id: "engines-current", value: enginesCurrent(run.versions, built), unit: "engines" },
    ],
  };
}
