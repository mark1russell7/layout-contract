// The drawing of one pair as an SVG: the packed area, the boxes and the routes. The SVG holds numbers and one escaped label.
import type { PairView } from "./protocol.ts";
import { esc } from "./ui.ts";

/** This function gives a number for an SVG attribute: a finite number with at most 1 decimal, else 0. */
const n = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "0");

/**
 * This function gives the SVG of a pair. The view box holds the packed area, the boxes and the routes, with a small margin.
 * The boxes are one path and the routes are one path, so a drawing of 1000 boxes stays fast.
 */
export function pairSvg(view: Pick<PairView, "w" | "h" | "boxes" | "routes">, label: string): string {
  let x0 = 0;
  let y0 = 0;
  let x1 = Math.max(1, view.w);
  let y1 = Math.max(1, view.h);
  const b = view.boxes;
  for (let i = 0; i + 3 < b.length; i += 4) {
    x0 = Math.min(x0, b[i]!);
    y0 = Math.min(y0, b[i + 1]!);
    x1 = Math.max(x1, b[i]! + b[i + 2]!);
    y1 = Math.max(y1, b[i + 1]! + b[i + 3]!);
  }
  for (const r of view.routes)
    for (let i = 0; i + 1 < r.length; i += 2) {
      x0 = Math.min(x0, r[i]!);
      y0 = Math.min(y0, r[i + 1]!);
      x1 = Math.max(x1, r[i]!);
      y1 = Math.max(y1, r[i + 1]!);
    }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.02;
  const boxes: string[] = [];
  for (let i = 0; i + 3 < b.length; i += 4) boxes.push(`M${n(b[i]!)} ${n(b[i + 1]!)}h${n(b[i + 2]!)}v${n(b[i + 3]!)}h${n(-b[i + 2]!)}z`);
  const routes = view.routes.filter((r) => r.length >= 4).map((r) => `M${n(r[0]!)} ${n(r[1]!)}` + r.slice(2).reduce((s, v, i) => s + (i % 2 === 0 ? `L${n(v)}` : ` ${n(v)}`), ""));
  const vb = `${n(x0 - pad)} ${n(y0 - pad)} ${n(x1 - x0 + 2 * pad)} ${n(y1 - y0 + 2 * pad)}`;
  return (
    `<svg class="pair-svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label)}">` +
    `<rect class="area" x="0" y="0" width="${n(view.w)}" height="${n(view.h)}" vector-effect="non-scaling-stroke" />` +
    `<path class="boxes" d="${boxes.join("")}" vector-effect="non-scaling-stroke" />` +
    `<path class="routes" d="${routes.join("")}" vector-effect="non-scaling-stroke" />` +
    `</svg>`
  );
}
