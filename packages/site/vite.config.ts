import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { coverEntries, PACK_ENTRIES } from "@layout-contract/joint/browser";
import { siteKpi } from "@mark1russell7/site-pages/vite";
import { defineConfig, type Plugin } from "vite";
import { buildCatalog } from "./src/build-catalog.ts";
import { checkDataFile, type JointData, latestJoint } from "./src/data.ts";
import { siteKpiInput } from "./src/kpi.ts";
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
    transformIndexHtml: (html, ctx) => withDataStamp(html, ctx.filename, stamps),
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

/** This function gives the input of `kpi.json`. A build without a joint run has no data to report, so it stops. */
function kpiInput(): NonNullable<ReturnType<typeof siteKpiInput>> {
  const input = siteKpiInput(jointFiles(), buildCatalog(readFileSync(MANIFEST, "utf8"), engineVersions(), hasCoverRun()), engineVersions(), [...PACK_ENTRIES, ...coverEntries()]);
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
      return `export default ${JSON.stringify(buildCatalog(readFileSync(MANIFEST, "utf8"), engineVersions(), hasCoverRun()))};`;
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
  plugins: [checkData(), jointCatalog(), engineSites(), dataStamps(), siteKpi(kpiInput, env)],
});
