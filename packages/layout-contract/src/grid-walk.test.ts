import { describe, expect, it } from "vitest";
import { cellCenter, cellNear, inSight, polygonGrid, polylineLength, searchGrid, straightenWalk, walkCells, type GridPoint } from "./grid-walk.ts";

const square = (x0: number, y0: number, x1: number, y1: number): GridPoint[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const count = (inside: Uint8Array): number => inside.reduce((sum, value) => sum + value, 0);

// An L of three squares of 10: the corner square at the origin, one square to the east and one to the south.
const ell: GridPoint[] = [
  [0, 0],
  [20, 0],
  [20, 10],
  [10, 10],
  [10, 20],
  [0, 20],
];

describe("polygonGrid", () => {
  it("gives each cell with its center inside the ring, and takes out the cells of a hole", () => {
    expect(count(polygonGrid(square(0, 0, 10, 10), 1).inside)).toBe(100);
    const holed = polygonGrid(square(0, 0, 10, 10), 1, { holes: [square(2, 2, 4, 5)] });
    expect(count(holed.inside)).toBe(100 - 6);
    expect(count(polygonGrid(ell, 1).inside)).toBe(300);
  });

  it("doubles the side of a cell until the grid has no more cells than largest", () => {
    const grid = polygonGrid(square(0, 0, 100, 100), 1, { largest: 3000 });
    expect(grid.cell).toBe(2);
    expect(grid.columns * grid.rows).toBe(2500);
  });

  it("refuses a cell side that is not a finite number above 0", () => {
    expect(() => polygonGrid(ell, 0)).toThrow(RangeError);
    expect(() => polygonGrid(ell, Number.NaN)).toThrow(RangeError);
  });
});

describe("cellNear and cellCenter", () => {
  const grid = polygonGrid(ell, 1);

  it("gives the cell of a point inside, and the nearest cell inside for a point near the edge", () => {
    expect(cellCenter(grid, cellNear(grid, [3.2, 4.7]))).toEqual([3.5, 4.5]);
    expect(cellCenter(grid, cellNear(grid, [15.3, 11.2]))).toEqual([15.5, 9.5]);
  });

  it("gives -1 when no cell inside is within reach", () => {
    expect(cellNear(grid, [16, 16])).toBe(-1);
    expect(cellNear(grid, [16, 16], 8)).not.toBe(-1);
  });
});

describe("searchGrid, walkCells and straightenWalk", () => {
  const grid = polygonGrid(ell, 1);
  const east = cellNear(grid, [19.5, 5]);
  const south = cellNear(grid, [5, 19.5]);

  it("walks around the inner corner of the L, not across the outside", () => {
    const search = searchGrid(grid, east);
    const cells = walkCells(search, south);
    expect(cells[0]).toBe(east);
    expect(cells.at(-1)).toBe(south);
    for (const index of cells) expect(grid.inside[index]).toBe(1);
    // The straight line from (19.5, 5.5) to (5.5, 19.5) goes outside. The walk is longer.
    expect(search.distance[south]!).toBeGreaterThan(Math.hypot(14, 14));
  });

  it("does not step on a diagonal past the corner of a cell outside", () => {
    // Two cells that touch only at a corner: no walk joins them.
    const two = { origin: [0, 0] as const, cell: 1, columns: 2, rows: 2, inside: Uint8Array.from([1, 0, 0, 1]) };
    expect(walkCells(searchGrid(two, 0), 3)).toEqual([]);
  });

  it("stops when it reaches each target", () => {
    const near = cellNear(grid, [1.5, 0.5]);
    const search = searchGrid(grid, cellNear(grid, [0.5, 0.5]), [near]);
    expect(search.distance[near]).toBe(1);
    expect(search.distance[south]).toBe(Infinity);
  });

  it("straightens the walk to the corner of the L, and each run stays inside", () => {
    const points = walkCells(searchGrid(grid, east), south).map((index) => cellCenter(grid, index));
    const straight = straightenWalk(grid, points);
    expect(straight[0]).toEqual(points[0]);
    expect(straight.at(-1)).toEqual(points.at(-1));
    expect(straight.length).toBeLessThan(points.length);
    for (let k = 1; k < straight.length; k++) expect(inSight(grid, straight[k - 1]!, straight[k]!)).toBe(true);
    expect(polylineLength(straight)).toBeLessThanOrEqual(polylineLength(points));
  });
});

describe("polylineLength", () => {
  it("adds the length of each part", () => {
    expect(
      polylineLength([
        [0, 0],
        [3, 4],
        [3, 10],
      ]),
    ).toBe(11);
    expect(polylineLength([[1, 1]])).toBe(0);
  });
});
