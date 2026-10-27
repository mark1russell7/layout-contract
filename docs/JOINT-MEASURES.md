# The joint measures

A joint run packs an input, and then routes the edges of the same input. The `joint.*` measures score the result of the two stages together. The `pack.*` measures of `packing` and the `route.*` measures of `highways` do not have this data.

- The record of a joint run has `stage` `joint`. Its `measures` field holds the `joint.*` values, the `pack.*` values and the `route.*` values.
- The joint selector compares two strategies on the same input. Thus a value in units of the board compares between two placements of one input.
- `S` is the square root of the sum of the areas of the boxes. A length divided by `S` does not change with the scale of the input.
- The hull of a run is the bounding box of the placed boxes with their margins, and of all the routes.
- The promotion rule of `highways` (`docs/PROMOTION.md`) uses `floor` and `tol`. On an input where the default is within `tol` of `floor`, the rule compares the difference, not the ratio.

## The table

| Name | Unit | Better | Floor | Tol | Role |
|---|---|---|---|---|---|
| `joint.fill` | 0 to 1 | higher | 1 | none | guard |
| `joint.aspectError` | natural log | lower | 0 | 0.01 | guard |
| `joint.spill` | 0 to 1 | lower | 0 | 0.001 | guard |
| `joint.straight.crossings` | count | lower | 0 | 0 | guard |
| `joint.straight.length` | `S` for each edge | lower | 0 | 0.01 | guard |
| `joint.stability.mean` | container widths | lower | 0 | 0.005 | guard on change pairs |
| `joint.stability.moved` | 0 to 1 | lower | 0 | 0.02 | guard on change pairs |
| `joint.proxy.rank` | -1 to 1 | higher | none | none | diagnostic |
| `joint.ms` | milliseconds | lower | none | none | time |

## The definitions

- `joint.fill` is the sum of the areas of the boxes divided by the area of the hull. `pack.fill` uses only the boxes. Routes that go out of the boxes make `joint.fill` smaller.
- `joint.aspectError` is the absolute natural log of the aspect of the hull divided by the target aspect of the container. `pack.aspectError` uses the boxes only.
- `joint.spill` is the length of the routes outside the bounding box of the boxes with their margins, divided by the length of all the routes. A value above 0 tells that the packing did not keep space for the routes.
- `joint.straight.crossings` is the count of the pairs of edges whose straight segments cross. A straight segment goes from the center of the source box to the center of the target box. The value comes from the placement alone. The router does not change it.
- `joint.straight.length` is the sum of the Manhattan lengths of the straight segments, divided by `S` and by the count of the edges. A packer can calculate it during its search.
- `joint.stability.mean` compares a base input and its variant after the two stages run again on each. It is the mean move of the boxes and the routes that stay. The width of the base container is its unit. The move of a route is its Hausdorff distance to the old route.
- `joint.stability.moved` is the share of the boxes and the edges that stay and move more than `RECORD_EPS`.
- `joint.proxy.rank` is the Spearman rank correlation, over the edges, between the straight length and the length of the route. A value near 1 tells that `joint.straight.length` is a good proxy for the length of the routes. Then a packer can optimize the proxy.
- `joint.ms` is the time of the pack plus the time of the route, in milliseconds. The time test of the promotion rule uses it.

## The roles

- A guard must not become worse, by the tests of the promotion rule.
- A diagnostic is in each record, but the selector does not test it. `joint.proxy.rank` tells which co-optimization ideas can work.
- An input without edges has no `joint.straight.*`, `joint.spill` or `joint.proxy.rank` values. The record does not write them.
- A floor that is not 0 keeps the ratio. `joint.fill` has floor 1, so the rule uses the ratio on each input.
