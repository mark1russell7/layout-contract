# The measure registry

The registry gives one entry for each measure. An entry is a `MeasureSpec` with four more facts:

- `source`: the npm name of the package that computes the measure.
- `noise`: the cause of a change of the value when the layout does not change.
- `normalize`: the rule that maps a value to a loss from 0 to 1.
- `cost`: the order of growth of one read. This fact is optional.
- `planned`: the reason that no code computes the measure yet. This fact is optional.

`MEASURE_REGISTRY` holds the entries of the joint measures. Each engine keeps the specs of its own measures. An engine adopts the registry with `measureEntry(spec, facts)` when it adds a measure. `checkRegistry` gives the faults of a list of entries.

## Units

Each source uses one word for one quantity. `unitFault(spec)` gives the fault of a unit, and `checkRegistry` gives it for each entry.

- A value from 0 to 1 has the unit `share` (`SHARE_UNIT`). A flag of 0 or 1 also has the unit `share`, because a record averages the flags.
- The unit `share` needs `min` 0 and `max` 1.
- A unit text that names a range, for example `0 to 1`, `0 or 1` or `-1 to 1`, is a fault. The range goes in `min` and `max`.
- The words `boolean`, `fraction` and `proportion` are faults. The unit is `share`.
- A value with a range and no other unit, for example a correlation from -1 to 1, has the unit `no unit` (`NO_UNIT`).
- A length of a stability measure has the unit `W`: the width of the container. A stage with no container uses the width of the bounding box of the boxes.

## Planned measures

A planned measure has a spec, but no code computes it. Its entry has the field `planned` with the reason. A planned entry has no cost. `normalizeMeasure` gives an `Error` for a planned measure, so an objective cannot use it. The measure stops being planned when its code ships.

## Noise

| Kind | Meaning |
| --- | --- |
| `exact` | The value is a function of the layout. Two reads of one layout give the same value. |
| `sampled` | The value is an estimate from a seeded sample. Another seed gives another value. |
| `timed` | The value is a time of the machine. Each read gives another value. |

`measureEntry` gives the kind `exact` when the facts have no noise.

## Normalization

`normalizeMeasure(value, entry)` gives the loss of a value. The loss 0 is the best value. The value must be in the range `min` to `max` of the spec. A value outside the range gives a `RangeError`. The `min` of a spec can be `-Infinity`.

| Rule | Loss for `lower` | Loss for `higher` | Use |
| --- | --- | --- | --- |
| `range` | `(v - min) / (max - min)` | `1 - (v - min) / (max - min)` | a measure with a finite `min` and `max` |
| `scale` | `d / (d + half)` | `half / (d + half)` | a measure with a finite `min` and no upper limit. `d` is `v - min`. |
| `none` | no loss | no loss | a measure with no agreed scale |

- The loss of the rule `scale` is 0.5 at `min + half`. Each `scale` entry gives the reason of its `half`.
- Each `none` entry gives the reason that the measure has no scale. The registry gives no guess.
- An objective compares two values of a `none` measure with `compareMeasure`, or ranks the values of a set.
- Without a rule in the facts, `measureEntry` gives `range` for a finite range. For the other ranges, it gives `none` with the reason `NO_FINITE_RANGE`.

## Cost

The cost is a sum of terms, for example `n + e^2` or `n + p + e log e`. The variables are:

- `n`: the boxes.
- `e`: the edges.
- `p`: the points of the routes.

A term is `1`, a variable, a variable with `^2` or `^3`, or one of these with `log` and a variable. An entry without a cost has a cost that is not known.

## The joint entries

| Measure | Cost | Normalization | Reason |
| --- | --- | --- | --- |
| `joint.fill` | `n + p` | `range` | The hull holds the boxes and the points of the routes. |
| `joint.aspectError` | `n + p` | `scale`, half ln 2 | An aspect at a factor of 2 from the target has the loss 0.5. |
| `joint.spill` | `n + p` | `range` | Each segment of a route meets the box hull one time. |
| `joint.straight.crossings` | `n + e^2` | `none` | The count examines each pair of straight edges. A count of crossings has no agreed scale. |
| `joint.straight.length` | `n + e` | `scale`, half 1 | An edge as long as the side `S` of the square of the box area has the loss 0.5. |
| `joint.stability.mean` | planned | `none` | The joint bench has no pairs of a base input and a changed input, so no code computes it. |
| `joint.stability.moved` | planned | `range` | The joint bench has no pairs of a base input and a changed input, so no code computes it. |
| `joint.proxy.rank` | `n + p + e log e` | `range` | The rank correlation sorts the lengths of the edges. |
| `joint.route.length` | `p` | `none` | A length in layout units has no agreed scale. |
| `joint.ms` | not known | `none` | The noise is `timed`. A time of the machine has no agreed scale. |

## The survey

`docs/measure-survey.json` lists the measures of each package that the joint bench installs. The schema is `measure-survey/1`. `node scripts/measure-survey.ts <YYYY-MM-DD>` in `packages/joint` writes the file. A test compares the file with the installed packages, so an engine update makes the test fail until the survey is written again.

- `checkSurvey` gives the faults of a survey.
- `surveyFindings` gives the facts for the idea queue.

The findings are:

- The count of the distinct ids, and the count of each source.
- The ids that two sources declare with another unit or direction.
- The twins: two measures of two sources with one name after the stage, for example `pack.fill` and `joint.fill`, and another unit or direction.
- The ids without a range, which an objective cannot normalize.
- The count of each unit.

### The survey of 2026-11-09

The survey reads the contract of this repository, `packing` 0.10.2 and `highways` 0.15.0. These are the versions of the joint bench. On this day, npm has `packing` 0.15.2 and `highways` 0.16.1.

The first survey read the contract 0.9.5:

- The survey has 160 distinct ids: 10 of the contract, 34 of `packing` and 116 of `highways`.
- No id has two units or two directions.
- Three twin names have another unit word:
  - `fill`: `joint.fill` is "0 to 1", and `pack.fill` is "share".
  - `stability.mean`: `joint.stability.mean` is "W", `pack.stability.mean` is "container widths", and `route.stability.mean` is "units of the board".
  - `stability.moved`: `pack.stability.moved` is "share", and the other two are "0 to 1".
- The 116 measures of `highways` have no range. The rows of `MEASURES` have no `min` and no `max`.

After the unit rules of L65 part 2, the contract uses `share`, and the twin `fill` has no conflict. Two twins stay, with 6 of 160 ids: `stability.mean` and `stability.moved`. The units of `packing` and `highways` change in their next versions:

- `highways` 0.19.0: `min` and `max` on each row of `MEASURES`. The unit `share` for each share and flag, `no unit` for a signed range, and `W` for the lengths of stability.
- `packing`: the unit `share` for the rows `0 to 1` and `boolean`, and `W` for the lengths of stability.

The L65 predictions:

- R1 (p 0.8, 60 or more distinct ids) holds: 160.
- R2 (p 0.4, 15 % or more of the measures with a missing or conflicting unit or direction between two sources) does not hold. The twins hold 8 of 160 ids (5 %), and each conflict is a unit word.

The ideas of the survey, and their state:

- One word for a share from 0 to 1 in each source: the unit rules above. The contract follows them, and `packing` and `highways` change in their next versions.
- A range for each row of the `highways` measures, so that an objective can normalize them: `highways` 0.19.0. Until then, a row with no range gets the rule `none` with a reason.
- One unit for the length of stability in each stage: `W`.
- A spec with no code is debt: the two joint stability measures are planned.
