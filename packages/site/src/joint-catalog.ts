// The catalog of the joint pages. The build makes it from the engines and the joint package (`src/build-catalog.ts`).
import raw from "virtual:joint-catalog";
import type { JointCatalog } from "./catalog.ts";

/** The catalog of the joint pages, with the joint space of `jointSpace`. The page does not import the engines. */
export const catalog: JointCatalog = raw;
