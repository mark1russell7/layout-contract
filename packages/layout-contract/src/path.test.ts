import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkPath, cubicAt, PATH_KINDS, pathBounds, pathEnd, pathOf, type PathSegment, pathStart, type Point, pointSegmentDistance, samplePath, toSvgPath } from "./index.ts";

// The laws of the paths of `docs/PICTURE.md`, as property tests over generated paths of lines, cubic curves and arcs.

const coordinate = fc.integer({ min: -200, max: 200 });
const point: fc.Arbitrary<Point> = fc.record({ x: coordinate, y: coordinate });

/** One step of a generated path. An arc has no center and no end: the path gives them, so the arc starts at the end of the step before. */
type Step =
  | { readonly kind: "line"; readonly to: Point }
  | { readonly kind: "cubic"; readonly c1: Point; readonly c2: Point; readonly to: Point }
  | { readonly kind: "arc"; readonly radius: number; readonly start: number; readonly sweep: number };

const line: fc.Arbitrary<Step> = fc.record({ kind: fc.constant("line" as const), to: point });
const cubic: fc.Arbitrary<Step> = fc.record({ kind: fc.constant("cubic" as const), c1: point, c2: point, to: point });
const arc: fc.Arbitrary<Step> = fc.record({
  kind: fc.constant("arc" as const),
  radius: fc.integer({ min: 1, max: 120 }),
  start: fc.double({ min: -7, max: 7, noNaN: true }),
  sweep: fc.double({ min: -6, max: 6, noNaN: true }),
});

/** This function gives the path from `first` through the steps. */
function pathFrom(first: Point, steps: readonly Step[]): PathSegment[] {
  const out: PathSegment[] = [{ kind: "move", to: first }];
  let at = first;
  for (const s of steps) {
    if (s.kind !== "arc") {
      out.push(s);
      at = s.to;
      continue;
    }
    const center = { x: at.x - s.radius * Math.cos(s.start), y: at.y - s.radius * Math.sin(s.start) };
    const to = { x: center.x + s.radius * Math.cos(s.start + s.sweep), y: center.y + s.radius * Math.sin(s.start + s.sweep) };
    out.push({ kind: "arc", center, radius: s.radius, start: s.start, sweep: s.sweep, to });
    at = to;
  }
  return out;
}

/** A good path: one move, then 0 to 6 lines, cubic curves and arcs. */
const path: fc.Arbitrary<PathSegment[]> = fc.tuple(point, fc.array(fc.oneof(line, cubic, arc), { maxLength: 6 })).map(([first, steps]) => pathFrom(first, steps));

/** This function gives the point at the share `t` of one segment that starts at `from`. It does not use `samplePath`. */
function pointAt(from: Point, s: PathSegment, t: number): Point {
  if (s.kind === "cubic") return cubicAt(from, s.c1, s.c2, s.to, t);
  if (s.kind === "arc") return { x: s.center.x + s.radius * Math.cos(s.start + s.sweep * t), y: s.center.y + s.radius * Math.sin(s.start + s.sweep * t) };
  return { x: from.x + (s.to.x - from.x) * t, y: from.y + (s.to.y - from.y) * t };
}

/** This function gives `steps` + 1 points of each segment of a path, with its two ends. */
function dense(segments: readonly PathSegment[], steps = 48): Point[] {
  const out: Point[] = [segments[0]!.to];
  for (let i = 1; i < segments.length; i++) for (let k = 0; k <= steps; k++) out.push(pointAt(segments[i - 1]!.to, segments[i]!, k / steps));
  return out;
}

/** This function gives the shortest distance from a point to a polyline. */
function distanceTo(polyline: readonly Point[], p: Point): number {
  let best = Math.hypot(p.x - polyline[0]!.x, p.y - polyline[0]!.y);
  for (let i = 1; i < polyline.length; i++) best = Math.min(best, pointSegmentDistance(p, polyline[i - 1]!, polyline[i]!));
  return best;
}

const quarterArc: PathSegment[] = [
  { kind: "move", to: { x: 100, y: 0 } },
  { kind: "arc", center: { x: 0, y: 0 }, radius: 100, start: 0, sweep: Math.PI / 2, to: { x: 0, y: 100 } },
];

describe("pathOf", () => {
  it("gives a move to the first point and a line to each next point", () => {
    expect(pathOf([])).toEqual([]);
    expect(pathOf([{ x: 1, y: 2 }])).toEqual([{ kind: "move", to: { x: 1, y: 2 } }]);
    expect(pathOf([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 0 }])).toEqual([
      { kind: "move", to: { x: 1, y: 2 } },
      { kind: "line", to: { x: 3, y: 4 } },
      { kind: "line", to: { x: 5, y: 0 } },
    ]);
  });

  it("gives a good path whose polyline is the points", () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 12 }), (points) => {
        expect(checkPath(pathOf(points))).toEqual([]);
        expect(samplePath(pathOf(points))).toEqual(points);
      }),
    );
  });
});

describe("samplePath", () => {
  it("starts at the move and goes through the end of each segment, in their order", () => {
    fc.assert(
      fc.property(path, (segments) => {
        const polyline = samplePath(segments);
        expect(polyline[0]).toEqual(segments[0]!.to);
        let from = 0;
        for (const s of segments) {
          const at = polyline.indexOf(s.to, from);
          expect(at).toBeGreaterThanOrEqual(from);
          from = at + 1;
        }
        expect(from).toBe(polyline.length);
      }),
    );
  });

  it("keeps each point of the path within the tolerance of the polyline", () => {
    fc.assert(
      fc.property(path, fc.constantFrom(0.05, 0.5, 3), (segments, tolerance) => {
        const polyline = samplePath(segments, tolerance);
        for (const p of dense(segments)) expect(distanceTo(polyline, p)).toBeLessThanOrEqual(tolerance + 1e-9);
      }),
      { numRuns: 60 },
    );
  });

  it("gives fewer points for a larger tolerance", () => {
    // A quarter of a circle of radius 100: a chord of 0.2001 radians is 0.5 from the arc, and a chord of 0.6351 radians is 5 from it.
    expect(samplePath(quarterArc)).toHaveLength(9);
    expect(samplePath(quarterArc, 5)).toHaveLength(4);
    expect(samplePath(quarterArc, 100)).toHaveLength(2);
  });
});

describe("pathBounds", () => {
  it("contains each point of the path", () => {
    fc.assert(
      fc.property(path, (segments) => {
        const b = pathBounds(segments);
        for (const p of dense(segments)) {
          expect(p.x).toBeGreaterThanOrEqual(b.x - 1e-9);
          expect(p.x).toBeLessThanOrEqual(b.x + b.w + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(b.y - 1e-9);
          expect(p.y).toBeLessThanOrEqual(b.y + b.h + 1e-9);
        }
      }),
    );
  });

  it("is not larger than the box of a fine polyline, plus its tolerance", () => {
    fc.assert(
      fc.property(path, (segments) => {
        const b = pathBounds(segments);
        const fine = samplePath(segments, 0.01);
        const slack = 0.01 + 1e-6;
        expect(b.x).toBeGreaterThanOrEqual(Math.min(...fine.map((p) => p.x)) - slack);
        expect(b.y).toBeGreaterThanOrEqual(Math.min(...fine.map((p) => p.y)) - slack);
        expect(b.x + b.w).toBeLessThanOrEqual(Math.max(...fine.map((p) => p.x)) + slack);
        expect(b.y + b.h).toBeLessThanOrEqual(Math.max(...fine.map((p) => p.y)) + slack);
      }),
      { numRuns: 60 },
    );
  });

  it("has the top of a cubic curve, not its control points", () => {
    const segments: PathSegment[] = [
      { kind: "move", to: { x: 0, y: 0 } },
      { kind: "cubic", c1: { x: 0, y: 100 }, c2: { x: 100, y: 100 }, to: { x: 100, y: 0 } },
    ];
    expect(pathBounds(segments)).toEqual({ x: 0, y: 0, w: 100, h: 75 });
  });

  it("has the quarter points of an arc, for each direction of the turn", () => {
    const half = (sweep: number): PathSegment[] => [
      { kind: "move", to: { x: 10, y: 0 } },
      { kind: "arc", center: { x: 0, y: 0 }, radius: 10, start: 0, sweep, to: { x: -10, y: 0 } },
    ];
    expect(pathBounds(half(Math.PI))).toEqual({ x: -10, y: 0, w: 20, h: 10 });
    expect(pathBounds(half(-Math.PI))).toEqual({ x: -10, y: -10, w: 20, h: 10 });
    const circle: PathSegment[] = [
      { kind: "move", to: { x: 13, y: 4 } },
      { kind: "arc", center: { x: 3, y: 4 }, radius: 10, start: 0, sweep: 2 * Math.PI, to: { x: 13, y: 4 } },
    ];
    expect(pathBounds(circle)).toEqual({ x: -7, y: -6, w: 20, h: 20 });
    expect(pathBounds(quarterArc)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("gives the point of a path of one move, and a RangeError for no segment", () => {
    expect(pathBounds([{ kind: "move", to: { x: 4, y: -2 } }])).toEqual({ x: 4, y: -2, w: 0, h: 0 });
    expect(() => pathBounds([])).toThrow(RangeError);
  });
});

describe("pathStart and pathEnd", () => {
  it("give the two ends and the direction of a line", () => {
    const segments = pathOf([{ x: 1, y: 1 }, { x: 4, y: 5 }, { x: 4, y: 9 }]);
    expect(pathStart(segments)).toEqual({ point: { x: 1, y: 1 }, direction: { x: 0.6, y: 0.8 } });
    expect(pathEnd(segments)).toEqual({ point: { x: 4, y: 9 }, direction: { x: 0, y: 1 } });
  });

  it("give the direction to a near point of one segment", () => {
    // A control point on an end, or an arc with almost no turn, has no near point at this distance, so the examples below examine them.
    const apart = (a: Point, b: Point): boolean => a.x !== b.x || a.y !== b.y;
    const one = fc.tuple(point, fc.oneof(line, cubic, arc)).filter(([first, s]) => (s.kind === "line" ? apart(first, s.to) : s.kind === "cubic" ? apart(first, s.c1) && apart(s.c2, s.to) : Math.abs(s.sweep) > 0.01));
    fc.assert(
      fc.property(one, ([first, s]) => {
        const segments = pathFrom(first, [s]);
        const last = segments[1]!;
        const start = pathStart(segments);
        const end = pathEnd(segments);
        expect(start.point).toEqual(first);
        expect(end.point).toEqual(last.to);
        const near = pointAt(first, last, 1e-6);
        const before = pointAt(first, last, 1 - 1e-6);
        const out = Math.hypot(near.x - first.x, near.y - first.y);
        const into = Math.hypot(last.to.x - before.x, last.to.y - before.y);
        expect(Math.hypot(start.direction.x, start.direction.y)).toBeCloseTo(1, 12);
        expect(Math.hypot(end.direction.x, end.direction.y)).toBeCloseTo(1, 12);
        expect((start.direction.x * (near.x - first.x) + start.direction.y * (near.y - first.y)) / out).toBeGreaterThan(1 - 1e-4);
        expect((end.direction.x * (last.to.x - before.x) + end.direction.y * (last.to.y - before.y)) / into).toBeGreaterThan(1 - 1e-4);
      }),
    );
  });

  it("give the direction of an arc that turns to the smaller angles", () => {
    const segments: PathSegment[] = [
      { kind: "move", to: { x: 10, y: 0 } },
      { kind: "arc", center: { x: 0, y: 0 }, radius: 10, start: 0, sweep: -Math.PI / 2, to: { x: 0, y: -10 } },
    ];
    const start = pathStart(segments).direction;
    const end = pathEnd(segments).direction;
    expect(start.x).toBeCloseTo(0, 12);
    expect(start.y).toBeCloseTo(-1, 12);
    expect(end.x).toBeCloseTo(-1, 12);
    expect(end.y).toBeCloseTo(0, 12);
  });

  it("use the next control point of a cubic curve with a control point on its end", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const up = { x: 0, y: 5 };
    expect(pathStart([{ kind: "move", to: a }, { kind: "cubic", c1: a, c2: up, to: b }]).direction).toEqual({ x: 0, y: 1 });
    expect(pathStart([{ kind: "move", to: a }, { kind: "cubic", c1: a, c2: a, to: b }]).direction).toEqual({ x: 1, y: 0 });
    expect(pathEnd([{ kind: "move", to: a }, { kind: "cubic", c1: up, c2: b, to: b }]).direction).toEqual({ x: 10 / Math.hypot(10, 5), y: -5 / Math.hypot(10, 5) });
    expect(pathEnd([{ kind: "move", to: a }, { kind: "cubic", c1: b, c2: b, to: b }]).direction).toEqual({ x: 1, y: 0 });
  });

  it("go past each segment with no length", () => {
    const o = { x: 0, y: 0 };
    const p = { x: 3, y: 4 };
    expect(pathStart([{ kind: "move", to: o }, { kind: "line", to: o }, { kind: "line", to: p }]).direction).toEqual({ x: 0.6, y: 0.8 });
    expect(pathEnd([{ kind: "move", to: o }, { kind: "line", to: p }, { kind: "arc", center: p, radius: 0, start: 0, sweep: 1, to: p }]).direction).toEqual({ x: 0.6, y: 0.8 });
  });

  it("give the vector 0, 0 for a path with no length, and a RangeError for no segment", () => {
    const o = { x: 2, y: 2 };
    expect(pathStart([{ kind: "move", to: o }])).toEqual({ point: o, direction: { x: 0, y: 0 } });
    expect(pathEnd([{ kind: "move", to: o }, { kind: "line", to: o }])).toEqual({ point: o, direction: { x: 0, y: 0 } });
    expect(() => pathStart([])).toThrow(RangeError);
    expect(() => pathEnd([])).toThrow(RangeError);
  });
});

describe("toSvgPath", () => {
  it("writes the commands M, L, C and A", () => {
    const segments: PathSegment[] = [
      { kind: "move", to: { x: 0, y: 0 } },
      { kind: "line", to: { x: 10, y: 0 } },
      { kind: "cubic", c1: { x: 10, y: 5 }, c2: { x: 15, y: 10 }, to: { x: 20, y: 10 } },
      { kind: "arc", center: { x: 20, y: 20 }, radius: 10, start: -Math.PI / 2, sweep: Math.PI / 2, to: { x: 30, y: 20 } },
    ];
    expect(toSvgPath(segments)).toBe("M 0 0 L 10 0 C 10 5 15 10 20 10 A 10 10 0 0 1 30 20");
  });

  it("sets the flags of an arc from its turn", () => {
    const turn = (sweep: number): string => toSvgPath([{ kind: "arc", center: { x: 0, y: 0 }, radius: 5, start: 0, sweep, to: { x: 1, y: 2 } }]);
    expect(turn(1.5 * Math.PI)).toBe("A 5 5 0 1 1 1 2");
    expect(turn(-1.5 * Math.PI)).toBe("A 5 5 0 1 0 1 2");
    expect(turn(-1)).toBe("A 5 5 0 0 0 1 2");
  });

  it("rounds each number to the digits, with no negative 0", () => {
    const segments = pathOf([{ x: 1.23456, y: -0.001 }, { x: 2.5, y: 1 / 3 }]);
    expect(toSvgPath(segments)).toBe("M 1.23 0 L 2.5 0.33");
    expect(toSvgPath(segments, 0)).toBe("M 1 0 L 3 0");
    expect(toSvgPath(segments, 4)).toBe("M 1.2346 -0.001 L 2.5 0.3333");
  });
});

describe("checkPath", () => {
  it("gives no problem for a generated path", () => {
    fc.assert(
      fc.property(path, (segments) => {
        expect(checkPath(segments)).toEqual([]);
      }),
    );
  });

  it("gives no problem for a path that went through JSON", () => {
    fc.assert(
      fc.property(path, (segments) => {
        expect(checkPath(JSON.parse(JSON.stringify(segments)))).toEqual([]);
      }),
    );
  });

  it("knows the four kinds", () => {
    expect(PATH_KINDS).toEqual(["move", "line", "cubic", "arc"]);
  });

  const o = { x: 0, y: 0 };
  const faults: readonly (readonly [string, unknown, string])[] = [
    ["a value that is not a list", { kind: "move", to: o }, "the path is not a list"],
    ["an empty list", [], "the path has no segment"],
    ["a segment that is not an object", [{ kind: "move", to: o }, 4], "segment 1 is not an object"],
    ["a first segment that is not a move", [{ kind: "line", to: o }], "segment 0 is not a move"],
    ["a second move", [{ kind: "move", to: o }, { kind: "move", to: o }], "segment 1 is a second move"],
    ["a kind that the format does not have", [{ kind: "move", to: o }, { kind: "quadratic", to: o }], "segment 1: the kind is not one of move, line, cubic, arc"],
    ["a point with a value that is not finite", [{ kind: "move", to: { x: 0, y: Number.NaN } }], "segment 0: to is not a point of two finite numbers"],
    ["a cubic curve with no control point", [{ kind: "move", to: o }, { kind: "cubic", c1: o, to: o }], "segment 1: c2 is not a point of two finite numbers"],
    ["an arc with a radius that is not finite", [{ kind: "move", to: o }, { kind: "arc", center: o, radius: Infinity, start: 0, sweep: 1, to: o }], "segment 1: radius is not a finite number"],
    ["an arc with a radius below 0", [{ kind: "move", to: o }, { kind: "arc", center: o, radius: -1, start: 0, sweep: 1, to: o }], "segment 1: the radius is less than 0"],
    [
      "an arc that starts away from the end of the segment before",
      [{ kind: "move", to: o }, { kind: "arc", center: o, radius: 10, start: 0, sweep: Math.PI, to: { x: -10, y: 0 } }],
      "segment 1: the arc does not start at the end of the segment before",
    ],
    [
      "an arc that ends away from its point",
      [{ kind: "move", to: { x: 10, y: 0 } }, { kind: "arc", center: o, radius: 10, start: 0, sweep: Math.PI, to: { x: 0, y: 10 } }],
      "segment 1: the arc does not end at its point to",
    ],
  ];

  it.each(faults)("gives a problem for %s", (_name, value, problem) => {
    expect(checkPath(value)).toContain(problem);
  });
});
