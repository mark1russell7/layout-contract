// The picture of a routed layout (`docs/PICTURE.md`). `pictureOf` of `layout-contract` takes the routes of a router of `highways` with no change.
// Each curve type of `highways` gives a good path. The types of this file hold the two claims too: a `Route` is a route source, and a curve is a path.
import { CURVE_TYPES, curveOf, inputGraph } from "@mark1russell7/highways";
import { checkPath, checkPicture, type LayoutInput, pathBounds, PICTURE_SCHEMA, pictureBounds, pictureOf, type PictureRouteSource, samplePath } from "@mark1russell7/layout-contract";
import { packWith, UnsupportedCell } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointInput, jointSpecs, SET } from "./corpus.ts";
import { PACK_ENTRIES, packedInput, packInputOf, routerEntryOf, routerOf, ROUTERS } from "./runner.ts";

/** The largest count of boxes of the input of this test. */
const MAX_BOXES = 30;

/** This function gives the first input of the set with edges and at most `MAX_BOXES` boxes, after the first pack entry that supports it. */
function placedInput(): LayoutInput {
  for (const spec of jointSpecs(SET)) {
    const { input } = jointInput(spec, spec.seeds[0]!, SET);
    if (input.boxes.length > MAX_BOXES || (input.edges?.length ?? 0) === 0) continue;
    const pack = packInputOf(input);
    for (const entry of PACK_ENTRIES) {
      try {
        return packedInput(input, packWith(entry.strategy, pack, entry.options, input.seed ?? 0), entry.id).input;
      } catch (error) {
        if (!(error instanceof UnsupportedCell)) throw error;
      }
    }
  }
  throw new RangeError("No input of the set has a pack.");
}

describe("the picture of a routed layout", () => {
  const input = placedInput();
  const result = routerOf(routerEntryOf(ROUTERS[0]!)).route(inputGraph(input as unknown as Parameters<typeof inputGraph>[0]));

  it("takes the routes of a router with no change", () => {
    expect(result.routes.length).toBeGreaterThan(0);
    const picture = pictureOf(input, { routes: result.routes });
    expect(checkPicture(picture)).toEqual([]);
    expect(picture.schema).toBe(PICTURE_SCHEMA);
    expect(picture.boxes.map((b) => b.id).sort()).toEqual(input.boxes.map((b) => b.id).sort());
    expect(picture.routes.map((r) => r.id)).toEqual(result.routes.map((r) => r.edge));
    for (const [i, route] of picture.routes.entries()) {
      const edge = input.edges!.find((e) => e.id === route.id)!;
      expect([route.source, route.target]).toEqual([edge.source, edge.target]);
      expect(samplePath(route.path)).toEqual(result.routes[i]!.points);
    }
  });

  it("gives a good path for each curve type of highways", () => {
    for (const type of CURVE_TYPES) {
      const routes: PictureRouteSource[] = result.routes.map((r) => ({ edge: r.edge, points: r.points, path: curveOf(r.points, { type }) }));
      for (const r of routes) expect(checkPath(r.path), `${type} ${r.edge}`).toEqual([]);
      const picture = pictureOf(input, { routes });
      expect(checkPicture(picture), type).toEqual([]);
      // The picture has each curve: its bounds contain the bounds of each path.
      const bounds = pictureBounds(picture)!;
      for (const route of picture.routes) {
        const b = pathBounds(route.path);
        expect(b.x).toBeGreaterThanOrEqual(bounds.x);
        expect(b.y).toBeGreaterThanOrEqual(bounds.y);
        expect(b.x + b.w).toBeLessThanOrEqual(bounds.x + bounds.w + 1e-9);
        expect(b.y + b.h).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-9);
      }
    }
  });
});
