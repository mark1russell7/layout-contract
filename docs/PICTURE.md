# The picture of a layout

A viewer shows the output of the engines: placed boxes, the routes of the edges and the text of the labels. The record `layout-picture/1` of this note holds these three things. A viewer that draws this record shows the output of each engine, and it imports no engine. The path of a route is a record of this note too, so each renderer draws the same line.

## The path

A path is a list of segments. The first segment is its one `move`. Each other segment starts at the end of the segment before.

```ts
type PathSegment =
  | { kind: "move"; to: Point } // the start of the path: the pen draws nothing
  | { kind: "line"; to: Point }
  | { kind: "cubic"; c1: Point; c2: Point; to: Point } // a cubic Bezier curve with two control points
  | { kind: "arc"; center: Point; radius: number; start: number; sweep: number; to: Point };
```

- An arc is a part of a circle. It starts at the angle `start` and turns by `sweep` radians.
- A positive `sweep` turns from the x axis to the y axis. The y axis points down, so the turn is clockwise on a screen.
- On a canvas, `ctx.arc(center.x, center.y, radius, start, start + sweep, sweep < 0)` draws an arc.
- The record came from the curve model of `highways`. A curve of `highways` is a path with no change.

| Function | Result |
| --- | --- |
| `pathOf(points)` | The path of a polyline: a `move` to the first point, then a line to each next point |
| `samplePath(path, tolerance)` | A polyline that follows the path. Each point of the path is `tolerance` or less from the polyline. The default is 0.5. |
| `pathBounds(path)` | The exact bounding box of the path |
| `pathStart(path)`, `pathEnd(path)` | The first or the last point of the path, with the direction of the path at that point as a unit vector |
| `toSvgPath(path, digits)` | The path as the data of an SVG path: the commands `M`, `L`, `C` and `A` |
| `cubicAt(p0, p1, p2, p3, t)` | The point at the parameter `t` of a cubic Bezier curve |
| `checkPath(value)` | The problems of a path. An empty list means a good path. |

`pathBounds` does not use the control points of a cubic curve, because the curve does not go through them. It uses the points where the curve turns back on an axis. For an arc, it uses the points of the circle at each quarter turn that the arc goes through.

`pathStart` and `pathEnd` give the direction of the first or the last segment that has a length. An arrow head at the end of a route points along the direction of `pathEnd`. A path with no length gives the vector 0, 0.

A good path has these properties:

- It has one segment or more, and only its first segment is a `move`.
- Each number is finite, and the radius of an arc is 0 or more.
- An arc starts at the end of the segment before, and it ends at its `to`. The tolerance is `1e-6 × (radius + 1)`.

## The record

```ts
interface LayoutPicture {
  schema: "layout-picture/1";
  id?: string; // the id of the input
  boxes: PictureBox[];
  routes: PictureRoute[];
  labels: PictureLabel[];
}
interface PictureBox {
  id: string;
  x: number; y: number; w: number; h: number;
  parent?: string; // a box before this box in the list
  shape?: Region; // relative to the top-left corner of the box
  data?: Record<string, unknown>;
}
interface PictureRoute {
  id: string; // the id of the edge
  source: string; target: string; // boxes of the picture
  path: PathSegment[];
  data?: Record<string, unknown>;
}
interface PictureLabel {
  id: string;
  box?: string; route?: string; // the record that the label names
  x: number; y: number; w: number; h: number;
  lines: string[];
  lineHeight: number;
  font: string; // the CSS property font
  align?: "left" | "center" | "right";
  data?: Record<string, unknown>;
}
```

- All coordinates are those of the picture. A child box does not have coordinates relative to its parent.
- Each list is in the order of the paint: its first record is at the back. A parent comes before its children, so a child shows on its parent.
- A viewer chooses the order of the three lists, and it chooses each color. The record has no color.
- `data` is the free data of the box or of the edge. A viewer reads it to choose a look, for example from a kind.
- A picture is JSON data. The check accepts fields that the format does not know.

## The labels

A label holds a text that an engine measured. `layoutText` of the entry `/text` gives the lines, the width and the height of a text for a font. A label keeps these values and the font, so the drawn text has the measured size.

- A renderer draws each line with `font`. It does not break a line again.
- Line `i` is in a band of the height `lineHeight` that starts at `y + i × lineHeight`.
- `align` puts each line at the left, at the center or at the right of the width `w`. The default is `left`.
- A label names one box or one route, or it names no record, as a title does.

## The functions

| Function | Result |
| --- | --- |
| `pictureOf(input, parts)` | The picture of a placed input, with the routes and the labels of `parts` |
| `checkPicture(value)` | The problems of a picture. An empty list means a good picture. |
| `parsePicture(value)` | The picture, or a `TypeError` with the problems |
| `pictureBounds(picture)` | The bounding box of the boxes, the paths and the labels, or `undefined` for a picture with no record |

`pictureOf` reads an input of the format `layout-input/1` after an engine placed its boxes:

1. Each box with `x` and `y` goes into the picture, with its rectangle, its `parent`, its `shape` and its `data`. A box with no place is not in the picture.
2. The order is the order of the input, but each box comes immediately before its children.
3. Each route of `parts` names an edge of the input. The route gets the source, the target and the data of that edge.
4. A route with a `path` keeps it. A route with no `path` gets the polyline of its points.

A route of `parts` has the fields `edge` and `points`, as a `Route` of `highways` has. Thus the routes of a router go into a picture with no change.

`pictureOf` gives a `RangeError` for an input that has no picture:

- a placed box below a box with no place, or a loop of parents
- a route with no edge in the input
- each problem of `checkPicture`, for example an id two times

## The check

`checkPicture` gives a problem for each of these faults:

- a schema that is not `layout-picture/1`, or a list that is not there
- an id that is empty, or two times in its list
- a place or a size that is not finite, or a size below 0
- a parent that is not a box before its child in the list
- a route whose source or target is not a box of the picture, or whose path has a problem
- a label with a `box` and a `route`, or with one that is not in the picture
- a label with no line list, with a line height of 0 or less, or with no font

## The tests

`src/path.test.ts` examines the paths with `fast-check` over generated paths of lines, cubic curves and arcs. `src/picture.test.ts` examines the record.

| Law | Statement |
| --- | --- |
| Polyline | `samplePath(pathOf(p))` is `p`. The polyline goes through the end of each segment, in their order. |
| Tolerance | Each point of a path is `tolerance` or less from `samplePath(path, tolerance)`. |
| Bounds | `pathBounds` contains each point of the path. It is not larger than the box of a fine polyline plus its tolerance. |
| Direction | The direction of `pathStart` and of `pathEnd` is a unit vector to a near point of the segment. |
| Good path | Each generated path has no problem, also after a round trip through JSON. |
| Tree order | `pictureOf` gives a good picture for each placed tree of boxes, with each box after its parent. |

`packages/joint/src/picture.test.ts` examines the record with the engines. `pictureOf` takes the routes of a router of `highways` with no change. Each curve type of `highways` gives a good path.
