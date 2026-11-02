// The cost factor of each pack entry and router of the sweep (`docs/SWEEP.md`, "The cost factors of the configs").
// The cost model of `plan.ts` gives each pair the same time. On the night of 2026-11-02, the router `search` took 8 times the median record of its input.
import { readFileSync } from "node:fs";
import { median } from "@mark1russell7/rigor-statistics";

/**
 * The cost factors of the configs, from the file `data/config-cost.json`. The script `scripts/fit-config-cost.mjs` writes the file from the records of one night.
 * - `pack` gives the factor of each pack entry of `PACK_ENTRIES`, and `router` the factor of each router of `ROUTERS`. An entry without a factor has the factor 1.
 * - `level` multiplies each factor. With it, the planned minutes of the jobs of the night of the fit do not change.
 * - `scale` is the median of real minutes over planned minutes of the shards of the night of the fit, with the factors.
 *   The sweep uses it until it has shards of this model (`costScale` of `sweep.mjs`), because the shards of another model have another scale.
 */
export interface ConfigCost {
  readonly run: number;
  readonly night: string;
  readonly records: number;
  readonly level: number;
  readonly scale: number;
  readonly pack: Readonly<Record<string, number>>;
  readonly router: Readonly<Record<string, number>>;
}

/** This function reads the text of the cost factors and examines it. A factor that is not a finite number above 0 is an error. */
export function parseConfigCost(text: string): ConfigCost {
  const raw = JSON.parse(text) as ConfigCost;
  const check = (name: string, value: unknown): number => {
    if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) throw new RangeError(`The value ${name} of the cost factors is a finite number above 0, not ${String(value)}.`);
    return value;
  };
  const table = (name: "pack" | "router"): Readonly<Record<string, number>> =>
    Object.freeze(Object.fromEntries(Object.entries(raw[name] ?? {}).map(([k, v]) => [k, check(`${name}.${k}`, v)])));
  return Object.freeze({ run: check("run", raw.run), night: String(raw.night), records: check("records", raw.records), level: check("level", raw.level), scale: check("scale", raw.scale), pack: table("pack"), router: table("router") });
}

/** The cost factors of the sweep, from the records of the night of 2026-11-02 (run 41384329446). */
export const CONFIG_COST: ConfigCost = parseConfigCost(readFileSync(new URL("../data/config-cost.json", import.meta.url), "utf8"));

/** The id of the cost model of the sweep. The plan and each shard entry keep it, so the scale of a night uses only the shards of the same model. */
export const CONFIG_COST_ID: string = `factors-${CONFIG_COST.night}`;

/**
 * This function gives the cost factor of a config: `level` times the factor of its pack entry and the factor of its router.
 * A run without a pack entry and a router has the factor 1, as before the factors.
 */
export function configFactor(run: { readonly pack?: string; readonly router?: string }, model: ConfigCost = CONFIG_COST): number {
  if (run.pack === undefined && run.router === undefined) return 1;
  const of = (table: Readonly<Record<string, number>>, key: string | undefined): number => (key !== undefined && Object.hasOwn(table, key) ? table[key]! : 1);
  return model.level * of(model.pack, run.pack) * of(model.router, run.router);
}

/** One record for the fit: the input, the pack entry and the router of its config, and its time in milliseconds. */
export interface CostRecord {
  readonly input: string;
  readonly pack: string;
  readonly router: string;
  readonly ms: number;
}

/**
 * This function fits the factors of `log(ms) = input + pack + router` by medians, in turns of the 3 terms (a robust fit of an additive model).
 * The median of the pack terms and the median of the router terms are 0, so the input term holds the level.
 * A time below 0.01 ms counts as 0.01 ms, so the log is finite.
 */
export function fitConfigFactors(records: readonly CostRecord[], turns = 20): { pack: Record<string, number>; router: Record<string, number> } {
  if (records.length === 0) throw new RangeError("fitConfigFactors: there are no records.");
  const logs = records.map((r) => Math.log(Math.max(r.ms, 0.01)));
  const keys = { input: records.map((r) => r.input), pack: records.map((r) => r.pack), router: records.map((r) => r.router) };
  const terms = { input: new Map<string, number>(), pack: new Map<string, number>(), router: new Map<string, number>() };
  const term = (name: keyof typeof terms, i: number): number => terms[name].get(keys[name][i]!) ?? 0;
  for (let turn = 0; turn < turns; turn++) {
    for (const name of ["input", "pack", "router"] as const) {
      const others = (["input", "pack", "router"] as const).filter((o) => o !== name);
      const residuals = new Map<string, number[]>();
      logs.forEach((y, i) => {
        const key = keys[name][i]!;
        const list = residuals.get(key) ?? [];
        list.push(y - others.reduce((s, o) => s + term(o, i), 0));
        residuals.set(key, list);
      });
      for (const [key, list] of residuals) terms[name].set(key, median(list));
      if (name !== "input") {
        const center = median([...terms[name].values()]);
        for (const [key, value] of terms[name]) terms[name].set(key, value - center);
      }
    }
  }
  const factors = (map: Map<string, number>): Record<string, number> => Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, Math.round(Math.exp(v) * 1000) / 1000]));
  return { pack: factors(terms.pack), router: factors(terms.router) };
}
