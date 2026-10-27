import { boundsOf, translate } from "./geometry.ts";
import type { LayoutInput } from "./input.ts";
import { turnBox } from "./turn.ts";

/** The position of one item. `turn` is 90 when the packer turned a turnable item. */
export interface Placement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly turn?: 0 | 90;
}

/** The facts of one stage of a strategy, for the records and the site. */
export interface StageTrace {
  readonly id: string;
  readonly ms?: number;
  readonly measures?: Readonly<Record<string, number>>;
}

/** The output of a packer. It does not change the input. */
export interface PackOutput {
  readonly placements: readonly Placement[];
  /** The ids of the items that the packer did not place. */
  readonly overflow: readonly string[];
  /** The size of the container after the pack. For a free size, the size that the search found. */
  readonly size: { readonly w: number; readonly h: number };
  /** The new top-left corner of the bounding box of each obstacle that moved. */
  readonly moved: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly trace?: readonly StageTrace[];
}

/**
 * This function gives the input with the output of a packer applied. Each placed box gets its position.
 * A turned box gets its turned size, ports, margin and shape. Each moved obstacle moves.
 * The container gets the size of the output. The router reads this result. It does not read `turn`.
 */
export function applyPack(input: LayoutInput, output: PackOutput): LayoutInput {
  const at = new Map(output.placements.map((p) => [p.id, p]));
  const moved = new Map(output.moved.map((m) => [m.id, m]));
  const boxes = input.boxes.map((box) => {
    const p = at.get(box.id);
    if (p === undefined) return box;
    const turned = p.turn === 90 ? turnBox(box) : box;
    return { ...turned, x: p.x, y: p.y };
  });
  const obstacles = input.obstacles?.map((o) => {
    const m = moved.get(o.id);
    if (m === undefined) return o;
    const b = boundsOf(o.region);
    return { ...o, region: translate(o.region, m.x - b.x, m.y - b.y) };
  });
  return {
    ...input,
    container: { ...input.container, w: output.size.w, h: output.size.h },
    boxes,
    ...(obstacles === undefined ? {} : { obstacles }),
  };
}
