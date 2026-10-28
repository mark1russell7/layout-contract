// The input picker of the joint pages: an input of the corpus `joint-v2`, a preset, or an input that the page builds from one value of each dimension.
import type { InputRow, JointCatalog } from "./catalog.ts";
import type { InputRef } from "./protocol.ts";
import { esc } from "./ui.ts";

/** One preset: a small input of the array `grid`, with one value of each dimension. */
export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly dims: Readonly<Record<string, string>>;
  readonly count: number;
}

/** The presets of the input picker. Each has 100 boxes or fewer, so the full compare of each finishes in seconds. */
export const PRESETS: readonly Preset[] = Object.freeze([
  {
    id: "quick",
    label: "10 boxes, fixed size",
    count: 10,
    dims: { containerSize: "fixed", containerShape: "rect", obstacles: "none", sizes: "uniform", edgeDensity: "medium", edgeShape: "random", groups: "none", ports: "free", spacing: "gap" },
  },
  {
    id: "hubs",
    label: "20 boxes, hubs",
    count: 20,
    dims: { containerSize: "freeAspect", containerShape: "rect", obstacles: "none", sizes: "bimodal", edgeDensity: "dense", edgeShape: "hubs", groups: "none", ports: "sides", spacing: "both" },
  },
  {
    id: "wall",
    label: "40 boxes, a wall",
    count: 40,
    dims: { containerSize: "fixed", containerShape: "rect", obstacles: "wall", sizes: "heavyTail", edgeDensity: "medium", edgeShape: "longRange", groups: "flat", ports: "free", spacing: "margin" },
  },
  {
    id: "circle",
    label: "50 boxes in a circle",
    count: 50,
    dims: { containerSize: "freeArea", containerShape: "circle", obstacles: "none", sizes: "nearIdentical", edgeDensity: "sparse", edgeShape: "clustered", groups: "nested", ports: "fixed", spacing: "stress" },
  },
  {
    id: "bundled",
    label: "100 boxes, bundles",
    count: 100,
    dims: { containerSize: "freeHeight", containerShape: "holes", obstacles: "scattered", sizes: "uniform", edgeDensity: "medium", edgeShape: "bundled", groups: "flat", ports: "sides", spacing: "gap" },
  },
]);

/** The counts of boxes of an input that the page builds. */
export const BUILD_COUNTS: readonly number[] = Object.freeze([5, 10, 20, 50, 100, 200, 500, 1000]);

/** One choice of the picker: a preset, an input of the corpus, or a built input. */
export type Picked = { readonly kind: "preset"; readonly id: string } | { readonly kind: "corpus"; readonly id: string } | { readonly kind: "build"; readonly dims: Readonly<Record<string, string>>; readonly count: number; readonly seed: number };

/** This function gives the short name of an input of the corpus: its id without the name of the corpus. */
export const shortId = (id: string): string => id.replace(/^joint-v2\//, "");

/** This function gives the groups of the inputs of the corpus by their count of boxes, in increasing order. */
function bySize(inputs: readonly InputRow[]): [number, InputRow[]][] {
  const groups = new Map<number, InputRow[]>();
  for (const i of inputs) groups.set(i.boxes, [...(groups.get(i.boxes) ?? []), i]);
  return [...groups].sort((a, b) => a[0] - b[0]);
}

/**
 * This function gives the HTML of the input picker. An input with more than `maxBoxes` boxes is disabled, and its label tells why.
 * The value of each option is the id of a preset or of an input, so the page reads it back from its own lists.
 */
export function pickerHtml(catalog: Pick<JointCatalog, "inputs" | "grid">, picked: Picked, maxBoxes: number): string {
  const mode = picked.kind;
  const seg = (["preset", "corpus", "build"] as const)
    .map((k) => `<button type="button" role="radio" data-input-mode="${k}" aria-checked="${k === mode}">${k === "preset" ? "Presets" : k === "corpus" ? "Corpus joint-v2" : "Build one"}</button>`)
    .join("");
  const presets = PRESETS.map(
    (p) => `<button type="button" class="chip${picked.kind === "preset" && picked.id === p.id ? " on" : ""}" data-preset="${esc(p.id)}" aria-pressed="${picked.kind === "preset" && picked.id === p.id}">${esc(p.label)}</button>`,
  ).join("");
  const groups = bySize(catalog.inputs)
    .map(([n, rows]) => {
      const off = n > maxBoxes;
      const label = `${n} boxes${off ? ` (more than ${maxBoxes}: open it in the playground)` : ""}`;
      const opts = rows
        .map((r) => `<option value="${esc(r.id)}"${off ? " disabled" : ""}${picked.kind === "corpus" && picked.id === r.id ? " selected" : ""}>${esc(shortId(r.id))}${r.stress ? " (stress)" : ""}, ${r.edges} edges</option>`)
        .join("");
      return `<optgroup label="${esc(label)}">${opts}</optgroup>`;
    })
    .join("");
  const build = picked.kind === "build" ? picked : { dims: PRESETS[0]!.dims, count: PRESETS[0]!.count, seed: 1 };
  const dims = Object.entries(catalog.grid)
    .map(
      ([name, values]) =>
        `<label class="field"><span class="field-name"><code>${esc(name)}</code></span><select data-dim="${esc(name)}">${values
          .map((v) => `<option value="${esc(v)}"${build.dims[name] === v ? " selected" : ""}>${esc(v)}</option>`)
          .join("")}</select></label>`,
    )
    .join("");
  const counts = BUILD_COUNTS.map((c) => `<option value="${c}"${c === build.count ? " selected" : ""}${c > maxBoxes ? " disabled" : ""}>${c}${c > maxBoxes ? " (playground only)" : ""}</option>`).join("");
  return `<div class="seg" role="radiogroup" aria-label="The kind of input">${seg}</div>
    <div class="picker-part" data-part="preset"${mode === "preset" ? "" : " hidden"}><div class="chips">${presets}</div></div>
    <div class="picker-part" data-part="corpus"${mode === "corpus" ? "" : " hidden"}><label class="field wide"><span class="field-name">Input</span><select data-corpus>${groups}</select></label>
      <p class="hint">The 303 inputs of the corpus of the joint benchmark: 101 specs, 3 seeds each.</p></div>
    <div class="picker-part" data-part="build"${mode === "build" ? "" : " hidden"}><div class="fields grid-dims">${dims}
      <label class="field"><span class="field-name"><code>count</code></span><select data-count>${counts}</select></label>
      <label class="field"><span class="field-name"><code>seed</code></span><input type="number" data-seed min="1" max="999" step="1" value="${build.seed}" inputmode="numeric" /></label></div>
      <p class="hint">The generator <code>rect-grid</code> of <code>packing</code> makes the boxes, and the edge step of the contract adds the edges.</p></div>`;
}

/** This function gives the reference of a choice for the worker, or `undefined` for an unknown id. */
export function refOf(catalog: Pick<JointCatalog, "inputs">, picked: Picked): InputRef | undefined {
  if (picked.kind === "corpus") {
    const row = catalog.inputs.find((r) => r.id === picked.id);
    return row === undefined ? undefined : { kind: "corpus", spec: row.spec, seed: row.seed, hash: row.hash };
  }
  if (picked.kind === "preset") {
    const p = PRESETS.find((x) => x.id === picked.id);
    return p === undefined ? undefined : { kind: "build", dims: p.dims, count: p.count, seed: 1 };
  }
  return { kind: "build", dims: picked.dims, count: picked.count, seed: picked.seed };
}

/** This function gives the count of boxes of a choice. */
export function boxesOf(catalog: Pick<JointCatalog, "inputs">, picked: Picked): number {
  if (picked.kind === "corpus") return catalog.inputs.find((r) => r.id === picked.id)?.boxes ?? 0;
  if (picked.kind === "preset") return PRESETS.find((x) => x.id === picked.id)?.count ?? 0;
  return picked.count;
}

/** This function reads the choice of the picker from the page. */
export function readPicker(root: HTMLElement, mode: Picked["kind"], preset: string): Picked {
  if (mode === "preset") return { kind: "preset", id: preset };
  if (mode === "corpus") return { kind: "corpus", id: root.querySelector<HTMLSelectElement>("select[data-corpus]")?.value ?? "" };
  const dims: Record<string, string> = {};
  for (const el of root.querySelectorAll<HTMLSelectElement>("select[data-dim]")) dims[el.dataset["dim"]!] = el.value;
  const count = Number(root.querySelector<HTMLSelectElement>("select[data-count]")?.value ?? 10);
  const seed = Math.max(1, Math.round(Number(root.querySelector<HTMLInputElement>("input[data-seed]")?.value ?? 1)) || 1);
  return { kind: "build", dims, count, seed };
}

/** This function gives the text of a choice for the hash of the address, and `parsePicked` reads it back. */
export function pickedText(p: Picked): string {
  if (p.kind === "build") return `build:${p.count}:${p.seed}:${Object.entries(p.dims).map(([k, v]) => `${k}=${v}`).join(",")}`;
  return `${p.kind}:${p.id}`;
}

/** This function reads a choice from the hash of the address. It gives `undefined` for a bad text. */
export function parsePicked(catalog: Pick<JointCatalog, "inputs" | "grid">, text: string): Picked | undefined {
  const m = /^(preset|corpus|build):(.+)$/.exec(text);
  if (m === null) return undefined;
  const [, kind, rest] = m as unknown as [string, Picked["kind"], string];
  if (kind === "preset") return PRESETS.some((p) => p.id === rest) ? { kind, id: rest } : undefined;
  if (kind === "corpus") return catalog.inputs.some((r) => r.id === rest) ? { kind, id: rest } : undefined;
  const b = /^(\d+):(\d+):(.+)$/.exec(rest);
  if (b === null) return undefined;
  const given = new Map(b[3]!.split(",").map((pair) => /^([A-Za-z]+)=([A-Za-z]+)$/.exec(pair)).map((x) => [x?.[1] ?? "", x?.[2] ?? ""] as const));
  const names = Object.keys(catalog.grid);
  if (given.size !== names.length || !names.every((n) => catalog.grid[n]!.includes(given.get(n) ?? ""))) return undefined;
  const count = Number(b[1]);
  if (!BUILD_COUNTS.includes(count)) return undefined;
  return { kind, count, seed: Number(b[2]), dims: Object.fromEntries(names.map((n) => [n, given.get(n)!])) };
}
