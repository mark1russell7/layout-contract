// The step `open-sizes` of the joint corpus `joint-v3` (`docs/CORPUS.md`). The closed list of 6 size names of `rect-grid` stays.
// This step gives the corpus named points of the open families of `@mark1russell7/rigor-generators`.
import type { LayoutBox, LayoutContainer, LayoutGenerator, LayoutInput } from "@mark1russell7/layout-contract";
import { DIAGRAM_BOX_AREA, GIT_BLOB_BYTES, random, recordedSpec, type RecordedTable, sampler, type DistributionSpec } from "@mark1russell7/rigor-generators";

/** The version of `openSizesStep`. A change of its output gives a new version. */
export const OPEN_SIZES_STEP_VERSION = 1;

/** The value of the dimension `openSize` for an input that keeps the sizes of its generator. */
export const NO_OPEN_SIZE = "none";

/** The largest side of a box as a share of the same side of its container, when the container has that side. */
export const MAX_SIDE_SHARE = 0.6;

/**
 * The named points of the open families. A parameter with a range changes for each input, so one name covers a part of its family.
 * Each number is the relative area of one box.
 */
export const OPEN_SIZES: Readonly<Record<string, DistributionSpec>> = Object.freeze({
  "lognormal-narrow": { family: "lognormal", mu: 0, sigma: [0.3, 0.6] },
  "lognormal-wide": { family: "lognormal", mu: 0, sigma: [1, 1.5] },
  "pareto-heavy": { family: "pareto", scale: 1, shape: [1.1, 2] },
  "zipf-ranks": { family: "zipf", n: 40, exponent: [0.8, 1.3] },
  "beta-bowl": { family: "beta", a: [0.4, 0.7], b: [0.4, 0.7] },
  "two-modes": {
    family: "mixture",
    parts: [
      { weight: 4, part: { family: "lognormal", mu: 0, sigma: 0.3 } },
      { weight: 1, part: { family: "lognormal", mu: 2.5, sigma: 0.3 } },
    ],
  },
});

/** The names of `OPEN_SIZES`, in their order. */
export const OPEN_SIZE_NAMES: readonly string[] = Object.freeze(Object.keys(OPEN_SIZES));

/**
 * The named points of the recorded tables of `@mark1russell7/rigor-generators`. Each number of a table is the relative area of one box.
 * These points are not values of `joint-v3`, so that corpus stays frozen. The site offers them as size choices. They have no bench result at this time.
 */
export const RECORDED_SIZE_TABLES: Readonly<Record<string, RecordedTable>> = Object.freeze({
  "recorded-diagram-boxes": DIAGRAM_BOX_AREA,
  "recorded-git-blobs": GIT_BLOB_BYTES,
});

/** The names of `RECORDED_SIZE_TABLES`, in their order. */
export const RECORDED_SIZE_NAMES: readonly string[] = Object.freeze(Object.keys(RECORDED_SIZE_TABLES));

/** The parameters of `openSizesStep`. */
export interface OpenSizesParams {
  /** A name of `OPEN_SIZES` or `RECORDED_SIZE_TABLES`, or `NO_OPEN_SIZE`. */
  readonly point: string;
}

/** This function gives the largest factor for a box, so that its sides stay in the limit of the container. */
function sideLimit(box: LayoutBox, container: LayoutContainer | undefined): number {
  const width = container?.w === undefined ? Number.POSITIVE_INFINITY : (MAX_SIDE_SHARE * container.w) / box.w;
  const height = container?.h === undefined ? Number.POSITIVE_INFINITY : (MAX_SIDE_SHARE * container.h) / box.h;
  return Math.min(width, height);
}

/**
 * This function gives the input with a new area for each box, from one sampler of the point.
 * Each box keeps its aspect, and the total area stays the same when no side reaches `MAX_SIDE_SHARE`. A side has a length of 1 or more.
 * The value `NO_OPEN_SIZE` gives the same input with no stamp. The function throws a `RangeError` for another name.
 * The step goes before the step `edges`, because the hubs of `edges` are the largest boxes.
 */
export function openSizesStep(input: LayoutInput, params: OpenSizesParams, seed: number = input.seed ?? 0): LayoutInput {
  if (params.point === NO_OPEN_SIZE) return input;
  const table = RECORDED_SIZE_TABLES[params.point];
  const spec = table === undefined ? OPEN_SIZES[params.point] : recordedSpec(table);
  if (spec === undefined) throw new RangeError(`openSizesStep: the point is ${[NO_OPEN_SIZE, ...OPEN_SIZE_NAMES, ...RECORDED_SIZE_NAMES].join(", ")}, not "${params.point}".`);
  const next = sampler(spec, random(`open-sizes/${params.point}/${seed}`));
  const draws = input.boxes.map(() => next());
  const drawn = draws.reduce((a, b) => a + b, 0);
  const area = input.boxes.reduce((a, b) => a + b.w * b.h, 0);
  const boxes = input.boxes.map((box, i): LayoutBox => {
    const factor = Math.min(Math.sqrt((((draws[i] ?? 0) / drawn) * area) / (box.w * box.h)), sideLimit(box, input.container));
    return { ...box, w: Math.max(1, Math.round(box.w * factor)), h: Math.max(1, Math.round(box.h * factor)) };
  });
  const stamp: LayoutGenerator = { name: "open-sizes", version: OPEN_SIZES_STEP_VERSION, params: { point: params.point }, seed };
  const { hash: _old, ...rest } = input;
  return { ...rest, boxes, steps: [...(input.steps ?? []), stamp] };
}
