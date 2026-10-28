# @mark1russell7/layout-contract

The shared contract of two layout engines: [`packing`](https://github.com/mark1russell7/packing) places boxes, and [`highways`](https://github.com/mark1russell7/highways) routes the edges between them. Neither engine depends on the other. Both use this contract, so a placement and a routing compose.

The package has no runtime dependencies.

## The contents

| Part | Exports |
|---|---|
| Geometry | `Point`, `Rect`, `Region`, `Side`, `Sides`, `Margin`, `marginSides`, `grow`, `boundsOf`, `translate`, `overlapOf` |
| The shape kinds | `ShapeKind`, `SHAPE_KINDS`, `SHAPE_KIND_IDS`, `ShapeKindSpec`, `ShapeGeometry`, `DEFAULT_SHAPES`, `ShapeSupport`, `isShapeKind`, `shapeKindOf`, `shapeKindsOf`, `itemShapeOf`, `shapeKindProblem`, `shapesOf`, `checkShapes` |
| The input `layout-input/1` | `LayoutInput`, `LayoutBox` (`Item` for the packer), `Port`, `portPoint`, `LayoutEdge`, `LayoutContainer`, `Obstacle`, `LayoutCell`, `LayoutGenerator`, `PairGap`, `canonicalInput` |
| The packer | `PackInput`, `toPackInput`, `Placement`, `PackOutput`, `StageTrace`, `applyPack` |
| The record `layout-record/1` | `LayoutRecord`, `Stage`, `Supports`, `RunFacts`, `RunEnv`, `toLayoutRecord` |
| The strategies | `StrategyInfo` |
| The measures | `MeasureSpec`, `Direction`, `JointMeasureId`, `JOINT_MEASURES`, `JOINT_MOVED_MIN`, `Verdict`, `compareMeasure`, `minEffectOf` |
| The edges step | `edgeStep`, `EdgeShape`, `EdgeStepParams`, `EDGE_DENSITY`, `EDGE_STEP_VERSION` |
| The random numbers | `mulberry32`, `fnv1a32`, `stepRandom`, `randomInt` |
| The hashes | `sha256Hex`, `canonicalJson`, `documentHash`, `outputHash`, `HashOptions` |
| The promotion guards | `outputGroups`, `OutputGroup`, `exercised`, `ExerciseEvidence` |
| The portfolio | `portfolio`, `Portfolio`, `PortfolioKey`, `PortfolioLevel`, `PortfolioOptions`, `PortfolioPick`, `PortfolioTrace`, `Member`, `MemberTrace`, `MemberStatus`, `pickMoves` |
| The pick rule | `selectBest`, `SelectCandidate`, `SelectLevel`, `Selection`, `PickSpec` |
| The corpus checks | `ClaimBreak`, `checkDeclared`, `declaredCounts`, `declaredClaimOf`, `DeclaredClaim`, `Declares`, `corpusHashOf`, `CorpusEntry` |
| The families | `familyOf`, `FamilyBy`, `FamilyCell`, `FAMILY_ANY_KIND` |
| The verdict | `verdict`, `VerdictOptions`, `VerdictResult`, `VerdictRecord`, `VerdictSide`, `VerdictInterval`, `FamilyVerdict`, `VerdictPermutation`, `VerdictSignTest`, `VerdictLabel`, `VerdictScope`, `VerdictBreadth`, `VERDICT_EXACT_MAX`, `VERDICT_EXACT_CAP`, `VERDICT_RUNS`, `VERDICT_DRAWS`, `VERDICT_SEED` |
| The split files | `checkSplit`, `splitFolds`, `leaveOneSeedOut`, `splitFileName`, `SPLIT_SCHEMA`, `CorpusSplit`, `SplitFold`, `SplitCorpus` |
| The strategy space | `StrategySpace`, `SpaceStage`, `StageOption`, `OptionSupports`, `ShapeFilter`, `SpaceParam`, `ParamWhen`, `MemberRule`, `SpaceConstraint`, `OptionRef`, `StrategyConfig`, `StageChoice`, `ParamKind`, `ParamValue`, `STRATEGY_SPACE_SCHEMA` |
| The space functions | `checkSpace`, `checkConfig`, `canonicalConfig`, `configId`, `spaceSize`, `spaceShapeKinds`, `paramLevels`, `enumerateSpace`, `productSpace`, `joinConfigs`, `splitConfig`, `SpaceSize`, `SpaceSizeOptions`, `EnumerateOptions`, `GridOptions`, `SampleOptions` |
| The turn | `turnBox`, `turnPort`, `turnMargin`, `turnRegion`, `turnSide`, `turnPoint` |
| The tolerances | `EPS`, `RECORD_EPS`, `RECORD_SCALE`, `Tolerance`, `DEFAULT_TOLERANCE` |
| The hard rules | `countOverlaps`, `countObstacleHits`, `regionHitsRect`, `rectInRegion`, `countOutside`, `ContainerTest`, `countPortsOffBorder`, `packHard`, `PackHard`, `PACK_HARD_RULES`, `placedRect`, `checkInput` |

## The rules

- **The turn.** A turn is 90 degrees clockwise, with the y axis down. A point (`px`, `py`) of a box of height `h` goes to (`h - py`, `px`). Each side moves one step clockwise. The router gets the turned box and ports, and does not read `turn`.
- **The margin.** A margin is a ring around a box. No other box and no route enters it. A route from a port of the box crosses the ring at a right angle.
- **The gap.** The gap is the free space between two boxes with their margins. Routes use it. Two boxes are `mA + gap + mB` apart.
- **The pair gaps.** `pairGaps` gives a minimum distance to some pairs of boxes: `{ a, b, gap, lanes? }`. For its pair, the `gap` of an entry replaces `mA + gap + mB`.
  - The order of `a` and `b` has no meaning. A pair without an entry keeps its margins and the global `gap`.
  - `lanes` is the count of the channels that the gap has space for. It is information only.
  - `checkInput` refuses an unknown box, a pair of one box, a repeated pair in either order, a negative or infinite `gap` and bad `lanes`.
  - `canonicalInput` puts `a` before `b` in each pair and sorts the list. `documentHash` uses this form, so an input without `pairGaps` keeps its hash.
  - The hard rule `no-overlap` reads `pairGaps`. For a pair of the list, in either order, the `gap` replaces the two margins. The pair breaks the rule only when the boxes are nearer than the gap.
  - The pairs that are not in the list keep their margins. Without `pairGaps`, the verdicts and the hashes of the records do not change.
- **The ports.** A port can have a side. Without a side, the router picks the side. A fixed port has `x` and `y` on the border of the box, relative to its top-left corner.
  - A port with `side` and `along` is fixed at a fraction of its side. `along` is a number from 0 to 1, from the start of the side.
  - The start of `left` and `right` is the top end. The start of `top` and `bottom` is the left end. `countPortsOffBorder` uses the same start for `x` and `y`.
  - `checkInput` refuses `along` without a side, a value that is not a finite number from 0 to 1, and `along` with `x` or `y`.
  - `portPoint(box, port)` gives the point of a port, relative to the top-left corner of the box. A port without a fixed point gives `undefined`, because the router picks the point.
  - A turn changes `along` of `left` and `right` to `1 - along`, because the start of the side moves to its other end. `along` of `top` and `bottom` stays.
  - An input without `along` keeps its hash.
- **The hard rules of a pack.** `no-overlap` counts the pairs of boxes and the pairs of a box and an obstacle. A pair of `pairGaps` uses its gap in place of the margins. A locked box without a placement, or with a move of more than `RECORD_EPS`, breaks `locked-kept`. `checkInput` refuses a locked box without a position. Another box without a placement and not in `overflow` breaks `complete`.
- **The container rule.** `in-container` counts each box that goes out of the container made smaller by `inset`. The box counts with its margin. By default, a shaped container counts as its bounding box.
- **The exact container.** Give `{ exactContainer: true }` to `packHard` or `countOutside`. Then a box of a shaped container with the size `fixed` must stay inside the shape. A cut corner, a notch and a hole count. A container with a free side keeps the bounding test. The default changes to the exact test at the next breaking version.
- **The shape kinds.** An item is a `rect`, a `polygon`, a `circle` or a `free` shape. Each measure and rule declares its kinds. `checkShapes` refuses the other kinds. `docs/SHAPES.md` tells the rules.
- **The output hash.** `outputHash` gives the first 16 hex characters of the SHA-256 of the canonical JSON of an output. Each number goes to the grid of `RECORD_EPS` first.
- **The corpus checks.** `checkDeclared` and `checkSplit` give a list of `ClaimBreak`. An empty list tells that each claim is true. `corpusHashOf` gives the corpus hash of `packing`.
- **The verdict.** `verdict` compares two strategies on one measure, with the family as the unit. A verdict counts only when it holds for the mean of the family means and for the mean of the inputs.
- **The tolerances.** `EPS` (`1e-6`) is for the float compares in an engine. `RECORD_EPS` (`1e-3`) is for the compares on a written file. A record writes the tolerance of each hard rule in its field `tolerance`. The defaults are `overlap` `0.001` and `through` `0.5`.

## An example

```ts
import { applyPack, packHard, toPackInput, type LayoutInput } from "@mark1russell7/layout-contract";

const input: LayoutInput = {
  schema: "layout-input/1",
  id: "example",
  container: { w: 200, fixed: "width" },
  gap: 4,
  boxes: [{ id: "a", w: 40, h: 20, margin: 2 }],
};
const output = myPacker(toPackInput(input));
const placed = applyPack(input, output);
const hard = packHard(input, output);
```

The formats are in `docs/FORMAT.md` of `packing` and `docs/LAYOUT-RECORDS.md` of `highways`. The joint measures are in `docs/JOINT-MEASURES.md` of this repository, and the joint corpus is in `docs/JOINT-CORPUS.md`. The promotion guards are in `docs/PROMOTION.md`. The portfolio and its pick rule are in `docs/PORTFOLIO.md`. The corpus checks and the split files are in `docs/CORPUS-CHECKS.md`. The strategy space is in [`docs/STRATEGY-SPACE.md`](https://github.com/mark1russell7/layout-contract/blob/main/docs/STRATEGY-SPACE.md).

The verdict over families is in [`docs/VERDICT.md`](https://github.com/mark1russell7/layout-contract/blob/main/docs/VERDICT.md).
