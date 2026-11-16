/**
 * The 3D records: points, boxes with their sides along the axes, rotations and rigid transforms.
 * The three axes make a right-handed system. The records give no meaning to an axis and no unit to a length.
 * `docs/GEOMETRY-3D.md` gives the rules.
 */

/** A point or a vector in 3D. */
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The point at the origin. It is also the vector of length 0. */
export const ORIGIN3: Point3 = { x: 0, y: 0, z: 0 };

/**
 * A box with its sides along the axes: the corner with the smallest coordinates, and its size.
 * `w` is the size along x, `h` is the size along y, and `d` is the size along z.
 */
export interface Box3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
}

/**
 * A rotation about the origin, as a unit quaternion. `w` is the scalar part.
 * The glTF format and three.js keep the four numbers in the same order.
 */
export interface Rotation3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** The rotation that moves no point. */
export const NO_ROTATION3: Rotation3 = { x: 0, y: 0, z: 0, w: 1 };

/**
 * A rigid transform: the rotation of a point about the origin, then a move by `position`.
 * It has no scale, because the size of a box is in the box.
 */
export interface Transform3 {
  readonly position: Point3;
  readonly rotation: Rotation3;
}

/** The transform that moves no point. */
export const NO_TRANSFORM3: Transform3 = { position: ORIGIN3, rotation: NO_ROTATION3 };

/** This function gives the sum of two vectors. */
export function addPoints3(a: Point3, b: Point3): Point3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** This function gives the vector from `b` to `a`: `a` minus `b`. */
export function subtractPoints3(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** This function gives a vector with each coordinate times `factor`. */
export function scalePoint3(point: Point3, factor: number): Point3 {
  return { x: point.x * factor, y: point.y * factor, z: point.z * factor };
}

/** This function gives the dot product of two vectors. */
export function dot3(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** This function gives the cross product of `a` and `b`. In a right-handed system, x cross y is z. */
export function cross3(a: Point3, b: Point3): Point3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** This function gives the length of a vector. */
export function length3(vector: Point3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

/** This function gives the distance between two points. */
export function distance3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * This function gives the rotation by `angle` radians about the line through the origin along `axis`.
 * The rotation follows the right-hand rule: a positive angle about z turns the x axis to the y axis.
 * An axis of length 0, or a number that is not finite, gives a `RangeError`.
 */
export function rotationAbout(axis: Point3, angle: number): Rotation3 {
  const length = length3(axis);
  if (!Number.isFinite(length) || length === 0 || !Number.isFinite(angle)) {
    throw new RangeError("A rotation needs a finite angle and a finite axis with a length above 0.");
  }
  const factor = Math.sin(angle / 2) / length;
  return { x: axis.x * factor, y: axis.y * factor, z: axis.z * factor, w: Math.cos(angle / 2) };
}

/**
 * This function gives the rotation `inner`, then the rotation `outer`, as one rotation.
 * It is the quaternion product of `outer` and `inner`.
 */
export function composeRotations3(outer: Rotation3, inner: Rotation3): Rotation3 {
  return {
    x: outer.w * inner.x + outer.x * inner.w + outer.y * inner.z - outer.z * inner.y,
    y: outer.w * inner.y - outer.x * inner.z + outer.y * inner.w + outer.z * inner.x,
    z: outer.w * inner.z + outer.x * inner.y - outer.y * inner.x + outer.z * inner.w,
    w: outer.w * inner.w - outer.x * inner.x - outer.y * inner.y - outer.z * inner.z,
  };
}

/** This function gives the rotation that moves each point back. It is the conjugate of a unit quaternion. */
export function inverseRotation3(rotation: Rotation3): Rotation3 {
  return { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };
}

/**
 * This function gives the rotation with the length 1. Many products of rotations collect small float errors, and this function removes them.
 * A quaternion of length 0, or a number that is not finite, gives a `RangeError`.
 */
export function normalizeRotation3(rotation: Rotation3): Rotation3 {
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (!Number.isFinite(length) || length === 0) throw new RangeError("A rotation needs a finite quaternion with a length above 0.");
  return { x: rotation.x / length, y: rotation.y / length, z: rotation.z / length, w: rotation.w / length };
}

/** This function gives the point after the rotation. The rotation is a unit quaternion. */
export function rotatePoint3(rotation: Rotation3, point: Point3): Point3 {
  // The point plus two times the cross products: v + 2w (q × v) + 2 q × (q × v).
  const first = cross3(rotation, point);
  const second = cross3(rotation, first);
  return {
    x: point.x + 2 * (rotation.w * first.x + second.x),
    y: point.y + 2 * (rotation.w * first.y + second.y),
    z: point.z + 2 * (rotation.w * first.z + second.z),
  };
}

/** This function gives the point after the transform: the rotation, then the move. */
export function transformPoint3(transform: Transform3, point: Point3): Point3 {
  return addPoints3(rotatePoint3(transform.rotation, point), transform.position);
}

/**
 * This function gives the transform `inner`, then the transform `outer`, as one transform.
 * Thus `inner` is the place of a part in its parent, and `outer` is the place of the parent.
 */
export function composeTransforms3(outer: Transform3, inner: Transform3): Transform3 {
  return {
    position: transformPoint3(outer, inner.position),
    rotation: composeRotations3(outer.rotation, inner.rotation),
  };
}

/** This function gives the transform that moves each point back. */
export function inverseTransform3(transform: Transform3): Transform3 {
  const rotation = inverseRotation3(transform.rotation);
  return { position: scalePoint3(rotatePoint3(rotation, transform.position), -1), rotation };
}

/**
 * This function gives the 4 by 4 matrix of a transform as 16 numbers, column by column.
 * WebGL, the glTF format and three.js read a matrix in this order.
 */
export function transformMatrix4(transform: Transform3): readonly number[] {
  const { x, y, z, w } = transform.rotation;
  const { position } = transform;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y + w * z),
    2 * (x * z - w * y),
    0,
    2 * (x * y - w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z + w * x),
    0,
    2 * (x * z + w * y),
    2 * (y * z - w * x),
    1 - 2 * (x * x + y * y),
    0,
    position.x,
    position.y,
    position.z,
    1,
  ];
}

/** This function gives the center of a box. */
export function box3Center(box: Box3): Point3 {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, z: box.z + box.d / 2 };
}

/** This function gives the volume of a box. */
export function box3Volume(box: Box3): number {
  return box.w * box.h * box.d;
}

/**
 * This function gives the 8 corners of a box. The corner at the index `i` has the largest x when bit 0 of `i` is 1.
 * Bit 1 gives the largest y, and bit 2 gives the largest z. Thus the corner 0 is the corner of the box record.
 */
export function box3Corners(box: Box3): readonly Point3[] {
  const corners: Point3[] = [];
  for (let index = 0; index < 8; index += 1) {
    corners.push({
      x: box.x + (index & 1) * box.w,
      y: box.y + ((index >> 1) & 1) * box.h,
      z: box.z + ((index >> 2) & 1) * box.d,
    });
  }
  return corners;
}

/** This function gives the smallest box that holds each point, or `undefined` for no points. */
export function boundsOf3(points: readonly Point3[]): Box3 | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  let minX = first.x;
  let minY = first.y;
  let minZ = first.z;
  let maxX = first.x;
  let maxY = first.y;
  let maxZ = first.z;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }
  return { x: minX, y: minY, z: minZ, w: maxX - minX, h: maxY - minY, d: maxZ - minZ };
}

/**
 * This function gives the smallest box along the axes that holds a box after a transform.
 * A box that turns by an angle that is not a quarter turn gets a larger box.
 */
export function transformedBounds3(box: Box3, transform: Transform3): Box3 {
  // A box has 8 corners, so the bounds are always present.
  return boundsOf3(box3Corners(box).map((corner) => transformPoint3(transform, corner))) as Box3;
}

/**
 * This function gives the overlap of the insides of two boxes on each axis.
 * A value of 0 or less on an axis is no overlap. Two boxes with a common face have an overlap of 0 on one axis.
 */
export function overlapOf3(a: Box3, b: Box3): Point3 {
  return {
    x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
    z: Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z),
  };
}
