import { describe, expect, it } from "vitest";
import { fitsWalk, walkPlan, walkPoint } from "./space-walk.ts";
import { checkConfig, STRATEGY_SPACE_SCHEMA, type SpaceStage, type StrategySpace } from "./strategy-space.ts";

// 40 routers. Each router permits its own 2 options of each stage of 12. These options have no params, so a break of a constraint is the only reason that checkConfig can give.
const small = (name: string): SpaceStage => ({ name, optional: true, options: Array.from({ length: 12 }, (_, i) => ({ id: `${name}${i}`, params: [] })) });
const routers = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, params: [] }));
const space: StrategySpace = {
  schema: STRATEGY_SPACE_SCHEMA,
  engine: "flip",
  version: "1",
  stages: [small("a"), { name: "router", options: routers }, small("b")],
  constraints: routers.flatMap((r, i) =>
    ["a", "b"].flatMap((stage) =>
      Array.from({ length: 12 }, (_, k) => k)
        .filter((k) => k !== i % 12 && k !== (i + 1) % 12)
        .map((k) => ({ if: { stage: "router", option: r.id }, then: { not: { stage, option: `${stage}${k}` } } })),
    ),
  ),
};

const N = 120;
const lists = space.stages.map((s) => [...s.options, ...(s.optional ? [null] : [])]);
// The strata of each stage are fixed, so that a change of the result has one cause. The first rows have the router `r0`.
// Under the fault, the open list of `a` for `r0` is a0, a1, a5 and null. The stratum 60 of 120 reads its third entry, so these rows read a5.
const picks = space.stages.map((s) => Array.from({ length: N }, (_, i) => (s.name === "a" ? (i + 60) % N : i)));

/** This function gives the reasons of `checkConfig` for each point of the walk that has a reason. */
function breaks(fits: typeof fitsWalk): string[] {
  const plan = walkPlan(space.stages, lists, space.constraints ?? [], N);
  return Array.from({ length: N }, (_, i) => {
    const stages = Object.fromEntries([...walkPoint(plan, picks, i, fits)].map(([stage, o]) => [stage, o === null ? null : { option: o.id, params: {} }]));
    return checkConfig(space, { space: space.engine, stages }).map((b) => b.detail);
  }).flat();
}

describe("the flip of a walk step", () => {
  it("reads no break on the real step", () => {
    expect(breaks(fitsWalk)).toEqual([]);
  });

  it("reads the stated break and no other on a step that opens one refused option", () => {
    // The fault: for the router r0, the option a5 stays open. Each other step is the real step.
    const fault: typeof fitsWalk = (constraints, fixed, stage, id) => (stage === "a" && id === "a5" && fixed.get("router") === "r0") || fitsWalk(constraints, fixed, stage, id);
    const reasons = breaks(fault);
    expect(reasons).toHaveLength(3);
    expect(new Set(reasons)).toEqual(new Set(["the config breaks the constraint if router=r0 then not a=a5"]));
  });
});

describe("walkPlan", () => {
  it("orders the stages from the largest, and keeps the order of the space for equal sizes", () => {
    const plan = walkPlan(space.stages, lists, space.constraints ?? [], N);
    expect(plan.order).toEqual([1, 0, 2]);
  });
});
