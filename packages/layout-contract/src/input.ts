import type { Margin, Region, Side } from "./geometry.ts";

/**
 * A port of a box: a place where edges go into the box.
 * With `x` and `y`, the port is fixed on the border of the box, relative to its top-left corner.
 * Without them, the router places the port on its `side`.
 */
export interface Port {
  readonly id: string;
  readonly side: Side;
  readonly x?: number;
  readonly y?: number;
}

/** A box of an input. In the packer, its name is item. */
export interface LayoutBox {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  /** The packer writes the position. The router reads it. */
  readonly x?: number;
  readonly y?: number;
  /** A locked box keeps `x` and `y`. The packer reads it as an obstacle. */
  readonly locked?: boolean;
  /** The reading order. Without it, the order of the array is the rank. */
  readonly rank?: number;
  readonly parent?: string;
  readonly group?: string;
  /** A region relative to the origin of the box. Without it, the box is the rectangle `w` by `h`. */
  readonly shape?: Region;
  readonly ports?: readonly Port[];
  /** A ring around the box. No other box enters it. Only a route from a port of the box enters it, at a right angle. */
  readonly margin?: Margin;
  /** The packer can turn the box by 90 degrees. The output has the turned box and ports. */
  readonly turnable?: boolean;
}

/** The packer name of a box. It is the same type. */
export type Item = LayoutBox;

/** An edge between two boxes, with optional ports. */
export interface LayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourcePort?: string;
  readonly targetPort?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** The container. `fixed` tells which sides of the size stay. */
export interface LayoutContainer {
  readonly w?: number;
  readonly h?: number;
  readonly fixed: "size" | "width" | "height" | "none";
  /** The target aspect: the width divided by the height. The default is 1. */
  readonly aspect?: number;
  /** The weight of the aspect error in the objective. 0 gives the least area. The default is 1. */
  readonly aspectWeight?: number;
  /** The shape. Without it, the container is the rectangle from 0, 0 to `w`, `h`. */
  readonly shape?: Region;
  /** The space between the border and the boxes with their margins. */
  readonly inset?: number;
}

/** An area that boxes and routes avoid. Without `move`, it stays. With `move`, the packer can move it for `cost` times the distance. */
export interface Obstacle {
  readonly id: string;
  readonly region: Region;
  readonly move?: { readonly cost: number };
}

/** An input of the corpus: the format `layout-input/1`. */
export interface LayoutInput {
  readonly schema: "layout-input/1";
  readonly id: string;
  readonly set?: string;
  readonly family?: string;
  readonly seed?: number;
  /** The origin: `made-up`, `published:<set>` or `known-best:<construction>`. */
  readonly source?: string;
  /** The first 16 hex characters of the SHA-256 of the canonical file without this field. */
  readonly hash?: string;
  readonly container: LayoutContainer;
  /** The free space between two boxes with their margins. Routes use it. */
  readonly gap?: number;
  readonly boxes: readonly LayoutBox[];
  readonly edges?: readonly LayoutEdge[];
  readonly obstacles?: readonly Obstacle[];
  /** A variant names its base input and its change. */
  readonly base?: string;
  readonly change?: "add" | "remove" | "resize" | "reorder";
}

/** The input of a packer: a `layout-input/1` file without the edges. */
export interface PackInput {
  readonly container: LayoutContainer;
  readonly items: readonly Item[];
  readonly obstacles?: readonly Obstacle[];
  readonly gap?: number;
}

/** This function gives the packer input of a file. */
export function toPackInput(input: LayoutInput): PackInput {
  return {
    container: input.container,
    items: input.boxes,
    ...(input.obstacles === undefined ? {} : { obstacles: input.obstacles }),
    ...(input.gap === undefined ? {} : { gap: input.gap }),
  };
}
