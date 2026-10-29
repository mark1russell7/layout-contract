import { defineConfig } from "tsdown";

// The build of the package for npm: an ES module for each entry and its declarations in build/. The workspace uses the source.
export default defineConfig({
  entry: ["src/index.ts", "src/text.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
