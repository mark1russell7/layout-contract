import { randomInt, stepRandom } from "@mark1russell7/layout-contract";

/** The dimensions of an array: the name of each dimension and its values, in their order. */
export type Dimensions = Readonly<Record<string, readonly string[]>>;

/** A row of an array: one value for each dimension. */
export type Row = Readonly<Record<string, string>>;

/** The count of candidate rows that `pairwise` makes for each row that it keeps. */
export const CANDIDATES = 50;

/**
 * This function gives a pairwise covering array: each pair of values of 2 different dimensions is in one row or more.
 * The algorithm is a greedy AETG. The random numbers come from the step `pairwise` of `seed`, thus the same dimensions and seed give the same rows.
 * For each row, the function makes `candidates` rows and keeps the row that covers the most new pairs.
 */
export function pairwise(dimensions: Dimensions, seed: number, candidates: number = CANDIDATES): Row[] {
  const names = Object.keys(dimensions);
  const sizes = names.map((name) => dimensions[name]!.length);
  if (sizes.some((s) => s === 0)) throw new RangeError("pairwise: a dimension has no values");
  const k = names.length;
  const r = stepRandom(seed, "pairwise");
  // open[i][j][a * sizes[j] + b] is true while the pair (value a of dimension i, value b of dimension j) has no row, for i < j.
  const open: boolean[][][] = names.map((_, i) => names.map((__, j) => (j > i ? new Array<boolean>(sizes[i]! * sizes[j]!).fill(true) : [])));
  let left = 0;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) left += sizes[i]! * sizes[j]!;
  const isOpen = (i: number, a: number, j: number, b: number): boolean => (i < j ? open[i]![j]![a * sizes[j]! + b]! : open[j]![i]![b * sizes[i]! + a]!);
  const pick = <T>(items: readonly T[]): T => items[randomInt(r, 0, items.length - 1)]!;

  const rows: Row[] = [];
  while (left > 0) {
    // The value with the most open pairs starts each candidate.
    let most = -1;
    let starts: [number, number][] = [];
    for (let i = 0; i < k; i++) {
      for (let a = 0; a < sizes[i]!; a++) {
        let n = 0;
        for (let j = 0; j < k; j++) if (j !== i) for (let b = 0; b < sizes[j]!; b++) if (isOpen(i, a, j, b)) n++;
        if (n > most) {
          most = n;
          starts = [];
        }
        if (n === most) starts.push([i, a]);
      }
    }
    let best: number[] = [];
    let bestGain = -1;
    for (let c = 0; c < candidates; c++) {
      const [first, value] = pick(starts);
      const row = new Array<number>(k).fill(-1);
      row[first] = value;
      const order = names.map((_, i) => i).filter((i) => i !== first);
      for (let i = order.length - 1; i > 0; i--) {
        const j = randomInt(r, 0, i);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const done = [first];
      let gain = 0;
      for (const f of order) {
        let top = -1;
        let tops: number[] = [];
        for (let v = 0; v < sizes[f]!; v++) {
          let n = 0;
          for (const d of done) if (isOpen(f, v, d, row[d]!)) n++;
          if (n > top) {
            top = n;
            tops = [];
          }
          if (n === top) tops.push(v);
        }
        row[f] = pick(tops);
        gain += top;
        done.push(f);
      }
      if (gain > bestGain) {
        best = row;
        bestGain = gain;
      }
    }
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const at = best[i]! * sizes[j]! + best[j]!;
        if (open[i]![j]![at]!) {
          open[i]![j]![at] = false;
          left--;
        }
      }
    }
    rows.push(Object.fromEntries(names.map((name, i) => [name, dimensions[name]![best[i]!]!])));
  }
  return rows;
}
