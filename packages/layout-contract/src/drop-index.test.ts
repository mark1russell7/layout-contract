import { describe, expect, it } from "vitest";
import { dropIndex, type Point } from "./geometry.ts";

const p = (x: number, y: number): Point => ({ x, y });

// dropIndex came from @mark1russell7/collections (its API review, C12), with its tests.
describe("dropIndex", () => {
  it("reads the rows from top to bottom, then each row from left to right", () => {
    const grid = [p(50, 50), p(150, 50), p(50, 150)];
    expect(dropIndex(p(10, 50), grid)).toBe(0);
    expect(dropIndex(p(100, 55), grid)).toBe(1);
    expect(dropIndex(p(200, 50), grid)).toBe(2);
    expect(dropIndex(p(10, 100), grid)).toBe(2);
    expect(dropIndex(p(10, 400), grid)).toBe(3);
  });

  it("gives an index from 0 to the number of items, and takes the row tolerance", () => {
    expect(dropIndex(p(0, 0), [])).toBe(0);
    expect(dropIndex(p(10, 20), [p(50, 50)])).toBe(0);
    expect(dropIndex(p(60, 20), [p(50, 50)], 40)).toBe(1);
  });

  it("puts a point at the edge of the row tolerance in the row", () => {
    expect(dropIndex(p(60, 26), [p(50, 50)])).toBe(1);
    expect(dropIndex(p(60, 25), [p(50, 50)])).toBe(0);
    expect(dropIndex(p(40, 74), [p(50, 50)])).toBe(0);
    expect(dropIndex(p(60, 75), [p(50, 50)])).toBe(1);
  });
});
