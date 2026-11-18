// The boxes in boxes of an input, with the engines (`docs/NESTED.md`). A router of `highways` does not go into a box.
// It routes the flat input of `flattenInput`, and `pictureOf` puts each route between the inner boxes of the input.
import { inputGraph } from "@mark1russell7/highways";
import { checkPicture, flatPortId, flattenInput, type LayoutBox, type LayoutInput, pictureOf, type Point, portPoint, type Side } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { routerEntryOf, routerOf, ROUTERS } from "./runner.ts";

/** Two cards with rows, and one box with no parent below the space between them. */
const input: LayoutInput = {
  schema: "layout-input/1",
  id: "nested",
  boxes: [
    { id: "west", w: 200, h: 120, x: 0, y: 0 },
    { id: "west-1", parent: "west", w: 180, h: 30, x: 10, y: 20 },
    { id: "west-2", parent: "west", w: 180, h: 30, x: 10, y: 70 },
    { id: "pill", w: 100, h: 40, x: 450, y: 300 },
    { id: "east", w: 200, h: 120, x: 800, y: 40 },
    { id: "east-1", parent: "east", w: 180, h: 30, x: 810, y: 60 },
  ],
  edges: [
    { id: "a", source: "west-1", target: "pill", data: { kind: "touches" } },
    { id: "b", source: "west-2", target: "east-1" },
    { id: "c", source: "east-1", target: "pill" },
    { id: "d", source: "west-1", target: "west-2" },
  ],
};

/** The inner end of each route: the edge, the end of the polyline, the inner box, its top box and the side of its port. */
const INNER_ENDS: readonly (readonly [edge: string, end: "first" | "last", inner: string, top: string, side: Side])[] = [
  ["a", "first", "west-1", "west", "right"],
  ["b", "first", "west-2", "west", "right"],
  ["b", "last", "east-1", "east", "left"],
  ["c", "first", "east-1", "east", "left"],
];

const byId = new Map(input.boxes.map((box) => [box.id, box]));

/** This function gives a box of the input with its place. */
function placed(id: string): LayoutBox & Point {
  return byId.get(id) as LayoutBox & Point;
}

describe.each(["straight", "corners"])("the flat input of boxes in boxes with the router %s", (name) => {
  const flat = flattenInput(input);
  const result = routerOf(routerEntryOf(name)).route(inputGraph(flat as unknown as Parameters<typeof inputGraph>[0]));
  const routes = new Map(result.routes.map((route) => [route.edge, route]));

  it("is a router of the joint bench", () => {
    expect(ROUTERS).toContain(name);
  });

  it("gets one route for each edge between two top boxes", () => {
    expect(flat.boxes.map((box) => box.id)).toEqual(["west", "pill", "east"]);
    // The edge `d` is in one card, so the router does not get it.
    expect(result.routes.map((route) => route.edge).sort()).toEqual(["a", "b", "c"]);
  });

  it("starts each route of an inner box at the port of that box, at the middle of the box on the side of its card", () => {
    for (const [edge, end, inner, top, side] of INNER_ENDS) {
      const card = flat.boxes.find((box) => box.id === top)!;
      const port = card.ports!.find((p) => p.id === flatPortId(inner, side))!;
      const at = portPoint(card, port)!;
      const points = routes.get(edge)!.points;
      const point = end === "first" ? points[0]! : points[points.length - 1]!;
      expect(point.x, `${edge} ${end} x`).toBeCloseTo(card.x! + at.x, 9);
      expect(point.y, `${edge} ${end} y`).toBeCloseTo(card.y! + at.y, 9);
      // The point is on the border of the card, at the middle of the inner box.
      const row = placed(inner);
      expect(point.x, `${edge} ${end} side`).toBeCloseTo(side === "right" ? card.x! + card.w : card.x!, 9);
      expect(point.y, `${edge} ${end} middle`).toBeCloseTo(row.y + row.h / 2, 9);
    }
  });

  it("gives a picture with each route between the inner boxes of the input", () => {
    const picture = pictureOf(input, { routes: result.routes });
    expect(checkPicture(picture)).toEqual([]);
    expect(picture.boxes.map((box) => box.id)).toEqual(["west", "west-1", "west-2", "pill", "east", "east-1"]);
    const ends = new Map(picture.routes.map((route) => [route.id, [route.source, route.target, route.data]]));
    expect(ends.get("a")).toEqual(["west-1", "pill", { kind: "touches" }]);
    expect(ends.get("b")).toEqual(["west-2", "east-1", undefined]);
    expect(ends.get("c")).toEqual(["east-1", "pill", undefined]);
  });
});
