// The shard plan of the joint benchmark (`docs/JOINT-BENCH.md`, roadmap item L28). It gives the inputs to the shards by their predicted cost.

/**
 * The coefficients of the predicted time of one pair on one input, in milliseconds: `base + boxes * boxes * square / 1000 + boxes * edges * cross / 1000`.
 * The fit uses the wall time of each input in the shard logs of run 40666991882 (`highways` 0.5.1), divided by the 120 pairs.
 */
export const COST_FIT: { readonly base: number; readonly square: number; readonly cross: number } = Object.freeze({ base: 8, square: 5.5, cross: 1.35 });

/** This function gives the predicted time of one input in milliseconds. The input has `boxes` boxes, `edges` edges and `pairs` pairs of a pack entry and a router. */
export function inputCost(boxes: number, edges: number, pairs: number): number {
  return pairs * (COST_FIT.base + (boxes * boxes * COST_FIT.square) / 1000 + (boxes * edges * COST_FIT.cross) / 1000);
}

/** One input of the plan. The inputs of one spec differ only in the seed. */
export interface PlanItem {
  readonly id: string;
  readonly spec: string;
  readonly cost: number;
}

/** The plan of the shards: the ids of each shard in the order of the run, and the predicted cost of each shard. */
export interface ShardPlan {
  readonly shards: readonly (readonly string[])[];
  readonly loads: readonly number[];
}

/**
 * This function gives the inputs to `count` shards by their predicted cost: the longest input first, to the shard with the least load.
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
