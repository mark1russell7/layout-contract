# Changelog

## 0.2.6

- `portfolio(id, members, key, options)` starts a list of members on an input and gives the output of the best member. The result is also a member.
- `selectBest(candidates, levels)` is the pick rule. It keeps each candidate that is not worse than the best value of a level, so the minEffect ties do not drift.
- The level 0 of a portfolio is the count of hard breaks. A member that throws, or gives a value that is not finite, gets the status `error`.
- The options `maxMembers` and `budgetMs` cut the members. A cut by the time limit makes the trace not deterministic.
- `pickMoves(trace)` gives the trace measure `move.pick`, so `exercised` reads the effect of a pick. `docs/PORTFOLIO.md` tells the rules.

## 0.2.5

- `outputHash(value, options)` gives the first 16 hex characters of the SHA-256 of the canonical JSON of an output. Each number goes to the grid of `RECORD_EPS` first.
- The option `grid` (`HashOptions`) sets the step of the grid. The value `0` keeps the exact numbers. A number that is not finite causes a `RangeError`.
- `documentHash` gives the input hash of `docs/FORMAT.md` of `packing`. `sha256Hex` and `canonicalJson` are its parts, with no runtime dependencies.
- `outputGroups` puts the candidates with equal output hashes on each decision input in one `OutputGroup`. `exercised` tells if a candidate has an effect.
- `docs/PROMOTION.md` tells the two promotion guards. They are the same in `packing` and `highways`.

## 0.2.4

- `rectInRegion(region, rect)` tells if all of a rectangle is inside a region and not over a hole. A polygon can be concave.
- `countOutside` and `packHard` have the optional last parameter `options` (`ContainerTest`). With `{ exactContainer: true }`, `in-container` tests the shape of the container, not only its bounding box.
- The exact test applies only to a shaped container with the size `fixed`. The default is `false`, so the counts do not change. The default changes to `true` at the next breaking version.

## 0.2.3

- `edgeStep(input, params, seed)` adds edges, groups and ports to an input without positions, from its topology alone. `docs/JOINT-CORPUS.md` tells the rules and the pinned hashes.
- `EdgeShape`, `EdgeStepParams`, `EDGE_DENSITY` and `EDGE_STEP_VERSION` describe the step.
- `LayoutInput` has the optional field `steps`: the stamps of the steps after the generator.
- `mulberry32`, `fnv1a32`, `stepRandom` and `randomInt` give the seeded random numbers of the generators.

## 0.2.2

- `compareMeasure(candidate, baseline, spec)` gives `better`, `worse` or `tie` for one measure on one input. A change of at most `max(RECORD_EPS, minEffect)` is a tie. The test is symmetric, and a tie is not better.
- `MeasureSpec` has the field `minEffect`: an absolute change, or `{ rel }`, a share of the larger of the two values. Each joint guard in `JOINT_MEASURES` has a value. `minEffectOf` gives the threshold.

## 0.2.1

The first version on npm. The versions 0.2.0 and 0.1.0 are only in git. npm does not have them.

- A record can have `outputHash`, the hash of the output of the stage. A reader compares two runs with one field.
- A record can have `msRuns`, the time of each timed repeat. `ms` is their median.
- A record can have `env` (`RunEnv`), the facts of the computer of the run.

## 0.2.0

This version is only in git, at commit `710ec51`. npm does not have it. The version 0.1.0 is only in git, at commit `52fefbb`.

- The type-fit tests of `highways` (highways#82) and `packing` (packing#21) found gaps. This version closes the gaps of the contract.
- `Port.side` and `LayoutInput.container` are optional. A record must have `LayoutRecord.ms`.
- The input has the fields `generator`, `cell` and `step`, and `change` has the value `packed`. A box has the field `data`. A record has the field `skipped`.
- `turnPort` turns a port with only `x` or only `y`.
- `packHard(input, output, tolerance)` applies the output itself. `no-overlap` counts a box over an obstacle (`countObstacleHits`, `regionHitsRect`).
- A locked box breaks `locked-kept` only for a move of more than `RECORD_EPS`, or without a placement. That is one break, not one for `complete` too.
- `checkInput` gives the problems of an input file, for example a locked box without a position.
- New: `toLayoutRecord`, `StrategyInfo`, `MeasureSpec` and the specs of the joint measures (`JOINT_MEASURES`, `JOINT_MOVED_MIN`).

## 0.1.0

The first version of the contract, in git only. The types of `layout-input/1` and `layout-record/1`, the turn, the tolerances and the hard rules of a pack.
