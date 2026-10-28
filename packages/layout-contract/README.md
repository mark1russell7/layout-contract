# @mark1russell7/layout-contract

The shared contract of two layout engines: [`packing`](https://github.com/mark1russell7/packing) places boxes, and [`highways`](https://github.com/mark1russell7/highways) routes the edges between them. Neither engine depends on the other. Both use this contract, so a placement and a routing compose.

The package has no runtime dependencies.

## The contents

| Part | Exports |
|---|---|
| Geometry | `Point`, `Rect`, `Region`, `Side`, `Sides`, `Margin`, `marginSides`, `grow`, `boundsOf`, `translate`, `overlapOf` |
| The input `layout-input/1` | `LayoutInput`, `LayoutBox` (`Item` for the packer), `Port`, `LayoutEdge`, `LayoutContainer`, `Obstacle`, `LayoutCell`, `LayoutGenerator` |
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
| The turn | `turnBox`, `turnPort`, `turnMargin`, `turnRegion`, `turnSide`, `turnPoint` |
| The tolerances | `EPS`, `RECORD_EPS`, `RECORD_SCALE`, `Tolerance`, `DEFAULT_TOLERANCE` |
| The hard rules | `countOverlaps`, `countObstacleHits`, `regionHitsRect`, `rectInRegion`, `countOutside`, `ContainerTest`, `countPortsOffBorder`, `packHard`, `PackHard`, `placedRect`, `checkInput` |

## The rules

- **The turn.** A turn is 90 degrees clockwise, with the y axis down. A point (`px`, `py`) of a box of height `h` goes to (`h - py`, `px`). Each side moves one step clockwise. The router gets the turned box and ports, and does not read `turn`.
- **The margin.** A margin is a ring around a box. No other box and no route enters it. A route from a port of the box crosses the ring at a right angle.
- **The gap.** The gap is the free space between two boxes with their margins. Routes use it. Two boxes are `mA + gap + mB` apart.
- **The ports.** A port can have a side. Without a side, the router picks the side. A fixed port has `x` and `y` on the border of the box, relative to its top-left corner.
- **The hard rules of a pack.** `no-overlap` counts the pairs of boxes and the pairs of a box and an obstacle. A locked box without a placement, or with a move of more than `RECORD_EPS`, breaks `locked-kept`. `checkInput` refuses a locked box without a position. Another box without a placement and not in `overflow` breaks `complete`.
- **The container rule.** `in-container` counts each box that goes out of the container made smaller by `inset`. The box counts with its margin. By default, a shaped container counts as its bounding box.
- **The exact container.** Give `{ exactContainer: true }` to `packHard` or `countOutside`. Then a box of a shaped container with the size `fixed` must stay inside the shape. A cut corner, a notch and a hole count. A container with a free side keeps the bounding test. The default changes to the exact test at the next breaking version.
- **The output hash.** `outputHash` gives the first 16 hex characters of the SHA-256 of the canonical JSON of an output. Each number goes to the grid of `RECORD_EPS` first.
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

The formats are in `docs/FORMAT.md` of `packing` and `docs/LAYOUT-RECORDS.md` of `highways`. The joint measures are in `docs/JOINT-MEASURES.md` of this repository, and the joint corpus is in `docs/JOINT-CORPUS.md`. The promotion guards are in `docs/PROMOTION.md`. The portfolio and its pick rule are in `docs/PORTFOLIO.md`.
