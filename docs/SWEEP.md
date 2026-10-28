# The nightly sweep

The workflow `sweep.yml` searches the joint strategy space each night (roadmap item L35). Its records feed the efficacy maps (L36), the atlas (L44) and the measured gain of each joint idea.

- The sweep uses the runner of the joint benchmark. `docs/JOINT-BENCH.md` tells the runner, the measures and the cost model.
- The sweep runs only in CI. The times of a local computer are not correct.

## The prediction for the first night

The first night scores these claims. The summary of the night (`night.md`, and the summary of the job `summarize`) gives each fact.

| Id | Claim | Confidence |
|---|---|---|
| S1 | Each shard of the 2 rounds ends in less than 45 real minutes. | 0.85 |
| S2 | The 2 rounds screen from 220 to 350 new configs. | 0.8 |
| S3 | The verdict "worse" drops from 50% to 85% of the raced configs. | 0.55 |
| S4 | The incumbent misses the reference floor on 22 or fewer of the 222 headline inputs. | 0.85 |
| S5 | `rows+portfolio` misses the reference floor on 120 to 145 of the 222 headline inputs. | 0.45 |
| S6 | At least 1 raced config gets the label "better" against the incumbent. | 0.35 |
| S7 | The real minutes of all shards are within 25% of the planned minutes. | 0.7 |

S3, S5 and S6 are the risky claims.

- S1: the plan gives each shard approximately 30 minutes. L13 had 31.5 real minutes against 31.0 planned minutes for the most costly shard.
- S3: most random configs have a weak pack entry or a weak router. But the screen has only 1 seed of each spec, so the verdict can give "no verdict" to many of them.
- S4: the floor of 3 configs is not higher than the floor of the 148 pairs of L13. The incumbent missed that floor on 22 inputs.
- S5: `rows+portfolio` packs without a search. Thus its overflow is often larger than the overflow of the incumbent.
- S2: the local plan screens 144 new configs in each round. An iteration config costs up to 10 pairs, so the count changes with the sample.
- S6: the lane params of the sample differ from the defaults of L13. A larger clearance or cap can give more fill, but the screen is small.
- S7: a unit of the sweep has random configs. They share fewer packs than the pairs of the bench, so the real cost can be higher than the plan.

## The joint space

`packages/joint/src/space.ts` makes the joint space `JOINT_SPACE` from 3 parts:

1. `benchPackSpace()`: the engine `packing` with the stage `entry`. Its options are the 13 pack entries of the runner.
2. `benchRouteSpace()`: the engine `highways` with the stage `router`. Its options are the 10 routers of the runner.
3. `laneSpace()`: the engine `lanes` with the optional stage `mode`. Its options are `max`, `sides` and `iter`.

The options `max` and `sides` are the lane pairs of L13. They have the params of `LANE_PARAMS`:

| Param | Values | Default | Use |
|---|---|---|---|
| `passes` | 1 to 3 | 1 | The count of the lane passes |
| `clearance` | 2 to 10 | 5 | The clearance of the lane need `clearance + space * (k - 1)` |
| `space` | 2 to 8 | 4 | The space of each more route in a lane |
| `cap` | 1 to 16 | 8 | The largest count of routes in one lane |

The option `iter` is the iteration of L11: place, route and place again. Its one param `rounds` is the round cap, from 1 to 3, with the default 3 (`ITER_PARAMS`). It uses the default lane options.

`jointSpace(pack, route, options)` joins the parts with `productSpace`, and adds the stage `lanes.mode`. The version of the space is `bench-2`. Version `bench-1` did not have the option `iter`.

- The space has 166 named configs: the 130 pairs, the 18 lane pairs of L13 and the 18 iteration pairs of L11. A named config runs with the pair id of the bench.
- `spaceSize(JOINT_SPACE, { levels: 3 })` gives the base 21580 and the meta 0: 130 × (1 + 2 × 3⁴ + 3).
- `spaceSize(JOINT_SPACE, { levels: 1 })` gives 520, and the levels 2 give 4550.
- The full integer grid has approximately 787000 configs: 130 × (1 + 2 × 3024 + 3).

`configRun(config, space, adapter)` gives the run of a config. The run has the pack entry, the router, a lane entry or an iteration entry, and the counts. A `JointAdapter` reads the pack entry and the router of a config. `BENCH_ADAPTER` reads the stages `packing.entry` and `highways.router`.

- A lane config with the default params gets the lane id of L13, for example `lanes-sides.maxrects-cp.corners`.
- A lane config with other params gets a lane id with the first 8 digits of its config id. Thus 2 configs of one unit do not share a lane id.

### The switch to the engine spaces

The parts are local copies of the bench options. Later, the joint space becomes `productSpace(packSpace, routeSpace)` with the lane part.

1. Replace `benchPackSpace()` and `benchRouteSpace()` with the spaces of `packing` and `highways`.
2. Write a `JointAdapter` that gives the pack entry and the router of a config of these spaces.
3. Change `BENCH_SPACE_VERSION`. The new version starts a new epoch of the data.

## The plan of a night

The date of the night in UTC gives the seed `YYYYMMDD`. Thus a rerun of a night has the same plan. A second run of a date that the state has already does nothing.

| Job | Work | Limit |
|---|---|---|
| `plan` | It reads the state from the branch `sweep-data`, and plans round 1. | 15 minutes |
| `round1` | Each shard runs its units. | 120 minutes |
| `race` | It adds the records of round 1, races the configs and plans round 2. | 20 minutes |
| `round2` | Each shard runs its units. | 120 minutes |
| `summarize` | It adds the records of round 2, and writes the new data tree. | 20 minutes |
| `publish` | It pushes the data tree to the branch `sweep-data`. | 10 minutes |

Round 1 has these jobs, in this order:

1. The baseline arm on each of the 303 inputs: `rows+portfolio`, `select+portfolio` and the incumbent `lanes-sides.maxrects-cp.corners+corners`.
2. The screened configs of earlier nights that do not have the full screen.
3. New configs on the screen, while the budget lasts.

The screen is seed 1 of each of the 101 specs. The budget of a round is `max-shards × target-minutes × 0.9` minutes. Round 1 subtracts the cost of the steps 1 and 2.

Round 2 has these jobs, in this order:

1. The configs that are alive after the race, on the inputs that they do not have. The configs with the best mean go first.
2. New configs on the screen with the rest of the budget. Their seed is `2 × YYYYMMDD + 1`.

The plan of a round:

1. The cost of a job is `plannedCost(spec, boxes, edges, pairs, passes)` of the cost model. A plain config or a lane config has 1 pair.
2. An iteration config has 1 pair and the cost of its chain: `iterPlanPairs`, 3 pairs for each round. Thus `iter` with 3 rounds costs 10 pairs.
3. `unitsOf` joins the jobs of one input into units. The cost of a unit is at most a quarter of the target.
4. `planRound` takes `ceil(cost / target)` shards. While the most costly shard is above the target, it adds a shard, up to `max-shards`.
5. `planShards` gives the units to the shards.

The local plan of the first night (2026-10-29) with the defaults gives these numbers. Round 2 comes from fake records of round 1, so its numbers are approximate.

| Round | Configs | New configs | Jobs | Units | Shards | Planned minutes | Most costly shard |
|---|---|---|---|---|---|---|---|
| 1 | 147 | 144 | 15453 | 362 | 18 | 536.8 | 29.8 |
| 2 | 146 | 144 | 14948 | 362 | 19 | 538.0 | 28.6 |

- Round 1 has 26 plain configs, 91 lane configs and 30 iteration configs.
- Each night runs approximately 37 shards of less than 30 planned minutes, and screens approximately 290 new configs.
- The 2 rounds take approximately 180 minutes of wall time, because `max-parallel` runs 6 shards at the same time. GitHub Free runs at most 20 jobs at once for the account.
- 290 configs are approximately 1.3% of the grid of 3 levels. The integer grid is larger, so the coverage grows each night.

### The new configs

`sampleConfigs` gives the new configs of a round:

1. It takes a Latin hypercube sample of `enumerateSpace` with the seed of the night, 8 times larger than the need.
2. It removes the configs that the state has already.
3. It takes the configs with the largest coverage need, one at a time, and adds each to the counts.

The coverage need of a config is the sum of `1 / (1 + count)` over its strata. `strataOf` gives these strata:

- Each stage with its option, for example `packing.entry=rows`. A config without a lane mode has `lanes.mode=none`.
- Each pair of stages, for example `packing.entry=rows&highways.router=corners`.
- Each param in 3 bins of its range, for example `lanes.mode=sides.clearance#1`.

Thus the sample goes first to the options, the pairs and the param bins with the fewest configs.

## The score

The baseline arm of the night gives the reference of each input. The reference holds the pick values of the 3 configs.

1. `selectBest` of the reference and the config gives the floor after the level of the overflow: the hard breaks, then the overflow area.
2. A config reaches the floor when it is in this floor. Its score is then its `joint.fill`.
3. A config that does not reach the floor gets the score 0. A skipped record also gets 0.

The reference is fixed, so the scores of different nights compare. The floor of the reference is not higher than the floor of all pairs. Thus a config that reaches the floor of all pairs also reaches the floor of the reference.

The baseline arm runs again each night. When a baseline config gets another score on an input, the night counts the input as drift.

## The race

The job `race` races the screened configs against the incumbent (`raceNight`):

1. Each screened config with at least 80% of the screen takes part.
2. `verdict` pairs the scores of the config and the incumbent by input, with the board kind as the family. The tie is 0.005 and the level is 0.05.
3. The race drops each config with the label "worse".
4. The race keeps each config with the label "better".
5. Successive halving keeps 1 of each 3 of the other configs (`SWEEP_ETA`), by the mean of the stratified difference. It halves the rest.
6. The alive configs with the full corpus race again without the halving. The race drops a config that becomes "worse".

The dropped and halved configs lose their values in the state. Their rows stay in the summary. Round 2 gives the alive configs the other seeds, so the next race has more pairs for them.

## The records

- The raw records of each shard are the artifacts `sweep-records-<round>-<shard>`. Each record has the config id as its strategy and the pair id in `options.pair`.
- The artifact `sweep-data` holds the new data tree of the night.
- The job `publish` pushes the data tree to the branch `sweep-data`. Only this job has `contents: write`.
- The job `publish` runs only for a run from `main` without `dry-run`. It does not push to `main`.

### The branch `sweep-data`

```text
index.json                         the epochs, with the latest epoch, its nights and its status counts
epochs/<epoch>/state.json          the configs, their status and the values of each input
epochs/<epoch>/summary.json        the cumulative summary as a table
epochs/<epoch>/nights/<date>.json  the facts of each night: the rounds, the race, the shards and the drift
```

The epoch is `<corpus>_packing-<version>_highways-<version>_space-<version>`, for example `joint-v2_packing-0.2.17_highways-0.8.1_space-bench-2`. A new version of an engine or of the space starts a new epoch. The data of the old epochs stays.

`summary.json` has one row for each config, cell and board kind:

| Column | Value |
|---|---|
| `config`, `cell`, `family` | The config id, `headline` or `stress`, and the board kind |
| `n`, `misses`, `skipped` | The count of the inputs, of the misses of the floor and of the skipped records |
| `score`, `fill`, `hard`, `excess`, `ms` | The sums over the inputs |
| `<baseline>.wins`, `.losses`, `.ties`, `.diff` | The paired counts and the sum of the score differences against each baseline config |

`summaryRows` reads the table, and `summaryTable` writes it. The dropped configs keep their rows, so the atlas sees each config of each night.

## The cost model

The plan uses the model of `packages/joint/data/cost-margins.json`. `docs/JOINT-BENCH.md` tells the model and its fit.

- The time of an input is `pairs × pair(boxes, edges) + passes × lane(boxes, edges)` milliseconds, times the margin of its spec.
- The lane term is `8.75 + 0.853 × boxes² / 1000 + 0.782 × boxes × edges / 1000`. It comes from the run `40757153151` of L13.
- Each unit of the sweep prints its pairs and its lane passes. `fit-cost.mjs` adds the units of one input, and fits both terms from a night. The pairs of a unit count each round of an iteration chain as 3 pairs.

## The settings of the repository

The workflow needs no change of a setting in the default state of a public repository. These settings can stop it:

- A ruleset or a branch protection on all branches blocks the push to `sweep-data`. Exclude `sweep-data`, or give `github-actions` a bypass.
- The workflow permissions of the organization can limit the `GITHUB_TOKEN` to read. Then the job `publish` cannot push.
- GitHub runs a schedule only from the default branch. It stops the schedule after 60 days without activity in the repository.

## The next steps

1. A surrogate model: a random forest from the config params to the score, fit on `summary.json`. It picks the new configs with the largest expected gain, and the coverage need breaks ties.
2. The Sobol indices and the response curves of the atlas (L44) from `summary.json`.
3. The switch of the joint space to the spaces of the engines (refer to "The switch to the engine spaces").
4. A limit on the size of `state.json`, when the alive configs grow.
