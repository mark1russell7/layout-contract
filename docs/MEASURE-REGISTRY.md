# The measure registry

The registry gives one entry for each measure. An entry is a `MeasureSpec` with four more facts:

- `source`: the npm name of the package that computes the measure.
- `noise`: the cause of a change of the value when the layout does not change.
- `normalize`: the rule that maps a value to a loss from 0 to 1.
- `cost`: the order of growth of one read. This fact is optional.

`MEASURE_REGISTRY` holds the entries of the joint measures. Each engine keeps the specs of its own measures. An engine adopts the registry with `measureEntry(spec, facts)` when it adds a measure. `checkRegistry` gives the faults of a list of entries.

## Noise

| Kind | Meaning |
| --- | --- |
| `exact` | The value is a function of the layout. Two reads of one layout give the same value. |
| `sampled` | The value is an estimate from a seeded sample. Another seed gives another value. |
| `timed` | The value is a time of the machine. Each read gives another value. |

`measureEntry` gives the kind `exact` when the facts have no noise.

## Normalization

`normalizeMeasure(value, entry)` gives the loss of a value. The loss 0 is the best value. The value must be in the range `min` to `max` of the spec. A value outside the range gives a `RangeError`.

| Rule | Loss for `lower` | Loss for `higher` | Use |
| --- | --- | --- | --- |
| `range` | `(v - min) / (max - min)` | `1 - (v - min) / (max - min)` | a measure with a finite `max` |
| `scale` | `d / (d + half)` | `half / (d + half)` | a measure with no upper limit. `d` is `v - min`. |
| `none` | no loss | no loss | a measure with no agreed scale |

- The loss of the rule `scale` is 0.5 at `min + half`. Each `scale` entry gives the reason of its `half`.
- An objective compares two values of a `none` measure with `compareMeasure`, or ranks the values of a set.
- Without a rule in the facts, `measureEntry` gives `range` for a finite range and `none` for the other ranges.

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
| `joint.straight.crossings` | `n + e^2` | `none` | The count examines each pair of straight edges. A count has no agreed scale. |
| `joint.straight.length` | `n + e` | `scale`, half 1 | An edge as long as the side `S` of the square of the box area has the loss 0.5. |
| `joint.stability.mean` | not known | `none` | The joint bench does not compute it yet. |
| `joint.stability.moved` | not known | `range` | The joint bench does not compute it yet. |
| `joint.proxy.rank` | `n + p + e log e` | `range` | The rank correlation sorts the lengths of the edges. |
| `joint.route.length` | `p` | `none` | A length in layout units has no agreed scale. |
| `joint.ms` | not known | `none` | The noise is `timed`. |

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

The survey reads `layout-contract` 0.9.5, `packing` 0.10.2 and `highways` 0.15.0. These are the versions of the joint bench. On this day, npm has `packing` 0.15.2 and `highways` 0.16.1.

- The survey has 160 distinct ids: 10 of the contract, 34 of `packing` and 116 of `highways`.
- No id has two units or two directions.
- Three twin names have another unit word:
  - `fill`: `joint.fill` is "0 to 1", and `pack.fill` is "share".
  - `stability.mean`: `joint.stability.mean` is "W", `pack.stability.mean` is "container widths", and `route.stability.mean` is "units of the board".
  - `stability.moved`: `pack.stability.moved` is "share", and the other two are "0 to 1".
- The 116 measures of `highways` have no range. The rows of `MEASURES` have no `min` and no `max`.

The L65 predictions:

- R1 (p 0.8, 60 or more distinct ids) holds: 160.
- R2 (p 0.4, 15 % or more of the measures with a missing or conflicting unit or direction between two sources) does not hold. The twins hold 8 of 160 ids (5 %), and each conflict is a unit word.

The ideas for the queue:

- One word for a share from 0 to 1 in each source.
- A range for each row of the `highways` measures, so that an objective can normalize them.
- The `route.stability.mean` unit is a length of the board. The twins in `packing` and the contract use a width of the base. A compare across the stages needs one unit.
