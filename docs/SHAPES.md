# The shape kinds (L46)

The packer of `packing` packs only rectangles today. Later strategies pack other shapes. Thus the shape kind of an item is a dimension of the contract.

## The prediction

The prediction comes before the code. The section "The score" gives the result.

| # | Claim | Confidence |
|---|---|---|
| P1 | No input hash, record hash or `configId` pin changes. Each test of 0.2.12 passes without a change. | 0.85 |
| P2 | 7 of the 9 joint measures work on a convex polygon with only its bounding box. Only `joint.fill` and `joint.straight.length` need the area of the shape. | 0.5 |
| P3 | 2 of the 4 hard rules of a pack (`locked-kept` and `complete`) support each kind. `no-overlap` and `in-container` stay on `rect`. | 0.7 |
| P4 | The API report gets fewer than 25 new lines, and it loses no line. | 0.4 |
| P5 | The change needs no edit of `corpus.ts`, `edges.ts` or `packages/joint`. | 0.85 |
| P6 | The shape filter adds fewer than 60 lines to `strategy-space.ts`. | 0.45 |

## The score

| # | Result | True |
|---|---|---|
| P1 | The 195 tests of 0.2.12 pass without a change. A new test gives `configId` `11176301242c0f10` for a space with `supports`. A record of an input of rectangles has no new field. | yes |
| P2 | 7 of the 9 joint specs have each kind. `joint.fill` and `joint.straight.length` have `rect` only. | yes |
| P3 | `PACK_HARD_RULES` gives each kind to `locked-kept` and `complete`, and `rect` to the other 2 rules. | yes |
| P4 | The report has 82 new lines and 6 changed lines: the count of the names, 3 `extends ShapeFilter`, `RunFacts` and `checkConfig`. Each change adds an optional field or an optional parameter. | no |
| P5 | `corpus.ts`, `edges.ts` and `packages/joint` do not change. `pnpm typecheck` passes for `packages/joint`. | yes |
| P6 | `strategy-space.ts` has 94 new lines and 16 changed lines. The checks of `supports` and `spaceShapeKinds` are in that count. | no |

4 of 6 claims are true. The Brier score is 0.125. The two false claims are the two risky size claims: the API change is approximately 3 times the prediction.

## The kinds

`SHAPE_KINDS` declares the kinds. The set is open: a later version can add a kind. A reader treats an unknown kind as a kind that it does not support.

| Kind | Fields, relative to the box | `Region` kinds | Bounding box | Area | Inside a region | Overlap |
|---|---|---|---|---|---|---|
| `rect` | `w`, `h` | `rect` | yes | yes | yes (`rectInRegion`) | yes (`overlapOf`) |
| `polygon` | `points`, `holes` (optional) | `polygon` | yes | yes (`regionArea`) | declared | declared |
| `circle` | `cx`, `cy`, `r` | `circle` | yes | yes (`regionArea`) | declared | declared |
| `free` | `w`, `h`, `shape` (optional) | each kind | yes | declared | declared | declared |

- "Declared" tells that the kind needs the operation, but this package does not supply it yet. No measure of the contract needs it today.
- `polygon` and `circle` have their exact area since 0.2.16 (L57). The section "The area" tells the rules.
- `free` tells that the contract knows only the bounding box `w` by `h` of the item. An ellipse is `free`.
- A `polygon` can be concave. A measure that needs a convex polygon can add a flag `convex` at a later version.

## The kind of a box

- `LayoutBox.shapeKind` gives the kind. Without it, `shapeKindOf` gives the kind of `shape`, or `rect` for a box without a shape.
- `checkInput` refuses a `shapeKind` that does not agree with `shape`, for example a `circle` without a circle shape.
- The cell dimension `itemShape` is one kind, or `mixed` for more kinds. Without it, each box is a `rect`. `itemShapeOf` gives the value.
- A record has `shapes`: the kinds of the boxes, in the order of `SHAPE_KINDS`. `toLayoutRecord` writes it only for an input with a kind that is not `rect`.

Thus each input, record and hash of 0.2.12 stays the same.

## The measures and the rules

`MeasureSpec.shapes` gives the kinds that a measure supports. A spec without `shapes` supports only `rect` (`DEFAULT_SHAPES`), because the contract measured only rectangles before L46.

`checkShapes(input, uses)` gives a `ClaimBreak` with the claim `shape` for each measure or rule that does not support a kind of the input. An engine starts it before a run, and refuses the run on a break.

| Measure or rule | Kinds | Reason |
|---|---|---|
| `joint.fill` | `rect` | It reads the area `w` by `h` of each box. |
| `joint.straight.length` | `rect` | Its unit `S` reads the area of each box. |
| `joint.aspectError`, `joint.spill` | each kind | They read the hull of the bounding boxes. |
| `joint.straight.crossings` | each kind | It reads the centers of the bounding boxes. |
| `joint.stability.mean`, `joint.stability.moved` | each kind | They read the positions and the width `W` of the bounding boxes. |
| `joint.proxy.rank`, `joint.ms` | each kind | They read the ranks of lengths and the time. |
| `no-overlap`, `in-container` | `rect`, and `safe` for `polygon`, `circle` and `free` | They test the bounding boxes. For a different kind, the count is an upper bound, not the exact count. |
| `locked-kept`, `complete` | each kind | They read only the positions and the ids. |

`PACK_HARD_RULES` gives the kinds of the 4 hard rules of a pack. A measure that supports only `rect` keeps its exact values.

### The safe level (L57)

`ShapeSupport.safe` lists the kinds with a safe count. On such a kind, the rule can count a break that is not real, but it does not miss a real break. Thus a safe count of 0 tells that the rule has no break.

- A kind is in `shapes` (exact) or in `safe`, not in the two lists. `shapeSupportProblems(uses)` refuses a kind in the two lists, an unknown kind and a kind two times in one list.
- `ruleLevel(rule, kind)` gives `exact`, `safe` or `none`. A rule without `shapes` is exact on `rect` (`DEFAULT_SHAPES`).
- `no-overlap` and `in-container` are exact on `rect` and safe on `polygon`, `circle` and `free`. A shape is inside its bounding box, so the count of the bounding boxes is an upper bound.
- By default, `checkShapes` refuses a safe kind, as before. With `{ level: "safe" }`, it accepts a safe kind. Use it only when the run claims that a rule has no break.
- A break of a safe kind tells that the count is only safe.

| Reader of `shapes` | Does it read `safe`? | Does it read `bound` (0.2.17)? |
|---|---|---|
| `shapesOf` | No. It gives the exact kinds. | No. |
| `ruleLevel` | Yes. It joins `shapes` and `safe`. | No. Its result stays the same as in 0.2.16. |
| `shapeLevel` | Yes. | Yes. It is the one function that joins the three lists. |
| `checkShapes` | Yes, through `shapeLevel`. The default level `exact` keeps each refusal of 0.2.15. | Yes, through `shapeLevel`. |
| `shapeSupportProblems` | Yes. It refuses an overlap of the two lists. | Yes. It refuses an overlap of each two lists. |
| `packages/joint`, `packages/site` | No file reads `ShapeSupport.shapes`, so they do not change. | No. |

### The bound of a measure (0.2.17)

`MeasureSpec.bound` lists the kinds where the value of a measure is a bound of the true value. Its `side` tells which bound it is.

- With `side: "upper"`, the value is the true value or more. With `side: "lower"`, the value is the true value or less.
- A kind is in one list only: `shapes`, `safe` or `bound.shapes`. `shapeSupportProblems` refuses a kind in two lists, an unknown kind, a repeated kind and a bad `side`.
- `shapeLevel(use, kind)` gives `exact`, `safe`, `bound` or `none`. `ruleLevel` does not read `bound`.
- By default, `checkShapes` refuses a bound kind. The break tells the side, for example "The value of pack.shapeFill is only an upper bound for free".
- With `{ level: "safe" }`, `checkShapes` accepts a bound kind, as it accepts a safe kind of a rule.
- `JOINT_MEASURES` has no `bound`. Each joint measure keeps its kinds.

An example is the measure `pack.shapeFill` of the packing engine. It reads `w * h` as the area of a `free` box, because `boxArea` gives no area for that kind. The bounding box holds the shape, so the fill is too high on `free`. The spec is:

```ts
{ id: "pack.shapeFill", direction: "higher", shapes: ["rect", "polygon", "circle"], bound: { shapes: ["free"], side: "upper" } }
```

#### What a bound value proves

The side and the `direction` of the measure tell what a bound value proves. A bound is optimistic when it is on the better side of the true value. It is pessimistic when it is on the worse side.

| `direction` | `side` | The bound | A value `v` and a threshold `t`: the proof | No proof |
|---|---|---|---|---|
| `higher` | `upper` | optimistic | `v < t` proves that the true value is less than `t`. | `v >= t` proves nothing. The true value can be less than `t`. |
| `higher` | `lower` | pessimistic | `v >= t` proves that the true value is `t` or more. | `v < t` proves nothing. |
| `lower` | `upper` | pessimistic | `v <= t` proves that the true value is `t` or less. | `v > t` proves nothing. |
| `lower` | `lower` | optimistic | `v > t` proves that the true value is more than `t`. | `v <= t` proves nothing. |

- For a floor or a guard, a pessimistic bound proves a pass, but its fail can be false. An optimistic bound proves a fail, but its pass can be false.
- Thus a `pack.shapeFill` value under a threshold proves that the true fill is under it. A value over the threshold proves nothing.
- `compareMeasure` on two bound values proves nothing about the true order, because each value has a different error.
- A bound candidate against an exact baseline: with an optimistic bound, only `worse` is a proof. With a pessimistic bound, only `better` is a proof.
- An exact candidate against a bound baseline: with an optimistic baseline, only `better` is a proof. With a pessimistic baseline, only `worse` is a proof.
- A tie with a bound value proves nothing.

#### The word `bound`, not `safe`

In this contract, `safe` tells that a pass is a proof. A safe count of 0 proves that a rule has no break. A safe count is an upper bound of a count with the direction `lower`, so it is pessimistic.

A bound of a measure can be optimistic. `pack.shapeFill` is an upper bound with the direction `higher`, so a pass of its floor is not a proof. Thus `safe` is not true for each bound, and the level of a measure on such a kind is `bound`.

- `ShapeCheck.level` keeps its two values. The value `safe` accepts each result on one known side of the true result: a safe count and a bound value.
- The gate does not add a value `bound`. A run that asks for `{ level: "safe" }` in 0.2.16 also gets the bound kinds of a measure, with no new option.
- After the gate, the caller reads `bound.side` and `direction` of each bound kind. It uses only the proofs of the table.

### The area (L57)

- `regionArea(region)` gives the exact area of a region. A `rect` gives `w * h`, a circle `PI * r * r` and an ellipse `PI * rx * ry`.
- A polygon gives the absolute value of the shoelace formula, less the area of each hole. Thus the direction of a ring does not change the area.
- `boxArea(box)` gives `regionArea` of `box.shape`, or `w * h` for a `rect` without a shape.
- `boxArea` gives `undefined` for a box of the kind `free`, also with a shape. A box with an ellipse shape is `free` (`shapeKindOf`), so it gives `undefined`. This agrees with `SHAPE_KINDS`, where `free` has no area.
- A box of the kind `polygon` or `circle` without a shape is a bad input. `boxArea` gives `undefined` for it.

## The strategy space

- `StageOption.supports.shape` gives the kinds of an option. Without it, the option supports each kind.
- `supports` describes the option, not the config. Thus it is not part of `canonicalConfig` or `configId`.
- `checkSpace` refuses an empty list of kinds, an unknown kind and a kind that occurs two times.
- `checkConfig(space, config, { shapes })` gives the claim `shape` for each chosen option that does not support a kind of `shapes`. The members of a meta option get the same check.
- `spaceSize` and `enumerateSpace` with `shapes` count only the options that support each kind. Without `shapes`, the result does not change.
- `spaceShapeKinds(space)` gives the kinds of a space. The value comes from the options: a kind with at least one config without a meta option.

### The member view (L57)

A packer can pack each shape by its bounding box with a meta option. Then its members see only rectangles. `MemberRule.view: "bounds"` declares it.

- With `view: "bounds"`, a shape filter checks the members with `["rect"]`. The meta option itself gets the kinds of the input.
- The rule applies to `checkConfig`, `spaceSize`, `enumerateSpace` and the entries of a `pool`.
- Without `shapes`, or with an empty list, the members get the same filter as before.
- A sample with `meta: "sample"` can give meta configs when a stage has no option for the kind. Then the meta option replaces the stage.
- `spaceShapeKinds` does not change, because it counts only the configs without a meta option.
- `checkSpace` refuses another value of `view` with the claim `view`. Without `view`, nothing changes.

### A sample with a shape filter (0.2.17)

A meta option without `view` takes its members from the space with the kinds of the input. When no member supports a kind, the option has no member list. `spaceSize`, `enumerateSpace` with `grid` and the cells give it 0.

- A sample with `meta: "sample"` keeps such an option in the list of its stage. A point that chooses it draws again, as a point that breaks a constraint does.
- Thus the strata do not change, and each sample of 0.2.16 stays the same, byte for byte. In 0.2.16, a sample that chose such an option threw an `Error`.
- A sample throws a `RangeError` only when the space has no config for the kinds. The error names the kinds and each stage without an option.
- The error also names each meta option without `view` that has no member list. For such an option, it tells to set `members.view` to `"bounds"`.
- Each sampled config passes `checkConfig` with the same `shapes`. A seeded test examines each kind of `SHAPE_KIND_IDS` on 8 spaces.

## The request to a packer

A packer that places an item that is not a `rect` does these steps:

1. It declares `supports.shape` on each option of its strategy space.
2. It declares `shapes` on each of its `pack.*` measure specs. A spec without `shapes` stays on `rect`. A kind with only a bound value goes in `bound`.
3. Before a run, it starts `checkShapes` with its measures and `PACK_HARD_RULES`, and `checkConfig` with `shapes`. It refuses a run on a break.
4. It writes the box with its `shape`, and keeps `w` and `h` as the bounding size of the shape.
5. It asks the contract for the exact overlap and containment tests of a kind before it claims `no-overlap` or `in-container` on that kind.
