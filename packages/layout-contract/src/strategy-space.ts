// The format of a strategy space has its home in `@mark1russell7/strategy-space` (`docs/STRATEGY-SPACE.md` of that repository).
// This module re-exports the format. Its checks take the shape kinds of this package, `SHAPE_KIND_IDS`, when a caller gives no list.
import {
  checkSpace as checkSpaceOf,
  enumerateSpace as enumerateSpaceOf,
  type EnumerateOptions,
  type KindOptions,
  type SpaceSize,
  type SpaceSizeOptions,
  spaceShapeKinds as spaceShapeKindsOf,
  spaceSize as spaceSizeOf,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/strategy-space";
import type { ClaimBreak } from "./corpus.ts";
import { SHAPE_KIND_IDS } from "./shapes.ts";

export {
  type AnyOption,
  type BooleanOption,
  canonicalConfig,
  checkConfig,
  checkOptions,
  checkSchema,
  clampOptions,
  configId,
  type DeclaredStrategy,
  declarationIssues,
  type EnumerateOptions,
  type EnumOption,
  type GridOptions,
  joinConfigs,
  type KindOptions,
  type ListItem,
  listOptions,
  type MemberRule,
  type NoDefault,
  type NoDefaultReason,
  type NumberOption,
  type OptionDeclaration,
  optionDefaults,
  type OptionIssue,
  optionIssue,
  type OptionRef,
  type OptionScale,
  type OptionSchema,
  type OptionSetting,
  type OptionSupports,
  paramActive,
  paramAt,
  type ParamKind,
  paramLevels,
  paramProblem,
  paramUnit,
  type ParamValue,
  paramValue,
  type ParamWhen,
  productSpace,
  type SampleOptions,
  type ShapeFilter,
  type SpaceConstraint,
  type SpaceParam,
  type SpaceSize,
  type SpaceSizeOptions,
  type SpaceStage,
  splitConfig,
  type StageChoice,
  type StageOption,
  STRATEGY_SPACE_SCHEMA,
  type StrategyConfig,
  type StrategySpace,
  sweepGrid,
  sweepOf,
  type SweepOptions,
  sweepValues,
  type ValueOption,
} from "@mark1russell7/strategy-space";

/** This function gives the known shape kinds of a check: the list of the caller, or `SHAPE_KIND_IDS`. */
const withKinds = <T extends KindOptions>(options: T): T => ({ kinds: SHAPE_KIND_IDS, ...options });

/**
 * This function checks a space with `checkSpace` of `@mark1russell7/strategy-space`.
 * Without `kinds`, a shape kind of a `supports` that is not in `SHAPE_KIND_IDS` gives the claim `shape`.
 */
export function checkSpace(space: StrategySpace, kindOptions: KindOptions = {}): ClaimBreak[] {
  return checkSpaceOf(space, withKinds(kindOptions));
}

/**
 * This function counts the grid points of a space with `spaceSize` of `@mark1russell7/strategy-space`.
 * Without `kinds`, a shape kind that is not in `SHAPE_KIND_IDS` causes an error.
 */
export function spaceSize(space: StrategySpace, options: SpaceSizeOptions): SpaceSize {
  return spaceSizeOf(space, withKinds(options));
}

/**
 * This function gives the configs of a grid or a sample with `enumerateSpace` of `@mark1russell7/strategy-space`.
 * Without `kinds`, a shape kind that is not in `SHAPE_KIND_IDS` causes an error.
 */
export function enumerateSpace(space: StrategySpace, options: EnumerateOptions): StrategyConfig[] {
  return enumerateSpaceOf(space, withKinds(options));
}

/**
 * This function gives the shape kinds that a space accepts, with `spaceShapeKinds` of `@mark1russell7/strategy-space`.
 * Without `kinds`, it examines the kinds of `SHAPE_KIND_IDS`, in their order.
 */
export function spaceShapeKinds(space: StrategySpace, options: KindOptions = {}): string[] {
  return spaceShapeKindsOf(space, withKinds(options));
}
