// The catalog of the joint pages, with the joint space. The build makes the rest of the catalog from the engines.
import { productSpace } from "@mark1russell7/layout-contract";
import raw from "virtual:joint-catalog";
import type { JointCatalog } from "./catalog.ts";

/** The catalog of the joint pages. The joint space is `productSpace` of the pack space and the route space. */
export const catalog: JointCatalog = { ...raw, joint: productSpace(raw.pack, raw.route, "joint") };
