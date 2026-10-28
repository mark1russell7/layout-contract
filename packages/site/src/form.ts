// The form of one stage of a strategy space. The space alone makes the controls, so a new option of an engine gets a control with no change of the site.
import type { ParamValue, SpaceParam, StageOption, StrategyConfig, StrategySpace } from "@mark1russell7/layout-contract";
import { modeKey, OMIT, VALUE, type Control } from "./catalog.ts";
import { esc } from "./ui.ts";

/** The state of the form of one stage: the option, the values of its params and, for a meta option, the state of its member. */
export interface FormState {
  readonly option: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly member?: FormState;
}

/** The facts that the form uses besides the space: the controls and one line about each option. */
export interface FormFacts {
  readonly controls: readonly Control[];
  readonly about: Readonly<Record<string, string>>;
}

/** This function gives the option of a stage. */
function stageOptions(space: StrategySpace, stage: string): readonly StageOption[] {
  return space.stages.find((s) => s.name === stage)?.options ?? [];
}

/** This function tells if a param is active for the values of the earlier params. */
export function isActive(p: SpaceParam, values: Readonly<Record<string, ParamValue>>): boolean {
  if (p.when === undefined) return true;
  const v = values[p.when.param];
  return v !== undefined && p.when.in.some((x) => x === v);
}

/** This function gives the values of each param of an option: the given value, else the default. */
export function valuesOf(option: StageOption, given: Readonly<Record<string, ParamValue>>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of option.params) out[p.name] = Object.hasOwn(given, p.name) ? given[p.name]! : p.default;
  return out;
}

/** This function gives the config of a form state. It keeps only the active params, so `checkConfig` finds no inactive param. */
export function configOfState(space: StrategySpace, stage: string, state: FormState): StrategyConfig {
  return { space: space.engine, stages: { [stage]: choiceOf(space, stage, state) } };
}

function choiceOf(space: StrategySpace, stage: string, state: FormState): { option: string; params: Record<string, ParamValue>; members?: StrategyConfig[] } {
  const option = stageOptions(space, stage).find((o) => o.id === state.option);
  if (option === undefined) throw new RangeError(`The stage ${stage} has no option "${state.option}".`);
  const all = valuesOf(option, state.params);
  const params: Record<string, ParamValue> = {};
  for (const p of option.params) if (isActive(p, params)) params[p.name] = all[p.name]!;
  if (option.members === undefined) return { option: option.id, params };
  const member = state.member ?? { option: stageOptions(space, stage).find((o) => o.members === undefined)!.id, params: {} };
  return { option: option.id, params, members: [configOfState(space, stage, member)] };
}

/** This function gives the form state of a config of one stage. */
export function stateOfConfig(config: StrategyConfig, stage: string): FormState {
  const c = config.stages[stage];
  if (c === undefined || c === null) throw new RangeError(`The config has no choice for the stage ${stage}.`);
  const member = c.members?.[0];
  return { option: c.option, params: { ...(c.params ?? {}) }, ...(member === undefined ? {} : { member: stateOfConfig(member, stage) }) };
}

/** This function gives the text of an enum value. `OMIT` is "default", and `Infinity` is "no limit". */
export function valueText(v: ParamValue): string {
  if (v === OMIT) return "default";
  if (v === VALUE) return "a number";
  if (v === "Infinity") return "no limit (Infinity)";
  return String(v);
}

/** This function gives the HTML of the control of one param. Each value goes through `esc`, and each enum value is JSON in `value`. */
function paramHtml(p: SpaceParam, value: ParamValue, id: string, label: string): string {
  const attrs = `id="${esc(id)}" data-p="${esc(p.name)}" data-kind="${p.kind}"`;
  if (p.kind === "bool") return `<input type="checkbox" ${attrs}${value === true ? " checked" : ""} />`;
  if (p.kind === "enum") {
    const opts = (p.values ?? []).map((v) => `<option value="${esc(JSON.stringify(v))}"${v === value ? " selected" : ""}>${esc(valueText(v))}</option>`).join("");
    return `<select ${attrs}>${opts}</select>`;
  }
  const step = p.step ?? (p.kind === "int" ? 1 : "any");
  const log = p.scale === "log";
  const v = Number(value);
  // A log scale moves the slider on the log of the value. The number box holds the value.
  const range = log
    ? `<input type="range" class="slider" data-for="${esc(p.name)}" data-log="1" min="${Math.log(p.min!)}" max="${Math.log(p.max!)}" step="any" value="${Math.log(v)}" aria-label="${esc(label)}" />`
    : `<input type="range" class="slider" data-for="${esc(p.name)}" min="${p.min}" max="${p.max}" step="${step}" value="${v}" aria-label="${esc(label)}" />`;
  return `<span class="num-pair">${range}<input type="number" ${attrs} min="${p.min}" max="${p.max}" step="${step}" value="${v}" inputmode="decimal" /></span>`;
}

/** This function gives the range of a numeric param as text, for example `1 to 20, step 1, log scale`. */
function rangeText(p: SpaceParam): string {
  if (p.kind !== "int" && p.kind !== "real") return "";
  return `${p.min} to ${p.max}${p.step === undefined ? "" : `, step ${p.step}`}${p.scale === "log" ? ", log scale" : ""}`;
}

/**
 * This function gives the HTML of the form of one stage. The form has a list of the options, then a row for each param of the chosen option.
 * An inactive param has the attribute `hidden`. A fixed option has a row without a control. A meta option has the form of its member.
 */
export function formHtml(space: StrategySpace, stage: string, state: FormState, facts: FormFacts, prefix: string, member = false): string {
  const options = stageOptions(space, stage).filter((o) => !member || o.members === undefined);
  const option = options.find((o) => o.id === state.option) ?? options[0]!;
  const values = valuesOf(option, state.params);
  const controls = facts.controls.filter((c) => c.option === option.id);
  const pick = `<label class="field option-pick"><span class="field-name">${member ? "Wrapped strategy" : "Strategy"}</span><select data-option="${esc(prefix)}">${options
    .map((o) => `<option value="${esc(o.id)}"${o.id === option.id ? " selected" : ""}>${esc(o.id)}${o.members === undefined ? "" : " (wraps a strategy)"}</option>`)
    .join("")}</select></label><p class="hint">${esc(facts.about[option.id] ?? "")}</p>`;
  const active: Record<string, ParamValue> = {};
  const rows: string[] = [];
  for (const p of option.params) {
    const on = isActive(p, active);
    if (on) active[p.name] = values[p.name]!;
    const key = modeKey(p) ?? p.name;
    const control = controls.find((c) => c.key === key);
    const id = `${prefix}${option.id}.${p.name}`;
    const withMode = option.params.some((q) => q.name === `${p.name}.mode`);
    const label = withMode ? `${key}: the number` : key;
    const tags = [control?.derived ? `<span class="tag" title="The engine declares no range, so the site made this range.">site range</span>` : "", `<span class="range">${esc(rangeText(p))}</span>`].join(" ");
    const describe = modeKey(p) === undefined && withMode ? "" : (control?.describe ?? "");
    rows.push(
      `<div class="field"${on ? "" : " hidden"} data-row="${esc(p.name)}"><label class="field-name" for="${esc(id)}"><code>${esc(label)}</code></label>${paramHtml(p, values[p.name]!, id, label)}<span class="field-help">${esc(describe)} ${tags}</span></div>`,
    );
  }
  for (const c of controls.filter((x) => x.kind === "fixed"))
    rows.push(`<div class="field fixed"><span class="field-name"><code>${esc(c.key)}</code></span><span class="fixed-value">the engine default (a ${esc(c.type ?? "value")})</span><span class="field-help">${esc(c.describe)}</span></div>`);
  const head = `${pick}<div class="fields" data-form="${esc(prefix)}">${rows.join("") || `<p class="hint">This strategy has no options.</p>`}</div>`;
  if (option.members === undefined) return head;
  const inner = state.member ?? { option: options.find((o) => o.members === undefined)!.id, params: {} };
  const why = controls.filter((c) => c.kind === "member").map((c) => `<code>${esc(c.key)}</code>`).join(" and ");
  return `${head}<fieldset class="member"><legend>The strategy that <code>${esc(option.id)}</code> wraps (${why})</legend>${formHtml(space, stage, inner, facts, `${prefix}m.`, true)}</fieldset>`;
}

/** This function parses the value of one control. An enum value is JSON. A number box gives a number. */
export function parseValue(kind: string, raw: string, checked: boolean): ParamValue {
  if (kind === "bool") return checked;
  if (kind === "enum") {
    try {
      const v: unknown = JSON.parse(raw);
      return typeof v === "string" || typeof v === "number" ? v : raw;
    } catch {
      return raw;
    }
  }
  return Number(raw);
}
