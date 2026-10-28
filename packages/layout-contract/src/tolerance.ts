/** The epsilon for the float compares in an engine. */
export const EPS = 1e-6;

/**
 * The count of grid steps in one unit of a written file. A file rounds each number `v` to `Math.round(v * RECORD_SCALE) / RECORD_SCALE`.
 * Use a multiplication by this value, not a division by `RECORD_EPS`. The two differ at some half steps.
 */
export const RECORD_SCALE = 1000;

/**
 * The epsilon for the float compares on a written file. A file rounds each number to 3 decimals,
 * so a difference of two values can move by up to 0.001. It is `1 / RECORD_SCALE`.
 */
export const RECORD_EPS = 1 / RECORD_SCALE;

/**
 * The tolerance of each hard rule, in layout units. A record writes the tolerance that its run used,
 * in its field `tolerance`, next to `hard`.
 */
export interface Tolerance {
  /** Two boxes with their margins break `no-overlap` when their insides overlap by more than this on each axis. */
  readonly overlap: number;
  /** A route breaks `no-pass-through` when a part longer than this is inside a box made this much smaller. */
  readonly through: number;
}

/**
 * The default tolerance of each rule. The packer is exact, so `overlap` is one unit of the rounding.
 * Routes are sampled curves that follow the margin line, so `through` is larger.
 */
export const DEFAULT_TOLERANCE: Tolerance = Object.freeze({ overlap: 0.001, through: 0.5 });
