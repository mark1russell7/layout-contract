// The catalog of the joint pages: the strategy spaces of the two engines, the controls of each option and the inputs.
// This file does not import the engines. `src/engines.ts` makes the catalog at build time, and the pages read it as data.
import type { IterEntry, LaneEntry } from "@layout-contract/joint/browser";
import { canonicalConfig, configId, type ParamValue, type SpaceParam, type StageChoice, type StageOption, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";

/** The value of an `enum` param that tells "do not set this option": the engine uses its own default. */
export const OMIT = "(default)";

/** The suffix of a mode param. The mode param `<key>.mode` tells if the option `<key>` gets the number of the param `<key>`, or a special value. */
export const MODE = ".mode";

/** The value of a mode param that gives the number of the param `<key>` to the option. */
export const VALUE = "value";

/** The name of the stage of the pack space and of the route space. */
export const PACK_STAGE = "strategy";
export const ROUTE_STAGE = "router";

/** The name of the stage of the space of the joint options (`laneSpace` of the joint package). The joint space names it `lanes.mode`. */
export const LANE_STAGE = "mode";

/** One pair of the joint space after the pairs of the product: a lane pair of L13 or an iteration pair of L11. */
export interface JointPair {
  /** The pair id, for example `lanes-sides.rows.corners+corners`. */
  readonly pair: string;
  readonly kind: "lanes" | "iter";
  readonly lane?: LaneEntry;
  readonly iter?: IterEntry;
}

/** One pack entry: an id, a strategy of `packing` and its options. It is the `PackEntry` of the joint runner. */
export interface PackChoice {
  readonly id: string;
  readonly strategy: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/** One router entry: an id, a router of `highways` and its options. It is the `RouterEntry` of the joint runner. */
export interface RouterChoice {
  readonly id: string;
  readonly router: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * The control of one declared option of one strategy.
 * - `param`: the space has a param for it. A number with a special value also has the mode param `<key>.mode`.
 * - `member`: the option holds the strategy that a meta option wraps. The member form sets it.
 * - `fixed`: the option holds a function, a strategy, a list or an object. The page shows it, and the engine uses its default.
 */
export interface Control {
  readonly engine: "packing" | "highways";
  readonly option: string;
  readonly key: string;
  readonly kind: "param" | "member" | "fixed";
  /** The names of the params of the control in the space. */
  readonly params: readonly string[];
  /** The type of the value of a `fixed` control, for example `function`. */
  readonly type?: string;
  /** One line that tells the option. */
  readonly describe: string;
  /** The value `true` tells that the site made the range, because the engine declares no range. */
  readonly derived: boolean;
}

/** One input of the corpus `joint-v2`, or one preset. The worker makes the input again from its spec and its seed. */
export interface InputRow {
  readonly id: string;
  /** The place of the spec in `jointSpecs("joint-v2")`. */
  readonly spec: number;
  readonly seed: number;
  readonly boxes: number;
  readonly edges: number;
  readonly hash: string;
  readonly stress: boolean;
  /** The kind of the input: `grid`, `ui` or `fixed`. */
  readonly array: string;
}

/** One line for each variant of the joint pairs. */
export const VARIANT_TEXT: Readonly<Record<string, string>> = {
  "lanes-max": "one gap for all boxes: the largest lane need of the board",
  "lanes-sides": "a margin for each side of each box, from the lanes of a first route",
  "lanes-sides2": "the same as lanes-sides, with a second pass",
  "lanes-iter1": "pack, route, widen the crowded sides and narrow the empty sides: at most 1 round",
  "lanes-iter2": "the same, at most 2 rounds",
  "lanes-iter3": "the same, at most 3 rounds",
};

/** The option of the form of the joint option that tells "no lane pass". The stage `lanes.mode` is optional, and this option gives no choice. */
export const LANE_NONE = "none";

/** One line for each option of the stage `mode` of the joint options, and for `LANE_NONE`. */
export const LANE_TEXT: Readonly<Record<string, string>> = {
  [LANE_NONE]: "No lane pass: pack once, then route once.",
  max: "Pack again with one gap for all boxes: the largest lane need of the board.",
  sides: "Pack again with a margin for each side of each box, from the lanes of the first route.",
  iter: "Pack, route, then widen the crowded sides and narrow the empty sides, for at most `rounds` rounds.",
};

/** This function gives the space of the form of the joint options: the space of `laneSpace` with the option `LANE_NONE` first. */
export function laneFormSpace(lanes: StrategySpace): StrategySpace {
  return { ...lanes, stages: lanes.stages.map((s) => (s.name === LANE_STAGE ? { ...s, options: [{ id: LANE_NONE, params: [] }, ...s.options] } : s)) };
}

/** The catalog of the joint pages. */
export interface JointCatalog {
  readonly versions: Readonly<Record<string, string>>;
  readonly pack: StrategySpace;
  readonly route: StrategySpace;
  /** `jointSpace(pack, route)` of the joint package: the product of the two spaces and the part `lanes` of the joint options. */
  readonly joint: StrategySpace;
  /** The space of the joint options: the stage `mode` with no lane pass, `max`, `sides` or `iter`. */
  readonly lanes: StrategySpace;
  /** The lane pairs and the iteration pairs of the joint space, in the order of the benchmark. */
  readonly jointPairs: readonly JointPair[];
  /** The value `engine` tells that the engine exports the space. The value `derived` tells that the site made it from the registry. */
  readonly source: { readonly pack: "engine" | "derived"; readonly route: "engine" | "derived" };
  readonly controls: readonly Control[];
  /** One line for each strategy of each engine. */
  readonly about: { readonly packing: Readonly<Record<string, string>>; readonly highways: Readonly<Record<string, string>> };
  /** The pack entries of the joint benchmark (`PACK_ENTRIES`). */
  readonly benchPacks: readonly PackChoice[];
  /** One pack entry for each strategy of `packing` that no entry of the benchmark uses. */
  readonly extraPacks: readonly PackChoice[];
  /** The routers of the joint benchmark (`ROUTERS`). */
  readonly routers: readonly string[];
  /** The open routers of the playground (`OPEN_ROUTERS`): the other highway strategies and the member forms of the portfolio. */
  readonly openRouters: readonly string[];
  readonly inputs: readonly InputRow[];
  /** The dimensions of the array `grid` of `joint-v2` without `count`. The page builds an input from one value of each. */
  readonly grid: Readonly<Record<string, readonly string[]>>;
  /** The largest count of boxes of an input of the full compare. */
  readonly compareMaxBoxes: number;
}

/** The option of a stage of a space. */
export function optionOf(space: StrategySpace, stage: string, option: string): StageOption | undefined {
  return space.stages.find((s) => s.name === stage)?.options.find((o) => o.id === option);
}

/**
 * This function gives the options of an engine from the params of one choice. A mode param gives `Infinity` or no option.
 * The value `OMIT` gives no option. The params must be the params of a canonical config, so each param is active.
 */
export function optionsOfParams(params: Readonly<Record<string, ParamValue>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(params)) {
    if (name.endsWith(MODE)) {
      const key = name.slice(0, -MODE.length);
      if (v === "Infinity") out[key] = Number.POSITIVE_INFINITY;
      else if (v === "-Infinity") out[key] = Number.NEGATIVE_INFINITY;
      continue;
    }
    if (v === OMIT) continue;
    out[name] = v;
  }
  return out;
}

/** This function gives the params of a choice from the options of an engine. It throws a `RangeError` for an option that has no param. */
export function paramsOfOptions(option: StageOption, options: Readonly<Record<string, unknown>>): Record<string, ParamValue> {
  const names = new Set(option.params.map((p) => p.name));
  const out: Record<string, ParamValue> = {};
  for (const [key, v] of Object.entries(options)) {
    if (names.has(key + MODE)) {
      if (typeof v === "number" && !Number.isFinite(v)) out[key + MODE] = v > 0 ? "Infinity" : "-Infinity";
      else {
        out[key + MODE] = VALUE;
        out[key] = v as ParamValue;
      }
      continue;
    }
    if (!names.has(key)) throw new RangeError(`The option ${option.id} has no param for the option "${key}".`);
    out[key] = v as ParamValue;
  }
  return out;
}

/** This function gives the config of the pack space for a pack entry. A meta option gets the entry of `options.strategy` as its member. */
export function packConfig(space: StrategySpace, entry: Omit<PackChoice, "id">): StrategyConfig {
  const option = optionOf(space, PACK_STAGE, entry.strategy);
  if (option === undefined) throw new RangeError(`The pack space has no strategy "${entry.strategy}".`);
  const { strategy, options: inner, ...rest } = entry.options as { strategy?: string; options?: Record<string, unknown> };
  if (option.members === undefined) return { space: space.engine, stages: { [PACK_STAGE]: { option: entry.strategy, params: paramsOfOptions(option, entry.options) } } };
  const members = strategy === undefined ? [] : [packConfig(space, { strategy, options: inner ?? {} })];
  return { space: space.engine, stages: { [PACK_STAGE]: { option: entry.strategy, params: paramsOfOptions(option, rest), members } } };
}

/** This function gives the config of the route space for a router entry. */
export function routeConfig(space: StrategySpace, entry: Omit<RouterChoice, "id">): StrategyConfig {
  const option = optionOf(space, ROUTE_STAGE, entry.router);
  if (option === undefined) throw new RangeError(`The route space has no router "${entry.router}".`);
  return { space: space.engine, stages: { [ROUTE_STAGE]: { option: entry.router, params: paramsOfOptions(option, entry.options) } } };
}

/** This function gives the strategy and the options of a pack config. A meta option puts its member in `strategy` and `options`. */
export function packOfConfig(space: StrategySpace, config: StrategyConfig): Omit<PackChoice, "id"> {
  const c = canonicalConfig(space, config).stages[PACK_STAGE] as StageChoice;
  const options = optionsOfParams(c.params ?? {});
  const member = c.members?.[0];
  if (member === undefined) return { strategy: c.option, options };
  const inner = packOfConfig(space, member);
  return { strategy: c.option, options: { ...options, strategy: inner.strategy, options: inner.options } };
}

/** This function gives the router and the options of a route config. */
export function routerOfConfig(space: StrategySpace, config: StrategyConfig): Omit<RouterChoice, "id"> {
  const c = canonicalConfig(space, config).stages[ROUTE_STAGE] as StageChoice;
  return { router: c.option, options: optionsOfParams(c.params ?? {}) };
}

/** This function gives the name of a named config with the same id as the config, or `undefined`. */
export function namedOf(space: StrategySpace, config: StrategyConfig): string | undefined {
  const id = configId(space, config);
  for (const [name, c] of Object.entries(space.named ?? {})) if (configId(space, c) === id) return name;
  return undefined;
}

/**
 * This function gives the pack entry and the router entry of a pair of configs, with their ids and their config ids.
 * A config that is a named point gets the name as its id. Another config gets `<option>~<first 6 characters of its config id>`.
 */
export function pairOfConfigs(
  catalog: Pick<JointCatalog, "pack" | "route">,
  pack: StrategyConfig,
  route: StrategyConfig,
): { readonly pack: PackChoice; readonly router: RouterChoice; readonly packId: string; readonly routeId: string } {
  const p = packOfConfig(catalog.pack, pack);
  const r = routerOfConfig(catalog.route, route);
  const packId = configId(catalog.pack, pack);
  const routeId = configId(catalog.route, route);
  return {
    pack: { id: namedOf(catalog.pack, pack) ?? `${p.strategy}~${packId.slice(0, 6)}`, ...p },
    router: { id: namedOf(catalog.route, route) ?? `${r.router}~${routeId.slice(0, 6)}`, ...r },
    packId,
    routeId,
  };
}

/** This function tells if a param is a mode param, and gives the name of its option. */
export function modeKey(p: SpaceParam): string | undefined {
  return p.name.endsWith(MODE) ? p.name.slice(0, -MODE.length) : undefined;
}
