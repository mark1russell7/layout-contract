# Boxes in boxes

A box of an input can be in a different box: its field `parent` names the box that contains it. Thus the boxes of an input make a tree. The engines do not read the same form of that tree:

- A layout engine places the children of one box at a time, so it reads the tree.
- A router reads a flat list of boxes. Each box is an obstacle, and a route does not go into a box.

The functions of this note give each engine the form that it reads. They change no place and no size.

| Function | Result |
| --- | --- |
| `boxTree(boxes)` | The tree of the boxes: each box with no `parent`, with the boxes in it |
| `topBoxes(boxes)` | The top box of each box, by the id of the box |
| `siblingEdges(input)` | The edges of the input between boxes with the same parent |
| `flattenInput(input, options)` | The input of the top boxes, with a port for each inner box that an edge uses |
| `flatPortId(box, side)` | The id of the port of an inner box on a side of its top box |

A top box is a box with no parent. The top box of an inner box is the top box that contains it, at each depth.

## The tree

```ts
interface BoxNode {
  box: LayoutBox; // the box of the input, with no change
  children: BoxNode[]; // the boxes that have this box as their parent
}
```

- `boxTree` gives the roots in the order of the input. The children of a box are in the order of the input too.
- A child can come before its parent in the input.
- An adapter of a layout engine makes the nodes of the engine from this tree.

## The edges of one level

A layout of the children of one box reads only the edges between those children. An edge of an input can go between two boxes at different places of the tree. `siblingEdges` moves each edge to one level:

1. An edge between two boxes with the same parent stays as it is. Two top boxes have the same parent.
2. Each other edge goes up the tree. Its ends become the two boxes with the same parent that contain its ends.
3. An end that goes up loses its port. The edge keeps its id and its `data`.
4. An edge has no result if one end contains the other end, or if the two ends are one box.

For example, a card contains rows, and an edge goes from a row to a box out of the card. The result has an edge from the card to that box. A layout of the top boxes reads it as a spring, and it puts the card near that box.

## The flat input

`flattenInput` gives the input that a router reads. The result has only the top boxes. An inner box that an edge uses becomes a port on the border of its top box.

```ts
const flat = flattenInput(placed); // the top boxes, with a port for each inner end of an edge
const { routes } = router.route(inputGraph(flat)); // a router of `highways`
const picture = pictureOf(placed, { routes }); // each route is between the inner boxes
```

- An edge between two top boxes stays as it is.
- An edge with an end in a top box goes to that top box, at a port. An end at a top box keeps its port.
- An edge has no result if its two ends are in one top box. A router of the top boxes cannot draw it.
- Each edge keeps its id and its `data`. Thus `pictureOf` finds the edge of a route in the input with the inner boxes.
- The result has no `hash`, because it is a different document. It has no `pairGaps` entry of an inner box.

## The port of an inner box

- The port is on one side of the top box. The option `sides` lists the sides that a port can use.
- The side is the one that points most to the middle of the top box of the other end. The first side of the list wins a tie.
- The default is `right`, then `left`. These are the two ends of a row in a card.
- The port is at the middle of the inner box along that side, as the field `along` of the port.
- The middle of an inner box that is out of its top box goes to the nearest end of the side.
- The id of the port is the id of the inner box, a colon and the side: `row-1:right`.
- The edges of one inner box that go to one side use one port. A top box keeps the ports that it has, before the new ports.
- With an empty list of sides, each end goes to its top box with no port. Then the boxes need no place.

## The errors

Each function gives a `RangeError` for a list of boxes that is not a tree:

- an id that is two times in the list
- a parent that is not a box of the list
- a loop of parents

`flattenInput` gives a `RangeError` for these inputs too:

- a port needs the place of a box, and the box has no `x` or no `y`
- a top box has a port with the id of a new port

An edge with an end that is not a box of the input has no result, and it gives no error.

## The tests

`src/nest.test.ts` examines the functions with `fast-check` over generated trees of placed boxes with edges between them.

| Law | Statement |
| --- | --- |
| Tree | Each box is in the tree one time, below its parent, in the order of the input. |
| Same parent | Each edge of `siblingEdges` has two different ends with the same parent. Each end is the end of the edge in the input, or it contains that end. |
| Top boxes | Each edge of `flattenInput` goes between the top boxes of its two ends in the input, and they are different boxes. |
| Ports | Each new port is on the border of its top box, on a side of the list. Each new port is the port of an edge. |

`packages/joint/src/nest.test.ts` examines the flat input with the engines. A router of `highways` starts each route of an inner box at the port of that box. `pictureOf` puts each route between the inner boxes.
