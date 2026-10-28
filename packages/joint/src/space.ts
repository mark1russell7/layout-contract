// The joint strategy space of the sweep (roadmap item L35, `docs/SWEEP.md`). It holds the pack entries, the routers and the lane option of the bench as data.
// The engines do not publish their spaces yet. When they do, `jointSpace(packSpace, routeSpace)` takes them, and a new `JointAdapter` runs their configs.
import {
  canonicalConfig,
  configId,
  productSpace,
  type SpaceParam,
  type SpaceStage,
  type StageChoice,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import {
  ITER_PREFIX,
  ITER_ROUNDS,
  ITER_VARIANTS,
  iterEntries,
  LANE_CAP,
  LANE_CLEARANCE,
  LANE_PREFIX,
  LANE_SEPARATOR,
  LANE_SPACE,
  laneEntries,
  type IterEntry,
  type LaneEntry,
  type LaneMode,
  type LaneOptions,
  type LaneVariant,
} from "./lanes.ts";
import { PACK_ENTRIES, pairId, ROUTERS } from "./runner.ts";

/** The name of the joint space. A joint config names the space with this value. */
export const JOINT_ENGINE = "joint";

/** The engine name of the pack part of the bench space. It is the name of the engine `packing`. */
export const PACK_ENGINE = "packing";

/** The engine name of the route part of the bench space. It is the name of the engine `highways`. */
export const ROUTE_ENGINE = "highways";

/** The stage of the pack part of the bench space: one option for each pack entry of `PACK_ENTRIES`. */
export const PACK_STAGE = "entry";

/** The stage of the route part of the bench space: one option for each router of `ROUTERS`. */
export const ROUTE_STAGE = "router";

/** The engine name of the part of the joint options. Its one stage `mode` is the lane option of L13. */
export const LANE_ENGINE = "lanes";

/** The stage of the lane option in the joint space. The stage is optional, and the value `null` is no lane pass. */
export const LANE_STAGE: string = `${LANE_ENGINE}.mode`;

/** The version of the stage `lanes` and of the bench parts. A change of their options or ranges gets a new version. Version `bench-2` adds the option `iter` of L11. */
export const BENCH_SPACE_VERSION = "bench-2";

/** The option of the stage `lanes.mode` for the iteration pairs of L11. */
export const ITER_OPTION = "iter";

/** This function gives the pack part of the bench space: the stage `entry` with the 13 pack entries, and a named config for each entry. */
export function benchPackSpace(): StrategySpace {
  return {
    schema: "strategy-space/1",
    engine: PACK_ENGINE,
    version: BENCH_SPACE_VERSION,
    stages: [{ name: PACK_STAGE, options: PACK_ENTRIES.map((e) => ({ id: e.id, params: [] })) }],
    named: Object.fromEntries(PACK_ENTRIES.map((e) => [e.id, { space: PACK_ENGINE, stages: { [PACK_STAGE]: { option: e.id } } }])),
  };
}

/** This function gives the route part of the bench space: the stage `router` with the 10 routers, and a named config for each router. */
export function benchRouteSpace(): StrategySpace {
  return {
    schema: "strategy-space/1",
    engine: ROUTE_ENGINE,
    version: BENCH_SPACE_VERSION,
    stages: [{ name: ROUTE_STAGE, options: ROUTERS.map((r) => ({ id: r, params: [] })) }],
    named: Object.fromEntries(ROUTERS.map((r) => [r, { space: ROUTE_ENGINE, stages: { [ROUTE_STAGE]: { option: r } } }])),
  };
}

/**
 * The params of each option of the stage `lanes`. The space that `k` lanes need is `2 * clearance + (k - 1) * space`, for at most `cap` lanes.
 * The defaults give the lane need `10 + 4(k - 1)` and the cap 8 of L13. `passes` is the count of the passes after the first pack.
 */
export const LANE_PARAMS: readonly SpaceParam[] = Object.freeze([
  { name: "passes", kind: "int", min: 1, max: 3, default: 1 },
  { name: "clearance", kind: "int", min: 2, max: 10, default: LANE_CLEARANCE },
  { name: "space", kind: "int", min: 2, max: 8, default: LANE_SPACE },
  { name: "cap", kind: "int", min: 1, max: 16, default: LANE_CAP },
]);

/** The params of the option `iter`: the round cap `rounds` of the iteration pairs of L11, from 1 to `ITER_ROUNDS`. */
export const ITER_PARAMS: readonly SpaceParam[] = Object.freeze([{ name: "rounds", kind: "int", min: 1, max: ITER_ROUNDS, default: ITER_ROUNDS }]);

/**
 * The stage `mode` of the joint options. The modes `max` and `sides` of `laneMargins` have the params `LANE_PARAMS`.
 * The option `iter` is the iteration of L11 with the params `ITER_PARAMS`. It uses the default lane options.
 */
export const LANE_SPACE_STAGE: SpaceStage = Object.freeze({
  name: "mode",
  optional: true,
  options: [
    { id: "max", params: LANE_PARAMS },
    { id: "sides", params: LANE_PARAMS },
    { id: ITER_OPTION, params: ITER_PARAMS },
  ],
});

/** This function gives the space of the joint options: the engine `lanes` with the stage `mode`. */
export function laneSpace(): StrategySpace {
  return { schema: "strategy-space/1", engine: LANE_ENGINE, version: BENCH_SPACE_VERSION, stages: [LANE_SPACE_STAGE] };
}

/** This function gives the stage choice of a lane variant with the default options. */
function laneChoice(variant: LaneVariant): StageChoice {
  return { option: variant.mode, params: { passes: variant.passes } };
}

/**
 * This function gives the joint space: the product of a pack space and a route space, and the part `lanes` of the joint options.
 * - The defaults are the bench parts `benchPackSpace` and `benchRouteSpace`. The engine spaces replace them when the engines publish them.
 * - The named configs are the pairs `<pack>+<router>` of the product, the lane pairs of L13 and the iteration pairs of L11.
 * - For example `lanes-sides.rows.corners+corners` and `lanes-iter2.rows.corners+corners`.
 */
export function jointSpace(pack: StrategySpace = benchPackSpace(), route: StrategySpace = benchRouteSpace(), options: StrategySpace = laneSpace()): StrategySpace {
  const base = productSpace(pack, route, JOINT_ENGINE);
  const named: Record<string, StrategyConfig> = { ...base.named };
  const add = (id: string, packId: string, router: string, choice: StageChoice): void => {
    const p = pack.named?.[packId];
    const r = route.named?.[router];
    if (p === undefined || r === undefined) return;
    const stages: Record<string, StageChoice | null> = {};
    for (const [k, c] of Object.entries(p.stages)) stages[`${pack.engine}.${k}`] = c;
    for (const [k, c] of Object.entries(r.stages)) stages[`${route.engine}.${k}`] = c;
    stages[LANE_STAGE] = choice;
    named[pairId(id, router)] = { space: JOINT_ENGINE, stages };
  };
  for (const lane of laneEntries()) add(lane.id, lane.pack, lane.router, laneChoice(lane.variant));
  for (const it of iterEntries()) add(it.id, it.pack, it.router, { option: ITER_OPTION, params: { rounds: it.variant.rounds } });
  const extra = options.stages.map((x) => ({ ...x, name: `${options.engine}.${x.name}` }));
  return { ...base, version: `${base.version}+${options.engine}@${options.version}`, stages: [...base.stages, ...extra], named, parts: [pack, route, options] };
}

/** The joint space of the bench: `jointSpace()` with the bench parts. */
export const JOINT_SPACE: StrategySpace = jointSpace();

/** What the runner does for one joint config: one pair of a pack entry and a router, and an optional lane entry or iteration entry. */
export interface ConfigRun {
  /** The id of the pack entry of `PACK_ENTRIES`. */
  readonly pack: string;
  readonly router: string;
  /** The lane entry of a config with the mode `max` or `sides`. Its options are the params of the stage. */
  readonly lane?: LaneEntry;
  /** The iteration entry of a config with the mode `iter`. */
  readonly iter?: IterEntry;
  /** The pair id of the records of the runner: `<pack>+<router>`, `<lane id>+<router>` or `<iteration id>+<router>`. */
  readonly pair: string;
  /** The count of the lane passes after the first pack. A config without lanes has 0. */
  readonly passes: number;
  /** The round cap of an iteration config. Another config has 0. */
  readonly rounds: number;
}

/**
 * The adapter from a joint config to the runner. The bench adapter reads the stages `packing.entry` and `highways.router`.
 * When the engines publish their spaces, a new adapter turns the configs of these spaces into pack options and routers.
 */
export interface JointAdapter {
  /** This function gives the pack entry of a config. */
  readonly pack: (config: StrategyConfig) => string;
  /** This function gives the router of a config. */
  readonly router: (config: StrategyConfig) => string;
}

/** This function gives the option of a stage of a config, or throws a `RangeError`. */
function optionOf(config: StrategyConfig, stage: string): string {
  const c = config.stages[stage];
  if (c === undefined || c === null) throw new RangeError(`The config of the space ${config.space} has no option for the stage ${stage}.`);
  return c.option;
}

/** The adapter of the bench parts. */
export const BENCH_ADAPTER: JointAdapter = Object.freeze({
  pack: (config: StrategyConfig): string => optionOf(config, `${PACK_ENGINE}.${PACK_STAGE}`),
  router: (config: StrategyConfig): string => optionOf(config, `${ROUTE_ENGINE}.${ROUTE_STAGE}`),
});

/** This function gives the name of a lane variant: `lanes-<mode>`, with the count of the passes after the mode when it is more than 1. */
export function laneVariantName(mode: LaneMode, passes: number): string {
  return `${LANE_PREFIX}${mode}${passes === 1 ? "" : passes}`;
}

/** This function gives the number of a param of a stage choice. */
function numberOf(choice: StageChoice, name: string): number {
  const v = choice.params?.[name];
  if (typeof v !== "number") throw new RangeError(`The lane choice has no number ${name}.`);
  return v;
}

/** This function gives what the runner does for a joint config. The config is first made canonical, so each param has a value. */
export function configRun(config: StrategyConfig, space: StrategySpace = JOINT_SPACE, adapter: JointAdapter = BENCH_ADAPTER): ConfigRun {
  const c = canonicalConfig(space, config);
  const pack = adapter.pack(c);
  const router = adapter.router(c);
  const choice = c.stages[LANE_STAGE] ?? null;
  if (choice === null) return { pack, router, pair: pairId(pack, router), passes: 0, rounds: 0 };
  if (choice.option === ITER_OPTION) {
    const rounds = numberOf(choice, "rounds");
    const variant = ITER_VARIANTS[rounds - 1] ?? { name: `${ITER_PREFIX}${rounds}`, rounds };
    const id = [variant.name, pack, router].join(LANE_SEPARATOR);
    return { pack, router, iter: { id, variant, pack, router }, pair: pairId(id, router), passes: 0, rounds };
  }
  const mode = choice.option as LaneMode;
  const passes = numberOf(choice, "passes");
  const options: LaneOptions = { clearance: numberOf(choice, "clearance"), space: numberOf(choice, "space"), cap: numberOf(choice, "cap") };
  // A lane entry with other options than the defaults gets the first 8 digits of the config id, so two entries of one unit never share an id.
  const plain = options.clearance === LANE_CLEARANCE && options.space === LANE_SPACE && options.cap === LANE_CAP;
  const name = laneVariantName(mode, passes) + (plain ? "" : `-${configId(space, c).slice(0, 8)}`);
  const variant: LaneVariant = { name, mode, passes };
  const id = [variant.name, pack, router].join(LANE_SEPARATOR);
  return { pack, router, lane: { id, variant, pack, router, options }, pair: pairId(id, router), passes, rounds: 0 };
}

/**
 * This function gives a short name of a config for a report. The name has the pair, and the lane mode with its params.
 * For example `maxrects-cp+corners sides p1 c5 s4 k8`: 1 pass, the clearance 5, the space 4 and the cap 8.
 */
export function configLabel(config: StrategyConfig, space: StrategySpace = JOINT_SPACE, adapter: JointAdapter = BENCH_ADAPTER): string {
  const run = configRun(config, space, adapter);
  const pair = pairId(run.pack, run.router);
  if (run.iter !== undefined) return `${pair} iter r${run.rounds}`;
  if (run.lane === undefined) return pair;
  const o = run.lane.options ?? {};
  return `${pair} ${run.lane.variant.mode} p${run.passes} c${o.clearance} s${o.space} k${o.cap}`;
}

/** This function gives the id of a named config of the joint space, for example of `rows+portfolio`. */
export function namedId(name: string, space: StrategySpace = JOINT_SPACE): string {
  const c = space.named?.[name];
  if (c === undefined) throw new RangeError(`The space ${space.engine} has no named config "${name}".`);
  return configId(space, c);
}
