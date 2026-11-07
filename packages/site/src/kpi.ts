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
  /** The time of the joint data: the date of the newest joint run. It is not the time of the build. The age of the data reads it. */
  readonly at: string;
  measures: SiteMeasure[];
}

/** The parts of the catalog that the measures read. */
export type KpiCatalog = Pick<JointCatalog, "about">;

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

/**
 * This function tells if a failed read of npm stops a build. A scheduled build stops when the file of the last deploy also has no read of npm.
 * So one fault of the registry passes, and a read that stays broken does not stay hidden.
 * A last file that did not load or does not parse tells nothing, so it passes.
 *
 * @param event - The event of the build, from `GITHUB_EVENT_NAME`.
 * @param lastKpi - The bytes of `kpi.json` of the last deploy, or `undefined` when they did not load.
 */
export function failedReadStops(event: string | undefined, lastKpi: string | undefined): boolean {
  if (event !== "schedule" || lastKpi === undefined) return false;
  try {
    const file = JSON.parse(lastKpi) as { readonly measures?: readonly { readonly id: string }[] };
    return Array.isArray(file.measures) && !file.measures.some((m) => m.id === "engines-current");
  } catch {
    return false;
  }
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
 * This function counts the routers with a row in the run that are entries of the registry of `highways`.
 * A router in a list of the site with no row does not count, because a list is not a comparison.
 * A row of a router outside the registry, for example a member form of the portfolio, does not count.
 *
 * @param run - The joint run. Its rows are the routers of `stress.byRouter`.
 * @param keyed - The names of the router and highway entries of the registry of the pinned `highways`.
 */
export function routersOnCompare(run: JointData, keyed: readonly string[]): number {
  const names = new Set(keyed);
  return new Set(run.stress.byRouter.map((router) => router.id).filter((id) => names.has(id))).size;
}

/**
 * This function gives the newest cover run of the files, or the newest run when no file is a cover run.
 * A cover run has each strategy and each open router. So a default run after it does not lower the counts of the coverage.
 *
 * @param files - The data files of `data/joint/`.
 */
export function coverageRun(files: readonly JointData[]): JointData | undefined {
  return latestJoint(files.filter((file) => file.cover === true)) ?? latestJoint(files);
}

/**
 * This function gives the input of the writer. It gives undefined when no joint run exists, because the time of the data is then not known.
 * The time of the file is the date of the newest run. Each measure of the coverage has the date of the run that it counts, from `coverageRun`.
 * So a new date beside old coverage does not read as new coverage.
 *
 * @param files - The data files of `data/joint/`.
 * @param catalog - The catalog of the build.
 * @param npm - The read of npm of this build. Without it, the file has no measure that reads npm, because an old value is not a measure.
 * @param entries - The bench entries of the joint package.
 * @param commitAt - The time of the commit of the build, in UTC. The registry of the build has this time, so an old run does not age it.
 * @param keyed - The names of the router and highway entries of the registry of the pinned `highways`, from `keyedRouterNames`.
 */
export function siteKpiInput(files: readonly JointData[], catalog: KpiCatalog, npm: NpmRead | undefined, entries: readonly BenchEntry[], commitAt: string, keyed: readonly string[]): SiteKpi | undefined {
  const run = latestJoint(files);
  if (run === undefined) return undefined;
  const cover = coverageRun(files) ?? run;
  const coverAt = `${cover.date}T00:00:00Z`;
  return {
    project: KPI_PROJECT,
    at: `${run.date}T00:00:00Z`,
    measures: [
      { id: "pairs-in-run", value: cover.pairs, unit: "pairs", at: coverAt },
      { id: "packers-measured", value: packersMeasured(cover, catalog, entries), unit: "packers", at: coverAt },
      { id: "routers-on-compare", value: routersOnCompare(cover, keyed), unit: "routers", at: coverAt },
      { id: "routers-keyed", value: new Set(keyed).size, unit: "routers", at: commitAt },
      ...(npm === undefined ? [] : npmMeasures(npm)),
    ],
  };
}
