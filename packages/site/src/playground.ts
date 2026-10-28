// The page "Playground": one packer and one router with each of their options, on one input. The forms come from the strategy spaces.
import { checkConfig, configId, joinConfigs, splitConfig, type LayoutRecord, type StrategyConfig } from "@mark1russell7/layout-contract";
import { marked } from "marked";
import aboutText from "../content/playground.md?raw";
import { LANE_STAGE, laneFormSpace, LANE_NONE, LANE_TEXT, PACK_STAGE, pairOfConfigs, ROUTE_STAGE } from "./catalog.ts";
import { initBuild, initTheme } from "./chrome.ts";
import { pairSvg } from "./draw.ts";
import { configOfState, formHtml, parseValue, stateOfConfig, type FormState } from "./form.ts";
import { boxesOf, parsePicked, pickedText, pickerHtml, PRESETS, readPicker, refOf, shortId, type Picked } from "./inputs.ts";
import { catalog } from "./joint-catalog.ts";
import type { PairView, RunJob, WorkerMessage } from "./protocol.ts";
import "./style.css";
import { byId, esc, f3 } from "./ui.ts";

initTheme();
initBuild();
byId("about").innerHTML = marked.parse(aboutText, { async: false });

const PACK = "pack.";
const ROUTE = "route.";
const LANE = "lane.";
const LANE_ENGINE = catalog.lanes.engine;
const laneForm = laneFormSpace(catalog.lanes);
const laneFacts = { controls: [], about: LANE_TEXT };
const packFacts = { controls: catalog.controls.filter((c) => c.engine === "packing"), about: catalog.about.packing };
const routeFacts = { controls: catalog.controls.filter((c) => c.engine === "highways"), about: catalog.about.highways };
const named = Object.keys(catalog.joint.named ?? {});
const namedById = new Map(named.map((n) => [configId(catalog.joint, catalog.joint.named![n]!), n]));
const DEFAULT_PAIR = named.includes("select+portfolio") ? "select+portfolio" : named[0]!;

let picked: Picked = { kind: "preset", id: PRESETS[0]!.id };
let mode: Picked["kind"] = "preset";
let packState: FormState;
let routeState: FormState;
let laneState: FormState;

/** This function gives the form state of the joint option of a joint config. A config without the stage `lanes.mode` has no lane pass. */
function laneStateOf(joint: StrategyConfig): FormState {
  const c = joint.stages[`${LANE_ENGINE}.${LANE_STAGE}`];
  return c === undefined || c === null ? { option: LANE_NONE, params: {} } : stateOfConfig(splitConfig(joint, LANE_ENGINE), LANE_STAGE);
}

/** This function sets the two forms from a named pair of the joint space. */
function fromNamed(name: string): void {
  const joint = catalog.joint.named![name]!;
  packState = stateOfConfig(splitConfig(joint, "packing"), PACK_STAGE);
  routeState = stateOfConfig(splitConfig(joint, "highways"), ROUTE_STAGE);
  laneState = laneStateOf(joint);
}

/** This function reads the state of the page from the hash of the address. The hash holds the input, and a named pair or a joint config. */
function readHash(): void {
  const h = new URLSearchParams(location.hash.slice(1));
  const p = parsePicked(catalog, h.get("input") ?? "");
  if (p !== undefined) {
    picked = p;
    mode = p.kind;
  }
  const pair = h.get("pair");
  const config = h.get("config");
  fromNamed(pair !== null && named.includes(pair) ? pair : DEFAULT_PAIR);
  if (config === null) return;
  try {
    const joint = JSON.parse(config) as StrategyConfig;
    if (checkConfig(catalog.joint, joint).length > 0) return;
    packState = stateOfConfig(splitConfig(joint, "packing"), PACK_STAGE);
    routeState = stateOfConfig(splitConfig(joint, "highways"), ROUTE_STAGE);
    laneState = laneStateOf(joint);
  } catch {
    // A bad config in the address gives the default pair.
  }
}

byId("playground").innerHTML = `
  <div class="panel">
    <h2 class="panel-title">1. The input</h2>
    <div id="pg-input"></div>
    <p class="hint" id="pg-size"></p>
  </div>
  <div class="panel">
    <h2 class="panel-title">2. Start from a pair of the benchmark</h2>
    <label class="field wide"><span class="field-name">Pair</span><select id="pg-named">${named.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select></label>
    <p class="hint">The ${named.length} pairs: ${catalog.benchPacks.length + catalog.extraPacks.length} pack entries × ${catalog.routers.length} routers, and ${catalog.jointPairs.length} joint pairs with lanes. Then change any option below.</p>
  </div>
  <div class="two">
    <div class="panel"><h2 class="panel-title">3. The packer <span class="count-note">packing ${esc(catalog.versions["packing"] ?? "")}</span></h2><div id="pg-pack" class="stage-form"></div></div>
    <div class="panel"><h2 class="panel-title">4. The router <span class="count-note">highways ${esc(catalog.versions["highways"] ?? "")}</span></h2><div id="pg-route" class="stage-form"></div></div>
  </div>
  <div class="panel"><h2 class="panel-title">5. The joint option <span class="count-note">lanes ${esc(catalog.lanes.version)}</span></h2>
    <p class="hint">A joint option packs again after the first route, with more space for the lanes of the routes. The strategy <code>${LANE_NONE}</code> packs and routes once.</p>
    <div id="pg-lane" class="stage-form"></div></div>
  <div class="panel ids" id="pg-ids"></div>
  <div class="go">
    <button type="button" class="primary" id="pg-start">Pack and route</button>
    <button type="button" class="secondary" id="pg-stop" disabled>Stop</button>
    <span id="pg-status" class="hint" role="status" aria-live="polite"></span>
  </div>
  <div id="pg-result"></div>`;

readHash();

/** This function draws the input picker and the size note. */
function renderInput(): void {
  byId("pg-input").innerHTML = pickerHtml(catalog, picked, Number.POSITIVE_INFINITY);
  renderSize();
}

function renderSize(): void {
  const n = boxesOf(catalog, picked);
  byId("pg-size").innerHTML =
    n > catalog.compareMaxBoxes
      ? `<span class="badge warn">Large</span> ${n} boxes. One pair can take some seconds, and <code>portfolio</code> takes the longest. <code>compare</code> takes up to ${catalog.compareMaxBoxes} boxes.`
      : `${n} boxes. <a href="compare.html#${esc(new URLSearchParams({ input: pickedText(picked) }).toString())}">Compare each pair on this input</a>.`;
}

/** This function draws the two forms from their states. */
function renderForms(): void {
  byId("pg-pack").innerHTML = formHtml(catalog.pack, PACK_STAGE, packState, packFacts, PACK);
  byId("pg-route").innerHTML = formHtml(catalog.route, ROUTE_STAGE, routeState, routeFacts, ROUTE);
  byId("pg-lane").innerHTML = formHtml(laneForm, LANE_STAGE, laneState, laneFacts, LANE);
}

/** This function reads the state of one form from the page. The member form of a meta option has the prefix `<prefix>m.`. */
function readForm(root: HTMLElement, prefix: string): FormState | undefined {
  const select = [...root.querySelectorAll<HTMLSelectElement>("select[data-option]")].find((s) => s.dataset["option"] === prefix);
  if (select === undefined) return undefined;
  const fields = [...root.querySelectorAll<HTMLElement>("[data-form]")].find((f) => f.dataset["form"] === prefix);
  const params: Record<string, string | number | boolean> = {};
  for (const el of fields?.querySelectorAll<HTMLInputElement>("[data-p]") ?? []) params[el.dataset["p"]!] = parseValue(el.dataset["kind"] ?? "", el.value, el.checked);
  const member = readForm(root, `${prefix}m.`);
  return { option: select.value, params, ...(member === undefined ? {} : { member }) };
}

/** The configs of the forms, their problems and the entries for the worker. */
function current(): { readonly problems: string[]; readonly pack?: StrategyConfig; readonly route?: StrategyConfig; readonly lane?: StrategyConfig } {
  const pack = configOfState(catalog.pack, PACK_STAGE, packState);
  const route = configOfState(catalog.route, ROUTE_STAGE, routeState);
  const lane = laneState.option === LANE_NONE ? undefined : configOfState(catalog.lanes, LANE_STAGE, laneState);
  const problems = [...checkConfig(catalog.pack, pack), ...checkConfig(catalog.route, route), ...(lane === undefined ? [] : checkConfig(catalog.lanes, lane))].map((b) => b.detail);
  return problems.length > 0 ? { problems } : { problems, pack, route, ...(lane === undefined ? {} : { lane }) };
}

/** This function gives the joint config of the forms. A config without a joint option has no stage `lanes.mode`, as the pairs of the product. */
function jointOf(c: { readonly pack: StrategyConfig; readonly route: StrategyConfig; readonly lane?: StrategyConfig }): StrategyConfig {
  return joinConfigs(catalog.joint.engine, [c.pack, c.route, ...(c.lane === undefined ? [] : [c.lane])]);
}

/** This function shows the config ids of the chosen config, and writes it in the hash of the address. */
function renderIds(): void {
  const c = current();
  const box = byId("pg-ids");
  byId<HTMLButtonElement>("pg-start").disabled = c.pack === undefined;
  if (c.pack === undefined || c.route === undefined) {
    box.innerHTML = `<p class="problems">The config is not good: ${c.problems.map((p) => esc(p)).join("; ")}.</p>`;
    return;
  }
  const joint = jointOf({ pack: c.pack, route: c.route, ...(c.lane === undefined ? {} : { lane: c.lane }) });
  const id = configId(catalog.joint, joint);
  const name = namedById.get(id);
  const pair = pairOfConfigs(catalog, c.pack, c.route);
  box.innerHTML = `<dl class="facts">
      <dt>config id</dt><dd><code class="config-id">${esc(id)}</code> ${name === undefined ? `<span class="badge">custom</span>` : `<span class="badge good">the pair ${esc(name)} of the benchmark</span>`}</dd>
      <dt>packer</dt><dd><code>${esc(pair.pack.id)}</code> · id <code>${esc(pair.packId)}</code></dd>
      <dt>router</dt><dd><code>${esc(pair.router.id)}</code> · id <code>${esc(pair.routeId)}</code></dd>
      <dt>joint option</dt><dd>${c.lane === undefined ? `<code>${LANE_NONE}</code>: one pack and one route` : `<code>${esc(laneState.option)}</code> · id <code>${esc(configId(catalog.lanes, c.lane))}</code>`}</dd>
    </dl>
    <details class="more"><summary>The config as JSON (<code>strategy-space/1</code>)</summary><pre class="code">${esc(JSON.stringify(joint, null, 2))}</pre>
    <button type="button" id="pg-copy">Copy the config</button></details>`;
  const h = new URLSearchParams({ input: pickedText(picked) });
  if (name !== undefined) h.set("pair", name);
  else h.set("config", JSON.stringify(joint));
  history.replaceState(null, "", `#${h.toString()}`);
  const sel = byId<HTMLSelectElement>("pg-named");
  if (name !== undefined) sel.value = name;
}

let worker: Worker | undefined;
let job = 0;

function workerOf(): Worker {
  worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => onMessage(e.data);
  return worker;
}

/** This function draws the result of one pair: the drawing, the joint measures, the hard breaks and the record. */
function renderResult(view: PairView, record: LayoutRecord): void {
  const m = record.measures;
  const pass = view.breaks["route.no-pass-through"] ?? 0;
  const rows = (o: Readonly<Record<string, number>>, keys: string[]): string =>
    keys.map((k) => `<tr><td><code>${esc(k)}</code></td><td class="num">${Number.isInteger(o[k]) ? o[k] : f3(o[k]!)}</td></tr>`).join("");
  const joint = Object.keys(m).filter((k) => k.startsWith("joint."));
  const others = Object.keys(m).filter((k) => !k.startsWith("joint.") && !k.startsWith("time."));
  const fact = (label: string, value: string, bad = false): string => `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value${bad ? " bad" : ""}">${value}</div></div>`;
  byId("pg-result").innerHTML =
    view.skipped !== undefined
      ? `<p class="note">The pair <code>${esc(view.pair)}</code> skipped this input: ${esc(view.skipped)}</p>`
      : `<div class="result">
      <figure class="result-figure">${pairSvg(view, `The layout of ${view.pair}`)}<figcaption><code>${esc(view.pair)}</code> on ${esc(byId("pg-status").dataset["input"] ?? "")}</figcaption></figure>
      <div class="tiles">
        ${fact("<code>joint.fill</code>", m["joint.fill"] === undefined ? "–" : f3(m["joint.fill"]))}
        ${fact("hard breaks", String(Object.values(view.breaks).reduce((s, v) => s + v, 0)), Object.keys(view.breaks).length > 0)}
        ${fact("pass-through", String(pass), pass > 0)}
        ${fact("overflow", `${m["pack.overflow"] ?? 0} boxes, ${m["joint.overflow.edges"] ?? 0} edges`)}
        ${fact("time", `${Math.round(view.ms)} ms`)}
      </div>
      <p class="hint">The floor and the score compare a pair with the other pairs of the input. <a href="compare.html#${esc(new URLSearchParams({ input: pickedText(picked) }).toString())}">Compare each pair</a> to see them.</p>
      ${Object.keys(view.breaks).length === 0 ? `<p class="dataline"><span class="badge good">No hard breaks</span></p>` : `<h3>The hard breaks</h3><table class="table"><tbody>${rows(view.breaks, Object.keys(view.breaks))}</tbody></table>`}
      <details class="more"><summary>Each measure (${joint.length + others.length})</summary><div class="scroll"><table class="table"><tbody>${rows(m, [...joint, ...others])}</tbody></table></div></details>
      <details class="more"><summary>The record (<code>layout-record/1</code>)</summary><pre class="code">${esc(JSON.stringify(record, null, 2))}</pre></details>
    </div>`;
}

function onMessage(m: WorkerMessage): void {
  if (m.job !== job) return;
  const status = byId("pg-status");
  if (m.type === "input") {
    status.dataset["input"] = `${shortId(m.input.id)} (${m.input.boxes} boxes, ${m.input.edges} edges)`;
    status.textContent = `Packing and routing ${m.input.boxes} boxes…`;
  } else if (m.type === "pair") renderResult(m.view, m.record);
  else if (m.type === "error") {
    finish();
    status.textContent = "";
    byId("pg-result").innerHTML = `<p class="problems">The run stopped: ${esc(m.message)}</p>`;
  } else {
    finish();
    status.textContent = `Done in ${(m.ms / 1000).toFixed(2)} s.`;
  }
}

function finish(): void {
  byId<HTMLButtonElement>("pg-start").disabled = false;
  byId<HTMLButtonElement>("pg-stop").disabled = true;
}

/** This function packs and routes the input with the chosen pair. */
function start(): void {
  const c = current();
  const input = refOf(catalog, picked);
  if (c.pack === undefined || c.route === undefined || input === undefined) return;
  const pair = pairOfConfigs(catalog, c.pack, c.route);
  job++;
  byId<HTMLButtonElement>("pg-start").disabled = true;
  byId<HTMLButtonElement>("pg-stop").disabled = false;
  byId("pg-status").textContent = "Making the input…";
  const lane = c.lane?.stages[LANE_STAGE];
  const message: RunJob = { type: "run", job, input, packs: [pair.pack], routers: [pair.router], ...(lane === undefined || lane === null ? {} : { lane }) };
  workerOf().postMessage(message);
}

function stop(): void {
  worker?.terminate();
  worker = undefined;
  job++;
  finish();
  byId("pg-status").textContent = "Stopped.";
}

const page = byId("playground");

/** This function copies the number of a slider to its number box, or the reverse. A log slider holds the log of the value. */
function syncNumber(el: HTMLInputElement): void {
  const row = el.closest(".num-pair");
  if (row === null) return;
  const slider = row.querySelector<HTMLInputElement>("input[type=range]")!;
  const box = row.querySelector<HTMLInputElement>("input[type=number]")!;
  const log = slider.dataset["log"] === "1";
  if (el === slider) {
    const v = log ? Math.exp(Number(slider.value)) : Number(slider.value);
    const step = box.step === "any" ? 0 : Number(box.step);
    box.value = String(step > 0 ? Math.round((v - Number(box.min)) / step) * step + Number(box.min) : Number(v.toPrecision(3)));
    box.value = String(Number(Number(box.value).toFixed(6)));
  } else slider.value = String(log ? Math.log(Number(box.value)) : Number(box.value));
}

/** This function reads the two forms again. With `redraw`, it draws them again, so a changed option or condition shows its params. */
function update(redraw: boolean): void {
  packState = readForm(byId("pg-pack"), PACK) ?? packState;
  routeState = readForm(byId("pg-route"), ROUTE) ?? routeState;
  laneState = readForm(byId("pg-lane"), LANE) ?? laneState;
  if (redraw) renderForms();
  renderIds();
}

page.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.type === "range" || t.type === "number") {
    syncNumber(t);
    update(false);
  }
});

page.addEventListener("change", (e) => {
  const t = e.target as HTMLElement;
  if (t.id === "pg-named") {
    fromNamed((t as HTMLSelectElement).value);
    renderForms();
    renderIds();
    return;
  }
  if (t.closest("#pg-input") !== null) {
    picked = readPicker(byId("pg-input"), mode, picked.kind === "preset" ? picked.id : PRESETS[0]!.id);
    renderSize();
    renderIds();
    return;
  }
  if (t.closest(".stage-form") !== null) update(t.tagName === "SELECT" || (t as HTMLInputElement).type === "checkbox");
});

page.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (t === null) return;
  const d = t.dataset;
  if (t.id === "pg-start") return start();
  if (t.id === "pg-stop") return stop();
  if (t.id === "pg-copy") {
    const c = current();
    if (c.pack !== undefined && c.route !== undefined) void navigator.clipboard?.writeText(JSON.stringify(jointOf({ pack: c.pack, route: c.route, ...(c.lane === undefined ? {} : { lane: c.lane }) }), null, 2));
    t.textContent = "Copied";
    return;
  }
  if (d["inputMode"] !== undefined) {
    mode = d["inputMode"] as Picked["kind"];
    if (mode === "preset" && picked.kind !== "preset") picked = { kind: "preset", id: PRESETS[0]!.id };
    if (mode === "corpus" && picked.kind !== "corpus") picked = { kind: "corpus", id: catalog.inputs.find((r) => r.boxes >= 10)?.id ?? "" };
    if (mode === "build" && picked.kind !== "build") picked = readPicker(byId("pg-input"), "build", "");
    renderInput();
    renderIds();
  } else if (d["preset"] !== undefined) {
    picked = { kind: "preset", id: d["preset"] };
    renderInput();
    renderIds();
  }
});

renderInput();
renderForms();
renderIds();
start();
