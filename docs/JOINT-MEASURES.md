# The joint measures

A joint run packs an input, and then routes the edges of the same input. The `joint.*` measures score the result of the two stages together. The `pack.*` measures of `packing` and the `route.*` measures of `highways` do not have this data.

- The record of a joint run has `stage` `joint`. Its `measures` field holds the `joint.*` values, the `pack.*` values and the `route.*` values.
- The joint selector compares two strategies on the same input. Thus a value in units of the board compares between two placements of one input.
- `S` is the square root of the sum of the areas of the boxes. A length divided by `S` does not change with the scale of the input.
- The hull of a run is the bounding box of the placed boxes with their margins, and of all the routes.
- The promotion rule of `highways` (`docs/PROMOTION.md`) uses `floor` and `tol`. On an input where the default is within `tol` of `floor`, the rule compares the difference, not the ratio.

## The table

| Name | Unit | Better | Floor | Tol | Min effect | Role |
|---|---|---|---|---|---|---|
| `joint.fill` | 0 to 1 | higher | 1 | none | 0.001 | guard |
| `joint.aspectError` | natural log | lower | 0 | 0.01 | 0.01 | guard |
| `joint.spill` | 0 to 1 | lower | 0 | 0.001 | 0.001 | guard |
| `joint.straight.crossings` | count | lower | 0 | 0 | 0 | guard |
| `joint.straight.length` | `S` for each edge | lower | 0 | 0.01 | 0.01 | guard |
| `joint.stability.mean` | `W` | lower | 0 | 0.005 | 0.005 | guard on change pairs |
| `joint.stability.moved` | 0 to 1 | lower | 0 | 0.02 | 0.02 | guard on change pairs |
| `joint.proxy.rank` | -1 to 1 | higher | none | none | none | diagnostic |
| `joint.ms` | milliseconds | lower | none | none | none | time |

## The definitions

- `joint.fill` is the sum of the areas of the boxes divided by the area of the hull. `pack.fill` uses only the boxes. Routes that go out of the boxes make `joint.fill` smaller.
- `joint.aspectError` is the absolute natural log of the aspect of the hull divided by the target aspect of the container. `pack.aspectError` uses the boxes only.
- `joint.spill` is the length of the routes outside the bounding box of the boxes with their margins, divided by the length of all the routes. A value above 0 tells that the packing did not keep space for the routes. `route.outside` (R13) is different: it counts the routes outside the container.
- `joint.straight.crossings` is the count of the pairs of edges whose straight segments cross. A straight segment goes from the center of the source box to the center of the target box. The value comes from the placement alone. The router does not change it.
- `joint.straight.length` is the sum of the Manhattan lengths of the straight segments, divided by `S` and by the count of the edges. A packer can calculate it during its search.
- `joint.stability.mean` compares a base input and its variant after the two stages run again on each. It is the mean move of the boxes and the routes that stay. The width `W` of the base is its unit.
- The move of a route is its discrete Fréchet distance to the old route, as in `route.stability.*` (Z10). Thus a route that reverses or makes a loop moves.
- `W` is the width of the container when the width is fixed. In the other cells, `W` is the width of the bounding box of the boxes with their margins.
- `joint.stability.moved` is the share of the boxes and the edges that stay and move more than `joint.stability.movedMin` times `W`. The value of `joint.stability.movedMin` is 0.01.
- `route.stability.moved` counts a route as moved above 1 unit of the board. Thus on a large board, `joint.stability.moved` and `route.stability.moved` are different.
- `joint.proxy.rank` is the Spearman rank correlation, over the edges, between the straight length and the length of the route. A value near 1 tells that `joint.straight.length` is a good proxy for the length of the routes. Then a packer can optimize the proxy.
- `joint.ms` is the time of the pack plus the time of the route, in milliseconds. The time test of the promotion rule uses it.

## The minimum effects

`compareMeasure` of this package gives `better`, `worse` or `tie` for one measure on one input. A change of at most `max(RECORD_EPS, minEffect)` is a tie, and a tie is not better.

`compareMeasure` rounds the two values to whole steps of `RECORD_EPS` before the compare. Thus a live pick and the replay of its record give the same verdict. A change of exactly `minEffect` on 3-decimal records is a tie, also when the float difference is a little larger.
 The tie applies only to the classification of each input: the sign test, the wins and the flips. The tests of the median, the tail and the bootstrap read the raw values.

- `joint.fill` and `joint.spill` (0.001): a share of 0.001 is the precision of a written file of 1000 boxes.
- `joint.aspectError` (0.01): the same value as `pack.aspectError`, so the two aspects compare.
- `joint.straight.crossings` (0): a count. The threshold is `RECORD_EPS`, so a change of 1 counts.
- `joint.straight.length` (0.01): 1% of the side of a mean box. A smaller change does not change the routes.
- `joint.stability.mean` (0.005) and `joint.stability.moved` (0.02): the same values as their `tol` and as the twins of `pack.stability.*`.
- `joint.proxy.rank` and `joint.ms` have no minimum effect. The selector does not test the diagnostic, and the time test uses its own ratio.

## The output hash

`outputHash` of this package gives the hash of an output: the first 16 hex characters of the SHA-256 of its canonical JSON.

- Before the hash, each number goes to the grid of `RECORD_EPS`, as `Math.round(x * 1000) / 1000`. The value `-0` becomes `0`.
- `exercised` tells if a candidate has an effect: a move count above 0, or a hash that is different from the hash of its base.
- `outputGroups` puts the candidates with the same hashes on each decision input in one group. A group counts as one candidate.

[`PROMOTION.md`](PROMOTION.md) gives the two guards and the form of each stage.

## The roles

- A guard must not become worse, by the tests of the promotion rule.
- A diagnostic is in each record, but the selector does not test it. `joint.proxy.rank` tells which co-optimization ideas can work.
- An input without edges has no `joint.straight.*`, `joint.spill` or `joint.proxy.rank` values. The record does not write them.
- A floor that is not 0 keeps the ratio. `joint.fill` has floor 1, so the rule uses the ratio on each input.
