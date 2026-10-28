// Small helpers of the page: HTML escapes, number formats and the bar charts.

/** This function escapes a text for HTML. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** This function gives a number with 3 decimals. */
export const f3 = (v: number): string => v.toFixed(3);

/** This function gives an interval as `mean [lo, hi]`, with the word "open" when the interval holds 0. */
export function interval(v: { readonly mean: number; readonly lo: number; readonly hi: number; readonly open: boolean }): string {
  return `${f3(v.mean)} <span class="ci">[${f3(v.lo)}, ${f3(v.hi)}]${v.open ? " open" : ""}</span>`;
}

/** This function gives a share as a percent. */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** One bar of a bar chart. */
export interface Bar {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
}

/**
 * This function gives a bar chart as HTML: one row for each bar, with its label, an inline SVG bar and its value.
 * Each row is a button. The attribute `data-pick` holds the id of the bar. A short bar is a better value.
 */
export function barChart(bars: readonly Bar[], options: { readonly title: string; readonly unit: string; readonly max: number; readonly picked?: string }): string {
  const max = Math.max(1, options.max);
  const rows = bars
    .map((b) => {
      const w = Math.max(0.5, (b.value / max) * 100);
      const picked = options.picked === b.id;
      return `<li><button type="button" class="bar${picked ? " picked" : ""}" data-pick="${esc(b.id)}" aria-pressed="${picked}" title="${esc(b.note)}">
        <span class="bar-label">${esc(b.label)}</span>
        <svg class="bar-track" width="100%" height="12" aria-hidden="true" focusable="false"><rect class="bar-bg" x="0" y="0" width="100%" height="12" rx="3" /><rect class="bar-fill" x="0" y="0" width="${w.toFixed(2)}%" height="12" rx="3" /></svg>
        <span class="bar-value">${esc(b.value)}<span class="sr"> ${esc(options.unit)}</span></span>
      </button></li>`;
    })
    .join("");
  return `<figure class="chart"><figcaption>${esc(options.title)}</figcaption><ol class="bars">${rows}</ol></figure>`;
}

/** This function gives the element with the id, and throws when the page has no such element. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`The page has no element #${id}.`);
  return el as T;
}
