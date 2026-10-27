# @mark1russell7/layout-contract

The shared contract of two layout engines: [`packing`](https://github.com/mark1russell7/packing) places boxes, and [`highways`](https://github.com/mark1russell7/highways) routes the edges between them. Neither engine depends on the other. Both use this contract, so a placement and a routing compose.

The package has no runtime dependencies.

## The contents

| Part | Exports |
|---|---|
| Geometry | `Point`, `Rect`, `Region`, `Side`, `Sides`, `Margin`, `marginSides`, `grow`, `boundsOf`, `translate`, `overlapOf` |
| The input `layout-input/1` | `LayoutInput`, `LayoutBox` (`Item` for the packer), `Port`, `LayoutEdge`, `LayoutContainer`, `Obstacle` |
| The packer | `PackInput`, `toPackInput`, `Placement`, `PackOutput`, `StageTrace`, `applyPack` |
| The record `layout-record/1` | `LayoutRecord`, `Stage`, `Supports` |
| The turn | `turnBox`, `turnPort`, `turnMargin`, `turnRegion`, `turnSide`, `turnPoint` |
| The tolerances | `EPS`, `RECORD_EPS`, `Tolerance`, `DEFAULT_TOLERANCE` |
| The hard rules | `countOverlaps`, `countOutside`, `countPortsOffBorder`, `packHard`, `PackHard`, `placedRect` |

## The rules

- **The turn.** A turn is 90 degrees clockwise, with the y axis down. A point (`px`, `py`) of a box of height `h` goes to (`h - py`, `px`). Each side moves one step clockwise. The router gets the turned box and ports, and never reads `turn`.
- **The margin.** A margin is a ring around a box. No other box and no route enters it. A route from a port of the box crosses the ring at a right angle.
- **The gap.** The gap is the free space between two boxes with their margins. Routes use it. Two boxes are `mA + gap + mB` apart.
- **The ports.** A port has a side. A fixed port has `x` and `y` on the border of the box, relative to its top-left corner.
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
const hard = packHard(input, placed, output.overflow);
```

The formats are in `docs/FORMAT.md` of `packing` and `docs/LAYOUT-RECORDS.md` of `highways`.
