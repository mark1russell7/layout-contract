import { describe, expect, it } from "vitest";
import {
  applyPack,
  checkInput,
  countResizeBreaks,
  type LayoutBox,
  type LayoutInput,
  type PackOutput,
  packHard,
  packOutputForm,
  outputHash,
  resizeBox,
  resizeProblems,
  shapeFits,
  shapeKindOf,
  sizeBoundsOf,
  sizeFits,
  turnBox,
  turnResize,
} from "./index.ts";

// The resize of a box: the bounds, the box at a new size, the hard rule `size-kept` and the input problems.

const grow: LayoutBox = { id: "g", w: 100, h: 40, resize: { maxW: 300, minH: 20, maxH: 60 } };

/** An output with the placements `placements` in a container of 1000 by 1000. */
function out(...placements: PackOutput["placements"]): PackOutput {
  return { placements, overflow: [], size: { w: 1000, h: 1000 }, moved: [] };
}

describe("sizeBoundsOf and sizeFits", () => {
  it("takes the size of the box for each bound that the resize does not set", () => {
    expect(sizeBoundsOf(grow)).toEqual({ minW: 100, maxW: 300, minH: 20, maxH: 60, aspect: "free" });
    expect(sizeBoundsOf({ id: "a", w: 10, h: 5 })).toEqual({ minW: 10, maxW: 10, minH: 5, maxH: 5, aspect: "free" });
  });

  it("accepts a size in the bounds, with the tolerance of the records", () => {
    expect(sizeFits(grow, 300, 20)).toBe(true);
    expect(sizeFits(grow, 300.001, 60.001)).toBe(true);
    expect(sizeFits(grow, 300.01, 40)).toBe(false);
    expect(sizeFits(grow, 99, 40)).toBe(false);
    expect(sizeFits(grow, 100, 19)).toBe(false);
    expect(sizeFits({ id: "a", w: 10, h: 5 }, 10, 5)).toBe(true);
    expect(sizeFits({ id: "a", w: 10, h: 5 }, 11, 5)).toBe(false);
  });

  it("refuses a size that is not positive and finite", () => {
    for (const [w, h] of [[Number.NaN, 40], [200, Number.POSITIVE_INFINITY], [0, 40], [-5, 40]] as const) expect(sizeFits(grow, w, h)).toBe(false);
  });

  it("keeps the ratio of the box with the aspect keep", () => {
    const keep: LayoutBox = { id: "k", w: 100, h: 50, resize: { maxW: 400, maxH: 200, aspect: "keep" } };
    expect(sizeFits(keep, 300, 150)).toBe(true);
    expect(sizeFits(keep, 300.001, 150)).toBe(true);
    expect(sizeFits(keep, 300, 140)).toBe(false);
    expect(sizeFits({ ...keep, resize: { maxW: 400, maxH: 200 } }, 300, 140)).toBe(true);
  });
});

describe("resizeBox and turnResize", () => {
  const ported: LayoutBox = {
    ...grow,
    margin: 4,
    ports: [
      { id: "fixed", side: "right", x: 100, y: 20 },
      { id: "along", side: "top", along: 0.25 },
    ],
  };

  it("scales a port with x or y and keeps a port with along", () => {
    const big = resizeBox(ported, 200, 60);
    expect([big.w, big.h, big.margin]).toEqual([200, 60, 4]);
    expect(big.ports).toEqual([
      { id: "fixed", side: "right", x: 200, y: 30 },
      { id: "along", side: "top", along: 0.25 },
    ]);
    const { resize: _, ...plain } = big;
    expect(checkInput({ schema: "layout-input/1", id: "i", boxes: [plain] })).toEqual([]);
  });

  it("gives the same box for the same size", () => {
    expect(resizeBox(ported, 100, 40)).toBe(ported);
  });

  it("turns the bounds with the box", () => {
    expect(turnResize({ minW: 1, maxW: 2, minH: 3, maxH: 4, aspect: "keep" })).toEqual({ minW: 3, maxW: 4, minH: 1, maxH: 2, aspect: "keep" });
    expect(turnResize({ maxW: 300 })).toEqual({ maxH: 300 });
    const turned = turnBox(grow);
    expect(sizeBoundsOf(turned)).toEqual({ minW: 20, maxW: 60, minH: 100, maxH: 300, aspect: "free" });
  });
});

describe("applyPack with a size", () => {
  it("gives the placed box the size of the placement, after the turn", () => {
    const input: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [{ ...grow, turnable: true }] };
    expect(applyPack(input, out({ id: "g", x: 5, y: 6, w: 250 })).boxes[0]).toMatchObject({ x: 5, y: 6, w: 250, h: 40 });
    expect(applyPack(input, out({ id: "g", x: 5, y: 6, turn: 90, h: 280 })).boxes[0]).toMatchObject({ w: 40, h: 280 });
    expect(applyPack(input, out({ id: "g", x: 5, y: 6 })).boxes[0]).toMatchObject({ w: 100, h: 40 });
  });
});

describe("the hard rule size-kept", () => {
  it("is not in the counts of an input and an output without a resize", () => {
    const input: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [{ id: "a", w: 10, h: 10 }] };
    expect(packHard(input, out({ id: "a", x: 0, y: 0 }))).toEqual({ "no-overlap": 0, "in-container": 0, "locked-kept": 0, complete: 0 });
  });

  it("counts each placement whose size is not in the bounds", () => {
    const input: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [grow, { id: "a", w: 10, h: 10 }] };
    expect(packHard(input, out({ id: "g", x: 0, y: 0, w: 300 }, { id: "a", x: 0, y: 100 }))["size-kept"]).toBe(0);
    expect(packHard(input, out({ id: "g", x: 0, y: 0, w: 301 }, { id: "a", x: 0, y: 100, h: 12 }))["size-kept"]).toBe(2);
    expect(countResizeBreaks(input, out({ id: "g", x: 0, y: 0, h: 61 }, { id: "nobody", x: 0, y: 0, w: 1 }))).toBe(1);
  });

  it("reads the turned bounds of a turned placement", () => {
    const input: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [{ ...grow, turnable: true }] };
    expect(countResizeBreaks(input, out({ id: "g", x: 0, y: 0, turn: 90, w: 60, h: 300 }))).toBe(0);
    expect(countResizeBreaks(input, out({ id: "g", x: 0, y: 0, turn: 90, w: 300, h: 60 }))).toBe(1);
  });

  it("counts a placement with a size on a box without a resize", () => {
    const input: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [{ id: "a", w: 10, h: 10 }] };
    expect(packHard(input, out({ id: "a", x: 0, y: 0, w: 20 }))["size-kept"]).toBe(1);
    expect(packHard(input, out({ id: "a", x: 0, y: 0, w: 10 }))["size-kept"]).toBe(0);
  });

  it("counts the overlaps and the container with the new size", () => {
    const input: LayoutInput = { schema: "layout-input/1", id: "i", container: { fixed: "size", w: 320, h: 100 }, boxes: [grow, { id: "a", w: 10, h: 10 }] };
    const output: PackOutput = { placements: [{ id: "g", x: 0, y: 0, w: 300 }, { id: "a", x: 200, y: 10 }], overflow: [], size: { w: 320, h: 100 }, moved: [] };
    expect(packHard(input, output)).toMatchObject({ "no-overlap": 1, "in-container": 0, "size-kept": 0 });
    const wide = { ...output, placements: [{ id: "g", x: 30, y: 0, w: 300 }, { id: "a", x: 0, y: 60 }] };
    expect(packHard(input, wide)).toMatchObject({ "no-overlap": 0, "in-container": 1, "size-kept": 0 });
  });
});

describe("resizeProblems", () => {
  it("accepts a good resize and a box without one", () => {
    expect(resizeProblems(grow)).toEqual([]);
    expect(resizeProblems({ id: "a", w: 1, h: 1 })).toEqual([]);
    expect(checkInput({ schema: "layout-input/1", id: "i", boxes: [grow] })).toEqual([]);
  });

  it("refuses a resize on a box with a shape or another shape kind", () => {
    const disc: LayoutBox = { id: "d", w: 10, h: 10, shape: { kind: "circle", cx: 5, cy: 5, r: 5 }, resize: { maxW: 20 } };
    expect(resizeProblems(disc)).toEqual(["box d: only a rect box without a shape can have a resize"]);
    expect(resizeProblems({ id: "f", w: 10, h: 10, shapeKind: "free", resize: { maxW: 20 } })).toHaveLength(1);
  });

  it("refuses a bad bound, a bad aspect and a size outside the bounds", () => {
    const bad = { id: "b", w: 100, h: 40, resize: { minW: 0, maxH: Number.NaN, aspect: "fit" } } as unknown as LayoutBox;
    expect(resizeProblems(bad)).toEqual([
      "box b: the resize bound minW 0 is not positive and finite",
      "box b: the resize bound maxH NaN is not positive and finite",
      "box b: the resize aspect fit is not keep or free",
      "box b: the height 40 is not in the resize bounds 40 to NaN",
    ]);
    expect(resizeProblems({ id: "s", w: 100, h: 40, resize: { minW: 120, maxW: 200 } })).toEqual(["box s: the width 100 is not in the resize bounds 120 to 200"]);
    expect(checkInput({ schema: "layout-input/1", id: "i", boxes: [{ id: "s", w: 100, h: 40, resize: { maxH: 30 } }] })).toEqual(["box s: the height 40 is not in the resize bounds 40 to 30"]);
  });
});

describe("the form of an output with a size", () => {
  it("has the size of a placement only when the packer set it", () => {
    const plain = out({ id: "a", x: 1, y: 2 });
    expect(packOutputForm(plain)).toEqual({ placements: [{ id: "a", x: 1, y: 2, turn: 0 }], overflow: [], size: { w: 1000, h: 1000 }, moved: [] });
    const sized = out({ id: "a", x: 1, y: 2, w: 5, h: 6 });
    expect((packOutputForm(sized) as { placements: unknown[] }).placements).toEqual([{ id: "a", x: 1, y: 2, turn: 0, w: 5, h: 6 }]);
    expect(outputHash(packOutputForm(sized))).not.toBe(outputHash(packOutputForm(plain)));
    expect(outputHash(packOutputForm(out({ id: "a", x: 1, y: 2, w: 5 })))).not.toBe(outputHash(packOutputForm(out({ id: "a", x: 1, y: 2, h: 5 }))));
  });
});

describe("a placement with a shape", () => {
  const cell: LayoutBox = { id: "c", w: 40, h: 30, resize: { maxW: 80, maxH: 60, reshape: true } };
  const tri = { kind: "polygon" as const, points: [[0, 0], [60, 0], [0, 50]] as [number, number][] };
  const input: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [cell, { id: "a", w: 10, h: 10 }] };

  it("gives the placed box the shape, and the kind of the shape", () => {
    const boxed: LayoutInput = { ...input, boxes: [{ ...cell, shapeKind: "rect" }] };
    const placed = applyPack(boxed, out({ id: "c", x: 5, y: 6, w: 60, h: 50, shape: tri })).boxes[0]!;
    expect(placed).toMatchObject({ x: 5, y: 6, w: 60, h: 50, shape: tri });
    expect(placed.shapeKind).toBeUndefined();
    expect(shapeKindOf(placed)).toBe("polygon");
  });

  it("keeps size-kept at 0 for a shape inside the size of a reshape box", () => {
    expect(shapeFits(cell, tri, 60, 50)).toBe(true);
    expect(packHard(input, out({ id: "c", x: 0, y: 0, w: 60, h: 50, shape: tri }, { id: "a", x: 500, y: 500 }))["size-kept"]).toBe(0);
  });

  it("counts a shape on a box without reshape, and a shape outside the size", () => {
    expect(shapeFits({ ...cell, resize: { maxW: 80, maxH: 60 } }, tri, 60, 50)).toBe(false);
    expect(countResizeBreaks(input, out({ id: "a", x: 0, y: 0, shape: { kind: "rect", x: 0, y: 0, w: 10, h: 10 } }))).toBe(1);
    expect(shapeFits(cell, tri, 59, 50)).toBe(false);
    expect(shapeFits(cell, { kind: "polygon", points: [[-1, 0], [10, 0], [0, 10]] }, 60, 50)).toBe(false);
    // The shape keeps the size of the box without w and h: 60 by 50 is outside 40 by 30.
    expect(countResizeBreaks(input, out({ id: "c", x: 0, y: 0, shape: tri }))).toBe(1);
  });

  it("counts a placement one time when its size and its shape both break", () => {
    expect(countResizeBreaks(input, out({ id: "c", x: 0, y: 0, w: 90, h: 50, shape: { kind: "polygon", points: [[0, 0], [95, 0], [0, 50]] } }))).toBe(1);
  });

  it("reads the turned size of a turned placement", () => {
    const turnable: LayoutInput = { schema: "layout-input/1", id: "i", boxes: [{ ...cell, turnable: true }] };
    const tall = { kind: "polygon" as const, points: [[0, 0], [50, 0], [0, 70]] as [number, number][] };
    expect(countResizeBreaks(turnable, out({ id: "c", x: 0, y: 0, turn: 90, w: 50, h: 70, shape: tall }))).toBe(0);
    expect(countResizeBreaks(turnable, out({ id: "c", x: 0, y: 0, w: 50, h: 70, shape: tall }))).toBe(1);
  });

  it("is in the form of an output only when the packer set it", () => {
    const plain = out({ id: "c", x: 1, y: 2, w: 60, h: 50 });
    const shaped = out({ id: "c", x: 1, y: 2, w: 60, h: 50, shape: tri });
    expect((packOutputForm(plain) as { placements: unknown[] }).placements).toEqual([{ id: "c", x: 1, y: 2, turn: 0, w: 60, h: 50 }]);
    expect((packOutputForm(shaped) as { placements: unknown[] }).placements).toEqual([{ id: "c", x: 1, y: 2, turn: 0, w: 60, h: 50, shape: tri }]);
    expect(outputHash(packOutputForm(shaped))).not.toBe(outputHash(packOutputForm(plain)));
  });

  it("refuses a reshape value that is not true or false", () => {
    const bad = { id: "b", w: 10, h: 10, resize: { reshape: "yes" } } as unknown as LayoutBox;
    expect(resizeProblems(bad)).toEqual(["box b: the resize reshape yes is not true or false"]);
    expect(resizeProblems(cell)).toEqual([]);
  });
});
