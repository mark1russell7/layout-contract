// The frames of a layout change (`docs/FRAMES.md`): the record `layout-frame/1`, the frame at a time between two layouts, and the move between two frames.
// A frame is a layout at one time of a change. A caller can stop at a frame and start the next layout from it.
import type { PlacedBox } from "./balance.ts";
import { boxCenterDistance } from "./geometry.ts";
import type { Placement } from "./output.ts";

/** The schema of a frame. */
export const FRAME_SCHEMA = "layout-frame/1";

/** The states of a box in a frame: in the two layouts, only in the end layout, or only in the start layout. */
export const FRAME_STATES = ["stay", "enter", "leave"] as const;

/** The state of a box in a frame. */
export type FrameState = (typeof FRAME_STATES)[number];

/** One box of a frame: its rectangle, its turn, its presence and its state. */
export interface FrameBox extends PlacedBox {
  readonly turn?: 0 | 90;
  /** The visible share of the box, from 0 (not visible) to 1 (fully visible). */
  readonly presence: number;
  readonly state: FrameState;
}

/** A frame: the boxes of a layout by id, at one time of a change. Each id occurs one time. */
export interface LayoutFrame {
  readonly schema: typeof FRAME_SCHEMA;
  readonly boxes: readonly FrameBox[];
}

/**
 * The change of the presence of a box that enters or leaves.
 * With `fade`, the presence changes in a straight line with the time.
 * With `cut`, an entering box is fully visible after the time 0, and a leaving box is fully visible before the time 1.
 */
export type Presence = "fade" | "cut";

/** The options of `frameAt`. The default of each is `fade`. */
export interface FrameAtOptions {
  readonly enter?: Presence;
  readonly leave?: Presence;
}

/** One box of a layout for `frameOf`: a placed rectangle, with an optional turn. */
export interface FrameSource extends PlacedBox {
  readonly turn?: 0 | 90;
}

/** This function throws a `RangeError` for a value that is not a finite number. */
function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`layout-frame: the ${name} ${value} is not a finite number.`);
}

/** This function gives the boxes of a frame by id. An id two times or a bad value causes a `RangeError`. */
function byId(frame: LayoutFrame, name: string): Map<string, FrameBox> {
  if (frame.schema !== FRAME_SCHEMA) throw new RangeError(`layout-frame: the ${name} frame has the schema ${String(frame.schema)}, not ${FRAME_SCHEMA}.`);
  const map = new Map<string, FrameBox>();
  for (const b of frame.boxes) {
    if (map.has(b.id)) throw new RangeError(`layout-frame: the id ${b.id} occurs two times in the ${name} frame.`);
    for (const k of ["x", "y", "w", "h", "presence"] as const) finite(b[k], `${k} of ${b.id}`);
    if (b.presence < 0 || b.presence > 1) throw new RangeError(`layout-frame: the presence ${b.presence} of ${b.id} is not between 0 and 1.`);
    if (b.turn !== undefined && b.turn !== 0 && b.turn !== 90) throw new RangeError(`layout-frame: the turn ${String(b.turn)} of ${b.id} is not 0 or 90.`);
    if (!FRAME_STATES.includes(b.state)) throw new RangeError(`layout-frame: the state ${String(b.state)} of ${b.id} is not one of ${FRAME_STATES.join(", ")}.`);
    map.set(b.id, b);
  }
  return map;
}

/** This function gives a box with the optional turn of `turn`. */
function withTurn(box: Omit<FrameBox, "turn">, turn: 0 | 90 | undefined): FrameBox {
  return turn === undefined ? box : { ...box, turn };
}

/** This function makes a frame of a layout. Each box has the state `stay` and the presence 1. */
export function frameOf(boxes: readonly FrameSource[]): LayoutFrame {
  const frame: LayoutFrame = {
    schema: FRAME_SCHEMA,
    boxes: boxes.map((b) => withTurn({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, presence: 1, state: "stay" }, b.turn)),
  };
  byId(frame, "made");
  return frame;
}

/** This function gives the placements of a frame: the boxes with the state `stay` or `enter`, in the order of the frame. An engine starts a layout from them. */
export function outputOf(frame: LayoutFrame): Placement[] {
  byId(frame, "given");
  return frame.boxes.filter((b) => b.state !== "leave").map((b) => (b.turn === undefined ? { id: b.id, x: b.x, y: b.y } : { id: b.id, x: b.x, y: b.y, turn: b.turn }));
}

/** This function gives the presence of a box that enters (`up`) or leaves, at the time `t`. */
function presenceAt(mode: Presence, up: boolean, from: number, t: number): number {
  const to = up ? 1 : 0;
  if (mode === "fade") return from + (to - from) * t;
  if (up) return t > 0 ? 1 : from;
  return t < 1 ? from : 0;
}

/**
 * This function gives the frame at the time `t` of the change from `from` to `to`. The time is a number from 0 to 1.
 * A box in the two frames moves on a straight line, and its size and presence change on a straight line. It keeps the turn of `from` before the time 1.
 *
 * A box only in `to` enters at its place in `to`. A box only in `from` leaves at its place in `from`. `options` sets how their presence changes.
 * At the time 1, the result has the boxes of `to`. At the time 0, the result has the boxes of `from` and the entering boxes.
 * The order of the result: the boxes of `to`, then the leaving boxes in the order of `from`.
 */
export function frameAt(from: LayoutFrame, to: LayoutFrame, t: number, options: FrameAtOptions = {}): LayoutFrame {
  finite(t, "time");
  if (t < 0 || t > 1) throw new RangeError(`layout-frame: the time ${t} is not between 0 and 1.`);
  const a = byId(from, "start");
  byId(to, "end");
  if (t === 1) return { schema: FRAME_SCHEMA, boxes: [...to.boxes] };
  const enter = options.enter ?? "fade";
  const leave = options.leave ?? "fade";
  const lerp = (p: number, q: number): number => p + (q - p) * t;
  const boxes: FrameBox[] = [];
  const seen = new Set<string>();
  for (const q of to.boxes) {
    seen.add(q.id);
    const p = a.get(q.id);
    if (p === undefined) {
      boxes.push({ ...q, presence: presenceAt(enter, true, 0, t), state: "enter" });
      continue;
    }
    const state: FrameState = p.state === "stay" ? q.state : p.state;
    const presence = p.state === "enter" ? presenceAt(enter, true, p.presence, t) : p.state === "leave" && q.state === "leave" ? presenceAt(leave, false, p.presence, t) : lerp(p.presence, q.presence);
    boxes.push(withTurn({ id: q.id, x: lerp(p.x, q.x), y: lerp(p.y, q.y), w: lerp(p.w, q.w), h: lerp(p.h, q.h), presence, state }, p.turn));
  }
  for (const p of from.boxes) {
    if (seen.has(p.id)) continue;
    boxes.push({ ...p, presence: presenceAt(leave, false, p.presence, t), state: "leave" });
  }
  return { schema: FRAME_SCHEMA, boxes };
}

/**
 * This function gives the move from `a` to `b`: the sum of the distances of the box centers, over the ids in the two frames.
 * A box that enters or leaves does not move, so it adds nothing. A start frame that an engine does not change gives 0.
 */
export function frameMove(a: LayoutFrame, b: LayoutFrame): number {
  const before = byId(a, "first");
  byId(b, "second");
  let sum = 0;
  for (const q of b.boxes) {
    const p = before.get(q.id);
    if (p === undefined) continue;
    sum += boxCenterDistance(p, q);
  }
  return sum;
}

/**
 * This function gives the move of an engine from a start frame: `frameMove(start, run(start))`.
 * The gate of a start: a start that is a fixed point of the engine gives 0.
 */
export function fixedPointMove(start: LayoutFrame, run: (start: LayoutFrame) => LayoutFrame): number {
  return frameMove(start, run(start));
}
