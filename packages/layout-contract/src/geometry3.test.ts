import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addPoints3,
  boundsOf3,
  type Box3,
  box3Center,
  box3Corners,
  box3Volume,
  composeRotations3,
  composeTransforms3,
  cross3,
  distance3,
  dot3,
  inverseRotation3,
  inverseTransform3,
  length3,
  NO_ROTATION3,
  NO_TRANSFORM3,
  normalizeRotation3,
  ORIGIN3,
  overlapOf,
  overlapOf3,
  type Point3,
  rotatePoint3,
  type Rotation3,
  rotationAbout,
  scalePoint3,
  subtractPoints3,
  type Transform3,
  transformedBounds3,
  transformMatrix4,
  transformPoint3,
} from "./index.ts";

const X: Point3 = { x: 1, y: 0, z: 0 };
const Y: Point3 = { x: 0, y: 1, z: 0 };
const Z: Point3 = { x: 0, y: 0, z: 1 };
const QUARTER = Math.PI / 2;

/** The tolerance of a comparison of two coordinates of the test values, which are below 1000. */
const NEAR = 1e-9;

const coordinate = fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true });
const point = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const axis = point.filter((value) => length3(value) > 1e-3);
const angle = fc.double({ min: -2 * Math.PI, max: 2 * Math.PI, noNaN: true, noDefaultInfinity: true });
const rotation = fc.tuple(axis, angle).map(([about, by]) => rotationAbout(about, by));
const transform = fc.record({ position: point, rotation });
const size = fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });
const box = fc.record({ x: coordinate, y: coordinate, z: coordinate, w: size, h: size, d: size });

function expectNear(actual: Point3, expected: Point3, tolerance = NEAR): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tolerance);
}

/** This function applies a column-major 4 by 4 matrix to a point. */
function applyMatrix(matrix: readonly number[], value: Point3): Point3 {
  const at = (row: number): number =>
    (matrix[row] ?? Number.NaN) * value.x + (matrix[4 + row] ?? Number.NaN) * value.y + (matrix[8 + row] ?? Number.NaN) * value.z + (matrix[12 + row] ?? Number.NaN);
  return { x: at(0), y: at(1), z: at(2) };
}

describe("vectors in 3D", () => {
  it("adds, subtracts and scales each coordinate", () => {
    expect(addPoints3({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 });
    expect(subtractPoints3({ x: 11, y: 22, z: 33 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 1, y: 2, z: 3 });
    expect(scalePoint3({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it("gives the dot product, the length and the distance", () => {
    expect(dot3({ x: 1, y: 2, z: 3 }, { x: 4, y: -5, z: 6 })).toBe(12);
    expect(length3({ x: 2, y: 3, z: 6 })).toBe(7);
    expect(distance3({ x: 1, y: 1, z: 1 }, { x: 3, y: 4, z: 7 })).toBe(7);
    expect(length3(ORIGIN3)).toBe(0);
  });

  it("has a right-handed cross product", () => {
    expect(cross3(X, Y)).toEqual(Z);
    expect(cross3(Y, Z)).toEqual(X);
    expect(cross3(Z, X)).toEqual(Y);
  });

  it("gives a cross product at a right angle to its two vectors, with the opposite sign for the opposite order", () => {
    fc.assert(
      fc.property(point, point, (a, b) => {
        const product = cross3(a, b);
        expect(Math.abs(dot3(product, a))).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(dot3(product, b))).toBeLessThanOrEqual(1e-6);
        expectNear(cross3(b, a), scalePoint3(product, -1));
      }),
    );
  });
});

describe("rotations", () => {
  it("follows the right-hand rule about each axis", () => {
    expectNear(rotatePoint3(rotationAbout(Z, QUARTER), X), Y);
    expectNear(rotatePoint3(rotationAbout(X, QUARTER), Y), Z);
    expectNear(rotatePoint3(rotationAbout(Y, QUARTER), Z), X);
  });

  it("does not use the length of the axis", () => {
    expectNear(rotatePoint3(rotationAbout({ x: 0, y: 0, z: 40 }, QUARTER), X), Y);
  });

  it("moves no point with the identity", () => {
    fc.assert(fc.property(point, (value) => expectNear(rotatePoint3(NO_ROTATION3, value), value, 0)));
  });

  it("gives a unit quaternion", () => {
    fc.assert(
      fc.property(rotation, (value) => {
        expect(Math.abs(Math.hypot(value.x, value.y, value.z, value.w) - 1)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });

  it("keeps the lengths and the dot products", () => {
    fc.assert(
      fc.property(rotation, point, point, (turn, a, b) => {
        expect(Math.abs(length3(rotatePoint3(turn, a)) - length3(a))).toBeLessThanOrEqual(NEAR);
        expect(Math.abs(dot3(rotatePoint3(turn, a), rotatePoint3(turn, b)) - dot3(a, b))).toBeLessThanOrEqual(1e-7);
      }),
    );
  });

  it("keeps the points on its axis", () => {
    fc.assert(fc.property(axis, angle, (about, by) => expectNear(rotatePoint3(rotationAbout(about, by), about), about)));
  });

  it("composes: the inner rotation, then the outer rotation", () => {
    fc.assert(
      fc.property(rotation, rotation, point, (outer, inner, value) => {
        expectNear(rotatePoint3(composeRotations3(outer, inner), value), rotatePoint3(outer, rotatePoint3(inner, value)));
      }),
    );
  });

  it("composes in sequence, not in the opposite sequence", () => {
    const turnZ = rotationAbout(Z, QUARTER);
    const turnX = rotationAbout(X, QUARTER);
    // X turns about x to X, then about z to Y.
    expectNear(rotatePoint3(composeRotations3(turnZ, turnX), X), Y);
    // X turns about z to Y, then about x to Z.
    expectNear(rotatePoint3(composeRotations3(turnX, turnZ), X), Z);
  });

  it("moves each point back with the inverse", () => {
    fc.assert(
      fc.property(rotation, point, (turn, value) => {
        expectNear(rotatePoint3(inverseRotation3(turn), rotatePoint3(turn, value)), value);
      }),
    );
  });

  it("normalizes a quaternion to the length 1", () => {
    const value = normalizeRotation3({ x: 0, y: 0, z: 3, w: 4 });
    expect(value.z).toBeCloseTo(0.6, 12);
    expect(value.w).toBeCloseTo(0.8, 12);
    expect(value.x).toBe(0);
    expect(value.y).toBe(0);
  });

  it("refuses an axis of length 0 and a number that is not finite", () => {
    expect(() => rotationAbout(ORIGIN3, 1)).toThrow(RangeError);
    expect(() => rotationAbout(Z, Number.NaN)).toThrow(RangeError);
    expect(() => rotationAbout(Z, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => rotationAbout({ x: Number.NaN, y: 0, z: 1 }, 1)).toThrow(RangeError);
    expect(() => rotationAbout({ x: Number.POSITIVE_INFINITY, y: 0, z: 1 }, 1)).toThrow(RangeError);
    expect(() => normalizeRotation3({ x: 0, y: 0, z: 0, w: 0 })).toThrow(RangeError);
    expect(() => normalizeRotation3({ x: 0, y: 0, z: Number.NaN, w: 1 })).toThrow(RangeError);
  });
});

describe("rigid transforms", () => {
  it("rotates, then moves", () => {
    const value: Transform3 = { position: { x: 10, y: 0, z: 0 }, rotation: rotationAbout(Z, QUARTER) };
    expectNear(transformPoint3(value, X), { x: 10, y: 1, z: 0 });
  });

  it("moves no point with the identity", () => {
    fc.assert(fc.property(point, (value) => expectNear(transformPoint3(NO_TRANSFORM3, value), value, 0)));
  });

  it("composes: the inner transform, then the outer transform", () => {
    fc.assert(
      fc.property(transform, transform, point, (outer, inner, value) => {
        expectNear(transformPoint3(composeTransforms3(outer, inner), value), transformPoint3(outer, transformPoint3(inner, value)), 1e-7);
      }),
    );
  });

  it("is associative", () => {
    fc.assert(
      fc.property(transform, transform, transform, point, (a, b, c, value) => {
        const left = composeTransforms3(composeTransforms3(a, b), c);
        const right = composeTransforms3(a, composeTransforms3(b, c));
        expectNear(transformPoint3(left, value), transformPoint3(right, value), 1e-7);
      }),
    );
  });

  it("moves each point back with the inverse", () => {
    fc.assert(
      fc.property(transform, point, (value, at) => {
        expectNear(transformPoint3(inverseTransform3(value), transformPoint3(value, at)), at, 1e-7);
        expectNear(transformPoint3(value, transformPoint3(inverseTransform3(value), at)), at, 1e-7);
      }),
    );
  });

  it("keeps the distance between two points", () => {
    fc.assert(
      fc.property(transform, point, point, (value, a, b) => {
        expect(Math.abs(distance3(transformPoint3(value, a), transformPoint3(value, b)) - distance3(a, b))).toBeLessThanOrEqual(1e-7);
      }),
    );
  });

  it("gives a column-major matrix that moves each point as the transform does", () => {
    fc.assert(
      fc.property(transform, point, (value, at) => {
        const matrix = transformMatrix4(value);
        expect(matrix).toHaveLength(16);
        expect([matrix[3], matrix[7], matrix[11], matrix[15]]).toEqual([0, 0, 0, 1]);
        expectNear(applyMatrix(matrix, at), transformPoint3(value, at), 1e-7);
      }),
    );
  });

  it("gives the identity matrix for the identity", () => {
    expect(transformMatrix4(NO_TRANSFORM3)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("puts the position in the last column of the matrix", () => {
    const matrix = transformMatrix4({ position: { x: 7, y: 8, z: 9 }, rotation: NO_ROTATION3 });
    expect(matrix.slice(12)).toEqual([7, 8, 9, 1]);
  });
});

describe("boxes in 3D", () => {
  const sample: Box3 = { x: 1, y: 2, z: 3, w: 4, h: 6, d: 8 };

  it("gives the center and the volume", () => {
    expect(box3Center(sample)).toEqual({ x: 3, y: 5, z: 7 });
    expect(box3Volume(sample)).toBe(192);
  });

  it("gives the 8 corners by the bits of the index", () => {
    const corners = box3Corners(sample);
    expect(corners).toHaveLength(8);
    expect(corners[0]).toEqual({ x: 1, y: 2, z: 3 });
    expect(corners[1]).toEqual({ x: 5, y: 2, z: 3 });
    expect(corners[2]).toEqual({ x: 1, y: 8, z: 3 });
    expect(corners[4]).toEqual({ x: 1, y: 2, z: 11 });
    expect(corners[7]).toEqual({ x: 5, y: 8, z: 11 });
  });

  it("gives the box again as the bounds of its corners", () => {
    fc.assert(
      fc.property(box, (value) => {
        const bounds = boundsOf3(box3Corners(value));
        expect(bounds).toBeDefined();
        if (bounds === undefined) return;
        expectNear(bounds, value);
        expectNear({ x: bounds.w, y: bounds.h, z: bounds.d }, { x: value.w, y: value.h, z: value.d });
      }),
    );
  });

  it("gives no bounds for no points, and a box of size 0 for one point", () => {
    expect(boundsOf3([])).toBeUndefined();
    expect(boundsOf3([{ x: 1, y: 2, z: 3 }])).toEqual({ x: 1, y: 2, z: 3, w: 0, h: 0, d: 0 });
  });

  it("holds each point in the bounds", () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 12 }), (points) => {
        const bounds = boundsOf3(points);
        expect(bounds).toBeDefined();
        if (bounds === undefined) return;
        for (const value of points) {
          expect(value.x).toBeGreaterThanOrEqual(bounds.x);
          expect(value.y).toBeGreaterThanOrEqual(bounds.y);
          expect(value.z).toBeGreaterThanOrEqual(bounds.z);
          expect(value.x).toBeLessThanOrEqual(bounds.x + bounds.w + NEAR);
          expect(value.y).toBeLessThanOrEqual(bounds.y + bounds.h + NEAR);
          expect(value.z).toBeLessThanOrEqual(bounds.z + bounds.d + NEAR);
        }
      }),
    );
  });

  it("keeps a box under the identity, and turns a box by a quarter turn", () => {
    expect(transformedBounds3(sample, NO_TRANSFORM3)).toEqual(sample);
    const turned = transformedBounds3({ x: 0, y: 0, z: 0, w: 2, h: 1, d: 3 }, { position: ORIGIN3, rotation: rotationAbout(Z, QUARTER) });
    expectNear(turned, { x: -1, y: 0, z: 0 });
    expectNear({ x: turned.w, y: turned.h, z: turned.d }, { x: 1, y: 2, z: 3 });
  });

  it("holds each corner of the turned box in the bounds, and has a volume that is not smaller", () => {
    fc.assert(
      fc.property(box, transform, (value, place) => {
        const bounds = transformedBounds3(value, place);
        for (const corner of box3Corners(value)) {
          const moved = transformPoint3(place, corner);
          expect(moved.x).toBeGreaterThanOrEqual(bounds.x - NEAR);
          expect(moved.x).toBeLessThanOrEqual(bounds.x + bounds.w + NEAR);
          expect(moved.y).toBeGreaterThanOrEqual(bounds.y - NEAR);
          expect(moved.y).toBeLessThanOrEqual(bounds.y + bounds.h + NEAR);
          expect(moved.z).toBeGreaterThanOrEqual(bounds.z - NEAR);
          expect(moved.z).toBeLessThanOrEqual(bounds.z + bounds.d + NEAR);
        }
        expect(box3Volume(bounds)).toBeGreaterThanOrEqual(box3Volume(value) * (1 - 1e-9) - 1e-6);
      }),
    );
  });

  it("gives the overlap on each axis", () => {
    const a: Box3 = { x: 0, y: 0, z: 0, w: 4, h: 4, d: 4 };
    expect(overlapOf3(a, { x: 3, y: 2, z: 1, w: 4, h: 4, d: 4 })).toEqual({ x: 1, y: 2, z: 3 });
    // A common face gives 0 on one axis.
    expect(overlapOf3(a, { x: 4, y: 0, z: 0, w: 1, h: 4, d: 4 })).toEqual({ x: 0, y: 4, z: 4 });
    // A gap gives a negative value.
    expect(overlapOf3(a, { x: 0, y: 0, z: 6, w: 4, h: 4, d: 1 }).z).toBe(-2);
  });

  it("is symmetric, and agrees with the overlap of the rectangles on x and y", () => {
    fc.assert(
      fc.property(box, box, (a, b) => {
        expect(overlapOf3(a, b)).toEqual(overlapOf3(b, a));
        const flat = overlapOf(a, b);
        const solid = overlapOf3(a, b);
        expect(solid.x).toBe(flat.x);
        expect(solid.y).toBe(flat.y);
      }),
    );
  });
});

describe("the constants", () => {
  it("are the identity values", () => {
    const origin: Point3 = ORIGIN3;
    const none: Rotation3 = NO_ROTATION3;
    expect(origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(none).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(NO_TRANSFORM3).toEqual({ position: origin, rotation: none });
  });
});
