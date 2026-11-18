import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BoxNode,
  boxTree,
  FLATTEN_SIDES,
  flatPortId,
  flattenInput,
  type LayoutBox,
  type LayoutEdge,
  type LayoutInput,
  pictureOf,
  portPoint,
  siblingEdges,
  topBoxes,
} from "./index.ts";

// The rules of the boxes in boxes of `docs/NESTED.md`.

/** A placed input: one card with two rows, a topic at the right of the card, and one box with no place. A row comes before its card in the list. */
const input: LayoutInput = {
  schema: "layout-input/1",
  id: "garden",
  boxes: [
    { id: "topic", w: 80, h: 30, x: 300, y: 40 },
    { id: "row-1", w: 180, h: 20, x: 5, y: 30, parent: "card" },
    { id: "card", w: 190, h: 80, x: 0, y: 0 },
    { id: "row-2", w: 180, h: 20, x: 5, y: 50, parent: "card" },
    { id: "lost", w: 10, h: 10 },
  ],
  edges: [
    { id: "e1", source: "row-1", target: "topic", data: { kind: "touches" } },
    { id: "e2", source: "row-2", target: "topic" },
  ],
};

const at = { w: 10, h: 10, x: 0, y: 0 };

/** A tree with three levels: `a` holds `b` and `d`, and `b` holds `c`. The box `z` is a second root. */
const deep: readonly LayoutBox[] = [
  { id: "c", parent: "b", ...at },
  { id: "a", ...at },
  { id: "d", parent: "a", ...at },
  { id: "z", ...at },
  { id: "b", parent: "a", ...at },
];

/** This function gives the ids of a tree as text: each box, then its children in brackets. */
function shape(nodes: readonly BoxNode[]): string {
  return nodes.map((node) => (node.children.length === 0 ? node.box.id : `${node.box.id}(${shape(node.children)})`)).join(" ");
}

/** This function gives an input with the boxes and the edges. */
function inputOf(boxes: readonly LayoutBox[], edges?: readonly LayoutEdge[]): LayoutInput {
  return { schema: "layout-input/1", id: "test", boxes, ...(edges === undefined ? {} : { edges }) };
}

/** This function gives an edge. */
function edge(id: string, source: string, target: string, more: Partial<LayoutEdge> = {}): LayoutEdge {
  return { id, source, target, ...more };
}

/**
 * This arbitrary gives a forest of placed boxes in a random order, with edges between random boxes.
 * A child is in the rectangle of its parent, so the middle of a child is in each box above it.
 */
const forests = fc
  .array(fc.record({ above: fc.option(fc.nat(), { nil: undefined }), fx: fc.double({ min: 0, max: 0.5, noNaN: true }), fy: fc.double({ min: 0, max: 0.5, noNaN: true }) }), { minLength: 1, maxLength: 14 })
  .chain((specs) => {
    const boxes: LayoutBox[] = [];
    specs.forEach((spec, i) => {
      const parent = spec.above === undefined || i === 0 ? undefined : boxes[spec.above % i]!;
      if (parent === undefined) boxes.push({ id: `b${i}`, x: i * 400, y: 0, w: 256, h: 256 });
      else boxes.push({ id: `b${i}`, parent: parent.id, x: parent.x! + spec.fx * parent.w, y: parent.y! + spec.fy * parent.h, w: parent.w / 2, h: parent.h / 2 });
    });
    const end = fc.nat({ max: boxes.length - 1 });
    return fc.record({
      boxes: fc.shuffledSubarray(boxes, { minLength: boxes.length }),
      edges: fc.array(fc.tuple(end, end), { maxLength: 20 }).map((pairs) => pairs.map(([s, t], i): LayoutEdge => ({ id: `e${i}`, source: `b${s}`, target: `b${t}` }))),
    });
  });

describe("boxTree", () => {
  it("gives each box with no parent as a root, and the children of each box, in the order of the input", () => {
    expect(shape(boxTree(input.boxes))).toBe("topic card(row-1 row-2) lost");
    expect(shape(boxTree(deep))).toBe("a(d b(c)) z");
    expect(boxTree([])).toEqual([]);
  });

  it("keeps each box as it is", () => {
    const tree = boxTree(input.boxes);
    expect(tree[1]!.box).toBe(input.boxes[2]);
    expect(tree[1]!.children[0]!.box).toBe(input.boxes[1]);
  });

  it("refuses an id two times, a parent that is not in the list and a loop of parents", () => {
    expect(() => boxTree([{ id: "a", ...at }, { id: "a", ...at }])).toThrow(new RangeError("boxTree: the id a is two times in the boxes."));
    expect(() => boxTree([{ id: "a", parent: "none", ...at }])).toThrow(new RangeError("boxTree: the parent none of the box a is not a box of the input."));
    expect(() => boxTree([{ id: "a", parent: "b", ...at }, { id: "b", parent: "a", ...at }, { id: "c", ...at }])).toThrow(new RangeError("boxTree: the parents of the boxes make a loop."));
    expect(() => boxTree([{ id: "a", parent: "a", ...at }])).toThrow(new RangeError("boxTree: the parents of the boxes make a loop."));
  });

  it("has each box one time, below its parent, for each forest", () => {
    fc.assert(
      fc.property(forests, ({ boxes }) => {
        const seen: string[] = [];
        const walk = (nodes: readonly BoxNode[], parent: string | undefined): void => {
          let last = -1;
          for (const node of nodes) {
            expect(node.box.parent).toBe(parent);
            // The children are in the order of the input.
            const index = boxes.indexOf(node.box);
            expect(index).toBeGreaterThan(last);
            last = index;
            seen.push(node.box.id);
            walk(node.children, node.box.id);
          }
        };
        walk(boxTree(boxes), undefined);
        expect(seen.sort()).toEqual(boxes.map((box) => box.id).sort());
      }),
    );
  });
});

describe("topBoxes", () => {
  it("gives the box with no parent that contains each box", () => {
    expect(Object.fromEntries(topBoxes(input.boxes))).toEqual({ topic: "topic", "row-1": "card", card: "card", "row-2": "card", lost: "lost" });
    expect(Object.fromEntries(topBoxes(deep))).toEqual({ a: "a", b: "a", c: "a", d: "a", z: "z" });
  });

  it("refuses the lists that the tree refuses, with its own name", () => {
    expect(() => topBoxes([{ id: "a", parent: "a", ...at }])).toThrow(new RangeError("topBoxes: the parents of the boxes make a loop."));
  });
});

describe("siblingEdges", () => {
  it("keeps an edge between two boxes with the same parent as it is", () => {
    const roots = edge("roots", "a", "z", { sourcePort: "p", targetPort: "q", data: { kind: "reply" } });
    const rows = edge("rows", "d", "b", { sourcePort: "p" });
    expect(siblingEdges(inputOf(deep, [roots, rows]))).toEqual([roots, rows]);
  });

  it("moves an end up to the box with the same parent as the other end, and the end loses its port", () => {
    expect(siblingEdges(input)).toEqual([
      { id: "e1", source: "card", target: "topic", data: { kind: "touches" } },
      { id: "e2", source: "card", target: "topic" },
    ]);
    // The boxes `c` and `d` are in `a`: the edge goes to the children `b` and `d` of `a`, not to the top box.
    expect(siblingEdges(inputOf(deep, [edge("in", "c", "d", { sourcePort: "p", targetPort: "q" })]))).toEqual([{ id: "in", source: "b", target: "d", targetPort: "q" }]);
    expect(siblingEdges(inputOf(deep, [edge("out", "z", "c", { sourcePort: "p", targetPort: "q" })]))).toEqual([{ id: "out", source: "z", target: "a", sourcePort: "p" }]);
  });

  it("gives no edge for an end in the other end, for one box two times and for an end that is not a box", () => {
    const edges = [edge("down", "a", "c"), edge("up", "c", "b"), edge("self", "d", "d"), edge("none", "d", "none"), edge("from-none", "none", "d")];
    expect(siblingEdges(inputOf(deep, edges))).toEqual([]);
    expect(siblingEdges(inputOf(deep))).toEqual([]);
  });

  it("gives edges between two different boxes with the same parent, for each forest", () => {
    fc.assert(
      fc.property(forests, ({ boxes, edges }) => {
        const byId = new Map(boxes.map((box) => [box.id, box]));
        const above = (id: string): string[] => {
          const out = [id];
          for (let box = byId.get(id)!; box.parent !== undefined; box = byId.get(box.parent)!) out.push(box.parent);
          return out;
        };
        const result = siblingEdges(inputOf(boxes, edges));
        const from = new Map(edges.map((e) => [e.id, e]));
        for (const e of result) {
          const original = from.get(e.id)!;
          expect(e.source).not.toBe(e.target);
          expect(byId.get(e.source)!.parent).toBe(byId.get(e.target)!.parent);
          expect(above(original.source)).toContain(e.source);
          expect(above(original.target)).toContain(e.target);
        }
        // An edge has a result, but not if one end is the other end or contains it.
        const kept = edges.filter((e) => !above(e.source).includes(e.target) && !above(e.target).includes(e.source));
        expect(result.map((e) => e.id)).toEqual(kept.map((e) => e.id));
      }),
    );
  });
});

describe("flattenInput", () => {
  it("has only the top boxes, and each end of an edge in a top box becomes a port of that box", () => {
    const flat = flattenInput(input);
    expect(flat.boxes).toEqual([
      input.boxes[0],
      // The middle of the first row is at 40 of the 80 units of the card, and the middle of the second row is at 60.
      { id: "card", w: 190, h: 80, x: 0, y: 0, ports: [{ id: "row-1:right", side: "right", along: 0.5 }, { id: "row-2:right", side: "right", along: 0.75 }] },
      input.boxes[4],
    ]);
    expect(flat.edges).toEqual([
      { id: "e1", source: "card", target: "topic", sourcePort: "row-1:right", data: { kind: "touches" } },
      { id: "e2", source: "card", target: "topic", sourcePort: "row-2:right" },
    ]);
    // A box with no port is the box of the input.
    expect(flat.boxes[0]).toBe(input.boxes[0]);
    expect(flatPortId("row-1", "right")).toBe("row-1:right");
  });

  it("puts the port on the side that points most to the top box of the other end, and the first side wins a tie", () => {
    const side = (x: number, y: number, sides?: readonly ("top" | "right" | "bottom" | "left")[]): string | undefined => {
      const moved = { ...input, boxes: input.boxes.map((box) => (box.id === "topic" ? { ...box, x, y } : box)) };
      return flattenInput(moved, sides === undefined ? {} : { sides }).edges![0]!.sourcePort;
    };
    expect(FLATTEN_SIDES).toEqual(["right", "left"]);
    expect(side(300, 40)).toBe("row-1:right");
    expect(side(-300, 40)).toBe("row-1:left");
    // The middle of the topic is at the middle of the card on the x axis: the two sides are equal.
    expect(side(55, 400)).toBe("row-1:right");
    expect(side(55, 400, ["left", "right"])).toBe("row-1:left");
    const all = ["top", "right", "bottom", "left"] as const;
    expect(side(300, 40, all)).toBe("row-1:right");
    expect(side(55, 400, all)).toBe("row-1:bottom");
    expect(side(55, -400, all)).toBe("row-1:top");
    expect(side(-300, 100, all)).toBe("row-1:left");
  });

  it("puts a port on the top side or the bottom side at the middle of the inner box on the x axis", () => {
    const boxes: LayoutBox[] = [
      { id: "card", w: 200, h: 80, x: 100, y: 0 },
      { id: "cell", parent: "card", w: 40, h: 20, x: 130, y: 10 },
      { id: "below", w: 20, h: 20, x: 190, y: 300 },
    ];
    const flat = flattenInput(inputOf(boxes, [edge("e", "below", "cell")]), { sides: ["top", "bottom"] });
    expect(flat.boxes[0]!.ports).toEqual([{ id: "cell:bottom", side: "bottom", along: 0.25 }]);
    expect(flat.edges).toEqual([{ id: "e", source: "below", target: "card", targetPort: "cell:bottom" }]);
    expect(portPoint(flat.boxes[0]!, flat.boxes[0]!.ports![0]!)).toEqual({ x: 50, y: 80 });
  });

  it("makes one port for the edges of one box on one side, after the ports that the top box has", () => {
    const boxes: LayoutBox[] = [
      { id: "card", w: 100, h: 100, x: 0, y: 0, ports: [{ id: "own", side: "top" }] },
      { id: "row", parent: "card", w: 80, h: 20, x: 10, y: 0 },
      { id: "east", w: 10, h: 10, x: 300, y: 0 },
      { id: "west", w: 10, h: 10, x: -300, y: 0 },
    ];
    const edges = [edge("a", "row", "east"), edge("b", "west", "row"), edge("c", "east", "row"), edge("d", "card", "east", { sourcePort: "own" })];
    const flat = flattenInput(inputOf(boxes, edges));
    expect(flat.boxes[0]!.ports).toEqual([
      { id: "own", side: "top" },
      { id: "row:right", side: "right", along: 0.1 },
      { id: "row:left", side: "left", along: 0.1 },
    ]);
    expect(flat.edges).toEqual([
      { id: "a", source: "card", target: "east", sourcePort: "row:right" },
      { id: "b", source: "west", target: "card", targetPort: "row:left" },
      { id: "c", source: "east", target: "card", targetPort: "row:right" },
      // An end at a top box keeps its port.
      { id: "d", source: "card", target: "east", sourcePort: "own" },
    ]);
  });

  it("gives an end in a top box the port of its side, not the port that the end had", () => {
    const flat = flattenInput({ ...input, edges: [edge("e", "row-1", "topic", { sourcePort: "inner", targetPort: "t" })] });
    expect(flat.edges).toEqual([{ id: "e", source: "card", target: "topic", sourcePort: "row-1:right", targetPort: "t" }]);
  });

  it("puts the port of a box in a box in a top box on the top box", () => {
    const boxes: LayoutBox[] = [
      { id: "a", w: 200, h: 200, x: 0, y: 0 },
      { id: "b", parent: "a", w: 100, h: 100, x: 50, y: 100 },
      { id: "c", parent: "b", w: 20, h: 20, x: 60, y: 140 },
      { id: "z", w: 10, h: 10, x: 500, y: 0 },
    ];
    const flat = flattenInput(inputOf(boxes, [edge("e", "c", "z"), edge("in", "c", "a"), edge("same", "b", "c")]));
    expect(flat.boxes.map((box) => box.id)).toEqual(["a", "z"]);
    expect(flat.boxes[0]!.ports).toEqual([{ id: "c:right", side: "right", along: 0.75 }]);
    // The two other edges are in one top box.
    expect(flat.edges).toEqual([{ id: "e", source: "a", target: "z", sourcePort: "c:right" }]);
  });

  it("gives no edge for two ends in one top box, and for an end that is not a box", () => {
    const edges = [edge("rows", "row-1", "row-2"), edge("part", "card", "row-1"), edge("none", "row-1", "none"), edge("from-none", "none", "topic"), edge("self", "topic", "topic")];
    const flat = flattenInput({ ...input, edges });
    expect(flat.edges).toEqual([]);
    // No end of an edge makes a port: the card is the box of the input.
    expect(flat.boxes[1]).toBe(input.boxes[2]);
  });

  it("with no side, moves each end to its top box with no port, and it needs no place", () => {
    const bare = { ...input, boxes: input.boxes.map(({ x: _x, y: _y, ...box }): LayoutBox => box) };
    const flat = flattenInput(bare, { sides: [] });
    expect(flat.boxes).toEqual([bare.boxes[0], bare.boxes[2], bare.boxes[4]]);
    expect(flat.edges).toEqual([
      { id: "e1", source: "card", target: "topic", data: { kind: "touches" } },
      { id: "e2", source: "card", target: "topic" },
    ]);
  });

  it("keeps the port in its side for an inner box out of its top box, and uses the middle for a side of length 0", () => {
    const along = (card: Partial<LayoutBox>, row: Partial<LayoutBox>): number | undefined => {
      const boxes: LayoutBox[] = [
        { id: "card", w: 100, h: 100, x: 0, y: 0, ...card },
        { id: "row", parent: "card", w: 10, h: 10, x: 0, y: 0, ...row },
        { id: "east", w: 10, h: 10, x: 300, y: 0 },
      ];
      return flattenInput(inputOf(boxes, [edge("e", "row", "east")])).boxes[0]!.ports![0]!.along;
    };
    expect(along({}, { y: 500 })).toBe(1);
    expect(along({}, { y: -500 })).toBe(0);
    expect(along({ h: 0 }, {})).toBe(0.5);
  });

  it("keeps the other fields of the input, but not the hash and not a pair gap of an inner box", () => {
    const more: LayoutInput = {
      ...input,
      hash: "0123456789abcdef",
      seed: 7,
      gap: 12,
      container: { fixed: "none" },
      obstacles: [{ id: "wall", region: { kind: "rect", x: 0, y: 200, w: 10, h: 10 } }],
      pairGaps: [
        { a: "card", b: "topic", gap: 30 },
        { a: "row-1", b: "topic", gap: 5 },
        { a: "card", b: "row-2", gap: 5 },
      ],
    };
    const flat = flattenInput(more);
    expect(flat).not.toHaveProperty("hash");
    expect(flat.pairGaps).toEqual([{ a: "card", b: "topic", gap: 30 }]);
    expect({ schema: flat.schema, id: flat.id, seed: flat.seed, gap: flat.gap, container: flat.container, obstacles: flat.obstacles }).toEqual({
      schema: "layout-input/1",
      id: "garden",
      seed: 7,
      gap: 12,
      container: more.container,
      obstacles: more.obstacles,
    });
    // The input does not change.
    expect(more.hash).toBe("0123456789abcdef");
    expect(more.boxes).toBe(input.boxes);
  });

  it("gives no list of edges and no list of pair gaps to an input with none", () => {
    const flat = flattenInput(inputOf(input.boxes));
    expect(flat).not.toHaveProperty("edges");
    expect(flat).not.toHaveProperty("pairGaps");
    expect(flat.boxes.map((box) => box.id)).toEqual(["topic", "card", "lost"]);
  });

  it("refuses a port of a box with no place, and a new port with the id of a port of the top box", () => {
    const without = (id: string): LayoutInput => ({ ...input, boxes: input.boxes.map((box) => (box.id === id ? { id: box.id, w: box.w, h: box.h, ...(box.parent === undefined ? {} : { parent: box.parent }) } : box)) });
    for (const id of ["row-1", "card", "topic"]) {
      expect(() => flattenInput(without(id)), id).toThrow(new RangeError(`flattenInput: the box ${id} has no place, and the port of a box in a top box needs it.`));
    }
    const taken = { ...input, boxes: input.boxes.map((box) => (box.id === "card" ? { ...box, ports: [{ id: "row-2:right" }] } : box)) };
    expect(() => flattenInput(taken)).toThrow(new RangeError("flattenInput: the box card has a port with the id row-2:right of a new port."));
    expect(() => flattenInput(inputOf([{ id: "a", parent: "a", ...at }]))).toThrow(new RangeError("flattenInput: the parents of the boxes make a loop."));
  });

  it("gives routes that go into the picture of the input, between the inner boxes", () => {
    const flat = flattenInput(input);
    // A router gives one route for each edge of the flat input, with the id of the edge.
    const routes = flat.edges!.map((e) => ({ edge: e.id, points: [{ x: 190, y: 40 }, { x: 300, y: 55 }] }));
    const picture = pictureOf(input, { routes });
    expect(picture.routes.map((route) => [route.id, route.source, route.target])).toEqual([
      ["e1", "row-1", "topic"],
      ["e2", "row-2", "topic"],
    ]);
  });

  it("gives edges between two different top boxes, with each port on the border of its box, for each forest", () => {
    fc.assert(
      fc.property(forests, fc.constantFrom<readonly ("top" | "right" | "bottom" | "left")[]>(["right", "left"], ["top", "bottom"], ["top", "right", "bottom", "left"], ["left"]), ({ boxes, edges }, sides) => {
        const flat = flattenInput(inputOf(boxes, edges), { sides });
        const top = topBoxes(boxes);
        const byId = new Map(flat.boxes.map((box) => [box.id, box]));
        expect(flat.boxes.map((box) => box.id)).toEqual(boxes.filter((box) => box.parent === undefined).map((box) => box.id));
        const from = new Map(edges.map((e) => [e.id, e]));
        expect(flat.edges!.map((e) => e.id)).toEqual(edges.filter((e) => top.get(e.source) !== top.get(e.target)).map((e) => e.id));
        for (const e of flat.edges!) {
          const original = from.get(e.id)!;
          expect([e.source, e.target]).toEqual([top.get(original.source), top.get(original.target)]);
          for (const [box, port, inner] of [
            [e.source, e.sourcePort, original.source],
            [e.target, e.targetPort, original.target],
          ] as const) {
            if (inner === box) {
              expect(port).toBeUndefined();
              continue;
            }
            const outer = byId.get(box)!;
            const found = outer.ports!.filter((p) => p.id === port);
            expect(found).toHaveLength(1);
            expect(sides).toContain(found[0]!.side);
            expect(port).toBe(flatPortId(inner, found[0]!.side!));
            const point = portPoint(outer, found[0]!)!;
            expect(point.x === 0 || point.x === outer.w || point.y === 0 || point.y === outer.h).toBe(true);
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(outer.w);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(outer.h);
          }
        }
        // Each port of a top box is the port of an edge.
        const used = new Set(flat.edges!.flatMap((e) => [`${e.source} ${e.sourcePort}`, `${e.target} ${e.targetPort}`]));
        for (const box of flat.boxes) for (const port of box.ports ?? []) expect(used.has(`${box.id} ${port.id}`)).toBe(true);
      }),
    );
  });
});
