// The boxes in boxes of an input (`docs/NESTED.md`). The field `parent` of a box makes a tree of boxes.
// A layout of the children of one box reads the tree. A router of the top boxes reads a flat input.
import { rectCenter, type Point, type Rect, type Side } from "./geometry.ts";
import type { LayoutBox, LayoutEdge, LayoutInput, Port } from "./input.ts";

/** One box of a tree of boxes, with the boxes that it contains. */
export interface BoxNode {
  readonly box: LayoutBox;
  /** The boxes that have this box as their `parent`, in the order of the input. */
  readonly children: readonly BoxNode[];
}

/** The facts of the tree of a list of boxes. */
interface Levels {
  readonly roots: readonly BoxNode[];
  /** The count of the boxes above each box. */
  readonly depth: ReadonlyMap<string, number>;
  /** The box with no parent that contains each box. */
  readonly top: ReadonlyMap<string, string>;
}

/** This function gives the tree of a list of boxes, with the depth and the top box of each box. `name` is the function in the text of an error. */
function levelsOf(boxes: readonly LayoutBox[], name: string): Levels {
  const nodes = new Map<string, { box: LayoutBox; children: BoxNode[] }>();
  for (const box of boxes) {
    if (nodes.has(box.id)) throw new RangeError(`${name}: the id ${box.id} is two times in the boxes.`);
    nodes.set(box.id, { box, children: [] });
  }
  const roots: BoxNode[] = [];
  for (const node of nodes.values()) {
    const { id, parent } = node.box;
    if (parent === undefined) {
      roots.push(node);
      continue;
    }
    const above = nodes.get(parent);
    if (above === undefined) throw new RangeError(`${name}: the parent ${parent} of the box ${id} is not a box of the input.`);
    above.children.push(node);
  }
  const depth = new Map<string, number>();
  const top = new Map<string, string>();
  for (const root of roots) {
    const stack: (readonly [BoxNode, number])[] = [[root, 0]];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      const [node, level] = next;
      depth.set(node.box.id, level);
      top.set(node.box.id, root.box.id);
      for (const child of node.children) stack.push([child, level + 1]);
    }
  }
  // A box in a loop of parents has no box with no parent above it.
  if (depth.size < nodes.size) throw new RangeError(`${name}: the parents of the boxes make a loop.`);
  return { roots, depth, top };
}

/**
 * This function gives the tree of the boxes of an input. Each box with no `parent` is a root, in the order of the input.
 * The children of a box are in the order of the input too. An adapter of a layout engine makes the nodes of the engine from this tree.
 *
 * A `RangeError` comes for an id that is two times in the list, and for a parent that is not in the list.
 * It comes also for a loop of parents.
 */
export function boxTree(boxes: readonly LayoutBox[]): BoxNode[] {
  return [...levelsOf(boxes, "boxTree").roots];
}

/**
 * This function gives the top box of each box of an input, by the id of the box. The top box of a box is the box with no `parent` that contains it.
 * A box with no parent is its own top box.
 *
 * A `RangeError` comes for each list that `boxTree` refuses.
 */
export function topBoxes(boxes: readonly LayoutBox[]): Map<string, string> {
  return new Map(levelsOf(boxes, "topBoxes").top);
}

/**
 * This function gives the edges of an input between boxes with the same parent. A layout of the children of one box reads them, for example as springs.
 *
 * - An edge between two boxes with the same parent stays as it is. Two boxes with no parent have the same parent.
 * - Each other edge goes up the tree: its ends become the two boxes with the same parent that contain its ends.
 * - An end that goes up loses its port. The edge keeps its id and its `data`.
 * - An edge has no result if one end contains the other end, or if the two ends are one box.
 * - An edge with an end that is not a box of the input has no result.
 *
 * The result has the order of the edges of the input. A `RangeError` comes for each list of boxes that `boxTree` refuses.
 */
export function siblingEdges(input: Pick<LayoutInput, "boxes" | "edges">): LayoutEdge[] {
  const { depth } = levelsOf(input.boxes, "siblingEdges");
  const parent = new Map(input.boxes.map((box) => [box.id, box.parent]));
  const out: LayoutEdge[] = [];
  for (const edge of input.edges ?? []) {
    let a = edge.source;
    let b = edge.target;
    let da = depth.get(a);
    let db = depth.get(b);
    if (da === undefined || db === undefined) continue;
    for (; da > db; da--) a = parent.get(a)!;
    for (; db > da; db--) b = parent.get(b)!;
    // At the same depth, the same box means that one end contains the other end.
    if (a === b) continue;
    while (parent.get(a) !== parent.get(b)) {
      a = parent.get(a)!;
      b = parent.get(b)!;
    }
    out.push({
      id: edge.id,
      source: a,
      target: b,
      ...(a === edge.source && edge.sourcePort !== undefined ? { sourcePort: edge.sourcePort } : {}),
      ...(b === edge.target && edge.targetPort !== undefined ? { targetPort: edge.targetPort } : {}),
      ...(edge.data === undefined ? {} : { data: edge.data }),
    });
  }
  return out;
}

/** The options of `flattenInput`. */
export interface FlattenOptions {
  /**
   * The sides of a top box that can hold the port of a box inside it. The default is `right` and `left`, for rows in a column.
   * The first side of the list wins a tie. With an empty list, an edge of a box inside a top box goes to the top box with no port.
   */
  readonly sides?: readonly Side[];
}

/** The sides of `flattenInput` with no option: the two ends of a row. */
export const FLATTEN_SIDES: readonly Side[] = /* @__PURE__ */ Object.freeze(["right", "left"] as const);

/** The direction out of each side of a box. The y axis points down. */
const OUT: Readonly<Record<Side, Point>> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/** This function gives the rectangle of a placed box. A `RangeError` comes for a box with no place. */
function placeOf(box: LayoutBox): Rect {
  if (box.x === undefined || box.y === undefined) throw new RangeError(`flattenInput: the box ${box.id} has no place, and the port of a box in a top box needs it.`);
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

/** This function gives the id of the port that `flattenInput` makes for a box inside a top box, on a side of the top box. */
export function flatPortId(box: string, side: Side): string {
  return `${box}:${side}`;
}

/** This function gives the share `part` of `whole`, from 0 to 1. A whole of 0 gives the middle. */
function shareOf(part: number, whole: number): number {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0.5;
}

/**
 * This function gives the input of the top boxes of an input, for a router that does not go into a box.
 * The top boxes are the boxes with no `parent`. Each top box is one obstacle, and a box inside it becomes a port on its border.
 *
 * - An edge between two top boxes stays as it is.
 * - An edge with an end inside a top box goes to that top box, at a port. The port is on the side that points most to the top box of the other end.
 * - The port is at the middle of the inner box along that side. Its id comes from `flatPortId`. Only an end of an edge makes a port.
 * - An end that moves to a top box loses the port that it had.
 * - An edge has no result if its two ends are in one top box, or if an end is not a box of the input.
 *
 * Each edge keeps its id and its `data`. Thus a route of the flat input is the route of the edge with the same id in the input.
 * `pictureOf` puts that route between the inner boxes.
 *
 * The other fields of the input stay. The result has no `hash`, because it is a different document, and no `pairGaps` entry of an inner box.
 * A port needs the place of its inner box and of the two top boxes. A `RangeError` comes for a box with no place there.
 * It comes also for a top box that has a port with the id of a new port. Each list of boxes that `boxTree` refuses gives one too.
 */
export function flattenInput(input: LayoutInput, options: FlattenOptions = {}): LayoutInput {
  const sides = options.sides ?? FLATTEN_SIDES;
  const { top } = levelsOf(input.boxes, "flattenInput");
  const byId = new Map(input.boxes.map((box) => [box.id, box]));
  const ports = new Map<string, Port[]>();
  const made = new Set<string>();

  /** This function gives the end of an edge in the flat input: the top box of `id`, and its port. `other` is the top box of the other end. */
  const endOf = (id: string, own: string, other: string, port: string | undefined): { readonly box: string; readonly port?: string } => {
    if (own === id) return port === undefined ? { box: id } : { box: id, port };
    if (sides.length === 0) return { box: own };
    const card = byId.get(own)!;
    const outer = placeOf(card);
    const from = rectCenter(outer);
    const to = rectCenter(placeOf(byId.get(other)!));
    let side = sides[0]!;
    let most = -Infinity;
    for (const s of sides) {
      const toward = (to.x - from.x) * OUT[s].x + (to.y - from.y) * OUT[s].y;
      if (toward > most) {
        most = toward;
        side = s;
      }
    }
    const name = flatPortId(id, side);
    if (!made.has(name)) {
      if (card.ports?.some((p) => p.id === name) === true) throw new RangeError(`flattenInput: the box ${own} has a port with the id ${name} of a new port.`);
      const middle = rectCenter(placeOf(byId.get(id)!));
      const along = side === "left" || side === "right" ? shareOf(middle.y - outer.y, outer.h) : shareOf(middle.x - outer.x, outer.w);
      const list = ports.get(own);
      if (list === undefined) ports.set(own, [{ id: name, side, along }]);
      else list.push({ id: name, side, along });
      made.add(name);
    }
    return { box: own, port: name };
  };

  const edges: LayoutEdge[] = [];
  for (const edge of input.edges ?? []) {
    const s = top.get(edge.source);
    const t = top.get(edge.target);
    if (s === undefined || t === undefined || s === t) continue;
    const source = endOf(edge.source, s, t, edge.sourcePort);
    const target = endOf(edge.target, t, s, edge.targetPort);
    edges.push({
      id: edge.id,
      source: source.box,
      target: target.box,
      ...(source.port === undefined ? {} : { sourcePort: source.port }),
      ...(target.port === undefined ? {} : { targetPort: target.port }),
      ...(edge.data === undefined ? {} : { data: edge.data }),
    });
  }
  const boxes = input.boxes
    .filter((box) => box.parent === undefined)
    .map((box): LayoutBox => {
      const more = ports.get(box.id);
      return more === undefined ? box : { ...box, ports: [...(box.ports ?? []), ...more] };
    });
  const { hash: _hash, pairGaps, ...rest } = input;
  const gaps = pairGaps?.filter((pair) => top.get(pair.a) === pair.a && top.get(pair.b) === pair.b);
  return {
    ...rest,
    ...(gaps === undefined ? {} : { pairGaps: gaps }),
    boxes,
    ...(input.edges === undefined ? {} : { edges }),
  };
}
