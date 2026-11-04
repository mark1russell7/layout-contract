// The strategy spaces that the engines publish, as the files of `data/spaces/` (docs/SITE.md).
// The site does not import this module. The script `scripts/engine-spaces.ts` and the tests use it, so the engines stay out of the first bundle of the page.
import { routeSpace } from "@mark1russell7/highways";
import { packSpace } from "@mark1russell7/packing";

/** One engine that publishes a strategy space, with the path of its file in the data folder. */
export interface EngineSpace {
  readonly file: string;
  readonly packageName: string;
  readonly space: unknown;
}

/** The engines that publish a strategy space. A test of `data.test.ts` fails if the file of an engine is missing or has another space. */
export const ENGINE_SPACES: readonly EngineSpace[] = [
  { file: "spaces/packing.json", packageName: "@mark1russell7/packing", space: packSpace },
  { file: "spaces/highways.json", packageName: "@mark1russell7/highways", space: routeSpace },
];

/** This function gives the text of the data file of an engine space. The schema of the file is `site-space/1`. */
export function engineSpaceFile(engine: EngineSpace, version: string, date: string): string {
  const name = engine.packageName.split("/").at(-1);
  return `${JSON.stringify({ schema: "site-space/1", source: `${name} ${version}`, date, space: engine.space }, null, 2)}\n`;
}
