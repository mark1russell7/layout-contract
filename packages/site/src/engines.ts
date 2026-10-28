// This file makes the catalog of the joint pages from the registries of the two engines. The build imports it, so the pages get the catalog as data.
// When an engine exports a strategy space (`packSpace` of `packing`, `routeSpace` of `highways`), the catalog uses it. Else it derives a space from the registry.
import { PACK_ENTRIES, ROUTERS, PORTFOLIO_ROUTER } from "@layout-contract/joint/browser";
import {
  checkSpace,
  productSpace,
  STRATEGY_SPACE_SCHEMA,
  type SpaceParam,
  type StageOption,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import * as highways from "@mark1russell7/highways";
import * as packing from "@mark1russell7/packing";
import { MODE, OMIT, PACK_STAGE, packConfig, ROUTE_STAGE, routeConfig, VALUE, type Control, type JointCatalog, type PackChoice } from "./catalog.ts";

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
function stringLists(mod: Readonly<Record<string, unknown>>): (readonly string[])[] {
  return Object.values(mod).filter((v): v is string[] => Array.isArray(v) && v.length > 1 && v.every((x) => typeof x === "string"));
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
  const lists = stringLists(packing as unknown as Record<string, unknown>);
  return [...packing.strategies, ...packing.composites].map((s) => {
    const defaults = (s.defaults ?? {}) as Readonly<Record<string, unknown>>;
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

/** The options of the portfolio router of `highways`. Its strategy declares no schema, so the site makes one from the exported lists. */
function portfolioOptions(): OptionSpec[] {
  const d = highways.portfolioStrategy.defaults as Readonly<Record<string, unknown>>;
  return [
    { key: "rule", schema: { type: "enum", values: [...highways.PORTFOLIO_RULES], default: d["rule"], describe: "The rule of the guard: the routes of one collection, or all routes." }, value: d["rule"], derived: false },
    { key: "cap", schema: { type: "enum", values: [...highways.PORTFOLIO_CAPS], default: d["cap"], describe: "The stretch cap of the guard." }, value: d["cap"], derived: false },
    { key: "k", schema: { type: "enum", values: [OMIT, ...highways.PORTFOLIO_KS_API], default: OMIT, describe: "The count of the members. The default is the fit of the size band." }, value: undefined, derived: false },
    { key: "hashes", schema: { type: "enum", values: [...highways.PORTFOLIO_HASHES], default: "pick", describe: "With pick, the result has the hash of the pick only." }, value: "pick", derived: false },
    { key: "budgetMs", schema: { type: "number", min: 1, max: 5000, scale: "log", default: 100, describe: "The time limit in milliseconds. Without it, each member runs." }, value: undefined, derived: true },
    { key: "maxMembers", schema: { type: "integer", min: 1, max: 16, step: 1, default: 3, describe: "The largest count of the members that run." }, value: undefined, derived: true },
    { key: "now", schema: { type: "function", describe: "The clock of the time limit." }, value: undefined, derived: false },
  ];
}

/** This function gives the facts of each router of the joint benchmark: the router strategies of `highways`, then `portfolio`. */
function routeFacts(): StrategyFacts[] {
  const list = highways.listStrategies(highways.STRATEGIES, "router") as unknown as readonly RouterStrategy[];
  const out: StrategyFacts[] = list.map((s) => {
    const defaults = highways.optionDefaults(s as never) as Readonly<Record<string, unknown>>;
    const schema = s.schema ?? {};
    const keys = [...new Set([...Object.keys(schema), ...Object.keys(s.defaults ?? {})])];
    const options = keys.map((key): OptionSpec => {
      const given = schema[key];
      const value = Object.hasOwn(defaults, key) ? defaults[key] : given?.["default"];
      return given === undefined ? { key, schema: schemaOfDefault(value, []), value, derived: true } : { key, schema: given, value, derived: false };
    });
    return { id: s.name, about: s.describe ?? "", options };
  });
  out.push({ id: PORTFOLIO_ROUTER, about: String(highways.portfolioStrategy.describe ?? ""), options: portfolioOptions() });
  return out;
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
  const min = Number(s["min"]);
  const max = Number(s["max"]);
  const step = stepOf(s);
  const special = ((s["special"] as unknown[] | undefined) ?? []).filter((v): v is number => typeof v === "number" && !Number.isFinite(v));
  const value = o.value ?? s["default"];
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

/** This function gives the pack entry of a strategy of `packing` that no entry of the benchmark uses. A wrapper wraps `DEFAULT_STRATEGY`. */
function extraPack(f: StrategyFacts): PackChoice {
  return f.wraps === undefined ? { id: f.id, strategy: f.id, options: {} } : { id: `${f.id}(${packing.DEFAULT_STRATEGY})`, strategy: f.id, options: { strategy: packing.DEFAULT_STRATEGY, options: {} } };
}

/** The facts of the catalog that come from the engines, without the inputs. */
export type EngineCatalog = Omit<JointCatalog, "inputs" | "grid" | "compareMaxBoxes">;

/**
 * This function gives the catalog of the joint pages from the registries of `packing` and `highways`.
 * The named configs of the pack space are the pack entries of the benchmark and the extra entries. The named configs of the route space are the routers.
 */
export function engineCatalog(versions: Readonly<Record<string, string>>): EngineCatalog {
  const pf = packFacts();
  const rf = routeFacts();
  const derivedPack = spaceOf("packing", versions["packing"] ?? "", PACK_STAGE, pf);
  const derivedRoute = spaceOf("highways", versions["highways"] ?? "", ROUTE_STAGE, rf);
  const fromPack = engineSpace(packing as unknown as Record<string, unknown>, "packSpace");
  const fromRoute = engineSpace(highways as unknown as Record<string, unknown>, "routeSpace");
  const used = new Set(PACK_ENTRIES.map((e) => e.strategy));
  const benchPacks: PackChoice[] = PACK_ENTRIES.map((e) => ({ id: e.id, strategy: e.strategy, options: e.options }));
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
    joint: productSpace(pack, route, "joint"),
    source: { pack: fromPack === undefined ? "derived" : "engine", route: fromRoute === undefined ? "derived" : "engine" },
    controls: [...derivedPack.controls, ...derivedRoute.controls],
    about: { packing: Object.fromEntries(pf.map((f) => [f.id, f.about])), highways: Object.fromEntries(rf.map((f) => [f.id, f.about])) },
    benchPacks,
    extraPacks,
    routers: [...ROUTERS],
  };
}

/** The keys of the options of `packing` that the site lists by hand, for each strategy. The completeness test gives each a control. */
export function packExtraKeys(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(PACK_EXTRAS).map(([id, list]) => [id, list.map((o) => o.key)]));
}

/** The ids of the strategies in the registries of the two engines. The completeness test compares the catalog with them. */
export function registryIds(): { readonly packing: string[]; readonly highways: string[] } {
  const routers = highways.listStrategies(highways.STRATEGIES, "router") as unknown as readonly RouterStrategy[];
  return { packing: [...packing.strategies, ...packing.composites].map((s) => s.id), highways: [...routers.map((s) => s.name), PORTFOLIO_ROUTER] };
}

/** The declared options of each strategy in the registries: the keys of `defaults`, and for `highways` the keys of `schema`. */
export function declaredOptions(): { readonly packing: Record<string, string[]>; readonly highways: Record<string, string[]> } {
  const routers = highways.listStrategies(highways.STRATEGIES, "router") as unknown as readonly RouterStrategy[];
  return {
    packing: Object.fromEntries([...packing.strategies, ...packing.composites].map((s) => [s.id, Object.keys(s.defaults ?? {})])),
    highways: {
      ...Object.fromEntries(routers.map((s) => [s.name, [...new Set([...Object.keys(s.schema ?? {}), ...Object.keys(s.defaults ?? {})])]])),
      [PORTFOLIO_ROUTER]: Object.keys(highways.portfolioStrategy.defaults ?? {}),
    },
  };
}
