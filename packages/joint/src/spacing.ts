// The step `spacing` of the joint corpus `joint-v2` (decisions d3 and d7 of `layout-stack`). It is data of the corpus, not a part of the contract.
import type { LayoutBox, LayoutGenerator, LayoutInput } from "@mark1russell7/layout-contract";

/** The version of `spacingStep`. A change of its output gives a new version. */
export const SPACING_STEP_VERSION = 1;

/**
 * The route clearance of `highways` 0.5.1 in units. The corner graph puts its corners 5 units (its option `margin`) out from each box.
 * Thus two boxes 10 units apart share one line of corners in the middle, with 5 units to each box. The text is in `docs/JOINT-CORPUS.md`.
 */
export const ROUTE_CLEARANCE = 10;

/** The values of the dimension `spacing`. `stress` is the stress cell of d7: no margin and no gap. */
export const SPACINGS = ["stress", "gap", "margin", "both"] as const;

/** One value of the dimension `spacing`. */
export type Spacing = (typeof SPACINGS)[number];

/** The margin of each box and the gap of the input for each value of `spacing`. The other values have `margin + gap` equal to `ROUTE_CLEARANCE`. */
export const SPACING_VALUES: Readonly<Record<Spacing, { readonly margin: number; readonly gap: number }>> = Object.freeze({
  stress: { margin: 0, gap: 0 },
  gap: { margin: 0, gap: ROUTE_CLEARANCE },
  margin: { margin: ROUTE_CLEARANCE, gap: 0 },
  both: { margin: ROUTE_CLEARANCE / 2, gap: ROUTE_CLEARANCE / 2 },
});

/** The parameters of `spacingStep`. */
export interface SpacingStepParams {
  readonly spacing: Spacing;
}

/** The full parameters of `spacingStep`: the value of `spacing`, with its margin and its gap. */
export interface SpacingParams {
  readonly spacing: Spacing;
  readonly margin: number;
  readonly gap: number;
}

/** This function gives the full parameters of a value of `spacing`. It throws a `RangeError` for an unknown value. */
export function spacingParams(spacing: Spacing): SpacingParams {
  const v = SPACING_VALUES[spacing];
  if (v === undefined) throw new RangeError(`spacingStep: the spacing is ${SPACINGS.join(", ")}, not "${String(spacing)}"`);
  return { spacing, margin: v.margin, gap: v.gap };
}

/**
 * This function gives the input with the margin of each box and the gap of its value of `spacing`. The input does not change.
 * A margin of 0 removes the field `margin` of each box. The input always gets `gap`, also when it is 0.
 * The step uses no random numbers. The function appends its stamp to `steps`, and removes the old `hash`, as `edgeStep` does.
 */
export function spacingStep(input: LayoutInput, params: SpacingStepParams, seed: number = input.seed ?? 0): LayoutInput {
  const full = spacingParams(params.spacing);
  const boxes = input.boxes.map((box): LayoutBox => {
    const { margin: _margin, ...rest } = box;
    return full.margin === 0 ? rest : { ...rest, margin: full.margin };
  });
  const stamp: LayoutGenerator = { name: "spacing", version: SPACING_STEP_VERSION, params: { ...full }, seed };
  const { hash: _old, ...rest } = input;
  return { ...rest, gap: full.gap, boxes, steps: [...(input.steps ?? []), stamp] };
}
