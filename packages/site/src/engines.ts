// This file makes the catalog of the joint pages from the registries of the two engines. The build imports it, so the pages get the catalog as data.
// When an engine exports a strategy space (`packSpace` of `packing`, `routeSpace` of `highways`), the catalog uses it. Else it derives a space from the registry.
import { HIGHWAY_ROUTERS, highwayRouterOf, iterEntries, jointSpace, laneEntries, laneSpace, OPEN_ROUTERS, openRouterOf, PACK_ENTRIES, pairId, PORTFOLIO_ROUTER, ROUTERS } from "@layout-contract/joint/browser";
import {
  checkSpace,
  STRATEGY_SPACE_SCHEMA,
  type SpaceParam,
  type StageOption,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import * as highways from "@mark1russell7/highways";
import * as packing from "@mark1russell7/packing";
import { MODE, OMIT, PACK_STAGE, packConfig, ROUTE_STAGE, routeConfig, VALUE, type Control, type JointCatalog, type JointPair, type PackChoice } from "./catalog.ts";

/** The facts of one option of a strategy, before it becomes params. */
interface OptionSpec {
  readonly key: string;
  /** The schema of the option: the `OptionSchema` of `highways`, or one that the site made from a default. */
  readonly schema: Readonly<Record<string, unknown>>;
  /** The value that the strategy uses when the caller does not set the option. `undefined` tells that the option has no default. */
  readonly value: unknown;
  readonly derived: boolean;
}

/** A strategy as the catalog sees it: its id, its options and one line about it. */
interface StrategyFacts {
  readonly id: string;
  readonly about: string;
  readonly options: readonly OptionSpec[];
  /** The value `true` tells that the strategy wraps one other strategy: a meta option with one member. */
  readonly wraps?: { readonly keys: readonly string[]; readonly describe: string };
}

/** The types of an option value that no control can set. */
const FIXED_TYPES = new Set(["function", "strategy", "list", "object"]);

/** This function gives each exported list of strings of a module. A string option takes its values from the list that holds its default. */
function stringLists(mod: Readonly<Record<string, unknown>>): (readonly [string, readonly string[]])[] {
  return Object.entries(mod).filter((e): e is [string, string[]] => Array.isArray(e[1]) && e[1].length > 1 && e[1].every((x) => typeof x === "string"));
}

/**
 * This function gives the string lists for the options of one strategy. The lists with a name that starts with the id of the strategy come first.
 * For example, `maxrects` gets `MAXRECTS_RULES` before `GUILLOTINE_CHOICES`. Both lists hold `bssf`, but only the first list holds `bl`.
 */
function listsOf(lists: readonly (readonly [string, readonly string[]])[], strategy: string): (readonly string[])[] {
  const prefix = strategy.toUpperCase().replace(/-/g, "_").replace(/S$/, "");
  const own = lists.filter(([name]) => name.startsWith(prefix));
  return [...own, ...lists.filter((l) => !own.includes(l))].map(([, list]) => list);
}

/**
 * This function gives a schema for an option that has a default and no schema. The site makes it, so the field `derived` is `true`.
 * A whole number gets the range 0 or 1 to 4 times the value. A string gets the exported list that holds it. Another value is fixed.
 */
function schemaOfDefault(value: unknown, lists: readonly (readonly string[])[]): Readonly<Record<string, unknown>> {
  if (typeof value === "boolean") return { type: "boolean", default: value };
  if (typeof value === "number" && Number.isInteger(value)) {
    const max = Math.max(4, 4 * value);
    return value >= 1 && max >= 32 ? { type: "integer", min: 1, max, step: 1, scale: "log", default: value } : { type: "integer", min: 0, max, step: 1, default: value };
  }
  if (typeof value === "number" && Number.isFinite(value)) return { type: "number", min: 0, max: Math.max(1, 4 * value), default: value };
  if (typeof value === "string") return { type: "enum", values: lists.find((l) => l.includes(value)) ?? [value], default: value };
  return { type: typeof value === "function" ? "function" : Array.isArray(value) ? "list" : "object" };
}

/**
 * The options of the strategies of `packing` that have no default, from the option types of `packing` 0.2.17.
 * `packing` declares no option schema, so the site lists them here. The completeness test checks each key of `defaults` without this list.
 */
const PACK_EXTRAS: Readonly<Record<string, readonly OptionSpec[]>> = {
  shelf: [{ key: "fit", schema: { type: "enum", values: [OMIT, ...packing.SHELF_FITS], default: OMIT, describe: "The fit rule of a shelf. The default is the rule of version 0.2.3." }, value: undefined, derived: false }],
  maxrects: [
    {
      key: "bandHeight",
      schema: { type: "integer", min: 8, max: 4 * packing.MAXRECTS_BANDS, step: 8, default: packing.MAXRECTS_BANDS, describe: "The largest height of a band in a space that is not plain." },
      value: undefined,
      derived: true,
    },
  ],
  portfolio: [
    { key: "k", schema: { type: "enum", values: [OMIT, 2, 3], default: OMIT, describe: "The size of the set of the cell. The default uses the set of 3." }, value: undefined, derived: false },
    { key: "maxMembers", schema: { type: "integer", min: 1, max: 16, step: 1, default: 3, describe: "The largest count of the members that run." }, value: undefined, derived: true },
    { key: "budgetMs", schema: { type: "number", min: 1, max: 2000, scale: "log", default: packing.PORTFOLIO_FRAME_MS, describe: "The time limit in milliseconds. A cut member makes the result not deterministic." }, value: undefined, derived: true },
    { key: "members", schema: { type: "list", describe: "The members of each input. The default is the set of the cell." }, value: undefined, derived: false },
    { key: "key", schema: { type: "list", describe: "The measure ids of the key after the hard breaks." }, value: undefined, derived: false },
  ],
  "aspect-fit": [
    { key: "targetAspect", schema: { type: "number", min: 0.25, max: 4, scale: "log", default: 1, describe: "The target aspect: the width divided by the height. The default is the aspect of the container." }, value: undefined, derived: true },
  ],
  select: [
    { key: "members", schema: { type: "list", describe: "The members that the table picks from." }, value: undefined, derived: false },
    { key: "table", schema: { type: "object", describe: "The table of the picks." }, value: undefined, derived: false },
  ],
};

/** The options of a strategy of `packing` that hold the strategy that it wraps. */
const PACK_WRAPS: Readonly<Record<string, { readonly keys: readonly string[]; readonly describe: string }>> = {
  "aspect-fit": { keys: ["strategy", "options"], describe: "The strategy that aspect-fit wraps, and its options." },
};

/** One line about each strategy of `packing`. A new strategy gets its family. */
const PACK_ABOUT: Readonly<Record<string, string>> = {
  rows: "Puts the boxes in rows, from the top.",
  skyline: "Puts each box on the lowest part of the top line.",
  shelf: "Puts the boxes on shelves of the height of the first box.",
  push: "Pushes boxes away to make room. Only for the mode incremental.",
  maxrects: "Keeps a list of the free rectangles, and fills the best one.",
  portfolio: "Packs with a set of strategies and keeps the best output.",
  "aspect-fit": "Packs at some widths near the target aspect, and keeps the best output.",
  select: "Picks rows or maxrects-bl from the features of the input.",
};

/** This function gives the facts of each strategy of `packing`: the base strategies, then the composites. */
function packFacts(): StrategyFacts[] {
  const all = stringLists(packing as unknown as Record<string, unknown>);
  return [...packing.strategies, ...packing.composites].map((s) => {
    const defaults = (s.defaults ?? {}) as Readonly<Record<string, unknown>>;
    const lists = listsOf(all, s.id);
    const options: OptionSpec[] = Object.entries(defaults).map(([key, value]) => ({ key, schema: schemaOfDefault(value, lists), value, derived: true }));
    for (const extra of PACK_EXTRAS[s.id] ?? []) if (!options.some((o) => o.key === extra.key)) options.push(extra);
    const wraps = PACK_WRAPS[s.id];
    return { id: s.id, about: PACK_ABOUT[s.id] ?? `A strategy of the family ${s.family}.`, options, ...(wraps === undefined ? {} : { wraps }) };
  });
}

/** One router strategy of `highways`, as the registry gives it. */
interface RouterStrategy {
  readonly name: string;
  readonly describe?: string;
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly schema?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * This function gives the router strategies of the joint benchmark in the order of `ROUTERS`. Each strategy gives its own `schema`.
 * The list has the router strategies of `highways`, the highway strategies of `HIGHWAY_ROUTERS` as routers, and `portfolioStrategy`.
 * Then the list has the open routers of `OPEN_ROUTERS`. Only the playground uses them.
 */
function jointRouterStrategies(): RouterStrategy[] {
  const list = highways.listStrategies(highways.STRATEGIES, "router") as unknown as readonly RouterStrategy[];
  const wave = HIGHWAY_ROUTERS.map((name) => highwayRouterOf(name) as unknown as RouterStrategy);
  const open = OPEN_ROUTERS.map((name) => ({ ...(openRouterOf(name) as unknown as RouterStrategy), name }));
  return [...list, ...wave, { ...(highways.portfolioStrategy as unknown as RouterStrategy), name: PORTFOLIO_ROUTER }, ...open];
}

/** This function gives the keys of the options of a router strategy: the keys of `schema`, then the keys of `defaults` without a declaration. */
function routerKeys(s: RouterStrategy): string[] {
  return [...new Set([...Object.keys(s.schema ?? {}), ...Object.keys(s.defaults ?? {})])];
}

/**
 * This function gives the facts of each router of the joint benchmark, from the declarations of `highways` (SCHEMA-GAPS).
 * The site makes a schema only for an option without a declaration. The portfolio router declares each option except the clock `now`.
 */
function routeFacts(): StrategyFacts[] {
  return jointRouterStrategies().map((s) => {
    const defaults = highways.optionDefaults(s as never) as Readonly<Record<string, unknown>>;
    const schema = s.schema ?? {};
    const options = routerKeys(s).map((key): OptionSpec => {
      const given = schema[key];
      const value = Object.hasOwn(defaults, key) ? defaults[key] : given?.["default"];
      return given === undefined ? { key, schema: schemaOfDefault(value, []), value, derived: true } : { key, schema: given, value, derived: false };
    });
    return { id: s.name, about: s.describe ?? "", options };
  });
}

/** This function gives the step of a number on the grid of a schema: the value of `step`, or none. */
const stepOf = (schema: Readonly<Record<string, unknown>>): number | undefined => (typeof schema["step"] === "number" ? schema["step"] : undefined);

/** This function gives the params of one option, and the kind of its control. */
function paramsOf(o: OptionSpec): { readonly params: SpaceParam[]; readonly kind: Control["kind"]; readonly type?: string } {
  const s = o.schema;
  const type = String(s["type"]);
  if (FIXED_TYPES.has(type)) return { params: [], kind: "fixed", type };
  if (type === "boolean") return { params: [{ name: o.key, kind: "bool", default: typeof o.value === "boolean" ? o.value : Boolean(s["default"]) }], kind: "param" };
  if (type === "enum") {
    const values = (s["values"] as (string | number)[]).map((v) => v);
    const value = o.value ?? s["default"];
    return { params: [{ name: o.key, kind: "enum", values, default: (values.includes(value as string) ? value : values[0]) as string }], kind: "param" };
  }
  // A number with `values` takes only those values, so its control is a list. Without a default, the list also has `OMIT`.
  if (Array.isArray(s["values"])) {
    const value = o.value ?? s["default"];
    const listed = (s["values"] as number[]).filter((v) => typeof v === "number");
    const values: (string | number)[] = value === undefined ? [OMIT, ...listed] : listed;
    return { params: [{ name: o.key, kind: "enum", values, default: (values.includes(value as number) ? value : values[0]) as string }], kind: "param" };
  }
  const min = Number(s["min"]);
  const max = Number(s["max"]);
  const value = o.value ?? s["default"];
  // A default that is not on the grid of the step (`scale-space` has the default √2 and the step 0.1) removes the step. Thus the control keeps the default.
  const grid = stepOf(s);
  const offGrid = grid !== undefined && typeof value === "number" && Number.isFinite(value) && Math.abs((value - min) / grid - Math.round((value - min) / grid)) > 1e-9;
  const step = offGrid ? undefined : grid;
  const special = ((s["special"] as unknown[] | undefined) ?? []).filter((v): v is number => typeof v === "number" && !Number.isFinite(v));
  const fallback = typeof s["default"] === "number" && Number.isFinite(s["default"]) ? s["default"] : Math.min(max, Math.max(min, step === undefined ? min : min + step * Math.round((max - min) / 2 / step)));
  const number: SpaceParam = {
    name: o.key,
    kind: type === "integer" ? "int" : "real",
    min,
    max,
    ...(step === undefined ? {} : { step }),
    ...(s["scale"] === "log" ? { scale: "log" as const } : {}),
    default: typeof value === "number" && Number.isFinite(value) ? value : fallback,
  };
  // A number with a special value or without a default gets a mode param: the number, the special values, or no option.
  const alts = [...special.map((v) => (v > 0 ? "Infinity" : "-Infinity")), ...(o.value === undefined ? [OMIT] : [])];
  if (alts.length === 0) return { params: [number], kind: "param" };
  const mode = typeof value === "number" && !Number.isFinite(value) ? (value > 0 ? "Infinity" : "-Infinity") : o.value === undefined ? OMIT : VALUE;
  return {
    params: [
      { name: o.key + MODE, kind: "enum", values: [VALUE, ...alts], default: mode },
      { ...number, when: { param: o.key + MODE, in: [VALUE] } },
    ],
    kind: "param",
  };
}

/** This function gives a space of one stage from the facts of the strategies, and the control of each option. */
function spaceOf(engine: "packing" | "highways", version: string, stage: string, facts: readonly StrategyFacts[]): { readonly space: StrategySpace; readonly controls: Control[] } {
  const controls: Control[] = [];
  const options: StageOption[] = facts.map((f) => {
    const params: SpaceParam[] = [];
    for (const o of f.options) {
      const p = paramsOf(o);
      params.push(...p.params);
      const describe = typeof o.schema["describe"] === "string" ? o.schema["describe"] : "";
      controls.push({ engine, option: f.id, key: o.key, kind: p.kind, params: p.params.map((x) => x.name), ...(p.type === undefined ? {} : { type: p.type }), describe, derived: o.derived });
    }
    for (const key of f.wraps?.keys ?? []) controls.push({ engine, option: f.id, key, kind: "member", params: [], describe: f.wraps!.describe, derived: false });
    return f.wraps === undefined ? { id: f.id, params } : { id: f.id, params, members: { min: 1, max: 1, ordered: true } };
  });
  return { space: { schema: STRATEGY_SPACE_SCHEMA, engine, version, stages: [{ name: stage, options }] }, controls };
}

/** This function gives the space that an engine exports under a name, or `undefined`. The site starts a function export with no argument. */
function engineSpace(mod: Readonly<Record<string, unknown>>, name: string): StrategySpace | undefined {
  const v = mod[name];
  const space = typeof v === "function" ? (v as () => unknown)() : v;
  if (typeof space !== "object" || space === null) return undefined;
  return checkSpace(space as StrategySpace).length === 0 ? (space as StrategySpace) : undefined;
}

/**
 * The composite strategies of `packing` 0.3.0 with the option `member`. The forms of the site set only the member of `aspect-fit` (`strategy` and `options`).
 * Thus the catalog does not show a pack entry of the benchmark with one of these strategies. Each strategy is an extra pack, with the default member. Roadmap item L80 adds the forms.
 */
const MEMBER_WRAPS: ReadonlySet<string> = new Set(["restarts", "bbox", "ruin-recreate", "overlap-min", "anneal", "genetic", "tabu"]);

/**
 * This function tells if the forms of the site can set a pack entry of the benchmark. They cannot set the member of a strategy of `MEMBER_WRAPS`.
 * They also cannot set the option `table` of `select`, so the entry `pack` is not in the catalog. Roadmap item L80 adds the forms.
 */
export function inForms(entry: { readonly strategy: string; readonly options: Readonly<Record<string, unknown>> }): boolean {
  return !MEMBER_WRAPS.has(entry.strategy) && entry.options["table"] === undefined;
}

/** The site uses `packSpace` of `packing` when this value is true. Roadmap item L80 changes the forms for its stages, and then sets it. */
const USE_PACK_SPACE = false;

/** This function gives the pack entry of a strategy of `packing` that no entry of the benchmark uses. A wrapper wraps `DEFAULT_STRATEGY`. */
function extraPack(f: StrategyFacts): PackChoice {
  return f.wraps === undefined ? { id: f.id, strategy: f.id, options: {} } : { id: `${f.id}(${packing.DEFAULT_STRATEGY})`, strategy: f.id, options: { strategy: packing.DEFAULT_STRATEGY, options: {} } };
}

/** The facts of the catalog that come from the engines, without the inputs. */
export type EngineCatalog = Omit<JointCatalog, "inputs" | "grid" | "compareMaxBoxes">;

/** This function gives the lane pairs of L13 and the iteration pairs of L11, as the joint space names them. */
function jointPairs(): JointPair[] {
  return [...laneEntries().map((lane): JointPair => ({ pair: pairId(lane.id, lane.router), kind: "lanes", lane })), ...iterEntries().map((iter): JointPair => ({ pair: pairId(iter.id, iter.router), kind: "iter", iter }))];
}

/**
 * This function gives the catalog of the joint pages from the registries of `packing` and `highways`.
 * The named configs of the pack space are the pack entries of the benchmark and the extra entries. The named configs of the route space are the routers.
 */
export function engineCatalog(versions: Readonly<Record<string, string>>): EngineCatalog {
  const pf = packFacts();
  const rf = routeFacts();
  const derivedPack = spaceOf("packing", versions["packing"] ?? "", PACK_STAGE, pf);
  const derivedRoute = spaceOf("highways", versions["highways"] ?? "", ROUTE_STAGE, rf);
  // `packing` 0.3.0 has `packSpace`, with stages that the forms of the site do not read yet (roadmap item L80). Until then, the site derives the pack space from the registry.
  const fromPack = USE_PACK_SPACE ? engineSpace(packing as unknown as Record<string, unknown>, "packSpace") : undefined;
  const fromRoute = engineSpace(highways as unknown as Record<string, unknown>, "routeSpace");
  const shown = PACK_ENTRIES.filter(inForms);
  const used = new Set(shown.map((e) => e.strategy));
  const benchPacks: PackChoice[] = shown.map((e) => ({ id: e.id, strategy: e.strategy, options: e.options }));
  const extraPacks = pf.filter((f) => !used.has(f.id)).map(extraPack);
  const named = (space: StrategySpace, entries: readonly PackChoice[]): Record<string, StrategyConfig> => Object.fromEntries(entries.map((e) => [e.id, packConfig(space, e)]));
  const basePack = fromPack ?? derivedPack.space;
  const pack: StrategySpace = fromPack ?? { ...basePack, named: named(basePack, [...benchPacks, ...extraPacks]) };
  const baseRoute = fromRoute ?? derivedRoute.space;
  const route: StrategySpace = fromRoute ?? { ...baseRoute, named: Object.fromEntries(ROUTERS.map((r) => [r, routeConfig(baseRoute, { router: r, options: {} })])) };
  return {
    versions,
    pack,
    route,
    joint: jointSpace(pack, route),
    lanes: laneSpace(),
    jointPairs: jointPairs(),
    source: { pack: fromPack === undefined ? "derived" : "engine", route: fromRoute === undefined ? "derived" : "engine" },
    controls: [...derivedPack.controls, ...derivedRoute.controls],
    about: { packing: Object.fromEntries(pf.map((f) => [f.id, f.about])), highways: Object.fromEntries(rf.map((f) => [f.id, f.about])) },
    benchPacks,
    extraPacks,
    routers: [...ROUTERS],
    openRouters: [...OPEN_ROUTERS],
  };
}

/** The keys of the options of `packing` that the site lists by hand, for each strategy. The completeness test gives each a control. */
export function packExtraKeys(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(PACK_EXTRAS).map(([id, list]) => [id, list.map((o) => o.key)]));
}

/**
 * This function gives the strategies of the registry of `highways` that the joint benchmark races.
 * The list has each router strategy, each highway strategy, `portfolioStrategy` with the name `portfolio`, and each member form of the portfolio.
 */
function registryRouters(): RouterStrategy[] {
  const routers = highways.listStrategies(highways.STRATEGIES, "router") as unknown as readonly RouterStrategy[];
  const plans = highways.listStrategies(highways.STRATEGIES, "highway") as unknown as readonly RouterStrategy[];
  const named = new Set([...routers, ...plans].map((s) => s.name));
  const members = Object.keys(highways.MEMBER_FORMS).filter((name) => !named.has(name) && name !== PORTFOLIO_ROUTER);
  const forms = members.map((name) => ({ ...(highways.portfolioMember(name) as unknown as RouterStrategy), name }));
  return [...routers, ...plans, { ...(highways.portfolioStrategy as unknown as RouterStrategy), name: PORTFOLIO_ROUTER }, ...forms];
}

/** The ids of the strategies in the registries of the two engines. The completeness test compares the catalog with them. */
export function registryIds(): { readonly packing: string[]; readonly highways: string[] } {
  return { packing: [...packing.strategies, ...packing.composites].map((s) => s.id), highways: registryRouters().map((s) => s.name) };
}

/** The declared options of each strategy in the registries: the keys of `defaults`, and for `highways` the keys of `schema`. */
export function declaredOptions(): { readonly packing: Record<string, string[]>; readonly highways: Record<string, string[]> } {
  return {
    packing: Object.fromEntries([...packing.strategies, ...packing.composites].map((s) => [s.id, Object.keys(s.defaults ?? {})])),
    highways: Object.fromEntries(registryRouters().map((s) => [s.name, routerKeys(s)])),
  };
}
