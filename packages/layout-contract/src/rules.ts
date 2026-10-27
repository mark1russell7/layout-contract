import { boundsOf, grow, overlapOf, type Rect } from "./geometry.ts";
import type { LayoutBox, LayoutInput } from "./input.ts";
import { DEFAULT_TOLERANCE, RECORD_EPS } from "./tolerance.ts";

/** This function gives the area of a placed box: its shape or its rectangle, at its position. A box without a position gives `undefined`. */
export function placedRect(box: LayoutBox): Rect | undefined {
  if (box.x === undefined || box.y === undefined) return undefined;
  if (box.shape === undefined) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const b = boundsOf(box.shape);
  return { x: box.x + b.x, y: box.y + b.y, w: b.w, h: b.h };
}

/**
 * This function counts the pairs of placed boxes whose insides, with their margins, overlap by more than `tolerance` on each axis.
 * A box with a shape counts as its bounding box. That area is larger, thus the count is safe.
 */
export function countOverlaps(boxes: readonly LayoutBox[], tolerance: number = DEFAULT_TOLERANCE.overlap): number {
  const rects: Rect[] = [];
  for (const box of boxes) {
    const r = placedRect(box);
    if (r !== undefined) rects.push(grow(r, box.margin));
  }
  rects.sort((a, b) => a.x - b.x);
  let count = 0;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]!;
      if (b.x >= a.x + a.w - tolerance) break;
      const o = overlapOf(a, b);
      if (o.x > tolerance && o.y > tolerance) count++;
    }
  }
  return count;
}

/**
 * This function counts the placed boxes that go out of the container: each box with its margin must stay inside
 * the container made smaller by `inset`. Only the fixed sides of the size count. A shaped container counts as its bounding box.
 */
export function countOutside(input: LayoutInput, tolerance: number = DEFAULT_TOLERANCE.overlap): number {
  const c = input.container;
  const area = c.shape === undefined ? { x: 0, y: 0, w: c.w ?? Infinity, h: c.h ?? Infinity } : boundsOf(c.shape);
  const inset = c.inset ?? 0;
  const fixW = c.fixed === "size" || c.fixed === "width";
  const fixH = c.fixed === "size" || c.fixed === "height";
  let count = 0;
  for (const box of input.boxes) {
    const r0 = placedRect(box);
    if (r0 === undefined) continue;
    const r = grow(r0, box.margin);
    const outX = r.x < area.x + inset - tolerance || r.x + r.w > area.x + area.w - inset + tolerance;
    const outY = r.y < area.y + inset - tolerance || r.y + r.h > area.y + area.h - inset + tolerance;
    if ((fixW && outX) || (fixH && outY)) count++;
  }
  return count;
}

/** This function counts the fixed ports that are not on the border of their box, with the epsilon of a written file. */
export function countPortsOffBorder(boxes: readonly LayoutBox[], eps: number = RECORD_EPS): number {
  let count = 0;
  for (const box of boxes) {
    for (const p of box.ports ?? []) {
      if (p.x === undefined || p.y === undefined) continue;
      const along = p.side === "top" || p.side === "bottom" ? p.x : p.y;
      const length = p.side === "top" || p.side === "bottom" ? box.w : box.h;
      const across = { top: p.y, bottom: p.y - box.h, left: p.x, right: p.x - box.w }[p.side];
      if (Math.abs(across) > eps || along < -eps || along > length + eps) count++;
    }
  }
  return count;
}

/** The count of the breaks of each hard rule of a pack. */
export interface PackHard {
  readonly "no-overlap": number;
  readonly "in-container": number;
  readonly "locked-kept": number;
  readonly complete: number;
}

/**
 * This function gives the count of each hard rule of a pack.
 * `before` is the input of the packer, `after` is the result of `applyPack`, and `overflow` lists the boxes that the packer did not place.
 */
export function packHard(
  before: LayoutInput,
  after: LayoutInput,
  overflow: readonly string[],
  tolerance: number = DEFAULT_TOLERANCE.overlap,
): PackHard {
  const was = new Map(before.boxes.map((b) => [b.id, b]));
  const out = new Set(overflow);
  let lockedMoved = 0;
  let incomplete = 0;
  for (const box of after.boxes) {
    const old = was.get(box.id);
    if (old?.locked === true && (Math.abs((old.x ?? 0) - (box.x ?? 0)) > tolerance || Math.abs((old.y ?? 0) - (box.y ?? 0)) > tolerance)) lockedMoved++;
    if ((box.x === undefined || box.y === undefined) && !out.has(box.id)) incomplete++;
  }
  return {
    "no-overlap": countOverlaps(after.boxes, tolerance),
    "in-container": countOutside(after, tolerance),
    "locked-kept": lockedMoved,
    complete: incomplete,
  };
}
