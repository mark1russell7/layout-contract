# Curves through a grid

A curve through a grid puts the cells of a square grid in one row. The module `curves` gives the Hilbert curve, the Moore curve and the Morton curve (the Z order). A layout engine uses a curve to keep near items near on the page. A treemap of jigsaw cells and an order of edges by their ends are two examples.

## A curve as data

A grid has `side` cells on each side, and `side` is a power of 2. A curve of side 2h has four parts. Each part fills one quadrant with a curve of side h.

```ts
interface CurveSpec {
  name: string;
  order: [CurveQuadrant, CurveQuadrant, CurveQuadrant, CurveQuadrant]; // the quadrant of each part, in the order of the curve
  root: CurvePattern; // the symmetry of each part at the top level
  child: CurvePattern; // the symmetry of each part at each level below the top level
}
```

A symmetry is one of the 8 rotations and reflections of a square (`CurveSymmetry`). The symmetry of a part maps the curve of side h onto its quadrant. `applySymmetry` gives a point after a symmetry, and `inverseSymmetry` gives the symmetry that undoes it.

| Curve | Order of the parts | `root` | `child` | Property |
| --- | --- | --- | --- | --- |
| `HILBERT_CURVE` | low left, high left, high right, low right | `swap, same, same, back` | the same as `root` | Two cells in a row share a side. The curve goes from `(0, 0)` to `(side - 1, 0)`. |
| `MOORE_CURVE` | the same as Hilbert | `rise, rise, fall, fall` | the Hilbert parts | Two cells in a row share a side, and the last cell shares a side with the first cell. |
| `MORTON_CURVE` | low left, low right, high left, high right | `same` four times | `same` four times | The index has the bits of `x` at the even places and the bits of `y` at the odd places. |

The patterns `HILBERT_PATTERN` and `MOORE_PATTERN` are the same patterns that a treemap of a curve uses for its parts.

## The functions

- `curveCell(curve, index, side)` gives the cell `[x, y]` at a place along the curve.
- `curveIndex(curve, x, y, side)` gives the place of a cell. It is the inverse of `curveCell`.
- `curveCells(curve, side)` gives each cell of the grid in the order of the curve.
- `hilbertCell`, `hilbertIndex`, `mooreCell`, `mooreIndex`, `mortonCell` and `mortonIndex` are the same functions for one curve.

Each function takes `O(log side)` time for one cell. A side that is not a power of 2 from 1 to `CURVE_MAX_SIDE` (2 to the power 26) is a `RangeError`. A cell or an index outside the grid is also a `RangeError`.

## The tests

- For each curve, `curveIndex` gives back the index of the cell of an index. `curveCell` gives back the cell of the index of a cell.
- Each curve gives each cell of the grid one time.
- Two cells in a row of the Hilbert curve and of the Moore curve share a side. The last cell of the Moore curve shares a side with its first cell.
- The Hilbert curve gives the values of the `d2xy` code of the Wikipedia article "Hilbert curve" for the sides 2 to 16. The Morton curve gives the bit interleave.

## Sources

- **Hilbert 1891.** David Hilbert. "Ueber die stetige Abbildung einer Linie auf ein Flaechenstueck". Mathematische Annalen 38:459-460.
- **Moore 1900.** Eliakim Hastings Moore. "On certain crinkly curves". Transactions of the American Mathematical Society 1(1):72-90.
- **Morton 1966.** Guy M. Morton. "A computer oriented geodetic data base and a new technique in file sequencing". IBM, Ottawa.
