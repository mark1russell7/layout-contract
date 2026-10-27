import { SIDES, marginSides, type Margin, type Region, type Side } from "./geometry.ts";
import type { LayoutBox, Port } from "./input.ts";

/*
 * The turn: 90 degrees clockwise, with the y axis down. The turned box has `w` and `h` swapped,
 * and its top-left corner stays at the position of the box. A point (px, py) of a box of height h
 * goes to (h - py, px). Thus the top-left corner goes to the top-right corner, and each side moves
 * one step clockwise: top to right, right to bottom, bottom to left, left to top.
 */

/** This function gives the side after a turn of 90 degrees clockwise. */
export function turnSide(side: Side): Side {
  return SIDES[(SIDES.indexOf(side) + 1) % 4]!;
}

/** This function gives a point of a box of height `h` after the turn. */
export function turnPoint(x: number, y: number, h: number): [number, number] {
  return [h - y, x];
}

/** This function gives a port of a box of height `h` after the turn. Each value of the port turns, also a port with only `x` or only `y`. */
export function turnPort(port: Port, h: number): Port {
  const { side, x, y, ...rest } = port;
  return {
    ...rest,
    ...(side === undefined ? {} : { side: turnSide(side) }),
    ...(y === undefined ? {} : { x: h - y }),
    ...(x === undefined ? {} : { y: x }),
  };
}

/** This function gives a margin after the turn: the value of each side moves one side clockwise. */
export function turnMargin(margin: Margin): Margin {
  if (typeof margin === "number") return margin;
  const m = marginSides(margin);
  return { top: m.left, right: m.top, bottom: m.right, left: m.bottom };
}

/** This function gives a region relative to the origin of a box of height `h` after the turn. */
export function turnRegion(region: Region, h: number): Region {
  switch (region.kind) {
    case "rect":
      return { kind: "rect", x: h - region.y - region.h, y: region.x, w: region.h, h: region.w };
    case "circle":
      return { ...region, cx: h - region.cy, cy: region.cx };
    case "ellipse":
      return { kind: "ellipse", cx: h - region.cy, cy: region.cx, rx: region.ry, ry: region.rx };
    case "polygon": {
      const turn = (ring: readonly (readonly [number, number])[]): [number, number][] => ring.map(([x, y]) => turnPoint(x, y, h));
      return region.holes === undefined
        ? { kind: "polygon", points: turn(region.points) }
        : { kind: "polygon", points: turn(region.points), holes: region.holes.map(turn) };
    }
  }
}

/** This function gives a box after the turn: the size, the ports, the margin and the shape turn. The position stays. */
export function turnBox(box: LayoutBox): LayoutBox {
  return {
    ...box,
    w: box.h,
    h: box.w,
    ...(box.ports === undefined ? {} : { ports: box.ports.map((p) => turnPort(p, box.h)) }),
    ...(box.margin === undefined ? {} : { margin: turnMargin(box.margin) }),
    ...(box.shape === undefined ? {} : { shape: turnRegion(box.shape, box.h) }),
  };
}
