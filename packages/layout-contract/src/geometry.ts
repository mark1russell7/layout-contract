/** A side of a box. The y axis points down, so `top` has the smallest y. */
export type Side = "top" | "right" | "bottom" | "left";

/** The sides in clockwise order, from the top. */
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle: its top-left corner and its size. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A value for each side of a box. */
export interface Sides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * A region. The forms and the rules are those of `docs/FORMAT.md` of `packing`.
 * A ring of a polygon closes without a copy of its first point.
 */
export type Region =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | {
      readonly kind: "polygon";
      readonly points: readonly (readonly [number, number])[];
      readonly holes?: readonly (readonly (readonly [number, number])[])[];
    }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };

/** A margin: one value for the four sides, or one value for each side. */
export type Margin = number | Sides;

/** This function gives the value of each side of a margin. No margin gives 0 on each side. */
export function marginSides(margin: Margin | undefined): Sides {
  if (margin === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof margin === "number") return { top: margin, right: margin, bottom: margin, left: margin };
  return margin;
}

/** This function gives the rectangle made larger by the margin on each side. */
export function grow(rect: Rect, margin: Margin | undefined): Rect {
  const m = marginSides(margin);
  return { x: rect.x - m.left, y: rect.y - m.top, w: rect.w + m.left + m.right, h: rect.h + m.top + m.bottom };
}

/** This function gives the bounding box of a region. */
export function boundsOf(region: Region): Rect {
  switch (region.kind) {
    case "rect":
      return { x: region.x, y: region.y, w: region.w, h: region.h };
    case "circle":
      return { x: region.cx - region.r, y: region.cy - region.r, w: 2 * region.r, h: 2 * region.r };
    case "ellipse":
      return { x: region.cx - region.rx, y: region.cy - region.ry, w: 2 * region.rx, h: 2 * region.ry };
    case "polygon": {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of region.points) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  }
}

/** This function gives the region moved by `dx` and `dy`. */
export function translate(region: Region, dx: number, dy: number): Region {
  switch (region.kind) {
    case "rect":
      return { ...region, x: region.x + dx, y: region.y + dy };
    case "circle":
    case "ellipse":
      return { ...region, cx: region.cx + dx, cy: region.cy + dy };
    case "polygon": {
      const move = (ring: readonly (readonly [number, number])[]): [number, number][] => ring.map(([x, y]) => [x + dx, y + dy]);
      return region.holes === undefined
        ? { kind: "polygon", points: move(region.points) }
        : { kind: "polygon", points: move(region.points), holes: region.holes.map(move) };
    }
  }
}

/**
 * This function gives the overlap of the insides of two rectangles on each axis.
 * A value of 0 or less on an axis is no overlap. Two rectangles with a common edge have an overlap of 0.
 */
export function overlapOf(a: Rect, b: Rect): { readonly x: number; readonly y: number } {
  return {
    x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}
