// The section "Strategy space": an interactive view of a strategy space of the data folder.
import {
  canonicalConfig,
  checkSpace,
  configId,
  paramLevels,
  spaceSize,
  type SpaceParam,
  type StageOption,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import type { SpaceFile } from "./data.ts";
import { esc } from "./ui.ts";

/** One space of the data folder, with the path of its file. */
export interface SpaceEntry {
  readonly path: string;
  readonly file: SpaceFile;
}

interface State {
  path: string;
  levels: number;
  option: string | null;
  named: string | null;
}

const count = (v: bigint | null): string => (v === null ? "more than 10<sup>18</sup>" : v.toLocaleString("en"));

function range(p: SpaceParam): string {
  if (p.kind === "bool") return "false, true";
  if (p.kind === "enum") return (p.values ?? []).map((v) => `<code>${esc(v)}</code>`).join(", ");
  const parts = [`${esc(p.min)} to ${esc(p.max)}`];
  if (p.step !== undefined) parts.push(`step ${esc(p.step)}`);
  if (p.scale === "log") parts.push("log scale");
  return parts.join(", ");
}

function levelsOf(p: SpaceParam, levels: number): string {
  try {
    return paramLevels(p, levels)
      .map((v) => `<code>${esc(v)}</code>`)
      .join(" ");
  } catch (error) {
    return esc((error as Error).message);
  }
}

/** This function gives the option choices of a config, as `stage/option` keys, with the members of a meta option. */
function chosen(config: StrategyConfig): Set<string> {
  const out = new Set<string>();
  for (const [stage, c] of Object.entries(config.stages)) {
    if (c === null) continue;
    out.add(`${stage}/${c.option}`);
    for (const m of c.members ?? []) for (const [s2, c2] of Object.entries(m.stages)) if (c2 !== null) out.add(`member:${s2}/${c2.option}`);
  }
  return out;
}

function optionPanel(space: StrategySpace, key: string, levels: number): string {
  const [stageName, optionId] = key.split("/");
  const stage = space.stages.find((s) => s.name === stageName);
  const option: StageOption | undefined = stage?.options.find((o) => o.id === optionId);
  if (stage === undefined || option === undefined) return "";
  const members = option.members
    ? `<p>This is a meta option. It takes ${option.members.min} to ${option.members.max} base configs of the space as members, ${
        option.members.ordered ? "in their order" : "in any order"
      }. It replaces the other stages of its config.</p>`
    : "";
  const rows = option.params
    .map(
      (p) => `<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.kind)}</td><td>${range(p)}</td><td><code>${esc(p.default)}</code></td><td>${
        p.when ? `only when <code>${esc(p.when.param)}</code> is ${p.when.in.map((v) => `<code>${esc(v)}</code>`).join(" or ")}` : "always"
      }</td><td>${levelsOf(p, levels)}</td></tr>`,
    )
    .join("");
  const table = option.params.length
    ? `<div class="scroll"><table class="table"><thead><tr><th>Param</th><th>Kind</th><th>Range</th><th>Default</th><th>Active</th><th>Grid values at ${levels} levels</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="hint">This option has no params.</p>`;
  return `<div class="panel"><h4>The option <code>${esc(stage.name)}.${esc(option.id)}</code></h4>${members}${table}</div>`;
}

function namedPanel(space: StrategySpace, name: string): string {
  const config = space.named?.[name];
  if (config === undefined) return "";
  let id = "";
  let json = "";
  try {
    id = configId(space, config);
    json = JSON.stringify(canonicalConfig(space, config), null, 1);
  } catch (error) {
    return `<div class="panel"><p class="bad">${esc((error as Error).message)}</p></div>`;
  }
  return `<div class="panel"><h4>The named point <code>${esc(name)}</code></h4>
    <p><code>configId</code>: <code>${esc(id)}</code>. Two spellings of one config get the same id.</p>
    <details><summary>The canonical config</summary><pre class="code">${esc(json)}</pre></details></div>`;
}

function constraintText(space: StrategySpace): string {
  const list = space.constraints ?? [];
  if (list.length === 0) return `<p class="hint">This space has no constraints.</p>`;
  const ref = (r: { stage: string; option: string | null }) => (r.option === null ? `<code>${esc(r.stage)}</code> is not used` : `<code>${esc(r.stage)}</code> is <code>${esc(r.option)}</code>`);
  const not = (r: { stage: string; option: string | null }) => (r.option === null ? `<code>${esc(r.stage)}</code> is used` : `<code>${esc(r.stage)}</code> is not <code>${esc(r.option)}</code>`);
  return `<ul class="rules">${list
    .map((c) => `<li>If ${ref(c.if)}, then ${"not" in c.then ? not(c.then.not) : ref(c.then)}.</li>`)
    .join("")}</ul>`;
}

function draw(root: HTMLElement, entries: readonly SpaceEntry[], s: State, version: string): void {
  const entry = entries.find((e) => e.path === s.path) ?? entries[0]!;
  const space = entry.file.space as StrategySpace;
  const breaks = checkSpace(space);
  let size = "";
  if (breaks.length === 0) {
    const n = spaceSize(space, { levels: s.levels });
    size = `<div class="tiles">
      <div class="tile"><div class="tile-label">Base configs</div><div class="tile-value">${count(n.base)}</div><div class="tile-hint">Grid points without a meta option</div></div>
      <div class="tile"><div class="tile-label">Meta configs</div><div class="tile-value">${count(n.meta)}</div><div class="tile-hint">Grid points with a meta option</div></div>
    </div>`;
  }
  const check = breaks.length === 0
    ? `<p class="good"><code>checkSpace</code> finds no problems.</p>`
    : `<div class="bad"><p><code>checkSpace</code> finds ${breaks.length} problems:</p><ul>${breaks.map((b) => `<li>${esc(b.detail)}</li>`).join("")}</ul></div>`;
  const marks = s.named !== null && space.named?.[s.named] ? chosen(space.named[s.named]!) : new Set<string>();
  const stages = space.stages
    .map((st, i) => {
      const chips = st.options
        .map((o) => {
          const key = `${st.name}/${o.id}`;
          const on = marks.has(key);
          const member = marks.has(`member:${key}`);
          return `<button type="button" class="chip${s.option === key ? " picked" : ""}${on ? " on" : ""}${member ? " member" : ""}" data-option="${esc(key)}" aria-pressed="${s.option === key}">${esc(o.id)}${
            o.members ? ' <span class="tag">meta</span>' : ""
          }${o.params.length ? ` <span class="tag">${o.params.length} ${o.params.length === 1 ? "param" : "params"}</span>` : ""}</button>`;
        })
        .join("");
      const unused = s.named !== null && st.optional && !st.options.some((o) => marks.has(`${st.name}/${o.id}`));
      return `${i > 0 ? '<span class="arrow" aria-hidden="true">→</span>' : ""}<div class="stage${unused ? " unused" : ""}"><div class="stage-name">${esc(st.name)}${
        st.optional ? ' <span class="tag">optional</span>' : ""
      }</div><div class="chips">${chips}</div></div>`;
    })
    .join("");
  const named = Object.keys(space.named ?? {})
    .map((n) => `<button type="button" class="chip${s.named === n ? " picked" : ""}" data-named="${esc(n)}" aria-pressed="${s.named === n}">${esc(n)}</button>`)
    .join("");
  const picker =
    entries.length > 1
      ? `<label class="runs">Space <select data-space>${entries
          .map((e) => `<option value="${esc(e.path)}"${e.path === entry.path ? " selected" : ""}>${esc((e.file.space as StrategySpace).engine)}${e.file.example ? " (example)" : ""} · ${esc(e.file.source)}</option>`)
          .join("")}</select></label>`
      : "";
  const engines = entries.filter((e) => !e.file.example).length;
  root.innerHTML = `
    <p class="dataline"><span class="badge${entry.file.example ? " warn" : ""}">${entry.file.example ? "Example" : "Engine"}</span> The space <code>${esc(space.engine)}</code> ${esc(space.version)}, from ${esc(entry.file.source)}, ${esc(entry.file.date)} · <a href="https://www.npmjs.com/package/@mark1russell7/layout-contract/v/${esc(version)}">layout-contract ${esc(version)}</a></p>
    ${engines === 0 ? `<p class="note">No engine has published its space yet. The space <code>packSpace</code> of packing and <code>routeSpace</code> of highways come later. Until then, this view shows an example space.</p>` : ""}
    ${entry.file.note ? `<p>${esc(entry.file.note)}</p>` : ""}
    ${picker}
    ${check}
    <div class="levels"><label for="levels">Levels of each numeric param <output>${s.levels}</output></label><input id="levels" type="range" min="1" max="8" step="1" value="${s.levels}" data-levels /></div>
    ${size}
    <h3>The stages</h3>
    <p class="hint">A config picks one option of each stage, from left to right. Select an option to see its params.</p>
    <div class="pipeline">${stages}</div>
    ${s.option !== null ? optionPanel(space, s.option, s.levels) : ""}
    <h3>The constraints</h3>
    ${constraintText(space)}
    <h3>The named points</h3>
    ${named ? `<div class="chips">${named}</div>` : `<p class="hint">This space has no named points.</p>`}
    ${s.named !== null ? namedPanel(space, s.named) : ""}`;
}

/** This function shows the strategy spaces in the element `root`. An engine space comes before an example. */
export function renderSpace(root: HTMLElement, entries: readonly SpaceEntry[], version: string): void {
  if (entries.length === 0) {
    root.innerHTML = `<p class="empty">No strategy space is in <code>data/spaces/</code> or <code>data/examples/</code>.</p>`;
    return;
  }
  const sorted = [...entries].sort((a, b) => Number(Boolean(a.file.example)) - Number(Boolean(b.file.example)) || a.path.localeCompare(b.path));
  const state: State = { path: sorted[0]!.path, levels: 3, option: null, named: null };
  const redraw = (focus?: string): void => {
    draw(root, sorted, state, version);
    if (focus) root.querySelector<HTMLElement>(focus)?.focus();
  };
  root.addEventListener("click", (event) => {
    const el = (event.target as Element).closest<HTMLElement>("[data-option],[data-named]");
    if (el === null) return;
    const option = el.dataset["option"];
    const named = el.dataset["named"];
    if (option !== undefined) state.option = state.option === option ? null : option;
    if (named !== undefined) state.named = state.named === named ? null : named;
    redraw(option !== undefined ? `[data-option="${CSS.escape(option)}"]` : `[data-named="${CSS.escape(named ?? "")}"]`);
  });
  root.addEventListener("input", (event) => {
    const el = event.target as HTMLInputElement;
    if (!el.hasAttribute("data-levels")) return;
    state.levels = Number(el.value);
    redraw("[data-levels]");
  });
  root.addEventListener("change", (event) => {
    const el = event.target as HTMLSelectElement;
    if (!el.hasAttribute("data-space")) return;
    state.path = el.value;
    state.option = null;
    state.named = null;
    redraw("[data-space]");
  });
  redraw();
}
