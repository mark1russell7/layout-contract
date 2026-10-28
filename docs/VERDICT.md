# The verdict over families

`verdict` of `layout-contract` compares two strategies on one measure, with the family as the unit. `highways`, `packing` and the joint bench use the same function. Thus the three give the same verdict on the same records.

The rule is the shared block "The verdict over families" of `docs/PROMOTION.md`. This note tells the function, its arguments and its result.

## Why the family is the unit

A corpus has families of inputs, and each family has seeds. The seeds of one family are replicates of one board. On a corpus with families of different sizes, the mean of the inputs gives a large family a large weight. Then the mix of the corpus decides the sign, not the strategies.

For example, the screen `screen-v2` of `highways` has 6 families of 10 seeds. On the mean of the inputs, the B1 sign against `shared` changed for 10 highway strategies. On the mean of the family means, it changed for only 2.

## The family of an input

The field `familyBy` of the claim `claims.declared` gives the key of the family of each input. `docs/CORPUS-CHECKS.md` tells the two forms of the key and their checks.

```json
{ "claims": { "declared": { "minCount": 10, "thin": [], "counts": {}, "familyBy": { "rect-grid": ["obstacles"], "*": [] }, "familyMin": 10 } } }
```

- The flat form `["groups", "edgeDensity"]` gives the key `flat/dense` for a cell with `groups: "flat"` and `edgeDensity: "dense"`.
- The map form `{ "rect-grid": ["obstacles"], "*": [] }` gives `rect-grid/wall` for a `rect-grid` cell with `obstacles: "wall"`, and `gallery` for a `gallery` cell.

`familyOf(cell, familyBy)` gives the key of one cell. The caller of `verdict` gives the family of each record with the hook `family`.

## The arguments

```ts
const v = verdict(records, {
  by: "family",
  family: (r) => familyOf(cellOfInput(r.input), familyBy),
  measure: { id: "route.bends", direction: "lower" },
  a: "shared",
  b: "corridors",
  tie: 0.005,
  level: 0.05,
});
```

| Argument | Value |
|---|---|
| `by` | `"family"`. The family is the only unit. |
| `family` | The hook that gives the family of a record. The two records of one input have the same family. |
| `measure` | The id and the direction of the measure. |
| `a` | The baseline: a strategy id, or a test of a record. |
| `b` | The candidate: a strategy id, or a test of a record. |
| `tie` | The minimum effect of the sign of a family, as `minEffect` of `MeasureSpec`. It has no default. |
| `level` | The significance level, from 0 to 1. It has no default. The intervals have the level `1 - level`. |
| `runs` | The samples of each bootstrap. The default is `VERDICT_RUNS` (10 000). |
| `draws` | The random sign sets above the exact limit. The default is `VERDICT_DRAWS` (20 000). |
| `seed` | The seed of the bootstraps and of the sign sets. The default is `VERDICT_SEED` (1). |
| `exactMax` | The largest count of inputs for the exact test. The default is `VERDICT_EXACT_MAX` (16). The value 0 always uses draws. |

The function throws a `RangeError` for a missing `tie` or `level`. Each caller gives them, so no default decides a verdict without a reason.

## The pairs

- The function pairs the records of `a` and `b` by input and seed.
- The difference of a pair is `b - a` for a measure where more is better, and `a - b` for a measure where less is better. Thus a positive difference tells that `b` is better.
- A pair with a skipped record, a missing value or a record of only one side goes to `dropped`. The verdict does not use it.
- Two records of one side for one input and seed cause a `RangeError`. A value that is not finite causes a `RangeError` too.
- The function sorts the pairs by family and key. Thus the order of the records does not change the result.

## The result

| Field | Value |
|---|---|
| `stratified` | The mean of the family means, with its interval. The bootstrap draws the seeds inside each family, with replacement. |
| `pooled` | The mean of the inputs, with its interval. The bootstrap draws all the inputs, with replacement. |
| `permutation` | `{ p, exact, draws, seed }`: the stratified paired permutation test. |
| `families` | `{ family, n, mean, sign }` for each family, in sort order. |
| `signTest` | `{ wins, losses, ties, p }`: the two-sided exact binomial test of the family signs. It is a report only. |
| `agree` | `true` only when the verdict holds under both weightings. |
| `label` | `better`, `worse`, `depends on the mix` or `no verdict`. |
| `dropped` | The keys of the pairs that the verdict does not use. |

### The permutation test

A flip changes the sign of the difference of one input, inside its family. The statistic is the mean of the family means. The p is the share of the sign sets with an absolute statistic at least as large as the observed one.

- With `n` inputs, the exact test enumerates all `2^n` sign sets. It applies when `n` is at most `VERDICT_EXACT_MAX` (16).
- At 16 inputs, the exact test has 65 536 sign sets, approximately 3 times the default draws. Each more input doubles the count, so above 16 the test uses seeded draws.
- A drawn p is `(hits + 1) / (draws + 1)`. The observed sign set counts as one draw, so a drawn p is always above 0.
- On a made-up case with 16 inputs, the exact p is 0.2427. The drawn p with 20 000 draws is 0.2415, a difference of 0.0012.
- `VERDICT_EXACT_CAP` (20) is the largest value of `exactMax`. At 20 inputs, the exact test has approximately 1 million sign sets.

### The sign of a family

`compareMeasure` compares the mean of `b` and the mean of `a` in the family, with `tie` as the `minEffect`. The sign is 1 when `b` is better, -1 when `b` is worse, and 0 for a tie. The smallest tie is one grid step of `RECORD_EPS`.

### The label

- `agree` is `true` when the two means have the same sign and the two intervals are clear of 0 on that side. The permutation p is also below `level`. Then the label is `better` or `worse`, by the side of `b`.
- When the two means have opposite signs, the label is `depends on the mix`. Then the mix of the families in the corpus decides the sign.
- Otherwise, the label is `no verdict`.

## The power

The sign test of the families is a report. It does not decide a verdict, because its power is low with few families.

| Families | Best two-sided p | p at one loss |
|---|---|---|
| 6 | 0.031 (6 of 6) | 0.22 (5 of 6) |
| 10 | 0.002 (10 of 10) | 0.021 (9 of 10) |

With 6 families, 5 of 6 is not significant. More seeds do not change this limit. Only more families change it.
