# The cell measures

A Voronoi treemap gives each item a cell, not a box. A good treemap gives each cell its target share of the container, and keeps the cells round, not long and thin. The two measures of this note give these qualities as numbers (roadmap item L161). The packer and the joint bench use the same functions of `@mark1russell7/layout-contract`, so their values agree.

Each stage adds its prefix to the suffixes of `CELL_MEASURE_SUFFIXES`. The packer writes `pack.cell.areaError`. `cellMeasureSpecs(stage)` gives the specs, and `cellMeasureEntries(stage)` gives the entries of the measure registry.

## The measures

| Suffix | Unit | Better | Range | Floor | Minimum effect | Normalization |
|---|---|---|---|---|---|---|
| `cell.areaError` | share | lower | 0 to 1 | 0 | 0.01 | `range` |
| `cell.compactness` | ratio | lower | 1 and more | none | 0.01 | `scale`, a square has the loss 0.5 |

## The definitions

`cellsOf(items, containerArea)` gives the values. Each item has a `target` area and the `cell` region that it got. The target is, for example, the area `w` by `h` of its box in the input.

- The cell share of an item is the area of its cell over the area of the container. The target share is its target over the sum of the targets.
- The targets are weights. They do not need a sum of 1, because `cellsOf` divides each target by their sum. A target that is not a finite number above 0 gives a `RangeError`.
- The area of the container is the area of its region. For a circle or a polygon container, give `regionArea` of the shape, not `w` by `h`.
- `cell.areaError` is half the sum of the absolute differences of the two shares. Cells that fill the container in the target shares give 0.
- The empty area of the container counts against the cells. One cell of half the container, with the target share 1, gives 0.25.
- Cells that overlap or go out of the container can give a sum over 1. These cells break the hard rules, and the value stops at 1.
- `cell.compactness` is the mean of `P * P / (4 * PI * A)` over the cells, for the perimeter `P` and the area `A` of each cell.
- A circle gives 1, and a square gives 4 over PI, `SQUARE_COMPACTNESS` (1.27). A strip of 1 by 4 gives 1.99. A cell with the area 0 gives `Infinity`.
- No items give the best values: an `areaError` of 0 and a `compactness` of 1. The hard rule `complete` counts the items that are not placed.

## The shapes

The measures read the exact area (`regionArea`) and the exact perimeter (`regionPerimeter`) of each cell. Thus they support `rect`, `polygon` and `circle`. A `free` box has only its bounding box, so `checkShapes` refuses it.

`regionPerimeter` gives an ellipse by the second formula of Ramanujan. Its value is below the true perimeter, with a relative error below 5e-4. The error is largest for a flat ellipse.

## The cost

The cost of each measure is `n`. Each measure makes one pass over the corners of the cells. The cells of a Voronoi diagram have a count of corners in the order of `n`.
