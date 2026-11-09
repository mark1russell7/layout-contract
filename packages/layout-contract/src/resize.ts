// The resize of a box (`LayoutBox.resize`): the sizes that a packer can give a box, and the box at a new size.
import type { LayoutBox, Port } from "./input.ts";
import { shapeKindOf } from "./shapes.ts";
import { RECORD_EPS } from "./tolerance.ts";

/** The bounds of the size of a box, with each value set. */
export interface SizeBounds {
  readonly minW: number;
  readonly maxW: number;
  readonly minH: number;
  readonly maxH: number;
  /** With `keep`, the ratio of the width to the height stays the ratio of `w` to `h` of the box. */
  readonly aspect: "keep" | "free";
}

/** The names of the bounds of a resize. */
const BOUNDS = ["minW", "maxW", "minH", "maxH"] as const;

/**
 * This function gives the bounds of the size of a box. A bound that `resize` does not set is the size of the box.
 * A box without `resize` gives the bounds of its own size, so it keeps its size.
 */
export function sizeBoundsOf(box: LayoutBox): SizeBounds {
  const r = box.resize;
  return {
    minW: r?.minW ?? box.w,
    maxW: r?.maxW ?? box.w,
    minH: r?.minH ?? box.h,
    maxH: r?.maxH ?? box.h,
    aspect: r?.aspect ?? "free",
  };
}

/**
 * This function tells if a size is in the bounds of a box, with the tolerance `RECORD_EPS` of the records.
 * With the aspect `keep`, the ratio of `w` to `h` also stays the ratio of the box, in the same tolerance.
 * A size that is not positive and finite is not in the bounds.
 */
export function sizeFits(box: LayoutBox, w: number, h: number): boolean {
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) return false;
  const b = sizeBoundsOf(box);
  if (w < b.minW - RECORD_EPS || w > b.maxW + RECORD_EPS || h < b.minH - RECORD_EPS || h > b.maxH + RECORD_EPS) return false;
  // A grid step of RECORD_EPS on w and h moves w * box.h - h * box.w by up to RECORD_EPS * (box.w + box.h).
  return b.aspect === "free" || Math.abs(w * box.h - h * box.w) <= RECORD_EPS * (box.w + box.h);
}

/** This function gives a port of a box of the size `w` by `h` after a resize to `toW` by `toH`. A port with `along` keeps its value. */
function resizePort(port: Port, w: number, h: number, toW: number, toH: number): Port {
  return {
    ...port,
    ...(port.x === undefined ? {} : { x: (port.x * toW) / w }),
    ...(port.y === undefined ? {} : { y: (port.y * toH) / h }),
  };
}

/**
 * This function gives a box at the size `w` by `h`. The position, the margin and the other fields stay.
 * A port with `x` or `y` moves with the scale of its axis. A port with `along` keeps its place on its side.
 * The function does not test the bounds: `sizeFits` does. A box with a shape is a bad input for a resize (`resizeProblems`).
 */
export function resizeBox(box: LayoutBox, w: number, h: number): LayoutBox {
  if (w === box.w && h === box.h) return box;
  return {
    ...box,
    w,
    h,
    ...(box.ports === undefined ? {} : { ports: box.ports.map((p) => resizePort(p, box.w, box.h, w, h)) }),
  };
}

/**
 * This function gives the problems of the `resize` of a box. A box without `resize` has no problem.
 * Only a `rect` box without a shape can have a resize. Each bound is a positive finite number.
 * The size of the box is in its bounds, and `aspect` is `keep` or `free`.
 */
export function resizeProblems(box: LayoutBox): string[] {
  const r = box.resize;
  if (r === undefined) return [];
  const at = `box ${box.id}`;
  if (typeof r !== "object" || r === null) return [`${at}: the resize is not an object`];
  const problems: string[] = [];
  if (box.shape !== undefined || shapeKindOf(box) !== "rect") problems.push(`${at}: only a rect box without a shape can have a resize`);
  for (const k of BOUNDS) {
    const v = r[k];
    if (v !== undefined && !(typeof v === "number" && v > 0 && Number.isFinite(v))) problems.push(`${at}: the resize bound ${k} ${String(v)} is not positive and finite`);
  }
  if (r.aspect !== undefined && r.aspect !== "keep" && r.aspect !== "free") problems.push(`${at}: the resize aspect ${String(r.aspect)} is not keep or free`);
  const b = sizeBoundsOf(box);
  if (!(b.minW <= box.w && box.w <= b.maxW)) problems.push(`${at}: the width ${box.w} is not in the resize bounds ${b.minW} to ${b.maxW}`);
  if (!(b.minH <= box.h && box.h <= b.maxH)) problems.push(`${at}: the height ${box.h} is not in the resize bounds ${b.minH} to ${b.maxH}`);
  return problems;
}
