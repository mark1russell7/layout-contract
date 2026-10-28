import type { Dimensions } from "./pairwise.ts";

/** The pair coverage of a set of cells. */
export interface Coverage {
  /** The count of the pairs of values of 2 different dimensions. */
  readonly pairs: number;
  /** The count of the pairs that one cell or more has. */
  readonly covered: number;
  /** `covered` divided by `pairs`. A set of dimensions with no pairs gives 1. */
  readonly share: number;
  /** The pairs that no cell has, as `<dimension>=<value>&<dimension>=<value>`. */
  readonly missing: readonly string[];
}

/**
 * This function gives the pair coverage of the cells over the dimensions.
 * A pair is 2 values of 2 different dimensions. A cell covers a pair when it has the 2 values.
 * The function ignores the fields of a cell that are not dimensions.
 */
export function coverage(cells: readonly Readonly<Record<string, unknown>>[], dimensions: Dimensions): Coverage {
  const names = Object.keys(dimensions);
  const seen = new Set<string>();
  for (const cell of cells) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) seen.add(pairKey(names[i]!, cell[names[i]!], names[j]!, cell[names[j]!]));
    }
  }
  let pairs = 0;
  const missing: string[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const a of dimensions[names[i]!]!) {
        for (const b of dimensions[names[j]!]!) {
          pairs++;
          const key = pairKey(names[i]!, a, names[j]!, b);
          if (!seen.has(key)) missing.push(key);
        }
      }
    }
  }
  const covered = pairs - missing.length;
  return { pairs, covered, share: pairs === 0 ? 1 : covered / pairs, missing };
}

const pairKey = (d1: string, v1: unknown, d2: string, v2: unknown): string => `${d1}=${String(v1)}&${d2}=${String(v2)}`;
