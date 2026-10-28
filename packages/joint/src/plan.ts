// The shard plan of the joint benchmark (`docs/JOINT-BENCH.md`, roadmap items L28 and L29). It gives the inputs to the shards by their planned cost.
import { readFileSync } from "node:fs";

/** The coefficients of the predicted time of one pair on one input, in milliseconds: `base + boxes * boxes * square / 1000 + boxes * edges * cross / 1000`. */
export interface CostFit {
  readonly base: number;
  readonly square: number;
  readonly cross: number;
}

/**
 * The cost model of the plan, from the file `data/cost-margins.json`. The script `scripts/fit-cost.mjs` writes the file from the shard logs of a full run.
 * - `fit` gives the predicted time of one pair. The fit makes the least sum of the squares of the logs of real / predicted.
 * - `specs` gives the margin of each spec: the quantile `quantile` of real / predicted over the seeds of the spec.
 * - `default` is the margin of a spec without a measured time: the same quantile over all inputs.
 */
export interface CostModel {
  readonly corpus: string;
  readonly run: number;
  readonly commit: string;
  readonly pairs: number;
  readonly quantile: number;
  readonly fit: CostFit;
  readonly default: number;
  readonly specs: Readonly<Record<string, number>>;
}

/** This function reads the text of a cost model and examines it. A coefficient or a margin that is not a finite number of 0 or more is an error. */
export function parseCostModel(text: string): CostModel {
  const raw = JSON.parse(text) as CostModel;
  const check = (name: string, value: unknown): number => {
    if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)) throw new RangeError(`The value ${name} of the cost model is a finite number of 0 or more, not ${String(value)}.`);
    return value;
  };
  const fit: CostFit = Object.freeze({ base: check("fit.base", raw.fit?.base), square: check("fit.square", raw.fit?.square), cross: check("fit.cross", raw.fit?.cross) });
  const specs: Record<string, number> = {};
  for (const [spec, margin] of Object.entries(raw.specs ?? {})) specs[spec] = check(`specs.${spec}`, margin);
  return Object.freeze({
    corpus: String(raw.corpus),
    run: check("run", raw.run),
    commit: String(raw.commit),
    pairs: check("pairs", raw.pairs),
    quantile: check("quantile", raw.quantile),
    fit,
    default: check("default", raw.default),
    specs: Object.freeze(specs),
  });
}

/** The cost model of the plan. The fit and the margins come from the wall times of the full run 40743187036 (`highways` 0.8.1, `packing` 0.2.16, 130 pairs). */
export const COST_MODEL: CostModel = parseCostModel(readFileSync(new URL("../data/cost-margins.json", import.meta.url), "utf8"));

/** The coefficients of the predicted time of one pair, from `COST_MODEL`. */
export const COST_FIT: CostFit = COST_MODEL.fit;

/** This function gives the predicted time of one input in milliseconds. The input has `boxes` boxes, `edges` edges and `pairs` pairs of a pack entry and a router. */
export function inputCost(boxes: number, edges: number, pairs: number): number {
  return pairs * (COST_FIT.base + (boxes * boxes * COST_FIT.square) / 1000 + (boxes * edges * COST_FIT.cross) / 1000);
}

/** This function gives the margin of a spec: its value in `COST_MODEL.specs`, or the default margin for a spec without a measured time. */
export function costMargin(spec: string): number {
  return Object.hasOwn(COST_MODEL.specs, spec) ? COST_MODEL.specs[spec]! : COST_MODEL.default;
}

/** This function gives the planned time of one input in milliseconds: the predicted time of `inputCost` times the margin of its spec. */
export function plannedCost(spec: string, boxes: number, edges: number, pairs: number): number {
  return inputCost(boxes, edges, pairs) * costMargin(spec);
}

/** One input of the plan. The inputs of one spec differ only in the seed. */
export interface PlanItem {
  readonly id: string;
  readonly spec: string;
  readonly cost: number;
}

/** The plan of the shards: the ids of each shard in the order of the run, and the planned cost of each shard. */
export interface ShardPlan {
  readonly shards: readonly (readonly string[])[];
  readonly loads: readonly number[];
}

/**
 * This function gives the inputs to `count` shards by their planned cost: the longest input first, to the shard with the least load.
 * - The plan is deterministic: equal costs go in the order of the ids, and equal loads go to the lowest shard.
 * - An input does not go to a shard with an input of the same spec, while another shard has none. Thus a lost shard loses one seed of a spec.
 * - In each shard, the inputs run from the least cost to the most cost. Thus a timeout loses the costly inputs, not the inputs after them.
 */
export function planShards(items: readonly PlanItem[], count: number): ShardPlan {
  if (!(Number.isInteger(count) && count >= 1)) throw new RangeError(`The count of the shards is an integer of 1 or more, not ${count}.`);
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new RangeError(`The input ${item.id} is in the plan two times.`);
    if (!(Number.isFinite(item.cost) && item.cost >= 0)) throw new RangeError(`The cost of ${item.id} is a finite number of 0 or more, not ${item.cost}.`);
    ids.add(item.id);
  }
  const order = [...items].sort((a, b) => b.cost - a.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shards: PlanItem[][] = Array.from({ length: count }, () => []);
  const loads = new Array<number>(count).fill(0);
  const specs = Array.from({ length: count }, () => new Set<string>());
  for (const item of order) {
    let best = -1;
    let fallback = 0;
    for (let i = 0; i < count; i++) {
      if (loads[i]! < loads[fallback]!) fallback = i;
      if (!specs[i]!.has(item.spec) && (best < 0 || loads[i]! < loads[best]!)) best = i;
    }
    const target = best < 0 ? fallback : best;
    shards[target]!.push(item);
    loads[target]! += item.cost;
    specs[target]!.add(item.spec);
  }
  return { shards: shards.map((list) => list.reverse().map((i) => i.id)), loads };
}
