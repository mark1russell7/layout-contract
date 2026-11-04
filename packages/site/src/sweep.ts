// The section "Sweep coverage": the trend of the coverage surrogate, read from the branch `sweep-data` when the page opens.
// The build does not read the branch, so the page reads it at runtime. A failed read shows a link to the data.
import { checkSweepIndex, dayOf, FLAT_WEEK, mainLine, parseTrend, type SweepIndex, type TrendRecord, type WeekView, weekView } from "./coverage.ts";
import { esc, pct } from "./ui.ts";

const REPO = "https://github.com/mark1russell7/layout-contract";
/** The raw files of the branch `sweep-data`. This host sends `Access-Control-Allow-Origin: *`. */
export const SWEEP_RAW = "https://raw.githubusercontent.com/mark1russell7/layout-contract/sweep-data";
/** The time limit of each read, in milliseconds. */
const READ_LIMIT_MS = 15_000;

/** The state of the section. */
export type SweepState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly index: SweepIndex; readonly line: readonly TrendRecord[]; readonly bad: number; readonly week: WeekView };

/** The part of `fetch` that the section uses. A test gives a fake. */
export type Fetch = (url: string, init?: { readonly signal?: AbortSignal }) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

const segment = (epoch: string): string => encodeURIComponent(epoch);
/** This function gives the address of the trend file of an epoch on GitHub. */
export const trendFileUrl = (epoch: string): string => `${REPO}/blob/sweep-data/epochs/${segment(epoch)}/surrogate-trend.jsonl`;
/** This function gives the address of a CI run. */
export const runUrl = (run: string): string => `${REPO}/actions/runs/${encodeURIComponent(run)}`;

/**
 * This function reads `index.json` and the trend file of the latest epoch. It gives the state `ready` or `failed`.
 * When the epoch has no trend file yet (HTTP 404), the state is `ready` with no records.
 */
export async function loadSweep(get: Fetch): Promise<SweepState> {
  const init = typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(READ_LIMIT_MS) } : {};
  try {
    const res = await get(`${SWEEP_RAW}/index.json`, init);
    if (!res.ok) return { kind: "failed", message: `index.json gave HTTP ${res.status}` };
    let value: unknown;
    try {
      value = JSON.parse(await res.text());
    } catch {
      return { kind: "failed", message: "index.json is not valid JSON" };
    }
    const index = checkSweepIndex(value);
    if (Array.isArray(index)) return { kind: "failed", message: index.join("; ") };
    const trend = await get(`${SWEEP_RAW}/epochs/${segment(index.latest)}/surrogate-trend.jsonl`, init);
    if (trend.status === 404) return { kind: "ready", index, line: [], bad: 0, week: { kind: "none" } };
    if (!trend.ok) return { kind: "failed", message: `surrogate-trend.jsonl gave HTTP ${trend.status}` };
    const file = parseTrend(await trend.text());
    const line = mainLine(file.records.filter((r) => r.epoch === index.latest));
    return { kind: "ready", index, line, bad: file.bad, week: weekView(line) };
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

// The numbers and the dates of the section.
const f3 = (v: number): string => v.toFixed(3);
const signed = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** This function gives a short date, for example `Nov 3`. */
export const shortDate = (date: string): string => `${MONTHS[Number(date.slice(5, 7)) - 1] ?? "?"} ${Number(date.slice(8, 10))}`;
/** This function gives a number for an SVG attribute, with at most 1 decimal. */
const n = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "0");

/** This function gives a step of 1, 2, 2.5 or 5 times a power of 10, near `span / count`. */
function niceStep(span: number, count: number): number {
  const raw = Math.max(span, 1e-9) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
}

/** One line of a chart: its points (a `null` value is a gap), its class and its label at the end. */
interface Series {
  readonly cls: string;
  readonly label: string;
  readonly values: readonly (number | null)[];
  readonly format: (v: number) => string;
}

/** This function moves the labels at the end of the lines apart, so that two labels do not overlap. */
function spread(ys: readonly number[], gap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k]!.y = Math.max(order[k]!.y, order[k - 1]!.y + gap);
  const over = (order.at(-1)?.y ?? 0) - bottom;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = 0; k < order.length; k++) order[k]!.y = Math.max(order[k]!.y, top + k * gap);
  const out = new Array<number>(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/** The input of a line chart. */
interface ChartSpec {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly nights: readonly string[];
  readonly lo: number;
  readonly hi: number;
  readonly yFormat: (v: number) => string;
  readonly series: readonly Series[];
  /** The band of the first series: q10 and q90 for each night. */
  readonly band?: readonly ({ readonly lo: number; readonly hi: number } | null)[];
  /** The value of a stronger grid line, for example 0. */
  readonly base?: number;
  /** The text of the hover note of each night. */
  readonly notes: readonly string[];
}

/**
 * This function gives a line chart as an inline SVG of `width` pixels. The x axis is the night, the y axis is one measure.
 * Each night has a hover target with a note. Each line has its label at its last point.
 */
function lineChart(spec: ChartSpec): string {
  const { width, height, nights } = spec;
  const m = { top: 14, right: 104, bottom: 26, left: 44 };
  const pw = Math.max(40, width - m.left - m.right);
  const ph = height - m.top - m.bottom;
  const days = nights.map(dayOf);
  const d0 = days[0] ?? 0;
  const d1 = days.at(-1) ?? 0;
  const x = (i: number): number => m.left + (d1 === d0 ? pw / 2 : ((days[i]! - d0) / (d1 - d0)) * pw);
  const step = niceStep(spec.hi - spec.lo, 4);
  const lo = Math.floor(spec.lo / step) * step;
  const hi = Math.max(lo + step, Math.ceil(spec.hi / step) * step);
  const y = (v: number): number => m.top + ((hi - v) / (hi - lo)) * ph;
  const parts: string[] = [];
  // The grid and the y axis.
  for (let k = 0; lo + k * step <= hi + step / 1000; k++) {
    const v = lo + k * step;
    const strong = spec.base !== undefined && Math.abs(v - spec.base) < step / 1000;
    parts.push(`<line class="grid${strong ? " base" : ""}" x1="${m.left}" x2="${n(m.left + pw)}" y1="${n(y(v))}" y2="${n(y(v))}" />`);
    parts.push(`<text class="axis" x="${m.left - 6}" y="${n(y(v) + 4)}" text-anchor="end">${esc(spec.yFormat(Math.abs(v) < 1e-9 ? 0 : v))}</text>`);
  }
  // The x axis: at most one date for each 64 pixels, and always the last night.
  const room = Math.max(1, Math.floor(pw / 64));
  const every = Math.max(1, Math.ceil(nights.length / room));
  nights.forEach((night, i) => {
    if ((nights.length - 1 - i) % every !== 0) return;
    parts.push(`<text class="axis" x="${n(x(i))}" y="${height - 8}" text-anchor="middle">${esc(shortDate(night))}</text>`);
  });
  // The band: a polygon over each run of nights with a value, or a bar for a single night.
  if (spec.band) {
    let run: number[] = [];
    const flush = (): void => {
      if (run.length === 1) {
        const i = run[0]!;
        const b = spec.band![i]!;
        parts.push(`<rect class="band" x="${n(x(i) - 9)}" y="${n(y(b.hi))}" width="18" height="${n(Math.max(1, y(b.lo) - y(b.hi)))}" rx="4" />`);
      } else if (run.length > 1) {
        const top = run.map((i) => `${n(x(i))},${n(y(spec.band![i]!.hi))}`);
        const bottom = [...run].reverse().map((i) => `${n(x(i))},${n(y(spec.band![i]!.lo))}`);
        parts.push(`<polygon class="band" points="${[...top, ...bottom].join(" ")}" />`);
      }
      run = [];
    };
    spec.band.forEach((b, i) => (b === null ? flush() : run.push(i)));
    flush();
  }
  // The lines, their points and their labels.
  const ends: { readonly cls: string; readonly text: string; readonly x: number; readonly y: number }[] = [];
  for (const s of spec.series) {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${n(x(i))} ${n(y(v))}`;
      pen = true;
    });
    if (d !== "") parts.push(`<path class="line ${s.cls}" d="${d}" />`);
    s.values.forEach((v, i) => {
      if (v !== null) parts.push(`<circle class="dot ${s.cls}" cx="${n(x(i))}" cy="${n(y(v))}" r="4" />`);
    });
    const last = s.values.reduce<number>((acc, v, i) => (v === null ? acc : i), -1);
    if (last >= 0) ends.push({ cls: s.cls, text: `${s.label} ${s.format(s.values[last]!)}`, x: x(last), y: y(s.values[last]!) });
  }
  const ly = spread(
    ends.map((e) => e.y + 4),
    14,
    m.top + 4,
    m.top + ph + 4,
  );
  ends.forEach((e, i) => parts.push(`<text class="end ${e.cls}" x="${n(e.x + 10)}" y="${n(ly[i]!)}">${esc(e.text)}</text>`));
  // The hover targets: one column for each night, from the middle to the night before to the middle to the night after.
  nights.forEach((_, i) => {
    const left = i === 0 ? m.left : (x(i - 1) + x(i)) / 2;
    const right = i === nights.length - 1 ? m.left + pw : (x(i) + x(i + 1)) / 2;
    parts.push(`<rect class="hit" x="${n(left)}" y="${m.top}" width="${n(Math.max(1, right - left))}" height="${n(ph)}"><title>${esc(spec.notes[i] ?? "")}</title></rect>`);
  });
  return `<svg class="trend-svg" width="${n(width)}" height="${height}" viewBox="0 0 ${n(width)} ${height}" role="img" aria-label="${esc(spec.label)}">${parts.join("")}</svg>`;
}

/** This function gives the chart of the held-out median skill, its q10 to q90 band and the in-sample median. */
export function skillChart(line: readonly TrendRecord[], width: number): string {
  const vals = line.flatMap((r) => [r.skill?.q10, r.skill?.q90, r.inSampleSkill?.median].filter((v): v is number => v !== undefined));
  return lineChart({
    label: "The held-out median skill of each night, with the band from q10 to q90, and the in-sample median skill",
    width,
    height: 240,
    nights: line.map((r) => r.night),
    lo: Math.min(0, ...vals),
    hi: Math.max(0, ...vals),
    yFormat: (v) => v.toFixed(2),
    base: 0,
    band: line.map((r) => (r.skill ? { lo: r.skill.q10, hi: r.skill.q90 } : null)),
    series: [
      { cls: "s2", label: "in-sample", values: line.map((r) => r.inSampleSkill?.median ?? null), format: f3 },
      { cls: "s1", label: "held-out", values: line.map((r) => r.skill?.median ?? null), format: f3 },
    ],
    notes: line.map((r) =>
      r.skill
        ? `${r.night}: held-out median ${f3(r.skill.median)} (q10 ${f3(r.skill.q10)}, q90 ${f3(r.skill.q90)}), in-sample median ${r.inSampleSkill ? f3(r.inSampleSkill.median) : "none"}`
        : `${r.night}: no held-out skill, because no cell has 20 rows or more`,
    ),
  });
}

/** This function gives the chart of the guard lines: the cells with rows, the cells with 20 rows or more and the covered cells. */
export function guardChart(line: readonly TrendRecord[], width: number): string {
  const count = (v: number): string => String(Math.round(v));
  return lineChart({
    label: "The count of the cells with rows, of the cells with 20 rows or more, and of the covered cells, for each night",
    width,
    height: 190,
    nights: line.map((r) => r.night),
    lo: 0,
    hi: Math.max(1, ...line.map((r) => r.withRows)),
    yFormat: count,
    series: [
      { cls: "s0", label: "with rows", values: line.map((r) => r.withRows), format: count },
      { cls: "s2", label: "20+ rows", values: line.map((r) => r.eligible), format: count },
      { cls: "s1", label: "covered", values: line.map((r) => r.covered), format: count },
    ],
    notes: line.map((r) => `${r.night}: ${r.covered} covered of ${r.withRows} cells with rows (${pct(r.share)}), ${r.eligible} cells with 20 rows or more`),
  });
}

const tile = (label: string, value: string, hint: string): string =>
  `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div><div class="tile-hint">${hint}</div></div>`;

function tiles(r: TrendRecord): string {
  const gap = r.skill && r.inSampleSkill ? r.inSampleSkill.median - r.skill.median : null;
  return `<div class="tiles trend-tiles">
    ${tile("Held-out median skill", r.skill ? f3(r.skill.median) : "none", r.skill ? `q10 ${f3(r.skill.q10)} to q90 ${f3(r.skill.q90)}, over ${r.eligible} cells` : "No cell has 20 rows or more")}
    ${tile("Overfit gap", gap === null ? "none" : f3(gap), r.inSampleSkill ? `In-sample median ${f3(r.inSampleSkill.median)} minus held-out` : "No in-sample skill")}
    ${tile("Covered share", pct(r.share), `${r.covered} of ${r.withRows} cells with rows`)}
    ${tile("λ (penalty)", `${esc(r.lambda)}${r.lambdaAtEdge ? ` <span class="badge warn">at the edge</span>` : ""}`, r.lambdaAtEdge ? "The smallest or largest value of the list" : "Inside the list of the fit")}
    ${tile("Rows", r.rows.toLocaleString("en"), "One config on one input, with a score")}
    ${tile("Configs", r.configs.toLocaleString("en"), `With ${r.withRows} cells with rows`)}
  </div>`;
}

/** This function gives the note of the week view. */
export function weekNote(week: WeekView): string {
  switch (week.kind) {
    case "none":
      return `<p class="week-note">This epoch has no trend record yet. The first record comes with the next night.</p>`;
    case "one":
      return `<p class="week-note">One night so far. The trend starts with the next night.</p>`;
    case "young":
      return `<p class="week-note">${week.nights} nights so far, from ${esc(week.first.night)} to ${esc(week.latest.night)}. The week view starts on ${esc(week.startsOn)}.</p>`;
    case "no-skill":
      return `<p class="week-note">No week view: the night ${esc(week.latest.skill === null ? week.latest.night : week.prior.night)} has no held-out skill, because no cell has 20 rows or more.</p>`;
    default: {
      const from = `${f3(week.prior.skill!.median)} on ${esc(week.prior.night)}`;
      const to = `${f3(week.latest.skill!.median)} on ${esc(week.latest.night)}`;
      const change = `The held-out median skill changed by ${signed(week.change)}, from ${from} to ${to}.`;
      if (week.kind === "flat")
        return `<p class="week-note flat"><span class="badge warn">Flat week</span> <strong>Flat week: a finding to explain.</strong> ${change} A change below ${FLAT_WEEK} is flat.</p>`;
      if (week.kind === "rising") return `<p class="week-note rising"><span class="badge good">Rising</span> ${change}</p>`;
      return `<p class="week-note falling"><span class="badge bad">Falling</span> ${change}</p>`;
    }
  }
}

function table(line: readonly TrendRecord[]): string {
  const q = (s: TrendRecord["skill"]): string => (s ? `${f3(s.median)} <span class="ci">[${f3(s.q10)}, ${f3(s.q90)}]</span>` : "none");
  const rows = [...line]
    .reverse()
    .map(
      (r) =>
        `<tr><td>${esc(r.night)}</td><td class="num">${q(r.skill)}</td><td class="num">${r.inSampleSkill ? f3(r.inSampleSkill.median) : "none"}</td><td class="num">${r.covered} / ${r.withRows} (${pct(r.share)})</td><td class="num">${r.eligible}</td><td class="num">${esc(r.lambda)}${r.lambdaAtEdge ? " edge" : ""}</td><td class="num">${r.rows.toLocaleString("en")}</td><td class="num"><a href="${runUrl(r.run)}">${esc(r.run)}</a></td></tr>`,
    )
    .join("");
  return `<details class="more"><summary>The numbers of each night (${line.length})</summary>
    <div class="scroll scroll-cue" tabindex="0" aria-label="The numbers of each night"><table class="table"><thead><tr><th>Night</th><th class="num">Held-out skill [q10, q90]</th><th class="num">In-sample</th><th class="num">Covered</th><th class="num">20+ rows</th><th class="num">λ</th><th class="num">Rows</th><th class="num">CI run</th></tr></thead><tbody>${rows}</tbody></table></div>
  </details>`;
}

/** The width of the charts before the page measures the section, in pixels. */
const START_WIDTH = 640;

/** This function gives the HTML of the section for a state. The charts have the width `width`, in pixels. */
export function sweepHtml(state: SweepState, width: number = START_WIDTH): string {
  if (state.kind === "loading")
    return `<p class="dataline"><span class="badge">Loading</span> The page reads the trend from the branch <code>sweep-data</code>.</p><div class="trend-wait" aria-hidden="true"></div>`;
  if (state.kind === "failed")
    return `<div class="note trend-failed" role="status"><strong>The page did not get the trend.</strong> ${esc(state.message)}. The data is on the branch <a href="${REPO}/tree/sweep-data"><code>sweep-data</code></a>.</div>`;
  const { index, line, bad, week } = state;
  const latest = line.at(-1);
  const bads = bad > 0 ? `<p class="hint">${bad} ${bad === 1 ? "line" : "lines"} of the file did not pass the check. The page skips them.</p>` : "";
  const source = `<a href="${trendFileUrl(index.latest)}"><code>surrogate-trend.jsonl</code></a>`;
  if (latest === undefined)
    return `<p class="dataline"><span class="badge">L52</span> Data of ${source} · epoch <code>${esc(index.latest)}</code></p>${weekNote(week)}${bads}`;
  return `
    <p class="dataline"><span class="badge">L52</span> Data of ${source}, night ${esc(latest.night)} · <a href="${runUrl(latest.run)}">CI run ${esc(latest.run)}</a> · epoch <code>${esc(index.latest)}</code> · ${line.length} trend ${line.length === 1 ? "record" : "records"} in ${index.entry.nights} ${index.entry.nights === 1 ? "night" : "nights"}</p>
    ${weekNote(week)}
    ${tiles(latest)}
    <div class="two trend-charts">
      <figure class="chart"><figcaption>Skill inside the cells, each night</figcaption>
        <div class="legend"><span class="item"><span class="key s1"></span>Held-out median</span><span class="item"><span class="key band"></span>q10 to q90</span><span class="item"><span class="key s2"></span>In-sample median</span></div>
        <div class="trend-plot" data-chart="skill">${skillChart(line, width)}</div>
        <p class="hint">Higher is better. On the line 0, the model is as good as the mean of each cell. The gap between the two lines is the overfit.</p>
      </figure>
      <figure class="chart"><figcaption>The guard lines: the cells, each night</figcaption>
        <div class="legend"><span class="item"><span class="key s1"></span>Covered</span><span class="item"><span class="key s2"></span>20 rows or more</span><span class="item"><span class="key s0"></span>With rows</span></div>
        <div class="trend-plot" data-chart="guard">${guardChart(line, width)}</div>
        <p class="hint">A rise of the skill with a drop of the covered cells is no gain. The guard lines show such a drop.</p>
      </figure>
    </div>
    ${table(line)}
    ${bads}`;
}

/** This function draws the charts again at the width of their boxes. */
function fit(root: HTMLElement, line: readonly TrendRecord[]): void {
  for (const box of root.querySelectorAll<HTMLElement>("[data-chart]")) {
    const width = Math.floor(box.clientWidth);
    if (width <= 0 || box.dataset["width"] === String(width)) continue;
    box.dataset["width"] = String(width);
    box.innerHTML = box.dataset["chart"] === "skill" ? skillChart(line, width) : guardChart(line, width);
  }
}

/** This function shows the section in the element `root`: first the loading state, then the trend or the failure. */
export async function renderSweep(root: HTMLElement, get: Fetch): Promise<void> {
  root.innerHTML = sweepHtml({ kind: "loading" });
  const state = await loadSweep(get);
  root.innerHTML = sweepHtml(state);
  if (state.kind !== "ready" || state.line.length === 0) return;
  fit(root, state.line);
  new ResizeObserver(() => fit(root, state.line)).observe(root);
}
