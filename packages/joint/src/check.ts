// The corpus check of the joint benchmark (`docs/JOINT-BENCH.md`, "The corpus check"). It examines the claims of a manifest against its input files.
import { marginSides, type LayoutInput } from "@mark1russell7/layout-contract";
import { arrayDimensions, claimsOf, SET, SET_V2, type CorpusClaims, type JointManifest, type JointSpec } from "./corpus.ts";
import { coverage } from "./coverage.ts";

/** One broken claim, with the ids of the inputs that break it. */
export interface ClaimBreak {
  /** The name of the claim: `spacing`, `stressOnly`, `coverage`, `minPerKind`, `maxBoxes` or `index`. */
  readonly claim: string;
  readonly detail: string;
  readonly inputs: readonly string[];
}

/** This function gives the board kind of an input id: the first part of its family, for example `rect-grid`. */
export function kindOf(id: string): string {
  return id.split("/")[1]?.split(".")[0] ?? "";
}

/** This function gives the smallest side of the margins of the boxes of an input. An input without boxes gives 0. */
function minMargin(input: LayoutInput): number {
  let min = Infinity;
  for (const b of input.boxes) {
    const m = marginSides(b.margin);
    min = Math.min(min, m.top, m.right, m.bottom, m.left);
  }
  return Number.isFinite(min) ? min : 0;
}

/** This function tells if an input has a margin above 0 on a side of a box. */
function anyMargin(input: LayoutInput): boolean {
  return input.boxes.some((b) => {
    const m = marginSides(b.margin);
    return m.top > 0 || m.right > 0 || m.bottom > 0 || m.left > 0;
  });
}

/** This function tells if an input is a stress input of d7: no margins, and no gap above 0. */
export function isStressInput(input: LayoutInput): boolean {
  return !anyMargin(input) && (input.gap ?? 0) === 0;
}

/** This function gives the array of each input of the manifest, from the order of the specs and their seeds. */
function arraysOf(specs: readonly JointSpec[]): JointSpec["array"][] {
  return specs.flatMap((s) => s.seeds.map(() => s.array));
}

/**
 * This function examines the claims of a corpus against its input files, and gives each broken claim. An empty list tells that each claim holds.
 * The claims come from `claims`, else from `claimsOf(manifest)`. A corpus without claims gives the break `index`.
 * The inputs are in the order of the manifest. A difference of the ids or the hashes also gives the break `index`.
 */
export function checkCorpus(manifest: JointManifest, inputs: readonly LayoutInput[], claims: CorpusClaims | undefined = claimsOf(manifest)): ClaimBreak[] {
  const breaks: ClaimBreak[] = [];
  const entries = manifest.inputs;
  const wrong = entries.filter((e, i) => inputs[i]?.id !== e.id || inputs[i]?.hash !== e.hash).map((e) => e.id);
  if (entries.length !== inputs.length || wrong.length > 0) {
    breaks.push({ claim: "index", detail: `The manifest has ${entries.length} inputs and the files are ${inputs.length}. ${wrong.length} ids or hashes differ.`, inputs: wrong });
  }
  if (claims === undefined) {
    breaks.push({ claim: "index", detail: "The corpus has no claims.", inputs: [] });
    return breaks;
  }
  const byId = new Map(inputs.map((f) => [f.id, f]));

  if (claims.spacing === true) {
    const bad: string[] = [];
    for (const e of entries) {
      const f = byId.get(e.id);
      if (f === undefined) continue;
      const stress = e.stress === true;
      const ok = stress ? isStressInput(f) && f.gap === 0 && e.cell.spacing === "stress" : minMargin(f) + (f.gap ?? 0) > 0 && e.cell.spacing !== undefined && e.cell.spacing !== "stress";
      if (!ok) bad.push(e.id);
    }
    if (bad.length > 0) breaks.push({ claim: "spacing", detail: `${bad.length} inputs break the rule of d7: margin + gap above 0 outside the stress cell, and margin 0 and gap 0 in it.`, inputs: bad });
  }

  if (claims.stressOnly === true) {
    const bad = inputs.filter((f) => !isStressInput(f)).map((f) => f.id);
    if (bad.length > 0) breaks.push({ claim: "stressOnly", detail: `${bad.length} inputs have a margin or a gap above 0.`, inputs: bad });
  }

  const arrays = arraysOf(manifest.specs);
  const dims = arrayDimensions(manifest.corpus === SET ? SET : SET_V2);
  for (const [array, share] of Object.entries(claims.coverage)) {
    const dimensions = array === "grid" ? dims.grid : array === "ui" ? dims.ui : undefined;
    if (dimensions === undefined) {
      breaks.push({ claim: "coverage", detail: `There is no array "${array}".`, inputs: [] });
      continue;
    }
    const cells = entries.filter((_, i) => arrays[i] === array).map((e) => ({ ...e.cell, family: kindOf(e.id) }));
    const c = coverage(cells, dimensions);
    if (c.share < share - 1e-12) breaks.push({ claim: "coverage", detail: `The array ${array} covers ${c.covered} of ${c.pairs} pairs, below the share ${share}. Missing: ${c.missing.slice(0, 5).join(", ")}.`, inputs: [] });
  }

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(kindOf(e.id), (counts.get(kindOf(e.id)) ?? 0) + 1);
  const thin = [...counts].filter(([, n]) => n < claims.minPerKind.count).map(([k]) => k);
  const unlisted = thin.filter((k) => !claims.minPerKind.thin.includes(k));
  const notThin = claims.minPerKind.thin.filter((k) => !thin.includes(k));
  if (unlisted.length > 0 || notThin.length > 0) {
    const parts = [
      ...unlisted.map((k) => `${k} has ${counts.get(k)} inputs, below ${claims.minPerKind.count}, and the list of thin kinds does not have it`),
      ...notThin.map((k) => `${k} is in the list of thin kinds, but it has ${counts.get(k) ?? 0} inputs`),
    ];
    breaks.push({ claim: "minPerKind", detail: `${parts.join(". ")}.`, inputs: entries.filter((e) => unlisted.includes(kindOf(e.id))).map((e) => e.id) });
  }

  const big = inputs.filter((f) => f.boxes.length > claims.maxBoxes).map((f) => f.id);
  if (big.length > 0) breaks.push({ claim: "maxBoxes", detail: `${big.length} inputs have more than ${claims.maxBoxes} boxes.`, inputs: big });
  return breaks;
}
