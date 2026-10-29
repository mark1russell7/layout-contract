# The balance and stability measures

A compact pack can put all its boxes in one corner. The measures of this note show that skew, so a compare can show compact and spread layouts as a Pareto front. The packing engine and the joint bench use the same functions of `@mark1russell7/layout-contract`, so their values agree.

Each stage adds its prefix to the suffixes of `BALANCE_MEASURE_SUFFIXES`. The packer writes `pack.balance.gapCv`, and the joint bench writes `joint.balance.gapCv`. `balanceMeasureSpecs(stage)` gives the specs.

## The measures

| Suffix | Unit | Better | Range | Minimum effect | Role |
|---|---|---|---|---|---|
| `balance.gapCv` | ratio | lower | 0 and more | 0.01 | objective |
| `balance.centroidOffset` | 0 to 1 | lower | 0 to 1 | 0.01 | objective |
| `balance.side.top`, `.right`, `.bottom`, `.left` | 0 to 1 | lower | 0 to 1 | none | diagnostic |
| `balance.sideRange` | 0 to 1 | lower | 0 to 1 | 0.02 | objective |
| `stability.procrustes` | `W` for each change share | lower | 0 and more | 0.005 | guard on change pairs |
| `stability.seed` | `W` | lower | 0 and more | 0.005 | objective |

## The definitions

`balanceOf(boxes, container)` gives the balance values. The boxes do not overlap, as in the output of a packer.

- The gap of a box is the distance from its bounding box to the bounding box of the nearest other box. Two boxes that touch have the gap 0.
- `balance.gapCv` is the standard deviation of the gaps divided by their mean. A value of 0 tells that each box has the same gap. With fewer than 2 boxes, or when each gap is 0, the value is 0.
- The free area is the container minus the boxes, clipped to the container. `balance.centroidOffset` is the distance from the centroid of the free area to the center of the container. The unit is half of the diagonal of the container.
- Each side has a strip with the depth `BALANCE_SIDE_DEPTH` (0.25). For `top` and `bottom`, it is a share of the height. For `left` and `right`, it is a share of the width.
- `balance.side.<side>` is the empty share of the strip of that side.
- `balance.sideRange` is the largest side value minus the smallest side value. A pack in the bottom-left corner has full strips at the bottom and the left and empty strips at the top and the right. Thus its value is high.

`procrustesOf(base, next, { unit, rotate })` gives the move of a layout.

- It reads the centers of the boxes with the same id in the two layouts. It aligns `base` to `next` with the best move and, by default, the best rotation (the orthogonal Procrustes fit). The value is the root mean square of the distances that stay, divided by `unit`.
- The unit is the width `W` of the base, as in `joint.stability.mean`. `W` is the width of the container when the width is fixed. In the other cells, `W` is the width of the bounding box of the boxes with their margins.
- `stability.procrustes` compares a base input and its variant. It is the value of `procrustesOf` divided by the change share (`perChange`). The change share is the count of the changed boxes divided by the count of the boxes, and it is at least 1 box.
- `stability.seed` compares the outputs of two seeds of one input, with no division.

## The reasons

- The gaps, the free area and the strips read only bounding boxes. The balance measures support only `rect`, because the area of another shape kind is not its bounding box.
- The centroid offset gets small when the boxes fill a small part of the container. With a low fill, read `balance.sideRange`, because each strip has a fixed depth.
- The alignment removes a move or a rotation of the whole layout, so a layout that only moves has the value 0. With `rotate: false`, a rotation counts as a move.
- The stability measures use `W`, as `pack.stability.*` and `joint.stability.*` do. Thus all the stability measures have one unit.
