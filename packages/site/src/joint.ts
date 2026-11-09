// The section "Joint benchmark": the headline cell of a result, the misses by router and by packer,
// the ranked pairs, the baselines, the cells and the predictions.
import { latestFull, shownAge, type CellView, type JointData } from "./data.ts";
import type { CountSource, CountSources } from "./kpi.ts";
import { barChart, esc, f3, interval, pct } from "./ui.ts";

const REPO = "https://github.com/mark1russell7/layout-contract";
const TOP = 20;

interface State {
  run: string;
  view: "headline" | "stress";
  pick: { readonly side: "router" | "packer"; readonly id: string } | null;
  all: boolean;
}

const sideOf = (pair: string, side: "router" | "packer"): string => pair.split("+")[side === "packer" ? 0 : 1] ?? "";

function tiles(d: JointData, v: CellView): string {
  const c = v.cell;
  const k3 = c.portfolios.find((p) => p.k === 3);
  const k8 = c.portfolios.find((p) => p.k === 8);
  const tile = (label: string, value: string, hint: string): string =>
    `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div><div class="tile-hint">${hint}</div></div>`;
  return `<div class="hero">
    <div class="hero-main">
      <div class="tile-label">Best single pair${v === d.stress ? " on the stress inputs" : ""}</div>
      <div class="hero-pair"><code>${esc(c.best.pair)}</code></div>
      <div class="hero-sub"><strong>${c.best.misses}</strong> misses of <strong>${v.inputs}</strong> inputs · mean score <strong>${f3(c.best.score)}</strong></div>
    </div>
    <div class="tiles">
      ${tile("Oracle score", f3(c.oracle.score), "The best pair of each input")}
      ${tile("Oracle gain", interval(c.oracle.gain), "Oracle minus the best pair")}
      ${k3 ? tile("Share of 3 pairs", pct(k3.share.mean), `A portfolio of 3 pairs gets this part of the gain`) : ""}
      ${k8 ? tile("Share of 8 pairs", pct(k8.share.mean), `A portfolio of 8 pairs gets this part of the gain`) : ""}
    </div>
  </div>`;
}

function charts(v: CellView, s: State): string {
  const max = Math.max(...v.byRouter.map((b) => b.misses), ...v.byPacker.map((b) => b.misses));
  const bars = (side: "router" | "packer") =>
    (side === "router" ? v.byRouter : v.byPacker).map((b) => ({
      id: `${side}:${b.id}`,
      label: b.id,
      value: b.misses,
      note: `The best pair with ${b.id} is ${b.pair}: ${b.misses} misses, mean score ${f3(b.score)}. Select it to filter the ranking.`,
    }));
  const picked = s.pick ? `${s.pick.side}:${s.pick.id}` : undefined;
  const opts = (title: string) => ({ title, unit: "misses", max, ...(picked ? { picked } : {}) });
  return `<div class="two">
    ${barChart(bars("router"), opts("Misses of the best pair of each router"))}
    ${barChart(bars("packer"), opts("Misses of the best pair of each packer"))}
  </div>
  <p class="hint">A shorter bar is better. Each bar is the fewest misses of the pairs with that router or packer, on ${v.inputs} inputs. Select a bar to filter the ranking.</p>`;
}

function ranking(v: CellView, s: State): string {
  const rows = s.pick ? v.ranking.filter((r) => r.members.some((m) => sideOf(m, s.pick!.side) === s.pick!.id)) : v.ranking;
  const shown = s.all || s.pick ? rows : rows.slice(0, TOP);
  const best = v.cell.best.pair;
  const body = shown
    .map(
      (r) => `<tr${r.group === best ? ' class="best"' : ""}><td class="num">${r.rank}</td><td><code>${esc(r.group)}</code>${
        r.members.length > 1 ? `<div class="hint">Same output: ${r.members.map(esc).join(", ")}</div>` : ""
      }</td><td class="num">${r.misses}</td><td class="num">${f3(r.score)}</td></tr>`,
    )
    .join("");
  const filter = s.pick
    ? `<p class="filter">The pairs with the ${s.pick.side} <code>${esc(s.pick.id)}</code>: ${rows.length} of ${v.ranking.length}. <button type="button" data-clear>Show all pairs</button></p>`
    : `<p class="filter">${shown.length} of ${v.ranking.length} pairs. ${
        rows.length > TOP ? `<button type="button" data-all>${s.all ? `Show the first ${TOP}` : `Show all ${rows.length}`}</button>` : ""
      }</p>`;
  return `<h3>The ranked pairs</h3>
    <p class="hint">The rank uses the misses first, and then the mean score. The pairs with the same output on each input are one group.</p>
    ${filter}
    <div class="scroll scroll-cue" tabindex="0" aria-label="The ranked pairs"><table class="table"><thead><tr><th class="num">Rank</th><th>Pair (packer+router)</th><th class="num">Misses</th><th class="num">Score</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function baselines(v: CellView): string {
  if (v.baselines.length === 0) return "";
  const card = (b: CellView["baselines"][number]) => {
    const k = (n: number) => b.portfolios.find((p) => p.k === n);
    const k3 = k(3);
    const k8 = k(8);
    return `<div class="card">
      <h4><code>${esc(b.pair)}</code></h4>
      <dl class="facts">
        <dt>Misses</dt><dd>${b.misses} of ${v.inputs}</dd>
        <dt>Mean score</dt><dd>${f3(b.score)}</dd>
        <dt>Gain of the best pair</dt><dd>${interval(b.bestGain)}</dd>
        <dt>Gain of the oracle</dt><dd>${interval(b.oracleGain)}</dd>
        ${k3 ? `<dt>Gain of 3 pairs</dt><dd>${interval(k3.gain)} · ${k3.misses} misses</dd>` : ""}
        ${k8 ? `<dt>Gain of 8 pairs</dt><dd>${interval(k8.gain)} · ${k8.misses} misses</dd>` : ""}
      </dl>
    </div>`;
  };
  const compare = v.compare
    .map(
      (c) => `<p class="compare"><code>${esc(c.a)}</code> against <code>${esc(c.b)}</code>: ${c.missesA} and ${c.missesB} misses, the gain of A is ${interval(c.gain)}.
      Only A reaches the floor on ${c.onlyA} inputs, and only B on ${c.onlyB}.</p>`,
    )
    .join("");
  return `<h3>The baselines</h3>
    <p class="hint">A baseline is a fixed pair: a packer, and then the router <code>portfolio</code>. Each gain is the score of a pick minus the score of the baseline, on each input.</p>
    <div class="cards">${v.baselines.map(card).join("")}</div>${compare}`;
}

function cells(d: JointData): string {
  const rows = d.cells
    .map((c) => {
      const k3 = c.portfolios.find((p) => p.k === 3);
      const head = c.rule === "all" && c.cap === 1.25;
      return `<tr${head ? ' class="best"' : ""}><td>${esc(c.rule)}</td><td class="num">${c.cap}</td><td><code>${esc(c.best.pair)}</code></td><td class="num">${c.best.misses}</td><td class="num">${f3(c.best.score)}</td><td class="num">${f3(c.oracle.score)}</td><td class="num">${interval(c.oracle.gain)}</td><td class="num">${k3 ? pct(k3.share.mean) : "-"}</td></tr>`;
    })
    .join("");
  return `<details class="more"><summary>All ${d.cells.length} cells of the headline inputs</summary>
    <div class="scroll scroll-cue" tabindex="0" aria-label="The cells of the headline inputs"><table class="table"><thead><tr><th>Rule</th><th class="num">Cap</th><th>Best pair</th><th class="num">Misses</th><th class="num">Score</th><th class="num">Oracle</th><th class="num">Gain</th><th class="num">3-pair share</th></tr></thead><tbody>${rows}</tbody></table></div>
  </details>`;
}

function predictions(d: JointData): string {
  if (d.predictions.length === 0) return "";
  const held = d.predictions.filter((p) => p.held).length;
  const rows = d.predictions
    .map((p) => `<li class="${p.held ? "held" : "missed"}"><span class="mark-badge">${p.held ? "held" : "missed"}</span> <strong>${esc(p.id)}</strong> ${esc(p.detail)}</li>`)
    .join("");
  return `<details class="more"><summary>The predictions of the run: ${held} of ${d.predictions.length} held</summary>
    <p class="hint">The claims come before the run. <code>docs/JOINT-BENCH.md</code> gives each claim and its confidence.</p>
    <ul class="preds">${rows}</ul></details>`;
}

/** This function shows the joint benchmark results in the element `root`. It shows the latest result first. */
/**
 * This function gives the list of the runs that the coverage counts, with the names of each run. It gives no html without sources.
 * A name counts from the newest run with a result of it, so one count can join runs of two corpora (L140).
 */
export function countSourcesHtml(sources: CountSources | undefined): string {
  if (sources === undefined || sources.packers.length + sources.routers.length === 0) return "";
  const groups = (kind: string, list: readonly CountSource[]): string[] => {
    const byRun = new Map<string, CountSource[]>();
    for (const source of list) byRun.set(source.run, [...(byRun.get(source.run) ?? []), source]);
    return [...byRun.values()]
      .sort((a, b) => b.length - a.length || b[0]!.date.localeCompare(a[0]!.date))
      .map((part) => {
        const first = part[0]!;
        const names = part.map((source) => `<code>${esc(source.name)}</code>`).join(", ");
        return `<li><strong>${part.length} ${kind}</strong> from run ${esc(first.run)}, corpus <code>${esc(first.corpus)}</code>, of ${esc(first.date)}: ${names}</li>`;
      });
  };
  const corpora = new Set([...sources.packers, ...sources.routers].map((source) => source.corpus));
  const note = corpora.size > 1 ? `<p class="hint">The counts join runs of ${corpora.size} corpora. A name counts from the newest run with a result of it.</p>` : "";
  return `<details class="more"><summary>The runs that the coverage counts: ${sources.packers.length} packers and ${sources.routers.length} routers</summary>${note}<ul class="hint">${[...groups("packers", sources.packers), ...groups("routers", sources.routers)].join("")}</ul><p class="hint">The file <a href="kpi-sources.json"><code>kpi-sources.json</code></a> has the same list.</p></details>`;
}

/**
 * This function gives the note of a carry (L147). The note has the date of the measure run and the date of the run that keeps the records.
 * A code bridge (rule B) also gives its code audit and the 95 % upper bound of the rate of a difference.
 */
export function carryNote(d: JointData): string {
  const c = d.carry;
  if (c === undefined) return "";
  const kept = `This run kept ${c.kept.toLocaleString("en")} records of <a href="${REPO}/actions/runs/${esc(c.run)}">run ${esc(c.run)}</a> of ${esc(c.date)}. The run of ${esc(d.date)} measured the other records again.`;
  if (c.code === undefined) return `<p class="note">${kept} The measure code and the fingerprint of each kept strategy did not change.</p>`;
  const commit = (sha: string): string => `<a href="${REPO}/commit/${esc(sha)}"><code>${esc(sha.slice(0, 7))}</code></a>`;
  const upper = `${(100 * c.code.upper).toFixed(1)} %`;
  return `<p class="note">${kept} The measure code changed from ${commit(c.code.from)} to ${commit(c.code.to)}. A code audit of ${c.code.audit.toLocaleString("en")} pairs gave no difference, so the 95 % upper bound of the rate of a difference is ${upper}. This carry is a bridge only: the next full run measures each kept record again.</p>`;
}

export function renderJoint(root: HTMLElement, files: readonly JointData[], sources?: CountSources): void {
  const latest = latestFull(files);
  const age = shownAge(files);
  if (latest === undefined) {
    root.innerHTML = `<p class="empty">No joint benchmark result is in <code>data/joint/</code> yet.</p>`;
    return;
  }
  const state: State = { run: latest.run, view: "headline", pick: null, all: false };
  const draw = (): void => {
    const d = files.find((f) => f.run === state.run) ?? latest;
    const v = state.view === "stress" ? d.stress : d.headline;
    const versions = Object.entries(d.versions)
      .map(([k, ver]) => `<a href="https://www.npmjs.com/package/@mark1russell7/${esc(k)}/v/${esc(ver)}">${esc(k)} ${esc(ver)}</a>`)
      .join(" · ");
    const runs =
      files.length > 1
        ? `<label class="runs">Result <select data-run>${[...files]
            .sort((a, b) => b.date.localeCompare(a.date) || b.run.localeCompare(a.run))
            .map((f) => `<option value="${esc(f.run)}"${f.run === d.run ? " selected" : ""}>${esc(f.date)} · ${esc(f.item)}${f.cover === true ? " · cover" : ""}${f.short === true ? " · short" : ""}${f.carry === undefined ? "" : f.carry.code === undefined ? " · carry" : " · code bridge"} · run ${esc(f.run)}</option>`)
            .join("")}</select></label>`
        : "";
    root.innerHTML = `
      <p class="dataline"><span class="badge">${esc(d.item)}</span>${d.cover === true ? ` <span class="badge warn">cover run</span>` : ""}${d.short === true ? ` <span class="badge warn">short run</span>` : ""}${d.carry === undefined ? "" : ` <span class="badge warn">${d.carry.code === undefined ? "carry" : "code bridge"}</span>`} Data of <a href="${REPO}/actions/runs/${esc(d.run)}">run ${esc(d.run)}</a>, ${esc(d.date)}${d.carry === undefined ? "" : ` (measured ${esc(d.carry.date)}, <a href="${REPO}/actions/runs/${esc(d.carry.run)}">run ${esc(d.carry.run)}</a>)`} · ${versions} · corpus <code>${esc(d.corpus)}</code> · ${d.records.toLocaleString("en")} records, ${d.pairs} pairs</p>
      ${d.cover === true ? `<p class="note">This cover run has each strategy and each open router, so it has more pairs. Its floors do not compare with the floors of a default run.</p>` : ""}
      ${d.short === true ? `<p class="note">This short run has only ${d.pairs} chosen pairs, on the corpus <code>${esc(d.corpus)}</code>. Its rows do not compare with the rows of a full run. The page opens on the newest full run.</p>` : ""}
      ${carryNote(d)}
      ${age === undefined ? "" : `<p class="hint">Age of the data: the oldest of the ${age.pairs} shown pairs is of ${esc(age.oldest)}, and the median pair is of ${esc(age.median)}. A short run refreshes only its own pairs.</p>`}
      ${runs}
      <div class="seg" role="radiogroup" aria-label="Inputs">
        <button type="button" role="radio" data-view="headline" aria-checked="${state.view === "headline"}">Headline inputs (${d.headline.inputs})</button>
        <button type="button" role="radio" data-view="stress" aria-checked="${state.view === "stress"}">Stress inputs (${d.stress.inputs})</button>
      </div>
      ${tiles(d, v)}
      ${charts(v, state)}
      ${ranking(v, state)}
      ${baselines(v)}
      ${cells(d)}
      ${predictions(d)}
      ${countSourcesHtml(sources)}`;
  };
  root.addEventListener("click", (event) => {
    const el = (event.target as Element).closest<HTMLElement>("[data-view],[data-pick],[data-clear],[data-all]");
    if (el === null) return;
    if (el.dataset["view"] !== undefined) {
      state.view = el.dataset["view"] === "stress" ? "stress" : "headline";
      state.pick = null;
    } else if (el.dataset["pick"] !== undefined) {
      const [side, id] = el.dataset["pick"].split(":") as ["router" | "packer", string];
      state.pick = state.pick?.side === side && state.pick.id === id ? null : { side, id };
    } else if (el.hasAttribute("data-clear")) state.pick = null;
    else state.all = !state.all;
    const key = ["view", "pick"].find((k) => el.dataset[k] !== undefined);
    const value = key === undefined ? undefined : el.dataset[key];
    draw();
    if (key !== undefined && value !== undefined) root.querySelector<HTMLElement>(`[data-${key}="${CSS.escape(value)}"]`)?.focus();
  });
  root.addEventListener("change", (event) => {
    const el = event.target as HTMLSelectElement;
    if (!el.hasAttribute("data-run")) return;
    state.run = el.value;
    state.pick = null;
    draw();
  });
  draw();
}
