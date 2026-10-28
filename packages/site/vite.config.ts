import { defineConfig, type Plugin } from "vite";
import { checkDataFile } from "./src/data.ts";

// The Pages workflow sets SITE_BASE to "/layout-contract". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";

/** This plugin examines each data file that the site imports. A bad file stops the build with its problems. */
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

// The site has one page with four sections. The data comes from data/ at build time.
export default defineConfig({
  base,
  build: { target: "es2022" },
  define: {
    __BUILD__: JSON.stringify({ sha: (env["GITHUB_SHA"] ?? "local").slice(0, 7), date: new Date().toISOString().slice(0, 10) }),
  },
  plugins: [checkData()],
});
