// This script writes the file of each engine space in `data/spaces/` from the installed engines (docs/SITE.md).
//   pnpm --filter @layout-contract/site run data:spaces -- <YYYY-MM-DD>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_SPACES, engineSpaceFile } from "../src/engine-spaces.ts";

const date = process.argv.at(-1) ?? "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Give the date as YYYY-MM-DD.");

for (const engine of ENGINE_SPACES) {
  const manifest = fileURLToPath(new URL(`../node_modules/${engine.packageName}/package.json`, import.meta.url));
  const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
  const target = fileURLToPath(new URL(`../data/${engine.file}`, import.meta.url));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, engineSpaceFile(engine, version, date));
  console.log(`${engine.file}: ${version}`);
}
