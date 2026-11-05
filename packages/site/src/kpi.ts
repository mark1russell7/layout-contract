// The numbers of the file `kpi.json` of the site. Each value comes from the joint data or the catalog of the build.
// So no reader copies a number from a page, and no number has a person as its source.
import { compareVersions, parseVersion } from "@mark1russell7/site-pages";
import type { JointCatalog } from "./catalog.ts";
import { latestJoint, type JointData } from "./data.ts";

/** The npm scope of the engines of a joint run. */
export const ENGINE_SCOPE = "@mark1russell7/";

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

/** One engine of a run beside its newest stable version on npm. */
export interface EngineOnNpm {
  /** The name of the engine in the run, for example `packing`. */
  readonly engine: string;
  /** The version that the run used. */
  readonly used: string;
  /** The newest stable version on npm. */
  readonly latest: string;
  /** The number of stable versions on npm after the version that the run used. */
  readonly behind: number;
}

/** The read of npm of one build, with its time. */
export interface NpmRead {
  readonly at: string;
  readonly engines: readonly EngineOnNpm[];
}

/**
 * This function puts each engine of a run beside npm. An engine with no stable version on npm stops the build, because the engines are published packages.
 *
 * @param run - The version of each engine in the run.
 * @param times - The versions on npm, from `npmPublishTimes`.
 */
export function enginesOnNpm(run: Readonly<Record<string, string>>, times: readonly { readonly name: string; readonly version: string }[]): EngineOnNpm[] {
  return Object.entries(run).map(([engine, used]) => {
    const stable = times.filter((t) => t.name === `${ENGINE_SCOPE}${engine}` && parseVersion(t.version)?.prerelease.length === 0).map((t) => t.version);
    const latest = [...stable].sort(compareVersions).at(-1);
    if (latest === undefined) throw new RangeError(`npm has no stable version of ${ENGINE_SCOPE}${engine}.`);
    return { engine, used, latest, behind: stable.filter((version) => compareVersions(version, used) > 0).length };
  });
}

/** This function counts the engines of the run that have the newest version on npm. So the count falls when an engine has a release after the run. */
export function enginesCurrent(engines: readonly EngineOnNpm[]): number {
  return engines.filter((engine) => engine.used === engine.latest).length;
}

/** This function gives the measures that read npm. Each one has the time of the read, because npm can change with no commit here. */
function npmMeasures(npm: NpmRead): SiteMeasure[] {
  return [
    { id: "engines-current", value: enginesCurrent(npm.engines), unit: "engines", at: npm.at },
    ...npm.engines.map((engine) => ({ id: `engine-releases-behind-${engine.engine}`, value: engine.behind, unit: "releases", at: npm.at })),
  ];
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
 * @param npm - The read of npm of this build. Without it, the file has no measure that reads npm, because an old value is not a measure.
 * @param entries - The bench entries of the joint package.
 * @param commitAt - The time of the commit of the build, in UTC. The catalog of the build has this time, so an old run does not age it.
 */
export function siteKpiInput(files: readonly JointData[], catalog: KpiCatalog, npm: NpmRead | undefined, entries: readonly BenchEntry[], commitAt: string): SiteKpi | undefined {
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
      ...(npm === undefined ? [] : npmMeasures(npm)),
    ],
  };
}
