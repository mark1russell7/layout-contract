import type { Supports } from "./record.ts";

/**
 * The common fields of a strategy of an engine. Each engine adds its own function, for example `pack` or `route`.
 * `O` is the type of the options, and `S` is the type of `supports`.
 */
export interface StrategyInfo<O = unknown, S extends Supports = Supports> {
  /** A stable name, for example `shelf`. The records use it. */
  readonly id: string;
  /** The family of the catalog of the engine. */
  readonly family: string;
  /** The ids of the catalog rows that the strategy builds. */
  readonly catalog: readonly string[];
  /** For each dimension of the taxonomy, the values that the strategy supports. */
  readonly supports: S;
  /** The default options. A record writes the options in full. */
  readonly defaults: O;
  /** The value is `true` when the result depends only on the input, the options and the seed. */
  readonly deterministic: boolean;
}
