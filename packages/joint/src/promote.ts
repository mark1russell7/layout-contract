// The promotion test of the configs of night 1 (`docs/JOINT-BENCH.md`, roadmap item L61). The workflow `promotion.yml` starts it in CI.
// Night 1 gave the label "better" to 9 configs on the seeds 1 to 3, with `packing` 0.2.17 and `highways` 0.9.3.
// This test measures them on fresh seeds with the current engines, because each gain of night 1 belongs to its epoch.
import { configId, type LayoutRecord, type StrategyConfig } from "@mark1russell7/layout-contract";
import { mean, sd } from "@mark1russell7/rigor-statistics";
import { cellValues, hardOf, HEADLINE, indexRecords, scoreOf, type AnalysisInput, type CellValues } from "./analysis.ts";
import { compareAll, CONFIRM_GUARDS, guardRead, worseGuards, type ConfirmCompare, type ConfirmGuard } from "./confirm.ts";
import { planJobs, type NightPlan, type PlanOptions } from "./night.ts";
import { configLabel, configRun, JOINT_SPACE } from "./space.ts";
import { baselineIds, INCUMBENT, SWEEP_LEVEL, SWEEP_TIE, type SweepInput, type SweepJob } from "./sweep.ts";

/** The seeds of the promotion test. The seeds 1 to 3 chose the configs, and the confirmation of L40 holds the seeds 4 to 6. */
export const PROMOTE_SEEDS: readonly number[] = Object.freeze([7, 8, 9, 10, 11]);

/** One config of night 1: its id in the state of the sweep, its mean gain of that night, and its stages. */
export interface NightConfig {
  readonly id: string;
  readonly nightGain: number;
  readonly pack: string;
  readonly mode: "max" | "sides" | "iter";
  readonly params: Readonly<Record<string, number>>;
}

/** The 9 configs with the label "better" in the state of the epoch `joint-v2_packing-0.2.17_highways-0.9.3_space-bench-2`, in the order of the state. */
export const NIGHT_CONFIGS: readonly NightConfig[] = Object.freeze([
  { id: "0811582c8ed72b63", nightGain: 0.077995, pack: "shelf-next", mode: "max", params: { passes: 3, clearance: 8, space: 6, cap: 3 } },
  { id: "fda9d52090b7e45d", nightGain: 0.062789, pack: "shelf", mode: "iter", params: { rounds: 1 } },
  { id: "7d8750258d30d3f5", nightGain: 0.058135, pack: "rows", mode: "sides", params: { passes: 2, clearance: 9, space: 4, cap: 11 } },
  { id: "acc014a8c485f789", nightGain: 0.105959, pack: "select", mode: "iter", params: { rounds: 3 } },
  { id: "ce77370a00eecf46", nightGain: 0.079652, pack: "maxrects-baf", mode: "max", params: { passes: 2, clearance: 10, space: 2, cap: 3 } },
  { id: "9ebaf60b688c628c", nightGain: 0.084886, pack: "shelf-best", mode: "sides", params: { passes: 1, clearance: 9, space: 4, cap: 3 } },
  { id: "f26140e836ad7771", nightGain: 0.064223, pack: "skyline", mode: "sides", params: { passes: 3, clearance: 5, space: 4, cap: 7 } },
  { id: "284978abbd2e0198", nightGain: 0.131263, pack: "maxrects-bssf", mode: "max", params: { passes: 3, clearance: 3, space: 2, cap: 2 } },
  { id: "fbfbaf22df970c18", nightGain: 0.100547, pack: "maxrects-bl", mode: "iter", params: { rounds: 1 } },
]);

/** This function gives the config of a row of `NIGHT_CONFIGS`. Each config of night 1 has the router `corners`. */
export function nightConfig(row: NightConfig): StrategyConfig {
  return {
    space: JOINT_SPACE.engine,
    stages: {
      "packing.entry": { option: row.pack, params: {} },
      "highways.router": { option: "corners", params: {} },
      "lanes.mode": { option: row.mode, params: row.params },
    },
  };
}

/** This function gives the id of the incumbent in the records of the test. */
export function incumbentId(): string {
  return configId(JOINT_SPACE, JOINT_SPACE.named![INCUMBENT]!);
}

/** The plan of the test, and the seeds that the shards use for the corpus. */
export interface PromotePlan extends NightPlan {
  readonly seeds: readonly number[];
}

/** This function gives the plan of the test: the configs of night 1 and the baseline arm on each input. The baseline arm holds the incumbent. */
export function promotePlan(inputs: readonly SweepInput[], options: PlanOptions): PromotePlan {
  const space = options.space ?? JOINT_SPACE;
  const configs: Record<string, StrategyConfig> = {};
  for (const name of Object.keys(space.named ?? {})) {
    const id = configId(space, space.named![name]!);
    if (baselineIds(space).includes(id)) configs[id] = space.named![name]!;
  }
  for (const row of NIGHT_CONFIGS) configs[row.id] = nightConfig(row);
  const jobs: SweepJob[] = Object.keys(configs).flatMap((config) => inputs.map((i) => ({ config, input: i.id })));
  return { ...planJobs(1, jobs, configs, 0, inputs, options), seeds: PROMOTE_SEEDS };
}

/** One measure in the units of a reader of a layout. */
interface UserUnit {
  readonly id: string;
  readonly label: string;
  readonly read: (record: LayoutRecord) => number | undefined;
}

/** The measures that a reader sees in a layout. The score alone is only the fill of the inputs that reach the floor. */
const USER_UNITS: readonly UserUnit[] = Object.freeze([
  { id: "fill", label: "Fill, in points", read: (r) => (r.measures["joint.fill"] === undefined ? undefined : 100 * r.measures["joint.fill"]) },
  { id: "crossings", label: "Crossings", read: (r) => r.measures["joint.straight.crossings"] },
  { id: "overlaps", label: "Overlaps", read: (r) => r.hard?.["pack.no-overlap"] },
  { id: "breaks", label: "Hard breaks", read: (r) => hardOf(r, HEADLINE.rule, HEADLINE.cap) },
]);

/** The change of one user measure, as a mean over the inputs with a record of both configs. */
export interface PromoteUnit {
  readonly id: string;
  readonly incumbent: number;
  readonly config: number;
  /** The config minus the incumbent. For a crossing, an overlap or a break, a lower value is better. */
  readonly change: number;
}

/** The result of one config of night 1 against the incumbent on the headline inputs. */
export interface PromoteRow {
  readonly config: string;
  readonly label: string;
  /** The pair id of the config, for the workflow `time-arms.yml`. */
  readonly pair: string;
  /** The mean gain of night 1, in its own epoch. */
  readonly nightGain: number;
  /** The comparison of the score, or `null` when no input has a value of both configs. */
  readonly compare: ConfirmCompare | null;
  /** The mean gain over the inputs of each seed, for each seed with a pair of values. */
  readonly seedGains: readonly number[];
  readonly seedMean: number;
  readonly seedSd: number;
  /** The comparison of the score on the stress inputs. It does not change the result. */
  readonly stress: ConfirmCompare | null;
  /** The headline inputs without a value of the config or of the incumbent. */
  readonly incomplete: number;
  readonly worseGuards: readonly ConfirmGuard[];
  /** The guards with no paired value. A guard that nothing reads is not a clean guard. */
  readonly unreadGuards: readonly string[];
  /** The changes in the units of a reader of a layout. */
  readonly units: readonly PromoteUnit[];
  /** True when the gain of the score is larger than the A/A spread of the score. */
  readonly overAa: boolean;
  readonly passed: boolean;
}

/** The spread of the incumbent against itself. No config changes between the two sides, and only the seed changes. */
export interface PromoteAa {
  /** The count of the pairs of seeds. */
  readonly pairs: number;
  /** The largest absolute mean difference of the score over the pairs of seeds. */
  readonly score: number;
  /** The same spread for each user measure, by its id. */
  readonly units: Readonly<Record<string, number>>;
}

/** The result of the promotion test. */
export interface PromoteReport {
  readonly schema: "joint-promotion/1";
  readonly seeds: readonly number[];
  readonly tie: number;
  readonly level: number;
  readonly incumbent: string;
  readonly headlineInputs: number;
  readonly stressInputs: number;
  readonly aa: PromoteAa;
  readonly rows: readonly PromoteRow[];
  /** The configs that pass. Each one still needs the time verdict of `time-arms.yml` before it replaces the default. */
  readonly passed: readonly string[];
}

/** This function gives the mean gain of `b` over `a` on the inputs of each seed. A seed with no pair of values gives no gain. */
function seedGainsOf(cell: CellValues, inputs: readonly AnalysisInput[], a: string, b: string): number[] {
  const seeds = [...new Set(inputs.map((i) => i.seed))].sort((x, y) => x - y);
  return seeds.flatMap((seed) => {
    const both = inputs.filter((i) => i.seed === seed && cell.values.get(i.id)?.has(a) === true && cell.values.get(i.id)?.has(b) === true);
    return both.length === 0 ? [] : [mean(both.map((i) => scoreOf(cell, i.id, b) - scoreOf(cell, i.id, a)))];
  });
}

/**
 * This function gives the A/A spread of a value of the incumbent: the largest absolute mean difference between two seeds.
 * Each difference is paired on its spec. A pair of seeds with no spec in common gives no difference.
 */
export function aaSpread(inputs: readonly AnalysisInput[], valueOf: (input: AnalysisInput) => number | undefined): number {
  const seeds = [...new Set(inputs.map((i) => i.seed))].sort((x, y) => x - y);
  const bySpec = new Map<string, Map<number, number>>();
  for (const input of inputs) {
    const value = valueOf(input);
    if (value === undefined) continue;
    const at = bySpec.get(input.spec) ?? new Map<number, number>();
    at.set(input.seed, value);
    bySpec.set(input.spec, at);
  }
  let spread = 0;
  for (const [i, a] of seeds.entries()) {
    for (const b of seeds.slice(i + 1)) {
      const diffs = [...bySpec.values()].flatMap((at) => {
        const x = at.get(a);
        const y = at.get(b);
        return x === undefined || y === undefined ? [] : [x - y];
      });
      if (diffs.length > 0) spread = Math.max(spread, Math.abs(mean(diffs)));
    }
  }
  return spread;
}

/** This function gives the record of each input of a config. */
function recordsOf(records: readonly LayoutRecord[], config: string): Map<string, LayoutRecord> {
  return new Map(records.filter((r) => r.strategy === config).map((r) => [r.input, r]));
}

/** This function gives the changes of a config in the user measures, over the inputs with a value of both configs. */
function unitsOf(inputs: readonly AnalysisInput[], base: Map<string, LayoutRecord>, other: Map<string, LayoutRecord>): PromoteUnit[] {
  return USER_UNITS.map((unit) => {
    const pairs = inputs.flatMap((input) => {
      const a = base.get(input.id);
      const b = other.get(input.id);
      const x = a === undefined ? undefined : unit.read(a);
      const y = b === undefined ? undefined : unit.read(b);
      return x === undefined || y === undefined ? [] : [[x, y] as const];
    });
    const incumbent = pairs.length === 0 ? 0 : mean(pairs.map((p) => p[0]));
    const config = pairs.length === 0 ? 0 : mean(pairs.map((p) => p[1]));
    return { id: unit.id, incumbent, config, change: config - incumbent };
  });
}

/**
 * This function gives the comparison of each pair, or `null` for a pair with no value on the inputs.
 * A stopped shard can lose each record of a config. That config is then incomplete, and the report of the other configs stays.
 * The Holm family stays the list of the pairs, so a lost config does not relax the test of the others.
 */
function compareRead(cell: CellValues, inputs: readonly AnalysisInput[], pairs: readonly (readonly [string, string])[]): (ConfirmCompare | null)[] {
  const read = pairs.filter(([a, b]) => inputs.some((i) => cell.values.get(i.id)?.has(a) === true && cell.values.get(i.id)?.has(b) === true));
  const compares = compareAll(cell, inputs, read, pairs.length);
  return pairs.map((pair) => {
    const at = read.indexOf(pair);
    return at < 0 ? null : compares[at]!;
  });
}

/** This function gives the score cell of a scope of inputs. */
function cellOfScope(records: readonly LayoutRecord[], inputs: readonly AnalysisInput[]): CellValues {
  return cellValues(indexRecords(records), inputs, HEADLINE.rule, HEADLINE.cap);
}

/**
 * This function gives the result of the test. The rule comes before the run. A config passes when:
 * - Each headline input has a value of the config and of the incumbent.
 * - Its score is better than the score of the incumbent, with the Holm correction over the configs.
 * - No guard is worse against the incumbent, and each guard has values.
 * - Its gain is larger than the A/A spread of the score.
 */
export function promoteConfigs(
  records: readonly LayoutRecord[],
  inputs: readonly AnalysisInput[],
  rows: readonly NightConfig[] = NIGHT_CONFIGS,
  incumbent: string = incumbentId(),
): PromoteReport {
  const headline = inputs.filter((i) => i.stress !== true);
  const stress = inputs.filter((i) => i.stress === true);
  const ids = new Set(headline.map((i) => i.id));
  const live = records.filter((r) => r.skipped === undefined);
  const headlineRecords = live.filter((r) => ids.has(r.input));
  const cell = cellOfScope(headlineRecords, headline);
  const stressIds = new Set(stress.map((i) => i.id));
  const stressCell = cellOfScope(live.filter((r) => stressIds.has(r.input)), stress);
  const pairs = rows.map((row) => [incumbent, row.id] as const);
  const compares = compareRead(cell, headline, pairs);
  const stressCompares = compareRead(stressCell, stress, pairs);
  const base = recordsOf(headlineRecords, incumbent);
  const seedCount = new Set(headline.map((i) => i.seed)).size;
  const aa: PromoteAa = {
    pairs: (seedCount * (seedCount - 1)) / 2,
    score: aaSpread(headline, (i) => (cell.values.get(i.id)?.has(incumbent) === true ? scoreOf(cell, i.id, incumbent) : undefined)),
    units: Object.fromEntries(
      USER_UNITS.map((unit) => {
        const read = (i: AnalysisInput): number | undefined => {
          const r = base.get(i.id);
          return r === undefined ? undefined : unit.read(r);
        };
        return [unit.id, aaSpread(headline, read)];
      }),
    ),
  };
  const out = rows.map((row, i): PromoteRow => {
    const compare = compares[i] ?? null;
    const seedGains = seedGainsOf(cell, headline, incumbent, row.id);
    const incomplete = headline.filter((input) => [row.id, incumbent].some((c) => cell.values.get(input.id)?.has(c) !== true)).length;
    const worse = worseGuards(headlineRecords, incumbent, row.id);
    const unreadGuards = CONFIRM_GUARDS.filter((g) => !guardRead(headlineRecords, g, incumbent, row.id)).map((g) => g.id);
    const config = nightConfig(row);
    const overAa = compare !== null && compare.mean > aa.score;
    return {
      config: row.id,
      label: configLabel(config),
      pair: configRun(config).pair,
      nightGain: row.nightGain,
      compare,
      seedGains,
      seedMean: seedGains.length === 0 ? 0 : mean(seedGains),
      seedSd: seedGains.length < 2 ? 0 : sd(seedGains),
      stress: stressCompares[i] ?? null,
      incomplete,
      worseGuards: worse,
      unreadGuards,
      units: unitsOf(headline, base, recordsOf(headlineRecords, row.id)),
      overAa,
      passed: incomplete === 0 && compare?.better === true && worse.length === 0 && unreadGuards.length === 0 && overAa,
    };
  });
  return {
    schema: "joint-promotion/1",
    seeds: PROMOTE_SEEDS,
    tie: SWEEP_TIE,
    level: SWEEP_LEVEL,
    incumbent,
    headlineInputs: headline.length,
    stressInputs: stress.length,
    aa,
    rows: out,
    passed: out.filter((r) => r.passed).map((r) => r.config),
  };
}

/** This function gives a number with 3 decimals and a sign. */
const signed = (x: number): string => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;

/** This function gives the cell of a user measure of a row. */
const unitCell = (row: PromoteRow, id: string): string => {
  const unit = row.units.find((u) => u.id === id);
  return unit === undefined ? "n/a" : `${unit.config.toFixed(2)} (${unit.change >= 0 ? "+" : ""}${unit.change.toFixed(2)})`;
};

/** This function gives the text of the result. */
export function promoteMarkdown(report: PromoteReport): string {
  return [
    `# The promotion test of the configs of night 1: ${report.passed.length} of ${report.rows.length} pass`,
    "",
    `The seeds are ${report.seeds.join(", ")}. The test has ${report.headlineInputs} headline inputs and ${report.stressInputs} stress inputs. A config that passes still needs the time verdict of \`time-arms.yml\`.`,
    "",
    "| Config | Night 1 | Gain | Interval | Seed mean | Seed SD | Holm p | Worse guards | Incomplete | Passes |",
    "|---|---:|---:|---|---:|---:|---:|---:|---:|---|",
    ...report.rows.map(
      (r) =>
        `| \`${r.label}\` | ${signed(r.nightGain)} | ${r.compare === null ? "n/a" : signed(r.compare.mean)} | ${r.compare === null ? "n/a" : `[${signed(r.compare.lo)}, ${signed(r.compare.hi)}]`} | ${signed(r.seedMean)} | ${r.seedSd.toFixed(3)} | ${r.compare === null ? "n/a" : r.compare.adjusted.toFixed(4)} | ${r.worseGuards.length} | ${r.incomplete} | ${r.passed ? "yes" : "no"} |`,
    ),
    "",
    `The A/A spread of the score is ${report.aa.score.toFixed(3)}, the largest difference of the incumbent with itself over ${report.aa.pairs} pairs of seeds. A gain under that spread is not a claim. The A/A pair of \`time-arms.yml\` gives the floor of the times.`,
    "",
    "## The gains in the units of a reader",
    "",
    "Each cell gives the mean for each layout, and the change against the incumbent.",
    "",
    `| Config | ${USER_UNITS.map((u) => u.label).join(" | ")} |`,
    `|---${USER_UNITS.map(() => "|---:").join("")}|`,
    `| The A/A spread | ${USER_UNITS.map((u) => (report.aa.units[u.id] ?? 0).toFixed(2)).join(" | ")} |`,
    ...report.rows.map((r) => `| \`${r.label}\` | ${USER_UNITS.map((u) => unitCell(r, u.id)).join(" | ")} |`),
    "",
    "## The stress inputs",
    "",
    "| Config | Gain | Label |",
    "|---|---:|---|",
    ...report.rows.map((r) => `| \`${r.label}\` | ${r.stress === null ? "n/a" : signed(r.stress.mean)} | ${r.stress?.label ?? "n/a"} |`),
    "",
    "## The worse guards",
    "",
    "| Config | Measure | Mean | n |",
    "|---|---|---:|---:|",
    ...report.rows.flatMap((r) => r.worseGuards.map((g) => `| \`${r.label}\` | ${g.measure} | ${signed(g.mean)} | ${g.n} |`)),
    "",
  ].join("\n");
}
