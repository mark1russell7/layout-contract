import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// A bundler keeps each top-level call that it cannot prove free of side effects, also when no code uses its value.
// Each top-level call of the package has the mark /* @__PURE__ */, so a consumer gets only the code that it imports.
// Before the marks (0.3.2), each subpath bundle of packing got approximately 6.8 kB gzip more (packing#257).

/** This function gives the minified code of a bundle that imports `names` from the entry `entry` of the package. */
async function bundleOf(entry: string, names: readonly string[]): Promise<string> {
  const file = fileURLToPath(new URL(entry, import.meta.url));
  const out = await build({
    stdin: { contents: `export { ${names.join(", ")} } from ${JSON.stringify(file)};`, resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
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
});
