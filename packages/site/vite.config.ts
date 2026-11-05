import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { coverEntries, PACK_ENTRIES, renovateHolds } from "@layout-contract/joint/browser";
import { npmPublishTimes } from "@mark1russell7/site-pages";
import { siteKpi } from "@mark1russell7/site-pages/vite";
import { defineConfig, type Plugin } from "vite";
import { buildCatalog } from "./src/build-catalog.ts";
import { checkDataFile, type JointData, latestJoint } from "./src/data.ts";
import { ENGINE_SCOPE, enginesOnNpm, failedReadStops, type NpmRead, siteKpiInput, withHolds } from "./src/kpi.ts";
import { withEngineLinks } from "./src/links.ts";
import { readStamps, stampFaults, withDataStamp } from "./src/stamps.ts";

// The Pages workflow sets SITE_BASE to "/layout-contract". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";

/** This plugin examines each data file that the site imports. A bad file stops the build with its problems. */
/** This plugin puts the links of `ENGINE_SITES` in the navigation of each page. A page without the mark stops the build. */
function engineSites(): Plugin {
  return { name: "engine-sites", transformIndexHtml: (html, ctx) => withEngineLinks(html, ctx.filename) };
}

function checkData(): Plugin {
  return {
    name: "layout-contract-site:check-data",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("?")) return null;
      const path = id.replace(/\\/g, "/");
      const at = path.lastIndexOf("/site/data/");
      if (at < 0 || !path.endsWith(".json")) return null;
      const file = path.slice(at + "/site/data/".length);
      const problems = checkDataFile(file, code);
      if (problems.length > 0) this.error(`The data file data/${file} is not good:\n- ${problems.join("\n- ")}`);
      return null;
    },
  };
}

/** This function tells if a result in `data/joint/` is a cover run. The text "waiting for the first cover run" goes when such a file lands. */
function hasCoverRun(): boolean {
  const dir = new URL("./data/joint/", import.meta.url);
  return readdirSync(dir).some((name) => name.endsWith(".json") && (JSON.parse(readFileSync(new URL(name, dir), "utf8")) as { cover?: boolean }).cover === true);
}

/** This function gives the catalog of the joint pages. The packers of the newest run decide which entries have no result. */
function catalogOfTheRuns(): ReturnType<typeof buildCatalog> {
  const measured = latestJoint(jointFiles())?.stress.byPacker.map((p) => p.id);
  return buildCatalog(readFileSync(MANIFEST, "utf8"), engineVersions(), hasCoverRun(), measured);
}

/** The read of npm of this build. It stays undefined outside a build, and when npm does not answer. */
let npmRead: NpmRead | undefined;

/** The file of measures of the last deploy. A build reads it only after a failed read of npm. */
const LIVE_KPI = "https://mark1russell7.github.io/layout-contract/kpi.json";

/** This function gives the bytes of the file of measures of the last deploy, or `undefined` when they do not load. */
async function lastKpi(): Promise<string | undefined> {
  try {
    const response = await fetch(LIVE_KPI, { signal: AbortSignal.timeout(20_000) });
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * This plugin reads npm once at the start of a build, for the page and for `kpi.json`.
 * The daily build of the Pages workflow reads it again, so the number also follows a release with no commit here.
 * A failed read gives a warning and no measures. A blip of npm does not stop a deploy, and an old value is not a measure.
 * A second failed read in a row stops a scheduled build, so a broken read does not stay hidden.
 */
function npmEngines(): Plugin {
  return {
    name: "layout-contract-site:npm-engines",
    apply: "build",
    async buildStart() {
      const latest = latestJoint(jointFiles());
      if (latest === undefined) return;
      const { times, problems } = await npmPublishTimes({ packages: Object.keys(latest.versions).map((engine) => `${ENGINE_SCOPE}${engine}`) });
      for (const problem of problems) this.warn(problem);
      const at = new Date().toISOString().slice(0, 19);
      const holds = renovateHolds(JSON.parse(readFileSync(new URL("../../renovate.json", import.meta.url), "utf8")));
      npmRead = problems.length > 0 ? undefined : { at: `${at}Z`, engines: withHolds(enginesOnNpm(latest.versions, times), holds, at.slice(0, 10)) };
      if (npmRead === undefined && failedReadStops(env["GITHUB_EVENT_NAME"], await lastKpi())) this.error("The scheduled build did not read npm, and the last deploy also has no read of npm.");
    },
  };
}

/** This plugin puts the stamp line of `data/stamps.json` in each measured page. A stamp that does not agree with the newest joint run stops the build. */
function dataStamps(): Plugin {
  const stamps = readStamps(readFileSync(new URL("./data/stamps.json", import.meta.url), "utf8"));
  return {
    name: "layout-contract-site:data-stamps",
    buildStart() {
      const latest = latestJoint(jointFiles());
      const faults = latest === undefined ? [] : stampFaults(stamps, latest);
      if (faults.length > 0) this.error(`The file data/stamps.json is not good:\n- ${faults.join("\n- ")}`);
    },
    transformIndexHtml: (html, ctx) => withDataStamp(html, ctx.filename, stamps, npmRead?.engines),
  };
}

/** The id of the virtual module of the catalog of the joint pages. */
const CATALOG = "virtual:joint-catalog";

/** The committed list of the inputs of the corpus. */
const MANIFEST = fileURLToPath(new URL("../joint/corpus/joint-v2/corpus.json", import.meta.url));

/** This function gives the version of each engine in the build of the site. */
function engineVersions(): { readonly packing: string; readonly highways: string; readonly contract: string } {
  const require = createRequire(import.meta.url);
  const version = (name: string): string => (require(`${name}/package.json`) as { version: string }).version;
  return { packing: version("@mark1russell7/packing"), highways: version("@mark1russell7/highways"), contract: version("@mark1russell7/layout-contract") };
}

/** This function gives the data files of `data/joint/`. */
function jointFiles(): JointData[] {
  const dir = new URL("./data/joint/", import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as JointData);
}

/** This function gives the time of the commit of the build, in UTC. Two builds of one commit give the same time, so a rebuild does not make old data look new. */
function commitTime(): string {
  const seconds = Number(execFileSync("git", ["log", "-1", "--format=%ct"], { encoding: "utf8" }).trim());
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}Z`;
}

/** This function gives the input of `kpi.json`. A build without a joint run has no data to report, so it stops. */
function kpiInput(): NonNullable<ReturnType<typeof siteKpiInput>> {
  const input = siteKpiInput(jointFiles(), catalogOfTheRuns(), npmRead, [...PACK_ENTRIES, ...coverEntries()], commitTime());
  if (input === undefined) throw new Error("data/joint/ has no run, so kpi.json has no time of the data.");
  return input;
}

/**
 * This plugin gives the catalog of the joint pages as the module `virtual:joint-catalog`.
 * It reads the registries of the engines and makes each input of `joint-v2` at build time. A new strategy or option shows up after the next build.
 */
function jointCatalog(): Plugin {
  return {
    name: "layout-contract-site:joint-catalog",
    resolveId: (id) => (id === CATALOG ? `\0${CATALOG}` : null),
    load(id) {
      if (id !== `\0${CATALOG}`) return null;
      this.addWatchFile(MANIFEST);
      return `export default ${JSON.stringify(catalogOfTheRuns())};`;
    },
  };
}

// The site has 3 pages: the home page with four sections, the compare of each pair and the playground. The data comes from data/ at build time.
export default defineConfig({
  base,
  build: {
    target: "es2022",
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        compare: fileURLToPath(new URL("./compare.html", import.meta.url)),
        playground: fileURLToPath(new URL("./playground.html", import.meta.url)),
      },
    },
  },
  worker: { format: "es" },
  define: {
    __BUILD__: JSON.stringify({ sha: (env["GITHUB_SHA"] ?? "local").slice(0, 7), date: new Date().toISOString().slice(0, 10) }),
  },
  plugins: [checkData(), jointCatalog(), engineSites(), npmEngines(), dataStamps(), siteKpi(kpiInput, env)],
});
