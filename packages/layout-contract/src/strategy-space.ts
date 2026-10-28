// The strategy space of an engine (`docs/STRATEGY-SPACE.md`): its stages, their options and the ranges of their params, as data.
import type { ClaimBreak } from "./corpus.ts";
import { canonicalJson, sha256Hex } from "./hash.ts";
import { stepRandom } from "./random.ts";
import { isShapeKind, SHAPE_KIND_IDS, type ShapeKind } from "./shapes.ts";

/** The schema of a strategy space. */
export const STRATEGY_SPACE_SCHEMA = "strategy-space/1";

/** The kind of a param: a whole number, a real number, one value of a list, or `true` and `false`. */
export type ParamKind = "int" | "real" | "enum" | "bool";

/** The value of one param in a config. */
export type ParamValue = number | string | boolean;

/** The condition of a conditional param: the param is active only when an earlier param of the same option has one of the values `in`. */
export interface ParamWhen {
  /** The name of an earlier param of the same option. */
  readonly param: string;
  /** The values of that param that make this param active. */
  readonly in: readonly ParamValue[];
}

/** One param of a stage option, with its range. */
export interface SpaceParam {
  readonly name: string;
  readonly kind: ParamKind;
  /** The smallest value of an `int` or `real` param. */
  readonly min?: number;
  /** The largest value of an `int` or `real` param. */
  readonly max?: number;
  /** The step of the values from `min`. An `int` param has the step 1 by default. */
  readonly step?: number;
  /** The scale of the grid and of the samples. The scale `log` needs a `min` above 0. The default is `linear`. */
  readonly scale?: "linear" | "log";
  /** The values of an `enum` param. */
  readonly values?: readonly (string | number)[];
  /** The value that a config gets when it does not set the param. */
  readonly default: ParamValue;
  /** Without `when`, the param is active each time its option is chosen. */
  readonly when?: ParamWhen;
}

/** The rule of the members of a meta option: a count from `min` to `max`. Members with `ordered: false` are sorted by their `configId`. */
export interface MemberRule {
  readonly min: number;
  readonly max: number;
  readonly ordered: boolean;
}

/** The inputs that an option supports. A missing field supports each value. */
export interface OptionSupports {
  /** The shape kinds of the boxes (`docs/SHAPES.md`). Without it, the option supports each kind. */
  readonly shape?: readonly ShapeKind[];
}

/** One implementation of a stage. An option with `members` is a meta option: it chooses between whole configs, or wraps them. */
export interface StageOption {
  readonly id: string;
  readonly params: readonly SpaceParam[];
  readonly members?: MemberRule;
  /** The inputs that the option supports. It describes the option, so it is not part of a config or of its id. */
  readonly supports?: OptionSupports;
}

/** The shape kinds of the inputs of a check, a count or an enumeration. Without `shapes`, each option counts. */
export interface ShapeFilter {
  /** The shape kinds of the input. Only the options that support each of these kinds count. */
  readonly shapes?: readonly ShapeKind[];
}

/** One stage of the pipeline of an engine. A config of an `optional` stage can have no option. */
export interface SpaceStage {
  readonly name: string;
  readonly options: readonly StageOption[];
  readonly optional?: boolean;
}

/** A reference to one option of a stage. The option `null` refers to an optional stage that a config does not use. */
export interface OptionRef {
  readonly stage: string;
  readonly option: string | null;
}

/** A rule that keeps out invalid combinations. A config with the option `if` also has the option `then`, or does not have the option `then.not`. */
export interface SpaceConstraint {
  readonly if: OptionRef;
  readonly then: OptionRef | { readonly not: OptionRef };
}

/** The strategy space of an engine: the stages, the constraints and the named configs. `docs/STRATEGY-SPACE.md` tells the rules. */
export interface StrategySpace {
  readonly schema: typeof STRATEGY_SPACE_SCHEMA;
  /** The name of the space. A config names the space with this value. */
  readonly engine: string;
  /** The version of the space. It is not part of a config or of its id. A record writes it. */
  readonly version: string;
  readonly stages: readonly SpaceStage[];
  readonly constraints?: readonly SpaceConstraint[];
  /** The named strategies of the engine, as points of the space. Old records stay comparable through them. */
  readonly named?: Readonly<Record<string, StrategyConfig>>;
  /** The spaces of a product space, from `productSpace`. A meta option of a part takes members of that part. */
  readonly parts?: readonly StrategySpace[];
}

/** The choice of one stage in a config: an option, its params and, for a meta option, its members. */
export interface StageChoice {
  readonly option: string;
  /** The values of the active params. A param that is not set gets its default. */
  readonly params?: Readonly<Record<string, ParamValue>>;
  /** The members of a meta option: configs of the same space, with no meta option. */
  readonly members?: readonly StrategyConfig[];
}

/** One point of a strategy space. The value `null` of a stage tells that the config does not use the optional stage. */
export interface StrategyConfig {
  /** The `engine` of the space, without its version. */
  readonly space: string;
  readonly stages: Readonly<Record<string, StageChoice | null>>;
}

/** The count of the grid points of a space. */
export interface SpaceSize {
  /** The count of the configs without a meta option. */
  readonly base: bigint;
  /** The count of the configs with a meta option. The value is `null` when the count is more than `maxMeta`. */
  readonly meta: bigint | null;
}

/** The options of `spaceSize`. */
export interface SpaceSizeOptions extends ShapeFilter {
  /** The count of the levels of each numeric param, a whole number of 1 or more. */
  readonly levels: number;
  /** The largest meta count that `spaceSize` gives. The default is `10n ** 18n`. */
  readonly maxMeta?: bigint;
}

/** The options of a grid. The grid gives only the configs without a meta option. */
export interface GridOptions extends ShapeFilter {
  readonly mode: "grid";
  readonly levels: number;
  /** The largest count of configs. A larger grid causes a `RangeError`. The default is 100000. */
  readonly limit?: number;
}

/** The options of a sample. */
export interface SampleOptions extends ShapeFilter {
  readonly mode: "sample";
  /** The count of the configs, a whole number of 0 or more. */
  readonly n: number;
  readonly seed: number;
  /** With `skip` (the default), the sample has no meta option. With `sample`, a meta option draws its members from base samples. */
  readonly meta?: "skip" | "sample";
  /** The largest count of option draws. The default is the larger value of 1000 and `100 * n`. */
  readonly maxTries?: number;
}

/** The options of `enumerateSpace`. */
export type EnumerateOptions = GridOptions | SampleOptions;

type Problem = readonly [claim: string, detail: string];
type Choices = ReadonlyMap<string, StageOption | null>;
type Values = Record<string, ParamValue>;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const show = (value: unknown): string => (typeof value === "string" ? `"${value}"` : String(value));
const isNumeric = (p: SpaceParam): boolean => p.kind === "int" || p.kind === "real";
const zero = (v: number): number => (v === 0 ? 0 : v);

/** This function gives the stable form of a real number: 12 significant digits, with `-0` as `0`. */
const realForm = (v: number, digits = 12): number => zero(Number(v.toPrecision(digits)));

/** This function gives the stable form of a value of a param. */
function normalize(p: SpaceParam, v: ParamValue): ParamValue {
  if (typeof v !== "number") return v;
  if (p.kind !== "real") return zero(v);
  return Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, realForm(v)));
}

/** This function tells if a value is on the step of a param. */
function onStep(p: SpaceParam, v: number): boolean {
  if (p.step === undefined || p.min === undefined) return true;
  const q = (v - p.min) / p.step;
  return Math.abs(q - Math.round(q)) <= 1e-9 * Math.max(1, Math.abs(q));
}

/** This function gives the problem of a value of a param, or `undefined` for a value in the range. */
function valueProblem(p: SpaceParam, v: unknown): string | undefined {
  if (p.kind === "bool") return typeof v === "boolean" ? undefined : `${show(v)} is not true or false`;
  if (p.kind === "enum") return (p.values ?? []).some((x) => x === v) ? undefined : `${show(v)} is not one of ${(p.values ?? []).map(show).join(", ")}`;
  if (typeof v !== "number" || !Number.isFinite(v)) return `${show(v)} is not a finite number`;
  if (p.kind === "int" && !Number.isInteger(v)) return `${v} is not a whole number`;
  if (p.min !== undefined && v < p.min) return `${v} is less than the min ${p.min}`;
  if (p.max !== undefined && v > p.max) return `${v} is more than the max ${p.max}`;
  if (!onStep(p, v)) return `${v} is not on the step ${p.step} from ${p.min}`;
  return undefined;
}

/** This function tells if a param is active for the values of the earlier params. */
function isActive(p: SpaceParam, values: Values): boolean {
  if (p.when === undefined) return true;
  if (!Object.hasOwn(values, p.when.param)) return false;
  const v = values[p.when.param];
  return p.when.in.some((x) => x === v);
}

/** This function gives the part of a space that has a stage, and the prefix of the names of its stages. */
function partOf(space: StrategySpace, stage: string): { readonly space: StrategySpace; readonly prefix: string } {
  for (const part of space.parts ?? []) {
    const head = `${part.engine}.`;
    if (stage.startsWith(head)) {
      const inner = partOf(part, stage.slice(head.length));
      return { space: inner.space, prefix: head + inner.prefix };
    }
  }
  return { space, prefix: "" };
}

/** This function gives the prefix of the innermost part of each stage. */
const prefixes = (space: StrategySpace): Map<string, string> => new Map(space.stages.map((s) => [s.name, partOf(space, s.name).prefix]));

const refMatches = (ref: OptionRef, choices: ReadonlyMap<string, string | null>): boolean => (choices.get(ref.stage) ?? null) === ref.option;

/** This function tells if the option choices keep a constraint. */
function holds(c: SpaceConstraint, choices: ReadonlyMap<string, string | null>): boolean {
  if (!refMatches(c.if, choices)) return true;
  return "not" in c.then ? !refMatches(c.then.not, choices) : refMatches(c.then, choices);
}

const describe = (c: SpaceConstraint): string => {
  const ref = (r: OptionRef): string => `${r.stage}=${r.option ?? "null"}`;
  return "not" in c.then ? `if ${ref(c.if)} then not ${ref(c.then.not)}` : `if ${ref(c.if)} then ${ref(c.then)}`;
};

/** This function gives the problems of the range and the default of one param. */
function paramProblems(p: SpaceParam, at: string): Problem[] {
  const out: Problem[] = [];
  if (isNumeric(p)) {
    const { min, max, step } = p;
    if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max)) {
      out.push(["range", `${at} has no finite min and max`]);
      return out;
    }
    if (min > max) out.push(["range", `${at} has an empty range: the min ${min} is more than the max ${max}`]);
    if (p.kind === "int" && (!Number.isInteger(min) || !Number.isInteger(max))) out.push(["range", `${at} is an int with a min or a max that is not whole`]);
    if (step !== undefined && (!Number.isFinite(step) || step <= 0 || (p.kind === "int" && !Number.isInteger(step))))
      out.push(["range", `${at} has the step ${step}, which is not a ${p.kind === "int" ? "whole " : ""}number above 0`]);
    if (p.scale === "log" && min <= 0) out.push(["scale", `${at} has the scale log with the min ${min}, which is not above 0`]);
  } else {
    if (p.scale !== undefined) out.push(["scale", `${at} is a ${p.kind} param with a scale`]);
    if (p.kind === "enum") {
      if (!Array.isArray(p.values) || p.values.length === 0) out.push(["values", `${at} is an enum without values`]);
      else {
        const seen = new Set<unknown>();
        for (const v of p.values) {
          if (seen.has(v)) out.push(["duplicate", `${at} has the value ${show(v)} two times`]);
          seen.add(v);
        }
      }
    }
  }
  if (out.length === 0) {
    const problem = valueProblem(p, p.default);
    if (problem !== undefined) out.push(["default", `the default of ${at} is not in its range: ${problem}`]);
  }
  return out;
}

/** This function gives the problems of one stage option. */
function optionProblems(stage: SpaceStage, o: StageOption): Problem[] {
  const out: Problem[] = [];
  const at = `the option ${stage.name}.${o.id}`;
  if (!Array.isArray(o.params)) return [["config", `${at} has no list of params`]];
  const names = o.params.map((p) => p.name);
  o.params.forEach((p, i) => {
    const pat = `the param ${stage.name}.${o.id}.${p.name}`;
    if (names.indexOf(p.name) !== i) out.push(["duplicate", `${at} has the param ${p.name} two times`]);
    out.push(...paramProblems(p, pat));
    if (p.when === undefined) return;
    const j = names.indexOf(p.when.param);
    if (j < 0) out.push(["unknown", `${pat} has a when with the unknown param ${p.when.param}`]);
    else if (j >= i) out.push(["when", `${pat} has a when with the param ${p.when.param}, which does not come before it`]);
    else if (!Array.isArray(p.when.in) || p.when.in.length === 0) out.push(["when", `${pat} has a when with no values`]);
    else for (const v of p.when.in) {
      const problem = valueProblem(o.params[j]!, v);
      if (problem !== undefined) out.push(["when", `${pat} has a when value that is not a value of ${p.when.param}: ${problem}`]);
    }
  });
  if (o.supports !== undefined) out.push(...supportsProblems(o.supports, at));
  if (o.members !== undefined) {
    const { min, max, ordered } = o.members;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max || typeof ordered !== "boolean")
      out.push(["members", `${at} has a member rule without whole counts 1 <= min <= max and a boolean ordered`]);
  }
  return out;
}

/** This function gives the problems of the `supports` of an option. */
function supportsProblems(supports: unknown, at: string): Problem[] {
  if (!isObject(supports)) return [["shape", `the supports of ${at} are not an object`]];
  const shape = supports["shape"];
  if (shape === undefined) return [];
  if (!Array.isArray(shape) || shape.length === 0) return [["shape", `${at} supports no shape kind. Remove shape to support each kind`]];
  const out: Problem[] = [];
  shape.forEach((k: unknown, i) => {
    if (!isShapeKind(k)) out.push(["shape", `${at} supports the shape kind ${show(k)}, which is not one of ${SHAPE_KIND_IDS.join(", ")}`]);
    else if (shape.indexOf(k) !== i) out.push(["duplicate", `${at} has the shape kind ${k} two times`]);
  });
  return out;
}

/** This function tells if an option supports each shape kind of the list. */
const supportsShapes = (o: StageOption, shapes: readonly ShapeKind[] | undefined): boolean =>
  shapes === undefined || o.supports?.shape === undefined || shapes.every((k) => o.supports!.shape!.includes(k));

/** This function gives the problems of the params of one stage choice. */
function choiceParamProblems(o: StageOption, params: unknown, at: string): Problem[] {
  if (params !== undefined && !isObject(params)) return [["config", `the params of ${at} are not an object`]];
  const given = (params ?? {}) as Values;
  const out: Problem[] = [];
  for (const key of Object.keys(given)) if (!o.params.some((p) => p.name === key)) out.push(["unknown", `${at} has the unknown param ${key}`]);
  const values: Values = {};
  for (const p of o.params) {
    const has = Object.hasOwn(given, p.name);
    if (!isActive(p, values)) {
      if (has) out.push(["inactive", `${at} sets the param ${p.name}, which is not active`]);
      continue;
    }
    const v = has ? given[p.name] : p.default;
    const problem = valueProblem(p, v);
    if (problem !== undefined) out.push(["param", `the param ${p.name} of ${at} is not in its range: ${problem}`]);
    else values[p.name] = normalize(p, v as ParamValue);
  }
  return out;
}

/** This function gives the problems of a config of a space. A member of a meta option has `member: true`. */
function configProblems(space: StrategySpace, config: unknown, member: boolean, shapes?: readonly ShapeKind[]): Problem[] {
  if (!isObject(config) || !isObject(config["stages"])) return [["config", "the config is not an object with stages"]];
  const out: Problem[] = [];
  const stages = config["stages"];
  if (config["space"] !== space.engine) out.push(["space", `the space of the config is ${show(config["space"])}, not ${show(space.engine)}`]);
  for (const key of Object.keys(stages)) if (!space.stages.some((s) => s.name === key)) out.push(["unknown", `the config has the unknown stage ${key}`]);
  const optionOf = (s: SpaceStage): StageOption | undefined => {
    const c = stages[s.name];
    return isObject(c) ? s.options.find((o) => o.id === c["option"]) : undefined;
  };
  const prefix = prefixes(space);
  const metaStage = new Map<string, string>();
  for (const s of space.stages) {
    if (optionOf(s)?.members === undefined) continue;
    const p = prefix.get(s.name)!;
    if (metaStage.has(p)) out.push(["meta", `the stages ${metaStage.get(p)} and ${s.name} both have a meta option`]);
    else metaStage.set(p, s.name);
  }
  const chosen = new Map<string, string | null>();
  for (const s of space.stages) {
    const c = Object.hasOwn(stages, s.name) ? stages[s.name] : undefined;
    const meta = metaStage.get(prefix.get(s.name)!);
    chosen.set(s.name, null);
    if (c === undefined || c === null) {
      if (!s.optional && meta === undefined) out.push(["missing", `the config has no option for the stage ${s.name}`]);
      continue;
    }
    if (!isObject(c) || typeof c["option"] !== "string") {
      out.push(["config", `the choice of the stage ${s.name} has no option`]);
      continue;
    }
    const o = s.options.find((x) => x.id === c["option"]);
    if (o === undefined) {
      out.push(["unknown", `the stage ${s.name} has no option ${c["option"]}`]);
      continue;
    }
    chosen.set(s.name, o.id);
    const at = `the option ${s.name}.${o.id}`;
    if (!supportsShapes(o, shapes)) {
      const missing = shapes!.filter((k) => !o.supports!.shape!.includes(k));
      out.push(["shape", `${at} supports the shape kinds ${o.supports!.shape!.join(", ")}, not ${missing.join(", ")}`]);
    }
    if (meta !== undefined && meta !== s.name) out.push(["meta", `the stage ${s.name} is set, but the meta option of ${meta} replaces the other stages of its part`]);
    out.push(...choiceParamProblems(o, c["params"], at));
    if (o.members === undefined) {
      if (c["members"] !== undefined) out.push(["members", `${at} is not a meta option, but the config gives members`]);
      continue;
    }
    if (member) {
      out.push(["depth", `a member has the meta option ${s.name}.${o.id}. The depth of a meta config is 1`]);
      continue;
    }
    out.push(...memberProblems(partOf(space, s.name).space, o.members, c["members"], at, shapes));
  }
  for (const c of space.constraints ?? []) if (!holds(c, chosen)) out.push(["constraint", `the config breaks the constraint ${describe(c)}`]);
  return out;
}

/** This function gives the problems of the members of a meta option. `part` is the space of the members. */
function memberProblems(part: StrategySpace, rule: MemberRule, members: unknown, at: string, shapes?: readonly ShapeKind[]): Problem[] {
  if (!Array.isArray(members)) return [["members", `${at} is a meta option without a list of members`]];
  const out: Problem[] = [];
  if (members.length < rule.min || members.length > rule.max) out.push(["members", `${at} has ${members.length} members, not ${rule.min} to ${rule.max}`]);
  const ids = new Map<string, number>();
  members.forEach((m: unknown, k) => {
    const inner = configProblems(part, m, true, shapes);
    for (const [claim, detail] of inner) out.push([claim, `the member ${k} of ${at}: ${detail}`]);
    if (inner.length > 0) return;
    const id = idOf(canonicalOf(part, m as StrategyConfig, true));
    if (ids.has(id)) out.push(["duplicate", `the members ${ids.get(id)} and ${k} of ${at} are the same config ${id}`]);
    else ids.set(id, k);
  });
  return out;
}

const toBreaks = (problems: readonly Problem[], inputs: readonly string[] = []): ClaimBreak[] => problems.map(([claim, detail]) => ({ claim, detail, inputs }));

/**
 * This function checks one config of a space. It gives one break for each problem. An empty list tells that the config is good.
 * The `claim` of a break is the kind of the problem, for example `missing`, `unknown`, `inactive`, `param`, `constraint`, `members` or `depth`.
 * With `shapes`, an option that does not support a kind of the list gives the claim `shape`. A member of a meta option gets the same check.
 */
export function checkConfig(space: StrategySpace, config: StrategyConfig, options: ShapeFilter = {}): ClaimBreak[] {
  return toBreaks(configProblems(space, config, false, options.shapes));
}

/**
 * This function checks a space. It gives one break for each problem. An empty list tells that the space is good.
 * It finds duplicate names, empty ranges, defaults out of range, enums without values, bad log scales, unknown names and bad named configs.
 * The `inputs` of a break of a named config have the name of the config.
 */
export function checkSpace(space: StrategySpace): ClaimBreak[] {
  if (!isObject(space) || !Array.isArray(space.stages)) return toBreaks([["schema", "the space is not an object with stages"]]);
  const out: Problem[] = [];
  if (space.schema !== STRATEGY_SPACE_SCHEMA) out.push(["schema", `the schema is ${show(space.schema)}, not ${STRATEGY_SPACE_SCHEMA}`]);
  if (typeof space.engine !== "string" || space.engine === "") out.push(["schema", "the space has no engine name"]);
  if (typeof space.version !== "string") out.push(["schema", "the space has no version"]);
  const names = space.stages.map((s) => s.name);
  space.stages.forEach((s, i) => {
    if (names.indexOf(s.name) !== i) out.push(["duplicate", `the space has the stage ${s.name} two times`]);
    const options: readonly StageOption[] = Array.isArray(s.options) ? s.options : [];
    if (options.length === 0) {
      out.push(["options", `the stage ${s.name} has no options`]);
      return;
    }
    const ids = options.map((o) => o.id);
    options.forEach((o, j) => {
      if (ids.indexOf(o.id) !== j) out.push(["duplicate", `the stage ${s.name} has the option ${o.id} two times`]);
      out.push(...optionProblems(s, o));
    });
    if (!s.optional && options.every((o) => o.members !== undefined)) out.push(["meta", `the stage ${s.name} is not optional and has only meta options, so no base config exists`]);
  });
  const known = (ref: OptionRef, at: string): void => {
    const s = space.stages.find((x) => x.name === ref?.stage);
    if (s === undefined) out.push(["unknown", `${at} has the unknown stage ${ref?.stage}`]);
    else if (ref.option === null ? !s.optional : !s.options.some((o) => o.id === ref.option))
      out.push(["unknown", `${at} has the unknown option ${s.name}=${ref.option ?? "null"}`]);
  };
  (space.constraints ?? []).forEach((c, k) => {
    known(c.if, `the constraint ${k}`);
    known("not" in c.then ? c.then.not : c.then, `the constraint ${k}`);
  });
  for (const part of space.parts ?? []) for (const b of checkSpace(part)) out.push([b.claim, `the part ${part.engine}: ${b.detail}`]);
  if (space.parts !== undefined)
    for (const s of space.stages) if (partOf(space, s.name).prefix === "") out.push(["parts", `the stage ${s.name} is not a stage of a part`]);
  const breaks = toBreaks(out);
  if (breaks.length > 0) return breaks;
  for (const [name, config] of Object.entries(space.named ?? {}))
    breaks.push(...toBreaks(configProblems(space, config, false).map(([c, d]) => [c, `the named config ${name}: ${d}`] as const), [name]));
  return breaks;
}

/** This function gives the canonical form of a config that is known to be good. */
function canonicalOf(space: StrategySpace, config: StrategyConfig, member: boolean): StrategyConfig {
  const stages: Record<string, StageChoice | null> = {};
  for (const s of space.stages) {
    const c = Object.hasOwn(config.stages, s.name) ? config.stages[s.name] : undefined;
    if (c === undefined || c === null) {
      stages[s.name] = null;
      continue;
    }
    const o = s.options.find((x) => x.id === c.option)!;
    const given = c.params ?? {};
    const params: Values = {};
    for (const p of o.params) if (isActive(p, params)) params[p.name] = normalize(p, Object.hasOwn(given, p.name) ? given[p.name]! : p.default);
    if (o.members === undefined || member) {
      stages[s.name] = { option: o.id, params };
      continue;
    }
    const part = partOf(space, s.name).space;
    const members = (c.members ?? []).map((m) => canonicalOf(part, m, true));
    if (!o.members.ordered) members.sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0));
    stages[s.name] = { option: o.id, params, members };
  }
  return { space: space.engine, stages };
}

const idOf = (canonical: StrategyConfig): string => sha256Hex(canonicalJson(canonical)).slice(0, 16);

/**
 * This function gives the canonical form of a config: each stage of the space, the active params only, the defaults, and stable numbers.
 * An unused optional stage is `null`. The members of an unordered meta option are sorted by their `configId`.
 * It throws an `Error` for a config with a break of `checkConfig`.
 */
export function canonicalConfig(space: StrategySpace, config: StrategyConfig): StrategyConfig {
  const problems = configProblems(space, config, false);
  if (problems.length > 0) throw new Error(`The config of the space ${space.engine} is not good: ${problems.map((p) => p[1]).join("; ")}.`);
  return canonicalOf(space, config, false);
}

/**
 * This function gives the id of a config: the first 16 hex characters of the SHA-256 of `canonicalJson` of `canonicalConfig`.
 * Two spellings of one config get one id. The version of the space is not part of the id.
 */
export function configId(space: StrategySpace, config: StrategyConfig): string {
  return idOf(canonicalConfig(space, config));
}

/** This function throws an `Error` for a space with a break of `checkSpace`. */
function assertSpace(space: StrategySpace): void {
  const breaks = checkSpace(space);
  if (breaks.length > 0) throw new Error(`The space ${String(space?.engine)} is not good: ${breaks.map((b) => b.detail).join("; ")}.`);
}

/** This function throws a `RangeError` when a value is not a whole number of `min` or more. */
function assertWhole(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`The option ${name} is ${value}, not a whole number of ${min} or more.`);
}

/** This function gives the last point of the step grid of a numeric param. */
function lastPoint(p: SpaceParam): number {
  const min = p.min!;
  const step = p.step ?? (p.kind === "int" ? 1 : undefined);
  if (step === undefined) return p.max!;
  return min + Math.floor((p.max! - min) / step + 1e-9) * step;
}

/** This function moves a value of a numeric param onto its step and into its range. */
function snap(p: SpaceParam, x: number, digits: number): number {
  const min = p.min!;
  const step = p.step ?? (p.kind === "int" ? 1 : undefined);
  let v = step === undefined ? x : min + Math.round((x - min) / step) * step;
  v = Math.min(lastPoint(p), Math.max(min, v));
  return p.kind === "int" ? zero(Math.round(v)) : Math.min(p.max!, Math.max(min, realForm(v, digits)));
}

/** This function gives the point at the fraction `t` of the range of a numeric param, on its scale. */
function at01(p: SpaceParam, t: number): number {
  const min = p.min!;
  const max = p.max!;
  if (p.scale === "log") return Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
  return min + t * (max - min);
}

/**
 * This function gives the grid values of one param, in increasing order. An `enum` gives its values, and a `bool` gives `false` and `true`.
 * With 1 level, a numeric param gives its default. With k levels, it gives k points from `min` to `max` on its scale and step, without repeats.
 */
export function paramLevels(param: SpaceParam, levels: number): ParamValue[] {
  assertWhole(levels, "levels", 1);
  if (param.kind === "bool") return [false, true];
  if (param.kind === "enum") return [...(param.values ?? [])];
  if (levels === 1 || param.min === param.max) return [normalize(param, param.default)];
  const out: number[] = [];
  const steps = param.kind === "int" || param.step !== undefined ? Math.round((lastPoint(param) - param.min!) / (param.step ?? 1)) + 1 : Infinity;
  if (steps <= levels && param.scale !== "log") {
    for (let j = 0; j < steps; j++) out.push(snap(param, param.min! + j * (param.step ?? 1), 12));
  } else {
    for (let j = 0; j < levels; j++) out.push(snap(param, at01(param, j / (levels - 1)), 12));
  }
  return [...new Set(out)];
}

/** This function tells if a later param of the list reads a param in its `when`. */
const readLater = (params: readonly SpaceParam[], i: number): boolean => params.slice(i + 1).some((q) => q.when?.param === params[i]!.name);

/** This function gives the count of the grid assignments of the params of an option, with only the active params. */
function countParams(params: readonly SpaceParam[], levels: number, i = 0, values: Values = {}): bigint {
  if (i === params.length) return 1n;
  const p = params[i]!;
  if (!isActive(p, values)) return countParams(params, levels, i + 1, values);
  const lv = paramLevels(p, levels);
  if (!readLater(params, i)) return BigInt(lv.length) * countParams(params, levels, i + 1, values);
  let sum = 0n;
  for (const v of lv) sum += countParams(params, levels, i + 1, { ...values, [p.name]: v });
  return sum;
}

/** This function gives the grid assignments of the params of an option, in a stable order. */
function* gridParams(params: readonly SpaceParam[], levels: number, i = 0, values: Values = {}): Generator<Values> {
  if (i === params.length) {
    yield { ...values };
    return;
  }
  const p = params[i]!;
  if (!isActive(p, values)) {
    yield* gridParams(params, levels, i + 1, values);
    return;
  }
  for (const v of paramLevels(p, levels)) yield* gridParams(params, levels, i + 1, { ...values, [p.name]: v });
}

/** One combination of options of a space, with its count of grid points. */
interface Combo {
  readonly choices: Choices;
  readonly base: boolean;
  /** The count of the grid points, or `null` when the count is more than the limit. */
  readonly weight: bigint | null;
}

const optionIds = (choices: Choices): Map<string, string | null> => new Map([...choices].map(([k, o]) => [k, o?.id ?? null]));
const keeps = (space: StrategySpace, choices: Choices): boolean => (space.constraints ?? []).every((c) => holds(c, optionIds(choices)));

/** This function gives the count of the member lists of a meta option from `base` base configs, or `null` above `limit`. */
function memberLists(base: bigint, rule: MemberRule, limit: bigint): bigint | null {
  let sum = 0n;
  for (let m = rule.min; m <= rule.max; m++) {
    let n = 1n;
    for (let k = 0; k < m; k++) {
      n = (n * (base - BigInt(k))) / (rule.ordered ? 1n : BigInt(k + 1));
      if (n <= 0n) break;
    }
    if (n <= 0n) break;
    sum += n;
    if (sum > limit) return null;
  }
  return sum;
}

/** This function multiplies two counts. A `null` count or a product above `limit` gives `null`. */
const times = (a: bigint | null, b: bigint | null, limit: bigint): bigint | null => (a === null || b === null ? null : a * b > limit ? null : a * b);

/**
 * This function gives the combinations of options of a space and their grid counts.
 * A product space joins the combinations of its parts. Each combination keeps the constraints.
 */
function combos(space: StrategySpace, levels: number, meta: boolean, limit: bigint): Combo[] {
  if (space.parts !== undefined && space.parts.length > 0) {
    let acc: Combo[] = [{ choices: new Map(), base: true, weight: 1n }];
    for (const part of space.parts) {
      const head = `${part.engine}.`;
      const own = combos(part, levels, meta, limit);
      const next: Combo[] = [];
      for (const a of acc)
        for (const b of own) {
          const choices = new Map(a.choices);
          for (const [k, o] of b.choices) choices.set(head + k, o);
          const base = a.base && b.base;
          next.push({ choices, base, weight: base ? a.weight! * b.weight! : times(a.weight, b.weight, limit) });
        }
      acc = next;
    }
    return acc.filter((c) => keeps(space, c.choices));
  }
  const counts = new Map<StageOption, bigint>();
  const countOf = (o: StageOption): bigint => {
    if (!counts.has(o)) counts.set(o, countParams(o.params, levels));
    return counts.get(o)!;
  };
  const out: Combo[] = [];
  const stages = space.stages;
  const walk = (i: number, choices: Map<string, StageOption | null>, weight: bigint): void => {
    if (i === stages.length) {
      if (keeps(space, choices)) out.push({ choices: new Map(choices), base: true, weight });
      return;
    }
    const s = stages[i]!;
    const list: (StageOption | null)[] = s.options.filter((o) => o.members === undefined);
    if (s.optional) list.push(null);
    for (const o of list) {
      choices.set(s.name, o);
      walk(i + 1, choices, o === null ? weight : weight * countOf(o));
    }
    choices.delete(s.name);
  };
  walk(0, new Map(), 1n);
  if (!meta) return out;
  const base = out.reduce((sum, c) => sum + c.weight!, 0n);
  for (const s of stages)
    for (const o of s.options) {
      if (o.members === undefined) continue;
      const choices = new Map<string, StageOption | null>(stages.map((x) => [x.name, x === s ? o : null]));
      if (keeps(space, choices)) out.push({ choices, base: false, weight: times(countOf(o), memberLists(base, o.members, limit), limit) });
    }
  return out;
}

/**
 * This function gives the count of the grid points of a space, with `levels` levels for each numeric param.
 * It counts only the active params and the combinations that keep the constraints. It gives the meta configs apart.
 * With `shapes`, it counts only the options that support each kind of the list.
 */
export function spaceSize(space: StrategySpace, options: SpaceSizeOptions): SpaceSize {
  assertSpace(space);
  assertWhole(options.levels, "levels", 1);
  assertShapes(options.shapes);
  return sizeOf(restrict(space, options.shapes), options.levels, options.maxMeta ?? 10n ** 18n);
}

/**
 * This function gives the space with only the options that support each shape kind of `shapes`. Without `shapes`, it gives the same space.
 * A stage can lose all of its options. Then the space has no config with that stage.
 */
function restrict(space: StrategySpace, shapes: readonly ShapeKind[] | undefined): StrategySpace {
  if (shapes === undefined) return space;
  return {
    ...space,
    stages: space.stages.map((s) => ({ ...s, options: s.options.filter((o) => supportsShapes(o, shapes)) })),
    ...(space.parts === undefined ? {} : { parts: space.parts.map((p) => restrict(p, shapes)) }),
  };
}

/** This function throws a `RangeError` for a list of shape kinds with a kind that is not declared. */
function assertShapes(shapes: readonly ShapeKind[] | undefined): void {
  if (shapes === undefined) return;
  if (!Array.isArray(shapes)) throw new RangeError("The option shapes is not a list of shape kinds.");
  for (const k of shapes) if (!isShapeKind(k)) throw new RangeError(`The shape kind ${show(k)} is not one of ${SHAPE_KIND_IDS.join(", ")}.`);
}

/** This function gives the count of the grid points of a space that is known to be good. */
function sizeOf(space: StrategySpace, levels: number, limit: bigint): SpaceSize {
  let base = 0n;
  let meta: bigint | null = 0n;
  for (const c of combos(space, levels, true, limit)) {
    if (c.base) base += c.weight!;
    else meta = meta === null || c.weight === null || meta + c.weight > limit ? null : meta + c.weight;
  }
  return { base, meta };
}

/** This function gives the cartesian product of lists, with the last list as the fastest. */
function* product<T>(lists: readonly (readonly T[])[], i = 0, acc: T[] = []): Generator<T[]> {
  if (i === lists.length) {
    yield [...acc];
    return;
  }
  for (const x of lists[i]!) {
    acc.push(x);
    yield* product(lists, i + 1, acc);
    acc.pop();
  }
}

/** This function gives the configs of the grid of a space, without meta options. */
function gridConfigs(space: StrategySpace, levels: number, limit: number, shapes: readonly ShapeKind[] | undefined): StrategyConfig[] {
  const kept = restrict(space, shapes);
  const size = sizeOf(kept, levels, 0n).base;
  if (size > BigInt(limit)) throw new RangeError(`The grid of the space ${space.engine} has ${size} configs, more than the limit ${limit}.`);
  const out: StrategyConfig[] = [];
  for (const c of combos(kept, levels, false, 0n)) {
    const names = [...c.choices.keys()];
    const lists = names.map((k) => {
      const o = c.choices.get(k)!;
      return o === null ? [null] : [...gridParams(o.params, levels)].map((params): StageChoice => ({ option: o.id, params }));
    });
    for (const row of product<StageChoice | null>(lists)) out.push(canonicalOf(space, { space: space.engine, stages: Object.fromEntries(names.map((k, i) => [k, row[i]!])) }, false));
  }
  return out;
}

/** This function gives a random order of the numbers from 0 to `n - 1`. */
function permutation(n: number, r: () => number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** This function gives the value of a param at the fraction `u` of its range. A sampled real number has 6 significant digits. */
function sampleValue(p: SpaceParam, u: number): ParamValue {
  if (p.kind === "bool") return u >= 0.5;
  if (p.kind === "enum") {
    const values = p.values!;
    return values[Math.min(values.length - 1, Math.floor(u * values.length))]!;
  }
  if (p.min === p.max) return normalize(p, p.min!);
  if (p.scale !== "log" && (p.kind === "int" || p.step !== undefined)) {
    const steps = Math.round((lastPoint(p) - p.min!) / (p.step ?? 1)) + 1;
    return snap(p, p.min! + Math.min(steps - 1, Math.floor(u * steps)) * (p.step ?? 1), 6);
  }
  return snap(p, at01(p, u), 6);
}

/** This function gives a seed of 32 bits from a seed and a step name. */
const subSeed = (seed: number, step: string): number => Math.floor(stepRandom(seed, step)() * 4294967296);

/** This function gives a sample of a space: Latin hypercube strata over the options, the params and the member counts. */
function sampleConfigs(space: StrategySpace, n: number, seed: number, meta: boolean, maxTries: number): StrategyConfig[] {
  const stages = space.stages;
  const prefix = prefixes(space);
  const lists = stages.map((s) => {
    const list: (StageOption | null)[] = s.options.filter((o) => meta || o.members === undefined);
    if (s.optional) list.push(null);
    if (list.length === 0) throw new Error(`The stage ${s.name} of the space ${space.engine} has no option for a sample. A shape filter can remove all of its options.`);
    return list;
  });
  const points: Map<string, StageOption | null>[] = [];
  let tries = 0;
  for (let round = 0; points.length < n; round++) {
    const r = stepRandom(seed, `options:${round}`);
    const columns = lists.map((list) => permutation(n, r).map((p) => list[Math.floor((p * list.length) / n)]!));
    for (let i = 0; i < n && points.length < n; i++) {
      if (tries >= maxTries) throw new Error(`The constraints of the space ${space.engine} remove too many points: ${points.length} of ${n} configs after ${tries} tries.`);
      tries++;
      const choices = new Map<string, StageOption | null>(stages.map((s, k) => [s.name, columns[k]![i]!]));
      const metaPart = new Map<string, string>();
      for (const s of stages) {
        const o = choices.get(s.name);
        if (o?.members !== undefined && !metaPart.has(prefix.get(s.name)!)) metaPart.set(prefix.get(s.name)!, s.name);
      }
      for (const s of stages) {
        const m = metaPart.get(prefix.get(s.name)!);
        if (m !== undefined && m !== s.name) choices.set(s.name, null);
      }
      if (keeps(space, choices)) points.push(choices);
    }
  }
  const values: Values[][] = points.map(() => stages.map(() => ({})));
  const members: StrategyConfig[][][] = points.map(() => stages.map(() => []));
  stages.forEach((s, k) => {
    for (const o of s.options) {
      const users = points.flatMap((c, i) => (c.get(s.name) === o ? [i] : []));
      if (users.length === 0) continue;
      for (const p of o.params) {
        const active = users.filter((i) => isActive(p, values[i]![k]!));
        const r = stepRandom(seed, `param:${s.name}:${o.id}:${p.name}`);
        permutation(active.length, r).forEach((stratum, j) => {
          values[active[j]!]![k]![p.name] = sampleValue(p, (stratum + r()) / active.length);
        });
      }
      if (o.members === undefined) continue;
      const part = partOf(space, s.name).space;
      const poolSize = Math.max(n, 4 * o.members.max, 8);
      const seen = new Set<string>();
      const pool = sampleConfigs(part, poolSize, subSeed(seed, `pool:${s.name}:${o.id}`), false, Math.max(1000, 100 * poolSize)).filter((c) => {
        const id = idOf(c);
        return seen.has(id) ? false : (seen.add(id), true);
      });
      const r = stepRandom(seed, `members:${s.name}:${o.id}`);
      const { min, max } = o.members;
      permutation(users.length, r).forEach((stratum, j) => {
        const count = min + Math.min(max - min, Math.floor(((stratum + r()) / users.length) * (max - min + 1)));
        if (pool.length < count) throw new Error(`The space ${part.engine} has only ${pool.length} distinct base samples, fewer than the ${count} members of ${s.name}.${o.id}.`);
        const picked = permutation(pool.length, r).slice(0, count);
        members[users[j]!]![k] = picked.map((x) => pool[x]!);
      });
    }
  });
  return points.map((choices, i) => {
    const out: Record<string, StageChoice | null> = {};
    stages.forEach((s, k) => {
      const o = choices.get(s.name)!;
      out[s.name] = o === null ? null : o.members === undefined ? { option: o.id, params: values[i]![k]! } : { option: o.id, params: values[i]![k]!, members: members[i]![k]! };
    });
    return canonicalConfig(space, { space: space.engine, stages: out });
  });
}

/**
 * This function gives configs of a space, in their canonical form. Each config keeps the constraints. The result is deterministic.
 *
 * - The mode `grid` gives each grid point without a meta option, in a stable order. Stages, options and values go in the order of the space.
 * - The mode `sample` gives `n` configs of a seeded Latin hypercube. The options of a stage get equal strata, and each active param gets its own strata.
 * - A sample draws again when a point breaks a constraint. After `maxTries` draws, it throws an `Error`. Two sampled configs can be equal.
 * - With `shapes`, only the options that support each kind of the list count. Without `shapes`, the result does not change.
 */
export function enumerateSpace(space: StrategySpace, options: EnumerateOptions): StrategyConfig[] {
  assertSpace(space);
  assertShapes(options.shapes);
  if (options.mode === "grid") {
    assertWhole(options.levels, "levels", 1);
    return gridConfigs(space, options.levels, options.limit ?? 100_000, options.shapes);
  }
  if (options.mode !== "sample") throw new RangeError(`The mode ${String((options as { mode?: unknown }).mode)} is not grid or sample.`);
  assertWhole(options.n, "n", 0);
  if (!Number.isInteger(options.seed)) throw new RangeError(`The seed ${options.seed} is not a whole number.`);
  const meta = options.meta ?? "skip";
  if (meta !== "skip" && meta !== "sample") throw new RangeError(`The option meta is ${String(meta)}, not skip or sample.`);
  if (options.n === 0) return [];
  return sampleConfigs(restrict(space, options.shapes), options.n, options.seed, meta === "sample", options.maxTries ?? Math.max(1000, 100 * options.n));
}

/**
 * This function gives the shape kinds that a space accepts, in the order of `SHAPE_KINDS`. The value comes from the `supports` of the options.
 * A space accepts a kind when it has at least one config without a meta option on that kind.
 */
export function spaceShapeKinds(space: StrategySpace): ShapeKind[] {
  assertSpace(space);
  return SHAPE_KIND_IDS.filter((k) => sizeOf(restrict(space, [k]), 1, 0n).base > 0n);
}

/**
 * This function joins configs of the parts of a product space into one config of the space `space`.
 * The name of each stage gets the prefix `<space of the part>.`. The members of a meta option do not change.
 */
export function joinConfigs(space: string, parts: readonly StrategyConfig[]): StrategyConfig {
  const stages: Record<string, StageChoice | null> = {};
  for (const part of parts) for (const [k, c] of Object.entries(part.stages)) stages[`${part.space}.${k}`] = c;
  return { space, stages };
}

/** This function gives the config of the part `engine` of a joint config. It throws a `RangeError` when no stage has the prefix `<engine>.`. */
export function splitConfig(config: StrategyConfig, engine: string): StrategyConfig {
  const head = `${engine}.`;
  const entries = Object.entries(config.stages).filter(([k]) => k.startsWith(head));
  if (entries.length === 0) throw new RangeError(`The config of the space ${config.space} has no stage of the part ${engine}.`);
  return { space: engine, stages: Object.fromEntries(entries.map(([k, c]) => [k.slice(head.length), c])) };
}

/**
 * This function joins two spaces, for example a packer and a router, into the space `name`. The stages of `a` and `b` get the prefixes `<a.engine>.` and `<b.engine>.`.
 * The constraints get the same prefixes. The named configs are the pairs `<name of a>+<name of b>`. It throws a `RangeError` when the two engines have the same name.
 */
export function productSpace(a: StrategySpace, b: StrategySpace, name: string): StrategySpace {
  if (a.engine === b.engine) throw new RangeError(`The two spaces have the same engine ${a.engine}.`);
  if (name === "") throw new RangeError("The product space has no name.");
  const stagesOf = (s: StrategySpace): SpaceStage[] => s.stages.map((x) => ({ ...x, name: `${s.engine}.${x.name}` }));
  const ref = (s: StrategySpace, r: OptionRef): OptionRef => ({ stage: `${s.engine}.${r.stage}`, option: r.option });
  const constraintsOf = (s: StrategySpace): SpaceConstraint[] =>
    (s.constraints ?? []).map((c) => ({ if: ref(s, c.if), then: "not" in c.then ? { not: ref(s, c.then.not) } : ref(s, c.then) }));
  const named: Record<string, StrategyConfig> = {};
  for (const [ka, ca] of Object.entries(a.named ?? {})) for (const [kb, cb] of Object.entries(b.named ?? {})) named[`${ka}+${kb}`] = joinConfigs(name, [ca, cb]);
  const constraints = [...constraintsOf(a), ...constraintsOf(b)];
  return {
    schema: STRATEGY_SPACE_SCHEMA,
    engine: name,
    version: `${a.engine}@${a.version}+${b.engine}@${b.version}`,
    stages: [...stagesOf(a), ...stagesOf(b)],
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(Object.keys(named).length > 0 ? { named } : {}),
    parts: [a, b],
  };
}
