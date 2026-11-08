# The strategy space

Each packer and each router is a pipeline of typed stages. A strategy space gives these stages, their options and the ranges of their params as data. A generator then makes the configs of the space.

The format has its home in the package `@mark1russell7/strategy-space`. Its rules are in [`docs/STRATEGY-SPACE.md`](https://github.com/mark1russell7/strategy-space/blob/main/docs/STRATEGY-SPACE.md) of that repository. `layout-contract` exports the same types and functions, and its joint bench sweeps the product of two spaces.

## The shape kinds of this package

The home takes a shape kind as a tag, for example `rect` or `circle`. Four functions take a list of the known tags in the option `kinds`. `layout-contract` gives `SHAPE_KIND_IDS` when a caller gives no list:

| Function | Without `kinds` |
| --- | --- |
| `checkSpace` | A shape kind of a `supports` that is not in `SHAPE_KIND_IDS` gives the claim `shape`. |
| `spaceSize` | A kind of `shapes` that is not in `SHAPE_KIND_IDS` causes a `RangeError`. |
| `enumerateSpace` | The same as `spaceSize`. |
| `spaceShapeKinds` | The function examines the kinds of `SHAPE_KIND_IDS`, in their order. |

`docs/SHAPES.md` tells the rules of the shape kinds. The other functions are the functions of the home.

## The named strategies

Each engine maps its named strategies into `named`. Examples are `rows`, `maxrects-cp`, `portfolio-k2` and `shared`. Thus a record of a named strategy stays comparable with a record of a config.

The output of a named config is equal to the output of the old named strategy. The engine checks this equality with `outputHash` on its corpus.

### The joint pack entries in `packSpace`

The joint cover has 45 pack entries, and each one is a point of `packSpace` of `packing` 0.10.2. `configOfStrategy` gives the point of each entry.
Up to `packing` 0.7.0, the 8 standalone strategies were outside `packSpace`. Since 0.8.0 they are points too (roadmap item L129). The closed list of the strategies outside the space is thus empty.
The test `pack-points.test.ts` checks each point with `checkConfig`, and compares the `outputHash` of `packConfig` with the hash of the entry on 17 inputs of `joint-v1`. It also compares them on one circle input for each container of `CIRCLE_CONTAINERS`, from `joint-v3`. Without them, `hole-degree` and `circle-quasi-physical` get no comparison.

- 522 of the 855 cases have equal hashes.
- In 320 cases, the strategy does not support the input. The point and the entry then both throw `UnsupportedCell`.
- 13 cases differ. 11 of them are `side-anchors`. On 10 inputs, `packWith` refuses the input and `packConfig` packs it. On 1 input, the two hashes are not equal. The test keeps `side-anchors` in a closed list. The runner uses `packWith`, so the records of the bench do not change.
- The other 2 are `near-rects` and `raster-nofit`. On the circle input with a rectangle container, `packWith` packs the input, but `packConfig` of their points refuses it. The closed list holds the three entries.
- `masonry` and `treemap` support none of the inputs, so the test compares no hash of them. A closed list holds the two.

**Gap:** the fix of `side-anchors`, `near-rects` and `raster-nofit` belongs to `packing`. `packConfig` must refuse each input that `packWith` refuses, and give the same output on each other input.

The cover has 162 routers, and 76 of them are named points of `routeSpace` of `highways` 0.15.0. The test `route-points.test.ts` checks each of these points with `checkConfig`.
It also compares the hash of the routes of the router and of `routeConfig` on 8 inputs of `joint-v1`. These inputs give one input for each container kind and obstacle case, and each hash is equal.
Since `highways` 0.15.0, the cover takes its routers from `KEYED_STRATEGIES`: 88 router and highway names. `STRATEGIES` holds 75 of them.

**Gap:** the other 86 routers are `portfolio`, 74 member forms and 11 router entries of `KEYED_STRATEGIES`, for example `corners-side`, `w2a:shared-ways+stretch` and `nudge`. `routeSpace` does not name them, and `highways` gives no function from a member form to a config. So a joint space of `productSpace(packSpace, routeSpace)` reaches only the named routers of the cover at this time. The packing engine has `configOfStrategy` for this job. A closed list of the test holds the 11 router entries with no point.

## The prediction for the engine spaces (L34 part 2)

This prediction comes before `packing` and `highways` make their spaces. It uses the strategies and the option schemas of both engines on 2026-10-28. The stage splits of the engines are new, so the confidences are lower than for the results of a bench. L34 part 2 scores each claim.

| Claim | Prediction | Confidence | Reason |
|---|---|---|---|
| P1 | `spaceSize(packSpace, { levels: 3 }).base` is from 300 to 3000. | 0.6 | `order` has 5 sort orders. `placement` has 5 options with 39 points. `size-search` has 4 points, and `local-search` has 1. |
| P2 | The pack meta count is from 1e11 to 1e14. | 0.35 | A portfolio of 2 to 5 members from approximately 800 base configs gives approximately 3e12. A member list from a fixed table gives fewer than 1e4. |
| P3 | `spaceSize(routeSpace, { levels: 3 }).base` is from 1e9 to 1e12. | 0.45 | `sections` has 12 numeric params and a grouping stage. 53 highway plans have a total of 300 numeric params, with `margin` and `k` in most of them. |
| P4 | The joint base count is more than 1e11. | 0.55 | It is the product of P1 and P3. Thus the joint bench (L35) samples the space, and does not use the full grid. |
| P5 | Of the 20 bench entries of `packing`, 0 share a `configId`. With the names of the registry, 2 or 3 pairs share one. | 0.5 | `maxrects` is `maxrects-bssf`, and `select` is `select-rows-bl`. The default `portfolio` is possibly `portfolio-k3`. |
| P6 | Of the 62 router rows of `highways`, 0 to 2 share a `configId` with another row. | 0.4 | Each router variant changes one value. A corridor gate with its default can be equal to `corridors`. |
| P7 | Each bench entry of `packing` fits its 5 stages with optional stages, constraints and meta options. | 0.5 | `aspect-fit-*`, `portfolio-*` and `select-rows-bl` are meta options. `push` is the risk: it reads the previous layout. |
| P8 | 3 to 6 named strategies of `highways` do not fit a split of grouping, lane order, routing and smoothing. | 0.4 | `select`, `consensus` and `hub-arcs` take other plans as inputs, which is not a whole config. `straight`, `plugs` and `corners` fit with `null` stages. |

The prediction also finds two gaps in the schema. The engines examine them in part 2:

1. A meta option takes each config of its space as a member. The portfolios of both engines take members from a fixed table. A field `pool` of the member rule can hold the names of the table. Version 0.2.14 adds `pool` as a list of member lists (L39).
2. Some options take a function, for example the key of a grouping. The space gives each named function as one value of an `enum`.

## The result for the engine spaces

These results come from `packing` 0.6.1 and `highways` 0.13.0. Both engines added strategies after the prediction of 2026-10-28, so a count can be larger for that reason. 4 of the 8 claims are correct. The mean Brier score is 0.251, which is the score of a coin toss.

| Claim | Result | Correct |
|---|---|---|
| P1 | The base count is 3,798, more than 3,000. | no |
| P2 | The meta count is `null`, so it is more than 1e18. | no |
| P3 | The base count is 3.17e10. | yes |
| P4 | The joint base count is 1.20e14. | yes |
| P5 | Of the 30 entries of the cover with a name in `named`, 0 share a `configId`. Of the 69 names, 10 pairs share one, more than 3. | no |
| P6 | Of the 76 named routers, 0 share a `configId`. | yes |
| P7 | `configOfStrategy` gives a point for each of the 32 entries of the cover. | yes |
| P8 | `ROUTE_SPACE_MISFITS` is empty, so 0 named routers do not fit. | no |

The routing stage of `routeSpace` has 67 options, and `routeSpace` has 7 stages, not 4. Thus `select`, `consensus` and `hub-arcs` fit as options of a stage.
