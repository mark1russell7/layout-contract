// The records of a joint run as a record `response-records/1` of `@mark1russell7/rigor-statistics` (roadmap item L104).
// Each record is one point. The points of one spec are one group, so a fold of the fit holds out a whole spec.
// A pair that the run did not measure stays a point, with the reason for each absent measure.

import {
  fitResponse,
  RESPONSE_MAX_TERMS,
  RESPONSE_RECORDS_SCHEMA,
  type ResponseData,
  type ResponseDimension,
  type ResponseFactor,
  type ResponseMeasure,
  type ResponsePoint,
  type ResponseReason,
  type ResponseRecord,
} from "@mark1russell7/rigor-statistics";
import type { JointManifest } from "./corpus.ts";

/** The fields of a joint record that this file reads. */
export interface JointResponseRow {
  readonly strategy: string;
  readonly input: string;
  readonly options: { readonly pack: string; readonly router: string };
  readonly measures: Readonly<Record<string, number>>;
  readonly skipped?: string;
}

/** One measure of the record, with the scale of its fit. */
interface MeasureSpec extends ResponseMeasure {
  readonly log?: true;
}

/** The measures of the record. The range of a share is in `measureOf`, because a value out of the range is a fault of the record. */
export const RESPONSE_MEASURES: readonly MeasureSpec[] = [
  { id: "joint.fill", label: "fill", unit: "", direction: "higher", range: [0, 1] },
  { id: "joint.spill", label: "spill", unit: "", direction: "lower", range: [0, 1] },
  { id: "route.crossings", label: "crossings", unit: "", direction: "lower", log: true },
  { id: "route.detour.mean", label: "mean detour", unit: "", direction: "lower" },
  { id: "joint.ms", label: "time", unit: "ms", direction: "lower", log: true },
];

/** On a log scale, each smaller value takes this value. A count of 0 crossings thus has a value that a logarithm can read. */
export const RESPONSE_LOG_FLOOR = 0.5;

/** The ids of the dimensions of the arms. A cell of a corpus cannot use them. */
const PACK = "pack";
const ROUTER = "router";

/** The id of the dimension of the count of boxes. Its levels are numbers on a log scale. */
const COUNT = "count";

/** The reasons of the records that have no measures. The bench writes the text on the left. */
const SKIP_REASONS: Readonly<Record<string, ResponseReason>> = {
  "over budget": { id: "over-budget", label: "The pair passed the time budget" },
  "not run: over budget on this input": { id: "not-run", label: "Not run: two other pairs of the router passed the budget on this input" },
};

/** The reason of any other record that has no measures. */
const OTHER_SKIP: ResponseReason = { id: "skipped", label: "The run skipped the pair" };

/** The reason of a measure that a measured pair does not have. */
const NOT_GIVEN: ResponseReason = { id: "not-given", label: "The pair gave no value of this measure" };

/** This function gives the id of the spec of an input: the input with no seed. */
const specOf = (input: string): string => input.replace(/\/s\d+$/, "");

/** This function gives the number of a level of the count. The manifest writes 1000 as `1k`. */
function countOf(level: string): number {
  const value = level.endsWith("k") ? Number(level.slice(0, -1)) * 1000 : Number(level);
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`The count "${level}" of a cell is not a number above 0.`);
  return value;
}

/** This function gives the first `seeds` inputs of each spec, in the order of the manifest. */
function keptInputs(manifest: Pick<JointManifest, "inputs">, seeds: number): Set<string> {
  const counts = new Map<string, number>();
  const kept = new Set<string>();
  for (const { id } of manifest.inputs) {
    const count = counts.get(specOf(id)) ?? 0;
    if (count < seeds) kept.add(id);
    counts.set(specOf(id), count + 1);
  }
  return kept;
}

/** This function gives the dimension of a field of a cell. A field with one level is not a dimension, because a fit cannot read it. */
function cellDimension(field: string, levels: ReadonlySet<string>): ResponseDimension | undefined {
  if (levels.size < 2) return undefined;
  const base = { id: field, label: field, unit: "" };
  if (field === COUNT) return { ...base, kind: "ordinal", levels: [...levels].map(countOf).sort((a, b) => a - b), log: true };
  return { ...base, kind: "categorical", levels: [...levels].sort() };
}

/** This function gives the measure of the record. It keeps a stated range only when each value is in that range. */
function measureOf({ log: _log, ...spec }: MeasureSpec, values: readonly number[]): ResponseMeasure {
  if (spec.range === undefined) return spec;
  const [low, high] = spec.range;
  if (values.every((v) => v >= low && v <= high)) return spec;
  const { range: _range, ...rest } = spec;
  return rest;
}

/** The options of `jointResponseData`. */
export interface JointResponseOptions {
  /** The name of the record. The default is the name of the corpus. */
  readonly name?: string;
  /** The first seeds of each spec to keep. The default keeps each seed. */
  readonly seeds?: number;
}

/**
 * This function gives the data of a record from the records of a joint run and the manifest of its corpus.
 * A record of an input that is not in the manifest stops the function, because it is a record of another corpus.
 */
export function jointResponseData(rows: readonly JointResponseRow[], manifest: Pick<JointManifest, "corpus" | "inputs">, options: JointResponseOptions = {}): ResponseData {
  const cells = new Map(manifest.inputs.map((entry) => [entry.id, entry.cell as unknown as Readonly<Record<string, unknown>>]));
  for (const row of rows) if (!cells.has(row.input)) throw new RangeError(`The input "${row.input}" is not in the corpus ${manifest.corpus}.`);
  const kept = keptInputs(manifest, options.seeds ?? Number.POSITIVE_INFINITY);
  const points = rows.filter((row) => kept.has(row.input));
  const levels = new Map<string, Set<string>>();
  for (const input of new Set(points.map((row) => row.input))) {
    for (const [field, value] of Object.entries(cells.get(input)!)) {
      if (!levels.has(field)) levels.set(field, new Set());
      levels.get(field)!.add(String(value));
    }
  }
  for (const reserved of [PACK, ROUTER]) if (levels.has(reserved)) throw new RangeError(`A cell of the corpus ${manifest.corpus} has the field "${reserved}", the name of a dimension of the record.`);
  const cellDimensions = [...levels].flatMap(([field, values]) => cellDimension(field, values) ?? []);
  const arm = (id: string, values: readonly string[]): ResponseDimension => ({ id, label: id, unit: "", kind: "categorical", levels: [...new Set(values)].sort() });
  const measured = points.filter((row) => row.skipped === undefined);
  const measures = RESPONSE_MEASURES.filter((m) => measured.some((row) => row.measures[m.id] !== undefined));
  const used = new Map<string, ResponseReason>();
  const reasonOf = (row: JointResponseRow): ResponseReason => {
    if (row.skipped === undefined) return NOT_GIVEN;
    return SKIP_REASONS[row.skipped] ?? OTHER_SKIP;
  };
  const out = points.map((row): ResponsePoint => {
    const cell = cells.get(row.input)!;
    const values = Object.fromEntries(cellDimensions.map((d) => [d.id, d.id === COUNT ? countOf(String(cell[d.id])) : String(cell[d.id])]));
    const absent: Record<string, string> = {};
    const numbers = measures.map((m): [string, number | null] => {
      const value = row.skipped === undefined ? row.measures[m.id] : undefined;
      if (value !== undefined) return [m.id, Number(value.toPrecision(5))];
      const reason = reasonOf(row);
      used.set(reason.id, reason);
      absent[m.id] = reason.id;
      return [m.id, null];
    });
    return {
      id: `${row.strategy}|${row.input}`,
      values: { [PACK]: row.options.pack, [ROUTER]: row.options.router, ...values },
      measures: Object.fromEntries(numbers),
      group: specOf(row.input),
      ...(Object.keys(absent).length > 0 ? { absent } : {}),
    };
  });
  return {
    schema: RESPONSE_RECORDS_SCHEMA,
    name: options.name ?? manifest.corpus,
    dimensions: [arm(PACK, points.map((row) => row.options.pack)), arm(ROUTER, points.map((row) => row.options.router)), ...cellDimensions],
    measures: measures.map((m) => measureOf(m, measured.flatMap((row) => row.measures[m.id] ?? []))),
    ...(used.size > 0 ? { reasons: [...used.values()].sort((a, b) => (a.id < b.id ? -1 : 1)) } : {}),
    points: out,
  };
}

/**
 * This function gives the terms of the fit. The terms are each dimension alone, the count with each arm, then the products of a pack and a router with points.
 * The full expansion passes the limit of `fitResponse` with the arms of a cover run. A pack and a router do not add up, so their products stay.
 * When the products do not fit under the limit, the pairs with the most points stay, and the name of the pair breaks a tie. Thus a run gives one set of terms.
 *
 * @param limit - The most terms, with the intercept that `fitResponse` adds. The default is the limit of `fitResponse`.
 */
export function jointResponseTerms(data: Pick<ResponseData, "dimensions" | "points">, limit: number = RESPONSE_MAX_TERMS): ResponseFactor[][] {
  const terms: ResponseFactor[][] = [];
  const levelsOf = (id: string): readonly string[] => {
    const dimension = data.dimensions.find((d) => d.id === id);
    return dimension?.kind === "categorical" ? dimension.levels : [];
  };
  for (const dimension of data.dimensions) {
    if (dimension.kind === "categorical") for (const level of dimension.levels) terms.push([{ dimension: dimension.id, level }]);
    else terms.push([{ dimension: dimension.id, power: 1 }], [{ dimension: dimension.id, power: 2 }]);
  }
  if (data.dimensions.some((d) => d.id === COUNT)) {
    for (const id of [PACK, ROUTER]) for (const level of levelsOf(id)) terms.push([{ dimension: COUNT, power: 1 }, { dimension: id, level }]);
  }
  const seen = new Map<string, { readonly pack: string; readonly router: string; points: number }>();
  for (const point of data.points) {
    const pack = String(point.values[PACK]);
    const router = String(point.values[ROUTER]);
    const key = JSON.stringify([pack, router]);
    const pair = seen.get(key);
    if (pair === undefined) seen.set(key, { pack, router, points: 1 });
    else pair.points++;
  }
  const pairs = [...seen].sort(([a, x], [b, y]) => y.points - x.points || (a < b ? -1 : 1));
  for (const [, { pack, router }] of pairs.slice(0, Math.max(0, limit - 1 - terms.length))) {
    terms.push([{ dimension: PACK, level: pack }, { dimension: ROUTER, level: router }]);
  }
  return terms;
}

/** The options of `fitJointResponse`. */
export interface JointFitOptions {
  /** The number of folds. The default is 5. */
  readonly folds?: number;
  /** The seed of the split. The default is 1. */
  readonly seed?: number;
}

/** This function fits the data with a ridge fit over the stated terms. The record keeps the prediction of each held-out point. */
export function fitJointResponse(data: ResponseData, options: JointFitOptions = {}): ResponseRecord {
  const ids = new Set(data.measures.map((m) => m.id));
  return fitResponse(data, {
    model: "ridge",
    terms: jointResponseTerms(data),
    log: RESPONSE_MEASURES.filter((m) => m.log === true && ids.has(m.id)).map((m) => m.id),
    logFloor: RESPONSE_LOG_FLOOR,
    outOfFold: true,
    folds: options.folds ?? 5,
    seed: options.seed ?? 1,
  });
}
