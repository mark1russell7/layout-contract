import type { ParamWhen } from "./strategy-space.ts";

/** The scale of a number option. A sweep on the scale `log` gives values with equal ratios, not with equal differences. */
export type OptionScale = "linear" | "log";

/** The reason why an option has no default value. The strategy reads the absence, the caller sets it, the strategy calculates it, or the default is code. */
export type NoDefaultReason = "unset" | "required" | "derived" | "function";

/** The statement of an option without a default value that JSON can hold. */
export interface NoDefault {
  readonly reason: NoDefaultReason;
  /** One short sentence that tells what the strategy does without a value. */
  readonly describe: string;
}

/** The fields of each option declaration. */
interface OptionBase {
  /** One short sentence that tells what the option sets. The site and the documents show it. */
  readonly describe: string;
  /** This field tells why the option has no default. The catalog of an engine has this field or a `default` on each option. */
  readonly noDefault?: NoDefault;
  /** The option is active only when an earlier option of the same strategy has one of these values. */
  readonly when?: ParamWhen;
}

/**
 * The declaration of a number option. The range from `min` to `max` is the range of a control and of a sweep.
 * The strategy can take a value outside the range. `checkOptions` reports such a value, and `clampOptions` moves it into the range.
 */
export interface NumberOption extends OptionBase {
  /** The type `integer` takes only whole numbers. */
  readonly type: "number" | "integer";
  readonly min: number;
  readonly max: number;
  /** The grain of a control and of a sweep. A value off the step is valid. Without it, the grain is free (or 1 for an integer). */
  readonly step?: number;
  /** The scale of a control and of a sweep. The default is `linear`. The scale `log` needs a `min` above 0. */
  readonly scale?: OptionScale;
  /** These values are valid outside the range. For example, `Infinity` sets no limit. */
  readonly special?: readonly number[];
  /** These values are the notable values of the option: the default and the values of the sweeps of the benchmark. */
  readonly marks?: readonly number[];
  /**
   * These values are the only valid values of the option, in the order of a control. A control shows them as a list, and a sweep gives them.
   * Without them, each value on the range is valid.
   */
  readonly values?: readonly number[];
  /** The strategy uses this value when the caller and `defaults` give no value. */
  readonly default?: number;
}

/** The declaration of a boolean option. */
export interface BooleanOption extends OptionBase {
  readonly type: "boolean";
  /** The strategy uses this value when the caller and `defaults` give no value. */
  readonly default?: boolean;
}

/** The declaration of an option with a fixed list of string values. */
export interface EnumOption<V extends string = string> extends OptionBase {
  readonly type: "enum";
  /** The values of the option, in the order of a control. */
  readonly values: readonly V[];
  /**
   * With `function`, the option also takes a rule of the caller in place of a name. A control sets only the names.
   * Each name is a known rule of the strategy.
   */
  readonly custom?: "function";
  /** The strategy uses this value when the caller and `defaults` give no value. */
  readonly default?: V;
}

/**
 * The declaration of an option that a control or a sweep cannot set from a range.
 * The type `function` is a rule, `strategy` is a strategy of the step `step`, `list` is an array and `object` is any other object.
 */
export interface ValueOption<V = unknown, S extends string = string> extends OptionBase {
  readonly type: "function" | "strategy" | "list" | "object";
  /** The step of the strategy, for the type `strategy`. A control lists the strategies of this step of a registry. */
  readonly step?: S;
  /** The kinds of strategy that the option takes, for the type `strategy`. Without them, the option takes each kind. */
  readonly kinds?: readonly string[];
  /** The key of the option that holds the options of the chosen strategy, for the type `strategy`. */
  readonly optionsKey?: string;
  /** The value `true` lets a value hold its options: a key, or an object with the fields `strategy`, `options` and `id`. This field is for the type `strategy`, and also for an item of a list. */
  readonly inlineOptions?: boolean;
  /** The value `false` leaves out the opt-in strategies, because the option finds only the default set of the engine. This field is for the type `strategy`. */
  readonly optIn?: boolean;
  /** For each dimension of `supports`, the value that a chosen strategy must take. This field is for the type `strategy`, and also for an item of a list. */
  readonly needs?: Readonly<Record<string, string>>;
  /** The declaration of each item, for the type `list`. */
  readonly of?: ListItem<S>;
  /** The smallest number of items, for the type `list`. */
  readonly min?: number;
  /** The largest number of items, for the type `list`. */
  readonly max?: number;
  /** The strategy uses this value when the caller and `defaults` give no value. */
  readonly default?: V;
}

/** The declaration of one option of any type. */
export type AnyOption<S extends string = string> = NumberOption | BooleanOption | EnumOption | ValueOption<unknown, S>;

/** This type removes the fields of a whole option from a declaration. */
type ItemOf<T> = T extends unknown ? Omit<T, "describe" | "default" | "noDefault" | "when"> : never;

/** The declaration of one item of a list option: an option without its text, its default and its condition. */
export type ListItem<S extends string = string> = ItemOf<AnyOption<S>>;

/**
 * The declaration that fits the type of an option value: numbers, booleans, string unions or other values.
 * A union of strings and other values takes an enum of the strings or a value declaration. An example is a rule or the name of a rule.
 * A plain `string` takes an enum or a value declaration, because the value can be the key of a strategy.
 */
export type OptionDeclaration<V, S extends string = string> = [V] extends [number]
  ? NumberOption
  : [V] extends [boolean]
    ? BooleanOption
    : [V] extends [string]
      ? string extends V
        ? EnumOption<V> | ValueOption<V, S>
        : EnumOption<V>
      : [Extract<V, string>] extends [never]
        ? ValueOption<V, S>
        : EnumOption<Extract<V, string>> | ValueOption<V, S>;

/** The declarations of the options of a strategy. The schema has one declaration for each key of the options type, and no other key. */
export type OptionSchema<O, S extends string = string> = { readonly [K in keyof O]-?: OptionDeclaration<NonNullable<O[K]>, S> };

/** The fields of a strategy that the functions of this module read. An engine can add other fields. */
export interface DeclaredStrategy<O extends object = object, S extends string = string> {
  /** The name of the strategy in a message. */
  readonly name: string;
  readonly defaults: O;
  readonly schema?: OptionSchema<O, S>;
}

/** One problem of an option value against its declaration. */
export interface OptionIssue {
  /** The key of the option. */
  readonly key: string;
  readonly value: unknown;
  /** The kind of the problem: no declaration, the wrong type, out of the range, not a whole number or not one of the values. */
  readonly problem: "unknown" | "type" | "range" | "integer" | "value";
  /** One sentence that tells the problem. */
  readonly message: string;
}

/** One setting of a sweep: a name for the rows of a table, and the options of the strategy. */
export interface OptionSetting<O extends object> {
  /** The key and the value of each option of the setting, for example `stretch 1.5`. */
  readonly name: string;
  readonly options: Partial<O>;
}

/** The options of `sweepValues`, `sweepOf` and `sweepGrid`. */
export interface SweepOptions {
  /**
   * The number of values on the range of a number option. Without it, the sweep gives the `marks` of the declaration.
   * A declaration without `marks` gets 5 values.
   */
  readonly count?: number;
  /** With `true`, a sweep of a number option on the range also gives the `special` values. The default is `false`. */
  readonly special?: boolean;
}

/** The number of values of a sweep on a range when the call and the declaration give no number. */
const SWEEP_COUNT = 5;

/** This function gives the declarations of a strategy as a record. A strategy without a schema gives an empty record. */
function schemaOf<S extends string>(strategy: DeclaredStrategy<object, S>): Readonly<Record<string, AnyOption<S>>> {
  return (strategy.schema ?? {}) as Readonly<Record<string, AnyOption<S>>>;
}

/** This function gives the declared options of a strategy, in the order of its schema, with the effective default of each one. */
export function listOptions<O extends object, S extends string = string>(
  strategy: DeclaredStrategy<O, S>,
): { readonly key: keyof O & string; readonly declaration: AnyOption<S>; readonly value: unknown }[] {
  const defaults = optionDefaults(strategy) as Record<string, unknown>;
  return Object.entries(schemaOf(strategy)).map(([key, declaration]) => ({ key: key as keyof O & string, declaration, value: defaults[key] }));
}

/**
 * This function gives the effective default of each declared option: the value of `defaults`, else the `default` of the declaration.
 * An option without either value stays out. The strategy gives the same output with this object as with no options.
 */
export function optionDefaults<O extends object, S extends string = string>(strategy: DeclaredStrategy<O, S>): Partial<O> {
  const out: Record<string, unknown> = {};
  const defaults = strategy.defaults as Readonly<Record<string, unknown>>;
  for (const [key, declaration] of Object.entries(schemaOf(strategy))) {
    if (key in defaults) out[key] = defaults[key];
    else if (declaration.default !== undefined) out[key] = declaration.default;
  }
  for (const key of Object.keys(defaults)) if (!(key in out)) out[key] = defaults[key];
  return out as Partial<O>;
}

/** This function gives `true` if the number is one of the special values of the declaration. */
const isSpecial = (d: NumberOption, v: number): boolean => (d.special ?? []).some((s) => Object.is(s, v) || s === v);

/** This function gives the problem of one value against its declaration, or `undefined` when the value fits. */
export function optionIssue(key: string, value: unknown, d: AnyOption): OptionIssue | undefined {
  const issue = (problem: OptionIssue["problem"], message: string): OptionIssue => ({ key, value, problem, message });
  if (value === undefined) return undefined;
  switch (d.type) {
    case "number":
    case "integer": {
      if (typeof value !== "number" || Number.isNaN(value)) return issue("type", `The option "${key}" takes a number.`);
      if (isSpecial(d, value)) return undefined;
      if (d.values !== undefined && !d.values.includes(value)) return issue("value", `The option "${key}" takes ${d.values.join(", ")}, not ${value}.`);
      if (value < d.min || value > d.max) return issue("range", `The option "${key}" is ${value}, out of the range ${d.min} to ${d.max}.`);
      if (d.type === "integer" && !Number.isInteger(value)) return issue("integer", `The option "${key}" takes a whole number, not ${value}.`);
      return undefined;
    }
    case "boolean":
      return typeof value === "boolean" ? undefined : issue("type", `The option "${key}" takes true or false.`);
    case "enum":
      if (d.custom === "function" && typeof value === "function") return undefined;
      return d.values.includes(value as string) ? undefined : issue("value", `The option "${key}" takes ${d.values.join(", ")}, not ${String(value)}.`);
    case "function":
      return typeof value === "function" ? undefined : issue("type", `The option "${key}" takes a function.`);
    case "list":
      return Array.isArray(value) ? undefined : issue("type", `The option "${key}" takes a list.`);
    default:
      return typeof value === "object" && value !== null ? undefined : issue("type", `The option "${key}" takes an object.`);
  }
}

/**
 * This function examines option values against the schema of a strategy. It gives one issue for each key without a declaration.
 * It also gives one issue for each value of the wrong type, out of the range, not whole or not one of the values.
 * It changes no value.
 * A strategy without a schema gives no issue.
 */
export function checkOptions<O extends object>(strategy: DeclaredStrategy<O>, options: Partial<O>): OptionIssue[] {
  if (strategy.schema === undefined) return [];
  const schema = schemaOf(strategy);
  const out: OptionIssue[] = [];
  for (const [key, value] of Object.entries(options)) {
    const d = schema[key];
    const issue = d ? optionIssue(key, value, d) : { key, value, problem: "unknown" as const, message: `The strategy "${strategy.name}" has no option "${key}".` };
    if (issue) out.push(issue);
  }
  return out;
}

/**
 * This function moves each number option into the range of its declaration, for a control. An integer option gets the nearest whole number.
 * An option with a list of `values` gets the nearest value of the list. A special value stays. The function keeps each other value as it is. `checkOptions` reports the values that this function cannot correct.
 */
export function clampOptions<O extends object>(strategy: DeclaredStrategy<O>, options: Partial<O>): Partial<O> {
  const schema = schemaOf(strategy);
  const out: Record<string, unknown> = { ...options };
  for (const [key, value] of Object.entries(options)) {
    const d = schema[key];
    if (!d || (d.type !== "number" && d.type !== "integer") || typeof value !== "number" || Number.isNaN(value) || isSpecial(d, value)) continue;
    if (d.values !== undefined && d.values.length > 0) {
      out[key] = d.values.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best));
      continue;
    }
    const v = Math.min(d.max, Math.max(d.min, value));
    out[key] = d.type === "integer" ? Math.min(d.max, Math.max(d.min, Math.round(v))) : v;
  }
  return out as Partial<O>;
}

/** This function gives `count` values from `min` to `max` on the scale, on the grain of the step, without repeats. */
function rangeValues(d: NumberOption, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const log = d.scale === "log" && d.min > 0;
  const at = (t: number): number => (log ? d.min * (d.max / d.min) ** t : d.min + (d.max - d.min) * t);
  const step = d.step ?? (d.type === "integer" ? 1 : undefined);
  const snap = (v: number): number => {
    const s = step === undefined ? v : d.min + Math.round((v - d.min) / step) * step;
    const r = Number(s.toPrecision(12));
    return Math.min(d.max, Math.max(d.min, d.type === "integer" ? Math.round(r) : r));
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = snap(at(n === 1 ? 0 : i / (n - 1)));
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * This function gives the values of a sweep of one option declaration.
 * A number option gives its `marks`, or its list of `values`, or `count` values on its range and its scale. A boolean gives `false` and `true`. An enum gives its values.
 * An option of another type has no sweep, so the function throws an error.
 */
export function sweepValues(declaration: AnyOption, options: SweepOptions = {}): unknown[] {
  switch (declaration.type) {
    case "number":
    case "integer": {
      if (options.count === undefined && declaration.marks !== undefined) return [...declaration.marks];
      if (declaration.values !== undefined) return [...declaration.values];
      const values = rangeValues(declaration, options.count ?? SWEEP_COUNT);
      return options.special ? [...values, ...(declaration.special ?? []).filter((s) => !values.includes(s))] : values;
    }
    case "boolean":
      return [false, true];
    case "enum":
      return [...declaration.values];
    default:
      throw new Error(`An option of the type "${declaration.type}" has no sweep. A sweep takes a number, an integer, a boolean or an enum.`);
  }
}

/** This function gives the declaration of one option of a strategy. When the strategy has no such declaration, the function throws an error. */
function declarationOf(strategy: DeclaredStrategy, key: string): AnyOption {
  const d = schemaOf(strategy)[key];
  if (!d) throw new Error(`The strategy "${strategy.name}" has no declaration of the option "${key}".`);
  return d;
}

/**
 * This function gives the settings of a sweep of one option of a strategy, from its declaration only.
 * The name of each setting is the key and the value, for example `stretch 1.5`.
 */
export function sweepOf<O extends object>(strategy: DeclaredStrategy<O>, key: keyof O & string, options: SweepOptions = {}): OptionSetting<O>[] {
  return sweepValues(declarationOf(strategy, key), options).map((value) => ({ name: `${key} ${String(value)}`, options: { [key]: value } as Partial<O> }));
}

/**
 * This function gives the settings of a grid of options: each combination of the values of the sweeps of the keys.
 * The name of a setting joins the names of its values with commas, in the order of the keys.
 */
export function sweepGrid<O extends object>(strategy: DeclaredStrategy<O>, keys: readonly (keyof O & string)[], options: SweepOptions = {}): OptionSetting<O>[] {
  let out: OptionSetting<O>[] = [{ name: "", options: {} }];
  for (const key of keys) {
    const sweep = sweepOf(strategy, key, options);
    out = out.flatMap((s) => sweep.map((t) => ({ name: s.name === "" ? t.name : `${s.name}, ${t.name}`, options: { ...s.options, ...t.options } })));
  }
  return keys.length === 0 ? [] : out;
}

/** This function gives the problems of one declaration: a bad range, a bad step, or marks and a default that do not fit. */
export function declarationIssues(key: string, d: AnyOption): string[] {
  const out: string[] = [];
  if (d.describe.trim().length === 0) out.push(`The option "${key}" has no description.`);
  if (d.type === "number" || d.type === "integer") {
    if (!Number.isFinite(d.min) || !Number.isFinite(d.max) || d.min > d.max) out.push(`The option "${key}" has the bad range ${d.min} to ${d.max}.`);
    if (d.type === "integer" && (!Number.isInteger(d.min) || !Number.isInteger(d.max))) out.push(`The integer option "${key}" has a range that is not whole.`);
    if (d.step !== undefined && !(d.step > 0)) out.push(`The option "${key}" has the step ${d.step}. A step is more than 0.`);
    if (d.scale === "log" && !(d.min > 0)) out.push(`The option "${key}" has the scale log and the min ${d.min}. The scale log needs a min above 0.`);
    if (d.values !== undefined && d.values.length === 0) out.push(`The number option "${key}" has an empty list of values.`);
    for (const v of d.values ?? []) {
      if (v < d.min || v > d.max || (d.type === "integer" && !Number.isInteger(v))) out.push(`The value ${v} of the option "${key}" is not on its range ${d.min} to ${d.max}.`);
    }
    for (const v of [...(d.marks ?? []), ...(d.default === undefined ? [] : [d.default])]) {
      const issue = optionIssue(key, v, d);
      if (issue) out.push(issue.message);
    }
  } else if (d.type === "enum") {
    if (d.values.length === 0) out.push(`The enum option "${key}" has no values.`);
    if (d.default !== undefined && !d.values.includes(d.default)) out.push(`The default of the option "${key}" is not one of its values.`);
  } else if (d.type === "boolean") {
    if (d.default !== undefined && typeof d.default !== "boolean") out.push(`The default of the option "${key}" is not true or false.`);
  }
  return out;
}

/**
 * This function examines the schema of a strategy. It gives one message for each option of `defaults` without a declaration.
 * It also gives one message for each bad declaration, and for each value of `defaults` that does not fit its declaration.
 * A good schema gives an empty list.
 */
export function checkSchema(strategy: DeclaredStrategy): string[] {
  const schema = schemaOf(strategy);
  const out: string[] = [];
  for (const key of Object.keys(strategy.defaults)) if (!(key in schema)) out.push(`The strategy "${strategy.name}" has the option "${key}" in its defaults, without a declaration.`);
  for (const [key, d] of Object.entries(schema)) out.push(...declarationIssues(key, d).map((m) => `The strategy "${strategy.name}": ${m}`));
  out.push(...checkOptions(strategy, strategy.defaults).filter((i) => i.problem !== "unknown").map((i) => `The strategy "${strategy.name}": ${i.message}`));
  return out;
}
