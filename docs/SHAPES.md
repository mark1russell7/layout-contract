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
| `polygon` | `points`, `holes` (optional) | `polygon` | yes | declared | declared | declared |
| `circle` | `cx`, `cy`, `r` | `circle` | yes | declared | declared | declared |
| `free` | `w`, `h`, `shape` (optional) | each kind | yes | declared | declared | declared |

- "Declared" tells that the kind needs the operation, but this package does not supply it yet. No measure of the contract needs it today.
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
| `no-overlap`, `in-container` | `rect` | They test the bounding boxes. For a different kind, the count is an upper bound, not the exact count. |
| `locked-kept`, `complete` | each kind | They read only the positions and the ids. |

`PACK_HARD_RULES` gives the kinds of the 4 hard rules of a pack. A measure that supports only `rect` keeps its exact values.

## The strategy space

- `StageOption.supports.shape` gives the kinds of an option. Without it, the option supports each kind.
- `supports` describes the option, not the config. Thus it is not part of `canonicalConfig` or `configId`.
- `checkSpace` refuses an empty list of kinds, an unknown kind and a kind that occurs two times.
- `checkConfig(space, config, { shapes })` gives the claim `shape` for each chosen option that does not support a kind of `shapes`. The members of a meta option get the same check.
- `spaceSize` and `enumerateSpace` with `shapes` count only the options that support each kind. Without `shapes`, the result does not change.
- `spaceShapeKinds(space)` gives the kinds of a space. The value comes from the options: a kind with at least one config without a meta option.

## The request to a packer

A packer that places an item that is not a `rect` does these steps:

1. It declares `supports.shape` on each option of its strategy space.
2. It declares `shapes` on each of its `pack.*` measure specs. A spec without `shapes` stays on `rect`.
3. Before a run, it starts `checkShapes` with its measures and `PACK_HARD_RULES`, and `checkConfig` with `shapes`. It refuses a run on a break.
4. It writes the box with its `shape`, and keeps `w` and `h` as the bounding size of the shape.
5. It asks the contract for the exact overlap and containment tests of a kind before it claims `no-overlap` or `in-container` on that kind.
