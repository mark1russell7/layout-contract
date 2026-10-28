# The joint benchmark

The joint benchmark packs each input of the corpus `joint-v1`, and then routes the packed input. It runs each pair of a pack entry and a router. The package `packages/joint` holds the runner and the analysis. The workflow `joint-bench.yml` runs them in CI.

- The pack entries are the 12 entries of the benchmark of `packing` 0.2.6 without `push`. The strategy `push` supports only the mode `incremental`, and each input of `joint-v1` is `offline`.
- The routers are the 9 router strategies of `highways` 0.5.0.
- Thus the benchmark has 108 pairs and 285 inputs.

## The runner

`runInput(input, cell, options)` gives one record `layout-record/1` for each pair. The record has the stage `joint`, and the strategy `<pack entry>+<router>`.

1. The runner removes `group` and `parent` from the boxes of the input of the packer. No strategy of `packing` 0.2.6 supports groups. The router reads the groups from `data.group`.
2. The runner packs the input two times. The time of the pack is the mean of the two times. The rule "same twice" compares the two hashes.
3. The runner applies the pack to the input. It drops the overflow boxes and their edges (refer to "The overflow rule").
4. The runner routes the packed input with each router, with `benchRun` of `highways` and 2 timed routes.
5. Pack entries with the same output share the routes of each router. Thus the runner routes each packed input one time for each router.

The record holds these values:

- `measures`: the `pack.*` measures of `measure`, the `route.*` measures of `routeMeasures`, and the `joint.*` measures of `docs/JOINT-MEASURES.md`.
- `measures` also holds `pack.ms`, `route.ms`, `joint.ms`, `joint.routes`, `joint.overflow.edges`, `route.mixed` and `route.cap.<cap>` for each cap.
- `hard`: the breaks of `checkHard` with `exactContainer` as `pack.<rule>`, and the breaks of `checkProperties` as `route.<rule>`. `route.violations` is their sum.
- `outputHash`: `outputHash([pack hash, route hash])`, as `docs/PROMOTION.md` tells.
- The pack hash is `outputHash` of `packing`. The route hash is `outputHash` of the routes in the order of the edge ids, with the levels, the bundles and the runs.

A strategy that does not support the cell of an input gives a record with `skipped` and no measures. An error and a graph above the node limit of a router also give a skipped record.

## The overflow rule

An overflow box has no position, so the router cannot route its edges.

- The runner drops each overflow box, and each edge with an end on an overflow box.
- `joint.overflow.edges` is the count of the dropped edges.
- The joint measures use only the placed boxes and the routed edges.
- The analysis splits the joint measures of its picks by an overflow of 0 and an overflow above 0.

## The cells of highways

The analysis has 6 cells: the rules `collection` and `all`, and the caps 1.1, 1.25 and 1.5. In each cell, the hard value of a record is the sum of these counts:

- the breaks of the pack and of the route (`hard`)
- the routes with a stretch above the cap (`route.cap.<cap>`)
- under the rule `collection`, the shared segments with edges of 2 collections or more (`route.mixed`)

The stretch of a route is its length divided by the length of the route of `corners` for the same edge. Both routes use the same packed input. This is the bundle stretch B3 of `highways`. A base route of 1 unit or less does not count.

## The analysis

`analyze(records, inputs)` gives the report. It is a pure function. `selectBest` of this package makes each pick.

### The pick on one input

The levels of the pick on one input are, in order:

1. `hard`: lower is better, with the minimum effect 0.
2. `pack.overflow.excessArea`: lower is better, with the minimum effect 0.005.
3. `joint.fill`: higher is better, with the minimum effect 0.001.
4. `joint.spill` and then `joint.straight.crossings` break the ties.

The floor of an input is the set of the pairs that `selectBest` keeps after level 2. The score of a pair on an input is its `joint.fill` when the pair is on the floor. Otherwise the score is 0.

### The pack rule

The analysis ranks the pack entries over all inputs, and over the inputs of each `containerSize`.

1. The first level is the mean `pack.overflow.excessArea`, with the minimum effect 0.005.
2. Among the ties, the second level is the mean `pack.fill` over the inputs that each tied entry packs clean.
3. A clean pack has no hard break and no overflow.
4. A scope is thin when fewer than 30% of its inputs are clean for each tied entry.

### The best pair and the oracle

- The best single pair has the fewest inputs below the floor. Among the ties, it has the best mean score.
- The oracle takes the pick of each input. The gain of the oracle is its score minus the score of the best pair, on each input.
- The report gives the mean gain with an interval. It also gives the gain for each value of `count`.

### The greedy portfolios

A greedy portfolio adds one pair at each step. Each step adds the pair that `selectBest` picks by the fewest inputs below the floor, and then by the mean score.

- The portfolio picks on each input by `selectBest` over its members, in their order.
- The analysis builds the portfolios on 2 seeds, and scores them on the third seed. It does this for each of the 3 seeds.
- The share of a portfolio is its gain over the first member, divided by the gain of the oracle over the first member. The sums go over the held-out inputs of the 3 folds.
- The report gives the share for k = 3 and for k = 8.

### The intervals

- Each interval is a 95% interval of a cluster bootstrap with 1000 samples. A cluster is the 3 inputs of one spec.
- An interval that holds 0 is "open".

### The output groups

`outputGroups` puts the pairs with the same output hash on each input in one group. A group counts as one candidate for the best pair and for the portfolios. Its id is its first pair in sort order.

### The thin board kinds

The report lists each board kind with fewer than 10 inputs. A board kind is the generator of an input. The report also gives the kinds with fewer than 10 inputs for one `containerSize`.

## Not in this version

The portfolio of `highways` (`routePortfolio`) is not in `highways` 0.5.0 on npm. The runner adds it as a router when a release of `highways` has it. The stretch of the exact model of `highways` is also not in 0.5.0. Thus the cap uses the stretch against `corners`.

## Start a run

- A pull request runs the slice `pr`: seed 1 of the specs with count 10 and of the fixed cases.
- A manual run of the workflow, or a pull request with the label `bench:full`, runs the full corpus over 48 shards.
- The job `analyze` keeps the artifact `joint-report` with `report.json` and `report.md`. Each shard keeps its raw records as `joint-records-<shard>`.

The benchmark measures times, so it runs only in CI.

## The prediction

This prediction came before the first full run. `checkPredictions` of the analysis gives the verdict of each part. The rules and the entries stay the same after the run.

- P1: Only inputs with a fixed container have overflow. The first pack entry of the pack rule keeps `pack.overflow.excessArea` at 0 on most inputs that it overflows.
- P2: The oracle is better than the best single pair in most cells. In these cells, the low end of the interval of the gain is above 0.
- P2b: For the inputs with count 10, the interval of the gain is open in most cells.
- P3: The greedy portfolio with k = 3 gets at least 70% of the oracle gain on the held-out seeds, in most cells.
- P3b: The portfolio with k = 8 adds less than 10% of the oracle gain to the portfolio with k = 3, in most cells.
- P4: In at least one cell, the best pair does not use the first pack entry of the pack rule.
- P5: The fixed inputs `empty` and `one` give no routes. The runner records them with no error and no skipped record.

## The result of the first run

The first full run is the run `40660540762` of `joint-bench.yml`, on 2026-10-28, at the commit `0ce044e`. It took 23 minutes over 48 shards. It gave 30780 records for 285 inputs and 108 pairs, with no skipped record. The rules and the entries did not change after the prediction.

The main numbers are almost the same in the 6 cells. The values of the cell `all` with the cap 1.25 are:

- The best single pair is `shelf+corners`. Its mean score is 0.232, and it is below the floor on 206 of 285 inputs.
- The oracle has the mean score 0.677. Its gain is 0.445, with the interval [0.388, 0.500].
- The gain is 0.556 [0.478, 0.629] for count 10, 0.440 [0.351, 0.529] for count 100 and 0.336 [0.229, 0.450] for count 1k.
- The greedy portfolio with k = 3 gets 0.480 [0.395, 0.565] of the oracle gain on the held-out seeds.
- The portfolio with k = 8 gets 0.917 [0.880, 0.952] of the oracle gain.
- The first entry of the pack rule is `maxrects-bl`, with the mean excess area 0.002 and the mean fill 0.842.

The verdicts:

| Id | Held | Facts |
|---|---|---|
| P1 | no | 21 of 66 fixed inputs have overflow, and 1 input with `freeAspect` also has overflow. `maxrects-bl` keeps the excess area at 0 on 3 of its 18 overflow inputs. |
| P2 | yes | The gain is above 0 in 6 of 6 cells. |
| P2b | no | The gain of count 10 is the largest gain, and its interval is closed in 6 of 6 cells. |
| P3 | no | k = 3 gets approximately 48% of the oracle gain in each cell. |
| P3b | no | k = 8 adds approximately 44% of the oracle gain to k = 3. |
| P4 | yes | The best pair uses `shelf`, not `maxrects-bl`, in 6 of 6 cells. |
| P5 | yes | The 6 inputs `empty` and `one` give 108 records each, with no route and no skipped record. |

### A problem of the scope

Each record with a route breaks the rule `no-pass-through` of `highways`. The cause is the corpus, not the runner.

- The boxes of `joint-v1` have no margins. Thus the packers put the boxes edge to edge, with no space between them.
- A router finds no channel between two boxes that touch. It gives a straight segment through the other boxes.
- A test on the input `oversize` with a margin of 10 on each box gave 0 breaks for `corners`, `sections` and `shared`.

Thus the level `hard` counts mostly these breaks. This explains the 206 misses of the best pair and the large gain of the oracle. The portfolios hold mostly `corners` pairs for the same reason. The cap and the rule `collection` change almost nothing. A next corpus needs margins, or a gap that the runner adds before the pack.
