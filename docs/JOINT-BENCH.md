# The joint benchmark

The joint benchmark packs each input of a joint corpus, and then routes the packed input. It runs each pair of a pack entry and a router. The package `packages/joint` holds the runner and the analysis. The workflow `joint-bench.yml` runs them in CI.

- The corpus is `joint-v2` by default (`docs/JOINT-CORPUS.md`). The first run used `joint-v1`.
- The pack entries are the 12 entries of the benchmark of `packing` 0.2.10 without `push`. The strategy `push` supports only the mode `incremental`, and each joint input is `offline`.
- The routers are the 9 router strategies of `highways` 0.6.0, and the portfolio router `portfolio` of `highways` 0.6.0.
- The joint-v2 run of 2026-10-28 used `packing` 0.2.6 and `highways` 0.5.1. Version 0.6.0 changes the default members of `portfolio`.
- Thus the benchmark has 120 pairs. `joint-v2` has 303 inputs, and `joint-v1` has 285 inputs.

The portfolio router is `portfolioRouter()` with its defaults: the rule `collection`, the cap 1.5 and the order `fit`. Its default is deterministic. Above 40 nodes, it uses only `shared`.

## The runner

`runInput(input, cell, options)` gives one record `layout-record/1` for each pair. The record has the stage `joint`, and the strategy `<pack entry>+<router>`.

1. The runner removes `group` and `parent` from the boxes of the input of the packer. No strategy of `packing` 0.2.10 supports groups. The router reads the groups from `data.group`.
2. The runner packs the input two times. The time of the pack is the mean of the two times. The rule "same twice" compares the two hashes.
3. The runner applies the pack to the input. It drops the overflow boxes and their edges (refer to "The overflow rule").
4. The runner routes the packed input with each router, with `benchRun` of `highways` and 2 timed routes.
5. Pack entries with the same output share the routes of each router. Thus the runner routes each packed input one time for each router.

The record holds these values:

- `measures`: the `pack.*` measures of `measure`, the `route.*` measures of `routeMeasures`, and the `joint.*` measures of `docs/JOINT-MEASURES.md`.
- `measures` also holds `pack.ms`, `route.ms`, `joint.ms`, `joint.routes`, `joint.overflow.edges`, `route.mixed` and `route.cap.<cap>` for each cap.
- `hard`: the breaks of `checkHard` with `exactContainer` as `pack.<rule>`, and the breaks of `checkProperties` as `route.<rule>`. `route.violations` is their sum.
- `routeFacts(graph)(result)` of the runner gives `route.cap.<cap>`, `route.mixed` and the counts `route.<rule>`. It uses `exactStretches`, `checkProperties` and `mixedSegments` of `highways` 0.6.0.
- These facts are the facts of `portfolioFacts`, which the guard of the portfolio router uses. The test `facts-parity.test.ts` compares the two functions.
- `outputHash`: `outputHash([pack hash, route hash])`, as `docs/PROMOTION.md` tells.
- The pack hash is `outputHash` of `packing`. The route hash is `outputHash` of the routes in the order of the edge ids, with the levels, the bundles and the runs.

The measures `time.*` give the time of each step after the pack, in milliseconds. They change no other field and no hash.

| Measure | The step |
|---|---|
| `time.bench.ms` | `benchRun`: the 2 timed routes, the rule "same twice", `checkProperties`, `measureQuality` and the faults |
| `time.facts.ms` | `routeFacts`: `exactStretches`, `checkProperties` and `mixedSegments` |
| `time.measures.ms` | `routeMeasures` |
| `time.hash.ms` | the route hash |
| `time.placement.ms` | the packed input, its graph and `placementFacts`, one time for each pack output |
| `time.joint.ms` | `jointMeasures` of the record |

- The records of a shared route have the same route times. The records of a shared pack output have the same `time.placement.ms`.
- The exact network of `exactStretches` and the shortest ways of its edges come at the first use for a graph. Thus `time.facts.ms` of the first router of a pack output holds most of that time.
- With 2 timed routes, `route.ms` is the time of the longer route. Thus `time.bench.ms` minus `route.ms` is the time of the shorter route and of the checks of `benchRun`.

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

The stretch of a route comes from `exactStretches` of `highways` 0.6.0. It is the route length without the two plug ends, divided by the shortest way of the network of the packed input. `route.cap.<cap>` counts the edges with a stretch above the cap. An edge without a route or without a way in the network does not count.

The first run measured the stretch against the route of `corners` (the bundle stretch B3). The test `facts-parity.test.ts` compares the two counts on small inputs.

- The two counts of `route.mixed` are the same.
- The cap counts differ. The exact model gives a value above 0 to `corners` also, and it gives fewer breaks to `plugs` and `sections-tree`.

## The analysis

`analyze(records, inputs)` gives the report. It is a pure function. `selectBest` of this package makes each pick.

- The headline numbers use only the inputs outside the stress cell. The field `stress` of the report holds the 6 cells of the stress inputs.
- The field `through` counts the breaks of `no-pass-through` for each value of `spacing` and each router.
- Each broken record of `through` has a cause: `overlap` (the pack has an overlap), `overflow` (the pack has overflow) or `router`.
- The field `fillBySpacing` gives the mean `pack.fill` of the pack records for each value of `spacing`.
- The field `count` holds the record count check. The field `subset` holds the headline cell on a subset of the inputs.

### The record count check

The analysis counts the inputs from the records, not from the manifest. The function `recordCount` gives the count.

- An input of the manifest is missing when it has no record. A record of an input outside the manifest is also a failure.
- The line "Inputs" of the report gives the count of the inputs with records, and the count of the manifest: the specs times the seeds.
- The section "The missing inputs" lists each missing input.
- `pnpm bench analyze` writes the report, and then fails on a missing input.
- The option `--allow-missing <file>` gives a list of input ids. The check does not fail on a missing input of the list.

### The headline on a subset

The option `--subset <file>` of `pnpm bench analyze` gives a list of input ids. With it, the report also gives the headline cell on these inputs only.

- The cell is `all` with the cap 1.25, outside the stress cell. The table puts it next to the headline cell on all inputs.
- The output groups of the subset come from the inputs of the subset.
- The file `packages/joint/data/joint-v2-recorded.txt` lists each input of `joint-v2` with records in the run `40666991882`. The workflow gives it to `analyze` on `joint-v2`.

A file of ids has one id on each line. The analysis ignores the empty lines and the lines that start with `#`. An id outside the corpus is an error.

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

## The corpus check

The manifest of `joint-v2` holds the field `claims`. The pure function `checkCorpus(manifest, inputs)` of the joint package examines each claim. It gives the broken claims with the ids of their inputs.

- `spacing`: each input outside the stress cell has margin + gap above 0. Each stress input has margin 0 and gap 0.
- `coverage`: the pairwise share of each array is 1.
- `minPerKind`: the least count of inputs of each board kind. The list `thin` names the kinds below the count.
- `maxBoxes`: each input has 1000 boxes or fewer.

The manifest of `joint-v1` does not change. Thus its claims are in the code (`JOINT_V1_CLAIMS`). They have no claim `spacing`, but the claim `stressOnly`: each input has margin 0 and gap 0. The kind `edge-cases` is thin.

The workflow uses the check as a gate:

1. The job `check` writes the manifest of the code, and compares it with the committed manifest. Then it starts `checkCorpus`. A difference or a broken claim stops the run.
2. The job `smoke` takes 1 input of each value of `spacing`, with count 10, seed 1 and edges. It packs it and routes it with `corners`.
3. `smoke` takes the first pack entry with no overflow and no overlap. It fails when an input outside the stress cell breaks `no-pass-through`.
4. `smoke` also fails when a stress input with routes does not break `no-pass-through`.
5. The jobs of the run start only after `check` and `smoke`.

The test `check.test.ts` makes a corpus that breaks each claim.

## Start a run

- The input `corpus` of the workflow selects the corpus. The default is `joint-v2`. A pull request runs `joint-v2`.
- A pull request runs the slice `pr`: seed 1 of the specs with count 10 and of the fixed cases.
- A manual run of the workflow, or a pull request with the label `bench:full`, runs the full corpus over 64 shards.
- The job `analyze` keeps the artifact `joint-report` with `report.json` and `report.md`. Each shard keeps its raw records as `joint-records-<shard>`.
- The job `analyze` fails when an input of the manifest has no records. It keeps the report also then.

### The shards

`planShards` gives the inputs to the shards by their planned cost. Each shard job computes the same plan, so the jobs need no shared file.

1. The predicted cost of an input is `inputCost(boxes, edges, pairs)`: the count of the pairs times the cost of one pair.
2. The cost of one pair in milliseconds is `4.37 + 0.595 * boxes * boxes / 1000 + 1.16 * boxes * edges / 1000`.
3. The planned cost of an input is `plannedCost(spec, boxes, edges, pairs)`: the predicted cost times the margin of its spec.
4. The plan takes the inputs from the most cost to the least cost. Each input goes to the shard with the least load.
5. An input does not go to a shard with an input of the same spec, while another shard has none. Thus a lost shard loses 1 seed of a spec, not 3.
6. In a shard, the inputs run from the least cost to the most cost. Thus a timeout loses only the costly inputs at the end.

The file `packages/joint/data/cost-margins.json` holds the cost model. The script `scripts/fit-cost.mjs` writes it from the logs of the shard jobs of a full run.

- The model comes from the wall time of each input in the run `40685494092`. That run used `highways` 0.6.0 and `packing` 0.2.10. All 303 inputs have a time.
- The fit makes the least sum of the squares of log(real / predicted). Thus the fit gives the typical time of an input of a size.
- The margin of a spec is the q90 of real / predicted over the seeds of the spec. The q90 uses linear interpolation.
- A spec without a measured time gets the default margin: the q90 of real / predicted over all inputs. This value is 2.84.

The fit of the run `40666991882` gave `8 + 5.5 * boxes * boxes / 1000 + 1.35 * boxes * edges / 1000`. On the new run, the 2 fits compare as follows.

| Fit | R² of the times | R² of the logs of the times |
|---|---|---|
| The old fit | 0.210 | 0.581 |
| The new fit | 0.229 | 0.762 |

- The counts of the boxes and the edges do not tell the time well. The 12 inputs with 1000 boxes and 4000 edges take from less than 1 second to 46 seconds for each pair. The best linear fit of the times has R² 0.37 only.
- The margins correct this spread for each spec. The dense spec with hubs and the gap has the margin 8.74. Its 3 seeds took 85, 87 and 93 minutes. The old fit gave them 21.8 minutes. The new plan gives them 91.6 minutes.
- The next 3 margins are 4.79, 3.71 and 3.68. These specs are the dense spec with hub chains and 1000 boxes, a dense dashboard with 10 boxes and a word cloud with 100 boxes.
- The new plan gives 717 minutes to all shards. The run took 641 minutes on the inputs.

The limit of a shard job is 360 minutes, the limit of GitHub. At 64 shards, the plan gives 91.6 minutes to the most costly shard. This shard has 1 seed of the dense spec with hubs. This load is less than half of the limit, so 64 shards and the limit of 360 minutes stay.

`pnpm bench plan --shards <n>` shows the planned cost of the most costly shards. The lines of the logs keep the words "predicted minutes".

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

The corpus `joint-v2` is the fix. It adds the dimension `spacing`. The corpus `joint-v1` stays as the stress cell of decision d7.

## The prediction for joint-v2

This prediction comes before the full run on `joint-v2`. `checkPredictionsV2` of the analysis gives the verdict of each part. The rules and the entries stay the same after the run.

The run on `joint-v2` has 2 changes from the first run, other than the corpus:

- The routers include the portfolio router `portfolio` of `highways` 0.5.1. Thus the benchmark has 120 pairs.
- `portfolioFacts` of `highways` 0.5.1 gives `route.cap.<cap>` and `route.mixed`. The cap uses the stretch of the exact model, not the stretch against `corners`.

The other rules do not change: `selectBest` for each pick, the level `hard`, the floor, the folds, the intervals and `outputGroups`. The headline numbers use only the inputs outside the stress cell. The cell of the headline is `all` with the cap 1.25.

- Q1: In the stress cell, each router breaks `no-pass-through` on each input with edges.
- Q2: For the values `gap`, `margin` and `both`, the breaks of `corners`, `sections` and `shared` from boxes that touch fall to 0.
- Q2 also: the report gives the cause of each break that stays: `overlap`, `overflow` or `router`. Q2 holds when no break has the cause `router`.
- Q3: The oracle gain is smaller than 0.445 in each cell. Its interval is above 0 in most cells.
- Q4: The best single pair of the headline cell is not `shelf+corners`, and its output group does not hold `shelf+corners`.
- Q5: The greedy portfolio with k = 3 gets at least 60% of the oracle gain on the held-out seeds, in most cells.
- Q6: The value `margin` gives a lower mean `pack.fill` than the value `gap`.
- Q7: The rule `collection` and the caps change the joint measures in 2 cells or more. A change is a different best pair, or an oracle score that differs by more than 0.005 from the cell `all` with the cap 1.5.

## The result of the joint-v2 run

The run [40666991882](https://github.com/mark1russell7/layout-contract/actions/runs/40666991882) of 2026-10-28 used the commit `b77b59c`. It had 48 shards and 120 pairs.

### The missing inputs

3 shards of 48 stopped at the time limit of 90 minutes. Thus the report has no records for 18 of the 303 inputs.

- The order of the shards puts the 3 seeds of a spec in 3 adjacent shards. Thus the 18 inputs are 6 specs, each with its 3 seeds.
- The slow spec is `rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap`, with 1000 boxes and 4000 edges.
- The other 5 specs are a `freeAspect` circle grid (100 boxes), a stress `freeWidth` ellipse grid (100 boxes), a `gallery` (100 boxes), `oversize` (12 boxes) and a `dashboard` (10 boxes).
- The records hold 207 of the 222 inputs outside the stress cell, and 78 of the 81 stress inputs. The line "Inputs: 222" of the report counts the manifest, not the records.
- The column `1k` of the oracle gain thus has no dense spec with hubs. The other columns lose 1 or 2 specs.

L28 makes the shards finish: a heavy input gets a shard of its own, and the report counts the inputs with records.

### The predictions

| Id | Held | Facts |
|---|---|---|
| Q1 | no | In the stress cell, `corners`, `sections`, `shared` and `portfolio` break the rule on 926 of 936 records with routes. `plugs` breaks it on 936, and `straight` on 934. |
| Q2 | no | Outside the stress cell, `corners`, `sections` and `shared` have 84 broken records, all with the cause `router`. |
| Q3 | yes | The gain is below 0.445 in 6 of 6 cells. Its interval is above 0 in 6 cells. |
| Q4 | yes | The best pair of the cell `all` with the cap 1.25 is `maxrects-cp+corners`. |
| Q5 | yes | The portfolio with k = 3 gets at least 60% of the oracle gain in 6 of 6 cells. |
| Q6 | yes | The mean `pack.fill` is 0.396 for `margin`, 0.546 for `gap`, 0.541 for `both` and 0.739 for `stress`. |
| Q7 | yes | 3 cells have a different best pair or oracle score than the cell `all` with the cap 1.5. |

Q1 failed by a small margin. 10 stress records with routes have no break, because their boxes do not touch on the route.

Q2 failed for the spacings with one part only:

| Spacing | `corners` | `sections` | `shared` | Records with routes |
|---|---|---|---|---|
| `both` | 0 | 1 | 0 | 770 |
| `gap` | 17 | 19 | 17 | 837 |
| `margin` | 8 | 14 | 8 | 756 |

The broken records of `corners` and `shared` are the same records: 17 for `gap` and 8 for `margin`. The broken records of `sections` hold them, and 2 more for `gap`. `plugs` and `straight` break the rule on almost each record, because they draw straight lines.

A correction (2026-10-28): an earlier text gave the cause as a gap of 5 units, below the channel of 7.5. The rebuild of the 84 broken records shows a different fact:

- The distance from each box that a route passes to its nearest box is the spacing of the cell. It is 10 for `gap`, 20 for `margin` and 15 for `both`. Each value is wider than the channel.
- In the cells `gap` and `margin`, most of the boxes that a route passes are `extremeAspect` slivers, 1.3 to 4 units thick.
- Most first breaks are on the first segment out of the source box. Some routes pass an obstacle.
- 16 of the 17 records of `gap` come from 1 spec with slivers: `rect-grid.freeHeight.circle.corridors.extremeAspect`.

Thus a thin box between two lanes is the likely cause. The work item CLEARANCE-GAP of `highways` examines it.

Q6 compares cells with different mixes of inputs. Thus a part of the difference in fill comes from the mix, not from the margin.

### The headline cell

The cell is `all` with the cap 1.25, on the inputs outside the stress cell.

These numbers come from the easier part of the corpus. The 18 missing inputs hold the dense spec with 1000 boxes and hubs, which is the hard tail.

| Best pair | Misses | Score | Oracle | Gain | k = 3 share | k = 8 share |
|---|---|---|---|---|---|---|
| `maxrects-cp+corners` | 55 | 0.284 | 0.480 | 0.196 [0.152, 0.249] | 0.760 [0.658, 0.850] | 0.889 [0.797, 0.947] |

- The gain is largest at the count 100: 0.299 [0.212, 0.384]. At the count 1, it is 0.
- The cap and the rule `collection` change the gain by at most 0.008 between the cells.
- In the stress cell, the best pair is `shelf-first-input+corners`, and the oracle gain is 0.339. The level `hard` decides most picks there.

### The scope of the result

- The run used `packing` 0.2.6. Its `skyline` overlaps boxes in `freeArea` and `freeAspect` containers of the shapes circle, ellipse and polygon, with identical boxes. `packing` 0.2.10 fixes it.
- These records stay broken in this run, and they count as breaks of `pack.no-overlap`. The report does not count them by themselves.
- The router does not see the margins, the gap, the inset or the container. Thus the clearance comes only from the distances between the boxes.
- L28 starts the benchmark again on `highways` 0.6.0 and `packing` 0.2.10, with `exactStretches` for the cap.

## The prediction for the L28 run

This prediction comes before the second full run on `joint-v2`. The verdicts come from the report and the shard logs, by hand. The entries stay the same after the run.

The run has 4 changes from the joint-v2 run:

- The runner uses `highways` 0.6.0 and `packing` 0.2.10. The exact search of `highways` 0.6.0 is faster, and the members of its portfolio router changed. `packing` 0.2.10 fixes the overlaps of `skyline`.
- The plan gives the inputs to 64 shards by predicted cost, and each shard has 360 minutes.
- The report counts the inputs from the records, and analyze fails on a missing input.
- The report gives the headline cell on all inputs and on the subset of `data/joint-v2-recorded.txt`.

The joint-v2 run held 5 of its 7 claims. The 2 misses were claims about the routers at a high confidence. Thus the claims about the routers have a lower confidence here.

| Id | Confidence | Claim |
|---|---|---|
| R1 | 0.85 | Each of the 303 inputs has records, and analyze passes without `--allow-missing`. |
| R2 | 0.9 | No record with the pack `skyline` breaks `pack.no-overlap`. |
| R3 | 0.65 | Outside the stress cell, `corners` has 0 records broken with the cause `router` for `both`, 14 to 22 for `gap`, and 6 to 10 for `margin`. |
| R4 | 0.6 | The oracle gain of the headline cell on all 222 inputs outside the stress cell is between 0.16 and 0.24. |
| R5 | 0.55 | On the subset, the oracle gain of the headline cell is within 0.03 of 0.196. |
| R6 | 0.5 | The best pair of the headline cell is `maxrects-cp+corners` again. |
| R7 | 0.45 | Each shard of the dense spec with hubs and 1000 boxes finishes in less than 60 minutes. |
| R8 | 0.4 | The oracle gain at the count 1k is above 0.12. Without the dense spec with hubs, it was 0.103. |
| R9 | 0.75 | The greedy portfolio with k = 3 gets at least 60% of the oracle gain in each of the 6 cells. |

R4 gives the number with the hard tail. R5 shows the effect of the new versions alone. R7 and R8 are the risky claims.

## The result of the L28 run

The run [40685494092](https://github.com/mark1russell7/layout-contract/actions/runs/40685494092) of 2026-10-28 used the commit `e54d81f`. It used `highways` 0.6.0 and `packing` 0.2.10, with 64 shards and 120 pairs.

All 303 inputs have records, 36360 records in total. The line "Records: 26640" of the report counts only the 222 inputs outside the stress cell.

### The verdicts

| Id | Confidence | Held | Facts |
|---|---|---|---|
| R1 | 0.85 | yes | 303 of 303 inputs have records. Analyze passed without `--allow-missing`. |
| R2 | 0.9 | yes | No record breaks `pack.no-overlap`, with each pack. |
| R3 | 0.65 | yes | `corners` has 0 broken records for `both`, 17 for `gap` and 8 for `margin`. These are the same counts as in the joint-v2 run. |
| R4 | 0.6 | yes | The oracle gain of the headline cell on 222 inputs is 0.217 [0.168, 0.269]. |
| R5 | 0.55 | yes | On the subset of 207 inputs, the gain is 0.210 [0.164, 0.260]. The joint-v2 run gave 0.196. |
| R6 | 0.5 | yes | The best pair of the headline cell is `maxrects-cp+corners`. |
| R7 | 0.45 | no | The 3 shards of the dense spec took 85, 87 and 93 minutes. The plan predicted 21.8 minutes. |
| R8 | 0.4 | no | The oracle gain at the count 1k is 0.103 [0.053, 0.159]. |
| R9 | 0.75 | yes | The share of k = 3 is 0.653 to 0.771 in the 6 cells. |

7 of 9 claims held. The 2 risky claims failed.

### What the result shows

- The hard tail changes the headline only a little. The 15 new inputs outside the stress cell move the gain from 0.210 to 0.217.
- The dense spec with hubs adds no gain at the count 1k, and no break of `corners`.
- The new versions alone move the gain on the subset from 0.196 to 0.210. The interval of joint-v2 holds this value.
- The dense spec takes approximately 45 seconds for each pair. The faster exact search of `highways` 0.6.0 did not make it fast. The cost model of the plan underestimates it by a factor of 4.
- The headline cell has 42 misses, against 55 in joint-v2. The stress cell keeps `shelf-first-input+corners` as its best pair, with a gain of 0.368.

### The scope of the result

- The output hashes of `shared` and `sections` depend on the major version of Node. The order of the lanes in a run differs between Node 24 and Node 26. No route point moves, so the break counts do not change (`highways` #129).
- The CI of the benchmark uses Node 26. Thus the records of joint-v2 and of this run compare with each other. `highways` 0.8.0 fixes the lane order, and the hashes of these 2 routers change one time.
- The cause of the breaks through the slivers is open. See the correction under the result of the joint-v2 run.
