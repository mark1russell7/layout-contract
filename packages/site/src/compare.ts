// The page "Compare all pairs": one input, each chosen packer with each chosen router, side by side and in the order of the benchmark.
import { marked } from "marked";
import aboutText from "../content/compare.md?raw";
import type { PackChoice, RouterChoice } from "./catalog.ts";
import { initBuild, initTheme } from "./chrome.ts";
import { pairSvg } from "./draw.ts";
import { boxesOf, parsePicked, pickedText, pickerHtml, PRESETS, readPicker, refOf, shortId, type Picked } from "./inputs.ts";
import { catalog } from "./joint-catalog.ts";
import type { PairView, RankView, RunJob, WorkerMessage } from "./protocol.ts";
import "./style.css";
import { byId, esc, f3 } from "./ui.ts";

initTheme();
initBuild();
byId("about").innerHTML = marked.parse(aboutText, { async: false });

const root = byId("compare");
const packs: readonly (PackChoice & { readonly bench: boolean })[] = [...catalog.benchPacks.map((p) => ({ ...p, bench: true })), ...catalog.extraPacks.map((p) => ({ ...p, bench: false }))];
const routers: readonly RouterChoice[] = catalog.routers.map((r) => ({ id: r, router: r, options: {} }));
const onPacks = new Set(packs.map((p) => p.id));
const onRouters = new Set(routers.map((r) => r.id));
let picked: Picked = { kind: "preset", id: PRESETS[0]!.id };
let mode: Picked["kind"] = "preset";

/** This function reads the state of the page from the hash of the address: the input, the packers and the routers. */
function readHash(): void {
  const h = new URLSearchParams(location.hash.slice(1));
  const p = parsePicked(catalog, h.get("input") ?? "");
  if (p !== undefined && boxesOf(catalog, p) <= catalog.compareMaxBoxes) {
    picked = p;
    mode = p.kind;
  }
  const list = (key: string, all: Set<string>, ids: readonly string[]): void => {
    const v = h.get(key);
    if (v === null) return;
    all.clear();
    for (const id of v.split(",")) if (ids.includes(id)) all.add(id);
  };
  list("packs", onPacks, packs.map((p) => p.id));
  list("routers", onRouters, routers.map((r) => r.id));
}

/** This function writes the state of the page in the hash of the address, so a link opens the same compare. */
function writeHash(): void {
  const h = new URLSearchParams({ input: pickedText(picked) });
  if (onPacks.size !== packs.length) h.set("packs", [...onPacks].join(","));
  if (onRouters.size !== routers.length) h.set("routers", [...onRouters].join(","));
  history.replaceState(null, "", `#${h.toString()}`);
}

/** This function gives the chips of the packers: one group for each strategy of `packing`, with the entries of the benchmark marked. */
function packChips(): string {
  const strategies = Object.keys(catalog.about.packing);
  return strategies
    .map((s) => {
      const entries = packs.filter((p) => p.strategy === s);
      const chips = entries
        .map((p) => `<button type="button" class="chip${onPacks.has(p.id) ? " on" : ""}" data-pack="${esc(p.id)}" aria-pressed="${onPacks.has(p.id)}">${esc(p.id)}${p.bench ? "" : ` <span class="tag">not in the bench</span>`}</button>`)
        .join("");
      return `<div class="strategy-row"><span class="strategy-name" title="${esc(catalog.about.packing[s] ?? "")}"><code>${esc(s)}</code></span><div class="chips">${chips}</div></div>`;
    })
    .join("");
}

/** This function gives the chips of the routers. */
function routerChips(): string {
  return routers
    .map((r) => `<button type="button" class="chip${onRouters.has(r.id) ? " on" : ""}" data-router="${esc(r.id)}" aria-pressed="${onRouters.has(r.id)}" title="${esc(catalog.about.highways[r.router] ?? "")}">${esc(r.id)}</button>`)
    .join("");
}

/** This function gives an estimate of the time of a compare, from the times in Node of `docs/SITE.md`. A pair takes 6 ms on 10 boxes, and 48 ms on 100 boxes. */
function estimate(pairs: number, boxes: number): string {
  const ms = pairs * (5 + 0.0045 * boxes * boxes);
  return ms < 1500 ? "approximately 1 second" : `approximately ${Math.round(ms / 1000)} seconds`;
}

/** This function draws the setup panel: the input, the packers, the routers and the start button. */
function renderSetup(): void {
  const pairs = onPacks.size * onRouters.size;
  const boxes = boxesOf(catalog, picked);
  byId("setup-input").innerHTML = pickerHtml(catalog, picked, catalog.compareMaxBoxes);
  byId("setup-packs").innerHTML = packChips();
  byId("setup-routers").innerHTML = routerChips();
  byId("setup-count").innerHTML = `<strong>${onPacks.size}</strong> packers × <strong>${onRouters.size}</strong> routers = <strong>${pairs}</strong> pairs on ${boxes} boxes, ${estimate(pairs, boxes)}.`;
  byId<HTMLButtonElement>("start").disabled = pairs === 0;
}

root.innerHTML = `
  <div class="panel setup">
    <h2 class="panel-title">1. The input</h2>
    <div id="setup-input"></div>
    <p class="hint">The full compare takes inputs of up to ${catalog.compareMaxBoxes} boxes. An input of 1000 boxes takes minutes for all the pairs, so <a href="playground.html">the playground</a> runs it one pair at a time.</p>
    <h2 class="panel-title">2. The packers <span class="count-note">(${packs.length}: ${catalog.benchPacks.length} of the bench, ${catalog.extraPacks.length} more)</span></h2>
    <div class="filter"><button type="button" data-all="packs">All</button><button type="button" data-bench="packs">Bench only</button><button type="button" data-none="packs">None</button></div>
    <div id="setup-packs" class="strategy-rows"></div>
    <h2 class="panel-title">3. The routers <span class="count-note">(${routers.length})</span></h2>
    <div class="filter"><button type="button" data-all="routers">All</button><button type="button" data-none="routers">None</button></div>
    <div id="setup-routers" class="chips"></div>
    <div class="go">
      <button type="button" class="primary" id="start">Start the compare</button>
      <button type="button" class="secondary" id="stop" disabled>Stop</button>
      <span id="setup-count" class="hint"></span>
    </div>
  </div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
  <div id="summary" class="tiles"></div>
  <div class="filter view-filter" id="show" hidden>Show:
    <button type="button" data-show="all" aria-pressed="true">All</button>
    <button type="button" data-show="floor" aria-pressed="false">Reach the floor</button>
    <button type="button" data-show="miss" aria-pressed="false">Miss the floor</button>
    <button type="button" data-show="skip" aria-pressed="false">Skipped</button>
  </div>
  <ol id="cards" class="pair-cards"></ol>`;

readHash();
renderSetup();

let worker: Worker | undefined;
let job = 0;
let views = new Map<string, PairView>();
let ranks: readonly RankView[] = [];
let cards = new Map<string, HTMLLIElement>();
let started = 0;
let frame = 0;

/** This function gives the worker, and makes a new one after a stop. */
function workerOf(): Worker {
  worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => onMessage(e.data);
  return worker;
}

/** This function gives the verdict of a pair: it reaches the floor, it misses it, or it skipped. */
function verdictOf(rank: RankView | undefined, view: PairView): "floor" | "miss" | "skip" {
  if (view.skipped !== undefined || rank === undefined || rank.rank === undefined) return "skip";
  return rank.misses === 0 ? "floor" : "miss";
}

const VERDICT_TEXT = { floor: "reaches the floor", miss: "misses the floor", skip: "skipped" } as const;
const VERDICT_BADGE = { floor: "good", miss: "bad", skip: "warn" } as const;

/** This function gives the HTML of the card of one pair, without its rank. Each value goes through `esc` or is a number. */
function cardHtml(view: PairView): string {
  const m = view.measures;
  const pass = view.breaks["route.no-pass-through"] ?? 0;
  const others = Object.entries(view.breaks).filter(([k]) => k !== "route.no-pass-through");
  const href = `playground.html#${new URLSearchParams({ input: pickedText(picked), pair: view.pair }).toString()}`;
  const head = `<div class="pc-head"><span class="pc-rank">–</span><span class="pc-name"><code>${esc(view.pack)}</code> + <code>${esc(view.router)}</code></span><span class="badge pc-verdict"></span></div>`;
  if (view.skipped !== undefined) return `${head}<p class="pc-skip">${esc(view.skipped)}</p>`;
  return `${head}${pairSvg(view, `The layout of ${view.pair}`)}
    <dl class="facts pc-facts">
      <dt>score</dt><dd class="pc-score">–</dd>
      <dt>hard count</dt><dd class="pc-hard">–</dd>
      <dt><code>joint.fill</code></dt><dd>${m["joint.fill"] === undefined ? "–" : f3(m["joint.fill"])}</dd>
      <dt>pass-through</dt><dd class="${pass > 0 ? "bad" : ""}">${pass}</dd>
      <dt>overflow</dt><dd>${m["pack.overflow"] ?? 0} boxes, ${m["joint.overflow.edges"] ?? 0} edges</dd>
      <dt>time</dt><dd>${Math.round(view.ms)} ms</dd>
    </dl>
    ${others.length === 0 ? "" : `<p class="pc-breaks">Other hard breaks: ${others.map(([k, v]) => `<code>${esc(k)}</code> ${v}`).join(", ")}</p>`}
    <a class="pc-open" href="${esc(href)}">Open in the playground</a>`;
}

/** This function sets the rank, the verdict, the score and the hard count of a card. It writes text only. */
function updateCard(li: HTMLLIElement, view: PairView, rank: RankView | undefined): void {
  const verdict = verdictOf(rank, view);
  li.dataset["verdict"] = verdict;
  li.className = `pair-card ${verdict}`;
  const set = (sel: string, text: string, cls?: string): void => {
    const el = li.querySelector<HTMLElement>(sel);
    if (el === null) return;
    el.textContent = text;
    if (cls !== undefined) el.className = cls;
  };
  set(".pc-rank", rank?.rank === undefined ? "–" : `#${rank.rank}`);
  set(".pc-verdict", VERDICT_TEXT[verdict], `badge pc-verdict ${VERDICT_BADGE[verdict]}`);
  set(".pc-score", f3(rank?.score ?? 0));
  set(".pc-hard", String(rank?.hard ?? 0), `pc-hard${(rank?.hard ?? 0) > 0 ? " bad" : ""}`);
}

/** This function puts the cards in the order of the ranks, and refreshes the rank, the verdict and the score of each card. */
function reorder(): void {
  frame = 0;
  const list = byId("cards");
  const byPair = new Map(ranks.map((r) => [r.pair, r]));
  const order = [...ranks.map((r) => r.pair).filter((p) => cards.has(p)), ...[...cards.keys()].filter((p) => !byPair.has(p))];
  for (const pair of order) {
    const li = cards.get(pair)!;
    const view = views.get(pair)!;
    const rank = byPair.get(pair);
    if (li.childElementCount === 0) li.innerHTML = cardHtml(view);
    const key = `${rank?.rank}:${rank?.misses}:${rank?.score}:${rank?.hard}`;
    if (li.dataset["key"] !== key) {
      li.dataset["key"] = key;
      updateCard(li, view, rank);
    }
    if (list.lastElementChild !== li) list.appendChild(li);
  }
  applyShow();
  renderSummary();
}

let show = "all";
function applyShow(): void {
  for (const li of cards.values()) li.hidden = show !== "all" && li.dataset["verdict"] !== show;
}

/** This function draws the tiles of the summary: the best pair, the counts of the verdicts and the time. */
function renderSummary(): void {
  const counts = { floor: 0, miss: 0, skip: 0 };
  for (const li of cards.values()) counts[(li.dataset["verdict"] ?? "skip") as keyof typeof counts]++;
  const best = ranks.find((r) => r.rank === 1);
  const tile = (label: string, value: string, hint: string): string => `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div><div class="tile-hint">${hint}</div></div>`;
  byId("summary").innerHTML = [
    tile("Best pair", best === undefined ? "–" : `<code>${esc(best.pair)}</code>`, best === undefined ? "" : `score ${f3(best.score)}`),
    tile("Reach the floor", String(counts.floor), "the lowest hard count"),
    tile("Miss the floor", String(counts.miss), "a higher hard count"),
    tile("Skipped", String(counts.skip), "the packer or the router does not support the input"),
  ].join("");
}

function onMessage(m: WorkerMessage): void {
  if (m.job !== job) return;
  const status = byId("status");
  if (m.type === "input") {
    status.dataset["input"] = `${shortId(m.input.id)}: ${m.input.boxes} boxes, ${m.input.edges} edges`;
    return;
  }
  if (m.type === "error") {
    finish();
    status.innerHTML = `<p class="problems">The compare stopped: ${esc(m.message)}</p>`;
    return;
  }
  if (m.type === "done") {
    finish();
    status.innerHTML = `<p class="dataline"><span class="badge good">Done</span> ${cards.size} pairs in ${(m.ms / 1000).toFixed(1)} s · ${esc(status.dataset["input"] ?? "")}</p>`;
    return;
  }
  views.set(m.view.pair, m.view);
  if (!cards.has(m.view.pair)) {
    const li = document.createElement("li");
    li.className = "pair-card";
    cards.set(m.view.pair, li);
  }
  ranks = m.ranks;
  const s = ((performance.now() - started) / 1000).toFixed(1);
  status.innerHTML = `<div class="progress-line"><progress max="${m.total}" value="${m.done}"></progress><span>${m.done} of ${m.total} pairs · ${s} s · ${esc(status.dataset["input"] ?? "")}</span></div>`;
  if (frame === 0) frame = requestAnimationFrame(reorder);
}

/** This function sets the buttons after the end of a job. */
function finish(): void {
  byId<HTMLButtonElement>("start").disabled = false;
  byId<HTMLButtonElement>("stop").disabled = true;
  if (frame !== 0) cancelAnimationFrame(frame);
  reorder();
}

/** This function starts a compare of the chosen pairs on the chosen input. */
function start(): void {
  picked = readPicker(byId("setup-input"), mode, picked.kind === "preset" ? picked.id : PRESETS[0]!.id);
  const input = refOf(catalog, picked);
  if (input === undefined) return;
  writeHash();
  job++;
  views = new Map();
  ranks = [];
  cards = new Map();
  byId("cards").innerHTML = "";
  byId("show").hidden = false;
  started = performance.now();
  byId<HTMLButtonElement>("start").disabled = true;
  byId<HTMLButtonElement>("stop").disabled = false;
  byId("status").innerHTML = `<p class="dataline">Making the input…</p>`;
  const message: RunJob = { type: "run", job, input, packs: packs.filter((p) => onPacks.has(p.id)).map(({ bench: _b, ...p }) => p), routers: routers.filter((r) => onRouters.has(r.id)) };
  workerOf().postMessage(message);
}

/** This function stops the job: it ends the worker. The next start makes a new worker. */
function stop(): void {
  worker?.terminate();
  worker = undefined;
  job++;
  finish();
  byId("status").innerHTML = `<p class="dataline"><span class="badge warn">Stopped</span> ${cards.size} pairs done.</p>`;
}

root.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (t === null) return;
  const d = t.dataset;
  if (t.id === "start") return start();
  if (t.id === "stop") return stop();
  if (d["inputMode"] !== undefined) {
    picked = readPicker(byId("setup-input"), mode, picked.kind === "preset" ? picked.id : PRESETS[0]!.id);
    mode = d["inputMode"] as Picked["kind"];
    if (mode === "preset" && picked.kind !== "preset") picked = { kind: "preset", id: PRESETS[0]!.id };
    if (mode === "corpus" && picked.kind !== "corpus") picked = { kind: "corpus", id: catalog.inputs.find((r) => r.boxes <= catalog.compareMaxBoxes && r.boxes >= 10)?.id ?? "" };
    if (mode === "build" && picked.kind !== "build") picked = readPicker(byId("setup-input"), "build", "");
  } else if (d["preset"] !== undefined) picked = { kind: "preset", id: d["preset"] };
  else if (d["pack"] !== undefined) onPacks.has(d["pack"]) ? onPacks.delete(d["pack"]) : onPacks.add(d["pack"]);
  else if (d["router"] !== undefined) onRouters.has(d["router"]) ? onRouters.delete(d["router"]) : onRouters.add(d["router"]);
  else if (d["all"] !== undefined) for (const id of d["all"] === "packs" ? packs.map((p) => p.id) : routers.map((r) => r.id)) (d["all"] === "packs" ? onPacks : onRouters).add(id);
  else if (d["none"] !== undefined) (d["none"] === "packs" ? onPacks : onRouters).clear();
  else if (d["bench"] !== undefined) {
    onPacks.clear();
    for (const p of packs) if (p.bench) onPacks.add(p.id);
  } else if (d["show"] !== undefined) {
    show = d["show"];
    for (const b of byId("show").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset["show"] === show));
    applyShow();
    return;
  } else return;
  renderSetup();
});

root.addEventListener("change", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("#setup-input") === null) return;
  picked = readPicker(byId("setup-input"), mode, picked.kind === "preset" ? picked.id : PRESETS[0]!.id);
  renderSetup();
});

// The page starts the compare of the first preset at once, so the first view shows results.
start();
