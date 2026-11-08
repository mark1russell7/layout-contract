import * as home from "@mark1russell7/strategy-space";
import { describe, expect, it } from "vitest";
import {
  canonicalConfig,
  canonicalJson,
  checkSpace,
  configId,
  enumerateSpace,
  SHAPE_KIND_IDS,
  sha256Hex,
  spaceShapeKinds,
  spaceSize,
  STRATEGY_SPACE_SCHEMA,
  type StrategyConfig,
  type StrategySpace,
} from "./index.ts";
import * as binding from "./strategy-space.ts";

// The format of a strategy space has its home in `@mark1russell7/strategy-space`. Its tests are in that repository.
// These tests examine the binding of this package: the same functions, and the shape kinds of `SHAPE_KIND_IDS` when a caller gives no list.

/** A made-up packer with 2 stages. One option supports the shape kinds `rect` and `circle`. */
const pack: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "pack",
  version: "0.0.1",
  stages: [
    { name: "order", options: [{ id: "area", params: [] }, { id: "height", params: [{ name: "reverse", kind: "bool", default: false }] }] },
    {
      name: "placement",
      options: [
        { id: "maxrects", params: [{ name: "rule", kind: "enum", values: ["bssf", "bl", "cp"], default: "bssf" }] },
        { id: "shelf", params: [], supports: { shape: ["rect", "circle"] } },
      ],
    },
  ],
};

/** The space `pack` with the shape kind `hexagon` on the option `placement.shelf`. */
const hexagon: StrategySpace = {
  ...pack,
  stages: pack.stages.map((s) => (s.name === "placement" ? { ...s, options: [s.options[0]!, { ...s.options[1]!, supports: { shape: ["hexagon"] } }] } : s)),
};

const config: StrategyConfig = { space: "pack", stages: { order: { option: "area" }, placement: { option: "maxrects", params: { rule: "cp" } } } };

describe("strategy-space binding", () => {
  it("re-exports the functions of the home, and wraps only the 4 checks that take shape kinds", () => {
    const own = ["checkSpace", "enumerateSpace", "spaceShapeKinds", "spaceSize"];
    const names = Object.keys(binding).filter((k) => k in home);
    expect(names.length).toBeGreaterThan(20);
    for (const k of names) {
      const same = (binding as Record<string, unknown>)[k] === (home as Record<string, unknown>)[k];
      expect(same, k).toBe(!own.includes(k));
    }
  });

  it("refuses a shape kind that is not in SHAPE_KIND_IDS when the caller gives no list", () => {
    expect(checkSpace(pack)).toEqual([]);
    expect(checkSpace(hexagon).map((b) => b.detail)).toEqual([
      `the option placement.shelf supports the shape kind "hexagon", which is not one of ${SHAPE_KIND_IDS.join(", ")}`,
    ]);
    expect(home.checkSpace(hexagon)).toEqual([]);
    expect(checkSpace(hexagon, { kinds: [...SHAPE_KIND_IDS, "hexagon"] })).toEqual([]);
    expect(() => spaceSize(pack, { levels: 1, shapes: ["hexagon"] })).toThrow(`The shape kind "hexagon" is not one of ${SHAPE_KIND_IDS.join(", ")}.`);
    expect(() => enumerateSpace(pack, { mode: "grid", levels: 1, shapes: ["hexagon"] })).toThrow(RangeError);
    expect(() => enumerateSpace(hexagon, { mode: "grid", levels: 1 })).toThrow(/not one of/);
  });

  it("gives the shape kinds of a space in the order of SHAPE_KIND_IDS", () => {
    expect(spaceShapeKinds(pack)).toEqual([...SHAPE_KIND_IDS]);
    const shelfOnly: StrategySpace = { ...pack, stages: pack.stages.map((s) => (s.name === "placement" ? { ...s, options: [s.options[1]!] } : s)) };
    expect(spaceShapeKinds(shelfOnly)).toEqual(["rect", "circle"]);
    // Without a list, the home examines only the kinds that the supports name.
    expect(home.spaceShapeKinds(pack)).toEqual(["rect", "circle"]);
  });

  it("gives a config id from the hashes of this package: SHA-256 of the canonical JSON, 16 hex characters", () => {
    expect(configId(pack, config)).toBe(sha256Hex(canonicalJson(canonicalConfig(pack, config))).slice(0, 16));
    expect(spaceSize(pack, { levels: 1 }).base).toBe(home.spaceSize(pack, { levels: 1 }).base);
  });
});
