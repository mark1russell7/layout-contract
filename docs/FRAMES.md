# The frames of a layout change

A layout changes when its input changes. A viewer can show the change as a set of frames from the old layout to the new layout. The record `layout-frame/1` of this note is one frame. The functions of this note make frames, and they measure the move between two frames. An engine can start a new layout from a frame, so a change can stop at any frame and go on from it.

## The record

```ts
interface LayoutFrame {
  schema: "layout-frame/1";
  boxes: FrameBox[]; // each id occurs one time
}
interface FrameBox {
  id: string;
  x: number; y: number; w: number; h: number;
  turn?: 0 | 90;
  presence: number; // 0 (not visible) to 1 (fully visible)
  state: "stay" | "enter" | "leave";
}
```

- A box with the state `stay` is in the start layout and in the end layout.
- A box with the state `enter` is only in the end layout.
- A box with the state `leave` is only in the start layout.
- Each function gives a `RangeError` for a frame with one of these errors:
  - an id two times
  - a value that is not finite
  - a presence out of 0 to 1
  - a turn that is not 0 or 90, or a bad state

## The functions

| Function | Result |
| --- | --- |
| `frameOf(boxes)` | The frame of a layout. Each box has the state `stay` and the presence 1. |
| `outputOf(frame)` | The placements (`id`, `x`, `y`, `turn`) of the boxes with the state `stay` or `enter`. An engine reads them as the start of a layout. |
| `frameAt(from, to, t, options)` | The frame at the time `t` from 0 to 1 of the change from `from` to `to` |
| `frameMove(a, b)` | The sum of the distances of the box centers from `a` to `b`, over the ids in the two frames |
| `fixedPointMove(start, run)` | `frameMove(start, run(start))`: the move of an engine from a start frame |

## The frame at a time

`frameAt(from, to, t)` gives these boxes:

1. A box in the two frames moves on a straight line from its place in `from` to its place in `to`. Its width, height and presence change on a straight line. It keeps the turn of `from` before the time 1.
2. A box only in `to` enters at its place in `to`.
3. A box only in `from` leaves at its place in `from`.
4. The order is the boxes of `to`, then the leaving boxes in the order of `from`.

The options `enter` and `leave` set the presence of the boxes that enter and leave:

- With `fade` (the default), the presence changes on a straight line with the time.
- With `cut`, an entering box is fully visible after the time 0, and a leaving box is fully visible before the time 1.

At the time 1, the result has the boxes of `to`, so the leaving boxes are not in it.

## The laws

`src/frame.test.ts` examines each law with `fast-check` over generated pairs of layouts. Each pair has boxes that stay, enter and leave, and the end layout has its boxes in a different order.

| Law | Statement |
| --- | --- |
| End | `frameAt(a, b, 1)` is `b`. |
| Start | The boxes of `a` in `frameAt(a, b, 0)` are the boxes of `a`. Each entering box has the presence 0. |
| Constant rate | `frameMove(frameAt(a, b, t), b)` is `(1 - t) × frameMove(a, b)`. Thus the move to the end does not grow with the time. |
| Composition | `frameAt(frameAt(a, b, s), b, u)` is `frameAt(a, b, s + u (1 - s))`. A change that stops at the time `s` and starts again goes on as one change. |
| Range | Each presence is from 0 to 1, and each id occurs one time. |
| Round trip | `outputOf(frameOf(p))` gives the placements of `p`. |

The tolerance of a compare of numbers is `1e-9 × (1 + |value|)`.

## The gate of a start frame

An engine that takes a start frame does not move a layout that is a fixed point of the engine. Thus `fixedPointMove(start, run)` is 0 for that start. The packing engine examines this gate on each strategy that reads a start. The test of `fixedPointMove` also examines the flip: an engine that moves each box gives a move above 0.

## Its place beside the stability measures

`stability.procrustes` and `stability.seed` of `docs/BALANCE.md` measure the move between two layouts after the best alignment. `frameMove` measures the move with no alignment, because a viewer shows the boxes at their places.
