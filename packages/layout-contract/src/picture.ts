// The picture of a layout (`docs/PICTURE.md`): the record `layout-picture/1`. It holds the placed boxes, the route of each edge and the labels.
// A viewer draws a picture. Thus it shows the output of each engine, and it imports no engine.
import type { PlacedBox } from "./balance.ts";
import type { Point, Rect, Region } from "./geometry.ts";
import type { LayoutBox, LayoutInput } from "./input.ts";
import { checkPath, pathBounds, pathOf, type PathSegment } from "./path.ts";

/** The schema of a picture. */
export const PICTURE_SCHEMA = "layout-picture/1";

/** The places of the lines of a label in its width. */
export const LABEL_ALIGNS = ["left", "center", "right"] as const;

/** The place of the lines of a label in its width. */
export type LabelAlign = (typeof LABEL_ALIGNS)[number];

/** One box of a picture: its rectangle in the coordinates of the picture. A child does not have coordinates relative to its parent. */
export interface PictureBox extends PlacedBox {
  /** The box that contains this box. A parent comes before its children in the list. */
  readonly parent?: string;
  /** The region of the box, relative to its top-left corner, as `LayoutBox.shape`. Without it, the box is its rectangle. */
  readonly shape?: Region;
  /** The free data of the box. A viewer chooses the look of the box from it. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** The route of one edge: the two boxes of the edge and the path that a renderer draws. */
export interface PictureRoute {
  /** The id of the edge. */
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** The path from the source to the target. A polyline is a path of lines (`pathOf`). */
  readonly path: readonly PathSegment[];
  /** The free data of the edge. A viewer chooses the look of the route from it. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * One label: the lines of a text that an engine measured, at a place. A renderer draws the lines with `font`, and it does not break them again.
 * The rectangle is the area of the text. Line `i` is in the band that starts at `y + i * lineHeight`, and the band has the height `lineHeight`.
 */
export interface PictureLabel extends PlacedBox {
  /** The box that the label names. A label has at most one of `box` and `route`. */
  readonly box?: string;
  /** The route that the label names. */
  readonly route?: string;
  readonly lines: readonly string[];
  /** The height of each line. A finite number above 0. */
  readonly lineHeight: number;
  /** The font of the measure, as the CSS property `font`. */
  readonly font: string;
  /** The place of each line in the width `w`. The default is `left`. */
  readonly align?: LabelAlign;
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * A picture: the boxes, the routes and the labels of a layout, in the coordinates of the picture.
 * Each list is in the order of the paint, so its first record is at the back. A viewer chooses the order of the three lists.
 */
export interface LayoutPicture {
  readonly schema: typeof PICTURE_SCHEMA;
  /** The id of the input of the picture. */
  readonly id?: string;
  readonly boxes: readonly PictureBox[];
  readonly routes: readonly PictureRoute[];
  readonly labels: readonly PictureLabel[];
}

/**
 * A route of a router, for `pictureOf`: the id of its edge and the points of its polyline. A `Route` of `highways` has this form.
 * With `path`, the picture has that path, for example a curve through the points.
 */
export interface PictureRouteSource {
  readonly edge: string;
  readonly points: readonly Point[];
  readonly path?: readonly PathSegment[];
}

/** The parts of a picture that an input does not hold, for `pictureOf`. */
export interface PictureParts {
  readonly routes?: readonly PictureRouteSource[];
  readonly labels?: readonly PictureLabel[];
}

type Fields = Record<string, unknown>;

const isFields = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);

const REGION_KINDS: readonly unknown[] = ["rect", "polygon", "circle", "ellipse"];

/** This function gives the list `v`. A value that is not a list adds a problem and gives an empty list. */
function listOf(out: string[], v: unknown, name: string): readonly unknown[] {
  if (Array.isArray(v)) return v;
  out.push(`${name} is not a list`);
  return [];
}

/**
 * This function gives the fields and the name of record `i` of a list, or `undefined` for a record without a good id.
 * The name is the kind and the id, for the text of a problem. An id two times in the list adds a problem.
 */
function recordOf(out: string[], kind: string, v: unknown, i: number, seen: Set<string>): { fields: Fields; id: string; name: string } | undefined {
  if (!isFields(v)) {
    out.push(`${kind} ${i} is not an object`);
    return undefined;
  }
  const id = v["id"];
  if (typeof id !== "string" || id === "") {
    out.push(`${kind} ${i}: the id is not a string with a character`);
    return undefined;
  }
  if (seen.has(id)) out.push(`${kind} ${id}: the id is not unique`);
  return { fields: v, id, name: `${kind} ${id}` };
}

/** This function adds the problems of the rectangle of a record: a value that is not finite, or a size less than 0. */
function rectProblems(out: string[], name: string, v: Fields): void {
  for (const key of ["x", "y", "w", "h"] as const) {
    const n = v[key];
    if (typeof n !== "number" || !Number.isFinite(n)) out.push(`${name}: ${key} is not a finite number`);
    else if (n < 0 && (key === "w" || key === "h")) out.push(`${name}: ${key} is less than 0`);
  }
}

/** This function adds a problem for a field `data` that is not an object. */
function dataProblems(out: string[], name: string, v: Fields): void {
  if (v["data"] !== undefined && !isFields(v["data"])) out.push(`${name}: data is not an object`);
}

/**
 * This function gives the problems of one `layout-picture/1` value. An empty list means a good picture.
 * Each id occurs one time in its list, each number is finite, and a size is 0 or more. A parent is a box before its child in the list.
 * The source and the target of a route are boxes of the picture, and its path has no problem of `checkPath`.
 *
 * A label has lines of text, a line height above 0 and a font. Its `box` or its `route` is in the picture, and it does not have the two.
 * The check accepts fields that the format does not know.
 */
export function checkPicture(value: unknown): string[] {
  if (!isFields(value)) return ["the picture is not an object"];
  const out: string[] = [];
  if (value["schema"] !== PICTURE_SCHEMA) out.push(`schema is not ${PICTURE_SCHEMA}`);
  if (value["id"] !== undefined && typeof value["id"] !== "string") out.push("id is not a string");
  const boxIds = new Set<string>();
  listOf(out, value["boxes"], "boxes").forEach((v, i) => {
    const box = recordOf(out, "box", v, i, boxIds);
    if (box === undefined) return;
    rectProblems(out, box.name, box.fields);
    const parent = box.fields["parent"];
    if (parent !== undefined && (typeof parent !== "string" || parent === box.id || !boxIds.has(parent))) out.push(`${box.name}: the parent ${String(parent)} is not a box before it in the list`);
    const shape = box.fields["shape"];
    if (shape !== undefined && !(isFields(shape) && REGION_KINDS.includes(shape["kind"]))) out.push(`${box.name}: the shape is not a region`);
    dataProblems(out, box.name, box.fields);
    boxIds.add(box.id);
  });
  const routeIds = new Set<string>();
  listOf(out, value["routes"], "routes").forEach((v, i) => {
    const route = recordOf(out, "route", v, i, routeIds);
    if (route === undefined) return;
    for (const key of ["source", "target"] as const) {
      const end = route.fields[key];
      if (typeof end !== "string" || !boxIds.has(end)) out.push(`${route.name}: the ${key} ${String(end)} is not a box of the picture`);
    }
    for (const problem of checkPath(route.fields["path"])) out.push(`${route.name}: ${problem}`);
    dataProblems(out, route.name, route.fields);
    routeIds.add(route.id);
  });
  const labelIds = new Set<string>();
  listOf(out, value["labels"], "labels").forEach((v, i) => {
    const label = recordOf(out, "label", v, i, labelIds);
    if (label === undefined) return;
    const f = label.fields;
    rectProblems(out, label.name, f);
    if (f["box"] !== undefined && f["route"] !== undefined) out.push(`${label.name}: the label has a box and a route`);
    if (f["box"] !== undefined && (typeof f["box"] !== "string" || !boxIds.has(f["box"]))) out.push(`${label.name}: the box ${String(f["box"])} is not a box of the picture`);
    if (f["route"] !== undefined && (typeof f["route"] !== "string" || !routeIds.has(f["route"]))) out.push(`${label.name}: the route ${String(f["route"])} is not a route of the picture`);
    const lines = f["lines"];
    if (!Array.isArray(lines) || !lines.every((line) => typeof line === "string")) out.push(`${label.name}: lines is not a list of strings`);
    const lineHeight = f["lineHeight"];
    if (typeof lineHeight !== "number" || !Number.isFinite(lineHeight) || lineHeight <= 0) out.push(`${label.name}: lineHeight is not a finite number above 0`);
    if (typeof f["font"] !== "string" || f["font"] === "") out.push(`${label.name}: font is not a string with a character`);
    if (f["align"] !== undefined && !(LABEL_ALIGNS as readonly unknown[]).includes(f["align"])) out.push(`${label.name}: align is not one of ${LABEL_ALIGNS.join(", ")}`);
    dataProblems(out, label.name, f);
    labelIds.add(label.id);
  });
  return out;
}

/**
 * This function reads one `layout-picture/1` value, for example a parsed JSON document.
 * It throws a `TypeError` with the problems of `checkPicture`.
 */
export function parsePicture(value: unknown): LayoutPicture {
  const problems = checkPicture(value);
  if (problems.length > 0) throw new TypeError(`The value is not a layout-picture/1: ${problems.join(", ")}.`);
  return value as LayoutPicture;
}

/** This function gives the box of a picture for a placed box of an input. */
function pictureBox(box: LayoutBox, x: number, y: number): PictureBox {
  return {
    id: box.id,
    x,
    y,
    w: box.w,
    h: box.h,
    ...(box.parent === undefined ? {} : { parent: box.parent }),
    ...(box.shape === undefined ? {} : { shape: box.shape }),
    ...(box.data === undefined ? {} : { data: box.data }),
  };
}

/**
 * This function makes the picture of a placed input. Each box with `x` and `y` is in the picture, and a box with no place is not.
 * The coordinates of each box are those of the input. The order is the order of the input, but each box comes immediately before its children.
 *
 * Each route gets the source, the target and the data of its edge in the input. A route with no `path` gets the polyline of its points.
 * The labels of `parts` go into the picture with no change.
 * A `RangeError` comes for a placed box below a box with no place, and for a loop of parents.
 * It comes also for a route with no edge in the input, and for each problem of `checkPicture`.
 */
export function pictureOf(input: Pick<LayoutInput, "id" | "boxes" | "edges">, parts: PictureParts = {}): LayoutPicture {
  const placed = input.boxes.filter((b) => b.x !== undefined && b.y !== undefined);
  const ids = new Set(placed.map((b) => b.id));
  const roots: LayoutBox[] = [];
  const children = new Map<string, LayoutBox[]>();
  for (const b of placed) {
    if (b.parent === undefined) {
      roots.push(b);
      continue;
    }
    if (!ids.has(b.parent)) throw new RangeError(`layout-picture: the box ${b.id} has a place, and its parent ${b.parent} has no place in the input.`);
    const list = children.get(b.parent);
    if (list === undefined) children.set(b.parent, [b]);
    else list.push(b);
  }
  const boxes: PictureBox[] = [];
  const stack = roots.reverse();
  for (let b = stack.pop(); b !== undefined; b = stack.pop()) {
    boxes.push(pictureBox(b, b.x!, b.y!));
    const list = children.get(b.id);
    if (list !== undefined) for (let i = list.length - 1; i >= 0; i--) stack.push(list[i]!);
  }
  if (boxes.length < placed.length) throw new RangeError("layout-picture: the parents of the boxes of the input make a loop.");
  const edges = new Map((input.edges ?? []).map((e) => [e.id, e]));
  const routes = (parts.routes ?? []).map((r): PictureRoute => {
    const edge = edges.get(r.edge);
    if (edge === undefined) throw new RangeError(`layout-picture: the route ${r.edge} has no edge in the input.`);
    return { id: edge.id, source: edge.source, target: edge.target, path: r.path ?? pathOf(r.points), ...(edge.data === undefined ? {} : { data: edge.data }) };
  });
  const picture: LayoutPicture = { schema: PICTURE_SCHEMA, id: input.id, boxes, routes, labels: [...(parts.labels ?? [])] };
  const problems = checkPicture(picture);
  if (problems.length > 0) throw new RangeError(`layout-picture: ${problems.join(", ")}.`);
  return picture;
}

/**
 * This function gives the bounding box of a picture: its boxes, the exact bounds of its paths and its labels.
 * A picture with no record gives `undefined`. The picture must be good (`checkPicture`).
 */
export function pictureBounds(picture: LayoutPicture): Rect | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (r: Rect): void => {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  };
  for (const b of picture.boxes) add(b);
  for (const r of picture.routes) add(pathBounds(r.path));
  for (const l of picture.labels) add(l);
  return x0 === Infinity ? undefined : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
