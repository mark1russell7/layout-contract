// The numbers of the file `kpi.json` of the site. Each value comes from the joint data or the catalog of the build.
// So no reader copies a number from a page, and no number has a person as its source.
import { spaceSize, type StrategySpace } from "@mark1russell7/layout-contract";
import { compareVersions, parseVersion } from "@mark1russell7/site-pages";
import type { JointCatalog } from "./catalog.ts";
import { latestFull, latestJoint, shownAge, type JointData } from "./data.ts";

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

/**
 * The read of the sweep coverage of one build, from the branch `sweep-data`.
 * `shown` is true when the page shows a week view with its engine steps (`weekShown`). `night` is the latest night of the trend.
 */
export interface SweepRead {
  readonly shown: boolean;
  readonly night: string;
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
  return packersOf(run, catalog, entries).length;
}

/** This function gives the strategies of the catalog with a result in the run. */
function packersOf(run: JointData, catalog: KpiCatalog, entries: readonly BenchEntry[]): string[] {
  const strategyOf = new Map(entries.map((entry) => [entry.id, entry.strategy]));
  const measured = new Set(run.stress.byPacker.map((packer) => strategyOf.get(packer.id)));
  return Object.keys(catalog.about.packing).filter((strategy) => measured.has(strategy));
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
  return routersOf(run, keyed).length;
}

/** This function gives the routers with a row in the run that are entries of the registry of `highways`, each one time. */
function routersOf(run: JointData, keyed: readonly string[]): string[] {
  const names = new Set(keyed);
  return [...new Set(run.stress.byRouter.map((router) => router.id).filter((id) => names.has(id)))];
}

/**
 * This function gives the newest cover run of the files, or the newest run when no file is a cover run.
 * A cover run has each strategy and each open router. So a default run after it does not lower the counts of the coverage.
 *
 * @param files - The data files of `data/joint/`.
 */
export function coverageRun(files: readonly JointData[]): JointData | undefined {
  return latestJoint(files.filter((file) => file.cover === true)) ?? latestFull(files);
}

/** The engines whose versions tell if two runs measure the same code. */
export const COVERAGE_ENGINES: readonly string[] = Object.freeze(["packing", "highways"]);

/**
 * This function gives the runs that the coverage counts: `coverageRun` and each other run with its versions of `COVERAGE_ENGINES`.
 * A run of some pairs of the cover is not a cover run. But its strategies run on the same code, so they count (L94).
 * A run of other versions does not count, because its results are of other code.
 *
 * @param files - The data files of `data/joint/`.
 */
export function coverageRuns(files: readonly JointData[]): JointData[] {
  const cover = coverageRun(files);
  if (cover === undefined) return [];
  return files.filter((file) => COVERAGE_ENGINES.every((engine) => file.versions[engine] === cover.versions[engine]));
}

/** The run that gives one counted name: the newest run of the count with a result of the name. */
export interface CountSource {
  readonly name: string;
  readonly run: string;
  readonly corpus: string;
  readonly date: string;
}

/** A count over some runs, with the time of its oldest part. */
export interface CoverageCount {
  readonly value: number;
  readonly at: string;
  /** One source for each counted name, in the order of the names. So a name of another corpus shows its corpus (L140). */
  readonly sources: readonly CountSource[];
}

/**
 * This function counts the names that each run gives, each name one time. The time is the date of the oldest part of the count.
 * The part of a name is the newest run that gives it. So the time shows the age of the oldest result in the count.
 *
 * @param runs - The runs of `coverageRuns`.
 * @param namesOf - The names that a run gives.
 * @param fallback - The time of a count with no name.
 */
export function countOverRuns(runs: readonly JointData[], namesOf: (run: JointData) => readonly string[], fallback: string): CoverageCount {
  const newest = new Map<string, JointData>();
  for (const run of runs) {
    for (const name of namesOf(run)) {
      const seen = newest.get(name);
      if (seen === undefined || run.date > seen.date) newest.set(name, run);
    }
  }
  if (newest.size === 0) return { value: 0, at: fallback, sources: [] };
  const sources = [...newest.entries()]
    .map(([name, run]): CountSource => ({ name, run: run.run, corpus: run.corpus, date: run.date }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { value: newest.size, at: `${sources.map((source) => source.date).sort()[0]!}T00:00:00Z`, sources };
}

/** The format of the file `kpi-sources.json`. */
export const COUNT_SOURCES_SCHEMA = "kpi-sources/1";

/** The sources of the measures packers-measured and routers-on-compare: for each counted name, its run and its corpus (L140). */
export interface CountSources {
  readonly schema: typeof COUNT_SOURCES_SCHEMA;
  readonly packers: readonly CountSource[];
  readonly routers: readonly CountSource[];
}

/**
 * This function gives the source of each name that packers-measured and routers-on-compare count.
 * The file `kpi-sources.json` and the joint section of the home page show them. So a join of runs of two corpora is shown, not implied.
 *
 * @param files - The data files of `data/joint/`.
 * @param catalog - The catalog of the build.
 * @param entries - The bench entries of the joint package.
 * @param keyed - The names of the router and highway entries of the registry of the pinned `highways`.
 */
export function countSources(files: readonly JointData[], catalog: KpiCatalog, entries: readonly BenchEntry[], keyed: readonly string[]): CountSources {
  const runs = coverageRuns(files);
  return {
    schema: COUNT_SOURCES_SCHEMA,
    packers: countOverRuns(runs, (r) => packersOf(r, catalog, entries), "").sources,
    routers: countOverRuns(runs, (r) => routersOf(r, keyed), "").sources,
  };
}

/**
 * This function gives the input of the writer. It gives undefined when no joint run exists, because the time of the data is then not known.
 * The time of the file is the date of the oldest pair that the page shows (`shownAge`, L132). So a short run does not make old pairs read as new.
 * The measure pairs-shown counts those pairs, with the date of the median pair. The pairs come from `coverageRun`, with its date.
 * The packers and the routers count each run of `coverageRuns`, with the date of the oldest part of the count.
 * So a new date beside old coverage does not read as new coverage.
 *
 * @param files - The data files of `data/joint/`.
 * @param catalog - The catalog of the build.
 * @param npm - The read of npm of this build. Without it, the file has no measure that reads npm, because an old value is not a measure.
 * @param entries - The bench entries of the joint package.
 * @param commitAt - The time of the commit of the build, in UTC. The registry of the build has this time, so an old run does not age it.
 * @param keyed - The names of the router and highway entries of the registry of the pinned `highways`, from `keyedRouterNames`.
 */
export function siteKpiInput(
  files: readonly JointData[],
  catalog: KpiCatalog,
  npm: NpmRead | undefined,
  entries: readonly BenchEntry[],
  commitAt: string,
  keyed: readonly string[],
  sweep?: SweepRead,
): SiteKpi | undefined {
  const run = latestFull(files);
  const age = shownAge(files);
  if (run === undefined || age === undefined) return undefined;
  const cover = coverageRun(files) ?? run;
  const coverAt = `${cover.date}T00:00:00Z`;
  const runs = coverageRuns(files);
  const packers = countOverRuns(runs, (r) => packersOf(r, catalog, entries), coverAt);
  const routers = countOverRuns(runs, (r) => routersOf(r, keyed), coverAt);
  return {
    project: KPI_PROJECT,
    at: `${age.oldest}T00:00:00Z`,
    measures: [
      { id: "pairs-in-run", value: cover.pairs, unit: "pairs", at: coverAt },
      { id: "pairs-shown", value: age.pairs, unit: "pairs", at: `${age.median}T00:00:00Z` },
      { id: "packers-measured", value: packers.value, unit: "packers", at: packers.at },
      { id: "routers-on-compare", value: routers.value, unit: "routers", at: routers.at },
      { id: "routers-keyed", value: new Set(keyed).size, unit: "routers", at: commitAt },
      ...(npm === undefined ? [] : npmMeasures(npm)),
      ...(sweep === undefined ? [] : [{ id: "coverage-shown", value: sweep.shown ? 1 : 0, at: `${sweep.night}T00:00:00Z` }]),
    ],
  };
}

/** One data file of `data/spaces/`, with the schema `site-space/1`: the strategy space of an engine, its source and its date. */
export interface SpaceFile {
  readonly schema: "site-space/1";
  /** The package and the version of the space, for example `packing 0.10.2`. */
  readonly source: string;
  readonly date: string;
  readonly space: StrategySpace;
}

/** The count of the levels of each numeric param in the config counts. The examples of `docs/STRATEGY-SPACE.md` use 3 levels. */
export const SPACE_LEVELS = 3;

/**
 * This function gives the config counts of the stored engine spaces (L148).
 * The measure `space-configs-<engine>` counts the configs of a grid without a meta option, with `SPACE_LEVELS` levels.
 * The measure `space-configs-product` counts the pairs of the two spaces, with the date of the older file.
 * A count above `Number.MAX_SAFE_INTEGER` is the nearest number.
 */
export function spaceConfigMeasures(files: readonly SpaceFile[]): SiteMeasure[] {
  const counts = files.map((f) => ({ engine: f.space.engine, base: spaceSize(f.space, { levels: SPACE_LEVELS }).base, at: `${f.date}T00:00:00Z` }));
  const measures: SiteMeasure[] = counts.map((c) => ({ id: `space-configs-${c.engine}`, value: Number(c.base), unit: "configs", at: c.at }));
  if (counts.length >= 2) {
    const product = counts.reduce((p, c) => p * c.base, 1n);
    measures.push({ id: "space-configs-product", value: Number(product), unit: "configs", at: counts.map((c) => c.at).sort()[0]! });
  }
  return measures;
}
