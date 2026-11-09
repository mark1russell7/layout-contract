import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FRAME_SCHEMA, type FrameAtOptions, frameAt, frameMove, frameOf, type FrameSource, fixedPointMove, type LayoutFrame, outputOf, type Presence } from "./index.ts";

// The laws of `docs/FRAMES.md`, as property tests over generated pairs of layouts.
// Each pair has boxes in the two layouts, boxes that enter and boxes that leave.

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

/** A box of a layout, without its id. */
const box = fc.record({
  x: fc.integer({ min: -500, max: 500 }),
  y: fc.integer({ min: -500, max: 500 }),
  w: fc.integer({ min: 1, max: 80 }),
  h: fc.integer({ min: 1, max: 80 }),
  turn: fc.constantFrom<0 | 90 | undefined>(undefined, 0, 90),
});

/** This function gives a box with the id `id`. A box with no turn has no field `turn`. */
const withId = (id: string, { turn, ...r }: { x: number; y: number; w: number; h: number; turn: 0 | 90 | undefined }): FrameSource =>
  turn === undefined ? { id, ...r } : { id, ...r, turn };

/** A pair of layouts: each id is in the two layouts, in one of them, or in none. The end layout has its boxes in a turned order. */
const pair: fc.Arbitrary<[LayoutFrame, LayoutFrame]> = fc
  .tuple(
    fc.array(fc.tuple(fc.constantFrom("both", "from", "to", "none"), box, box), { minLength: IDS.length, maxLength: IDS.length }),
    fc.nat({ max: IDS.length }),
  )
  .map(([rows, turnBy]) => {
    const from = rows.flatMap(([m, p], i) => (m === "both" || m === "from" ? [withId(IDS[i]!, p)] : []));
    const to = rows.flatMap(([m, , q], i) => (m === "both" || m === "to" ? [withId(IDS[i]!, q)] : []));
    const turned = to.map((_, i) => to[(i + turnBy) % to.length]!);
    return [frameOf(from), frameOf(turned)];
  });

const presence: fc.Arbitrary<FrameAtOptions> = fc.record({ enter: fc.constantFrom<Presence>("fade", "cut"), leave: fc.constantFrom<Presence>("fade", "cut") });

/** A time from 0 to 0.99, so that a composed time stays below 1. */
const time = fc.double({ min: 0, max: 0.99, noNaN: true });

/** This function examines that two frames have the same boxes in the same order, with numbers equal to 1e-9 of their size. */
function expectSame(actual: LayoutFrame, expected: LayoutFrame): void {
  expect(actual.boxes.map((b) => [b.id, b.state, b.turn])).toEqual(expected.boxes.map((b) => [b.id, b.state, b.turn]));
  actual.boxes.forEach((b, i) => {
    const e = expected.boxes[i]!;
    for (const k of ["x", "y", "w", "h", "presence"] as const) expect(Math.abs(b[k] - e[k]), `${b.id}.${k}`).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(e[k])));
  });
}

describe("frameAt", () => {
  it("gives the end layout at the time 1", () => {
    fc.assert(
      fc.property(pair, presence, ([a, b], options) => {
        expect(frameAt(a, b, 1, options)).toEqual(b);
      }),
    );
  });

  it("gives the start layout at the time 0, and each entering box is not visible", () => {
    fc.assert(
      fc.property(pair, presence, ([a, b], options) => {
        const f = frameAt(a, b, 0, options);
        const start = new Map(a.boxes.map((p) => [p.id, p]));
        for (const g of f.boxes) {
          const p = start.get(g.id);
          if (p === undefined) {
            expect(g.state).toBe("enter");
            expect(g.presence).toBe(0);
          } else expect({ ...g, state: "stay" }).toEqual(p);
        }
        expect(f.boxes.filter((g) => start.has(g.id)).length).toBe(a.boxes.length);
      }),
    );
  });

  it("moves to the end at a constant rate: the move to the end at the time t is (1 - t) times the full move", () => {
    fc.assert(
      fc.property(pair, time, time, ([a, b], s, t) => {
        const full = frameMove(a, b);
        const at = (u: number): number => frameMove(frameAt(a, b, u), b);
        expect(Math.abs(at(t) - (1 - t) * full)).toBeLessThanOrEqual(1e-9 * (1 + full));
        // The move to the end does not grow with the time.
        if (s < t) expect(at(t)).toBeLessThanOrEqual(at(s) + 1e-9 * (1 + full));
      }),
    );
  });

  it("composes: the frame at the time u from the frame at the time s is the frame at the time s + u (1 - s)", () => {
    fc.assert(
      fc.property(pair, presence, time, time, ([a, b], options, s, u) => {
        expectSame(frameAt(frameAt(a, b, s, options), b, u, options), frameAt(a, b, s + u * (1 - s), options));
      }),
    );
  });

  it("keeps each presence from 0 to 1, and each id one time", () => {
    fc.assert(
      fc.property(pair, presence, fc.double({ min: 0, max: 1, noNaN: true }), ([a, b], options, t) => {
        const f = frameAt(a, b, t, options);
        for (const g of f.boxes) expect(g.presence >= 0 && g.presence <= 1).toBe(true);
        expect(new Set(f.boxes.map((g) => g.id)).size).toBe(f.boxes.length);
        // Before the time 1, the leaving boxes stay in the frame. At the time 1, the frame is the end layout.
        expect(f.boxes.length).toBe(t === 1 ? b.boxes.length : new Set([...a.boxes, ...b.boxes].map((g) => g.id)).size);
      }),
    );
  });

  it("fades a box in and out, or cuts it", () => {
    const a = frameOf([{ id: "out", x: 0, y: 0, w: 10, h: 10 }]);
    const b = frameOf([{ id: "in", x: 50, y: 0, w: 10, h: 10 }]);
    const fade = frameAt(a, b, 0.25);
    expect(fade.boxes.map((g) => [g.id, g.state, g.presence])).toEqual([
      ["in", "enter", 0.25],
      ["out", "leave", 0.75],
    ]);
    const cut = frameAt(a, b, 0.25, { enter: "cut", leave: "cut" });
    expect(cut.boxes.map((g) => g.presence)).toEqual([1, 1]);
    expect(frameAt(a, b, 0, { enter: "cut" }).boxes[0]!.presence).toBe(0);
  });

  it("refuses a bad time, a bad schema, an id two times and a value that is not finite", () => {
    const a = frameOf([{ id: "a", x: 0, y: 0, w: 1, h: 1 }]);
    expect(() => frameAt(a, a, 1.5)).toThrow(RangeError);
    expect(() => frameAt(a, a, Number.NaN)).toThrow(/finite/);
    expect(() => frameAt({ ...a, schema: "layout-frame/0" as typeof FRAME_SCHEMA }, a, 0.5)).toThrow(/schema/);
    expect(() => frameOf([a.boxes[0]!, a.boxes[0]!])).toThrow(/two times/);
    expect(() => frameOf([{ id: "a", x: Number.POSITIVE_INFINITY, y: 0, w: 1, h: 1 }])).toThrow(/finite/);
    expect(() => frameMove(a, { schema: FRAME_SCHEMA, boxes: [{ ...a.boxes[0]!, presence: 2 }] })).toThrow(/presence/);
    expect(() => frameMove(a, { schema: FRAME_SCHEMA, boxes: [{ ...a.boxes[0]!, turn: 45 as 0 }] })).toThrow(/turn/);
  });
});

describe("frameMove", () => {
  it("gives the sum of the center moves over the shared ids", () => {
    const a = frameOf([
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 0, y: 0, w: 10, h: 10 },
      { id: "c", x: 0, y: 0, w: 10, h: 10 },
    ]);
    const b = frameOf([
      { id: "a", x: 3, y: 4, w: 10, h: 10 },
      { id: "b", x: 0, y: 0, w: 20, h: 10 },
      { id: "d", x: 99, y: 99, w: 10, h: 10 },
    ]);
    // a moves 5. The center of b moves 5 when its width grows by 10. c leaves and d enters, so they add nothing.
    expect(frameMove(a, b)).toBe(10);
    expect(frameMove(b, a)).toBe(10);
    expect(frameMove(a, a)).toBe(0);
  });
});

describe("outputOf and frameOf", () => {
  it("give back the placements of a layout", () => {
    fc.assert(
      fc.property(pair, ([a]) => {
        expect(outputOf(a)).toEqual(a.boxes.map((p) => (p.turn === undefined ? { id: p.id, x: p.x, y: p.y } : { id: p.id, x: p.x, y: p.y, turn: p.turn })));
        expect(frameOf(a.boxes)).toEqual(a);
      }),
    );
  });

  it("leaves out the boxes that leave, and keeps the boxes that enter", () => {
    const a = frameOf([{ id: "out", x: 0, y: 0, w: 10, h: 10 }]);
    const b = frameOf([{ id: "in", x: 50, y: 0, w: 10, h: 10, turn: 90 }]);
    expect(outputOf(frameAt(a, b, 0.5))).toEqual([{ id: "in", x: 50, y: 0, turn: 90 }]);
  });
});

describe("fixedPointMove", () => {
  it("gives 0 for a start that the engine does not change, and the move for a start that it changes", () => {
    fc.assert(
      fc.property(pair, fc.integer({ min: 1, max: 9 }), ([a], dx) => {
        expect(fixedPointMove(a, (start) => start)).toBe(0);
        // The flip of the gate: an engine that moves each box by dx gives dx for each box.
        const shift = (start: LayoutFrame): LayoutFrame => ({ ...start, boxes: start.boxes.map((g) => ({ ...g, x: g.x + dx })) });
        expect(fixedPointMove(a, shift)).toBe(dx * a.boxes.length);
      }),
    );
  });
});
