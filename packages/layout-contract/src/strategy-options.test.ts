import { describe, expect, it } from "vitest";
import {
  checkOptions,
  checkSchema,
  clampOptions,
  type DeclaredStrategy,
  declarationIssues,
  listOptions,
  optionDefaults,
  optionIssue,
  sweepGrid,
  sweepOf,
  sweepValues,
} from "./strategy-options.ts";

interface Options {
  readonly stretch?: number;
  readonly count?: number;
  readonly open?: boolean;
  readonly mode?: "a" | "b";
  readonly rule?: "named" | (() => number);
  readonly list?: readonly number[];
  readonly data?: { readonly x: number };
  readonly step?: number;
}

const strategy: DeclaredStrategy<Options> = {
  name: "demo",
  defaults: { stretch: 2 },
  schema: {
    stretch: { type: "number", describe: "The stretch.", min: 1, max: 4, scale: "log", special: [Infinity], marks: [1, 2, Infinity] },
    count: { type: "integer", describe: "The count.", min: 0, max: 4, default: 1 },
    open: { type: "boolean", describe: "Open.", default: false },
    mode: { type: "enum", describe: "The mode.", values: ["a", "b"], default: "a" },
    rule: { type: "enum", describe: "The rule.", values: ["named"], custom: "function" },
    list: { type: "list", describe: "The list." },
    data: { type: "object", describe: "The data." },
    step: { type: "number", describe: "The step.", min: 0, max: 1, values: [0, 0.5, 1] },
  },
};

describe("the defaults of a strategy", () => {
  it("gives defaults first, then the default of the declaration", () => {
    expect(optionDefaults(strategy)).toEqual({ stretch: 2, count: 1, open: false, mode: "a" });
  });

  it("keeps a default without a declaration, and gives nothing for a strategy without a schema", () => {
    expect(optionDefaults({ name: "x", defaults: { a: 1 } })).toEqual({ a: 1 });
    expect(listOptions({ name: "x", defaults: {} })).toEqual([]);
  });

  it("lists the options in the order of the schema", () => {
    const list = listOptions(strategy);
    expect(list.map((o) => o.key)).toEqual(["stretch", "count", "open", "mode", "rule", "list", "data", "step"]);
    expect(list[0]!.value).toBe(2);
  });
});

describe("the check of values", () => {
  const problem = (options: Partial<Options>): string | undefined => checkOptions(strategy, options)[0]?.problem;

  it("takes good values, and a special value outside the range", () => {
    expect(checkOptions(strategy, { stretch: Infinity, count: 2, open: true, mode: "b", rule: () => 1, list: [1], data: { x: 1 }, step: 0.5 })).toEqual([]);
    expect(checkOptions(strategy, { stretch: undefined } as never)).toEqual([]);
  });

  it("names each kind of problem", () => {
    expect(problem({ stretch: Number.NaN })).toBe("type");
    expect(problem({ stretch: 9 })).toBe("range");
    expect(problem({ count: 1.5 })).toBe("integer");
    expect(problem({ step: 0.25 })).toBe("value");
    expect(problem({ open: 1 as never })).toBe("type");
    expect(problem({ mode: "c" as never })).toBe("value");
    expect(problem({ list: 1 as never })).toBe("type");
    expect(problem({ data: null as never })).toBe("type");
    expect(checkOptions(strategy, { other: 1 } as never)[0]?.problem).toBe("unknown");
  });

  it("gives no issue for a strategy without a schema", () => {
    expect(checkOptions<object>({ name: "x", defaults: {} }, { a: 1 })).toEqual([]);
  });

  it("examines a function option", () => {
    const d = { type: "function", describe: "x" } as const;
    expect(optionIssue("f", () => 1, d)).toBeUndefined();
    expect(optionIssue("f", 1, d)?.problem).toBe("type");
  });
});

describe("the clamp of values", () => {
  it("moves numbers into the range, and keeps each other value", () => {
    expect(clampOptions(strategy, { stretch: 9, count: 3.6 })).toEqual({ stretch: 4, count: 4 });
    expect(clampOptions(strategy, { stretch: Infinity, mode: "b", step: 0.4 })).toEqual({ stretch: Infinity, mode: "b", step: 0.5 });
  });
});

describe("the sweeps", () => {
  it("gives the marks, the values, or points on the range", () => {
    expect(sweepValues(strategy.schema!.stretch)).toEqual([1, 2, Infinity]);
    expect(sweepValues(strategy.schema!.step)).toEqual([0, 0.5, 1]);
    expect(sweepValues(strategy.schema!.count)).toEqual([0, 1, 2, 3, 4]);
    expect(sweepValues(strategy.schema!.open)).toEqual([false, true]);
    expect(sweepValues(strategy.schema!.mode)).toEqual(["a", "b"]);
  });

  it("gives equal ratios on the scale log, special values on request, and a grain", () => {
    expect(sweepValues(strategy.schema!.stretch, { count: 3 })).toEqual([1, 2, 4]);
    expect(sweepValues(strategy.schema!.stretch, { count: 2, special: true })).toEqual([1, 4, Infinity]);
    expect(sweepValues({ type: "number", describe: "x", min: 0, max: 1, step: 0.5 }, { count: 9 })).toEqual([0, 0.5, 1]);
    expect(sweepValues({ type: "number", describe: "x", min: 0, max: 1 }, { count: 1 })).toEqual([0]);
  });

  it("throws for a type without a sweep", () => {
    expect(() => sweepValues(strategy.schema!.list)).toThrow(/has no sweep/);
  });

  it("names the settings of a sweep and of a grid", () => {
    expect(sweepOf(strategy, "mode")).toEqual([
      { name: "mode a", options: { mode: "a" } },
      { name: "mode b", options: { mode: "b" } },
    ]);
    const grid = sweepGrid(strategy, ["mode", "open"]);
    expect(grid).toHaveLength(4);
    expect(grid[3]).toEqual({ name: "mode b, open true", options: { mode: "b", open: true } });
    expect(sweepGrid(strategy, [])).toEqual([]);
  });

  it("throws for a key without a declaration", () => {
    expect(() => sweepOf(strategy, "other" as never)).toThrow(/no declaration/);
  });
});

describe("the check of a schema", () => {
  it("passes a good schema", () => {
    expect(checkSchema(strategy)).toEqual([]);
  });

  it("finds a default without a declaration, and a default out of the range", () => {
    expect(checkSchema({ ...strategy, defaults: { other: 1 } as Options })[0]).toContain("without a declaration");
    expect(checkSchema({ ...strategy, defaults: { count: 9 } })[0]).toContain("out of the range");
  });

  it("finds each bad declaration", () => {
    const issues = (d: Parameters<typeof declarationIssues>[1]): string => declarationIssues("k", d).join(" ");
    expect(issues({ type: "boolean", describe: " " })).toContain("no description");
    expect(issues({ type: "number", describe: "x", min: 2, max: 1 })).toContain("bad range");
    expect(issues({ type: "integer", describe: "x", min: 0.5, max: 1 })).toContain("not whole");
    expect(issues({ type: "number", describe: "x", min: 0, max: 1, step: 0 })).toContain("A step is more than 0");
    expect(issues({ type: "number", describe: "x", min: 0, max: 1, scale: "log" })).toContain("needs a min above 0");
    expect(issues({ type: "number", describe: "x", min: 0, max: 1, values: [] })).toContain("empty list");
    expect(issues({ type: "number", describe: "x", min: 0, max: 1, values: [2] })).toContain("not on its range");
    expect(issues({ type: "number", describe: "x", min: 0, max: 1, marks: [2] })).toContain("out of the range");
    expect(issues({ type: "number", describe: "x", min: 0, max: 1, default: 2 })).toContain("out of the range");
    expect(issues({ type: "enum", describe: "x", values: [] })).toContain("no values");
    expect(issues({ type: "enum", describe: "x", values: ["a"], default: "b" })).toContain("not one of its values");
    expect(issues({ type: "boolean", describe: "x", default: 1 as never })).toContain("not true or false");
  });
});
