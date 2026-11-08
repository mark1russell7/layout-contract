// The strategy catalog: every strategy and every option of an engine, as JSON (`docs/STRATEGY-CATALOG.md`).
import { canonicalJson } from "./hash.ts";
import type { Supports } from "./record.ts";
import { type AnyOption, declarationIssues, type ListItem, type NoDefaultReason, optionIssue, type OptionScale, type ValueOption } from "./strategy-space.ts";
import type { ParamValue, StrategySpace } from "./strategy-space.ts";

/** The newest schema of a strategy catalog. A new field is a new version of the schema. */
export const STRATEGY_CATALOG_SCHEMA = "strategy-catalog/3";

/** The schemas that `parseStrategyCatalog` reads, oldest first. Schema 2 adds the field `output` of an entry, and schema 3 adds the field `fingerprint`. */
export const STRATEGY_CATALOG_SCHEMAS: readonly ["strategy-catalog/1", "strategy-catalog/2", "strategy-catalog/3"] = ["strategy-catalog/1", "strategy-catalog/2", STRATEGY_CATALOG_SCHEMA];

/** The form of the field `fingerprint` of an entry: the 16 lowercase hex digits that `fingerprintOf` gives. */
const FINGERPRINT = /^[0-9a-f]{16}$/u;

/** The name of one schema of a strategy catalog. */
export type StrategyCatalogSchema = (typeof STRATEGY_CATALOG_SCHEMAS)[number];

/**
 * The dimension of `supports` that tells who owns the positions of the nodes. The value `host` means that the strategy keeps the positions that the host gives.
 * The value `engine` means that the strategy can set them. A strategy that moves nodes has only `engine`. A `SupportProbe` tests the claim with a run.
 */
export const NODE_POSITIONS_DIMENSION = "nodePositions";

/** A limit on one measure of the input. The key of the record of limits names the measure, for example `nodes`. */
export interface CatalogLimit {
  /** The smallest value that the strategy takes. */
  readonly min?: number;
  /** The largest value that the strategy takes. */
  readonly max?: number;
  /** One short sentence that tells what the strategy does outside the limit. */
  readonly describe: string;
}

/** The kind of a strategy: it places on its own, it wraps other strategies, or it is for one shape of item. */
export type StrategyKind = "single" | "composite" | "shape";

/** The output properties that tell if the numbers of a result are whole: the positions and the sizes. The parser examines the class of these properties. */
export const OUTPUT_GRID_PROPERTIES: readonly string[] = ["position-grid", "size-grid"];

/** The class of a grid property of an output. */
export type OutputGridClass = "whole" | "near-whole" | "fractional" | "untested";

/** The largest distance from a whole number for a near-whole value. A value at a larger distance is fractional. */
export const OUTPUT_NEAR_WHOLE = 1e-9;

/** The fewest packed inputs for the class `whole` or `near-whole`. A fraction needs no such count, because one counterexample is a proof. */
export const OUTPUT_CLASS_MIN_INPUTS = 30;

/** What one read of an output covers. The row states no promise beyond this evidence. */
export interface OutputEvidence {
  /** The count of inputs that the strategy packed in this read. */
  readonly inputs: number;
  /** The count of inputs with a fractional value of the property. A grid property must have this field. */
  readonly fractionalInputs?: number;
  /** The count of inputs with a near-whole value and no fractional value of the property. A grid property must have this field. */
  readonly nearWholeInputs?: number;
  /** The input family or the study of the read. */
  readonly source: string;
  /** The name of the options of the read, for example `default`. */
  readonly optionSet: string;
  /** The version of the catalog that the read used. */
  readonly catalogVersion: string;
}

/** One property of the output of a strategy, as a read found it. An entry has one row for each pair of `property` and `optionSet`. */
export interface OutputRow {
  /** The property, for example `position-grid`. */
  readonly property: string;
  /** The class of the property. For a grid property, `outputGridClass` gives the only class that the evidence permits. */
  readonly class: string;
  readonly evidence: OutputEvidence;
}

/** The counts that decide the class of a grid property. */
export interface OutputGridCounts {
  readonly inputs: number;
  readonly fractionalInputs: number;
  readonly nearWholeInputs: number;
}

/**
 * This function gives the class of a grid property from its counts. One fractional input gives `fractional` at any count.
 * With no fraction, fewer than `OUTPUT_CLASS_MIN_INPUTS` inputs give `untested`. Each other read gives `near-whole` or `whole`.
 */
export function outputGridClass(counts: OutputGridCounts): OutputGridClass {
  if (counts.fractionalInputs > 0) return "fractional";
  if (counts.inputs < OUTPUT_CLASS_MIN_INPUTS) return "untested";
  return counts.nearWholeInputs > 0 ? "near-whole" : "whole";
}

/** One strategy of a catalog. */
export interface CatalogEntry {
  /** The key is unique in the catalog: `<step>/<id>` with a step, else `id`. */
  readonly key: string;
  /** The name that the engine reads. */
  readonly id: string;
  /** The step of the pipeline of the engine. An engine without steps leaves it out. */
  readonly step?: string;
  /** The group of the strategy in a chooser. */
  readonly family: string;
  readonly kind: StrategyKind;
  /** One line that tells what the strategy does. */
  readonly describe: string;
  /** For each dimension, the values that the strategy takes. A dimension that is not here has no declared limit. */
  readonly supports: Supports;
  /** The limits of the strategy on the measures of the input. An empty record means that the engine declares no limit. */
  readonly limits: Readonly<Record<string, CatalogLimit>>;
  /** The value is `true` when, with the default options, the result depends only on the input, the options and the seed. */
  readonly deterministic: boolean;
  /** One sentence that tells what can change this claim, for example a clock. */
  readonly determinismNote?: string;
  /** The value is `true` when the strategy is outside the default set of the engine, and a caller asks for it by name. */
  readonly optIn: boolean;
  /** The value `true` tells that the strategy is a baseline of a bench. It has `optIn` true, and a chooser does not offer it. */
  readonly baseline?: true;
  /** The reads of the output of the strategy. A file with this field has the schema 2. */
  readonly output?: readonly OutputRow[];
  /** The fingerprint of the outputs of the strategy on the probes of its engine, from `fingerprintOf`. A file with this field has the schema 3. */
  readonly fingerprint?: string;
  /** The declarations of the options, in the order of a form. */
  readonly options: Readonly<Record<string, AnyOption>>;
}

/** The form of a catalog that an engine exports as data. It holds no version: the build gives the version from `package.json`. */
export interface StrategyCatalogSource {
  /** The npm name of the engine, without its scope. */
  readonly engine: string;
  readonly strategies: readonly CatalogEntry[];
}

/** A catalog document: the form that `writeStrategyCatalog` writes and `parseStrategyCatalog` reads. */
export interface StrategyCatalog extends StrategyCatalogSource {
  readonly schema: StrategyCatalogSchema;
  /** The npm version of the engine. */
  readonly version: string;
}

/** The result of `parseStrategyCatalog`. */
export type StrategyCatalogParse = { readonly ok: true; readonly catalog: StrategyCatalog } | { readonly ok: false; readonly faults: readonly string[] };

/** The live facts of one strategy, for `checkCatalog`. */
export interface RegistryEntry {
  readonly key: string;
  /** The live defaults of the strategy. */
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly optIn: boolean;
  /** The value `true` tells that the strategy is a baseline of a bench. */
  readonly baseline?: boolean;
  /** The limits in the code of the engine. Without them, the engine has no limits. */
  readonly limits?: Readonly<Record<string, { readonly min?: number; readonly max?: number }>>;
  /** This function runs the strategy on a small fixture and gives its output as text. The text does not hold times. */
  readonly run?: () => string;
}

/** A test of one value of `supports`: each strategy runs on an input with this value. */
export interface SupportProbe {
  /** The dimension of `supports`. */
  readonly field: string;
  readonly value: string;
  /** This function gives `true` if the strategy refuses the input, and `undefined` if the input cannot go to this strategy. */
  readonly refuses: (key: string) => boolean | undefined;
}

/**
 * The statement of how one place of a space reaches the options of an engine. The file of a catalog does not hold it, because a value can hold code.
 *
 * - `spaceOnly` tells that the place sets no option, with one sentence that tells why. A stage option without an entry can also have this statement.
 * - `option` names the option of the param, when the option has another name. `value` gives the option value of one param value, and `undefined` when the param value sets no option.
 */
export type ParamRoute =
  | { readonly spaceOnly: string }
  | { readonly option?: string; readonly value?: (value: ParamValue) => unknown };

/** The options of `checkCatalog`. */
export interface CatalogCheckOptions {
  /** Each param of these spaces is examined against the declaration of its option. */
  readonly spaces?: readonly StrategySpace[];
  /** The routes of the params of `spaces`. The key is `<stage>/<option>.<param>`, or `<stage>/<option>` for a stage option. A route that matches nothing is a fault. */
  readonly paramRoutes?: Readonly<Record<string, ParamRoute>>;
  readonly probes?: readonly SupportProbe[];
  /** This function runs `owner` with `choice` in its option `option`. It gives `true` for a refusal, or `undefined` if the input cannot go to `owner`. */
  readonly refusesChoice?: (owner: string, option: string, choice: string) => boolean | undefined;
}

/** The result of `checkCatalog`. */
export interface CatalogCheck {
  /** Each break of a rule, as one sentence. A good catalog has none. */
  readonly faults: readonly string[];
  /** The claims that no run examined, by key and with the reason. */
  readonly notRun: readonly string[];
  /** The stage options and the params of a space that have no entry, no declaration and no route. */
  readonly notMatched: readonly string[];
  /** The places of a space with a `spaceOnly` route, each with its reason. */
  readonly spaceOnly: readonly string[];
}

/** The value of a strategy option that holds the options of the chosen strategy. A declaration with `inlineOptions` takes it. */
export interface StrategyMember {
  /** The key of the chosen strategy. */
  readonly strategy: string;
  /** The options of the chosen strategy, in the JSON form of its declarations. */
  readonly options?: Readonly<Record<string, unknown>>;
  /** The name of the member in the output. */
  readonly id?: string;
}

/** The options of `catalogOptions`. */
export interface CatalogOptionsOptions {
  /** This function gives the key of a strategy from a default value of the type `strategy`. */
  readonly strategyKey?: (value: unknown) => string | undefined;
}

const STRATEGY_KINDS: readonly string[] = ["single", "composite", "shape"];
const NO_DEFAULT_REASONS: readonly NoDefaultReason[] = ["unset", "required", "derived", "function"];
const SCALES: readonly OptionScale[] = ["linear", "log"];
const TOP_FIELDS: readonly string[] = ["schema", "engine", "version", "strategies"];
const ENTRY_FIELDS: readonly string[] = ["key", "id", "step", "family", "kind", "describe", "supports", "limits", "deterministic", "determinismNote", "optIn", "baseline", "output", "fingerprint", "options"];
const COMMON_FIELDS: readonly string[] = ["type", "describe", "default", "noDefault", "when"];
const NUMBER_FIELDS: readonly string[] = [...COMMON_FIELDS, "min", "max", "step", "scale", "special", "marks", "values"];
const ENUM_FIELDS: readonly string[] = [...COMMON_FIELDS, "values", "custom"];
const STRATEGY_FIELDS: readonly string[] = [...COMMON_FIELDS, "step", "kinds", "optionsKey", "inlineOptions", "optIn", "needs"];
const MEMBER_FIELDS: readonly string[] = ["strategy", "options", "id"];
const LIST_FIELDS: readonly string[] = [...COMMON_FIELDS, "of", "min", "max"];
const ROW_FIELDS: readonly string[] = ["property", "class", "evidence"];
const EVIDENCE_FIELDS: readonly string[] = ["inputs", "fractionalInputs", "nearWholeInputs", "source", "optionSet", "catalogVersion"];
/** The fields of a declaration, in the order of the file. */
const OPTION_ORDER: readonly string[] = ["type", "describe", "min", "max", "step", "scale", "special", "marks", "values", "custom", "kinds", "optionsKey", "inlineOptions", "optIn", "needs", "of", "default", "noDefault", "when"];

type Fields = Readonly<Record<string, unknown>>;

const isFields = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isTextList = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every(isText);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isMember = (v: unknown): v is StrategyMember =>
  isFields(v) &&
  isText(v["strategy"]) &&
  (v["options"] === undefined || isFields(v["options"])) &&
  (v["id"] === undefined || isText(v["id"])) &&
  Object.keys(v).every((k) => MEMBER_FIELDS.includes(k));

/** This function gives the key of a strategy from its step and its id. */
export function catalogKey(id: string, step?: string): string {
  return step === undefined ? id : `${step}/${id}`;
}

/** This function adds one fault for each field of `o` that is not in `allowed`. */
function refuseUnknown(at: string, o: Fields, allowed: readonly string[], faults: string[]): void {
  for (const key of Object.keys(o)) if (!allowed.includes(key)) faults.push(`${at}: the field "${key}" is unknown.`);
}

/** This function restores a number field of a file. It gives `undefined` for each value that is not a finite number, `"Infinity"` or `"-Infinity"`. */
function readNumber(v: unknown): number | undefined {
  if (v === "Infinity") return Infinity;
  if (v === "-Infinity") return -Infinity;
  return isFiniteNumber(v) ? v : undefined;
}

/** This function restores a list of number fields, with one fault for each bad value. */
function readNumbers(at: string, v: unknown, faults: string[]): number[] | undefined {
  if (!Array.isArray(v)) {
    faults.push(`${at} is not a list.`);
    return undefined;
  }
  const out: number[] = [];
  for (const x of v) {
    const n = readNumber(x);
    if (n === undefined) faults.push(`${at} holds a value that is not a number.`);
    else out.push(n);
  }
  return out;
}

/** This function gives the fields of a number declaration, restored from a file. */
function readNumberFields(at: string, raw: Fields, faults: string[]): Fields {
  const out: Record<string, unknown> = {};
  for (const f of ["min", "max"]) {
    if (isFiniteNumber(raw[f])) out[f] = raw[f];
    else faults.push(`${at}: "${f}" is not a finite number.`);
  }
  if (raw["step"] !== undefined) {
    if (isFiniteNumber(raw["step"])) out["step"] = raw["step"];
    else faults.push(`${at}: "step" is not a finite number.`);
  }
  if (raw["scale"] !== undefined) {
    if (SCALES.includes(raw["scale"] as OptionScale)) out["scale"] = raw["scale"];
    else faults.push(`${at}: "scale" is not linear or log.`);
  }
  for (const f of ["special", "marks"]) {
    if (raw[f] === undefined) continue;
    const list = readNumbers(`${at}: "${f}"`, raw[f], faults);
    if (list !== undefined) out[f] = list;
  }
  if (raw["values"] !== undefined) {
    if (Array.isArray(raw["values"]) && raw["values"].every(isFiniteNumber)) out["values"] = raw["values"];
    else faults.push(`${at}: "values" is not a list of finite numbers.`);
  }
  if (raw["default"] !== undefined) {
    const n = readNumber(raw["default"]);
    if (n === undefined) faults.push(`${at}: the default is not a number.`);
    else out["default"] = n;
  }
  return out;
}

/** This function gives the fields of a list declaration, restored from a file. */
function readListFields(at: string, raw: Fields, faults: string[]): Fields {
  const out: Record<string, unknown> = {};
  if (raw["of"] !== undefined) {
    const item = readOption(`${at}: "of"`, raw["of"], true, faults);
    if (item !== undefined) out["of"] = item;
    if (isFields(raw["of"]) && raw["of"]["optionsKey"] !== undefined) faults.push(`${at}: an item of a list has no sibling for "optionsKey". Use "inlineOptions".`);
  }
  for (const f of ["min", "max"]) {
    if (raw[f] === undefined) continue;
    if (Number.isInteger(raw[f]) && (raw[f] as number) >= 0) out[f] = raw[f];
    else faults.push(`${at}: "${f}" is not a whole number.`);
  }
  if (raw["default"] !== undefined) {
    if (Array.isArray(raw["default"])) out["default"] = raw["default"];
    else faults.push(`${at}: the default is not a list.`);
  }
  if (typeof out["min"] === "number" && typeof out["max"] === "number" && out["min"] > out["max"]) faults.push(`${at}: "min" is more than "max".`);
  return out;
}

/** This function gives the fields of a `strategy` declaration, restored from a file. */
function readStrategyFields(at: string, raw: Fields, faults: string[]): Fields {
  const out: Record<string, unknown> = {};
  if (raw["step"] !== undefined) {
    if (isText(raw["step"])) out["step"] = raw["step"];
    else faults.push(`${at}: "step" is not a text.`);
  }
  if (raw["kinds"] !== undefined) {
    if (isTextList(raw["kinds"]) && raw["kinds"].every((k) => STRATEGY_KINDS.includes(k))) out["kinds"] = raw["kinds"];
    else faults.push(`${at}: "kinds" is not a list of strategy kinds.`);
  }
  if (raw["optionsKey"] !== undefined) {
    if (isText(raw["optionsKey"])) out["optionsKey"] = raw["optionsKey"];
    else faults.push(`${at}: "optionsKey" is not a text.`);
  }
  for (const f of ["inlineOptions", "optIn"]) {
    if (raw[f] === undefined) continue;
    if (typeof raw[f] === "boolean") out[f] = raw[f];
    else faults.push(`${at}: "${f}" is not true or false.`);
  }
  if (raw["needs"] !== undefined) {
    if (isFields(raw["needs"]) && Object.values(raw["needs"]).every(isText)) out["needs"] = raw["needs"];
    else faults.push(`${at}: "needs" is not a record of texts.`);
  }
  if (raw["inlineOptions"] === true && raw["optionsKey"] !== undefined) faults.push(`${at}: "inlineOptions" and "optionsKey" give two places for the options.`);
  if (raw["default"] !== undefined) {
    if (isText(raw["default"]) || (raw["inlineOptions"] === true && isMember(raw["default"]))) out["default"] = raw["default"];
    else faults.push(`${at}: the default is not the key of a strategy.`);
  }
  return out;
}

/** This function gives the fields that belong only to the type of a declaration, restored from a file. */
function readTypeFields(at: string, type: string, raw: Fields, faults: string[]): Fields {
  switch (type) {
    case "number":
    case "integer":
      refuseUnknown(at, raw, NUMBER_FIELDS, faults);
      return readNumberFields(at, raw, faults);
    case "boolean":
      refuseUnknown(at, raw, COMMON_FIELDS, faults);
      if (raw["default"] !== undefined && typeof raw["default"] !== "boolean") faults.push(`${at}: the default is not true or false.`);
      return raw["default"] === undefined ? {} : { default: raw["default"] };
    case "enum": {
      refuseUnknown(at, raw, ENUM_FIELDS, faults);
      if (!isTextList(raw["values"])) faults.push(`${at}: "values" is not a list of texts.`);
      if (raw["custom"] !== undefined && raw["custom"] !== "function") faults.push(`${at}: "custom" is not "function".`);
      return { values: raw["values"], ...(raw["custom"] === undefined ? {} : { custom: raw["custom"] }), ...(raw["default"] === undefined ? {} : { default: raw["default"] }) };
    }
    case "strategy":
      refuseUnknown(at, raw, STRATEGY_FIELDS, faults);
      return readStrategyFields(at, raw, faults);
    case "list":
      refuseUnknown(at, raw, LIST_FIELDS, faults);
      return readListFields(at, raw, faults);
    case "object":
      refuseUnknown(at, raw, COMMON_FIELDS, faults);
      return raw["default"] === undefined ? {} : { default: raw["default"] };
    case "function":
      refuseUnknown(at, raw, COMMON_FIELDS, faults);
      if (raw["default"] !== undefined) faults.push(`${at}: a function option has no default in JSON.`);
      return {};
    default:
      faults.push(`${at}: the type "${type}" is unknown.`);
      return {};
  }
}

/** This function adds the faults of the statement of an absent default, and gives the statement. */
function readNoDefault(at: string, raw: unknown, faults: string[]): Fields | undefined {
  if (!isFields(raw)) {
    faults.push(`${at}: "noDefault" is not an object.`);
    return undefined;
  }
  refuseUnknown(`${at}: "noDefault"`, raw, ["reason", "describe"], faults);
  if (!NO_DEFAULT_REASONS.includes(raw["reason"] as NoDefaultReason)) faults.push(`${at}: the reason of "noDefault" is unknown.`);
  if (!isText(raw["describe"])) faults.push(`${at}: "noDefault" has no description.`);
  return { reason: raw["reason"], describe: raw["describe"] };
}

/** This function restores one declaration of a file. An item of a list has only the fields of its type. */
function readOption(at: string, raw: unknown, item: boolean, faults: string[]): AnyOption | ListItem | undefined {
  if (!isFields(raw)) {
    faults.push(`${at} is not an object.`);
    return undefined;
  }
  const type = raw["type"];
  if (typeof type !== "string") {
    faults.push(`${at} has no type.`);
    return undefined;
  }
  const before = faults.length;
  const fields = readTypeFields(at, type, raw, faults);
  const out: Record<string, unknown> = { type, ...fields };
  if (item) {
    for (const f of ["describe", "default", "noDefault", "when"]) if (raw[f] !== undefined) faults.push(`${at}: an item of a list has no "${f}".`);
  } else {
    if (isText(raw["describe"])) out["describe"] = raw["describe"];
    else faults.push(`${at} has no description.`);
    const hasDefault = raw["default"] !== undefined;
    const hasNoDefault = raw["noDefault"] !== undefined;
    if (hasDefault === hasNoDefault) faults.push(`${at} has ${hasDefault ? "both" : "neither"} of "default" and "noDefault".`);
    if (hasNoDefault) out["noDefault"] = readNoDefault(at, raw["noDefault"], faults);
    if (raw["when"] !== undefined) out["when"] = raw["when"];
  }
  return faults.length === before ? (out as unknown as AnyOption) : undefined;
}

/** This function adds the faults of the condition of an option, against the options before it. */
function checkWhen(at: string, when: unknown, earlier: readonly string[], faults: string[]): void {
  if (!isFields(when) || !isText(when["param"]) || !Array.isArray(when["in"])) {
    faults.push(`${at}: "when" has no "param" and "in".`);
    return;
  }
  refuseUnknown(`${at}: "when"`, when, ["param", "in"], faults);
  if (!earlier.includes(when["param"])) faults.push(`${at}: "when" names "${when["param"]}", which is not an earlier option.`);
}

/** This function adds the faults of the limits of an entry. */
function checkLimits(at: string, limits: unknown, faults: string[]): void {
  if (!isFields(limits)) {
    faults.push(`${at}: "limits" is not an object.`);
    return;
  }
  for (const [name, raw] of Object.entries(limits)) {
    const place = `${at}: the limit "${name}"`;
    if (!isFields(raw)) {
      faults.push(`${place} is not an object.`);
      continue;
    }
    refuseUnknown(place, raw, ["min", "max", "describe"], faults);
    if (!isText(raw["describe"])) faults.push(`${place} has no description.`);
    if (raw["min"] === undefined && raw["max"] === undefined) faults.push(`${place} has no "min" and no "max".`);
    for (const f of ["min", "max"]) if (raw[f] !== undefined && !isFiniteNumber(raw[f])) faults.push(`${place}: "${f}" is not a finite number.`);
    if (isFiniteNumber(raw["min"]) && isFiniteNumber(raw["max"]) && raw["min"] > raw["max"]) faults.push(`${place}: "min" is more than "max".`);
  }
}

/** This function adds the faults of the evidence of one output row. */
function checkEvidence(at: string, property: unknown, rowClass: unknown, raw: unknown, faults: string[]): void {
  if (!isFields(raw)) {
    faults.push(`${at}: "evidence" is not an object.`);
    return;
  }
  refuseUnknown(`${at}: the evidence`, raw, EVIDENCE_FIELDS, faults);
  for (const f of ["source", "optionSet", "catalogVersion"]) if (!isText(raw[f])) faults.push(`${at}: the evidence field "${f}" is not a text.`);
  const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
  if (!count(raw["inputs"])) faults.push(`${at}: the evidence field "inputs" is not a count.`);
  const grid = OUTPUT_GRID_PROPERTIES.includes(property as string);
  for (const f of ["fractionalInputs", "nearWholeInputs"]) if (grid ? !count(raw[f]) : raw[f] !== undefined && !count(raw[f])) faults.push(`${at}: the evidence field "${f}" is not a count.`);
  const [inputs, fractionalInputs, nearWholeInputs] = [raw["inputs"], raw["fractionalInputs"], raw["nearWholeInputs"]];
  if (!grid || !count(inputs) || !count(fractionalInputs) || !count(nearWholeInputs)) return;
  if (fractionalInputs + nearWholeInputs > inputs) faults.push(`${at}: the fractional and near-whole counts are more than the inputs.`);
  const expected = outputGridClass({ inputs, fractionalInputs, nearWholeInputs });
  if (rowClass !== expected) faults.push(`${at}: the evidence gives the class "${expected}".`);
}

/** This function adds the faults of the field `output` of one entry. */
function checkOutput(at: string, raw: unknown, schema: unknown, faults: string[]): void {
  if (schema === STRATEGY_CATALOG_SCHEMAS[0]) faults.push(`${at}: the field "output" needs the schema ${STRATEGY_CATALOG_SCHEMAS[1]} or a newer schema.`);
  if (!Array.isArray(raw) || raw.length === 0) {
    faults.push(`${at}: "output" is not a list with rows.`);
    return;
  }
  const seen = new Set<string>();
  (raw as readonly unknown[]).forEach((row, i) => {
    const place = `${at}: the output row ${i}`;
    if (!isFields(row)) {
      faults.push(`${place} is not an object.`);
      return;
    }
    refuseUnknown(place, row, ROW_FIELDS, faults);
    for (const f of ["property", "class"]) if (!isText(row[f])) faults.push(`${place}: "${f}" is not a text.`);
    checkEvidence(place, row["property"], row["class"], row["evidence"], faults);
    const optionSet = isFields(row["evidence"]) ? row["evidence"]["optionSet"] : undefined;
    const name = JSON.stringify([row["property"], optionSet]);
    if (seen.has(name)) faults.push(`${place}: the property and the option set are not unique.`);
    seen.add(name);
  });
}

/** This function restores one entry of a file. */
function readEntry(at: string, raw: unknown, schema: unknown, faults: string[]): CatalogEntry | undefined {
  if (!isFields(raw)) {
    faults.push(`${at} is not an object.`);
    return undefined;
  }
  const before = faults.length;
  refuseUnknown(at, raw, ENTRY_FIELDS, faults);
  for (const f of ["key", "id", "family", "describe"]) if (!isText(raw[f])) faults.push(`${at}: "${f}" is not a text.`);
  if (raw["step"] !== undefined && !isText(raw["step"])) faults.push(`${at}: "step" is not a text.`);
  if (raw["determinismNote"] !== undefined && !isText(raw["determinismNote"])) faults.push(`${at}: "determinismNote" is not a text.`);
  if (!STRATEGY_KINDS.includes(raw["kind"] as string)) faults.push(`${at}: "kind" is unknown.`);
  for (const f of ["deterministic", "optIn"]) if (typeof raw[f] !== "boolean") faults.push(`${at}: "${f}" is not true or false.`);
  if (raw["baseline"] !== undefined && raw["baseline"] !== true) faults.push(`${at}: "baseline" is not true.`);
  if (raw["baseline"] === true && raw["optIn"] !== true) faults.push(`${at}: a baseline has "optIn" true.`);
  if (!isFields(raw["supports"]) || !Object.values(raw["supports"]).every(isTextList)) faults.push(`${at}: "supports" is not a record of text lists.`);
  checkLimits(at, raw["limits"], faults);
  if (raw["output"] !== undefined) checkOutput(at, raw["output"], schema, faults);
  if (raw["fingerprint"] !== undefined) {
    if (schema !== STRATEGY_CATALOG_SCHEMAS[2]) faults.push(`${at}: the field "fingerprint" needs the schema ${STRATEGY_CATALOG_SCHEMAS[2]}.`);
    if (!isText(raw["fingerprint"]) || !FINGERPRINT.test(raw["fingerprint"])) faults.push(`${at}: "fingerprint" is not 16 lowercase hex digits.`);
  }
  if (isText(raw["id"]) && raw["key"] !== catalogKey(raw["id"], raw["step"] as string | undefined)) faults.push(`${at}: the key does not follow from "step" and "id".`);
  if (!isFields(raw["options"])) {
    faults.push(`${at}: "options" is not an object.`);
    return undefined;
  }
  const options: Record<string, AnyOption> = {};
  const earlier: string[] = [];
  for (const [key, value] of Object.entries(raw["options"])) {
    const place = `${at}: the option "${key}"`;
    const option = readOption(place, value, false, faults) as AnyOption | undefined;
    if (option !== undefined) {
      options[key] = option;
      for (const message of declarationIssues(key, option)) faults.push(`${at}: ${message}`);
      if (option.when !== undefined) checkWhen(place, option.when, earlier, faults);
    }
    earlier.push(key);
  }
  if (faults.length !== before) return undefined;
  const { step, determinismNote } = raw as { readonly step?: string; readonly determinismNote?: string };
  return {
    key: raw["key"] as string,
    id: raw["id"] as string,
    ...(step === undefined ? {} : { step }),
    family: raw["family"] as string,
    kind: raw["kind"] as StrategyKind,
    describe: raw["describe"] as string,
    supports: raw["supports"] as Supports,
    limits: raw["limits"] as Readonly<Record<string, CatalogLimit>>,
    deterministic: raw["deterministic"] as boolean,
    ...(determinismNote === undefined ? {} : { determinismNote }),
    optIn: raw["optIn"] as boolean,
    ...(raw["baseline"] === true ? { baseline: true as const } : {}),
    ...(raw["output"] === undefined ? {} : { output: raw["output"] as readonly OutputRow[] }),
    ...(raw["fingerprint"] === undefined ? {} : { fingerprint: raw["fingerprint"] as string }),
    options,
  };
}

/**
 * This function gives the strategies that a chooser offers, by the `step`, `kinds`, `optIn` and `needs` of an option. Thus no chooser keeps a copy of this rule.
 * A baseline is not in the result. A list gives the strategies of its items. An option of each other type gives nothing.
 * A strategy that does not list a dimension of `needs` has no declared limit there, so the option offers it.
 * Without a declaration, the function gives each strategy that is not a baseline.
 */
export function catalogChoices(strategies: readonly CatalogEntry[], declaration?: AnyOption | ListItem): readonly CatalogEntry[] {
  const offered = strategies.filter((e) => e.baseline !== true);
  if (declaration === undefined) return offered;
  const d = (declaration.type === "list" ? declaration.of : declaration) as ValueOption | undefined;
  if (d?.type !== "strategy") return [];
  const needs = Object.entries(d.needs ?? {});
  return offered.filter(
    (e) =>
      (d.step === undefined || e.step === d.step) &&
      (d.kinds === undefined || d.kinds.includes(e.kind)) &&
      (d.optIn === undefined || d.optIn === e.optIn) &&
      needs.every(([dimension, value]) => e.supports[dimension]?.includes(value) !== false),
  );
}

/** This function adds one fault for each option of a member that its chosen strategy does not take. */
function checkMember(at: string, member: StrategyMember, chosen: CatalogEntry, faults: string[]): void {
  for (const [key, value] of Object.entries(member.options ?? {})) {
    const declaration = chosen.options[key];
    if (declaration === undefined) {
      faults.push(`${at}: the default gives "${key}", and ${chosen.key} has no such option.`);
      continue;
    }
    const issue = declaration.type === "strategy" ? undefined : optionIssue(key, decodeOptionValue(value, declaration), declaration);
    if (issue !== undefined) faults.push(`${at}: ${issue.message}`);
  }
}

/** This function adds one fault for each reference that names no strategy of the catalog, or a strategy that the option does not take. */
function checkReferences(entries: readonly CatalogEntry[], faults: string[]): void {
  const check = (at: string, o: AnyOption | ListItem, values: readonly unknown[]): void => {
    const choices = catalogChoices(entries, o);
    if (choices.length === 0) faults.push(`${at} takes no strategy of the catalog.`);
    for (const value of values) {
      const inline = ((o.type === "list" ? o.of : o) as ValueOption).inlineOptions === true && isMember(value);
      const key = inline ? value.strategy : value;
      const chosen = choices.find((e) => e.key === key);
      if (chosen === undefined) faults.push(`${at}: the default ${JSON.stringify(key)} is not a strategy that the option takes.`);
      else if (inline) checkMember(at, value, chosen, faults);
    }
  };
  for (const entry of entries) {
    for (const [key, o] of Object.entries(entry.options)) {
      const at = `${entry.key}: the option "${key}"`;
      if (o.type === "strategy") {
        check(at, o, o.default === undefined ? [] : [o.default]);
        if (o.optionsKey !== undefined && (o.optionsKey === key || entry.options[o.optionsKey]?.type !== "object")) faults.push(`${at}: "optionsKey" does not name an object option.`);
      } else if (o.type === "list" && o.of?.type === "strategy") {
        check(at, o, Array.isArray(o.default) ? o.default : []);
      }
      if (o.type === "list" && Array.isArray(o.default)) {
        if (o.min !== undefined && o.default.length < o.min) faults.push(`${at}: the default has fewer than ${o.min} items.`);
        if (o.max !== undefined && o.default.length > o.max) faults.push(`${at}: the default has more than ${o.max} items.`);
      }
    }
  }
}

/**
 * This function reads a catalog from parsed JSON, in each schema of `STRATEGY_CATALOG_SCHEMAS`. It refuses each unknown field and each other schema.
 * It gives the catalog with its `Infinity` values restored, or the list of all faults.
 */
export function parseStrategyCatalog(value: unknown): StrategyCatalogParse {
  const faults: string[] = [];
  if (!isFields(value)) return { ok: false, faults: ["The catalog is not an object."] };
  refuseUnknown("The catalog", value, TOP_FIELDS, faults);
  const schema = value["schema"];
  if (!(STRATEGY_CATALOG_SCHEMAS as readonly unknown[]).includes(schema)) faults.push(`The schema is not one of ${STRATEGY_CATALOG_SCHEMAS.join(", ")}.`);
  if (!isText(value["engine"])) faults.push(`"engine" is not a text.`);
  if (!isText(value["version"])) faults.push(`"version" is not a text.`);
  if (!Array.isArray(value["strategies"])) return { ok: false, faults: [...faults, `"strategies" is not a list.`] };
  const entries: CatalogEntry[] = [];
  (value["strategies"] as readonly unknown[]).forEach((raw, i) => {
    const entry = readEntry(`The strategy ${isFields(raw) && isText(raw["key"]) ? raw["key"] : i}`, raw, schema, faults);
    if (entry !== undefined) entries.push(entry);
  });
  for (let i = 1; i < entries.length; i++) {
    const [a, b] = [entries[i - 1]!.key, entries[i]!.key];
    if (a === b) faults.push(`The key ${a} is not unique.`);
    else if (a > b) faults.push(`The key ${b} is out of order.`);
  }
  // A bad entry is not in the list, so each reference to it would give a false fault.
  if (faults.length === 0) checkReferences(entries, faults);
  if (faults.length > 0) return { ok: false, faults };
  return { ok: true, catalog: { schema: schema as StrategyCatalogSchema, engine: value["engine"] as string, version: value["version"] as string, strategies: entries } };
}

/** This function gives the file form of a number. A value that is not finite becomes its name, and `NaN` stays for the writer to refuse. */
const writeNumber = (v: unknown): unknown => (v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : v);

/**
 * This function gives the value of an option for a call of the engine, from its JSON form.
 * The strings `"Infinity"` and `"-Infinity"` become numbers in a number option, and in a list of numbers. Each other value stays as it is.
 */
export function decodeOptionValue(value: unknown, declaration: AnyOption | ListItem): unknown {
  if (declaration.type === "number" || declaration.type === "integer") return readNumber(value) ?? value;
  if (declaration.type === "list" && declaration.of !== undefined && Array.isArray(value)) {
    const item = declaration.of;
    return value.map((v: unknown) => decodeOptionValue(v, item));
  }
  return value;
}

/** This function gives the JSON form of the value of an option. It is the inverse of `decodeOptionValue`. */
export function encodeOptionValue(value: unknown, declaration: AnyOption | ListItem): unknown {
  if (declaration.type === "number" || declaration.type === "integer") return writeNumber(value);
  if (declaration.type === "list" && declaration.of !== undefined && Array.isArray(value)) {
    const item = declaration.of;
    return value.map((v: unknown) => encodeOptionValue(v, item));
  }
  return value;
}

/** This function gives the file form of a declaration, with its fields in the order of the file. */
function writeOption(option: AnyOption | ListItem): Fields {
  const o = option as unknown as Fields;
  for (const key of Object.keys(o)) if (!OPTION_ORDER.includes(key) && o[key] !== undefined) throw new Error(`The field "${key}" is not a field of a declaration.`);
  const numeric = o["type"] === "number" || o["type"] === "integer";
  const out: Record<string, unknown> = {};
  for (const f of OPTION_ORDER) {
    const v = o[f];
    if (v === undefined) continue;
    if (f === "of") out[f] = writeOption(v as ListItem);
    else if (numeric && f === "default") out[f] = writeNumber(v);
    else if (numeric && (f === "special" || f === "marks")) out[f] = (v as readonly number[]).map(writeNumber);
    else out[f] = v;
  }
  return out;
}

/** This function gives the file form of one output row, with the fields in the order of the file. */
function writeRow(row: OutputRow): unknown {
  const e = row.evidence;
  return {
    property: row.property,
    class: row.class,
    evidence: {
      inputs: e.inputs,
      ...(e.fractionalInputs === undefined ? {} : { fractionalInputs: e.fractionalInputs }),
      ...(e.nearWholeInputs === undefined ? {} : { nearWholeInputs: e.nearWholeInputs }),
      source: e.source,
      optionSet: e.optionSet,
      catalogVersion: e.catalogVersion,
    },
  };
}

/** This function gives the file form of an entry, with its fields in the order of the file. */
function writeEntry(e: CatalogEntry): Fields {
  const options = Object.fromEntries(Object.entries(e.options).map(([key, o]) => [key, writeOption(o)]));
  return {
    key: e.key,
    id: e.id,
    ...(e.step === undefined ? {} : { step: e.step }),
    family: e.family,
    kind: e.kind,
    describe: e.describe,
    supports: e.supports,
    limits: e.limits,
    deterministic: e.deterministic,
    ...(e.determinismNote === undefined ? {} : { determinismNote: e.determinismNote }),
    optIn: e.optIn,
    ...(e.baseline === true ? { baseline: true } : {}),
    ...(e.output === undefined ? {} : { output: e.output.map(writeRow) }),
    ...(e.fingerprint === undefined ? {} : { fingerprint: e.fingerprint }),
    options,
  };
}

/** This function gives the place of each value that JSON cannot hold: a function, `undefined` in a list, or a number that is not finite. */
function unsafeValues(v: unknown, at: string): string[] {
  if (typeof v === "function") return [`${at} is a function.`];
  if (typeof v === "number") return Number.isFinite(v) ? [] : [`${at} is ${v}.`];
  if (Array.isArray(v)) return v.flatMap((x: unknown, i) => (x === undefined ? [`${at}[${i}] is undefined.`] : unsafeValues(x, `${at}[${i}]`)));
  if (isFields(v)) return Object.entries(v).flatMap(([k, x]) => unsafeValues(x, `${at}.${k}`));
  return [];
}

/**
 * This function gives the text of the catalog file, sorted by key. The same source and version give the same bytes.
 * The file has the oldest schema that holds it. A catalog with no `output` and no `fingerprint` stays valid for a reader of the schema 1.
 * A catalog with no `fingerprint` stays valid for a reader of the schema 2.
 * The caller gives the version from `package.json`. The function throws an error if the file breaks a rule of the format.
 */
export function writeStrategyCatalog(source: StrategyCatalogSource, version: string): string {
  const strategies = [...source.strategies].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(writeEntry);
  const has = (field: "output" | "fingerprint"): boolean => source.strategies.some((e) => e[field] !== undefined);
  const schema = has("fingerprint") ? STRATEGY_CATALOG_SCHEMAS[2] : has("output") ? STRATEGY_CATALOG_SCHEMAS[1] : STRATEGY_CATALOG_SCHEMAS[0];
  const doc = { schema, engine: source.engine, version, strategies };
  const unsafe = unsafeValues(doc, "catalog");
  if (unsafe.length > 0) throw new Error(`The catalog of ${source.engine} has values that JSON cannot hold: ${unsafe.join(" ")}`);
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  const parsed = parseStrategyCatalog(JSON.parse(text));
  if (!parsed.ok) throw new Error(`The catalog of ${source.engine} breaks the format: ${parsed.faults.join(" ")}`);
  return text;
}

/** This function gives the default of each option of an entry that has a default. */
export function catalogDefaults(entry: CatalogEntry): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entry.options).flatMap(([key, o]) => (o.default === undefined ? [] : [[key, o.default]])));
}

/**
 * This function gives the catalog declarations of a strategy from its live `defaults` and its schema. Thus each engine has no copy of this rule.
 * A live default goes on its declaration. A function stays out, so the declaration needs its own `noDefault`.
 */
export function catalogOptions(defaults: Readonly<Record<string, unknown>>, schema: Readonly<Record<string, AnyOption>>, options: CatalogOptionsOptions = {}): Record<string, AnyOption> {
  const out: Record<string, AnyOption> = {};
  for (const [key, declaration] of Object.entries(schema)) {
    const live = key in defaults ? defaults[key] : declaration.default;
    const object = declaration.type === "strategy" && typeof live === "object" && live !== null;
    const value = object && !(declaration.inlineOptions === true && isMember(live)) ? options.strategyKey?.(live) : live;
    const { default: _unused, ...rest } = declaration;
    out[key] = (value === undefined || typeof value === "function" ? rest : { ...rest, default: value }) as AnyOption;
  }
  return out;
}

/** This function adds the faults of one entry against its live facts. */
function checkLive(entry: CatalogEntry, live: RegistryEntry, faults: string[]): void {
  const defaults = catalogDefaults(entry);
  if (entry.optIn !== live.optIn) faults.push(`${entry.key}: "optIn" is ${entry.optIn}, and the engine gives ${live.optIn}.`);
  if ((entry.baseline === true) !== (live.baseline === true)) faults.push(`${entry.key}: "baseline" differs from the engine.`);
  const limits = Object.fromEntries(Object.entries(entry.limits).map(([name, { min, max }]) => [name, { min, max }]));
  if (canonicalJson(limits) !== canonicalJson(live.limits ?? {})) faults.push(`${entry.key}: "limits" differ from the limits of the engine.`);
  for (const [key, value] of Object.entries(live.defaults)) {
    const option = entry.options[key];
    if (option === undefined) {
      faults.push(`${entry.key}: the default "${key}" has no declaration.`);
    } else if (typeof value === "function") {
      if (option.noDefault?.reason !== "function") faults.push(`${entry.key}: the default "${key}" is code, and its "noDefault" does not say it.`);
    } else if (option.type !== "strategy" || typeof value === "string" || (option.inlineOptions === true && isMember(value))) {
      const same = Object.is(value, defaults[key]) || canonicalJson(value) === canonicalJson(defaults[key]);
      if (!same) faults.push(`${entry.key}: the default "${key}" differs from the live default.`);
    }
  }
}

/** This function runs each entry that claims determinism two times, and compares the bytes. */
function checkDeterminism(entry: CatalogEntry, live: RegistryEntry, faults: string[], notRun: string[]): void {
  if (!entry.deterministic) return;
  if (live.run === undefined) {
    notRun.push(`${entry.key}: the engine gives no fixture.`);
    return;
  }
  try {
    if (live.run() !== live.run()) faults.push(`${entry.key}: "deterministic" is true, and two runs differ.`);
  } catch (error) {
    notRun.push(`${entry.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** This function runs each probe on an entry, and compares the refusal with `supports`. */
function checkProbes(entry: CatalogEntry, probes: readonly SupportProbe[], faults: string[], notRun: string[]): void {
  for (const probe of probes) {
    const name = `${entry.key} on ${probe.field} ${probe.value}`;
    const declared = entry.supports[probe.field];
    const takes = declared === undefined || declared.includes(probe.value);
    let refused: boolean | undefined;
    try {
      refused = probe.refuses(entry.key);
    } catch (error) {
      notRun.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (refused === undefined) notRun.push(`${name}: the input cannot go to this strategy.`);
    else if (refused === takes) faults.push(`${name}: "supports" ${takes ? "takes" : "refuses"} the value, and the engine ${refused ? "refuses" : "takes"} it.`);
  }
}

/** This function runs each strategy that an option of an entry offers, because a chooser must not offer a strategy that fails. */
function checkChoices(entry: CatalogEntry, strategies: readonly CatalogEntry[], refuses: NonNullable<CatalogCheckOptions["refusesChoice"]>, faults: string[], notRun: string[]): void {
  for (const [key, declaration] of Object.entries(entry.options)) {
    for (const choice of catalogChoices(strategies, declaration)) {
      const name = `${entry.key}: the option "${key}" with ${choice.key}`;
      let refused: boolean | undefined;
      try {
        refused = refuses(entry.key, key, choice.key);
      } catch (error) {
        notRun.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (refused === undefined) notRun.push(`${name}: the input cannot go to this strategy.`);
      else if (refused) faults.push(`${name}: the option offers this strategy, and the engine refuses it.`);
    }
  }
}

/** The lists that the check of the spaces writes, and the routes that it reads. */
interface SpaceCheck {
  readonly routes: Readonly<Record<string, ParamRoute>>;
  /** The keys of the routes that matched a place. */
  readonly used: Set<string>;
  readonly faults: string[];
  readonly notMatched: string[];
  readonly spaceOnly: string[];
}

/** This function examines each value of one param against the declaration of its option, through the route of the param. */
function checkParamValues(entry: CatalogEntry, engine: string, place: string, option: string, values: readonly ParamValue[], route: ParamRoute | undefined, check: SpaceCheck): void {
  const declaration = entry.options[option]!;
  const toOption = route !== undefined && "value" in route ? route.value : undefined;
  for (const value of values) {
    let mapped: unknown = value;
    try {
      if (toOption !== undefined) mapped = toOption(value);
    } catch (error) {
      check.faults.push(`${entry.key}: the route "${place}" fails on ${String(value)}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (mapped === undefined) continue;
    const issue = optionIssue(option, mapped, declaration);
    if (issue !== undefined) check.faults.push(`${entry.key}: the space ${engine} is outside the declaration. ${issue.message}`);
  }
}

/** This function examines each param of a space against the declaration of its option, with the routes of the engine. */
function checkSpaceParams(space: StrategySpace, entries: ReadonlyMap<string, CatalogEntry>, check: SpaceCheck): void {
  const { routes, used, faults, notMatched, spaceOnly } = check;
  const routeOf = (place: string): ParamRoute | undefined => {
    const route = routes[place];
    if (route !== undefined) used.add(place);
    return route;
  };
  for (const stage of space.stages) {
    for (const option of stage.options) {
      const name = `${stage.name}/${option.id}`;
      const entry = entries.get(name) ?? entries.get(option.id);
      if (entry === undefined) {
        const reason = routes[name];
        if (reason !== undefined && "spaceOnly" in reason) {
          used.add(name);
          spaceOnly.push(`${name}: ${reason.spaceOnly}`);
        } else {
          notMatched.push(name);
        }
        continue;
      }
      for (const param of option.params) {
        const place = `${name}.${param.name}`;
        const route = routeOf(place);
        if (route !== undefined && "spaceOnly" in route) {
          if (entry.options[param.name] === undefined) spaceOnly.push(`${place}: ${route.spaceOnly}`);
          else faults.push(`${entry.key}: the route "${place}" says that the param is only in the space, and the strategy has this option.`);
          continue;
        }
        const target = route?.option ?? param.name;
        if (entry.options[target] === undefined) {
          if (route === undefined) notMatched.push(place);
          else faults.push(`${entry.key}: the route "${place}" names "${target}", and the strategy has no such option.`);
          continue;
        }
        const values = [param.min, param.max, ...(param.values ?? []), param.default].filter((v): v is ParamValue => v !== undefined);
        checkParamValues(entry, space.engine, place, target, values, route, check);
      }
    }
  }
}

/** This function adds one fault for each route that matched nothing, and for each `spaceOnly` route with no reason. */
function checkRoutes({ routes, used, faults }: SpaceCheck): void {
  for (const [place, route] of Object.entries(routes)) {
    if (!used.has(place)) faults.push(`The route "${place}" matches nothing in the spaces.`);
    if ("spaceOnly" in route && !isText(route.spaceOnly)) faults.push(`The route "${place}" has no reason.`);
  }
}

/**
 * This function examines a catalog against its engine: the live defaults, the set of strategies and a round trip through JSON.
 * It also examines the claims of determinism, `supports`, `limits`, the choices of each strategy option and the spaces.
 * A claim that no run can examine goes to `notRun`, by key, so a test can state their count.
 */
export function checkCatalog(source: StrategyCatalogSource, registry: readonly RegistryEntry[], options: CatalogCheckOptions = {}): CatalogCheck {
  const faults: string[] = [];
  const notRun: string[] = [];
  const notMatched: string[] = [];
  const spaceOnly: string[] = [];
  let text: string | undefined;
  try {
    text = writeStrategyCatalog(source, "0.0.0");
  } catch (error) {
    faults.push(error instanceof Error ? error.message : String(error));
  }
  if (text !== undefined) {
    const parsed = parseStrategyCatalog(JSON.parse(text));
    if (!parsed.ok || writeStrategyCatalog(parsed.catalog, "0.0.0") !== text) faults.push("A round trip through JSON changes the catalog.");
  }
  const entries = new Map(source.strategies.map((e) => [e.key, e]));
  const live = new Map(registry.map((e) => [e.key, e]));
  for (const key of live.keys()) if (!entries.has(key)) faults.push(`${key} is in the engine, and not in the catalog.`);
  for (const key of entries.keys()) if (!live.has(key)) faults.push(`${key} is in the catalog, and not in the engine.`);
  for (const [key, entry] of entries) {
    const facts = live.get(key);
    if (facts === undefined) continue;
    checkLive(entry, facts, faults);
    checkDeterminism(entry, facts, faults, notRun);
    checkProbes(entry, options.probes ?? [], faults, notRun);
    if (options.refusesChoice !== undefined) checkChoices(entry, source.strategies, options.refusesChoice, faults, notRun);
  }
  const spaceCheck: SpaceCheck = { routes: options.paramRoutes ?? {}, used: new Set(), faults, notMatched, spaceOnly };
  for (const space of options.spaces ?? []) checkSpaceParams(space, entries, spaceCheck);
  checkRoutes(spaceCheck);
  return { faults, notRun, notMatched, spaceOnly };
}
