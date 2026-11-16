# Geometry in 3D

The module `geometry3` gives the 3D records of the contract: a point, a box, a rotation and a rigid transform. A viewer of a room or of a rack uses them to put boxes in space. The records are plain data, and each function is pure.

## The axes

The three axes make a right-handed system: the cross product of x and y is z. The records give no meaning to an axis. A user of the records tells which axis points up. The glTF format has y up. A floor plan has z up.

The records give no unit to a length. An angle is in radians.

## The records

```ts
interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface Box3 {
  x: number; // the corner with the smallest coordinates
  y: number;
  z: number;
  w: number; // the size along x
  h: number; // the size along y
  d: number; // the size along z
}

interface Rotation3 {
  x: number; // a unit quaternion, with the scalar part w
  y: number;
  z: number;
  w: number;
}

interface Transform3 {
  position: Point3;
  rotation: Rotation3;
}
```

- A `Point3` is a point or a vector. `ORIGIN3` is the point at the origin.
- A `Box3` has its sides along the axes. A `Rect` is the view of a `Box3` along z.
- A `Rotation3` turns a point about the origin. `NO_ROTATION3` moves no point.
- A `Transform3` is a rigid transform: the rotation, then a move by `position`. `NO_TRANSFORM3` moves no point.

A transform has no scale. The size of a box is in the box, so a rigid transform is sufficient to put a box in space. The transforms are closed: two transforms compose to one transform, and each transform has an inverse.

The glTF format and three.js keep a rotation as the same four numbers in the same order. Thus a `Transform3` gives the `translation` and the `rotation` of a glTF node with no conversion.

## Vectors

| Function | What it gives |
|---|---|
| `addPoints3(a, b)` | The sum of two vectors |
| `subtractPoints3(a, b)` | The vector from `b` to `a` |
| `scalePoint3(point, factor)` | The vector with each coordinate times `factor` |
| `dot3(a, b)` | The dot product |
| `cross3(a, b)` | The cross product |
| `length3(vector)` | The length of a vector |
| `distance3(a, b)` | The distance between two points |

## Rotations

`rotationAbout(axis, angle)` gives the rotation by `angle` about the line through the origin along `axis`. The rotation follows the right-hand rule: a positive angle about z turns the x axis to the y axis. The length of the axis has no effect. An axis of length 0, or a number that is not finite, gives a `RangeError`.

| Function | What it gives |
|---|---|
| `rotatePoint3(rotation, point)` | The point after the rotation |
| `composeRotations3(outer, inner)` | The rotation `inner`, then the rotation `outer`, as one rotation |
| `inverseRotation3(rotation)` | The rotation that moves each point back |
| `normalizeRotation3(rotation)` | The rotation with the length 1 |

A rotation keeps each length and each dot product. A product of many rotations collects small float errors. `normalizeRotation3` removes them.

## Transforms

| Function | What it gives |
|---|---|
| `transformPoint3(transform, point)` | The point after the rotation and the move |
| `composeTransforms3(outer, inner)` | The transform `inner`, then the transform `outer`, as one transform |
| `inverseTransform3(transform)` | The transform that moves each point back |
| `transformMatrix4(transform)` | The 4 by 4 matrix as 16 numbers, column by column |

In `composeTransforms3(outer, inner)`, `inner` is the place of a part in its parent, and `outer` is the place of the parent. The composition is associative.

WebGL, the glTF format and three.js read a matrix column by column. The position is the numbers at the indexes 12, 13 and 14.

## Boxes

| Function | What it gives |
|---|---|
| `box3Center(box)` | The center of a box |
| `box3Volume(box)` | The volume of a box |
| `box3Corners(box)` | The 8 corners of a box |
| `boundsOf3(points)` | The smallest box that holds each point, or `undefined` for no points |
| `transformedBounds3(box, transform)` | The smallest box along the axes that holds the box after the transform |
| `overlapOf3(a, b)` | The overlap of the insides of two boxes on each axis |

The corner at the index `i` of `box3Corners` has the largest x when bit 0 of `i` is 1. Bit 1 gives the largest y, and bit 2 gives the largest z.

`overlapOf3` has the rule of `overlapOf`: a value of 0 or less on an axis is no overlap. Two boxes overlap when the value is above 0 on each of the three axes.

## The laws

The tests of `geometry3.test.ts` hold these laws on random values:

- A rotation keeps the length of a vector and the dot product of two vectors.
- A rotation keeps each point on its axis.
- `composeRotations3` and `composeTransforms3` give the result of the two steps in sequence.
- An inverse moves each point back.
- A transform keeps the distance between two points.
- The matrix of a transform moves each point as the transform does.
- The bounds of the corners of a box are the box.
- The bounds of a box after a transform hold each corner of the box.
