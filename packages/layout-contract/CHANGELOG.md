# Changelog

## 0.2.14

- PATCH: new optional exports and fields, with no break: `MemberRule.pool`, `PairGap`, `LayoutInput.pairGaps` and `canonicalInput`. It also has a fix of `generate`.
- `MemberRule.pool` is a fixed list of member lists (L39). Each entry is a list of whole configs of the space of the members.
- With a `pool`, `spaceSize` counts each entry one time. `enumerateSpace` gives only entries of the pool, and `checkConfig` refuses another member list with the claim `pool`.
- `checkSpace` checks each entry of a pool. The shape filter of 0.2.13 also applies to the members of each entry. A rule without `pool` does not change.
- With a pool of 1 list on `cell-portfolio`, the meta count of `packing` at 3 levels goes from approximately 1.49e25 to approximately 1.72e15.
- `LayoutInput.pairGaps` gives a minimum distance to a pair of boxes (L49). For its pair, it replaces the two margins and the `gap`. `PackInput` and `toPackInput` carry it.
- `checkInput` refuses an unknown box, a pair of one box, a repeated pair in either order, a bad `gap` and bad `lanes`.
- `canonicalInput` sorts the pairs. `documentHash` uses it for each `layout-input/1` document, so the order of the pairs does not change the hash.
- The fix: `generate`, `resolve`, `cellOf` and `rngOf` of a registry accept a cell of `cellOf`. They ignore a `kind` that is the `familyKind` of the family, and refuse another `kind`.
- Each input, record, hash and `configId` of 0.2.13 stays the same.

## 0.2.13

- The shape kind of an item is a dimension of the contract (L46). `docs/SHAPES.md` tells the rules.
- `SHAPE_KINDS` declares 4 kinds: `rect`, `polygon`, `circle` and `free`. Only `rect` has all of its geometry. The other kinds have their bounding box.
- `LayoutBox.shapeKind`, the cell dimension `itemShape` and the record field `shapes` are new and optional. A box without them is a `rect`.
- `MeasureSpec.shapes` and `PACK_HARD_RULES` give the kinds of each measure and rule. `checkShapes` refuses a run on a kind that a measure does not support.
- `StageOption.supports.shape` gives the kinds of an option. `checkConfig`, `spaceSize` and `enumerateSpace` take `shapes`. `spaceShapeKinds` gives the kinds of a space.
- Each input, record, hash and `configId` of 0.2.12 stays the same.

## 0.2.12

- The result of `verdict` has 3 new fields: `scope`, `breadth` and `summary`. The label and the rule do not change.
- `scope` is `"these families"`. The test keeps the families as fixed, so the claim is about these families only.
- `breadth` is `{ against, of, ties }`: the count of the families against the side of the verdict, of all the families and of the ties.
- `summary` gives the label, the scope and the breadth in one line, for example `better on these families, worse on 2 of 6 (1 tie)`.

## 0.2.11

- The claim `claims.declared` can have `familyBy`: the key of the family of each input. `familyOf(cell, familyBy)` gives the key of one cell.
- The flat form of `familyBy` is a list of dimensions. The map form chooses a list by the `kind` of the cell, or by the entry `"*"`.
- `checkDeclared` checks the keys: a missing dimension, a missing kind, a kind without an entry and two cells with the same key. `familyMin` sets the minimum count of each family.
- `verdict(records, options)` compares two strategies on one measure, with the family as the unit. `docs/VERDICT.md` tells the rule.
- The verdict gives the mean of the family means and the mean of the inputs, each with a seeded bootstrap interval. It also gives a stratified paired permutation test.
- A verdict counts only when it holds under both weightings. Opposite signs give `depends on the mix`. `tie` and `level` have no default.
- `docs/PROMOTION.md` has the new shared block `verdict-family`.

## 0.2.10

- The contract has the strategy space `strategy-space/1`: the stages of an engine, their options and the ranges of their params, as data. `docs/STRATEGY-SPACE.md` tells the rules.
- A param can have a `when`. Then it is active only when an earlier param has one of the given values.
- A meta option has `members`: whole configs of the same space, with a depth of 1. Portfolios and selectors use it.
- `checkSpace` and `checkConfig` give a `ClaimBreak` for each problem. `canonicalConfig` gives the canonical form, and `configId` gives its hash.
- `spaceSize` counts the grid points, with the meta configs apart. `paramLevels` gives the grid values of one param.
- `enumerateSpace` gives the grid, or a seeded Latin hypercube sample. `productSpace`, `joinConfigs` and `splitConfig` join a packer and a router.

## 0.2.9

- The contract has the corpus checks of `packing`, `highways` and the joint corpus. `docs/CORPUS-CHECKS.md` tells the rules.
- `ClaimBreak` is one broken claim of a corpus. It has the name of the claim, a text and the ids of the inputs.
- `checkDeclared(inputs, declares, claim, ids)` checks the claim `claims.declared`. The hook `declares` gives the properties of one input.
- `declaredCounts` counts the inputs of each property. `declaredClaimOf` reads `claims.declared` of a manifest. `DeclaredClaim` and `Declares` are their types.
- `corpusHashOf(corpus, inputs)` gives the hash of a corpus. The value is equal to the corpus hash of `packing`.
- `checkSplit(split, corpus, name)` checks a split file `corpus-split/1`. `splitFolds` gives the folds of one split, and throws for a problem.
- `leaveOneSeedOut(seeds)` gives one fold for each seed. `splitFileName`, `SPLIT_SCHEMA`, `CorpusSplit`, `SplitFold`, `SplitCorpus` and `CorpusEntry` are the other parts.

## 0.2.8

- `portfolio` has the option `hashes`. The default `all` keeps the behavior of 0.2.7.
- With `hashes: "pick"`, the members get no output hash before the pick. Only member 0 and the winner get a hash, when the winner is not member 0.
- The output hash is most of the key cost of a member. `selectBest` does not use it, so the winner and `picked` do not change.
- Under `pick`, a hash that throws makes `pick` throw a `RangeError`. Only the hashed traces have an `outputHash`.
- A value of `hashes` that is not `all` or `pick` causes a `RangeError`. `docs/PORTFOLIO.md` tells the rules.

## 0.2.7

- `compareMeasure` compares whole grid steps of `RECORD_EPS`. Before, a change of exactly `minEffect` on 3-decimal records was sometimes not a tie, because of float noise. An example is 0.723 against 0.718 with a `minEffect` of 0.005.
- A live value and its rounded record give the same verdict. A test checks this on random values.
- A change below one grid step is a tie. Infinite values and values outside the safe grid keep the old compare.
- `RECORD_SCALE` (1000) is the count of grid steps in one unit, and `RECORD_EPS` is `1 / RECORD_SCALE`. The value of `RECORD_EPS` does not change.
- Round with `Math.round(v * RECORD_SCALE)`, as the records do. A division by `RECORD_EPS` rounds some half steps to the other side.

## 0.2.6

- `portfolio(id, members, key, options)` starts a list of members on an input and gives the output of the best member. The result is also a member.
- `selectBest(candidates, levels)` is the pick rule. It keeps each candidate that is not worse than the best value of a level, so the minEffect ties do not drift.
- The level 0 of a portfolio is the count of hard breaks. A member that throws, or gives a value that is not finite, gets the status `error`.
- The options `maxMembers` and `budgetMs` cut the members. A cut by the time limit makes the trace not deterministic.
- `pickMoves(trace)` gives the move `pick` (the trace measure `move.pick` of a record), so `exercised` reads the effect of a pick. `docs/PORTFOLIO.md` tells the rules.

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
