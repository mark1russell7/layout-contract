import { describe, expect, it } from "vitest";
import {
  CELL_MEASURE_SUFFIXES,
  cellMeasureEntries,
  cellMeasures,
  cellMeasureSpecs,
  cellsOf,
  checkRegistry,
  checkShapes,
  normalizeMeasure,
  regionArea,
  regionPerimeter,
  SQUARE_COMPACTNESS,
  type CellItem,
  type Region,
} from "./index.ts";

const rect = (x: number, y: number, w: number, h: number): Region => ({ kind: "rect", x, y, w, h });

/** The perimeter of an ellipse by the midpoint rule over its angle. */
const ellipseLength = (a: number, b: number): number => {
  const n = 100_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * 2 * Math.PI;
    sum += Math.hypot(a * Math.sin(t), b * Math.cos(t));
  }
  return (sum * 2 * Math.PI) / n;
};

describe("regionPerimeter", () => {
  it("gives the exact perimeter of a rectangle, a circle and a polygon with a hole", () => {
    expect(regionPerimeter(rect(5, 5, 3, 4))).toBe(14);
    expect(regionPerimeter({ kind: "circle", cx: 0, cy: 0, r: 2 })).toBeCloseTo(4 * Math.PI, 12);
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    const hole = [
      [2, 2],
      [5, 2],
      [2, 6],
    ] as const;
    expect(regionPerimeter({ kind: "polygon", points: square })).toBe(40);
    expect(regionPerimeter({ kind: "polygon", points: square, holes: [hole] })).toBeCloseTo(52, 12);
    expect(regionPerimeter({ kind: "polygon", points: [[1, 1]] })).toBe(0);
  });

  it("gives the perimeter of an ellipse in 5e-4 of the true value, and below it", () => {
    for (const b of [1, 0.5, 0.1, 0.01, 0]) {
      const got = regionPerimeter({ kind: "ellipse", cx: 3, cy: 4, rx: 1, ry: b });
      const truth = ellipseLength(1, b);
      expect(Math.abs(got - truth) / truth).toBeLessThan(5e-4);
      expect(got).toBeLessThanOrEqual(truth + 1e-9);
    }
    expect(regionPerimeter({ kind: "ellipse", cx: 0, cy: 0, rx: 0, ry: 0 })).toBe(0);
  });
});

describe("cellsOf", () => {
  it("gives 0 for cells that fill the container in the target shares", () => {
    const items: CellItem[] = [
      { target: 3, cell: rect(0, 0, 75, 100) },
      { target: 1, cell: rect(75, 0, 25, 100) },
    ];
    expect(cellsOf(items, 100 * 100).areaError).toBe(0);
  });

  it("gives half the sum of the share differences", () => {
    // Shares of the cells: 0.5 and 0.5. Target shares: 0.75 and 0.25. Half of 0.25 + 0.25 is 0.25.
    const items: CellItem[] = [
      { target: 3, cell: rect(0, 0, 50, 100) },
      { target: 1, cell: rect(50, 0, 50, 100) },
    ];
    expect(cellsOf(items, 100 * 100).areaError).toBeCloseTo(0.25, 12);
  });

  it("divides the targets by their sum, so a scale of the weights gives the same value", () => {
    const cells = [rect(0, 0, 50, 100), rect(50, 0, 50, 100)];
    const at = (k: number) => cellsOf([{ target: 3 * k, cell: cells[0]! }, { target: 1 * k, cell: cells[1]! }], 100 * 100).areaError;
    expect(at(1e6)).toBeCloseTo(at(1), 12);
    expect(at(1e-6)).toBeCloseTo(at(1), 12);
  });

  it("reads the area of a circle container from its region", () => {
    const container: Region = { kind: "circle", cx: 0, cy: 0, r: 10 };
    const items: CellItem[] = [{ target: 1, cell: container }];
    expect(cellsOf(items, regionArea(container)).areaError).toBe(0);
    expect(cellsOf(items, 20 * 20).areaError).toBeGreaterThan(0.1);
  });

  it("counts the empty area of the container against the cells", () => {
    // One cell of half the container, with the target share 1.
    expect(cellsOf([{ target: 7, cell: rect(0, 0, 50, 100) }], 100 * 100).areaError).toBeCloseTo(0.25, 12);
  });

  it("stops at 1 for cells that overlap far outside the container", () => {
    const items: CellItem[] = [
      { target: 1, cell: rect(0, 0, 1000, 1000) },
      { target: 1e9, cell: rect(0, 0, 1, 1) },
    ];
    expect(cellsOf(items, 100).areaError).toBe(1);
  });

  it("gives the mean compactness of the cells", () => {
    const circle: Region = { kind: "circle", cx: 0, cy: 0, r: 3 };
    expect(cellsOf([{ target: 1, cell: circle }], 100).compactness).toBeCloseTo(1, 12);
    expect(cellsOf([{ target: 1, cell: rect(0, 0, 10, 10) }], 100).compactness).toBeCloseTo(SQUARE_COMPACTNESS, 12);
    // A 1 by 4 strip: P = 10, A = 4, so 100 / (16 PI).
    const both = cellsOf(
      [
        { target: 1, cell: circle },
        { target: 1, cell: rect(0, 0, 1, 4) },
      ],
      100,
    );
    expect(both.compactness).toBeCloseTo((1 + 100 / (16 * Math.PI)) / 2, 12);
  });

  it("gives Infinity for a cell with the area 0, and the best values for no items", () => {
    expect(cellsOf([{ target: 1, cell: rect(0, 0, 10, 0) }], 100).compactness).toBe(Infinity);
    expect(cellsOf([], 100)).toEqual({ areaError: 0, compactness: 1 });
  });

  it("refuses a bad target and a bad container area", () => {
    expect(() => cellsOf([{ target: 0, cell: rect(0, 0, 1, 1) }], 100)).toThrow(RangeError);
    expect(() => cellsOf([{ target: Number.NaN, cell: rect(0, 0, 1, 1) }], 100)).toThrow(RangeError);
    expect(() => cellsOf([], 0)).toThrow(RangeError);
    expect(() => cellsOf([], Infinity)).toThrow(RangeError);
  });
});

describe("the cell measures", () => {
  it("gives the values and the specs with the prefix of the stage", () => {
    expect(cellMeasures("pack", { areaError: 0.1, compactness: 1.5 })).toEqual({ "pack.cell.areaError": 0.1, "pack.cell.compactness": 1.5 });
    const specs = cellMeasureSpecs("pack");
    expect(specs.map((s) => s.id)).toEqual(CELL_MEASURE_SUFFIXES.map((s) => `pack.${s}`));
    expect(specs.map((s) => [s.unit, s.direction, s.min, s.max, s.family])).toEqual([
      ["share", "lower", 0, 1, "cell"],
      ["ratio", "lower", 1, Infinity, "cell"],
    ]);
  });

  it("gives registry entries without faults, with a loss of 0.5 for a square cell", () => {
    const entries = cellMeasureEntries("pack");
    expect(checkRegistry(entries)).toEqual([]);
    const [area, compact] = entries;
    expect(area!.normalize).toEqual({ kind: "range" });
    expect(normalizeMeasure(0.25, area!)).toBe(0.25);
    expect(normalizeMeasure(SQUARE_COMPACTNESS, compact!)).toBeCloseTo(0.5, 12);
    expect(normalizeMeasure(1, compact!)).toBe(0);
  });

  it("supports a polygon cell, and refuses a free box", () => {
    const input = (shapeKind?: "free") => ({
      schema: "layout-input/1" as const,
      id: "t",
      boxes: [{ id: "a", w: 10, h: 10, ...(shapeKind === undefined ? { shape: { kind: "polygon" as const, points: [[0, 0], [10, 0], [0, 10]] as const } } : { shapeKind }) }],
    });
    expect(checkShapes(input(), cellMeasureSpecs("pack"))).toEqual([]);
    expect(checkShapes(input("free"), cellMeasureSpecs("pack"))).toHaveLength(2);
  });
});
