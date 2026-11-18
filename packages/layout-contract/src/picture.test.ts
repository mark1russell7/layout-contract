import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkPicture,
  LABEL_ALIGNS,
  type LayoutBox,
  type LayoutInput,
  type LayoutPicture,
  parsePicture,
  pathOf,
  type PathSegment,
  PICTURE_SCHEMA,
  pictureBounds,
  type PictureLabel,
  pictureOf,
} from "./index.ts";

// The rules of the record `layout-picture/1` of `docs/PICTURE.md`.

/** A placed input: one card with two rows, one topic, and one box with no place. A row comes before its card in the list. */
const input: LayoutInput = {
  schema: "layout-input/1",
  id: "garden",
  boxes: [
    { id: "topic", w: 80, h: 30, x: 300, y: 40, data: { kinds: ["topic"] } },
    { id: "row-1", w: 180, h: 20, x: 5, y: 29, parent: "card" },
    { id: "card", w: 190, h: 80, x: 0, y: 0 },
    { id: "row-2", w: 180, h: 20, x: 5, y: 50, parent: "card", shape: { kind: "circle", cx: 10, cy: 10, r: 10 } },
    { id: "lost", w: 10, h: 10 },
  ],
  edges: [
    { id: "e1", source: "row-1", target: "topic", data: { kind: "touches" } },
    { id: "e2", source: "row-2", target: "topic" },
  ],
};

const curve: PathSegment[] = [
  { kind: "move", to: { x: 185, y: 60 } },
  { kind: "cubic", c1: { x: 225, y: 140 }, c2: { x: 260, y: 140 }, to: { x: 300, y: 60 } },
];

const label: PictureLabel = { id: "row-1:text", box: "row-1", x: 9, y: 31, w: 120, h: 16, lines: ["Water the beans"], lineHeight: 16, font: "13px system-ui" };

/** This function gives a good picture with each kind of record. */
function sample(): LayoutPicture {
  return pictureOf(input, { routes: [{ edge: "e1", points: [{ x: 185, y: 39 }, { x: 300, y: 55 }] }, { edge: "e2", points: [], path: curve }], labels: [label] });
}

describe("pictureOf", () => {
  it("has each placed box, and each box comes immediately before its children", () => {
    const picture = pictureOf(input);
    expect(picture.schema).toBe(PICTURE_SCHEMA);
    expect(picture.id).toBe("garden");
    expect(picture.boxes.map((b) => b.id)).toEqual(["topic", "card", "row-1", "row-2"]);
    expect(picture.routes).toEqual([]);
    expect(picture.labels).toEqual([]);
  });

  it("keeps the rectangle, the parent, the shape and the data of a box, and no other field", () => {
    const picture = pictureOf({ ...input, boxes: input.boxes.map((b) => ({ ...b, rank: 3, locked: true })) });
    expect(picture.boxes).toEqual([
      { id: "topic", x: 300, y: 40, w: 80, h: 30, data: { kinds: ["topic"] } },
      { id: "card", x: 0, y: 0, w: 190, h: 80 },
      { id: "row-1", x: 5, y: 29, w: 180, h: 20, parent: "card" },
      { id: "row-2", x: 5, y: 50, w: 180, h: 20, parent: "card", shape: { kind: "circle", cx: 10, cy: 10, r: 10 } },
    ]);
  });

  it("keeps the order of the input in each level of a deep tree", () => {
    const at = { w: 1, h: 1, x: 0, y: 0 };
    const boxes: LayoutBox[] = [
      { id: "c", parent: "b", ...at },
      { id: "d", parent: "a", ...at },
      { id: "z", ...at },
      { id: "b", parent: "a", ...at },
      { id: "a", ...at },
      { id: "e", parent: "b", ...at },
    ];
    expect(pictureOf({ id: "tree", boxes }).boxes.map((b) => b.id)).toEqual(["z", "a", "d", "b", "c", "e"]);
  });

  it("gives each route the ends and the data of its edge, and the polyline of a route with no path", () => {
    const picture = sample();
    expect(picture.routes).toEqual([
      { id: "e1", source: "row-1", target: "topic", data: { kind: "touches" }, path: pathOf([{ x: 185, y: 39 }, { x: 300, y: 55 }]) },
      { id: "e2", source: "row-2", target: "topic", path: curve },
    ]);
    expect(picture.labels).toEqual([label]);
    expect(checkPicture(picture)).toEqual([]);
  });

  it("gives a RangeError for an input that has no picture", () => {
    const at = { w: 1, h: 1, x: 0, y: 0 };
    expect(() => pictureOf(input, { routes: [{ edge: "e9", points: [{ x: 0, y: 0 }] }] })).toThrow(/the route e9 has no edge in the input/);
    expect(() => pictureOf({ id: "i", boxes: [{ id: "child", parent: "lost", ...at }, { id: "lost", w: 1, h: 1 }] })).toThrow(/the box child has a place, and its parent lost has no place/);
    expect(() => pictureOf({ id: "i", boxes: [{ id: "child", parent: "no-box", ...at }] })).toThrow(RangeError);
    expect(() => pictureOf({ id: "i", boxes: [{ id: "a", parent: "b", ...at }, { id: "b", parent: "a", ...at }, { id: "c", ...at }] })).toThrow(/the parents of the boxes of the input make a loop/);
    expect(() => pictureOf({ id: "i", boxes: [{ id: "a", ...at }, { id: "a", ...at }] })).toThrow(/box a: the id is not unique/);
    expect(() => pictureOf(input, { routes: [{ edge: "e1", points: [] }] })).toThrow(/route e1: the path has no segment/);
    expect(() => pictureOf(input, { labels: [{ ...label, box: "lost" }] })).toThrow(/label row-1:text: the box lost is not a box of the picture/);
  });

  it("gives a good picture for each placed tree of boxes, with each child after its parent", () => {
    const row = fc.record({
      x: fc.integer({ min: -500, max: 500 }),
      y: fc.integer({ min: -500, max: 500 }),
      w: fc.integer({ min: 1, max: 90 }),
      h: fc.integer({ min: 1, max: 90 }),
      up: fc.option(fc.nat(), { nil: undefined }),
      placed: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(row, { maxLength: 14 }), (rows) => {
        // Box i has a parent with a smaller index, so the parents make no loop. A box below a box with no place has no place.
        const boxes: LayoutBox[] = [];
        rows.forEach((r, i) => {
          const parent = r.up === undefined || i === 0 ? undefined : boxes[r.up % i]!;
          const placed = r.placed && (parent === undefined || parent.x !== undefined);
          boxes.push({ id: `b${i}`, w: r.w, h: r.h, ...(placed ? { x: r.x, y: r.y } : {}), ...(parent === undefined ? {} : { parent: parent.id }) });
        });
        // The reversed list has each child before its parent.
        const picture = pictureOf({ id: "made", boxes: [...boxes].reverse() });
        expect(checkPicture(picture)).toEqual([]);
        expect(picture.boxes.map((b) => b.id).sort()).toEqual(boxes.filter((b) => b.x !== undefined).map((b) => b.id).sort());
        const bounds = pictureBounds(picture);
        for (const b of picture.boxes) {
          expect(bounds).toBeDefined();
          expect(b.x).toBeGreaterThanOrEqual(bounds!.x);
          expect(b.y).toBeGreaterThanOrEqual(bounds!.y);
          expect(b.x + b.w).toBeLessThanOrEqual(bounds!.x + bounds!.w);
          expect(b.y + b.h).toBeLessThanOrEqual(bounds!.y + bounds!.h);
        }
      }),
    );
  });
});

describe("pictureBounds", () => {
  it("has the boxes, the exact bounds of the paths and the labels", () => {
    // The curve of the route e2 goes below each box: its lowest point is at y = 120, and its control points are at y = 140.
    expect(pictureBounds(sample())).toEqual({ x: 0, y: 0, w: 380, h: 120 });
    const far: PictureLabel = { ...label, id: "title", x: -40, y: -30, w: 500, h: 16 };
    const { box: _box, ...title } = far;
    expect(pictureBounds({ ...sample(), labels: [title] })).toEqual({ x: -40, y: -30, w: 500, h: 150 });
  });

  it("gives undefined for a picture with no record", () => {
    expect(pictureBounds(pictureOf({ id: "empty", boxes: [] }))).toBeUndefined();
  });
});

describe("checkPicture and parsePicture", () => {
  it("accept a picture that went through JSON, and fields that the format does not know", () => {
    const picture = JSON.parse(JSON.stringify({ ...sample(), note: "a field of a later version" })) as unknown;
    expect(checkPicture(picture)).toEqual([]);
    expect(parsePicture(picture)).toBe(picture);
  });

  it("know the three places of the lines of a label", () => {
    expect(LABEL_ALIGNS).toEqual(["left", "center", "right"]);
    for (const align of LABEL_ALIGNS) expect(checkPicture({ ...sample(), labels: [{ ...label, align }] })).toEqual([]);
  });

  /** This function gives the sample with the change `change` on its record `index` of the list `list`. */
  const withRecord = (list: "boxes" | "routes" | "labels", index: number, change: Record<string, unknown>): unknown => {
    const picture = sample();
    return { ...picture, [list]: picture[list].map((r, i) => (i === index ? { ...r, ...change } : r)) };
  };

  const faults: readonly (readonly [string, unknown, string])[] = [
    ["a value that is not an object", [], "the picture is not an object"],
    ["a different schema", { ...sample(), schema: "layout-frame/1" }, "schema is not layout-picture/1"],
    ["an id that is not a string", { ...sample(), id: 4 }, "id is not a string"],
    ["no list of boxes", { ...sample(), boxes: undefined }, "boxes is not a list"],
    ["no list of routes", { ...sample(), routes: {} }, "routes is not a list"],
    ["no list of labels", { ...sample(), labels: "none" }, "labels is not a list"],
    ["a box that is not an object", { ...sample(), boxes: [null] }, "box 0 is not an object"],
    ["a box with an empty id", withRecord("boxes", 0, { id: "" }), "box 0: the id is not a string with a character"],
    ["a box id two times", withRecord("boxes", 3, { id: "card" }), "box card: the id is not unique"],
    ["a box with a place that is not finite", withRecord("boxes", 0, { x: Infinity }), "box topic: x is not a finite number"],
    ["a box with a size below 0", withRecord("boxes", 0, { h: -1 }), "box topic: h is less than 0"],
    ["a parent after its child", withRecord("boxes", 0, { parent: "card" }), "box topic: the parent card is not a box before it in the list"],
    ["a box that is its own parent", withRecord("boxes", 1, { parent: "card" }), "box card: the parent card is not a box before it in the list"],
    ["a shape that is not a region", withRecord("boxes", 0, { shape: { kind: "star" } }), "box topic: the shape is not a region"],
    ["box data that is not an object", withRecord("boxes", 0, { data: [1] }), "box topic: data is not an object"],
    ["a route id two times", withRecord("routes", 1, { id: "e1" }), "route e1: the id is not unique"],
    ["a route from a box that is not in the picture", withRecord("routes", 0, { source: "lost" }), "route e1: the source lost is not a box of the picture"],
    ["a route to no box", withRecord("routes", 0, { target: undefined }), "route e1: the target undefined is not a box of the picture"],
    ["a route with a bad path", withRecord("routes", 0, { path: [{ kind: "line", to: { x: 0, y: 0 } }] }), "route e1: segment 0 is not a move"],
    ["a route with no path", withRecord("routes", 0, { path: undefined }), "route e1: the path is not a list"],
    ["a label with a box and a route", withRecord("labels", 0, { route: "e1" }), "label row-1:text: the label has a box and a route"],
    ["a label of a route that is not in the picture", withRecord("labels", 0, { box: undefined, route: "e9" }), "label row-1:text: the route e9 is not a route of the picture"],
    ["a label with a size that is not finite", withRecord("labels", 0, { w: Number.NaN }), "label row-1:text: w is not a finite number"],
    ["a label with a line that is not a string", withRecord("labels", 0, { lines: ["a", 2] }), "label row-1:text: lines is not a list of strings"],
    ["a label with a line height of 0", withRecord("labels", 0, { lineHeight: 0 }), "label row-1:text: lineHeight is not a finite number above 0"],
    ["a label with no font", withRecord("labels", 0, { font: "" }), "label row-1:text: font is not a string with a character"],
    ["a label with a place that the format does not have", withRecord("labels", 0, { align: "justify" }), "label row-1:text: align is not one of left, center, right"],
    ["label data that is not an object", withRecord("labels", 0, { data: "x" }), "label row-1:text: data is not an object"],
  ];

  it.each(faults)("give a problem for %s", (_name, value, problem) => {
    expect(checkPicture(value)).toContain(problem);
    expect(() => parsePicture(value)).toThrow(TypeError);
  });
});
