import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { buildCatalog } from "./src/build-catalog.ts";
import { checkDataFile } from "./src/data.ts";
import { withEngineLinks } from "./src/links.ts";

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

/** The id of the virtual module of the catalog of the joint pages. */
const CATALOG = "virtual:joint-catalog";

/**
 * This plugin gives the catalog of the joint pages as the module `virtual:joint-catalog`.
 * It reads the registries of the engines and makes each input of `joint-v2` at build time. A new strategy or option shows up after the next build.
 */
function jointCatalog(): Plugin {
  const manifest = fileURLToPath(new URL("../joint/corpus/joint-v2/corpus.json", import.meta.url));
  return {
    name: "layout-contract-site:joint-catalog",
    resolveId: (id) => (id === CATALOG ? `\0${CATALOG}` : null),
    load(id) {
      if (id !== `\0${CATALOG}`) return null;
      this.addWatchFile(manifest);
      const require = createRequire(import.meta.url);
      const version = (name: string): string => (require(`${name}/package.json`) as { version: string }).version;
      const versions = { packing: version("@mark1russell7/packing"), highways: version("@mark1russell7/highways"), contract: version("@mark1russell7/layout-contract") };
      return `export default ${JSON.stringify(buildCatalog(readFileSync(manifest, "utf8"), versions))};`;
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
  plugins: [checkData(), jointCatalog(), engineSites()],
});
