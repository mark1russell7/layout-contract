# Changelog

## 0.2.2

- `compareMeasure(candidate, baseline, spec)` gives `win`, `tie` or `loss` for one measure on one input. A change of at most `max(RECORD_EPS, minEffect)` is a tie. The test is symmetric, and a tie is not a win.
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
