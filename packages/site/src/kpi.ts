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
  /** The time of the data of this measure. A measure of the run and a measure of the build have different times. */
  readonly at: string;
}

/** The input of the writer of `kpi.json`. */
export interface SiteKpi {
  readonly project: string;
  /** The time of the joint data: the date of the last joint run. It is not the time of the build. */
  readonly at: string;
  measures: SiteMeasure[];
}

/** The parts of the catalog that the measures read. */
export type KpiCatalog = Pick<JointCatalog, "about" | "routers">;

/** One bench entry: its id in the run, and the strategy of `packing` that it uses. */
export interface BenchEntry {
  readonly id: string;
  readonly strategy: string;
}

/** This function counts the engines of the run that have the version of the build of the site. */
export function enginesCurrent(run: Readonly<Record<string, string>>, built: Readonly<Record<string, string>>): number {
  return Object.keys(run).filter((engine) => run[engine] === built[engine]).length;
}

/** This function counts the strategies of the catalog with a result in the run. One bench entry with a result is enough for its strategy. */
export function packersMeasured(run: JointData, catalog: KpiCatalog, entries: readonly BenchEntry[]): number {
  const strategyOf = new Map(entries.map((entry) => [entry.id, entry.strategy]));
  const measured = new Set(run.stress.byPacker.map((packer) => strategyOf.get(packer.id)));
  return Object.keys(catalog.about.packing).filter((strategy) => measured.has(strategy)).length;
}

/**
 * This function gives the input of the writer. It gives undefined when no joint run exists, because the time of the data is then not known.
 *
 * @param files - The data files of `data/joint/`.
 * @param catalog - The catalog of the build.
 * @param built - The version of each engine in the build of the site.
 * @param entries - The bench entries of the joint package.
 * @param commitAt - The time of the commit of the build, in UTC. The catalog and the engine versions of the build have this time, so an old run does not age them.
 */
export function siteKpiInput(files: readonly JointData[], catalog: KpiCatalog, built: Readonly<Record<string, string>>, entries: readonly BenchEntry[], commitAt: string): SiteKpi | undefined {
  const run = latestJoint(files);
  if (run === undefined) return undefined;
  const at = `${run.date}T00:00:00Z`;
  return {
    project: KPI_PROJECT,
    at,
    measures: [
      { id: "pairs-in-run", value: run.pairs, unit: "pairs", at },
      { id: "packers-measured", value: packersMeasured(run, catalog, entries), unit: "packers", at },
      { id: "routers-on-compare", value: catalog.routers.length, unit: "routers", at: commitAt },
      { id: "engines-current", value: enginesCurrent(run.versions, built), unit: "engines", at: commitAt },
    ],
  };
}
