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
2. `benchRouteSpace()`: the engine `highways` with the stage `router`. Its options are the 15 routers of the runner (`ROUTERS`).
3. `laneSpace()`: the engine `lanes` with the optional stage `mode`. Its options are `max`, `sides` and `iter`.

The options `max` and `sides` are the lane pairs of L13. They have the params of `LANE_PARAMS`:

| Param | Values | Default | Use |
|---|---|---|---|
| `passes` | 1 to 3 | 1 | The count of the lane passes |
| `clearance` | 2 to 10 | 5 | The clearance of the lane need `clearance + space * (k - 1)` |
| `space` | 2 to 8 | 4 | The space of each more route in a lane |
| `cap` | 1 to 16 | 8 | The largest count of routes in one lane |

The option `iter` is the iteration of L11: place, route and place again. Its one param `rounds` is the round cap, from 1 to 3, with the default 3 (`ITER_PARAMS`). It uses the default lane options.

`jointSpace(pack, route, options)` joins the parts with `productSpace`, and adds the stage `lanes.mode`. The version of the space is `bench-3`.

- Version `bench-1` did not have the option `iter`.
- Version `bench-2` had 10 routers, 130 pairs and 166 named configs.
- Version `bench-3` adds the 5 highway strategies of wave 3 of `highways` 0.9.1 as routers (`HIGHWAY_ROUTERS`): `steiner`, `gaps`, `streets`, `search` and `interchanges`. Each strategy makes a plan of highways, and `follow` routes it.

The counts of version `bench-3`:

- The space has 231 named configs: the 195 pairs, the 18 lane pairs of L13 and the 18 iteration pairs of L11. A named config runs with the pair id of the bench.
- `spaceSize(JOINT_SPACE, { levels: 3 })` gives the base 32370 and the meta 0: 195 × (1 + 2 × 3⁴ + 3).
- `spaceSize(JOINT_SPACE, { levels: 1 })` gives 780, and the levels 2 give 6825.
- The full integer grid has approximately 1180000 configs: 195 × (1 + 2 × 3024 + 3).
- The lane pairs and the iteration pairs do not change. They use only the routers `corners` and `portfolio`.

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
2. The screened configs of earlier nights that do not have the full screen. The config with the oldest record goes first, while the budget lasts.
3. New configs on the screen, while the budget lasts.

The screen is seed 1 of each of the 101 specs. The budget of a round is `max-shards × target-minutes × 0.9` minutes. Round 1 subtracts the cost of the steps 1 and 2.

Round 2 has these jobs, in this order:

1. The configs that are alive after the race, on the inputs that they do not have. The config with the oldest record goes first, and then the config with the best mean.
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
- The 2 rounds took approximately 180 minutes of wall time with 6 shards at the same time. Since 2026-10-30, `max-parallel` runs 3 shards at the same time. The account runs at most 20 jobs at once for all repos, and the fleet rule gives a heavy workflow 3 of them.
- Prediction (p 0.6): a night with 3 shards at once takes 300 to 420 minutes of wall time. The night starts at 03:37 UTC.
- Result: the nights of 2026-10-31 and 2026-11-01 took 671 and 698 minutes, so the prediction is a miss. The real time of a shard was 50 to 55 minutes against a target of 30. One or two shards stopped at the limit of 120 minutes each night.
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

### The budget of a night (L81)

Since L81, a night uses its measured cost, a budget of wall time, a rotation and a clean stop.

1. The scale is the median of real minutes over planned minutes of the shards of the last 5 nights. The plan divides the target by the scale, so a shard has `target-minutes` real minutes. A new epoch takes the scale of the epoch with the latest night. The scale of the shards of 2026-11-01 is 1.64.
2. The window of a scheduled night ends at 14:00 UTC. The budget is the time to the end of the window, minus the expected minutes of the gate. The gate counts only when main changed since the last nightly gate. Its expected minutes are the median of the last 3 nightly gates.
3. Round 1 gets half of the budget. Round 2 gets the time that is left at the race. A round has at most `lanes × floor(budget / (target + overhead))` shards, with 3 lanes and 6 minutes of setup for each job.
4. A config with no record goes first, and then the config with the oldest record (`ran` of its entry). Thus each config gets a run in some nights. The field `ran` gives the age of each result for the atlas.
5. A shard stops before a unit that does not end 105 minutes after the start of the shard, 15 minutes under the limit of the job. It keeps the records of the units that it ran. The first unit always runs. The shard file gives `stopped`, the count of the units that ran, and their planned minutes.
6. The job `publish` runs when a shard was cancelled. Before L81, the implicit `success()` skipped it, so the nights from 2026-10-30 to 2026-11-01 did not reach the branch. The tree of 2026-11-01 came back from the artifact of its run.

The summary scores the cost model by Brier. Each shard is one claim, at p 0.6: its real minutes are within 25% of its planned minutes times the scale. A stopped shard is a miss.

The prediction for the first night with the budget:

| Id | Claim | Confidence |
|---|---|---|
| B1 | No shard of the night stops at the limit of its job. | 0.75 |
| B2 | The job `publish` pushes the night to the branch `sweep-data`. | 0.85 |
| B3 | The night ends before 14:00 UTC, with the gate after it. | 0.55 |
| B4 | At least half of the shards are within 25% of their planned minutes times the scale. | 0.5 |
| B5 | No shard stops at the deadline of 105 minutes. | 0.7 |

- B1 and B5: the scale makes a shard approximately 30 real minutes. The real time of the shards of 2026-11-01 was 0.36 to 3.66 times the plan, so a shard can still take 110 minutes.
- B3 is risky: the budget uses the median gate of 375 minutes, and the gate time also changes with the queue of the runners.
- B4 is risky: the spread of the ratio is large. One scale for all shards does not see which spec is slow.

The result of the night of 2026-11-02 (run [41384329446](https://github.com/mark1russell7/layout-contract/actions/runs/41384329446)), Brier 0.286:

| Id | Result | Hit |
|---|---|---|
| B1 | All 32 shard jobs end. The longest job takes 112.2 of its 120 minutes. | yes |
| B2 | The job `summarize` fails, so `publish` does not run. | no |
| B3 | The sweep ends at 10:59 UTC. Its gate waits behind a limit run of `memory-probe.yml`, so it ends after 14:00 UTC. | no |
| B4 | 6 of 32 shards are within 25% of their planned minutes times the scale. The Brier score of the cost model is 0.323. | no |
| B5 | No shard stops at the deadline. | yes |

- B2: the cause is a fault in the code, not the budget. In `scripts/sweep.mjs`, the constant `COST_CLAIM` came after the code of the commands. Thus `summarize` read it before its initialization. #130 moves it and adds a test of the order. The workflow `sweep-summarize.yml` puts the night on the branch again.
- B3: the gate and the limit run had one concurrency group. The key of the group has the event at this time.
- B4: one scale for all shards does not see which spec is slow. The next cost model gets a scale for each family of specs, from the 32 shards of this night. The next night scores it.
- B4, after the analysis: a scale for each spec did not help. The cost factor of each config helps, so the sweep uses it. "The cost factors of the configs" tells the data.

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

Each outcome has the gain under both weightings (L37). `mean` is the mean of the family means, and `pooled` is the mean of the inputs. The label "better" or "worse" needs both means on one side of 0 (`agree`). Means with opposite signs give the label "depends on the mix": then the mix of the families in the corpus decides the sign. `signs` has the counts of the families where the config wins, loses or ties, with the p of the two-sided sign test. The state keeps these fields for each raced config, and `night.md` shows them for the alive configs.

The dropped and halved configs lose their values in the state. Their rows stay in the summary. Round 2 gives the alive configs the other seeds, so the next race has more pairs for them.

## The records

- The raw records of each shard are the artifacts `sweep-records-<round>-<shard>`. Each record has the config id as its strategy and the pair id in `options.pair`.
- The artifact `sweep-data` holds the new data tree of the night.
- The job `publish` pushes the data tree to the branch `sweep-data`. Only this job has `contents: write`.
- The job `publish` runs only for a run from `main` without `dry-run`. It does not push to `main`.
- The workflow `sweep-summarize.yml` summarizes the night of an earlier run again, and pushes it to the branch `sweep-data`. Use it when the job `summarize` failed after the rounds ended.
- `sweep-summarize.yml` refuses a night that is not the next night of the branch. Thus it does not write over the data of a later night.
- Each job that pushes to `sweep-data` starts `scripts/next-night.ts` before the push. The job stops when the branch got another night after the run read it.
- The concurrency group of `sweep.yml` has the event in its key. Thus a dispatched sweep does not cancel a pending scheduled night. `sweep-summarize.yml` has a group of its own.
- The test `src/sweep-commands.test.ts` starts each command of `sweep.mjs` with the flags of `sweep.yml`, each in its own process (L85). Thus a crash in a command fails the pull request, not the night.
- The test runs two nights on the 3 inputs of each round that have the most configs. The second night starts from the tree of the first. Then the test starts `next-night.ts` and `sensitivity.mjs`.
- The test also starts the commands of `bench.mjs` that the nightly memory gate uses: `families`, `jobs`, `plan`, `probe` and `gate`. It takes approximately 20 seconds.

### The branch `sweep-data`

```text
index.json                         the epochs, with the latest epoch, its nights and its status counts
epochs/<epoch>/state.json          the configs, their status and the values of each input
epochs/<epoch>/summary.json        the cumulative summary as a table
epochs/<epoch>/nights/<date>.json  the facts of each night: the rounds, the race, the shards and the drift
epochs/<epoch>/surrogate-trend.jsonl  the trend of the coverage surrogate: one record of each night
```

The epoch is `<corpus>_packing-<version>_highways-<version>_space-<version>`, for example `joint-v2_packing-0.2.17_highways-0.9.1_space-bench-3`. A new version of an engine or of the space starts a new epoch. The data of the old epochs stays.

- The epoch `joint-v2_packing-0.2.17_highways-0.8.1_space-bench-2` ends with `highways` 0.9.1 and the space `bench-3`. Its data stays on the branch `sweep-data`.
- The first night of `bench-3` starts a new state with the baseline arm. The random sample of a night can then pick the 5 new routers.

`summary.json` has one row for each config, cell and board kind:

| Column | Value |
|---|---|
| `config`, `cell`, `family` | The config id, `headline` or `stress`, and the board kind |
| `n`, `misses`, `skipped` | The count of the inputs, of the misses of the floor and of the skipped records |
| `score`, `fill`, `hard`, `excess`, `ms` | The sums over the inputs |
| `<baseline>.wins`, `.losses`, `.ties`, `.diff` | The paired counts and the sum of the score differences against each baseline config |

`summaryRows` reads the table, and `summaryTable` writes it. The dropped configs keep their rows, so the atlas sees each config of each night.

## The sensitivity

`firstOrder(state, groups)` gives the first-order index of each group of the space on the sweep score. `pnpm --filter @layout-contract/joint sensitivity --state <state.json>` writes the table.

- The groups of `JOINT_GROUPS` are the router, the lane mode (`none` without lanes) and the pack entry.
- The response of a config is its mean score over the inputs where each config has a value. The race drops a config before it has each input, so only the shared inputs count. Thus the race gives no bias.
- The index is the bias-corrected correlation ratio (`eps2`). A group with many levels gets a part of the noise in `eta2`, and `eps2` removes that part.
- A bootstrap over the shared inputs gives the intervals, and the interval of the difference of each pair of groups.
- The configs are a sample of the space, not a full design. A group that the sample confounds with another group shares its index. The total indices need the design of Saltelli.

The first night (L52) gives these values. The sample has 124 configs on 101 shared inputs, with 2000 draws.

| Group | Levels | `eps2` | 95% interval |
|---|---|---|---|
| router | 10 | 0.865 | 0.769 to 0.908 |
| lane mode | 4 | 0.020 | -0.007 to 0.068 |
| pack entry | 13 | -0.013 | -0.039 to 0.028 |

- The router sets most of the variance of the score.
- The intervals of the lane mode and of the pack entry overlap, so the first order does not tell which matters more. Claim V1 failed.
- In the configs of one router, the lane mode matters. With `portfolio` (14 configs), its `eps2` is 0.649 (0.279 to 0.819). With `corners` (22 configs), it is 0.203.
- Thus the effect of the lanes comes from the router and the lanes together. The next step is a Saltelli design, which gives the total indices.

### The total indices

The first-order table cannot show the share of an interaction. A design night gives the total indices.

- Start the workflow with the input `design` set to a count of rows `n`. Round 1 then runs a Saltelli design (`planDesign`) instead of a new sample.
- `saltelliDesign` takes `2n` configs of the space. The matrix `A` is the first half, and `B` is the second half. `AB_i` is the row of `A` with the choice of stage `i` from `B`.
- `totalOrder` gives the first index of Saltelli (2010) and the total index of Jansen (1999) for each stage. A bootstrap over the rows gives the intervals.
- A total index above the first index shows an interaction of that stage. Night 1 showed such an interaction of the lanes with the router.
- The state keeps each design in `designs`. The race keeps the values of the configs of a design, so the rows stay full.
- `node scripts/sensitivity.mjs --state <state.json> --total [<date>]` gives the table of the design of that date, or of the last design.

## Space coverage

The space coverage is the share of the cells of the joint space with a measured response and a stated error. `fitSurrogate(state)` gives it, and `surrogateMarkdown` writes the report.

- A row is one config on one input with a score. A cell is one router, one pack entry, one lane mode and one board kind.
- The count of the cells comes from `JOINT_SPACE` and the board kinds of the inputs. It includes the cells with no rows.
- The surrogate is a ridge regression. Its features are a one-hot of each group and of the board kind, and the product of each pair of these.
- Each numeric param gives one more feature: its z value.
- The penalty is on each feature but the intercept. The fit chooses λ from 0.01, 0.1, 1, 10, 100, 1000 and 10000 by the held-out error. The field `lambdaAtEdge` tells when the choice is the smallest or the largest value.
- The held-out error uses 5 folds by config. A seeded hash of the config id gives its fold, so all rows of a config are in one fold.
- With `foldBy: "input"`, the folds are by input. Then the error is on inputs that the fit did not see. The trend uses these folds.
- The field `cells.inSampleSkill` gives the skill of the same cells from the fit on all rows. The gap to `cells.skill` is the overfit.
- The floor of a cell is the RMSE of its rows around their own mean, and at least 0.01. No model on the features of the cell has a smaller error.
- A cell is covered when it has 20 rows or more, and the RMSE of its out-of-fold predictions is at most 1.25 times its floor. These values are options.
- A cell with a constant score has the floor 0. Thus the floor has the smallest value 0.01.
- The Sobol indices of the surrogate come from a Saltelli design of 4096 rows over the space. A seeded draw gives the board kind of each row.
- Each group index includes the params of its stage. The factor `kind` is the board kind.

The first numbers come from `epochs/joint-v2_packing-0.4.1_highways-0.10.0_space-bench-3/state.json` of the branch `sweep-data`, after the night 2026-11-02. The run date is 2026-11-02, with seed 1.

| Measure | Value |
|---|---|
| Rows | 10706, of 56 configs on 303 inputs |
| Features | 677, with the intercept |
| λ | 10 |
| Held-out R² | 0.243 |
| Held-out RMSE | 0.280 |
| Cells with rows | 336 of 6480 |
| Cells with 20 rows or more | 156 |
| Covered cells | 150 of the 336 cells with rows (44.6%) |
| Median ratio of RMSE to floor | 1.010, over the 156 cells with 20 rows or more |
| Skill inside the cells | median -0.020, q10 -0.176, q90 -0.000, over the same 156 cells |

The cells are 15 routers × 18 pack entries × 4 lane modes × 6 board kinds. The quantiles 0.1, 0.5 and 0.9 of the ratio are 1.000, 1.010 and 1.083. 150 of the 156 cells with 20 rows or more are covered. Thus the count of rows limits the share, not the fit.

| Factor | First | Total |
|---|---|---|
| router | 0.128 | 0.218 |
| lane mode | 0.047 | 0.085 |
| pack entry | 0.017 | 0.050 |
| board kind | 0.641 | 0.785 |

- The board kind sets most of the variance of the surrogate. Of the groups, the router sets the most.
- The fit chose the largest λ of the list. A larger λ can give a smaller error.
- The fit error is near its floor. The RMSE of each cell around its own mean is 0.272, so most of the error is in the cells.
- An absolute bound of 0.05 is below the floor of 319 of the 336 cells with rows. Thus the bound is relative to the floor.
- A ratio near 1 means that the fit gives the mean of the cell, and no more. Input features let the fit tell the rows of a cell apart. The next section has their numbers.
- 41% of the rows have the score 0.

The main line of the weekly trend is the skill inside the cells: `1 - (RMSE / floor)²`. It covers the cells with 20 rows or more, as the median, q10 and q90. A fit that gives only the mean of each cell has the skill 0, so input features make it rise. The guard lines are the covered share of the cells with rows, and the count of the cells with rows.

### Input features

Each cell has one row for each input of its kind. Thus all the spread inside a cell is the spread between its inputs. The option `features` gives the fit the dimensions of each input.

- `manifestFeatures(manifest)` gives the cell of each input of `corpus.json`: its container, its obstacles, its sizes, its count, its edges and its spacing.
- The fit adds a block for each dimension with 2 values or more. The bench-3 state has 11 such dimensions.
- With `featurePairs: true`, the fit also has the product of each group block with each feature block. The default is `false`.
- The cells of the coverage stay the groups and the board kind. Thus the floors and the trend do not change.
- With features, the last Sobol factor is `input`. A seeded draw gives one measured input, with its kind and its features.

Before the run, the mean score of each input over all configs explained a median of 0.539 of the variance inside a cell. That value is in-sample, with one value for each input, so it is a ceiling. The prediction `layout-stack-L52-input-features` came before the run.

| Variant | Features | Held-out R² | Skill: median, q10, q90 | Covered cells | Time |
|---|---|---|---|---|---|
| No features | 677 | 0.243 | -0.020, -0.176, -0.000 | 150 (44.6%) | 1.8 s |
| Feature blocks | 727 | 0.485 | 0.189, -0.504, 0.480 | 143 (42.6%) | 2.4 s |
| Feature blocks and pairs | 2577 | 0.531 | 0.274, -0.449, 0.525 | 144 (42.9%) | 369 s |

| Factor | First, feature blocks | Total, feature blocks | First, with pairs | Total, with pairs |
|---|---|---|---|---|
| router | 0.048 | 0.082 | 0.066 | 0.185 |
| lane mode | 0.030 | 0.039 | 0.024 | 0.089 |
| pack entry | 0.022 | 0.026 | 0.022 | 0.082 |
| input | 0.875 | 0.885 | 0.647 | 0.872 |

- The feature blocks raise the median skill from -0.020 to 0.189. The pairs raise it to 0.274.
- The q10 of the skill drops to approximately -0.5. In these cells, the fit is worse than the mean of the cell. The features move the predictions, and a part of these moves is wrong for the cell.
- The share of covered cells drops by approximately 2 points. It is a guard line. The next section names the 7 cells that left it.
- With pairs, the fit has 3.5 times the features, and it takes 150 times as long. Its peak memory is approximately 550 MB, against 236 MB for the feature blocks.
- In this first run, each variant chose λ = 10, the largest value of the old list. The next section has the run on the wider list.

### Folds by input and the wider λ list

The strategist set 3 conditions before the trend starts. The prediction `layout-stack-L52-input-folds` came before this run.

1. The chosen λ is inside the list.
2. The skill of the trend is out of sample, with folds by input. The record gives the in-sample skill beside it.
3. The record names the cells that left the coverage.

| Variant | Folds | λ | Held-out R² | Held-out skill: median, q10, q90 | In-sample skill: median, q10, q90 | Covered cells |
|---|---|---|---|---|---|---|
| No features | config | 10 | 0.243 | -0.020, -0.176, -0.000 | -0.001, -0.019, 0.000 | 150 (44.6%) |
| Feature blocks | config | 10 | 0.485 | 0.189, -0.504, 0.480 | 0.213, -0.344, 0.509 | 143 (42.6%) |
| No features | input | 100 | 0.238 | -0.038, -0.132, -0.012 | -0.004, -0.065, 0.000 | 154 (45.8%) |
| Feature blocks | input | 10 | 0.462 | 0.141, -0.502, 0.432 | 0.213, -0.344, 0.509 | 141 (42.0%) |

- The chosen λ is inside the list for each variant. The held-out R² drops for each λ above 100.
- With folds by input, the median skill of the feature blocks is 0.141. The in-sample median is 0.213, so the overfit is approximately 0.07. The gain is real, and it is smaller than in the first run.
- The ceiling of 0.539 is the in-sample fit of one mean for each input. The feature blocks reach 0.213 in sample. Thus the blocks explain less than half of the spread between the inputs.
- The fit with pairs takes approximately 6 minutes and 550 MB. It runs in CI only, with folds by input.

7 cells left the coverage from no features to the feature blocks, with folds by config. No cell joined it.

| Cell: router · lane mode · pack entry · kind | Rows | Floor | Ratio before | Ratio after |
|---|---|---|---|---|
| search · iter · shelf-first-input · cards | 30 | 0.314 | 1.058 | 1.261 |
| corners · none · pack · word-cloud | 24 | 0.230 | 1.033 | 1.252 |
| corners · sides · shelf-first · word-cloud | 24 | 0.211 | 1.033 | 1.307 |
| search · sides · shelf · word-cloud | 24 | 0.161 | 1.071 | 1.330 |
| search · sides · select · word-cloud | 24 | 0.148 | 1.004 | 1.313 |
| corners · iter · rows · word-cloud | 24 | 0.144 | 1.016 | 1.312 |
| corners · sides · maxrects-cp · word-cloud | 24 | 0.079 | 1.097 | 1.420 |

- The floor of a cell comes from its rows only. The features do not change it, so the fit causes each loss.
- 6 of the 7 cells are word-cloud cells. Each was near the bound before, with a ratio from 1.004 to 1.097.
- The feature blocks are additive. A feature has one effect for all kinds, so the effect on the word-cloud inputs can be wrong. A product of the kind block with each feature block is a candidate fix.

### The products of the kind with the features

With `featureKindPairs: true`, the fit also has the product of the kind block with each feature block. Then a feature has its own effect on each board kind. The option is measured, and the trend does not use it.

| Variant, folds by input | Held-out skill: median, q10, q90 | In-sample median | Covered cells |
|---|---|---|---|
| No features | -0.038, -0.132, -0.012 | -0.004 | 154 |
| Feature blocks | 0.141, -0.502, 0.432 | 0.213 | 141 |
| Feature blocks and kind pairs | 0.250, -0.412, 0.596 | 0.375 | 142 |

| Board kind | Covered cells, feature blocks | Covered cells, kind pairs |
|---|---|---|
| word-cloud | 15 of 25 | 22 of 25 |
| dashboard | 23 of 25 | 19 of 25 |
| cards | 25 of 25 | 23 of 25 |

- The kind pairs raise the held-out median skill from 0.141 to 0.250. The overfit grows from approximately 0.07 to approximately 0.13.
- The word-cloud cells come back, but the dashboard and cards cells drop. Thus the count of covered cells stays at 142, against 154 without features.
- The accept rule has 2 conditions: the held-out skill rises, and the coverage comes back. The kind pairs meet only the first, so the trend does not use them.

### A larger penalty on the products

The option `productPenalties` gives the candidates of a factor of the penalty on the product columns of the input features. Each product column has the penalty `productPenalty * λ`, and each other column keeps λ. The folds choose λ and `productPenalty` together. The default `[1]` gives the fit of before.

The fit does not use a new solver. The values of each product column are multiplied by `1 / sqrt(productPenalty)`. This scale gives the same fit as the larger penalty on the coefficients of the column. The prediction `layout-stack-L52-product-penalty` came before this run.

| Variant, folds by input | Held-out skill: median, q10, q90 | In-sample median | Covered cells |
|---|---|---|---|
| No features | -0.038, -0.132, -0.012 | -0.004 | 154 |
| Feature blocks | 0.141, -0.502, 0.432 | 0.213 | 141 |
| Feature blocks and kind pairs | 0.250, -0.412, 0.596 | 0.375 | 142 |
| Kind pairs, `productPenalties` 1, 10, 100, 1000 | 0.250, -0.412, 0.596 | 0.375 | 142 |

| Board kind | No features | Feature blocks | Kind pairs | Kind pairs, chosen product penalty |
|---|---|---|---|---|
| word-cloud | 23 of 25 | 15 of 25 | 22 of 25 | 22 of 25 |
| dashboard | 25 of 25 | 23 of 25 | 19 of 25 | 19 of 25 |
| cards | 25 of 25 | 25 of 25 | 23 of 25 | 23 of 25 |
| rect-grid | 56 of 56 | 53 of 56 | 53 of 56 | 53 of 56 |
| gallery | 25 of 25 | 25 of 25 | 25 of 25 | 25 of 25 |

- The folds choose `productPenalty` 1 and λ 10. Thus the fit is the fit of the kind pairs. `lambdaAtEdge` is `false`, and `productPenaltyAtEdge` is `true`.
- 1 is the smallest candidate. A fit with the factor 0.1 gives a larger held-out RMSE (0.21731 against 0.21697), so 1 is the best value near the edge.
- The best λ of each factor: 10 for 1 and 10, 0.1 for 100, and 0.01 for 1000. Thus the penalty on the products stays near 10, and the penalty on the other columns becomes smaller.
- Each fixed factor gives 142 to 144 covered cells. The factor 10 gives 144, with a held-out median skill of 0.286, and dashboard 20 of 25.
- No factor brings the dashboard and cards cells back. The feature blocks without products also lose 13 cells. Thus a larger penalty on the products alone does not give the coverage back.
- The grid of 4 factors takes approximately 27 s and 222 MB locally.

The accept rule: the held-out median skill is above 0.141, and the count of covered cells is 154 or more. The candidate meets only the first condition, with 142 covered cells. Thus the candidate is not adopted. The option stays, with the default `[1]`, and the trend does not use it.

### The trend

The trend has one record `surrogate-trend/1` for each fit. `surrogateTrendRecord(result, meta)` gives the record, and `scripts/surrogate.ts` writes it.

```text
node scripts/surrogate.ts <state.json> <corpus.json> <blocks|pairs> <out dir>
```

The script writes `surrogate.json`, the record on one line, and `surrogate.md`, the report of `surrogateMarkdown`. `surrogateTrendOptions(variant, manifest)` gives the options of the fit.

| Field | Value |
|---|---|
| `schema`, `epoch`, `night`, `run` | The schema, the epoch of the state, the date of its last night and the id of the CI run |
| `variant`, `foldBy` | `blocks` or `pairs`, and `input` |
| `rows`, `configs` | The count of the rows and of their configs |
| `skill` | The main line: the held-out skill inside the cells, as q10, median and q90 |
| `inSampleSkill` | The in-sample skill of the same cells. The gap to `skill` is the overfit. |
| `covered`, `share`, `withRows`, `eligible` | The guard lines: the covered cells, their share of the cells with rows, the cells with rows and the cells with 20 rows or more |
| `lambda`, `lambdaAtEdge` | The chosen penalty, and `true` when it is the smallest or the largest value of the list |

A skill is `null` when no cell has 20 rows or more.

- The variant `blocks` has the feature blocks of the manifest and folds by input, with no pairs. It gives the main line.
- The job summarize of `sweep.yml` fits the variant `blocks` after the night writes its state. The fit takes approximately 5 s and 300 MB.
- The job appends the record to `epochs/<epoch>/surrogate-trend.jsonl` of the new tree. The job publish pushes the file to the branch `sweep-data` with the night.
- A failure of the fit does not stop the night. The night summary gets the error, and the trend gets no record of that night.
- `sweep-summarize.yml` has the same step. Thus a night that it summarizes again also gets its record.
- The variant `pairs` also has the products of the groups with the input features. Its fit takes approximately 6 to 10 minutes and 550 MB.
- The workflow `surrogate-pairs.yml` fits the variant `pairs` each Sunday at 15:20 UTC, and on a manual dispatch. It reads the latest epoch of `sweep-data`.
- That workflow uploads `surrogate.json` and `surrogate.md` as the artifact `surrogate-pairs`, and writes the report to the job summary. It writes nothing to the repository.

The record of the variant `blocks` on the state after the night 2026-11-02 has the held-out skill 0.141 (q10 -0.502, q90 0.432) and 141 covered cells. These are the values of the section "Folds by input and the wider λ list".

## The cost model

The plan uses the model of `packages/joint/data/cost-margins.json`. `docs/JOINT-BENCH.md` tells the model and its fit.

- The time of an input is `pairs × pair(boxes, edges) + passes × lane(boxes, edges)` milliseconds, times the margin of its spec.
- The lane term is `8.75 + 0.853 × boxes² / 1000 + 0.782 × boxes × edges / 1000`. It comes from the run `40757153151` of L13.
- Each unit of the sweep prints its pairs and its lane passes. `fit-cost.mjs` adds the units of one input, and fits both terms from a night. The pairs of a unit count each round of an iteration chain as 3 pairs.

### The cost factors of the configs

The model above gives each pair the same time. The records of the night of 2026-11-02 show that the pack entry and the router of a config change the time much more.

- In the records of that night, the router `search` takes approximately 8 times the median record of the same input. The pack entries with a search (`anneal`, `genetic`, `tabu`) take approximately 2 to 4 times.
- Since this change, `jobCost` multiplies the cost of a job by the factor of its pack entry and the factor of its router (`configFactor`).
- `scripts/fit-config-cost.ts` fits the factors from the records of one night, and writes `packages/joint/data/config-cost.json`. The fit uses medians, so a few slow records do not change it much.
- The fit has the form `log(ms) = input + pack + router`. Thus the factors come from the comparison of configs on the same input.
- `level` keeps the planned minutes of the jobs of the night of the fit. `scale` is the median of real over planned minutes of its 32 shards with the factors: 1.504.
- Each plan and each shard entry keeps the id of the cost model (`costModel`). `costScale` uses only the shards of the current model. Before such a shard, it uses `scale`.

The test of the models on the night of 2026-11-02 (run [41384329446](https://github.com/mark1russell7/layout-contract/actions/runs/41384329446)). Each model gets its fit and its scale from one round. The table gives the count of the shards of the other round within 25%:

| Model | Fit on round 1, shards of round 2 | Fit on round 2, shards of round 1 |
|---|---|---|
| One scale | 1 of 18 | 3 of 14 |
| A scale for each family of specs | 1 of 18 | 3 of 14 |
| A scale for each spec (3 forms of the fit) | 4 of 18 | 2 to 6 of 14 |
| A factor for each pack entry and router | 6 of 18 | 7 of 14 |

- On all 32 shards of the night, each model with its median scale, 6 shards are within 25% without the factors and 8 with them.
- In round 2, real over planned minutes of a shard is 0.36 to 3.77 without the factors. With the factors, it is 0.46 to 2.50.
- The scale of the old model does not fit the new model. Thus the old shards do not count for `costScale`.
- The spread that is left comes in part from sizes. At 1000 boxes, the factor of a router can be half or 1.5 times its value over all inputs. A factor for each class of size is a next step.
- The first night after this change scores the factors (the prediction `layout-stack-L81-cost-factors`).

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
