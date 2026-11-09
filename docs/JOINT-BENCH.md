# The joint benchmark

The joint benchmark packs each input of a joint corpus, and then routes the packed input. It runs each pair of a pack entry and a router. The package `packages/joint` holds the runner and the analysis. The workflow `joint-bench.yml` runs them in CI.

The times in this file come from one process that runs many pairs in order. Earlier cases change the heap and the decisions of V8 for a later case, in both directions. Thus a time in this file is not the cost of a pair alone (the fleet bench rule of 2026-11-02). Use these times only to plan the shards and to compare pairs of one run. The Time row of a candidate uses the time arms, with a fresh process for each arm (refer to "The Time row").

- The corpus is `joint-v2` by default (`docs/JOINT-CORPUS.md`). The first run used `joint-v1`.
- The pack entries are the 12 entries of the benchmark of `packing` 0.2.10 without `push`, and the entry `select` (L32). The strategy `push` supports only the mode `incremental`, and each joint input is `offline`.
- The entry `select` is the composite strategy `select` of `packing` 0.2.15, the `DEFAULT_STRATEGY` of `packDefault`. Refer to "The prediction for the select packer (L32)".
- The entries `rows-graph-bfs` and `maxrects-bl-graph-bfs` of L47 use the order `graph-bfs` of `packing` 0.5.0. Refer to "The graph-bfs entries (L47)".
- The routers are the 9 router strategies of `highways` 0.6.0, and the portfolio router `portfolio` of `highways` 0.6.0.
- The joint-v2 run of 2026-10-28 used `packing` 0.2.6 and `highways` 0.5.1. Version 0.6.0 changes the default members of `portfolio`.
- Since `highways` 0.9.1, the routers also hold the 5 highway strategies of wave 3 (`HIGHWAY_ROUTERS`): `steiner`, `gaps`, `streets`, `search` and `interchanges`. Each makes a plan of highways, then `follow` routes it.
- Thus the default benchmark has 300 pairs: 20 pack entries and 15 routers. bench-4 had 270 pairs, and the space `bench-3` had 195 pairs.
- The runs before `bench-3` had 130 pairs, and the runs before L32 had 120 pairs. `joint-v2` has 303 inputs, and `joint-v1` has 285 inputs.
- The cost model of the shard plan gives each new pair the mean time of the 130 pairs of the fit. The first full run of 195 pairs gives the data for a new fit.
- The option `--lanes on` adds the 18 lane pairs of L13. Refer to "The lane pairs".
- The option `--iterate on` adds the 18 iteration pairs of L11. Refer to "The iteration pairs".
- The option `--cover on` adds each other strategy of `packing` and each open router of `highways`. Refer to "The cover of the catalogs".
- The option `--confirm on` runs the 6 pairs of L40 on the seeds 4, 5 and 6. It replaces `--lanes` and `--iterate`. The command `confirm` then gives the decision. Refer to "The prediction for the first joint default (L40)".
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

## A shard with a deadline, and a resume

A shard stops at a clean point after 330 minutes (`SHARD_DEADLINE_MINUTES`). The job limit of GitHub is 360 minutes, and a job at that limit can lose its records. The script examines the deadline after each pair, and it exits with 0. Its last line gives the count of the pairs done and the pairs missing. A step limit of 350 minutes stops one pair that runs for too long. Each pair is on the disk when it ends, so that stop keeps the pairs before it.

Each shard writes two files, one line for each pair when the pair ends:

| File | Line |
| --- | --- |
| `records-<i>.jsonl` | The record of the pair, with no change to its form |
| `pairs-<i>.ndjson` | The stamp, the input, the input hash, the pair and `wallMs` |

`wallMs` is the time from the end of the pair before it. Pairs of one input share a pack and shared routes, so the first pair of a pack entry holds the time of the pack. A later pair with the same pack output can cost almost nothing. Read a strategy by the sum of its pairs, not by one pair. `bench.mjs costs` gives that table, and the job analyze keeps it as `report/pair-costs.md`.

A manual run with the input `resume-run` keeps the records of an earlier run and runs only the missing pairs:

1. The job prior downloads the artifacts of the earlier run. `bench.mjs resume` keeps each pair that has the stamp of this code, the hash of its input and a whole record.
2. It writes the kept records as the artifact `joint-records-prior`, so the analysis and a later resume read them.
3. The plan gives each input the cost of its missing pairs. Each pair costs its measured time against the plan (`pairFactors`), not the mean cost of a pair.

The stamp (`runStamp`) holds the corpus, `BENCH_SPACE_VERSION`, the versions of `packing`, `highways` and `layout-contract`, and the text of `runner.ts` and `cover.ts`. A change of any of these facts gives a new stamp, and no record of the old stamp joins. A release on `main` between two runs thus stops the resume. To keep a chain of runs, start each run from the same commit.

The lane pairs, the iteration pairs and the confirmation do not take a resume, because each of them reads the routes of other pairs.

## A carry of the records over an engine release (L147)

A resume keeps only the records of the same stamp, and the stamp holds the versions of the engines. So each release of an engine measures each pair again. Most releases change the outputs of no strategy. A carry keeps the records of these pairs, and measures the other pairs again.

The probe job starts the command `carry-probe` two times: with the engines of the earlier run, and with the engines of this run. Each probe gives two kinds of fingerprints:

- The fingerprint of a pack entry on an input (`packProbe`). It is the hash of the pack output, the measures and the hard counts, from one pack of the input. The stage of the pack of `pairRuns` makes the same calls. The hash leaves out the time measures, for example `pack.search.ms` of a size search. With them, each probe of an input with a container of free size had a new hash.
- The fingerprint of a router: the hashes of its records on the inputs of the slice `pr`, without the times (`routerFingerprint`). The first pack entry packs these inputs.

The command `carry` keeps a record when all of these conditions are true:

1. The record has no field `skipped`.
2. Its pack strategy and its full pack options are the same in this run.
3. Its pack entry on its input has the same fingerprint at the two versions.
4. Its router has the same fingerprint at the two versions.
5. The local imports of `runner.ts` have the same text at `--from-commit` and in this checkout. Else the command keeps no record.

Each kept record gets the field `carried` of `layout-contract` 0.6.1. It holds the versions of the measure and of this run, the fingerprints, and the earlier run. The command then takes a seeded sample of the kept records: max(30, 5 %) of the pairs (`auditSample`). The run measures these pairs again, and the command `carry-audit` compares them without the times (`auditForm`). One pair with another record fails the audit. Then no record joins, and a resume with no carry measures each pair again.

The probe of a router reads only small inputs. A change of a router on large inputs only can thus pass the probe. The audit is the check of this case. The contract is a workspace package, so the probe has no contract at the earlier version. The audit is also the only check of a change of the contract.

### A carry in the workflow

A manual run of `joint-bench.yml` with the inputs `resume-run` and `carry` makes a carry. Without `resume-run`, the job `plan` stops the run.

1. The job `probe` has 8 jobs: the sides `from` and `to`, each in 4 shards. The commit of the earlier run comes from the API of GitHub.
2. The side `from` installs the engines of the lockfile of that commit (`carry-engines`), and then probes them. The side `to` probes the engines of this checkout.
3. The job `prior` starts the command `carry` in place of `resume`. The artifact `joint-records-prior` holds only the files `prior-*`. The audit sample goes to the artifact `joint-carry-audit`, so the job `analyze` does not read it as records.
4. The job `run` measures the pairs that the carry did not keep, and the audit sample.
5. The job `carry-audit` compares the audit sample with the new records of the shards. When it fails, the job `analyze` does not start. Then start a resume with no carry.

A carried record is in the data of this run. Thus the site gives it the date of this run, which is the date of the carry check.

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

`pack.ms`, `joint.ms` and `ms` are the sum of the base pair and of all used rounds, also the rounds after the best round. `time.lanes.ms` is the time of the lane counts and the margins, and `ms` does not hold it. So `ms` minus `pack.ms` is the route time of the base pair and of all used rounds. `route.ms` holds only the best round.

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

Each `route.ms` comes from a shard process that runs many pairs in order. It is not the cost of a route alone.

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
- The pinned corpus hashes are `277ffd12181e74ef` for `joint-v1`, `1d0909caec40631e` for `joint-v2` and `9b9557161f2eaab9` for `joint-v3`. A change of an input needs a new split file.

## The Time row

The time arms give the Time row of a candidate pair against the default pair (L84). The script is `scripts/time-arms.ts`, and the workflow is `time-arms.yml`. The package `@mark1russell7/rigor-bench` gives the fresh runner `freshRun`, the records, the order of the arms and the pooled verdict.

- The default entry is `TIME_DEFAULT`: the baseline pair `rows+portfolio`. Arm `a` of each pair runs it.
- The candidate is a pair id, for example `select+portfolio`. A lane pair and an iteration pair are also candidates, for example `lanes-iter3.maxrects-cp.corners+corners`.
- The settings are `JOINT_TIME` in `src/time-arms.ts`: `timeMargin` 0.05, 20 cases, 5 rounds, 5 jobs and at most 100 boxes in a case.

### The 4 arms

Each case and each round runs 4 arms:

1. The default and the candidate. They make the candidate pair.
2. The default and a copy of the default. They make the A/A pair.

- `freshRun` of rigor-bench starts each arm in a fresh child process: `node` with argv and no shell. Thus the earlier cases do not change the heap or the decisions of V8 for a later case.
- The script does not run one arm after the other in one process. An A/A check cannot see the effect of earlier cases in one process.
- `timeFreshOptions` gives the options of `freshRun`. The child of an arm is the command `arm` of the script, with the input file of the case.
- The time of an arm is the time of `runInput` inside the child process, from `performance.now()`. The start of the process does not count.
- `pairOrder` of rigor-bench gives the order. The candidate pair starts with `firstArm(round, caseIndex)`, and the A/A pair starts with `firstArm(round, caseIndex + 1)`.
- The pair that runs first turns each second round. The 4 orders of the two pairs come in each 4 rounds.
- The A/A pair has its own 2 runs of the default. The script does not use one time of the default in the two pairs.
- The rounds of job `j` are the global rounds `j * rounds` to `j * rounds + rounds - 1` (`roundOffset`). Thus the merged records have one record for each case and round.
- Each arm of an entry on an input gives the same output hash. A different hash stops the run.
- An arm that takes more than 10 minutes stops the run. `freshRun` stops the process group of the child.
- A case that an entry skips in the first round leaves the run. A skip in a later round stops the run. The field `skipped` of `meta.json` keeps the skip records of `freshRun`.
- The script writes the records of a job when all its arms are done. A job that stops with an error keeps only its `meta.json`.

### The cases

- `timeCases` takes the inputs of `joint-v2` with edges and with 2 to `maxBoxes` boxes. It sorts them by the planned cost.
- It takes 20 inputs at equal steps from the least cost to the most. Nobody picks the cases by hand.
- An input of 1000 boxes takes seconds to minutes for each arm. Thus the default cases do not include them. The input `inputs` of the workflow gives other cases.

### The records

Each job writes `paired.jsonl` and `aa.jsonl`. Each line is one `PairedTime` record of rigor-bench, with these fields:

- `case`, `round`, `first`, `a` and `b`, the times in milliseconds.
- `kind`: `candidate` or `aa`. `job`: the label of the job, the index of the CI job as a string. `baseline` and `candidate`: the entries of arm `a` and arm `b`.
- `env`: the computer of the job from `benchEnv` of rigor-bench, with the CPU model.
- The file `meta.json` of the job has the label of the job, the skip records, the mode `fresh` and the context of the run.

### The verdict

`jointTimeVerdict(jobs, JOINT_TIME)` gives the records of each job to `pooledVerdict` of rigor-bench. The rule is `difference`.

- The command `verdict` reads each `meta.json` with the `.jsonl` files of its folder. Each folder gives one job: its label, its records and its skip records.
- `pooledVerdict` refuses a record with the label of another job.
- A case that a job skipped leaves all jobs. The field `dropped` of the result lists these cases, and the Markdown names them.
- The ratio of a case is `exp(median(log(b / a)))` over its rounds of all jobs.
- The rule gives the bootstrap interval of the candidate median ratio over the A/A median ratio. The A/A arm of the same runs gives the resolution. The rule has no fixed floor in milliseconds.
- The outcome is `same` when the interval is in `[exp(-timeMargin), exp(timeMargin)]`. The rule examines this outcome first.
- Out of the margin, the outcome is `faster` when the whole interval is below 1, and `slower` when it is above 1.
- Each other interval gives `cannot decide`. An A/A arm with fewer than 5 cases also gives `cannot decide`.
- A candidate with the outcome `cannot decide` does not promote. The result then has `decided: false`.
- `timeMargin` is a named setting. The result writes its value, and a change of the value is a measured decision.
- A missing job leaves a case with 2 more rounds of one order. `balanceOrders` of rigor-bench then removes the extra rounds with the highest numbers. The field `trimmed` counts them.
- The result also keeps the verdict of each job alone, with its CPU model. The outcome of the row uses all jobs together.
- The guard of the jobs in `pooledVerdict`: when a job alone gives the opposite direction of the pooled outcome, the outcome is `cannot decide`. An example is a job with `slower` against a pooled `faster`.
- The field `pooledOutcome` keeps the outcome before the guard, and `opposed` lists these jobs.
- The result has the counts of the cases and the rounds, the interval, the A/A median and the steps of the derivation.

### Start the time arms

- The workflow `time-arms.yml` starts only by hand. It has the inputs `candidate`, `default`, `cases`, `rounds` and `inputs`.
- The 5 jobs of its matrix run at most 3 at a time. Each job keeps the artifact `time-arms-<job>`.
- The job `verdict` writes `verdict.md` to the summary of the job, and keeps `verdict.json` in the artifact `time-verdict`.
- The time arms do not run on a local computer. Other jobs on a local computer change the times.

## Start a run

- The input `corpus` of the workflow selects the corpus. The default is `joint-v2`. A pull request runs `joint-v2`. Only a dispatch runs `joint-v3`.
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

### The margins by pair set

The margins of a spec depend on the pairs of the plan. A cover plan holds slow pairs that a default plan does not have. Thus each pair set has its own margins (L143).

- The file `packages/joint/data/margin-sets.json` holds the margin sets. The key of a set is a hash of its corpus and its sorted pairs.
- Each set has the run, the commit and the engine versions of its fit. The versions come from the lockfile of the commit. They are not in the key, so a release does not void a set.
- When an engine of the set has another version in this run, the line of the plan names both versions. A slow new engine thus shows as a cause before the run.
- `pickMarginSet` gives the set with the same pairs as the plan. Else it gives the set with the largest overlap: the shared pairs over the pairs of either list.
- The plan prints a line about its margins. A plan with no set of its own pairs names the set that it uses. The line also gives the error of that set on its own pairs.
- The error is the mean of the absolute log of real / planned on each seed. The margins of this test come from the other 2 seeds.
- A set with no margins in the file takes the margins of `cost-margins.json`. The set of the run `40884908305` has this form, so its margins have one home.

The 2 sets in the file:

| Set | Run | Pairs | Default margin | Error on a held-out seed |
|---|---|---|---|---|
| `d440b203454d987e` | `40884908305`, 2026-10-29 | 195 | 3.19 | 0.24-0.29 |
| `3a00af6420c4ccc4` | `41898523423`, 2026-11-04, the cover | 650 | 9.50 | 0.24-0.34 |

- The default plan has 300 pairs. It takes the first set, with 195 shared pairs, so its plan does not change.
- The cover plan has 694 pairs. It takes the second set, with 618 shared pairs.
- Round 1 of the cover of 2026-11-07 has 3 inputs with 181 pairs each. With the margins of `cost-margins.json`, real / planned is 1.17-1.66. With the second set, it is 0.63-0.89.

A study over the records of `41898523423` compared 4 models. Each model had a fit on 2 seeds and a test on the third seed. The table gives the mean of the absolute log of real / predicted for the total of each input.

| Model | Error on a held-out seed |
|---|---|
| One factor for all pairs | 0.64-0.69 |
| One factor for each strategy | 0.65-0.69 |
| One factor for each strategy and size band | No gain on the factor for each strategy |
| One factor for each spec, fit on the cover | 0.21-0.30 |

A factor for each strategy does not make the plan better. The margin of the pair set does. Thus the key of a set is its pairs, and a new pair mix needs no new option.

To write a set from a run, start `margins` in `packages/joint`:

```sh
gh run download <run id> -R mark1russell7/layout-contract -p "joint-records-*" -D records
pnpm bench margins --records records --run <run id> --commit <sha> --engines packing=<version>,highways=<version> > set.json
```

- The times come from the pair files. Only the lines of the most common stamp count.
- A run before the pair files also needs `--logs <file>`: the log of the run, as for `fit-cost.mjs`. The pairs are then the strategies of the record files.
- Add the set to the list `sets` of `data/margin-sets.json`.

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

## A time budget for each pair

The plan gives each pair the same price, but the routers differ by more than 100 times at 1000 boxes. One slow strategy can thus take a shard to the deadline.

The option `--pair-budget` (the input `pair-budget` of the workflow) holds each stage of a pair to a time budget. The text `5` gives 5 minutes to each input. The text `200:1,5` gives 1 minute to an input of at most 200 boxes, and 5 minutes to a larger input. The budget is part of the stamp, so records of two budgets do not join.

The stage `route` holds the 2 timed routes of a pair. A budget of 5 minutes is thus 5 minutes for 2 routes.

Routers run in the process of the runner and do not yield, so only a hard stop ends a slow pair. The supervisor of `@mark1russell7/rigor-bench/supervise` runs the pairs of a shard in one child process.

- A stage over the budget stops the child. The pair gets a record with the reason `over budget`, and the record gives the budget as a lower bound of its time. A statistic treats this time as censored, not as a value.
- A new child runs the pairs that are left. The pairs before it stay on the disk. Only an overrun costs a new child, so the other pairs keep the caches of a normal run.
- After 2 pairs of one router pass the budget on one input, the other pairs of that router on that input get the reason `not run: over budget on this input`. These records name the 2 pairs. The same rule holds for 2 pack stages of one pack entry. An overrun is measured, and a skip is not.
- An overrun in a pack stage counts for the pack entry, and an overrun in a route stage counts for the router. A slow router thus does not count against a packer.
- A tagged pair is a result, so a resume does not run it again. Its time does not go into the costs of the plan. A run with a larger budget has another stamp, and that run can fill these rows.
- A resume counts the overruns of the earlier run, so a stop does not change the rows. A group with 1 overrun before a stop reaches its limit at the next overrun.
- A shard stops after the pair that runs at 330 minutes, and the step limit is 350 minutes. The plan thus refuses a budget that gives all the stages of one pair 20 minutes or more (L142). Then the step limit cannot stop a pair with no record.

## The cover of the catalogs

The hand lists of the bench missed strategies and routers. `packages/joint/src/cover.ts` derives the rest from the registries, so a new strategy or a new router joins without a change here.

- `coverEntries` gives one entry to each strategy with no entry in `PACK_ENTRIES`.
- `aspect-fit` needs the strategy that it wraps, and `push` needs the mode `incremental`. `COVER_SETTINGS` gives both.
- `push` starts each item with no earlier place, so it does not test a change of an input. It tests only that the strategy runs.
- A cell that a strategy does not support gives a skipped record with the reason. A test fails when a strategy runs on no input.
- Each new entry meets `corners`, `portfolio` and 2 other routers in turn. Each open router meets `maxrects-cp` and `select`.
- `COVER_EXCEPTIONS` is a closed list. It is empty since L94. A test fails when the list grows, and when an exception starts to run.
- `hole-degree` and `circle-quasi-physical` pack only circles, and `exact-strip` takes only small strips of whole sizes with no gap. The array `shapes` of `joint-v3` has inputs for the three. On `joint-v2`, they skip each input, so a cover run of `joint-v2` does not count them.
- The test reads `strategies`, `composites` and `shapeStrategies` of `packing`. It changes to the single list when `packing` exports one.

The default plan does not change, so the earlier reports stay comparable. A run with `--cover on` has more pairs, so the floors of that run do not compare with the floors of a default run.

The cover run costs approximately twice the default run, so it does not start on each merge. It starts when `packing` or `highways` changes its MINOR version, at most once each week. The site marks its result as a cover run, and the default run stays the first result.

## The prediction for the first joint default (L40)

This section comes before the run. L11 named `lanes-iter3.maxrects-cp.corners+corners` as the candidate, with `lanes-iter2` as a tie. L40 tests the two caps on fresh seeds.

### The run

- `--confirm on` runs 6 pairs on the seeds 4, 5 and 6 of `joint-v2`. Each earlier run has the seeds 1, 2 and 3.
- The 6 pairs are the 2 candidates, `lanes-sides.maxrects-cp.corners+corners`, `maxrects-cp+corners`, `rows+portfolio` and `select+portfolio`.
- The floor of each input comes from these 6 pairs, not from the 148 pairs of L11. Thus the misses of this run do not compare with the misses of L11. Each comparison in this run uses one floor, so the comparisons are fair.
- The decision needs only these 6 pairs. The plan at 12 shards predicts 76.9 minutes of shards, and the full iteration run of L11 took 355.4 minutes.

### The decision

The rule is `confirmDefault`, and it does not change after the run.

- The score of a pair on an input is its `joint.fill` when it reaches the floor, else 0. The cell is the headline cell: the rule `all` and the cap 1.25.
- Each comparison uses the family verdict with the tie 0.005 and the level 0.05. The Holm correction covers the 9 comparisons.
- The cap 3 stays only when it is better than the cap 2. A tie goes to the cap 2, which is faster.
- The chosen cap is confirmed when all of these hold on the headline inputs:
  - It is better than `rows+portfolio` and `select+portfolio`.
  - It is not worse than `lanes-sides.maxrects-cp.corners+corners` or `maxrects-cp+corners`.
  - Against `lanes-sides`, no guard is worse and each guard has values. The guards are the `joint.*` guards and the 4 `pack.*` guards.
  - Each pair has a record on each headline input.
- The stress inputs are a report only.
- The guards leave out the `route.*` measures, because no table gives their directions until the registry of L65.

### The predictions

- The chosen cap beats both baselines.
- The chosen cap beats `lanes-sides`. On the seeds 1 to 3, the gain was +0.013 [0.007, 0.020].
- The gain over `maxrects-cp+corners` stays unproven. Its interval held 0 on 6 of 6 pairs in L11 (H10).
- The cap 3 does not beat the cap 2, so the run chooses the cap 2.
- No guard is worse against `lanes-sides`.

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
- The job `gate` fails when an input has no probe, an OOM or another error, or a peak RSS at the ceiling or more. The limits of input F are in "The limits of the memory gate".
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

### The result of the gate with 3 jobs at once

The first gate with 3 jobs at once was run `41042609930`, after the sweep of the night of 2026-10-30. I scored the claims on 2026-11-01, and I wrote the scores here on 2026-11-02.

| Claim | p | Result | Brier |
|---|---|---|---|
| N1 | 0.6 | true: the gate took 375 minutes | 0.160 |
| N2 | 0.85 | true: 102 probe jobs passed, the gate job failed on its limit, and GitHub cancelled no job | 0.023 |
| N3 | 0.25 | false: the night ended at 16:56 UTC | 0.063 |

The mean Brier score of N1-N3 is 0.082. The claim on the time of the sweep in [SWEEP.md](SWEEP.md) is also a miss. With it, the mean of the night is 0.151.

### The read of the gate waits

The workflow `queue-read.yml` reads the wait of each pull request gate and each release gate of the public repositories. It runs each morning at 08:09 UTC and at the end of each run of the memory probe. Its artifact `queue-read` holds the facts, the rows and the report, and its summary shows the report.

The report gives two waits for each run:

- The job wait is the largest job start minus job creation. GitHub makes a job with `needs` when the job before it ends, so this does not count earlier jobs. It does count the `max-parallel` of the run itself.
- The first wait is the first job start minus the start of the run. Nothing of the run itself holds its first job. A rerun counts from the start of its new try, so the time between tries is no wait.

A wait counts as under a memory gate when it overlaps the span of that gate. The report also gives the span of each gate and the peak count of jobs at one time. This read does not stop the trial, and it starts no stop of its own.

The limits of this read:

- It reads public repositories only.
- A cancelled run or a skipped job is not a wait.
- A job in the queue at the read has no wait yet, because GitHub gives it a start time equal to its creation time. The run stays open, so a later read takes its real start.
- It shows that a wait and a gate came at one time. It does not show that the gate caused the wait.
- The rate limit can cut a read. The report states the count of runs left out, and the next run goes on from the artifact.
- The job reads also stop after 25 minutes of the 40 of the job, with the same count. A run with no artifact reads 10 days of runs. From 2026-11-05 to 2026-11-07, each such read passed the timeout, so no run gave an artifact.

This workflow is a dated tool. It ends when one night of its rows matches the queue record of the CI slots, or on 2026-11-14 at the latest. Then the workflow goes, and anything still of use moves to that record.

The two sources match on a night when all of these hold, over the public repositories:

- The largest job wait of each run differs by at most 1 minute. Both read the same two times from GitHub, so a larger difference is a fault of a read.
- The count of runs with a wait over 15 minutes is equal.
- At most 5 % of the runs are in only one source.

### The trial of the gate with 6 jobs at once

The gate of 2026-11-04 (run `41769223049`) took 607 minutes with 1,440 job minutes on 3 lanes. Its longest job took 303 minutes, for 3 seeds of the dense input with hubs: 82, 108 and 112 minutes. The nightly gate has 6 jobs at once for 3 nights, and the total of the job minutes does not change. This is a stated exception to the limit of 3. A dispatch keeps 3.

The claim for night 1 is on the span from the first job start to the last job end. The span is 280 to 380 minutes, because the longest job sets the floor over the job minutes per lane (240).

The trial stops if a release gate or a PR gate waits more than 15 minutes because of it. It also stops if a heavy dispatch stays refused overnight because of it. Each seed that costs more than 60 minutes gets its own job after night 1, so that night 1 reads the lanes alone. A job that reaches the limit of 340 minutes is a fault of the job limit, not a memory result.

### The end of the trial

The trial ended on 2026-11-08, after its 3 nights. Each run of the gate has 3 jobs at once again, and `GATE_LANES` is 3.

The stop rule of the trial also applies. On 2026-11-08 at 10:16Z, gates of other repositories waited up to 117 minutes for runners. At that time, the gate run `42460396953` had 100 jobs in its queue.

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

### The result of the first run of the gate

Run `40993165948` on main examined 293 probes with the limit 3072 MB. 1 probe failed: seed 1 of the dense input with hubs, with a peak RSS of 3337 MB. Seed 2 peaked at 2930 MB and seed 3 at 2864 MB. The next family peaked at 2247 MB. Each probe has the status 0. The run took 4 hours and 10 minutes, and the job of the dense input with hubs took 248 minutes.

| Claim | p | Result | Brier |
|---|---|---|---|
| M1 | 0.7 | true | 0.090 |
| M2 | 0.75 | true | 0.063 |
| M3 | 0.5 | true | 0.250 |
| M4 | 0.6 | true | 0.160 |
| M5 | 0.55 | void | none |
| M6 | 0.5 | false | 0.250 |

The mean Brier score of M1-M4 and M6 is 0.163. The fleet rule of 2026-10-30 makes M5 void. A time depends on the CPU model of the runner, and the jobs ran on 5 CPU models. Each record of the gate has the CPU model and the mode. A memory peak does not depend on the CPU model, so M1-M4 and M6 stand.

- M5 is void, but its error is a lesson. I used the 67 minutes of the longest shard of the full bench as the time of one job. The job of the dense input with hubs runs its 3 seeds one after the other, and each seed takes approximately 80 minutes. Thus this one job sets the time of the run.
- M6 is a miss. The seeds of bench-4 peaked from 3438 MB to 4287 MB in their shards. Alone, the peaks are from 2864 MB to 3337 MB, and seed 1 has the highest peak. The RSS of a shard includes the memory of the inputs before it. Thus the spread of bench-4 came from the shards, not from the seeds.
- Seed 1 must come down by 8% to pass the gate. Step 2 of L81 runs the pair `maxrects-cp+gaps` alone on seed 1 and seed 2, each in a fresh process. A diff of the two names what seed 1 holds.

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

### The result of step 2

The run [41355387962](https://github.com/mark1russell7/layout-contract/actions/runs/41355387962) ran the pair `maxrects-cp+gaps` alone on seed 1 and on seed 2 of the dense input with hubs, with `highways` 0.10.0.

| Mode | Seed | CPU | Peak RSS (MB) | Sampled allocation (GB) |
|---|---|---|---|---|
| `bench-6144` | 1 | AMD EPYC 7763 | 1878 | |
| `bench-6144` | 2 | AMD EPYC 7763 | 1824 | |
| `alloc-6144` | 1 | Intel Xeon 6973P-C | 1980 | 45.8 |
| `alloc-6144` | 2 | AMD EPYC 9V74 | 1979 | 46.9 |

The top 20 functions hold 90% of the sampled bytes. The functions with the most bytes, seed 1 and seed 2 in GB:

| Function | Seed 1 | Seed 2 |
|---|---|---|
| `placeRoutes` of `highways` | 11.4 | 12.0 |
| The `querySegment` callback of `measureQuality` of `highways` | 8.6 | 9.4 |
| `mergeSort` | 2.9 | 2.8 |
| `hypot` | 2.2 | 2.5 |
| `sha256Hex` of `layout-contract` | 2.0 | 1.9 |

| Claim | p | Result |
|---|---|---|
| S1 | 0.6 | Miss. Seed 1 alone peaks only 54 MB above seed 2 alone. |
| S2 | 0.75 | Hit. Both seeds stay under 1900 MB in `bench-6144`. |
| S3 | 0.65 | Hit. `placeRoutes` of `highways` allocates the most bytes. |
| S4 | 0.55 | Miss. The allocation of seed 1 is 0.98 times the allocation of seed 2. |
| S5 | 0.5 | Void. `alloc.jsonl` kept only 20 functions, so a function under the cut reads as 0 bytes. |

The mean Brier score of S1 to S4 is 0.212.

- The pair alone peaks at approximately 1.85 GB. In the full runs, the same pair peaked at 3337 to 3661 MB. Thus 1.4 to 1.8 GB of the peak comes from the pairs before it.
- The pair allocates approximately 46 GB in approximately 3 minutes, and a GC collects almost all of it. With a heap cap of 6144 MB, the peak RSS shows when V8 collects, not the memory that the input needs. This explains the A/A spread of 25% of the first gate.
- The allocation of the two seeds differs by only 2.5%. A count of the allocation is almost deterministic, so it is a better measure for a gate.
- `alloc.jsonl` keeps 100 functions since this result.
- `highways` took the allocations of `placeRoutes` and `measureQuality` as its item ALLOC-CHURN. `sha256Hex` is in this repository.

### The prediction for the A/A repeat

The A/A repeat gives the noise of each measure, and the gate limits come from it (the fleet rule 1e10f489).
The run uses the mode `measure-6144` on the 3 seeds of the dense input with hubs. Each seed has 5 repeats, each in a fresh job.

- `measure-6144` has the heap cap of `bench-6144`. It samples the allocations of each pair, and forces a full GC after each pair and at the end of the input.
- `summary.jsonl` gives one line for each input, with these fields:
  - `allocMb`: the sampled allocation of all pairs.
  - `liveMaxMb`: the largest retained heap after a pair.
  - `liveEndMb`: the retained heap at the end.
  - `maxRss`: the peak RSS.
- Each line has the CPU model. The analysis groups the repeats by CPU model.

The limit of a measure is its worst value plus `max(10%, 3 × spread)`. The spread is `(max - min) / min` of the repeats of a seed. The allocation and the retained heap get a limit. The peak RSS gets a limit only when its spread is under 10%. Otherwise it is a column of the report.

I wrote these claims before the run.

| Claim | p | Claim text |
|---|---|---|
| A1 | 0.85 | For each seed, the spread of the sampled allocation over its 5 repeats is under 3%. |
| A2 | 0.75 | For each seed, the spread of `liveMaxMb` over its 5 repeats is under 10%. |
| A3 | 0.8 | `liveMaxMb` stays under 800 MB in each run. Thus the 1.4 to 1.8 GB of the earlier pairs is garbage, not a leak of the harness. |
| A4 | 0.55 | On at least 1 seed, the spread of the peak RSS over its 5 repeats is 10% or more. |
| A5 | 0.7 | The peak RSS stays under 3072 MB in each run, because the forced GC after each pair removes the garbage of the pairs before it. |
| A6 | 0.75 | When the repeats of a seed have more than one CPU model, the allocation of each CPU model differs by less than 3%. |

- A1: the work of a seed is deterministic. The sampling at 32 KB of 46 GB of allocation has a small error.
- A3: in L77, the live heap after a forced GC between the pairs was at most 229 MB.
- A4 is risky: the forced GC after each pair can remove most of the noise of the peak.
- A5: the pair alone peaked under 2000 MB in step 2.

If A1 and A2 are hits, the gate moves to `measure-6144`, with derived limits on the allocation and the retained heap.

### The result of the A/A repeat

The run is [41360122516](https://github.com/mark1russell7/layout-contract/actions/runs/41360122516), on commit `2ece000`. The 15 probes ended with status 0, and each one has a line in `summary.jsonl`. The gate job failed, because it compares the peak RSS with the old limit of 3072 MB (A5).

| Seed | CPU model | Runs | Allocation (MB), min to max | `liveMaxMb` | `liveEndMb` | Peak RSS (MB), min to max | Time (min) |
|---|---|---|---|---|---|---|---|
| s1 | AMD EPYC 7763 | 5 | 2207753 to 2209902 | 368 | 59 | 3716 to 4393 | 84 to 87 |
| s2 | AMD EPYC 7763 | 4 | 2914222 to 2916297 | 368 to 369 | 59 | 3291 to 3995 | 110 to 133 |
| s2 | AMD EPYC 9V45 | 1 | 2918813 | 368 | 59 | 3888 | 67 |
| s3 | AMD EPYC 7763 | 2 | 3209627 to 3209920 | 450 | 59 | 3504 to 3827 | 111 to 114 |
| s3 | AMD EPYC 9V45 | 2 | 3212741 to 3214761 | 450 | 59 | 3627 to 3943 | 68 |
| s3 | AMD EPYC 9V74 | 1 | 3210383 | 450 | 59 | 3826 | 87 |

| Claim | p | Result | Hit |
|---|---|---|---|
| A1 | 0.85 | The largest spread of the allocation of a seed is 0.16% (s2 and s3). | yes |
| A2 | 0.75 | The largest spread of `liveMaxMb` of a seed is 0.27% (s2). | yes |
| A3 | 0.8 | The largest `liveMaxMb` is 450 MB (s3). | yes |
| A4 | 0.55 | The spread of the peak RSS is 18.2% on s1, 21.4% on s2 and 12.5% on s3. | yes |
| A5 | 0.7 | The peak RSS is more than 3072 MB in each of the 15 runs, from 3291 to 4393 MB. | no |
| A6 | 0.75 | The largest difference of the allocation between CPU models is 0.11% on s2 and 0.12% on s3. | yes |

The Brier score is 0.147 (6 claims).

- The allocation and the retained heap are almost the same in each run. Thus they are good gate measures.
- The CPU model changes the time (67 min on 9V45, 110 to 133 min on 7763 for s2), but not the allocation.
- The miss of A5: the retained heap after a pair is at most 450 MB, but the peak RSS is 3291 to 4393 MB. Thus the peak comes from garbage inside a pair, before V8 collects it. With a heap cap of 6144 MB, V8 lets the heap grow more before a full GC than with the smaller cap of step 2. The forced GC after each pair does not limit the peak inside a pair. My reason for A5 was wrong.
- The peak RSS depends on the time of the GC, so it is not a regression gate. But a peak of 3.3 to 4.4 GB is a real risk on a machine with less memory. Thus the peak RSS gets a coarse ceiling, as a crash guard. Its limit is the worst peak of the limit runs plus their spread, so it fails only on a large jump.

The peak is 9 times the retained heap. A probe with the mode `cap-2048` tests the explanation: it does the same work with a heap cap of 2048 MB and no forced GC. If the peak is garbage that V8 collects late, V8 collects sooner with the smaller cap, and the run ends with a smaller peak. If the code needs the memory, the run stops with an OOM. I wrote these claims before the run:

| Claim | p | Claim text |
|---|---|---|
| G1 | 0.70 | Each of the 3 seeds ends with status 0 with `cap-2048` (no OOM). |
| G2 | 0.70 | The peak RSS of each `cap-2048` run is under 2600 MB. |

The rule of the limits changed after the prediction (the fleet strategy, 2026-11-02). The limit of a measure is the worst value of 5 or more CI runs plus their spread (max minus min). The value is rounded up to 1 MB, and the run ids and the formula are next to it. There is one limit for each CPU model with 5 or more runs, and the worst stratum for the other models. A run counts unless a check that does not use its value shows a fault.

These runs do not give the limits of `main`, for two causes:

- `sha256Hex` allocated 2 GB in one pair, and `9d584c8` (PR #113) removed most of it. These runs are on `2ece000`, before that change.
- Only s1 on AMD EPYC 7763 has 5 runs of one CPU model.

Thus the next run measures `main`, with 5 repeats of each seed. It gives the effect of `9d584c8`, the runs of the limits and the runs of the ceiling. A seed with no CPU model at 5 runs gets more repeats.

### The result of the probe with a heap cap of 2048 MB

The run is [41420167401](https://github.com/mark1russell7/layout-contract/actions/runs/41420167401), on commit `93c6010` of `main`. Each seed ran 1 time, in its own job.

| Claim | p | Result | Hit |
|---|---|---|---|
| G1 | 0.70 | Each of the 3 runs ended with status 0 and 270 pairs. | yes |
| G2 | 0.70 | The peak RSS is 1631 MB on s1, 1725 MB on s2 and 1638 MB on s3. | yes |

The Brier score is 0.089 (2 claims).

- With the smaller cap, the same work ends with a peak of less than half. Thus the peak at a cap of 6144 MB is garbage that V8 collects late. The code does not need that memory.
- Thus the peak RSS at a cap of 6144 MB is not a regression measure. It gets only the ceiling of the next sections.

### The prediction for the limit run

The limit run measures `main` after `9d584c8`. It has the mode `measure-6144` and 5 repeats of each seed of the dense input with hubs. I wrote these claims before the run:

| Claim | p | Claim text |
|---|---|---|
| M1 | 0.70 | On each seed, the mean allocation is less than the smallest allocation of the seed in the A/A repeat. |
| M2 | 0.70 | On each seed, the largest `liveMaxMb` is within 2% of the A/A value: 368, 369 and 450 MB. |
| M3 | 0.70 | On each seed, the spread of the allocation (max minus min, divided by min) is less than 1%. |

### The result of the limit run

The run is [41408115284](https://github.com/mark1russell7/layout-contract/actions/runs/41408115284), on commit `93c6010` of `main`. The 15 probes ended with status 0 and 270 pairs. The gate job failed, because it compares the peak RSS with the old limit of 3072 MB.

| Seed | CPU model | Runs | Allocation (MB), min to max | `liveMaxMb` | `liveEndMb` | Peak RSS (MB), min to max | Time (min) |
|---|---|---|---|---|---|---|---|
| s1 | AMD EPYC 7763 | 3 | 2178555 to 2180165 | 368 | 59 | 3215 to 4404 | 87 to 88 |
| s1 | AMD EPYC 9V45 | 1 | 2181901 | 368 | 59 | 4384 | 50 |
| s1 | AMD EPYC 9V74 | 1 | 2178050 | 368 | 59 | 3762 | 90 |
| s2 | AMD EPYC 7763 | 2 | 2881221 to 2882930 | 368 to 369 | 59 | 3672 to 4503 | 111 to 112 |
| s2 | AMD EPYC 9V45 | 1 | 2886809 | 368 | 59 | 3612 | 67 |
| s2 | Intel Xeon Platinum 8573C | 2 | 2883642 to 2883704 | 368 | 59 | 3670 to 3674 | 91 to 101 |
| s3 | AMD EPYC 7763 | 3 | 3173755 to 3175543 | 450 | 59 | 3476 to 4043 | 114 to 119 |
| s3 | AMD EPYC 9V74 | 2 | 3169679 to 3173197 | 450 | 59 | 3365 to 3466 | 96 to 192 |

| Claim | p | Result | Hit |
|---|---|---|---|
| M1 | 0.70 | The mean allocation is 2179522 MB on s1, 2883661 MB on s2 and 3173214 MB on s3. These values are 1.3%, 1.0% and 1.1% less than the smallest A/A values. This is the effect of `9d584c8`. | yes |
| M2 | 0.70 | The largest `liveMaxMb` is 368 MB on s1, 369 MB on s2 and 450 MB on s3. These are the A/A values. | yes |
| M3 | 0.70 | The spread of the allocation is 0.18% on s1, 0.19% on s2 and 0.19% on s3. | yes |

The Brier score is 0.089 (3 claims).

### The limits of the memory gate

No seed has 5 runs of one CPU model. Thus the limits of each seed use the probes of all CPU models together. Two checks give the reason:

- A6 of the A/A repeat: the CPU models change the allocation by at most 0.12%.
- The run 41408115284: the CPU models change the allocation by at most 0.16% (s2). This is less than the spread of 0.18% to 0.19% of one seed.
- The allocation counts the bytes that the code asks for. The speed of the CPU does not change it. The time changes, from 50 to 192 minutes for one seed.

The formula of each limit is the worst value of the 5 probes of the run 41408115284 plus the margin, rounded up to 1 MB. The margin is the larger of two values: the spread of the 5 probes (max minus min), and one step of the measure. The two measures have steps of 1 MB.

| Seed | Allocation (MB): worst + margin | Allocation limit (MB) | `liveMaxMb` (MB): worst + margin | `liveMaxMb` limit (MB) |
|---|---|---|---|---|
| s1 | 2181901 + 3851 | 2185752 | 368 + 1 (the spread is 0) | 369 |
| s2 | 2886809 + 5588 | 2892397 | 369 + 1 | 370 |
| s3 | 3175543 + 5864 | 3181407 | 450 + 1 (the spread is 0) | 451 |

The re-fit of 2026-11-04 replaces these limits. It uses the same formula on the run [41654875543](https://github.com/mark1russell7/layout-contract/actions/runs/41654875543), on commit `21f9dc4` of `main`. Each seed has 300 pairs in that run, not 270, because the order `graph-bfs` added 30 pairs.

| Seed | Allocation (MB): worst + margin | Allocation limit (MB) | `liveMaxMb` (MB): worst + margin | `liveMaxMb` limit (MB) |
|---|---|---|---|---|
| s1 | 2531692 + 3575 | 2535267 | 393 + 1 (the spread is 0) | 394 |
| s2 | 3307620 + 1088 | 3308708 | 420 + 1 (the spread is 0) | 421 |
| s3 | 3566522 + 7250 | 3573772 | 502 + 1 (the spread is 0) | 503 |

- The 270 old pairs did not move. Over the 15 probes, their largest live heap is 369, 369 and 451 MB, inside the old limits. Their allocation is at most 2181621, 2881538 and 3177537 MB.
- The 30 new pairs give the rise. The largest live heap is on `maxrects-bl-graph-bfs+corners-smooth` for each seed. The routers are the same, but the retained heap also depends on the layout that a router reads.
- The peak RSS of this run is 3320 to 4700 MB. This is under the ceiling, so the ceiling does not change.

A second re-fit on 2026-11-04 replaces the limits of s2 and s3. The gate of the run [41769223049](https://github.com/mark1russell7/layout-contract/actions/runs/41769223049), on commit `5a00107`, failed on s2. Its allocation is 3310056 MB, and the limit was 3308708 MB.

No engine changed after `21f9dc4`. The node version is the same. Each of the 300 records of each seed has the same result bytes as the 5 probes of the first re-fit. Thus the 6 probes are one sample, and the limits use the same formula on the 6 probes.

| Seed | Allocation (MB): worst + margin | Allocation limit (MB) | `liveMaxMb` limit (MB) |
|---|---|---|---|
| s1 | 2531692 + 3575 | 2535267 | 394 |
| s2 | 3310056 + 3524 | 3313580 | 421 |
| s3 | 3566862 + 7590 | 3574452 | 503 |

- The function `straightCrossings` of `src/joint-measures.ts` gives the steps in the allocation. It runs one time for each pack, on the pair with the router `straight`. Some of these calls allocate approximately 1100 MB more than the others.
- One probe has 0 to 4 steps. The 5 probes of s2 in the first re-fit had 0 steps, so their spread of 1088 MB was less than one step. The new probe of s2 has 1 step.
- The reason for a step inside a call is not known at this time. The result bytes are equal, so the step is not a change of the layouts.
- Without the steps, the spread of the 6 probes is 2676 MB (s1), 2390 MB (s2) and 4484 MB (s3). Thus a filter of the steps does not give a much smaller limit, and the gate keeps the full allocation.
- The largest value of s2 without steps is 3308922 MB. With 4 steps of 1134 MB, it is 3313458 MB. This is under the limit of s2.
- `gate.md` shows the count of the steps of each probe next to its allocation. `stepCount` of `src/memory-gate.ts` counts the pairs where `straightCrossings` allocates 500 MB or more. In the 18 probes of the two runs, a plain call allocates at most 27.8 MB. The 21 steps allocate 1076.3 to 1140 MB.

These limits do not catch each growth. The table gives the real growth of the allocation of all pairs, against the 6 probes.

| Seed | A growth that no seen value fails | A growth that each seen value fails |
|---|---|---|
| s1 | up to 3575 MB (0.14%) | more than 7150 MB (0.28%) |
| s2 | up to 3524 MB (0.11%) | more than 7048 MB (0.21%) |
| s3 | up to 7590 MB (0.21%) | more than 15180 MB (0.43%) |

- The first column is the margin, as a share of the worst value. The second column is the limit minus the lowest value, as a share of the lowest value.
- A growth between the two columns fails on some nights only. The result depends on the count of the steps and on the noise.
- The allocation alone is blind to 4 steps. They are 4560 MB: 0.18% of s1, 0.14% of s2 and 0.13% of s3. The lowest value of each seed without steps stays under its limit with 4 steps. Thus read the count of the steps before you read a change of this size as a growth.
- These limits move again only with a measured cause. If a probe goes over a limit, do not re-fit, also when the probe has more than 4 steps. First measure why a call of `straightCrossings` steps, with one small job on that function alone. The first test is the tier of V8. This is a guess at this time.
- A change of the versions of the engines is a measured cause. The next paragraph tells how the gate shows it.

#### The versions of the limits

The live heap is the same in each probe of one seed on one set of versions. Thus the limit of the live heap is a check of an exact value. A change of an engine can move the value over its limit. The gate of the run [41971168014](https://github.com/mark1russell7/layout-contract/actions/runs/41971168014), on commit `ef71e84`, failed by 1 MB on each seed of F:

| Seed | Live heap of the 6 probes (MB) | Live heap in 41971168014 (MB) | Allocation of the worst probe (MB) | Allocation in 41971168014 (MB) |
|---|---|---|---|---|
| s1 | 393 | 395 | 2531692 | 2517625 |
| s2 | 420 | 422 | 3310056 | 3262372 |
| s3 | 502 | 504 | 3566862 | 3538092 |

Between `5a00107` and `ef71e84`, joint moved from highways 0.10.0 to 0.13.0 and from packing 0.5.0 to 0.6.1. The node version stayed 26.13.0. The live heap rose 2 MB on each seed, and the allocation fell 0.6% to 1.4%.

- Each probe writes `engines.json` before its first pair: the versions of node, `@mark1russell7/highways` and `@mark1russell7/packing` (`ENGINE_NAMES`).
- `data/memory-limits.json` holds the runs, the commit, these versions and the values of each probe of the limits. `LIMIT_SOURCE` and `MEMORY_LIMITS` of `src/memory-gate.ts` come from this file. Each limit also holds the worst values of these probes (`fromAllocMb`, `fromLiveMb`).
- `gate.md` gives the versions of the limits, and each change of the versions of the probes with limits. A probe of an older commit has no `engines.json`, and its change is "no versions".
- The column "Change" of `gate.md` gives the change of each probe with limits from the worst probe of the source, in MB and in percent.
- The gate does not change its own limits at any time. To accept a change of the versions, a pull request refits the limits on the new versions with the formula above. The next paragraph tells how.
- The limits have no margin in percent. The spread 0 is a valid result for one set of versions.

#### The refit of the limits

A change of the versions starts a refit in the nightly run. A person reads the change of each input and merges the refit.

1. The plan job runs `bench.mjs engine-change`. It gives each version of the plan job that is not a version of `data/memory-limits.json`.
2. When a version changed, `bench.mjs jobs --limit-repeats auto` gives each input with limits 5 jobs in the mode `measure-6144` (`REFIT_PROBES`). The other jobs keep their count of repeats.
3. The gate job runs `bench.mjs refit` on the probes. The refit is the worst value of the 5 probes plus their spread for each input (`refitLimits`). The job uploads it as the artifact `memory-refit`: `refit.json` and `refit.md`.
4. The first error line of the job names the artifact and the command of the next step. When the gate passes on the new versions, this line is a warning.
5. In `packages/joint`, `node scripts/bench.mjs refit-pr --run <id>` opens the draft pull request of the refit. It changes only `data/memory-limits.json`. The body has the runs, both sets of versions and a table of each measure of each input.

The table of the body gives these columns for the live heap and the allocation of each input:

- The noise band of the old probes and of the new probes, from the lowest probe to the worst probe.
- The old limit, the new limit and their change in MB and in percent.
- The verdict of `noiseVerdict`. A new band above each old probe is a rise past the noise. A new band below each old probe is a fall past the noise.

Each rise past the noise needs a named cause before the merge. The cause is a change of a version, with the commit of that engine if its history shows it. A rise with no cause is a finding for the owner of its engine, and it does not become a new limit. A fall stays in the refit as a ratchet.

The command `refit-pr` refuses these refits:

- A refit with fewer than 5 probes of an input, a probe without `engines.json`, or probes on more than one set of versions.
- A refit of a commit that is not an ancestor of `origin/main`.
- A refit of a commit before a change of `data/memory-limits.json` on `origin/main`.

The command prints the change of each input before it pushes. A pull request of the workflow token starts no checks, so a person or a session runs this command. Its push starts the checks of the pull request.

The 5 probes add approximately 12 jobs of 50 to 192 minutes to the night of a change.

- The limits are in `MEMORY_LIMITS` of `src/memory-gate.ts`. A test examines each limit against the values of each probe in `data/memory-limits.json`.
- A probe fails when a value is more than its limit, or when it has no value.
- The ceiling of the peak RSS is the worst peak of the 15 probes plus their spread: 4503 + (4503 - 3215) = 5791 MB. It applies to each probe of each input. It is a guard against a crash, because the peak RSS depends on the time of the GC.
- The scope: the limits of the allocation and of `liveMaxMb` cover only the 3 seeds of input F, the dense input with hubs. The other 100 families have only the ceiling of the peak RSS.

The nightly gate keeps the mode `bench-6144` on each family, input F too. It also gives each seed of F one job in the mode `measure-6144`, with these limits. One seed takes up to 192 minutes in this mode. Thus 3 seeds in one job take more than the timeout of 340 minutes, and each seed has its own job.

The cost of the 3 jobs comes from the times of the run 41408115284. It is not small:

| Measure | Value |
|---|---|
| The time of one job, median (min to max) | s1 87 (50 to 90), s2 101 (67 to 112), s3 117 (96 to 192) minutes |
| The sum of the medians of the 3 jobs | 305 runner minutes |
| The last two full nightly gates, [41008166915](https://github.com/mark1russell7/layout-contract/actions/runs/41008166915) and [41042609930](https://github.com/mark1russell7/layout-contract/actions/runs/41042609930) | 978 and 1056 runner minutes, 3.4 and 6.3 hours |
| The added runner minutes | 29% to 31% |
| The added time of the run, with 3 jobs at once | approximately 100 minutes |

A nightly gate stops at its start when the last nightly gate examined the same commit. Thus the full cost comes only on a night after a change of `main`.

## The graph-bfs entries (L47)

`packing` 0.5.0 adds the sort order `graph-bfs`. It reads the links of the items, and walks them breadth-first from the hub of each component. The hub is the item with the largest sum of link weights. Without links, the order is `area-desc`.

- The joint package has 2 new pack entries: `rows-graph-bfs` (`rows` with the order `graph-bfs`) and `maxrects-bl-graph-bfs` (`maxrects` with the rule `bl` and the order `graph-bfs`).
- The order is an option of the pack entry, not a router. Thus the pair ids are `rows-graph-bfs+<router>` and `maxrects-bl-graph-bfs+<router>`.
- A pack id has no `+`, because `PAIR_SEPARATOR` is `+`. The functions `packOf` and `routerOfPair` cut a pair id at its first `+`.
- The 2 entries come after `pack`. Thus each pair of bench-4 keeps its place, and the benchmark has 300 pairs.

### The links of the pack input

A joint input has edges, and the pack input of `packInputOf` has no edges. The option `links` of `toPackInput` of `layout-contract` gives the links of the edges.

- `readsLinks(entry)` tells if the order of a pack entry is a graph order of `packing` (`GRAPH_ORDERS`). Only these entries get a pack input with `links`.
- Thus the pack input of each other entry does not change, and its records keep their output hashes.
- The measures and the hard rules of each pack read the pack input without links. The links have no effect on them.
- Each edge between 2 boxes of the input gives one link. The edges of one pair of boxes give one link with their count as its weight.

### The comparisons

`pnpm bench analyze` adds the comparisons of `GRAPH_COMPARE` to its default, when the records have their pairs:

- `rows-graph-bfs+portfolio` against `rows+portfolio` (`BASELINE`). This is the effect of the order on `rows`.
- `maxrects-bl-graph-bfs+portfolio` against `rows+portfolio`.
- `maxrects-bl-graph-bfs+portfolio` against `maxrects-bl+portfolio`. This is the effect of the order on `maxrects-bl`.

### The prediction

The prediction `layout-stack-L47-graph-bfs-joint` of the fleet has the claims. The base rates of the fleet give each p. The claims came before the first push.

- The slice `pr` of `joint-v2` has 30 inputs: 24 headline inputs and 6 stress inputs. The cell `all` with the cap 1.25 has 24 inputs.
- 6 of the 13 comparison cells of each pair are the stress cells, with 6 inputs. They are below the `minRows` of 20 of `surrogate.ts`.
- In run `41577624136`, `rows+portfolio` scores 0.510 in the cell `all` 1.25. The standard deviation of its score over the 24 inputs is 0.269.
- In the same run, `shelf-first-input+portfolio` has the gain -0.128 against `rows+portfolio` in that cell. Its order has no sort by height.

| Outcome | p | Claim |
|---|---|---|
| `benchRowsGraphBfsLosesAll125` | 0.721 | `rows-graph-bfs+portfolio` loses to `rows+portfolio` in the cell `all` 1.25: the interval of the gain is below 0. |
| `benchMaxrectsBlGraphBfsTiesAll125` | 0.721 | `maxrects-bl-graph-bfs+portfolio` ties `rows+portfolio` in the cell `all` 1.25: the interval of the gain holds 0. |
| `benchGraphBfsNoPackHardBreak` | 0.721 | No record of the 2 entries has a skip or a break of a hard rule of the pack. |
| `noExpectationChangeOldPairHashes` | 0.903 | Each record of the 270 pairs of bench-4 has the output hash of run `41577624136`. |
| `headGreenFirstPush` | 0.561 | The 4 checks `CI OK`, `Text bench OK`, `Joint bench OK` and `Security OK` pass on the first push. |

### The result

The Joint bench of pull request 157 (run `41581804139`) gives these results. The first 2 rows are the cell `all` with the cap 1.25.

| Comparison | Gain | Result |
|---|---|---|
| `rows-graph-bfs+portfolio` against `rows+portfolio` | -0.069 [-0.184, 0.040] | Tie. The claim "loses" is a miss. |
| `maxrects-bl-graph-bfs+portfolio` against `rows+portfolio` | 0.051 [-0.035, 0.135] | Tie. The claim is a hit. |
| `maxrects-bl-graph-bfs+portfolio` against `rows+portfolio`, cap 1.1 | 0.150 [0.018, 0.275] | Win. |
| `rows-graph-bfs+portfolio` against `rows+portfolio`, cap 1.5 | -0.074 [-0.144, -0.024] | Loss. |
| `maxrects-bl-graph-bfs+portfolio` against `maxrects-bl+portfolio`, cap 1.25 | 0.080 [-0.016, 0.190] | Tie. |

- The 900 records of the 2 entries have no skip and no break of a hard rule of the pack. The claim is a hit.
- The 8100 records of the 270 pairs of bench-4 have the output hashes of run `41577624136`. The claim is a hit.
- The first push failed `CI OK`. The range of `sortOrder` of the site did not hold `graph-bfs`. The claim is a miss.
- The Brier score of the 5 claims is 0.200.
- No default changes. A tie or a win in one cell is not sufficient for a new default.

## The promotion test of the configs of night 1 (L61)

Night 1 of the sweep gave 9 configs the label `better`, in the epoch `joint-v2_packing-0.2.17_highways-0.9.3_space-bench-2`. That epoch used older engines, and its seeds chose the configs. So a gain of that night is not evidence about the current engines. This test gives each config a fresh trial.

- **Inputs.** The test uses the corpus `joint-v2` with the seeds 7, 8, 9, 10 and 11. The seeds 1 to 3 chose the configs, and L40 holds the seeds 4 to 6. The corpus has 101 specs, so the test has 505 inputs.
- **Arms.** The arms are the 9 configs and the baseline arm. The baseline arm holds the incumbent.
- **Run.** Only a dispatch starts the workflow `promotion.yml`. Its shards use the command `run` of `scripts/sweep.mjs`, which reads the seeds from the plan. A stopped shard keeps its records.
- **Report.** The artifact `promotion-report` has `promotion.json` and `promotion.md`. Each row gives the gain of each seed, the mean and the SD of those gains, the comparison and the guards.

The pass rule has 5 parts, and it was fixed before the first run. A config passes only when each part is true:

1. Each headline input has a record of the config.
2. The score of the config is better than the score of the incumbent. The test uses Holm over the 9 configs, the level 0.05 and the tie 0.005.
3. No guard is worse than the guard of the incumbent.
4. The test reads each guard.
5. The gain of the score is larger than the A/A spread of the score.

The A/A spread compares the incumbent with itself. Only the seed changes between the two sides, and each difference is paired on its spec. The spread is the largest absolute mean difference over the 10 pairs of seeds. A gain under that spread is not a claim, because the incumbent moves that far with no change of config.

The score is only the fill of the inputs that reach the floor. So the report also gives each config in the units of a reader, against the incumbent and the A/A spread of each measure. Those units are fill in points, crossings, overlaps and hard breaks, each as a mean for each layout.

A pass does not change the default. A config that passes also needs the verdict of `time-arms.yml`, so each row keeps its pair id. If L40 changes the default, this test takes the new default as its incumbent. A new default raises the MINOR version, because callers rely on that behavior.

## The explorer record (L104)

The script `packages/joint/scripts/response.ts` turns the records of a run into one file of the format `response-records/1` of `rigor-statistics`. The explorer of `site-pages` reads this file. The sweep cannot give this file, because its state keeps one score for each config and input. The records of `joint-bench.yml` keep each measure.

```
node scripts/response.ts --records <dir> --corpus <corpus.json> --out <file> [--run <id>] [--seeds <n>] [--folds <n>]
```

- Each record is one point. The dimensions are the pack, the router and each field of a cell with 2 or more levels. The count is an ordinal dimension on a log scale.
- The points of one spec are one group, so a fold holds out a whole spec. Thus the fit must have 3 or more specs. Records of one spec stop the fit.
- A pair with no measures stays a point. Each absent measure states its reason: over budget, not run, or skipped.
- The measures are fill, spill, crossings, mean detour and time. Crossings and time are on a log scale, with a floor of 0.5.
- The fit is a ridge fit over stated terms. The terms are each dimension alone, the count with each arm, and the products of a pack and a router. When the products do not fit under the limit of 1023 terms, the pairs with the most points stay.

The first reading is on 186 records of a slice run, with 31 specs, 4 packs and 3 routers. The numbers are the held-out error of the fit and of a plain mean, on the scale of the model.

| Measure | Fit | Mean |
| --- | --- | --- |
| `joint.fill` | 0.179 | 0.170 |
| `joint.spill` | 0.121 | 0.124 |
| `route.crossings` | 0.536 | 0.615 |
| `route.detour.mean` | 0.188 | 0.225 |
| `joint.ms` | 0.361 | 0.502 |

The fit of fill loses to the mean on this slice. This slice is too small to tell if that stays true, so the data of the cover run reads it again.

The cost of a fit of 5761 synthetic points with 829 terms was 92 s on one core and 273 MB. The file had 3.3 MB. A cover run has too many records for a page, so the page uses a stated sample. The sample and the page come with the data of the cover run, because that data has current engines.
