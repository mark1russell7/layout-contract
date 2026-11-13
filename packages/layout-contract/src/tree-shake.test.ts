import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vitest";
import { SQUARE_COMPACTNESS } from "./cell.ts";
import { CURVE_MAX_SIDE } from "./curves.ts";

// A bundler keeps each top-level call that it cannot prove free of side effects, also when no code uses its value.
// Each top-level call of the package has the mark /* @__PURE__ */, so a consumer gets only the code that it imports.
// Before the marks (0.3.2), each subpath bundle of packing got approximately 6.8 kB gzip more (packing#257).

/**
 * This plugin resolves each source file itself, so the bundler does not read the field `sideEffects` of `package.json`. The file
 * `build/index.js` holds all the modules of the root, so that field cannot remove an unused module from it. Only the marks remove its code.
 * Before 0.10.1, the bundles of the source with the field passed, but the curves and the measure registry stayed in each bundle of `build/`.
 */
const oneFile: Plugin = {
  name: "one-file",
  setup(b) {
    b.onResolve({ filter: /\.ts$/ }, (args) => ({ path: isAbsolute(args.path) ? args.path : resolve(args.resolveDir, args.path) }));
  },
};

/** This function gives the minified code of a bundle that imports `names` from the entry `entry` of the package. */
async function bundleOf(entry: string, names: readonly string[], plugins: Plugin[] = []): Promise<string> {
  const file = fileURLToPath(new URL(entry, import.meta.url));
  const out = await build({
    stdin: { contents: `export { ${names.join(", ")} } from ${JSON.stringify(file)};`, resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
    plugins,
  });
  return out.outputFiles[0]!.text;
}

describe("the tree shaking of the package", () => {
  it("gives a bundle of a few bytes for an import of one constant of the root", { timeout: 30_000 }, async () => {
    const code = await bundleOf("./index.ts", ["EPS"]);
    expect(code).not.toMatch(/freeze/);
    expect(code.length).toBeLessThan(200);
  });

  it("gives a bundle of a few bytes for an import of one constant of /text", { timeout: 30_000 }, async () => {
    const code = await bundleOf("./text.ts", ["TEXT_UNITS"]);
    expect(code).not.toMatch(/freeze/);
    expect(code.length).toBeLessThan(200);
  });

  it("gives a bundle of a few bytes for an import of one constant of the root, also with all modules in one file", { timeout: 30_000 }, async () => {
    const code = await bundleOf("./index.ts", ["EPS"], [oneFile]);
    expect(code).not.toMatch(/freeze|RegExp|MEASURE|joint/);
    expect(code.length).toBeLessThan(200);
  });

  it("gives a bundle of a few bytes for an import of one constant of /text, also with all modules in one file", { timeout: 30_000 }, async () => {
    const code = await bundleOf("./text.ts", ["TEXT_UNITS"], [oneFile]);
    expect(code).not.toMatch(/freeze/);
    expect(code.length).toBeLessThan(200);
  });

  // A bundler keeps a top-level division or power, so these constants are literals
  it("keeps the values of the constants that are literals", () => {
    expect(SQUARE_COMPACTNESS).toBe(4 / Math.PI);
    expect(CURVE_MAX_SIDE).toBe(2 ** 26);
  });
});
