# The joint benchmark

The joint benchmark packs each input of a joint corpus, and then routes the packed input. It runs each pair of a pack entry and a router. The package `packages/joint` holds the runner and the analysis. The workflow `joint-bench.yml` runs them in CI.

- The corpus is `joint-v2` by default (`docs/JOINT-CORPUS.md`). The first run used `joint-v1`.
- The pack entries are the 12 entries of the benchmark of `packing` 0.2.10 without `push`, and the entry `select` (L32). The strategy `push` supports only the mode `incremental`, and each joint input is `offline`.
- The entry `select` is the composite strategy `select` of `packing` 0.2.15, the `DEFAULT_STRATEGY` of `packDefault`. Refer to "The prediction for the select packer (L32)".
- The routers are the 9 router strategies of `highways` 0.6.0, and the portfolio router `portfolio` of `highways` 0.6.0.
- The joint-v2 run of 2026-10-28 used `packing` 0.2.6 and `highways` 0.5.1. Version 0.6.0 changes the default members of `portfolio`.
- Since `highways` 0.9.1, the routers also hold the 5 highway strategies of wave 3 (`HIGHWAY_ROUTERS`): `steiner`, `gaps`, `streets`, `search` and `interchanges`. Each makes a plan of highways, then `follow` routes it.
- Thus the benchmark has 195 pairs. The runs before the space `bench-3` had 130 pairs, and the runs before L32 had 120 pairs. `joint-v2` has 303 inputs, and `joint-v1` has 285 inputs.
- The cost model of the shard plan gives each new pair the mean time of the 130 pairs of the fit. The first full run of 195 pairs gives the data for a new fit.
- The option `--lanes on` adds the 18 lane pairs of L13. Refer to "The lane pairs".
- The option `--iterate on` adds the 18 iteration pairs of L11. Refer to "The iteration pairs".
- The nightly sweep runs the same runner on configs of the joint strategy space. `docs/SWEEP.md` tells it.

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

## The lane pairs

The lane pairs are the joint strategy of L13, the routing-aware gaps. They size each gap from the routes that use it. The default run has no lane pairs. The option `--lanes on` of `pnpm bench run` and `pnpm bench plan` adds them, and the input `lanes` of `joint-bench.yml` gives that option.

A side with k lanes needs 2 clearances and k - 1 lane spaces: `laneNeed(k) = 2 * 5 + (k - 1) * 4`. 1 lane needs 10 units, 3 lanes need 18 units, and the cap of 8 lanes gives 38 units.

- The clearance 5 is the corner margin of the routers of `highways`. The lane space 4 is the lane width of `shared` and of `roomDemand`.
- In the corpus, the space between two boxes is 2 margins and 1 gap. It is 0 for `stress`, 10 for `gap`, 20 for `margin` and 15 for `both`.
- Thus a side of `gap` is too narrow for 2 lanes or more. A side of `both` is too narrow for 3 lanes, and a side of `margin` for 4 lanes.

### The steps of a lane pair

A lane pair has a variant, a base pack entry and a router. Its id is `<variant>.<pack entry>.<router>+<router>`, for example `lanes-sides.rows.corners+corners`. The base pair is `<pack entry>+<router>`.

1. The runner packs the input with the base pack entry, and routes it with the router. These are the pack and the routes of the base pair.
2. `sideLanes` counts the lanes along each side of each placed box. The strip of a side reaches to the nearest box that faces it, and at least 10 units out.
3. A route segment counts for a side when it runs along the side in the strip. The count of a side is the largest count of routes at one place of the side.
4. `laneMargins` gives each side the margin `(need - gap) / 2`, so that 2 facing sides together give the need. A margin does not get smaller than the margin of the input.
5. The runner packs the input again with the new margins, and routes it again with the router. A variant with 2 passes does steps 2 to 5 two times.
6. The record holds the last pack and the last routes. The runner scores the pack against the input with the old margins, so `pack.fill` and the checks compare with the base pair.

The 3 variants:

| Variant | Margins | Passes | Why |
|---|---|---|---|
| `lanes-max` | Each box gets 1 margin for its 4 sides: the margin of its side with the largest need. | 1 | The simplest form: the margin of each item of `packing` as one number. |
| `lanes-sides` | Each side gets its own margin, turned with the box (`Sides` of `packing`). | 1 | The space goes only to the sides with lanes, so the fill drops less. |
| `lanes-sides2` | The same as `lanes-sides`. | 2 | The second pack moves the boxes, and new neighbors make new channels. The second pass counts these channels. |

The base pack entries are `rows`, `maxrects-cp` and `select`, and the routers are `corners` and `portfolio`. Thus `laneEntries()` gives 3 × 3 × 2 = 18 lane pairs.

- `rows+portfolio` and `select+portfolio` are the 2 baselines. `maxrects-cp+corners` is the best pair of L32. Each of these pairs has 3 lane pairs.
- A box with no lanes keeps its margin. When no side gets a larger margin, the lane pair has the output hash of its base pair.

The records of a lane pair add these measures:

| Measure | Value |
|---|---|
| `lanes.short.base` | The count of the sides that are narrower than the need of their lanes, in the layout of the base pair |
| `lanes.short` | The same count in the layout of the lane pair, with its own routes |
| `lanes.max.base`, `lanes.max` | The largest lane count of a side, in the 2 layouts |
| `lanes.margin` | The mean growth of the margin of each side of each box, in units |
| `time.lanes.ms` | The time of the lane counts and the margins, in milliseconds |

`pack.ms` is the sum of the pack times of the passes. `joint.ms` and `ms` are the total time of all packs, routes and lane counts. The field `options.lanes` of the record gives the variant, the base pair and the constants.

### What packing and highways let the lane pairs do today

- `packing` gives each item its own margin, as 1 number or as 4 sides (`Sides`). A turn of 90 degrees turns the sides. The variant `lanes-sides` uses this.
- `packing` has 1 gap for all items. It has no gap for one pair of items and no space for one channel.
- Thus a lane need moves with a box side, not with a channel. Two boxes on opposite sides of a channel each get half the need, also when only one box needs it.
- The routers of `highways` 0.8.1 do not read the margins. They see only the placed boxes. Thus a lane pair changes only the positions of the boxes.
- The room module of `highways` (`roomDemand`, `levelRoom`, `gapLaneCounts`) counts the lanes of its own links in its own gaps, and moves the nodes. It does not count the lanes of a list of routes by box side. Thus `sideLanes` of the joint package does this count.
- No rule of `checkProperties` measures the room of a lane. A gain can come only through `no-pass-through`, the cap, the overflow and the fill.

The request text for `packing`:

> Request for `packing`: add an option for the space between two items, or for the space of one channel. The joint benchmark of `layout-contract` (L13) counts the routes in each gap after a first pack. Today it can give a margin only to each side of an item. Thus a channel that needs space gives it to both boxes, and the fill drops more than necessary. The option takes pairs of item ids with a space, or a list of channels with a space. A pair without an entry keeps the global gap.

The contract 0.2.14 has the input field of this request: `pairGaps`, a list of `{ a, b, gap, lanes? }` (L49). The hard rule `no-overlap` uses the gap of a pair in place of its two margins. The `README.md` of the package tells its rules.

### The lane pairs in the analysis

The lane pairs are pairs of the analysis, as each other pair. They join the floor, the oracle, the ranking and the portfolios. Thus a lane pair can move the floor, and the misses of the other pairs can go up.

- The field `lanes` of the report gives each lane pair against its base pair, for the inputs of the headline and for the stress inputs. The section "The lane pairs" of `report.md` shows it.
- Each row gives the skipped records, the same output hashes, the broken records and the breaks of `no-pass-through`, and the overflow.
- Each row also gives the mean `joint.fill`, `pack.fill` and `joint.ms`, and the lane measures.
- The default compare of `pnpm bench analyze` adds each lane pair against its base pair. The default of `--oracle-without` is the lane pack entries when the records have lane pairs.
- When the records have lane pairs, `pnpm bench analyze` also writes `report-without-lanes.json` and `report-without-lanes.md`. These reports remove the lane pairs. Their misses compare with the runs before L13.
- The fields `through`, `fillBySpacing` and `times` do not count the lane pairs. Thus they compare with the runs before L13.
- `fit-cost.mjs` counts the pairs and the lane passes of each input of the run. Thus a run with the lane pairs gives a fit of the lane term.

The plan gives each lane pass the time of the lane term of the cost model. The 18 lane pairs have 24 passes (`lanePasses`). Refer to "The shards".

| Plan at 64 shards | All shards | The most costly shard |
|---|---|---|
| The default run, 130 pairs | 301.6 minutes | 16.1 minutes |
| `--lanes on`, 130 pairs and 18 lane pairs | 464.6 minutes | 31.0 minutes |

The run `40757153151` of L13 took 31.5 real minutes in its most costly shard. The plan before the lane term gave this shard 25.0 minutes.

## The iteration pairs

The iteration pairs are the joint strategy of L11: place, route, and place again. A lane pair of L13 sets the gaps one time, from the routes of the base pair. An iteration pair measures the corridors of each new layout from its real routes, and changes the gaps again. It stops when a round gives no gain. The default run has no iteration pairs. The option `--iterate on` of `pnpm bench run` and `pnpm bench plan` adds them, and the input `iterate` of `joint-bench.yml` gives that option.

### The steps of an iteration pair

An iteration pair has a round cap R, a base pack entry and a router. Its id is `lanes-iter<R>.<pack entry>.<router>+<router>`, for example `lanes-iter3.maxrects-cp.corners+corners`. The base pair is `<pack entry>+<router>`.

1. The runner packs and routes the input as the base pair. `sideLanes` counts the lanes along each side of each placed box.
2. Round 1 uses the margins of `lanes-sides` (`laneMargins`). Thus round 1 has the layout of `lanes-sides`.
3. Each next round counts the lanes of the routes of the last round with `sideLanes`. `sideCall` gives each side one of 3 calls.
4. `iterMargins` changes the margins by the calls. The runner packs and routes again with the new margins.
5. The runner scores each round by the pick levels of the headline cell (`compareRecords`): the hard value, the overflow area, `joint.fill`, then the ties.
6. The chain keeps the best round. A later round replaces it only when it is better. Thus the result is not worse than round 1 at any time.
7. The chain stops at the cap, at a round without gain, when no margin changes, or when a pack or a route fails.

The 3 calls of a side:

| Call | The side | The new margin |
|---|---|---|
| `crowded` | It has k lanes, a node faces it, and the corridor is narrower than `laneNeed(k)`. | `(laneNeed(k) - gap) / 2`, if that is larger. The 2 boxes of the corridor share the need, as in `laneMargins`. |
| `empty` | No lane runs along it. | The floor: the margin of the input, and at least `(1 - gap) / 2`. |
| `kept` | It has lanes and enough space, or no node faces it. | No change. |

- The floor comes from decision `d7`: a margin and a gap of 0 break `no-pass-through`. Thus the space of 2 facing sides is more than 0 (`ITER_FLOOR_SPACE` is 1 unit). Only the stress cell has a margin and a gap of 0.
- A margin does not go below the margin of the input. A smaller margin breaks the rule `no-overlap` of the pack, because the runner scores each pack against the input.
- The gap of each pair of items of `packing` (k77) is not built yet. `iterMargins` gives a `RoundSpace`, and a later version can give a gap for each pair of facing boxes there. The corridors and the calls stay the same.

The variants are `lanes-iter1`, `lanes-iter2` and `lanes-iter3`. The base pack entries and the routers are the same as for the lane pairs. Thus `iterEntries()` gives 3 × 3 × 2 = 18 iteration pairs.

- The 3 variants of one pack entry and router share one chain of rounds. A cap of R reads the first R rounds of the chain. Thus `lanes-iter3` costs the same as all 3 variants.
- `lanes-iter1` has the output of `lanes-sides`. Thus a run with `--iterate on` compares the rounds with `lanes-sides` without the lane pairs.

The records of an iteration pair hold the best round. They add these measures to the measures of the lane pairs:

| Measure | Value |
|---|---|
| `iter.rounds` | The count of the rounds that the pair used, from 1 to its cap |
| `iter.best` | The number of the best round |
| `iter.stop` | The end of the rounds, as the index in `ITER_STOPS`: 0 the cap, 1 no gain, 2 the same margins, 3 a failure |
| `iter.widened`, `iter.narrowed` | The count of the sides that the rounds widened and narrowed |

`pack.ms`, `joint.ms` and `ms` are the sum of the base pair and of all used rounds, also the rounds after the best round. `time.lanes.ms` is the time of the lane counts and the margins.

### The iteration pairs in the analysis

An iteration pair is also a lane pair, because its pack part starts with `lanes-`. Thus the rows of `lanes`, `report-without-lanes.json` and the default of `--oracle-without` include it.

- Each row of an iteration pair has the field `iterate`. It gives the mean rounds, the mean best round and the inputs with a gain after round 1. It also gives the ends of the rounds and the changed sides.
- The section "The rounds of the iteration pairs" of `report.md` shows these fields.
- The default compare adds each iteration pair against its base pair. It also adds `lanes-iter2` and `lanes-iter3` against `lanes-iter1` of the same pack entry and router.

### The plan of the iteration pairs

The plan gives each round the cost of a lane pass (`LANE_PASS_COST`, 3 pairs). Each of the 6 chains has 3 rounds. Thus the 18 iteration pairs have the cost of 54 pairs (`iterPlanPairs`), and the plan has the cost of 184 pairs.

| Plan at 64 shards | All shards | The most costly shard |
|---|---|---|
| `--iterate on`, 130 pairs and 18 iteration pairs | 426.9 minutes | 22.7 minutes |
| `--lanes on --iterate on`, 166 pairs | 593.9 minutes | 31.6 minutes |

- Run the iteration pairs without `--lanes on`. With both, the plan gives more than 30 minutes to the most costly shard.
- The most costly shard has 1 input: one seed of the dense spec with hubs and 1000 boxes. More shards do not make it shorter.
- In L13, this spec took 31.5 minutes, and the plan gave it 25.0 minutes. The plan counts 3 pairs for each lane pass, but a lane pass on this spec took the time of approximately 4.6 pairs.

The table above uses the margins of L32. L35 fits the lane term and the margins from the run of L13 (refer to "The shards").

- A lane pass then has the lane term. A round of an iteration pair keeps the cost of 3 pairs (`LANE_PASS_COST`), because no run has measured the rounds yet.
- The margins of L13 are larger. Thus the plans of L35 are larger than the table above.

| Plan at 64 shards, the model of L35 | All shards | The most costly shard |
|---|---|---|
| `--iterate on` | 542.0 minutes | 36.8 minutes |
| `--lanes on --iterate on` | 623.7 minutes | 41.8 minutes |

- Each plan stays far below the limit of 360 minutes of a shard job.
- A run with `--iterate on` gives the times of the rounds for a later fit. `fit-cost.mjs` does not count the rounds of a line of the bench yet.

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
- The folds come from the split `default` of the split file of the corpus ("The split files"). Its 3 folds hold out one seed each.
- The share of a portfolio is its gain over the first member, divided by the gain of the oracle over the first member. The sums go over the held-out inputs of the 3 folds.
- The report gives the share for k = 3 and for k = 8.

### The baseline

The option `baseline` of `analyze` names one pair or a list of pairs. With it, each cell of the report also gives each baseline and the gains over it. The cells are the headline cells, the cell of the subset and the stress cells.

- The field `baseline` of a cell gives the misses and the mean score of the first baseline pair. The field `baselines` gives each baseline pair, in the order of the option.
- Each gain is the score of a pick minus the score of the baseline on each input, with an interval. The picks are the best pair, the oracle and the greedy portfolios.
- The portfolios use the picks on the held-out seed of each fold. Thus each input has one held-out pick.
- `pnpm bench analyze` uses the baseline `rows+portfolio` (`BASELINE`). When the records have the pair `select+portfolio`, it also uses that pair.
- The option `--baseline <pair[,pair]>` gives a different list of pairs, and `--baseline none` removes the baselines.
- A manual run of `joint-bench.yml` with the input `records-run` analyzes the records of that earlier run, with no new benchmark run.

### The pairwise comparison

The option `compare` of `analyze` gives a list of pairs `[a, b]`. Each cell then compares `a` with `b`.

- The comparison gives the misses and the mean score of each pair.
- The gain is the score of `a` minus the score of `b` on each input, with an interval.
- The count `onlyA` gives the inputs where `a` reaches the floor and `b` misses it. The count `onlyB` gives the opposite case.
- `pnpm bench analyze --compare <a>:<b>[,<a>:<b>]` gives the comparisons. When the records have `select+portfolio` and `rows+portfolio`, the default is `select+portfolio:rows+portfolio`.

### The removal of a pack entry

- The option `excludePacks` of `analyze` removes the records of these pack entries before the analysis. In `pnpm bench analyze`, it is `--exclude-pack <id[,id]>`.
- The option `without` gives a second oracle in each cell, without the pairs of these pack entries. In `pnpm bench analyze`, it is `--oracle-without <id[,id]>`. When the records have `select`, the default is `select`.
- The field `without` of a cell gives the score of the second oracle. It also gives the difference of the 2 oracles on each input, with an interval, and the count of the inputs where they differ.
- A pack entry without records is an error.

### The check of select

The option `composite` of `analyze` names a composite pack entry and the member that it picks on each input. When the records have `select`, `pnpm bench analyze` gives this option.

- `selectMemberOf` gives the member of an input. The table of `select` in `packing` picks `rows` or `maxrects-bl` from the features of the input.
- A record does not hold the member. Its options are the options of `select`, and a record has no trace.
- A record of `select` is the same as its member when the record of the member with the same router has the same output hash.
- The output hash of a joint record is `jointHash` of the pack hash and the route hash. Thus the same output hash gives the same pack hash and the same route hash.
- For each member, the field `composite` counts the inputs and the records. It also counts the skipped records, the same records, the different records and the records without a record of the member.
- The field `matches` counts, for each other pack entry, the inputs where each record of `select` has the output hash of that entry. This count does not use the table.
- The check reads all records: the stress inputs, and also the records of `--exclude-pack`.

### The route times and the shard times

- The option `times` of `analyze` gives a list of specs. For each seed of a spec, the report gives the median and the maximum `route.ms` of each router. The first router is `shared-all`.
- `pnpm bench analyze --times <spec[,spec]>` gives the specs. The default is the dense spec with hubs and 1000 boxes (`DENSE_HUBS`), when the slice has it.
- The records do not hold the wall time of an input or of a shard. The log line of each input holds the wall time of that input.
- The option `jobs` gives the jobs of the run, from `gh run view <id> --json jobs`. `pnpm bench analyze --jobs <file>` reads that file.
- With the jobs, the report gives the minutes of each shard job and of its step `Run one shard`. The verdict holds when each shard succeeds and each step takes less than 60 minutes.
- The jobs `analyze` and `reanalyze` of `joint-bench.yml` read the jobs of their run with one call of `gh run view`.
- `pnpm bench analyze` reads the files of the records also in the folders of the directory of `--records`. Thus it reads the output of `gh run download`.

### The intervals

- Each interval is a 95% interval of a cluster bootstrap with 1000 samples. A cluster is the 3 inputs of one spec.
- An interval that holds 0 is "open".

### The output groups

`outputGroups` puts the pairs with the same output hash on each input in one group. A group counts as one candidate for the best pair and for the portfolios. Its id is its first pair in sort order.

### The ranking of the output groups

The field `ranking` of a cell gives the output groups from the best to the worst.

- Each step takes the best of the other groups by the levels of the best pair: the misses, then the score. Thus the group of rank 1 is the best pair.
- Each row gives the rank, the id of the group, its members, its misses and its score.
- The field `packRanks` gives the rank of the first group of each pack entry: the first group with a pair of that entry.
- `report.json` holds each group. `report.md` shows the first 20 groups of the headline cell (`RANK_TOP`). The option `--rank-top <n>` changes this count.

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

### The split files

A split file of `corpus-split/1` is beside each manifest, in `packages/joint/corpus/splits`. Its name has the corpus hash, so the manifest does not change. `docs/CORPUS-CHECKS.md` tells the format and the checks.

- The split `default` of `joint-v1` and of `joint-v2` has 3 folds. Each fold holds out one seed and trains on the other 2 seeds.
- The job `check` reads the split file with `loadSplit`. A missing file, a wrong corpus hash or a bad fold stops the run.
- `pnpm bench analyze` gives the folds of the split `default` to `analyze`. These folds are the folds of leave-one-seed-out, so the report does not change.
- On the slice `pr`, a fold without held-out inputs gives no row. A training seed without inputs adds no input.
- The pinned corpus hashes are `277ffd12181e74ef` for `joint-v1` and `1d0909caec40631e` for `joint-v2`. A change of an input needs a new split file.

## Start a run

- The input `corpus` of the workflow selects the corpus. The default is `joint-v2`. A pull request runs `joint-v2`.
- A pull request runs the slice `pr`: seed 1 of the specs with count 10 and of the fixed cases.
- A manual run of the workflow, or a pull request with the label `bench:full`, runs the full corpus over 64 shards.
- The job `analyze` keeps the artifact `joint-report` with `report.json` and `report.md`. Each shard keeps its raw records as `joint-records-<shard>`.
- The job `analyze` fails when an input of the manifest has no records. It keeps the report also then.

### The shards

`planShards` gives the inputs to the shards by their planned cost. Each shard job computes the same plan, so the jobs need no shared file.

1. The predicted cost of an input is `inputCost(boxes, edges, pairs, passes)`. It adds the cost of the pairs and the cost of the lane passes.
2. The cost of one pair in milliseconds is `4.38 + 0.45 * boxes * boxes / 1000 + 0.832 * boxes * edges / 1000`.
3. The cost of one lane pass in milliseconds is `8.75 + 0.853 * boxes * boxes / 1000 + 0.782 * boxes * edges / 1000`.
4. The planned cost of an input is `plannedCost(spec, boxes, edges, pairs, passes)`: the predicted cost times the margin of its spec.
5. The plan takes the inputs from the most cost to the least cost. Each input goes to the shard with the least load.
6. An input does not go to a shard with an input of the same spec, while another shard has none. Thus a lost shard loses 1 seed of a spec, not 3.
7. In a shard, the inputs run from the least cost to the most cost. Thus a timeout loses only the costly inputs at the end.

The file `packages/joint/data/cost-margins.json` holds the cost model. The script `scripts/fit-cost.mjs` writes it from the logs of the shard jobs of a full run.

- The pair term comes from the wall time of each input in the run `40743187036` of L32. That run used `highways` 0.8.1 and `packing` 0.2.16, with the 130 pairs of the runner. All 303 inputs have a time.
- The lane term and the margins come from the run `40757153151` of L13. That run had 130 pairs and 18 lane pairs with 24 passes on each input.
- In that run, each input has the same ratio of passes to pairs. Thus the fit keeps the pair term of L32 and fits only the lane term.
- The fit makes the least sum of the squares of log(real / predicted). Thus the fit gives the typical time of an input of a size.
- The margin of a spec is the q90 of real / predicted over the seeds of the spec. The q90 uses linear interpolation.
- A spec without a measured time gets the default margin: the q90 of real / predicted over all inputs. This value is 2.91.

On the run `40757153151`, the model before the lane term gave each pass the cost of 3 pairs.

| Model | R² of the times | R² of the logs of the times |
|---|---|---|
| Each pass costs 3 pairs | 0.490 | 0.732 |
| The lane term | 0.543 | 0.744 |

On a small input, one lane pass costs approximately 2 pairs. Its term of the boxes and the edges is approximately the term of 1 pair.

The fit of the run `40685494092` (L29) gave `4.37 + 0.595 * boxes * boxes / 1000 + 1.16 * boxes * edges / 1000`, from 120 pairs. On the run `40743187036`, the 2 fits compare as follows.

| Fit | R² of the times | R² of the logs of the times |
|---|---|---|
| The fit of L29 | 0.461 | 0.748 |
| The fit of L32 | 0.638 | 0.759 |

- The counts of the boxes and the edges do not tell the time well. The 12 inputs with 1000 boxes and 4000 edges take from 0.08 to 7.86 seconds for each pair.
- The margins correct this spread for each spec. The dense spec with hubs and the gap had the margin 1.96 in L32, and it has 3.17 since L35.
- In L32, the 3 seeds of this spec took 12.0, 17.0 and 12.1 minutes.
- The 3 largest margins are 3.72, 3.72 and 3.65. These specs have 100 boxes and medium edges with hubs.
- The L32 plan gave 301.6 minutes to all shards, and the run took 257.2 minutes on the inputs. The L29 plan gave 776.7 minutes for 130 pairs.

The pair term and the margins come again from the run `40884908305` of L63 since 2026-10-29. That run has the 195 pairs of `bench-3`, and its records equal the records of run `40832034625`.

| Fit | R² of the times | R² of the logs of the times |
|---|---|---|
| The fit before L63 | 0.296 | 0.735 |
| The fit of L63 | 0.511 | 0.775 |

- The new pair term is `3.98 + 1.03 * boxes * boxes / 1000 + 1.61 * boxes * edges / 1000`. The default margin is 3.19.
- The most costly shard has 1 input: a seed of the dense spec with hubs and 1000 boxes. The plan gives 78.9 minutes to each of its 3 seeds. Their shards took 74.5, 49.5 and 80.7 minutes.
- More shards do not make this shard shorter. Only a faster runner on this input does.

The margins of L13 are larger than the margins of L32. Thus the plan of a default run is 383.0 minutes since L35, with 26.0 minutes for the most costly shard.

The limit of a shard job is 360 minutes, the limit of GitHub. At 64 shards, the most costly shard has 1 seed of the dense spec with hubs. Before the fit of L32, the plan gave it 99.2 minutes.

- With 13 shards, the plan keeps each shard of a default run below 30 minutes: 29.5 minutes for the most costly shard. 12 shards give 31.9 minutes.
- The default stays 64 shards. Each shard of the plan is then far below the limit of 360 minutes.

To fit the model again from a full run, write the logs of its jobs into one file. Then start `fit-cost.mjs` in `packages/joint`:

```sh
gh run view <run id> -R mark1russell7/layout-contract --log > logs/run.log
node scripts/fit-cost.mjs --logs logs --run <run id> --commit "$(gh run view <run id> -R mark1russell7/layout-contract --json headSha --jq .headSha)"
```

- A line of the bench gives no counts. The script then counts the pairs and the passes of the code: 130 pairs since L32, and 24 passes with `--lanes on`.
- Use a run with the pack entries, the routers and the lane pairs of the code.
- A unit of the sweep prints its counts. The script adds the units of one input. `docs/SWEEP.md` tells the sweep.
- The option `--terms` selects the terms to fit: `pair`, `lane`, `all` or `auto`. The default `auto` fits both terms only when the ratio of passes to pairs changes between the inputs.
- The script compares the new fit with the fit of `data/cost-margins.json` before it writes the file.

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
- From `highways` 0.8.0 (L31), Node 24 and Node 26 give the same lane order and the same hashes.
- The cause of the breaks through the slivers is open. See the correction under the result of the joint-v2 run.

## The prediction for the sequential baseline (L10)

The baseline is the default pack and the default router in sequence: `rows+portfolio`. Each co-optimization idea gets a score against it, on the same corpus and seeds. The first numbers come from the records of the run 40685494092, with no new run. This prediction comes before the analysis of the baseline.

| Id | Confidence | Claim |
|---|---|---|
| B1 | 0.7 | In the headline cell, the baseline has more misses than the best pair, which has 42. |
| B2 | 0.5 | In the headline cell, the score of the best pair is higher than the score of the baseline by 0.05 or more. |
| B3 | 0.55 | In the headline cell, the oracle score is higher than the score of the baseline by 0.25 or more. |
| B4 | 0.4 | In the stress cell with the cap 1.25, the score of the best pair is higher than the score of the baseline by 0.1 or more. |
| B5 | 0.75 | In each of the 6 cells, the greedy portfolio with k = 3 has a higher score than the baseline on the held-out seeds. |

## The result of the sequential baseline (L10)

The run [40709328189](https://github.com/mark1russell7/layout-contract/actions/runs/40709328189) of `joint-bench.yml` analyzed the records of the run 40685494092, with the input `records-run`. It did not start the benchmark again. The records hold 303 of 303 inputs and 120 pairs. The cells of the best pair and of the oracle are the same as in the result of the L28 run.

### The verdicts

| Id | Confidence | Held | Facts |
|---|---|---|---|
| B1 | 0.7 | yes | The baseline misses the floor on 145 of 222 inputs. The best pair `maxrects-cp+corners` misses it on 42. |
| B2 | 0.5 | yes | The best pair scores 0.299 and the baseline scores 0.226. The gain is 0.072 [0.036, 0.114]. |
| B3 | 0.55 | yes | The oracle scores 0.516. Its gain over the baseline is 0.290 [0.226, 0.352]. |
| B4 | 0.4 | no | In the stress cell with the cap 1.25, the best pair `shelf-first-input+corners` scores 0.209 and the baseline 0.181. The gain is 0.028 [-0.046, 0.109], open. |
| B5 | 0.75 | yes | On the held-out seeds, the gain of k = 3 over the baseline is 0.178 to 0.261 in the 6 cells. The low end of each interval is above 0.12. |

4 of 5 claims held. The risky claim B4 failed.

### The cells

Each gain is the score of a pick minus the score of the baseline on each input. The portfolios use the picks on the held-out seeds. The rule `collection` gives the same values as the rule `all` to 0.001, so the table shows only the rule `all`.

| Inputs | Cap | Baseline misses | Baseline score | Best pair gain | Oracle gain | k = 3 gain | k = 8 gain |
|---|---|---|---|---|---|---|---|
| 222 | 1.1 | 166 | 0.173 | 0.115 [0.074, 0.166] | 0.338 [0.272, 0.402] | 0.261 [0.202, 0.326] | 0.302 [0.239, 0.365] |
| 222 | 1.25 | 145 | 0.226 | 0.072 [0.036, 0.114] | 0.290 [0.226, 0.352] | 0.240 [0.181, 0.298] | 0.268 [0.205, 0.329] |
| 222 | 1.5 | 117 | 0.292 | 0.012 [-0.027, 0.051] open | 0.231 [0.175, 0.287] | 0.178 [0.124, 0.232] | 0.222 [0.166, 0.280] |
| stress 81 | 1.1 | 66 | 0.163 | 0.045 [-0.030, 0.129] open | 0.413 [0.315, 0.514] | 0.114 [0.040, 0.198] | 0.315 [0.233, 0.410] |
| stress 81 | 1.25 | 64 | 0.181 | 0.028 [-0.046, 0.109] open | 0.396 [0.301, 0.498] | 0.097 [0.027, 0.174] | 0.314 [0.224, 0.415] |
| stress 81 | 1.5 | 64 | 0.181 | 0.048 [-0.022, 0.128] open | 0.396 [0.302, 0.498] | 0.116 [0.043, 0.201] | 0.313 [0.224, 0.412] |

On the subset of 207 inputs, the headline cell gives the baseline 135 misses and the score 0.231. The gain of the oracle is 0.284 [0.222, 0.348] there.

### What the result shows

- The oracle gets 0.290 over the baseline. This is the space for co-optimization in the headline cell. Of this gain, the best single pair gets 0.072, and k = 3 gets 0.240 on the held-out seeds.
- The portfolio with k = 3 misses the floor on 16 held-out inputs, and the portfolio with k = 8 on 9. The baseline misses it on 145.
- The misses of the baseline and its score do not agree. At the cap 1.5, the best pair has 82 fewer misses, but its score is only 0.012 higher. In this cell, the mean `joint.fill` of the baseline on the inputs where it reaches the floor is approximately 0.62. For the best pair it is approximately 0.36.
- The misses of the baseline fall from 166 to 117 from the cap 1.1 to the cap 1.5. Thus the stretch of the routes of `portfolio` causes a large part of them.
- In the stress cell, no single pair is clearly better than the baseline. The level `hard` decides most picks there. The oracle and k = 8 get a large gain, but k = 3 gets only 0.097 to 0.116.

### The scope of the result

- A miss is relative to the 120 pairs. The baseline misses the floor on an input when another pair has fewer hard breaks, or less excess area, on that input.
- The score counts only `joint.fill` on the floor. A co-optimization idea that improves other measures does not show in this score.
- The baseline is `portfolio` of `highways` 0.6.0, with its defaults, after `rows` of `packing` 0.2.10. A new version of either package needs a new run.
- The portfolios learn their members on 2 seeds, and the held-out seed has the same specs. The baseline learns nothing. Thus the gains of the portfolios do not show the effect on new specs.

## The prediction for the select packer (L32)

This prediction comes before the next full run on `joint-v2`: 303 inputs, 3 seeds and 64 shards, as in the L28 run. The verdicts come from the report, a second analysis and the shard logs, by hand. The entries stay the same after the run.

The run has 3 changes from the run 40685494092:

- The runner has the pack entry `select`, with the options `{}`. Thus the run has 13 pack entries and 130 pairs.
- The runner uses `highways` 0.8.1 and `packing` 0.2.16. `highways` 0.8.1 routes the dense spec with hubs faster (ROUTE-SCALE).
- The run measures the baseline `rows+portfolio` of L10 again on the new versions. Thus the numbers of the baseline can move from 145 misses and the score 0.226.

### What select does on the joint inputs

`select` reads 4 features of the input: the count of the items, a fixed or free size, a rectangle container and the size spread. A table of 7 leaves picks one member, `rows` or `maxrects-bl`. The strategy packs with that member and the same seed.

- A fixed container with 316 items or fewer gets `rows` for identical sizes, and `maxrects-bl` for other sizes. With 317 items or more, a uniform spread gets `rows`, and a heavy tail gets `maxrects-bl`.
- A free size gets `rows`, except a heavy tail in a container that is not a rectangle. That input gets `maxrects-bl`.
- The output of `select` is the output of its member, with one more trace stage. Its pack hash and its measures are those of the member, but `pack.ms` is different.
- Thus `select` is deterministic for a seed, and the runner routes its output one time with the routes of its member.
- The supports of `select` are the union of the supports of `rows` and `maxrects`. `unsupportedOf` uses this union, as for each other entry.
- A member that does not support the cell throws `UnsupportedCell`. The runner then writes a skipped record with the reason `error: ...`.
- On `joint-v2`, `select` picks `rows` on 216 inputs and `maxrects-bl` on 87 inputs. Each input of `maxrects-bl` has the order `free` and no turn, so `maxrects` supports it.
- In the headline cell of 222 inputs, `select` picks `rows` on 159 and `maxrects-bl` on 63. In the stress cell of 81 inputs, it picks `rows` on 57 and `maxrects-bl` on 24.

### The claims

The verdicts of S2 and S5 to S8 need the analysis of the records with `--baseline select+portfolio`. S2 also needs the analysis without the records of `select`.

| Id | Confidence | Claim |
|---|---|---|
| S1 | 0.95 | No record of `select` is skipped. On each input, the records of `select` have the output hashes of the records of the member that the table picks: `rows` on 216 inputs and `maxrects-bl` on 87. |
| S2 | 0.9 | In each of the 6 cells, the oracle score is the same with and without the 10 pairs of `select`. |
| S3 | 0.6 | In the headline cell, the baseline `rows+portfolio` misses the floor on 135 to 155 inputs, and its score is from 0.206 to 0.246. |
| S4 | 0.7 | In the headline cell, `select+portfolio` misses the floor on fewer inputs than `rows+portfolio`. |
| S5 | 0.45 | In the headline cell, `select+portfolio` misses the floor on at least 15 fewer inputs than `rows+portfolio`. |
| S6 | 0.5 | In the headline cell, the score of `select+portfolio` is higher than the score of `rows+portfolio`, by less than 0.04. |
| S7 | 0.5 | In the headline cell, the best pair of `select` is in the first 5 output groups by the levels of the best pair: the misses, then the score. |
| S8 | 0.3 | The best pair of the headline cell is a pair of `select`. |
| S9 | 0.4 | On the held-out seeds, the gain of k = 3 over the baseline in the headline cell is more than 0.250. L10 gave 0.240. |
| S10 | 0.65 | On each of the 3 seeds of the dense spec with hubs, the median `route.ms` of the records of `shared-all` is less than 90 seconds. |
| S11 | 0.5 | Each shard takes less than 60 minutes on its inputs. The plan gives 99.2 minutes to the most costly shard. |

### The reasons for the confidences

In this document, 7 of 9 claims of L28 and 4 of 5 claims of L10 held. The misses were the risky claims, and most of them were claims of a gain over a strong single pair. The mean confidence of the claims above is 0.59. Thus approximately 6 or 7 of the 11 claims hold, if the confidences are correct.

- S1 and S2 follow from the code. The pick of the table comes from the features of the input alone. On each input, a pair of `select` has the values of a pair of `rows` or of `maxrects-bl`. Thus it cannot give the oracle a better pick.
- S3 is a check of the new versions. `highways` 0.8.0 changed the lane order of `shared` and `sections`, but no route point moved. ROUTE-SCALE changes the speed. Thus the baseline moves only a little.
- S4 has a high confidence because `select+portfolio` is `rows+portfolio` on 159 of the 222 inputs. Of the other 63 inputs, 36 have a fixed container. There, `rows` overflows more than `maxrects-bl`, and the excess area is a level of the floor.
- S5 and S6 are less sure. L10 showed that the misses and the score do not agree. The mean `joint.fill` of `rows` on the floor was approximately 0.62, and that of the best `maxrects` pair approximately 0.36. Thus a pick of `maxrects-bl` can reach the floor with a low fill.
- S7 and S8 are risky claims. `maxrects-cp+corners` was the best pair in the last 2 runs, with 42 misses. `select+corners` has the packs of `rows` on 159 headline inputs. It is the best pair only if `rows+corners` reaches the floor on most of these inputs.
- S9 is a risky claim of a gain over a strong pick. A pair of `select` joins 2 pairs in one candidate, so the greedy portfolio can cover more inputs with 3 members. But the portfolio learns on 2 seeds, and the new candidates can fit these seeds better than the held-out seed.
- S10 comes from the measures of `highways` 0.8.1 on the input `s2` of the dense spec: 36 seconds for each route of `shared-all`, against 1455 seconds before. The other seeds and the other pack outputs can take longer.
- S11 is a risky claim. The 3 shards of the dense spec took 85 to 93 minutes, and approximately 45% of that time was in the repeat route of `benchRun` (L30). `highways` 0.8.1 cuts the routes of `shared`, `shared-all` and `portfolio` by a factor of 10 or more. But `exactStretches` and the checks of each pack output stay the same, and the spec with hub chains has a plan of 38 minutes.

### The numbers of the claims

One analysis of the records gives the number of each claim. Start a manual run of `joint-bench.yml` with the input `records-run` set to the id of the run. The job `reanalyze` needs no other input. The defaults of `pnpm bench analyze` give each option of the table, and the job reads the shard times with one call of `gh run view`.

| Id | Field of `report.json` | Section of `report.md` |
|---|---|---|
| S1 | `composite`: the skipped records, and the same records of `rows` and `maxrects-bl` | The check of the pack entry select |
| S2 | `without` of each cell: the count of the inputs that differ | The oracle without select |
| S3 | `baselines` of the headline cell: the pair `rows+portfolio` | The baseline rows+portfolio |
| S4, S5 | `compare` of the headline cell: `missesA` and `missesB` of `select+portfolio` and `rows+portfolio` | The pairwise comparisons |
| S6 | `compare` of the headline cell: `scoreA`, `scoreB` and `gain` | The pairwise comparisons |
| S7 | `packRanks.select` and `ranking` of the headline cell | The ranking of the output groups |
| S8 | `best.members` of the headline cell. `packRanks.select` is 1 when the claim holds. | The cells |
| S9 | `baselines` of the headline cell: the gain of k = 3 over `rows+portfolio`, as in L10 | The baseline rows+portfolio |
| S10 | `times`: the median `route.ms` of `shared-all` on each seed of `DENSE_HUBS` | The route times |
| S11 | `shardTimes`: the step `Run one shard` of each shard, and `held` | The shard times |

- The field `without` replaces the second analysis of S2. The option `--exclude-pack select` gives the full report without `select`.
- The records of the run `40743187036` come from the code before these options. Thus the job `analyze` of that run does not give them, and the job `reanalyze` gives them.

## The result of the select packer (L32)

The run [40743187036](https://github.com/mark1russell7/layout-contract/actions/runs/40743187036) of `joint-bench.yml` used the commit `dba25d4`, with `highways` 0.8.1 and `packing` 0.2.16. It had 64 shards and 130 pairs, and each shard ended with success. The run [40746401999](https://github.com/mark1russell7/layout-contract/actions/runs/40746401999) analyzed its records again, with the options of the claims. The records hold 303 of 303 inputs.

### The verdicts

| Id | Confidence | Held | Facts |
|---|---|---|---|
| S1 | 0.95 | yes | The 3030 records of `select` have no skipped record. Each record has the output hash of its member: `rows` on 216 inputs (2160 records) and `maxrects-bl` on 87 inputs (870 records). |
| S2 | 0.9 | yes | In each of the 6 cells, the oracle score is the same without the pairs of `select`. 0 inputs differ. |
| S3 | 0.6 | yes | The baseline `rows+portfolio` misses the floor on 145 of 222 inputs, and its score is 0.226. These are the numbers of L10. |
| S4 | 0.7 | yes | `select+portfolio` misses the floor on 141 inputs, and `rows+portfolio` on 145. |
| S5 | 0.45 | no | `select+portfolio` has 4 fewer misses than `rows+portfolio`, not 15 or more. |
| S6 | 0.5 | yes | `select+portfolio` scores 0.239, and the baseline scores 0.226. The gain is 0.012 [-0.003, 0.032]. The claim holds on the point value, but the interval is open. |
| S7 | 0.5 | yes | `select+corners` is the output group 3 of 130, with 67 misses and the score 0.387. |
| S8 | 0.3 | no | The best pair is `maxrects-cp+corners` again, with 42 misses and the score 0.299. |
| S9 | 0.4 | no | On the held-out seeds, the gain of k = 3 over the baseline is 0.240 [0.181, 0.298]. This is the gain of L10. |
| S10 | 0.65 | yes | The median `route.ms` of `shared-all` is 1.9, 2.2 and 1.8 seconds on the seeds s1, s2 and s3. The maximum is 28.2, 42.7 and 24.9 seconds. |
| S11 | 0.5 | yes | The longest step `Run one shard` took 17.1 minutes, on shard 1. The plan gave 99.2 minutes to the most costly shard. |

8 of 11 claims held. The prediction expected approximately 6 or 7. The Brier score of the confidences is 0.144.

- The 3 misses were risky claims of a gain: S5, S8 and S9.
- The reason of S10 was wrong. The measure of 36 seconds for each route of `shared-all` is approximately 16 times the median on s2. The maximum on s2, 42.7 seconds, is near the measure.
- The plan of S11 gave the most costly shard approximately 6 times its real time.

### The cells

The gain is the score of `select+portfolio` minus the score of `rows+portfolio` on each input. The rank is the rank of the first output group of `select`. The table shows only the rule `all`. The rule `collection` gives the same misses and gains.

| Inputs | Cap | `rows+portfolio` misses | `select+portfolio` misses | Gain | Rank of `select` | Best pair |
|---|---|---|---|---|---|---|
| 222 | 1.1 | 166 | 158 | 0.020 [0.003, 0.041] | 4 | `maxrects-cp+corners` |
| 222 | 1.25 | 145 | 141 | 0.012 [-0.003, 0.032] open | 3 | `maxrects-cp+corners` |
| 222 | 1.5 | 117 | 113 | 0.017 [-0.006, 0.046] open | 4 | `maxrects-cp+corners` |
| stress 81 | 1.1 | 66 | 69 | -0.025 [-0.066, 0.000] open | 54 | `shelf-first-input+corners` |
| stress 81 | 1.25 | 64 | 68 | -0.034 [-0.075, 0.000] open | 54 | `shelf-first-input+corners` |
| stress 81 | 1.5 | 64 | 68 | -0.034 [-0.075, 0.000] open | 55 | `shelf-first-input+portfolio` |

On the subset of 207 inputs, the headline cell gives `select+portfolio` 131 misses and `rows+portfolio` 135. The gain is 0.014 [-0.002, 0.034] there.

### What the result shows

1. `select` adds nothing to the oracle. This follows from the code: each pair of `select` has the values of a pair of `rows` or of `maxrects-bl`. In the headline cell, `select+portfolio` has 4 fewer misses, and its gain of 0.012 is not clear. Only at the cap 1.1 is the gain clear: 0.020 [0.003, 0.041].
2. In the stress cell with the cap 1.25, `select+portfolio` is worse: 4 more misses, and the gain -0.034 [-0.075, 0.000]. On the 57 stress inputs with `rows`, the records of `select` are the records of `rows`. Thus the 4 extra misses come from the 24 inputs where the table picks `maxrects-bl`. On these 4 inputs, `rows+portfolio` reaches the floor and `select+portfolio` does not. On all 81 stress inputs, `maxrects-bl+portfolio` misses the floor on 71 and `rows+portfolio` on 64.
3. The router decides the misses more than the pack. The first 13 output groups of the headline cell are `<pack>+corners`, one for each pack entry. The first group of another router is `maxrects-cp+trunks`, at rank 14 with 114 misses. `maxrects-cp+corners` leads by 23 misses: 42 against 65 for `maxrects-blsf+corners`.
4. `highways` 0.8.1 and `packing` 0.2.16 changed no number of the old pairs in the cells. The baseline, the best pair and the oracle have the numbers of L10 in each of the 6 cells. Only the time changed. The inputs took 257.2 minutes in all, and the plan gave them 776.7 minutes. The longest shard took 17.1 minutes, and the run took approximately 19 minutes from start to end.
5. The next step for `select` is a rule that learns its pick from the joint records, not from the 4 features of the pack input. This is a new roadmap item, and this result does not build it.

### The scope of the result

- The pairs of `select` repeat the values of other pairs, so they do not move the floor. Thus the misses of the old pairs compare with L10.
- The table of `select` comes from `packing` 0.2.16. A new table needs a new run.
- The verdicts of S2 and S5 to S8 come from the job `reanalyze` of the run 40746401999. The job `analyze` of the run 40743187036 used the code before the options of the claims.
- The cost model of the shards comes from this run. Refer to "The shards".

## The prediction for routing-aware gaps (L13)

This prediction comes before the full run with the lane pairs: `joint-v2`, 303 inputs, 3 seeds, 64 shards and the input `lanes`. The verdicts come from the 2 reports and the shard logs, by hand. The entries stay the same after the run.

The run has 2 changes from the run 40743187036 of L32:

- The runner has the 18 lane pairs of "The lane pairs". Thus the run has 148 pairs.
- The lockfile has `packing` 0.2.17, and L32 used 0.2.16. `highways` stays 0.8.1.

The cells of the claims are the headline cell (the rule `all`, the cap 1.25, 222 inputs) and the stress cell with the same rule and cap (81 inputs). The full report is `report.json`, with the lane pairs. The old report is `report-without-lanes.json`.

### The claims

| Id | Confidence | Claim |
|---|---|---|
| G1 | 0.9 | No lane record is skipped when the record of its base pair is not skipped. Each row of `lanes` has 0 skipped records. |
| G2 | 0.75 | In the headline cell of the old report, `rows+portfolio` misses the floor on 142 to 148 inputs, `select+portfolio` on 138 to 144, and the best pair is `maxrects-cp+corners` with 39 to 45 misses. L32 gave 145, 141 and 42. |
| G3 | 0.9 | In the headline cell and in the stress cell, `rows+portfolio` and `select+portfolio` have at least as many misses in the full report as in the old report. |
| G4 | 0.8 | In the stress cell, each of the 6 lane pairs of `lanes-max` has fewer broken records of `no-pass-through` than its base pair. |
| G5 | 0.4 | In the stress cell, each of the 6 lane pairs of `lanes-sides` has at least 10% fewer broken records of `no-pass-through` than its base pair. |
| G6 | 0.55 | In the stress cell, `lanes-sides2` has fewer breaks of `no-pass-through` than `lanes-sides`, for at least 4 of the 6 pairs of a pack entry and a router. |
| G7 | 0.75 | In the headline cell, each of the 18 lane pairs has a lower mean `joint.fill` than its base pair. |
| G8 | 0.65 | In the headline cell of the full report, each of the 18 lane pairs misses the floor on more inputs than its base pair. |
| G9 | 0.7 | In the headline cell of the full report, the best pair is `maxrects-cp+corners`, not a lane pair. |
| G10 | 0.3 | In the headline cell of the full report, a lane pair of `portfolio` misses the floor on fewer inputs than `rows+portfolio` and than `select+portfolio`. |
| G11 | 0.55 | In the stress cell of the full report, the best pair is a lane pair of `lanes-max`. |
| G12 | 0.7 | Each shard takes less than 25 minutes on its inputs. The plan gives 25.0 minutes to the most costly shard, and L32 took 17.1 minutes. |

### The reasons for the confidences

In L32, 8 of 11 claims held. The claims that came from the code held. The 3 misses (S5, S8 and S9) were risky claims of a gain over a strong pair. Thus the claims from the code get 0.9, and the claims of a gain get 0.3 to 0.55. The mean confidence of the claims above is 0.67. Thus approximately 8 of the 12 claims hold, if the confidences are correct.

- G1 comes from the code. A lane pass uses the same pack entry and router as its base pair, and both routers have no node limit. Only an error of `packing` with the new margins gives a skipped record.
- G2 is a check of `packing` 0.2.17. The ranges permit a small change of the packs. In L32, `highways` 0.8.1 and `packing` 0.2.16 changed no number of the old pairs.
- G3 comes from the code. A new pair can only make the floor of an input better or keep it. Thus the misses of a pair do not go down.
- G4: in the stress cell, the boxes touch, and 926 of 936 records with routes broke `no-pass-through` in joint-v2. `lanes-max` gives each box with a lane a margin of 5 units or more on each side.
- G4 is not 0.9. A margin of 10 on each box gave 0 breaks on `oversize`, and the margin of `lanes-max` can be smaller. A box without a counted lane keeps the margin 0.
- G5 is a risky claim. `lanes-sides` gives space only to the sides with lanes. The second pack moves the boxes, and new sides touch. On the smoke input of the stress cell, `lanes-sides` gave more breaks than its base pair for `rows`.
- G6: the second pass counts the lanes in the layout of the first pass, and the margins only grow. On the smoke input, `lanes-sides2` cut the breaks for 2 of 6 pairs and kept them for 3. Thus the claim is near an even chance.
- G7: a margin only grows, so the boxes take more area. In a fixed container, the larger boxes overflow more, and an overflow box leaves the fill. A different pack can fill better by chance, so the claim is not 0.9.
- G8 is the cost of the larger gaps. On most headline inputs, the hard level and the excess area tie, and `joint.fill` decides. The lane pairs fill less there. A gain comes only where the wider channels cut the routes above the cap.
- G9: `maxrects-cp+corners` led by 23 misses in L32. Its 3 lane pairs fill less (G7). The floor moves for all pairs, so the lead stays.
- G10 is a risky claim of a gain over the baselines. `portfolio` uses only `shared` above 40 nodes, and `shared` bundles its routes in lanes. Wider channels can cut its routes above the cap. But the lower fill loses on the other inputs (G8).
- G11 is a risky claim. The hard level decides most picks of the stress cell, and `lanes-max` cuts the breaks (G4). But a margin in a fixed container gives overflow, and the best pair of L32 is `shelf-first-input+corners`, which has no lane pair.
- G12: the plan of 25.0 minutes counts 3 pairs for each lane pass, which is more than the real cost. On the smoke input, a lane pair took 1.2 to 3.1 times the time of its base pair. The longest shard of L32 took 17.1 minutes. 18 lane pairs at 2 pairs each give approximately 17.1 × 166 / 130 = 21.8 minutes.

### The numbers of the claims

The job `analyze` of the run gives both reports in the artifact `joint-report`. A manual run with the input `records-run` gives them again from the records.

| Id | Field | Section of the Markdown report |
|---|---|---|
| G1 | `lanes[].skipped` of `report.json` | The lane pairs |
| G2 | `baselines` and `best` of the headline cell of `report-without-lanes.json` | The baseline rows+portfolio, and the cells |
| G3 | `baselines` of the headline cell and of the stress cell, in both reports | The baseline rows+portfolio |
| G4, G5 | `lanes[]` with the scope `stress`: `lane.broken` and `baseSide.broken` | The lane pairs |
| G6 | `lanes[]` with the scope `stress`: `lane.breaks` of `lanes-sides2` and of `lanes-sides` | The lane pairs |
| G7 | `lanes[]` with the scope `headline`: `lane.fill` and `baseSide.fill` | The lane pairs |
| G8 | `compare` of the headline cell of `report.json`: `missesA` and `missesB` of each lane pair and its base pair | The pairwise comparisons |
| G9 | `best.pair` of the headline cell of `report.json` | The cells |
| G10 | `compare` of the headline cell of `report.json`: `missesA` of the lane pairs of `portfolio`, and `baselines` | The pairwise comparisons |
| G11 | `best.pair` of the stress cell with the rule `all` and the cap 1.25, in `report.json` | The stress cell |
| G12 | `shardTimes`: the step `Run one shard` of each shard | The shard times |

- The rows of `lanes` do not depend on the rule or the cap. Thus G4 to G7 use one row for each lane pair and scope.
- The report has each number of the claims. The rows of `lanes` do not split the inputs by the value of `spacing`. A claim for one value of `spacing` needs a new field.

## The result of routing-aware gaps (L13)

Run [40757153151](https://github.com/mark1russell7/layout-contract/actions/runs/40757153151) ran the 148 pairs on the 222 inputs of `joint-v2`, with `lanes` on, in 64 shards. 8 of the 12 claims held. The Brier score is 0.220.

### The verdicts

| Claim | Confidence | Verdict | The numbers |
|---|---|---|---|
| G1 | 0.9 | Held | The 36 rows of `lanes` have 0 skipped records. |
| G2 | 0.75 | Held | The old report gives 145 misses to `rows+portfolio`, 141 to `select+portfolio`, and 42 to the best pair `maxrects-cp+corners`. |
| G3 | 0.9 | Held | In the headline cell, the two baselines keep 145 and 141 misses. In the stress cell, they go from 64 and 68 to 80 and 80. |
| G4 | 0.8 | Held | In the stress cell, the 6 pairs of `lanes-max` have 0 to 2 broken records. Their base pairs have 80. |
| G5 | 0.4 | Missed | The 6 pairs of `lanes-sides` have 76 to 78 broken records against 80. This is less than 10% fewer. |
| G6 | 0.55 | Held | `lanes-sides2` has fewer breaks than `lanes-sides` on 6 of 6 pairs, for example 1541 against 4463 for `select+portfolio`. |
| G7 | 0.75 | Held | All 18 lane pairs have a lower mean `joint.fill` than their base pairs, by 0.05 to 0.11. |
| G8 | 0.65 | Missed | 12 of the 18 lane pairs miss the floor on fewer inputs than their base pairs. All 9 pairs with the router `corners` are in these 12. |
| G9 | 0.7 | Missed | The best pair is `lanes-sides.maxrects-cp.corners+corners`, with 22 misses. Its base pair has 47. |
| G10 | 0.3 | Held | `lanes-max.maxrects-cp.portfolio+portfolio` has 111 misses, against 145 for `rows+portfolio` and 141 for `select+portfolio`. |
| G11 | 0.55 | Held | The best pair of the stress cell is `lanes-max.maxrects-cp.corners+corners`, with 14 misses on 81 inputs. Each baseline has 80. |
| G12 | 0.7 | Missed | The most costly shard took 31.5 minutes, and all shards took 415.5 minutes. The cost model has no term for the lane pairs. |

### The headline cell

| Lane pair | Misses | Base misses | Score gain [interval] |
|---|---|---|---|
| `lanes-sides.maxrects-cp.corners` | 22 | 47 | +0.011 [-0.024, 0.050] |
| `lanes-sides2.maxrects-cp.corners` | 25 | 47 | +0.003 [-0.034, 0.044] |
| `lanes-max.maxrects-cp.corners` | 41 | 47 | -0.035 [-0.055, -0.019] |
| `lanes-sides.select.corners` | 44 | 67 | -0.002 [-0.031, 0.030] |
| `lanes-sides.rows.corners` | 48 | 75 | +0.014 [-0.009, 0.044] |
| `lanes-max.maxrects-cp.portfolio` | 111 | 131 | -0.010 [-0.028, 0.008] |
| `lanes-sides2.rows.portfolio` | 152 | 145 | -0.025 [-0.041, -0.009] |

The table shows a part of the 18 rows. `report.json` has all of them, in `lanes` and in `compare` of the headline cell.

### What the result shows

- Gaps from the lanes make the router `corners` miss the floor on fewer inputs. The count goes down on each of the 9 pairs of `corners`. On `maxrects-cp` it goes from 47 to 22.
- A margin per side (`lanes-sides`) keeps the score. Its gain interval holds 0 on 5 of 6 pairs. One margin per box (`lanes-max`) lowers the score on 5 of 6 pairs.
- One margin per box removes almost all breaks of `no-pass-through` in the stress cell. A margin per side removes almost none of them. A second pass cuts the break count by 11% to 65%.
- With the router `portfolio`, the gaps help only `maxrects-cp`. On `rows` and `select` the misses go up by 2 to 7.
- The cost of the gaps is fill. Each lane pair loses 0.05 to 0.11 of `joint.fill`.
- `lanes-sides.maxrects-cp.corners+corners` is the new candidate for the first joint default. L40 confirms it on fresh seeds against `maxrects-cp+corners` and both baselines.

### The scope of the result

- The result holds for `joint-v2`, the seeds 1 to 3, and the floor of each cell. A lane pair moves the floor of a cell, because the floor comes from the best pair of each input.
- The lane need is `10 + 4(k-1)` with a cap of 8 lanes. Other values are not measured.
- The gaps come from a margin per box or per side. A gap per channel needs a packing option, and the request text is above.
- Do not refit the cost model from this run. The fit divides by 130 pairs, and this run has 148.

## The prediction for iteration pairs (L11)

This prediction comes before the full run with the iteration pairs: `joint-v2`, 303 inputs, 3 seeds, 64 shards and the input `iterate`. The run does not use the input `lanes`. The verdicts come from the 2 reports and the shard logs, by hand. The entries stay the same after the run.

The run has 1 change from the run 40757153151 of L13. The runner has the 18 iteration pairs of "The iteration pairs", and not the 18 lane pairs. The lockfile keeps `packing` 0.2.17 and `highways` 0.8.1.

The cells of the claims are the headline cell (the rule `all`, the cap 1.25) and the stress cell with the same rule and cap. In L13, the best pair of the headline cell was `lanes-sides.maxrects-cp.corners+corners`, with 22 misses against 47 for its base pair. Its gain over the base pair was +0.011 [-0.024, 0.050].

### The claims

| Id | Confidence | Claim |
|---|---|---|
| H1 | 0.9 | No iteration record is skipped when the record of its base pair is not skipped. |
| H2 | 0.9 | Each `lanes-iter1` pair has the same mean `joint.fill` and the same breaks of `no-pass-through` as its `lanes-sides` pair in L13. |
| H3 | 0.85 | In the headline cell and in the stress cell, no `lanes-iter2` or `lanes-iter3` pair misses the floor on an input where its `lanes-iter1` pair reaches it. |
| H4 | 0.75 | Of the records of `lanes-iter3`, the end "no gain" is the most frequent end of the rounds. |
| H5 | 0.6 | In the headline cell, the mean of `iter.rounds` of each `lanes-iter3` pair is from 1.6 to 2.6. |
| H6 | 0.75 | In the headline cell, the best pair is an iteration pair of `maxrects-cp` and `corners`. |
| H7 | 0.5 | In the headline cell, `lanes-iter3.maxrects-cp.corners+corners` misses the floor on at least 3 fewer inputs than `lanes-iter1.maxrects-cp.corners+corners`. |
| H8 | 0.45 | In the headline cell, at least 1 of the 6 `lanes-iter3` pairs has a mean `joint.fill` 0.01 or more above its `lanes-iter1` pair. |
| H9 | 0.45 | In the stress cell, each `lanes-iter3` pair has fewer records with a break of `no-pass-through` than its `lanes-iter1` pair. |
| H10 | 0.35 | In the headline cell, the gain of `lanes-iter3.maxrects-cp.corners+corners` over `maxrects-cp+corners` has an interval with a lower end above 0. |
| H11 | 0.75 | Each shard takes less than 30 minutes. The plan gives 22.7 minutes to the most costly shard. |
| H12 | 0.5 | The sum of the times of the step `Run one shard` is from 330 to 430 minutes. The plan gives 426.9 minutes. |

### The reasons for the confidences

In L32, 8 of 11 claims held. The claims from the code held, and the misses were risky claims of a gain. Thus the claims from the code get 0.85 to 0.9, and the claims of a gain get 0.35 to 0.5. The mean confidence is 0.65. Thus approximately 8 of the 12 claims hold, if the confidences are correct.

- H1 comes from the code. A failed round stops the chain with the end "failed", and the record keeps the best earlier round. Round 1 has the margins of `lanes-sides`, which gave 0 skipped records in L13.
- H2 comes from the code: round 1 uses `laneMargins` in the mode `sides`, as `lanes-sides` does. The test `iterate.test.ts` checks the same output hash. A change of the floors of the cells changes the misses, so H2 uses only the fill and the breaks.
- H3 comes from the code. A later round replaces the best round only when `compareRecords` gives `better` at the headline cell. H3 is not 0.95, because the floor of the analysis uses the minimum effects of the levels, and a small change can cross it.
- H4: on 12 small inputs of `joint-v2`, the end "no gain" came on 16 of 24 chains. The end "same margins" came on the inputs without routes along a side. The cap came only once.
- H5: on the 12 small inputs, the mean rounds was 1.8 for `rows` and 2.1 for `maxrects-cp`. Large inputs have more corridors, and each round changes more sides. Thus the mean can go up.
- H6: an iteration pair is not worse at any time than its `lanes-iter1` pair (H3). `lanes-iter1` equals the best pair of L13. The run has no lane pairs, so only the old pairs and the iteration pairs compete.
- H7 is a risky claim of a gain. A later round wins only on the pick levels, and the fill decides most picks. On the 12 small inputs, a round after round 1 won on 6 of 24 chains. A win counts only when it closes a miss.
- H8 is a risky claim. The empty sides go down to the floor, and that gives area back. But a crowded side grows again, and the gain comes only on the inputs where a later round wins.
- H9 is a risky claim. The floor of `d7` gives each side in the stress cell 0.5 units, so 2 facing sides have 1 unit. That removes the touching sides. But `compareRecords` does not count `route.no-pass-through`, so round 1 stays the best round when the fill goes down.
- H10 is a risky claim. In L13 the interval was [-0.024, 0.050]. The iteration adds a gain only on the inputs where a later round wins, and the interval width stays the same.
- H11: the most costly shard has 1 dense input with 1000 boxes. In L13, a lane pass on this input took approximately 0.6 minutes. 6 chains of 2.4 rounds add approximately 8.6 minutes to the 17.1 minutes of L32. That gives approximately 25.7 minutes. The cap of 3 rounds gives 27.9 minutes.
- H12: the plan counts 3 pairs for each round, and each chain uses all 3 rounds. In L13, the real time was 415.5 minutes for a plan of 468.7 minutes. Most chains stop after 2 rounds (H4), so the real sum is likely lower than the plan.

### The numbers of the claims

| Id | Field | Section of the Markdown report |
|---|---|---|
| H1 | `lanes[].skipped` of `report.json` | The lane pairs |
| H2 | `lanes[]` of `lanes-iter1`: `lane.fill` and `lane.broken`, and the same rows of `lanes-sides` in the report of L13 | The lane pairs |
| H3 | `compare` of `lanes-iter2` and `lanes-iter3` against `lanes-iter1`: `onlyB` | The pairwise comparisons |
| H4, H5 | `lanes[].iterate`: `stops` and `rounds` | The rounds of the iteration pairs |
| H6 | `best.pair` of the headline cell of `report.json` | The cells |
| H7 | `compare` of `lanes-iter3` against `lanes-iter1`: `missesA` and `missesB` | The pairwise comparisons |
| H8 | `lanes[]` with the scope `headline`: `lane.fill` of `lanes-iter3` and of `lanes-iter1` | The lane pairs |
| H9 | `lanes[]` with the scope `stress`: `lane.broken` of `lanes-iter3` and of `lanes-iter1` | The lane pairs |
| H10 | `compare` of the headline cell: the gain and its interval for `lanes-iter3.maxrects-cp.corners+corners` | The pairwise comparisons |
| H11, H12 | `shardTimes`: the step `Run one shard` of each shard | The shard times |

## The result of iteration pairs (L11)

In the run [40770430229](https://github.com/mark1russell7/layout-contract/actions/runs/40770430229), the runner used the 148 pairs on the 303 inputs of `joint-v2`, with `iterate` on. The run had 64 shards, on the commit `d85a642`. 10 of the 12 claims held. The Brier score is 0.126.

### The verdicts

| Claim | Confidence | Verdict | The numbers |
|---|---|---|---|
| H1 | 0.9 | Held | The 36 rows of `lanes` have 0 skipped records. The run has no skipped record. |
| H2 | 0.9 | Held | The 12 rows of `lanes-iter1` have the same `joint.fill`, broken records and breaks as the rows of `lanes-sides` in L13. An example is `maxrects-cp.corners`, with the fill 0.336 and 76 broken records in the stress cell. |
| H3 | 0.85 | Held | `onlyB` is 0 in each of the 24 compares: 6 pairs, 2 variants and 2 cells. |
| H4 | 0.75 | Held | Of the 1818 records of `lanes-iter3`, 1181 end with "no gain", 357 at the cap, 280 with the same margins and 0 with a failure. |
| H5 | 0.6 | Held | The mean of `iter.rounds` of the 6 pairs of `lanes-iter3` is 1.98 to 2.19. |
| H6 | 0.75 | Held | The best pair is `lanes-iter3.maxrects-cp.corners+corners`, with 19 misses. |
| H7 | 0.5 | Held | `lanes-iter3.maxrects-cp.corners+corners` has 19 misses, and its `lanes-iter1` pair has 23. That is 4 fewer. |
| H8 | 0.45 | Missed | The largest gain of fill is 0.00996, for `maxrects-cp.corners`: 0.3463 against 0.3364. This is less than 0.01. The other 5 pairs change by -0.004 to +0.005. |
| H9 | 0.45 | Held | The 6 pairs of `lanes-iter3` have 73 to 76 broken records. Their `lanes-iter1` pairs have 76 to 78. |
| H10 | 0.35 | Missed | The gain over `maxrects-cp+corners` is +0.022 [-0.014, 0.062]. The lower end is below 0. |
| H11 | 0.75 | Held | The most costly shard took 29.4 minutes in the step `Run one shard`, and 29.8 minutes as a job. This is near the limit of 30 minutes. |
| H12 | 0.5 | Held | All shards took 355.4 minutes in the step `Run one shard`, and 376.7 minutes as jobs. |

- H8 is a miss. The Markdown report rounds the fill to 0.346 against 0.336, but the gain in `report.json` is 0.00996.
- The 2 misses are the claims of a gain over a fixed limit. All claims from the code held.

### The headline cell

The run has no lane pairs. `lanes-iter1` has the layout of `lanes-sides` (H2). Thus the gain over `lanes-iter1` is the gain over `lanes-sides` in this run.

| Iteration pair | Misses | Misses of `lanes-iter1` | Misses of the base pair | Gain over `lanes-iter1` [interval] | Gain over the base pair [interval] |
|---|---|---|---|---|---|
| `lanes-iter3.maxrects-cp.corners` | 19 | 23 | 47 | +0.013 [0.007, 0.020] | +0.022 [-0.014, 0.062] |
| `lanes-iter2.maxrects-cp.corners` | 19 | 23 | 47 | +0.012 [0.005, 0.019] | +0.020 [-0.016, 0.060] |
| `lanes-iter3.select.corners` | 38 | 44 | 67 | +0.006 [0.002, 0.010] | +0.003 [-0.025, 0.035] |
| `lanes-iter3.rows.corners` | 43 | 48 | 75 | +0.004 [0.001, 0.007] | +0.018 [-0.005, 0.048] |
| `lanes-iter3.maxrects-cp.portfolio` | 103 | 118 | 131 | +0.016 [0.007, 0.026] | +0.027 [-0.005, 0.066] |
| `lanes-iter3.select.portfolio` | 139 | 143 | 141 | +0.011 [0.003, 0.022] | +0.002 [-0.011, 0.017] |
| `lanes-iter3.rows.portfolio` | 144 | 148 | 145 | +0.014 [0.004, 0.028] | -0.002 [-0.013, 0.010] |

### The stress cell

The best pair of the stress cell is `lanes-iter3.select.corners+corners`, with 31 misses on 81 inputs. The run has no pair of `lanes-max`, so this best pair does not compare with the best pair of L13.

| Iteration pair | Misses | Misses of `lanes-iter1` | Misses of the base pair | Broken records | Breaks | Gain over `lanes-iter1` [interval] |
|---|---|---|---|---|---|---|
| `lanes-iter3.select.corners` | 31 | 72 | 80 | 76 (78, 80) | 1715 (4474, 37244) | +0.213 [0.124, 0.311] |
| `lanes-iter3.rows.corners` | 39 | 74 | 80 | 76 (78, 80) | 2917 (7706, 37079) | +0.187 [0.106, 0.277] |
| `lanes-iter3.select.portfolio` | 66 | 77 | 80 | 75 (78, 80) | 1806 (4463, 37242) | +0.077 [0.031, 0.135] |
| `lanes-iter3.rows.portfolio` | 67 | 77 | 80 | 76 (78, 80) | 3017 (7692, 37076) | +0.072 [0.027, 0.131] |
| `lanes-iter3.maxrects-cp.corners` | 68 | 75 | 80 | 74 (76, 80) | 20981 (24236, 36457) | +0.035 [0.009, 0.071] |
| `lanes-iter3.maxrects-cp.portfolio` | 74 | 81 | 80 | 73 (76, 80) | 18482 (24196, 36456) | +0.044 [0.011, 0.082] |

The values in parentheses are the values of `lanes-iter1` and of the base pair.

- The rounds cut the breaks of `no-pass-through` by 13% to 62% against `lanes-iter1`. But almost each record keeps 1 break or more.
- In the headline cell, the 8 pairs of `lanes-iter2` and `lanes-iter3` with `rows` or `select` have 0 broken records. Their `lanes-iter1` pairs have 1 to 2, and their base pairs have 4.

### The rounds and their ends

| Pair of `lanes-iter3` | Rounds | Best round | Inputs with a gain | No gain | Same margins | Cap |
|---|---|---|---|---|---|---|
| `maxrects-cp.corners` | 2.153 | 1.482 | 85 | 149 | 51 | 22 |
| `maxrects-cp.portfolio` | 2.063 | 1.338 | 59 | 161 | 45 | 16 |
| `rows.corners` | 2.014 | 1.306 | 48 | 157 | 45 | 20 |
| `rows.portfolio` | 2.189 | 1.523 | 86 | 148 | 44 | 30 |
| `select.corners` | 1.982 | 1.279 | 46 | 156 | 50 | 16 |
| `select.portfolio` | 2.185 | 1.518 | 86 | 148 | 45 | 29 |

The table shows the headline cell, 222 inputs. The report gives the end "same margins" as `fixed`.

- A later round is the best round on 46 to 86 of the 222 inputs. But it closes a miss on only 4 to 15 inputs. On the other inputs, the gain is in the fill or in the ties.
- In the stress cell, the mean of the rounds is 2.62 to 2.77, and the mean best round is 2.03 to 2.31. A later round is the best round on 50 to 62 of the 81 inputs. 33 to 44 of the 81 records end at the cap.
- Round 3 adds to round 2 on 4 of the 6 pairs in the headline cell. On `maxrects-cp.corners`, both have 19 misses. In the stress cell, round 3 adds the most: `select.corners` goes from 57 misses to 31.

### The fill

- In the headline cell, the fill of the 6 pairs of `lanes-iter3` is -0.004 to +0.010 against `lanes-iter1`. Against the base pairs, the fill stays lower by 0.041 to 0.069.
- In the headline cell, 41 to 43 records of each pair of `lanes-iter3` overflow. The base pairs have 39 to 41.
- In the stress cell, the rounds widen approximately 5 to 6 sides for each side that they narrow. Thus the fill goes down. For `rows.corners`, it is 0.457 against 0.521 for `lanes-iter1` and 0.779 for the base pair.

### The time

| Plan at 64 shards | The plan of L11 | The model of L35 | The run |
|---|---|---|---|
| The most costly shard | 22.7 minutes | 36.8 minutes | 29.4 minutes |
| All shards | 426.9 minutes | 542.0 minutes | 355.4 minutes |

- The times are the step `Run one shard`. The jobs took 376.7 minutes in all. The run took 65.2 minutes from the first job to the last job.
- The plan of L11 is too low for the most costly shard by 6.7 minutes. The model of L35 is too high by 7.4 minutes. Both are too high for the sum.
- A round costs approximately 0.6 to 1.2 times the time of its base pair in the headline cell. The plan counts 3 pairs for each round (`LANE_PASS_COST`).
- `lanes-iter3.maxrects-cp.corners+corners` takes 1534 ms for each headline record. `lanes-iter1` takes 915 ms, and the base pair takes 457 ms.

### What the result shows

- Iteration beyond round 1 pays. Each of the 6 pairs of `lanes-iter3` misses the floor on fewer inputs than its `lanes-iter1` pair, in both cells. No pair loses an input (H3).
- The gain over `lanes-sides` is small in the headline cell, but its interval is above 0 on 6 of 6 pairs. The pairs miss on 4 to 15 fewer inputs, and the gain is +0.004 to +0.016.
- The gain is large in the stress cell. `lanes-iter3.select.corners+corners` goes from 72 misses to 31, with the gain +0.213 [0.124, 0.311].
- The gain over the base pair is not sure yet. The interval holds 0 on 6 of 6 pairs (H10).
- The cost is time. The best pair takes approximately 1.7 times the time of `lanes-sides`, and 3.4 times the time of its base pair.
- The fill does not come back. The rounds keep the fill of `lanes-sides`, and it stays below the fill of the base pairs.

### The candidate default

The candidate for the first joint default changes. It was `lanes-sides.maxrects-cp.corners+corners` (L13). The new candidate is `lanes-iter3.maxrects-cp.corners+corners`.

- It has 19 misses against 23 for `lanes-sides`, and the gain +0.013 [0.007, 0.020] over it.
- `lanes-iter2.maxrects-cp.corners+corners` also has 19 misses, and it takes 1320 ms for each record. The report has no compare of `lanes-iter3` against `lanes-iter2`. L40 decides between the 2 caps.
- L40 confirms the candidate on fresh seeds against `lanes-sides.maxrects-cp.corners+corners`, `maxrects-cp+corners` and both baselines.

### The scope of the result

- The result holds for `joint-v2`, the seeds 1 to 3, and the floor of each cell. The floor comes from the 148 pairs of this run, without the lane pairs of L13. Thus `lanes-iter1.maxrects-cp.corners+corners` has 23 misses, and `lanes-sides` had 22 in L13.
- The cap is 3 rounds. In the stress cell, 33 to 44 of 81 records end at the cap. A higher cap is not measured.
- The margins change for each side (`iterMargins`). A gap for each pair of facing boxes needs `packing` (k77).
- Do not refit the cost model from this run. The fit divides by 130 pairs, and this run has 148. `fit-cost.mjs` does not count the rounds yet.

## The prediction for the memory of the large inputs (L77)

L63 frees the routes that no later pair reads. But the peak RSS of the inputs with 1000 boxes fell only 3%, from 6375 MB to 6184 MB. L77 finds the cause before bench-4 adds pairs.

The candidates of the cause:

- The heap cap of 6 GB lets V8 grow the heap lazily. Then the RSS follows the cap, and not the live data.
- The buffers of one input: the frames and the records of all its pairs.
- The state of one router on a large input, for example the portfolio and its members.

The target: the peak RSS of each input of `joint-v2` with 1000 boxes stays under 3 GB. The records stay equal to the records of run `40884908305` without the times, and the most costly shard is at most 10% slower.

| Claim | p | Claim text |
|---|---|---|
| N1 | 0.55 | Risky: with the heap cap at 3 GB, the 3 inputs with the largest peak finish with no error of memory, and their records do not change. |
| N2 | 0.6 | The live heap after a forced full GC, at the point of the peak, is under 2 GB on the input with the largest peak. |
| N3 | 0.3 | Risky: one router holds more than half of the peak live heap on that input. |
| N4 | 0.8 | The records of a run with a lower cap equal the records of run `40884908305` without the times. |

The workflow `memory-probe.yml` measures the claims. Each job runs one input with one heap mode, and the command `probe` of `scripts/bench.mjs` writes the facts of each pair:

- The mode `gc-6144` forces a full GC after each pair. Thus it gives the live heap that each pair keeps.
- The modes `cap-3072` and `cap-2048` lower the heap cap without forced GC. Thus they give the peak RSS and the records under the cap.

## The result of the memory probe (L77)

Run `40924152142` ran the 3 inputs with the largest peak in 3 heap modes, with 9 jobs in all. Each job of `cap-3072` and `cap-2048` stopped with the error "Ineffective mark-compacts near heap limit". Each job of `gc-6144` finished.

| Input | Peak RSS (MB) | Largest live heap after a pair (MB) | Largest heap after a `streets` pair (MB) | Largest heap after a pair of a different router (MB) |
|---|---|---|---|---|
| `freeWidth.convex.edge.extremeAspect.n1000` | 6078 | 221 | 5743 | 958 (`search`) |
| `freeWidth.holes.scattered.uniform.n1000` | 5319 | 229 | 3962 | 1093 (`interchanges`) |
| `freeAspect.polygon.none.extremeAspect.n1000` | 4938 | 222 | 4447 | 761 (`search`) |

The column "heap after a pair" is the heap before the forced GC. Thus it includes the garbage of the pair.

The capped jobs stopped in a pair of `streets`:

- 5 jobs stopped in pair 12, `rows+streets`. That is the first pair of `streets`.
- At 3 GB, the job of `freeAspect.polygon` finished `rows+streets`. It stopped in pair 117, `maxrects-bssf+streets`.

| Claim | p | Result |
|---|---|---|
| N1 | 0.55 | Miss. With the heap cap at 3 GB, each of the 3 inputs stopped with an error of memory, in a pair of `streets`. |
| N2 | 0.6 | Hit. The live heap after a forced full GC is at most 229 MB. This measure is between the pairs. The capped jobs show that the live heap in a pair of `streets` is more than 2 GB. |
| N3 | 0.3 | Hit (risky). The router `streets` causes the peak on each input. Its largest heap is 3.6 to 5.8 times the largest heap of each different router. |
| N4 | 0.8 | Not measured as written, because no capped job finished. The records of the 3 modes equal the records of run `40884908305` without the times: 585 records of `gc-6144`, 138 of `cap-3072` and 33 of `cap-2048`. |

The runner keeps almost nothing between the pairs. The live heap grows from approximately 70 MB to approximately 210 MB over the 195 pairs of one input.

The cause is the plan of `streets` in `highways` (`streetPlan`). It keeps one object for each pair of a free line and an edge that the line covers. Each step of the greedy cover then makes new arrays for each line. A fix in `highways` that keeps the covers in typed arrays is the next step of L77. The records do not change, because the cover gives the same streets.

The probe measured only the 3 largest peaks of run `40884908305`. The peaks of the other inputs with 1000 boxes are not measured. bench-4 waits for the fix.

## The result after the fix of `streets` (L77)

`highways` 0.9.10 (highways #193) keeps the covers of `streets` in typed arrays. The cover gives the same streets. Pull request #92 moved the joint bench to `^0.9.10`.

The probe ran again on the same 3 inputs and the same 3 heap modes (run `40947309465`). Each of the 9 jobs finished. Before the run, the tracker item L77 got 4 claims, R1 to R4.

| Input | Largest heap after a pair, before (MB) | Largest heap after a pair, after (MB) | Peak RSS before (MB) | Peak RSS after (MB) |
|---|---|---|---|---|
| `freeWidth.convex.edge.extremeAspect.n1000` | 5743 (`streets`) | 724 (`shared-all`) | 6078 | 1342 |
| `freeWidth.holes.scattered.uniform.n1000` | 3962 (`streets`) | 955 (`search`) | 5319 | 1560 |
| `freeAspect.polygon.none.extremeAspect.n1000` | 4447 (`streets`) | 792 (`search`) | 4938 | 1217 |

The columns "after" come from `gc-6144`. In each mode, the largest peak RSS was 1893 MB, on `freeWidth.holes` with the cap of 2 GB. That is 8% less than the cap.

| Claim | p | Result |
|---|---|---|
| R1 | 0.7 | Hit (risky). Each job of `cap-3072` finished. Its largest peak RSS was 1696 MB. |
| R2 | 0.8 | Hit. The largest heap after a pair is 724 to 955 MB on each input, less than 2 GB. |
| R3 | 0.45 | Hit (risky). Each job of `cap-2048` also finished. |
| R4 | 0.6 | Hit. The records of `streets` equal the records of run `40884908305` without the times. |

The records of each router stay the same: all 585 records of `gc-6144` equal run `40884908305`, 39 for each of the 15 routers. The 3 modes of each input give equal records.

No router stands out after the fix. The largest heap comes from `search`, `shared-all`, `sections`, `gaps` or `portfolio`. A peak RSS of less than 3 GB is the target of L77, so L77 is done. bench-4 (L79) no longer waits.

The CI of `highways` also has a heap gate since highways #193. It routes the dense board of ROUTE-SCALE with each of the 15 routers, each with a cap from its measured peak.

## The prediction for bench-4 (L79)

bench-4 uses `packing` `^0.4.0`. The outputs of an explicit strategy are byte-equal to 0.3.0. It has 18 pack entries and 270 pairs:

- the 13 entries of bench-3, in the same order.
- the 4 order searches of `packing` 0.3.0 (k26 of `packing`): `anneal-maxrects-bl-k16`, `anneal-skyline-k16`, `genetic-maxrects-bl-k16` and `tabu-maxrects-bl-k16`, each with 16 packs of its member.
- `pack`: the choice of `pack()` without a strategy (`PACK_DEFAULT_TABLE`).

The registry of `packing` has no strategy for the choice of `pack()`. The entry `pack` is `select` with a different table. A container of fixed size gets the branch of `SELECT_TABLE` for a fixed size. Each other container gets `rows`. The test `pack-default.test.ts` compares the entry with `defaultLayoutOf` on inputs of each container kind.

The claims 9 and 10 of the prediction `packing-k58-step-a` of `packing` name `pack()`. They are A9 and A10. The entry `select` is the default of the registry (`DEFAULT_STRATEGY`). It also picks `maxrects-bl` on some inputs of free size. B9 and B10 apply the two claims to `select`, as more data.

The run is one full run of `joint-v2`, compared with run `40884908305`. The claims were written before the run.

| Claim | p | Claim |
|---|---|---|
| B1 | 0.8 | The checks of the pull request pass, with the slice `pr` of the 270 pairs. |
| B2 | 0.85 | The output hash of each pair of the 13 entries of bench-3 equals run `40884908305`. |
| B3 | 0.75 | Each shard ends with no error of memory, and the peak RSS of each input is less than 3 GB. |
| B4 | 0.5 | The longest shard is at most 1.4 times the longest shard of run `40884908305`. |
| B5 | 0.85 | Each order search has no hard breaks on an input where its member has none. |
| A9 | 0.97 | `pack` gives the hash of `rows` on each input of `joint-v2` that is not of fixed size. |
| A10 | 0.8 | The stress misses of `pack` with `portfolio` are at most the stress misses of `rows` with `portfolio`. |
| B9 | 0.15 | `select` gives the hash of `rows` on each input of `joint-v2` that is not of fixed size. |
| B10 | 0.25 | The stress misses of `select` with `portfolio` are at most the stress misses of `rows` with `portfolio`. |

A9 is true by its construction, if the table copies `defaultLayoutOf`. On a fixed size, `maxrects-bl` packs closer than `rows`, and that can add stress misses. The largest peak of L77 was 1893 MB with the cap of 2 GB, so B3 is not sure.

## The result of bench-4 (L79)

The full run [`40971129437`](https://github.com/mark1russell7/layout-contract/actions/runs/40971129437) ran on commit `a7d8f5f`. The run [`40990459481`](https://github.com/mark1russell7/layout-contract/actions/runs/40990459481) analyzed its records again with the baseline `pack+portfolio`. Each of the 303 inputs has a record for each of the 270 pairs, so the run has 81810 records.

| Claim | p | Result | Data |
|---|---|---|---|
| B1 | 0.8 | Miss | The first push failed on 2 pins of `space.test.ts` that still counted 195 pairs. Later, a test timed out at 5.3 s. |
| B2 | 0.85 | Hit | The 59085 records of the 13 entries of bench-3 have the same output hash as run `40884908305`. |
| B3 | 0.75 | Miss | No shard had an error of memory. The 3 seeds of the dense input with hubs (`freeHeight`, `bimodal`, `n1000`) had a peak RSS of 3438 MB to 4287 MB. |
| B4 | 0.5 | Hit | The longest shard took 67.1 minutes. Run `40884908305` took 80.3 minutes, so the ratio is 0.84. |
| B5 | 0.85 | Miss | The order searches have no hard breaks of the pack. But 3 of the 4 have route breaks on 1 to 3 pairs where their member has none. |
| A9 | 0.97 | Hit | `pack` gives the hash of `rows` on each of the 3420 pairs of an input that is not of fixed size. |
| A10 | 0.8 | Hit | On the 81 stress inputs, `pack+portfolio` and `rows+portfolio` have the same misses at each rule and cap (68 to 73). |
| B9 | 0.15 | False | `select` gives a hash different from `rows` on 615 of the 3420 pairs. These are free inputs with a heavy tail. |
| B10 | 0.25 | False | On the stress inputs, `select+portfolio` has 72 to 74 misses, and `rows+portfolio` has 68 to 73. |

The Brier score of the 7 claims of the score (B1 to B5, A9, A10) is 0.320. The Brier score of A9 and A10, the claims 9 and 10 of `packing`, is 0.020. B9 and B10 are extra data.

- On all 222 inputs, `pack+portfolio` has 3 to 6 misses fewer than `rows+portfolio`. Its gain is 0.009 to 0.018, and each interval is open.
- The largest peak RSS fell from 6184 MB in run `40884908305` to 4287 MB. The memory probe of L77 did not measure the dense input with hubs. Roadmap item L81 examines its peak.
- The route breaks of B5 come from a different layout, not from a fault of the pack. A different layout gives the router a different problem.

## The memory gate (L81)

The probe of L77 ran 3 inputs that I chose: the top 3 peaks of run `40884908305`. They did not cover each family. The dense input with hubs (`freeHeight`, `bimodal`, `n1000`, `e-dense.hubs`) peaked at 4.1-4.2 GB in that run, and at 3.4-4.3 GB in bench-4. Thus L77 did not meet its target of less than 3 GB on each 1000-box input.

The gate takes its inputs from the bench, so it cannot leave out a family.

- `bench.mjs families` gives the input with the largest planned cost of each family. A family is an input id without its seed. `joint-v2` has 101 families.
- The workflow `memory-probe.yml` uses these inputs by default. The mode `bench-6144` has the heap cap of the bench and no forced GC.
- The job `gate` fails when an input has no probe, an OOM or another error, or a peak RSS of 3072 MB or more.
- The seeds of a family often have the same planned cost. Then the gate probes each of these seeds, and it fails on the worst seed. A gate on seed 1 alone is a gate on a chosen input. The seeds of the dense input with hubs peaked from 3438 MB to 4287 MB.
- `joint-v2` gives 293 inputs in 101 groups: a group of 3 seeds, or a group of 1 input. A matrix of GitHub has a maximum of 256 jobs, so each job probes one group. Each seed of the group runs in its own process, one after the other.
- The gate runs each night on main when the sweep on main ends, also after a failed sweep. Thus the heavy jobs of the two do not overlap. The gate writes the sweep run that it followed in `gate.md`.
- A night with no sweep gets the gate at 05:53 UTC. This scheduled run stops when a sweep on main started on the same day.
- A nightly gate stops at its start when the last nightly gate examined the same commit of main. You can also start the gate. The full gate costs about as many CI minutes as one full bench.
- The gate runs 3 probe jobs at the same time. The account runs at most 20 jobs at once for all repos, and the fleet rule of 2026-10-30 gives a heavy workflow 3 of them.

### The prediction for a gate with 3 jobs at once

The first gate ran 20 jobs at once. Its 100 shorter probe jobs took 782 job minutes, and the job of the dense input with hubs ran for more than 150 minutes. I wrote these claims before the first gate with 3 jobs at once.

| Claim | p | Claim text |
|---|---|---|
| N1 | 0.6 | The gate takes 5 to 8 hours from its start to its end. |
| N2 | 0.85 | No probe job of the gate waits so long that GitHub cancels it. |
| N3 | 0.25 | A night with a sweep and the gate after it ends before 14:00 UTC. The midpoints (a sweep of 360 minutes from 03:37, and a gate of 6.5 hours) give 16:00. |

### The prediction for the first run of the gate

I wrote these claims before the run. The model of memory and of the time in CI is weak (L79), so those claims have a p of 0.6 or less. M2 has more because bench-4 measured it. The peaks of bench-4 are shard peaks: the RSS of a shard includes the inputs before it. Thus a probe of one input alone can have a lower peak.

| Claim | p | Claim text |
|---|---|---|
| M1 | 0.7 | The gate has a probe with the status 0 or 134 for each of the 293 inputs. No row is "no probe", and no job reaches its timeout. |
| M2 | 0.75 | The gate fails, and one or more seeds of the dense input with hubs have a peak RSS of 3072 MB or more. |
| M3 | 0.5 | The dense input with hubs is the only family with a seed at a peak RSS of 3072 MB or more. |
| M4 | 0.6 | No probe of the gate has the status 134 (an OOM). |
| M5 | 0.55 | The run of the gate takes less than 4 hours from its start to its end. |
| M6 | 0.5 | The worst seed of the dense input with hubs has a peak RSS 10% or more above the peak of its seed 1. |

### The prediction for step 2: the pair `maxrects-cp+gaps` alone

In the first gate, seed 1 of the dense input with hubs peaked at 3337 MB, at the pair `maxrects-cp+gaps`. That pair added 874 MB to the peak RSS of seed 1, and 280 MB to the peak of seed 2.
Step 2 runs only this pair on seed 1 and on seed 2, each in a fresh process (`--pairs` of `bench.mjs probe`). Each seed runs in two modes:

- `bench-6144`, the mode of the gate. It gives the peak RSS of the pair alone.
- `alloc-6144`, a diagnostic with the same heap cap. It samples the allocations of the pair, also of the objects that a GC collected. `alloc.jsonl` has the 20 functions that allocated the most bytes.

The peak of the pair comes during the pair, and the heap after the pair was only 609 MB. A heap snapshot after the pair shows only what stays. So the diagnostic samples each allocation of the pair, and a diff of seed 1 against seed 2 names the code of the larger peak.
Each fact also has the external memory and the memory of the array buffers too, because a peak RSS can be outside the JS heap.

I wrote these claims before the run.

| Claim | p | Claim text |
|---|---|---|
| S1 | 0.6 | In `bench-6144`, the peak RSS of seed 1 alone is 400 MB or more above the peak RSS of seed 2 alone. |
| S2 | 0.75 | In `bench-6144`, the pair alone stays under 3072 MB on both seeds. |
| S3 | 0.65 | In `alloc-6144`, the function that allocates the most bytes in seed 1 is in `@mark1russell7/highways`, not in the joint runner. |
| S4 | 0.55 | The sampled allocation of seed 1 is 1.5 times the sampled allocation of seed 2, or more. |
| S5 | 0.5 | The function with the largest gap of bytes, seed 1 minus seed 2, is `gapPlan` of `highways` or a function that it calls. |

If S1 is false, the pair alone does not make the gap. Then the gap of seed 1 comes from the memory that the pairs before it keep, and step 2 examines that sequence.
A fix passes L81 only when seed 1 stays under 3072 MB in a full run of the gate in `bench-6144`. A pass in a diagnostic mode does not pass L81.
