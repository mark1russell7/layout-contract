// The coverage surrogate of the sweep (roadmap item L52, `docs/SWEEP.md`, "Space coverage").
// A ridge regression over the configs and the board kinds predicts the score. Its held-out error in each cell tells which part of the space the sweep measures.
import type { StrategyConfig, StrategySpace } from "@mark1russell7/layout-contract";
import { deriveSeed, random } from "@mark1russell7/rigor-generators";
import { mean, median, quantile, sd } from "@mark1russell7/rigor-statistics";
import { kindOf } from "./check.ts";
import type { JointManifest } from "./corpus.ts";
import type { SweepState } from "./night.ts";
import { JOINT_GROUPS, saltelliDesign, saltelliIndices, type SensitivityGroup } from "./sensitivity.ts";
import { JOINT_SPACE } from "./space.ts";

/** The name of the factor of the board kind in the cells and in the Sobol indices. */
export const KIND_FACTOR = "kind";

/** The name of the Sobol factor of the input when the fit has input features. The factor draws one input, with its kind and its features. */
export const INPUT_FACTOR = "input";

/** The prefix of the name of the block of an input feature. */
export const FEATURE_PREFIX = "input.";

/** The key of the folds of the held-out error: the config or the input of each row. */
export type SurrogateFoldBy = "config" | "input";

/** The options of `fitSurrogate`. */
export interface SurrogateOptions {
  /** The seed of the folds and of the Sobol draw. The default is 1. */
  readonly seed?: number;
  /** The count of the folds of the held-out error. The default is 5. */
  readonly folds?: number;
  /**
   * The key of the folds. With `config`, all rows of one config are in one fold. With `input`, all rows of one input are in one fold.
   * The default is `config`. Use `input` to measure the error on inputs that the fit did not see.
   */
  readonly foldBy?: SurrogateFoldBy;
  /** The candidates of the ridge penalty. The fit uses the candidate with the smallest held-out error. The default is 0.01, 0.1, 1, 10, 100, 1000 and 10000. */
  readonly lambdas?: readonly number[];
  /** The largest ratio of the held-out RMSE of a covered cell to its floor. The default is 1.25. */
  readonly floorRatio?: number;
  /** The smallest count of rows of a covered cell. The default is 20. */
  readonly minRows?: number;
  /** The smallest floor of a cell. A cell with a constant score has the floor 0, so the ratio uses this value. The default is 0.01. */
  readonly minFloor?: number;
  /** The count `N` of the rows of the Sobol design. The default is 4096. */
  readonly draws?: number;
  /** The space of the configs. The default is `JOINT_SPACE`. */
  readonly space?: StrategySpace;
  /** The groups of the cells and of the Sobol indices. Each group is one stage of the space. The default is `JOINT_GROUPS`. */
  readonly groups?: readonly SensitivityGroup[];
  /** This function gives the board kind of an input id. The default is `kindOf`. */
  readonly kindOf?: (inputId: string) => string;
  /**
   * This function gives the features of an input id: the dimensions of its cell, by name. The default gives no features.
   * The fit adds a block for each dimension with 2 values or more. The cells of the coverage stay the groups and the kind.
   */
  readonly features?: (inputId: string) => Readonly<Record<string, string>> | undefined;
  /** With `true`, the fit also has the product of each group block with each feature block. The default is `false`. */
  readonly featurePairs?: boolean;
  /** With `true`, the fit also has the product of the kind block with each feature block. Then a feature has its own effect on each board kind. The default is `false`. */
  readonly featureKindPairs?: boolean;
}

/** The held-out error of one candidate of the ridge penalty. */
export interface SurrogateLambda {
  readonly lambda: number;
  readonly r2: number;
  readonly rmse: number;
}

/** The held-out error of one cell with rows. A cell is one level of each group and one board kind. */
export interface SurrogateCell {
  /** The level of each group and of `kind`, by name. */
  readonly levels: Readonly<Record<string, string>>;
  readonly rows: number;
  /** The RMSE of the out-of-fold predictions of the rows of the cell. */
  readonly rmse: number;
  /** The floor of the cell: the RMSE of its rows around their own mean. No model on the features of the cell has a smaller error. */
  readonly floor: number;
  /** `rmse` divided by the larger of `floor` and `minFloor`. */
  readonly ratio: number;
  /** The skill of the fit inside the cell: `1 - ratio²`. It is 0 for a fit that gives only the mean of the cell, and 1 for a fit with no error. */
  readonly skill: number;
  readonly covered: boolean;
}

/** The quantiles 0.1, 0.5 and 0.9 of the skill of the cells with `minRows` rows or more. Each value is NaN when there are no such cells. */
export interface SurrogateSkill {
  readonly q10: number;
  readonly median: number;
  readonly q90: number;
}

/**
 * The coverage of the cells of the space. A covered cell has `minRows` rows or more, and a held-out RMSE of at most `floorRatio` times its floor.
 * The main line of the weekly trend is `skill`. The guard lines are `share` and `withRows`.
 */
export interface SurrogateCells {
  /** The count of all cells, with the cells that have no rows. */
  readonly total: number;
  /** The count of the cells with rows. */
  readonly withRows: number;
  /** The count of the cells with `minRows` rows or more. */
  readonly eligible: number;
  readonly covered: number;
  /** The count of the cells with no rows. */
  readonly empty: number;
  /** `covered` divided by `withRows`, or 0 when no cell has rows. */
  readonly share: number;
  /** The median of `ratio` over the cells with `minRows` rows or more, or NaN when there are none. */
  readonly medianRatio: number;
  /** The skill inside the cells with `minRows` rows or more. */
  readonly skill: SurrogateSkill;
  /** The skill inside the same cells, from the fit on all rows. It is a ceiling of `skill`, and the gap of the two is the overfit. */
  readonly inSampleSkill: SurrogateSkill;
  readonly floorRatio: number;
  readonly minRows: number;
  readonly minFloor: number;
}

/** The first and total Sobol index of one factor of the surrogate. */
export interface SurrogateIndex {
  /** The name of a group, or `kind` for the board kind. */
  readonly name: string;
  readonly first: number;
  readonly total: number;
}

/** The Sobol indices of the surrogate that the fit on all rows gives. */
export interface SurrogateSobol {
  /** The count `N` of the rows of the design. */
  readonly draws: number;
  readonly factors: readonly SurrogateIndex[];
}

/** The result of `fitSurrogate`. */
export interface Surrogate {
  /** The count of the measured values: one row for each config and input with a score. */
  readonly rows: number;
  readonly configs: number;
  /** The count of the features, with the intercept. */
  readonly features: number;
  /** The dimensions of the input features that the fit uses, in their order. It is empty without the option `features`. */
  readonly inputFeatures: readonly string[];
  /** This value is `true` when the fit has the products of the group blocks with the feature blocks. */
  readonly featurePairs: boolean;
  /** This value is `true` when the fit has the products of the kind block with the feature blocks. */
  readonly featureKindPairs: boolean;
  readonly folds: number;
  readonly foldBy: SurrogateFoldBy;
  readonly seed: number;
  /** The ridge penalty with the smallest held-out error. */
  readonly lambda: number;
  /** This value is `true` when `lambda` is the smallest or the largest candidate of a list of 2 or more. Then a value out of the list can give a smaller error. */
  readonly lambdaAtEdge: boolean;
  readonly lambdas: readonly SurrogateLambda[];
  /** The held-out R² of `lambda` over all rows: 1 minus the sum of the squared errors divided by the total sum of squares. */
  readonly r2: number;
  /** The held-out RMSE of `lambda` over all rows. */
  readonly rmse: number;
  readonly cells: SurrogateCells;
  /** The cells with rows, from the largest RMSE to the smallest. */
  readonly cellErrors: readonly SurrogateCell[];
  readonly sobol: SurrogateSobol;
  /** The fold of each key, by config id or by input id (see `foldBy`). All rows of a key are in its fold. */
  readonly foldOf: Readonly<Record<string, number>>;
}

/** One categorical block of the features: a group or the board kind, with its levels. */
interface Block {
  readonly name: string;
  readonly levels: readonly string[];
  readonly index: ReadonlyMap<string, number>;
  readonly offset: number;
}

/** One numeric param of the features, with its mean and SD over the rows. */
interface Param {
  readonly stage: string;
  readonly option: string;
  readonly name: string;
  readonly mean: number;
  readonly sd: number;
  /** The default of the param, for a config that does not set it. */
  readonly fallback: unknown;
  readonly feature: number;
}

/** One row of the fit: a sparse feature vector and its score. */
interface Row {
  readonly config: string;
  readonly cell: string;
  readonly idx: readonly number[];
  readonly val: readonly number[];
  readonly y: number;
}

/** This function gives the fold of a config or of an input: a seeded hash of its id, modulo the count of the folds. */
export function surrogateFold(id: string, seed: number, folds: number): number {
  return deriveSeed(seed, id) % folds;
}

/** This function gives the numeric value of a param of a choice, or the default of the param. */
function paramValue(params: Readonly<Record<string, unknown>> | undefined, name: string, fallback: unknown): number | undefined {
  const v = params?.[name] ?? fallback;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** This function gives the levels of a group: the options of its stage, `none` for an optional stage, and each level of the rows. */
function groupLevels(group: SensitivityGroup, space: StrategySpace, seen: Iterable<string>): string[] {
  const stage = space.stages.find((s) => s.name === group.stage);
  const levels = stage === undefined ? [] : stage.options.map((o) => o.id);
  if (stage?.optional === true) levels.push("none");
  for (const l of [...seen].sort()) if (!levels.includes(l)) levels.push(l);
  return levels;
}

/**
 * This function solves `A x = b` for a symmetric positive definite matrix `A` of size `n` by a Cholesky factorization.
 * The matrix is in row order. The function reads the lower triangle and writes the factor into it.
 */
function solvePositive(a: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]!;
    for (let k = 0; k < j; k++) d -= a[j * n + k]! ** 2;
    if (!(d > 0)) throw new RangeError(`fitSurrogate: the matrix of the fit is not positive definite at row ${j}.`);
    const l = Math.sqrt(d);
    a[j * n + j] = l;
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= a[i * n + k]! * a[j * n + k]!;
      a[i * n + j] = s / l;
    }
  }
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let s = x[i]!;
    for (let k = 0; k < i; k++) s -= a[i * n + k]! * x[k]!;
    x[i] = s / a[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]!;
    for (let k = i + 1; k < n; k++) s -= a[k * n + i]! * x[k]!;
    x[i] = s / a[i * n + i]!;
  }
  return x;
}

/** This function gives the value of a sparse row with the coefficients `beta`. */
function predict(beta: Float64Array, idx: readonly number[], val: readonly number[]): number {
  let s = 0;
  for (let k = 0; k < idx.length; k++) s += beta[idx[k]!]! * val[k]!;
  return s;
}

/**
 * This function fits a ridge surrogate of the sweep score, and gives its held-out error, the coverage of the cells and its Sobol indices.
 * - The features are a one-hot of each group and of the board kind, and the product of each pair of these.
 * - Each numeric param gives one more feature: its z value over the rows.
 * - The penalty is on each feature but the intercept. The folds keep all rows of one config, or of one input, together.
 * - A cell is one level of each group and one board kind. A covered cell has `minRows` rows or more and a held-out RMSE of at most `floorRatio` times its floor.
 * - The floor of a cell is the RMSE of its rows around their mean, and at least `minFloor`.
 * - The Sobol design of `saltelliDesign` draws the configs, and a seeded draw gives the board kinds of the rows.
 * The function throws a `RangeError` when the state has no rows, or fewer than 2 configs with rows.
 */
export function fitSurrogate(state: SweepState, options: SurrogateOptions = {}): Surrogate {
  const seed = options.seed ?? 1;
  const folds = options.folds ?? 5;
  const lambdas = options.lambdas ?? [0.01, 0.1, 1, 10, 100, 1000, 10000];
  const foldBy = options.foldBy ?? "config";
  if (foldBy !== "config" && foldBy !== "input") throw new RangeError(`fitSurrogate: foldBy is config or input, not ${String(foldBy)}.`);
  const floorRatio = options.floorRatio ?? 1.25;
  const minRows = options.minRows ?? 20;
  const minFloor = options.minFloor ?? 0.01;
  if (!(floorRatio > 0) || !(minFloor > 0)) throw new RangeError(`fitSurrogate: floorRatio and minFloor are numbers above 0, not ${floorRatio} and ${minFloor}.`);
  const draws = options.draws ?? 4096;
  const space = options.space ?? JOINT_SPACE;
  const groups = options.groups ?? JOINT_GROUPS;
  const kindOfInput = options.kindOf ?? kindOf;
  const featurePairs = options.featurePairs ?? false;
  const featureKindPairs = options.featureKindPairs ?? false;
  if (!(Number.isInteger(folds) && folds >= 2)) throw new RangeError(`fitSurrogate: folds is an integer of 2 or more, not ${folds}.`);
  if (lambdas.length === 0 || !lambdas.every((l) => l > 0)) throw new RangeError(`fitSurrogate: lambdas is a list of numbers above 0, not [${lambdas.join(", ")}].`);
  if (!(Number.isInteger(draws) && draws >= 2)) throw new RangeError(`fitSurrogate: draws is an integer of 2 or more, not ${draws}.`);

  // The measured values: one row for each config and input with a score.
  const kinds = state.inputs.map(kindOfInput);
  const featureRows = state.inputs.map((id) => options.features?.(id) ?? {});
  const measured: { config: string; levels: string[]; kind: string; input: number; y: number }[] = [];
  for (const [id, values] of Object.entries(state.values)) {
    const entry = state.configs[id];
    if (entry === undefined) continue;
    const levels = groups.map((g) => g.of(entry.config));
    values.forEach((y, i) => {
      if (y !== null && Number.isFinite(y)) measured.push({ config: id, levels, kind: kinds[i]!, input: i, y });
    });
  }
  const configIds = [...new Set(measured.map((r) => r.config))];
  if (measured.length === 0) throw new RangeError("fitSurrogate: the state has no rows. The fit needs a score of 2 configs or more.");
  if (configIds.length < 2) throw new RangeError(`fitSurrogate: the state has rows of ${configIds.length} config. The folds need 2 configs or more.`);
  const foldKey = (r: { config: string; input: number }): string => (foldBy === "config" ? r.config : state.inputs[r.input]!);
  const foldKeys = [...new Set(measured.map(foldKey))];
  if (foldKeys.length < 2) throw new RangeError(`fitSurrogate: the state has rows of ${foldKeys.length} ${foldBy}. The folds need 2 or more.`);

  // The categorical blocks, the pairs of blocks and the numeric params, in this order after the intercept.
  const blocks: Block[] = [];
  let width = 1;
  const addBlock = (name: string, levels: readonly string[]): void => {
    blocks.push({ name, levels, index: new Map(levels.map((l, k) => [l, k])), offset: width });
    width += levels.length;
  };
  groups.forEach((g, k) => addBlock(g.name, groupLevels(g, space, new Set(measured.map((r) => r.levels[k]!)))));
  addBlock(KIND_FACTOR, [...new Set(kinds)].sort());
  // The cells of the coverage are the blocks of the groups and the kind. The blocks of the input features come after them.
  const cellBlocks = blocks.length;
  const measuredInputs = [...new Set(measured.map((r) => r.input))].sort((a, b) => a - b);
  const featureOf = (input: number, dim: string): string => featureRows[input]![dim] ?? "-";
  const inputFeatures = [...new Set(measuredInputs.flatMap((i) => Object.keys(featureRows[i]!)))]
    .sort()
    .filter((dim) => new Set(measuredInputs.map((i) => featureOf(i, dim))).size >= 2);
  for (const dim of inputFeatures) addBlock(FEATURE_PREFIX + dim, [...new Set(measuredInputs.map((i) => featureOf(i, dim)))].sort());
  const pairs: { a: number; b: number; offset: number }[] = [];
  const addPair = (a: number, b: number): void => {
    pairs.push({ a, b, offset: width });
    width += blocks[a]!.levels.length * blocks[b]!.levels.length;
  };
  for (let a = 0; a < cellBlocks; a++) for (let b = a + 1; b < cellBlocks; b++) addPair(a, b);
  if (featurePairs) for (let a = 0; a < groups.length; a++) for (let b = cellBlocks; b < blocks.length; b++) addPair(a, b);
  // The kind block is the last block of the cells.
  if (featureKindPairs) for (let b = cellBlocks; b < blocks.length; b++) addPair(cellBlocks - 1, b);
  const params: Param[] = [];
  for (const stage of space.stages) {
    for (const option of stage.options) {
      for (const p of option.params ?? []) {
        if (p.kind !== "int" && p.kind !== "real") continue;
        const xs: number[] = [];
        for (const r of measured) {
          const c = state.configs[r.config]!.config.stages[stage.name];
          const v = c?.option === option.id ? paramValue(c.params, p.name, p.default) : undefined;
          if (v !== undefined) xs.push(v);
        }
        const s = xs.length >= 2 ? sd(xs) : 0;
        if (s > 0) params.push({ stage: stage.name, option: option.id, name: p.name, mean: mean(xs), sd: s, fallback: p.default, feature: width++ });
      }
    }
  }

  /** This function gives the sparse features of a config with its group levels on an input of a board kind. A level out of a block gives no feature of it. */
  const encode = (config: StrategyConfig, levels: readonly string[], kind: string, input: number | undefined): { idx: number[]; val: number[] } => {
    const features = input === undefined ? inputFeatures.map(() => "") : inputFeatures.map((dim) => featureOf(input, dim));
    const at = [...levels, kind, ...features].map((l, k) => blocks[k]!.index.get(l));
    const idx = [0];
    const val = [1];
    at.forEach((l, k) => {
      if (l === undefined) return;
      idx.push(blocks[k]!.offset + l);
      val.push(1);
    });
    for (const p of pairs) {
      const la = at[p.a];
      const lb = at[p.b];
      if (la === undefined || lb === undefined) continue;
      idx.push(p.offset + la * blocks[p.b]!.levels.length + lb);
      val.push(1);
    }
    for (const p of params) {
      const c = config.stages[p.stage];
      const v = c?.option === p.option ? paramValue(c.params, p.name, p.fallback) : undefined;
      if (v === undefined) continue;
      idx.push(p.feature);
      val.push((v - p.mean) / p.sd);
    }
    return { idx, val };
  };
  const rows: Row[] = measured.map((r) => ({ config: r.config, cell: JSON.stringify([...r.levels, r.kind]), y: r.y, ...encode(state.configs[r.config]!.config, r.levels, r.kind, r.input) }));

  // The normal equations of each fold. The fit without fold `f` uses the sums of all rows minus the sums of fold `f`.
  const foldOf: Record<string, number> = {};
  for (const id of foldKeys) foldOf[id] = surrogateFold(id, seed, folds);
  const rowFold = measured.map((r) => foldOf[foldKey(r)]!);
  const gram = Array.from({ length: folds }, () => new Float64Array(width * width));
  const moment = Array.from({ length: folds }, () => new Float64Array(width));
  const counts = new Array<number>(folds).fill(0);
  const total = new Float64Array(width * width);
  const totalMoment = new Float64Array(width);
  for (const [k, r] of rows.entries()) {
    const f = rowFold[k]!;
    counts[f]!++;
    const g = gram[f]!;
    const m = moment[f]!;
    for (let a = 0; a < r.idx.length; a++) {
      m[r.idx[a]!]! += r.val[a]! * r.y;
      for (let b = 0; b < r.idx.length; b++) g[r.idx[a]! * width + r.idx[b]!]! += r.val[a]! * r.val[b]!;
    }
  }
  for (let f = 0; f < folds; f++) {
    for (let k = 0; k < total.length; k++) total[k]! += gram[f]![k]!;
    for (let k = 0; k < width; k++) totalMoment[k]! += moment[f]![k]!;
  }
  const solve = (lambda: number, without: number | null): Float64Array => {
    const a = Float64Array.from(total);
    const b = Float64Array.from(totalMoment);
    if (without !== null) {
      for (let k = 0; k < a.length; k++) a[k]! -= gram[without]![k]!;
      for (let k = 0; k < width; k++) b[k]! -= moment[without]![k]!;
    }
    for (let k = 1; k < width; k++) a[k * width + k]! += lambda;
    return solvePositive(a, b, width);
  };

  const ys = rows.map((r) => r.y);
  const yMean = mean(ys);
  const sst = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const heldOut = lambdas.map((lambda) => {
    const out = new Float64Array(rows.length);
    for (let f = 0; f < folds; f++) {
      if (counts[f] === 0) continue;
      if (counts[f] === rows.length) throw new RangeError(`fitSurrogate: fold ${f} holds all rows. Use another seed, more folds or more keys.`);
      const beta = solve(lambda, f);
      rows.forEach((r, k) => {
        if (rowFold[k] === f) out[k] = predict(beta, r.idx, r.val);
      });
    }
    const sse = rows.reduce((s, r, k) => s + (r.y - out[k]!) ** 2, 0);
    return { lambda, sse, out };
  });
  const best = heldOut.reduce((a, b) => (b.sse < a.sse ? b : a));
  const lambdaAtEdge = lambdas.length >= 2 && (best.lambda === Math.min(...lambdas) || best.lambda === Math.max(...lambdas));
  const r2Of = (sse: number): number => (sst > 0 ? 1 - sse / sst : 0);
  const rmseOf = (sse: number): number => Math.sqrt(sse / rows.length);

  // The held-out error of each cell with rows. The other cells count as not covered.
  const byCell = new Map<string, { n: number; sse: number; ys: number[] }>();
  rows.forEach((r, k) => {
    const c = byCell.get(r.cell) ?? { n: 0, sse: 0, ys: [] };
    c.n++;
    c.sse += (r.y - best.out[k]!) ** 2;
    c.ys.push(r.y);
    byCell.set(r.cell, c);
  });
  const cellErrors: SurrogateCell[] = [...byCell.entries()].map(([key, c]) => {
    const levels = JSON.parse(key) as string[];
    const rmse = Math.sqrt(c.sse / c.n);
    const m = mean(c.ys);
    const floor = Math.sqrt(c.ys.reduce((s, y) => s + (y - m) ** 2, 0) / c.n);
    const ratio = rmse / Math.max(floor, minFloor);
    return { levels: Object.fromEntries(blocks.slice(0, cellBlocks).map((b, k) => [b.name, levels[k]!])), rows: c.n, rmse, floor, ratio, skill: 1 - ratio ** 2, covered: c.n >= minRows && ratio <= floorRatio };
  });
  cellErrors.sort((a, b) => b.rmse - a.rmse || JSON.stringify(a.levels).localeCompare(JSON.stringify(b.levels)));
  const cellCount = blocks.slice(0, cellBlocks).reduce((s, b) => s * b.levels.length, 1);
  const covered = cellErrors.filter((c) => c.covered).length;
  const eligible = cellErrors.filter((c) => c.rows >= minRows);
  const medianRatio = eligible.length > 0 ? median(eligible.map((c) => c.ratio)) : Number.NaN;
  const skills = eligible.map((c) => c.skill);
  const skillAt = (p: number): number => (skills.length > 0 ? quantile(skills, p) : Number.NaN);
  const skill: SurrogateSkill = { q10: skillAt(0.1), median: skillAt(0.5), q90: skillAt(0.9) };

  // The fit on all rows gives the in-sample skill of the same cells and the Sobol indices.
  const beta = solve(best.lambda, null);
  const inSse = new Map<string, number>();
  for (const r of rows) inSse.set(r.cell, (inSse.get(r.cell) ?? 0) + (r.y - predict(beta, r.idx, r.val)) ** 2);
  const inSkills = [...byCell.entries()]
    .filter(([, c]) => c.n >= minRows)
    .map(([key, c]) => {
      const m = mean(c.ys);
      const floor = Math.sqrt(c.ys.reduce((s, y) => s + (y - m) ** 2, 0) / c.n);
      return 1 - Math.sqrt(inSse.get(key)! / c.n) ** 2 / Math.max(floor, minFloor) ** 2;
    });
  const inSkillAt = (p: number): number => (inSkills.length > 0 ? quantile(inSkills, p) : Number.NaN);
  const inSampleSkill: SurrogateSkill = { q10: inSkillAt(0.1), median: inSkillAt(0.5), q90: inSkillAt(0.9) };

  // Each group of the Sobol indices is the stage of the space that it reads, with the params of the stage.
  const { design, configs } = saltelliDesign(space, draws, deriveSeed(seed, "sobol"), "1970-01-01");
  const stages = groups.map((g) => {
    if (g.stage === undefined || !design.stages.includes(g.stage)) throw new RangeError(`fitSurrogate: the group ${g.name} is not one stage of the space ${space.engine}.`);
    return g.stage;
  });
  // Without input features, the last factor draws a board kind. With them, it draws one measured input, with its kind and its features.
  const observed: { kind: string; input: number | undefined }[] =
    inputFeatures.length === 0
      ? [...new Set(measured.map((r) => r.kind))].sort().map((kind) => ({ kind, input: undefined }))
      : measuredInputs.map((input) => ({ kind: kinds[input]!, input }));
  const draw = random(deriveSeed(seed, "kinds"));
  const f = (id: string, at: { kind: string; input: number | undefined }): number => {
    const config = configs[id]!;
    const e = encode(config, groups.map((g) => g.of(config)), at.kind, at.input);
    return predict(beta, e.idx, e.val);
  };
  const responses = design.rows.map((row) => {
    const ka = draw.pick(observed);
    const kb = draw.pick(observed);
    return { a: f(row.a, ka), b: f(row.b, kb), ab: [...stages.map((s) => f(row.ab[s]!, ka)), f(row.a, kb)] };
  });
  const names = [...groups.map((g) => g.name), inputFeatures.length === 0 ? KIND_FACTOR : INPUT_FACTOR];
  const factors = saltelliIndices(responses).map((x, k) => ({ name: names[k]!, first: x.first, total: x.total }));

  return {
    rows: rows.length,
    configs: configIds.length,
    features: width,
    inputFeatures,
    featurePairs,
    featureKindPairs,
    folds,
    foldBy,
    seed,
    lambda: best.lambda,
    lambdaAtEdge,
    lambdas: heldOut.map((h) => ({ lambda: h.lambda, r2: r2Of(h.sse), rmse: rmseOf(h.sse) })),
    r2: r2Of(best.sse),
    rmse: rmseOf(best.sse),
    cells: {
      total: cellCount,
      withRows: byCell.size,
      eligible: eligible.length,
      covered,
      empty: cellCount - byCell.size,
      share: byCell.size > 0 ? covered / byCell.size : 0,
      medianRatio,
      skill,
      inSampleSkill,
      floorRatio,
      minRows,
      minFloor,
    },
    cellErrors,
    sobol: { draws: design.rows.length, factors },
    foldOf,
  };
}

/** This function gives the Markdown report of a result of `fitSurrogate`, with the `worst` cells of the largest RMSE. */
export function surrogateMarkdown(result: Surrogate, worst = 10): string {
  const f = (v: number): string => v.toFixed(3);
  const c = result.cells;
  return [
    `The surrogate: ${result.rows} rows of ${result.configs} configs, ${result.features} features, ${result.folds} folds by ${result.foldBy}, seed ${result.seed}.`,
    "",
    result.inputFeatures.length === 0
      ? "The fit has no input features."
      : `The fit has ${result.inputFeatures.length} input features: ${result.inputFeatures.join(", ")}. ${result.featurePairs ? "It also has their products with the groups." : "It has no products of them with the groups."}${result.featureKindPairs ? " It also has their products with the board kind." : ""}`,
    "",
    `The penalty λ = ${result.lambda}. The held-out R² is ${f(result.r2)}, and the held-out RMSE is ${f(result.rmse)}.${result.lambdaAtEdge ? " λ is at an edge of the list, so a value out of the list can give a smaller error." : ""}`,
    "",
    `Space coverage: ${c.covered} of the ${c.withRows} cells with rows (${(100 * c.share).toFixed(1)}%). ${c.eligible} cells have ${c.minRows} rows or more. The space has ${c.total} cells, and ${c.empty} have no rows.`,
    "",
    `A covered cell has ${c.minRows} rows or more and a held-out RMSE of at most ${c.floorRatio} times its floor (at least ${c.minFloor}). The median ratio of RMSE to floor is ${f(c.medianRatio)}.`,
    "",
    `The skill inside the cells, 1 - (RMSE / floor)², over the ${c.eligible} cells with ${c.minRows} rows or more: median ${f(c.skill.median)}, q10 ${f(c.skill.q10)}, q90 ${f(c.skill.q90)}. The fit on all rows gives the in-sample skill: median ${f(c.inSampleSkill.median)}, q10 ${f(c.inSampleSkill.q10)}, q90 ${f(c.inSampleSkill.q90)}.`,
    "",
    "| λ | Held-out R² | Held-out RMSE |",
    "|---|---|---|",
    ...result.lambdas.map((l) => `| ${l.lambda} | ${f(l.r2)} | ${f(l.rmse)} |`),
    "",
    `The Sobol indices of the surrogate, from ${result.sobol.draws} rows of a Saltelli design:`,
    "",
    "| Factor | First | Total |",
    "|---|---|---|",
    ...result.sobol.factors.map((x) => `| ${x.name} | ${f(x.first)} | ${f(x.total)} |`),
    "",
    `The ${Math.min(worst, result.cellErrors.length)} cells with the largest held-out RMSE:`,
    "",
    "| Cell | Rows | RMSE | Floor | Ratio | Skill |",
    "|---|---|---|---|---|---|",
    ...result.cellErrors.slice(0, worst).map((e) => `| ${Object.values(e.levels).join(" · ")} | ${e.rows} | ${f(e.rmse)} | ${f(e.floor)} | ${f(e.ratio)} | ${f(e.skill)} |`),
    "",
  ].join("\n");
}

/** This function gives the option `features` of `fitSurrogate` from a manifest: the cell of each input, with each value as a string. */
export function manifestFeatures(manifest: Pick<JointManifest, "inputs">): (inputId: string) => Readonly<Record<string, string>> | undefined {
  const cells = new Map(manifest.inputs.map((e) => [e.id, Object.fromEntries(Object.entries(e.cell).map(([k, v]) => [k, String(v)]))]));
  return (inputId) => cells.get(inputId);
}

/** The schema of a record of the trend of the coverage surrogate. */
export const SURROGATE_TREND_SCHEMA = "surrogate-trend/1";

/**
 * The variant of the fit of the trend. Both variants have the feature blocks of the manifest and folds by input.
 * The variant `blocks` is the main line of the nightly trend. The variant `pairs` also has the products of the groups with the features, and a weekly job fits it.
 */
export type SurrogateVariant = "blocks" | "pairs";

/** The quantiles of a skill in a trend record. A value is `null` when the fit has no cells with `minRows` rows or more. */
export interface SurrogateTrendSkill {
  readonly q10: number | null;
  readonly median: number | null;
  readonly q90: number | null;
}

/** The facts of a trend record that the fit does not give. */
export interface SurrogateTrendMeta {
  /** The epoch of the state. */
  readonly epoch: string;
  /** The date of the last night of the state. */
  readonly night: string;
  readonly variant: SurrogateVariant;
  /** The id of the CI run of the fit. An empty or missing id gives a record without `run`. */
  readonly run?: string | undefined;
}

/** One record of the trend of the coverage surrogate (`docs/SWEEP.md`, "The trend"). The nightly sweep appends one record of the variant `blocks` to `surrogate-trend.jsonl`. */
export interface SurrogateTrendRecord {
  readonly schema: typeof SURROGATE_TREND_SCHEMA;
  readonly epoch: string;
  readonly night: string;
  readonly variant: SurrogateVariant;
  readonly run?: string;
  readonly foldBy: SurrogateFoldBy;
  readonly rows: number;
  readonly configs: number;
  /** The held-out skill inside the cells: the main line of the trend. */
  readonly skill: SurrogateTrendSkill;
  /** The in-sample skill of the same cells. */
  readonly inSampleSkill: SurrogateTrendSkill;
  readonly covered: number;
  readonly share: number;
  readonly withRows: number;
  readonly eligible: number;
  readonly lambda: number;
  readonly lambdaAtEdge: boolean;
}

/**
 * This function gives the options of `fitSurrogate` for a variant of the trend.
 * Both variants have the feature blocks of the manifest and folds by input. The variant `pairs` also has the pairs.
 */
export function surrogateTrendOptions(variant: SurrogateVariant, manifest: Pick<JointManifest, "inputs">): SurrogateOptions {
  if (variant !== "blocks" && variant !== "pairs") throw new RangeError(`surrogateTrendOptions: the variant is blocks or pairs, not ${String(variant)}.`);
  return { features: manifestFeatures(manifest), foldBy: "input", featurePairs: variant === "pairs" };
}

/** This function gives the trend record of a result of `fitSurrogate`. A skill of NaN becomes `null`, so the JSON line keeps the gap explicit. */
export function surrogateTrendRecord(result: Surrogate, meta: SurrogateTrendMeta): SurrogateTrendRecord {
  const value = (v: number): number | null => (Number.isFinite(v) ? v : null);
  const skill = (s: SurrogateSkill): SurrogateTrendSkill => ({ q10: value(s.q10), median: value(s.median), q90: value(s.q90) });
  const c = result.cells;
  return {
    schema: SURROGATE_TREND_SCHEMA,
    epoch: meta.epoch,
    night: meta.night,
    variant: meta.variant,
    ...(meta.run === undefined || meta.run === "" ? {} : { run: meta.run }),
    foldBy: result.foldBy,
    rows: result.rows,
    configs: result.configs,
    skill: skill(c.skill),
    inSampleSkill: skill(c.inSampleSkill),
    covered: c.covered,
    share: c.share,
    withRows: c.withRows,
    eligible: c.eligible,
    lambda: result.lambda,
    lambdaAtEdge: result.lambdaAtEdge,
  };
}
