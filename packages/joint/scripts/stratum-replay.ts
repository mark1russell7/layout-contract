// The replay of the stratum (L122 part 3b): `node scripts/stratum-replay.ts <state.json> [--share <0 to 1>] [--max-configs <n>] [--out <file>]`.
// For each night of an epoch, it samples the new configs of round 1 and round 2 again, from the configs that the state held before the round.
// - The arm "none" has no stratum. It takes as many configs as the round took. The replay checks that they are the configs of the night.
// - The arm "stratum" has round(share * taken) picks of the stratum. It takes the configs that fit the screen cost of the arm "none".
// The history of each round is the real history of the epoch, so each round of the arm "stratum" starts from the same configs as the night.
// The epoch measured only the configs of the night. A config of the arm "stratum" that the epoch did not measure has no mean.
// Thus the replay reads which alive configs stay in the arm "stratum" of their night: a lower bound on the cost of the stratum to the race.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { configId, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { jointCorpus, type JointSet } from "../src/corpus.ts";
import { optionCounts, stageFloors, STRATUM_SHARE } from "../src/option-floor.ts";
import { configRun, JOINT_SPACE } from "../src/space.ts";
import { jobCost, nightSeed, sampleConfigs, screenInputs, strataCounts, takeBudget, type SweepInput } from "../src/sweep.ts";

interface StateConfig {
  readonly config: StrategyConfig;
  readonly status: string;
  readonly first?: string;
  readonly mean?: number;
}
interface StateNight {
  readonly date: string;
  readonly seed?: number;
  readonly round1?: { readonly sampled: number };
  readonly round2?: { readonly sampled: number };
}
interface RoundRead {
  readonly round: 1 | 2;
  readonly seed: number;
  readonly taken: number;
  readonly picks: number;
  readonly budgetMinutes: number;
  readonly noneInNight: number;
  readonly stratumTaken: number;
  readonly stratumCostMinutes: number;
  readonly sameAsNone: number;
}
interface NightRead {
  readonly date: string;
  readonly seedOfState: number | undefined;
  readonly seedOfReplay: number;
  readonly actual: number;
  readonly missing: number;
  readonly rounds: readonly RoundRead[];
}
interface State {
  readonly epoch: string;
  readonly corpus: JointSet;
  readonly configs: Readonly<Record<string, StateConfig>>;
  readonly nights: readonly StateNight[];
}

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1]!.startsWith("--")));
if (!file) throw new Error("Usage: node scripts/stratum-replay.ts <state.json> [--share <0 to 1>] [--max-configs <n>] [--space-from <module>] [--out <file>]");
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const share = Number(flag("share") ?? STRATUM_SHARE);
const maxConfigs = Number(flag("max-configs") ?? 400);
const out = flag("out");
// The space of the epoch. An epoch before 2026-11-03 13:48Z has the space before PR 157, which added two pack entries but kept the version bench-3.
// `--space-from` takes a module that exports `JOINT_SPACE`, for example the file space.ts of that commit.
const spaceFrom = flag("space-from");
const space: StrategySpace = spaceFrom === undefined ? JOINT_SPACE : ((await import(pathToFileURL(resolve(spaceFrom)).href)) as { JOINT_SPACE: StrategySpace }).JOINT_SPACE;
const state = JSON.parse(readFileSync(file, "utf8")) as State;

// The screen of the sweep is seed 1 of each spec, so the corpus with seed 1 gives each input of the screen.
const { manifest, inputs } = jointCorpus(state.corpus, { seeds: [1] });
const sweepInputs: SweepInput[] = inputs.map((input, i) => {
  const entry = manifest.inputs[i]!;
  return {
    id: entry.id,
    ...(entry.hash === undefined ? {} : { hash: entry.hash }),
    spec: entry.id.replace(/\/s\d+$/, ""),
    kind: entry.id.split("/")[1]!.split(".")[0]!,
    seed: Number(/\/s(\d+)$/.exec(entry.id)![1]),
    stress: entry.stress === true,
    boxes: input.boxes.length,
    edges: input.edges?.length ?? 0,
  };
});
const screen = screenInputs(sweepInputs);
const costOf = (c: StrategyConfig): number => {
  const run = configRun(c, space);
  return screen.reduce((s, i) => s + jobCost(run, i), 0);
};
const floors = stageFloors(space);

const configOf = new Map(Object.entries(state.configs).map(([id, c]) => [id, c.config]));
const held = new Set(Object.entries(state.configs).filter(([, c]) => c.status === "baseline").map(([id]) => id));
const stratumNight = new Map<string, Set<string>>();
const nights: NightRead[] = [];
const armNone: StrategyConfig[] = [];
const armStratum: StrategyConfig[] = [];
let faithful = true;
for (const night of state.nights) {
  const actual = new Set(Object.entries(state.configs).filter(([, c]) => c.first === night.date && c.status !== "baseline").map(([id]) => id));
  const kept = new Set<string>();
  const rounds: RoundRead[] = [];
  const replayed = new Set<string>();
  for (const round of [1, 2] as const) {
    const taken = (round === 1 ? night.round1 : night.round2)?.sampled ?? 0;
    if (taken === 0) continue;
    const seed = round === 1 ? nightSeed(night.date) : nightSeed(night.date) * 2 + 1;
    const counts = strataCounts([...held].map((id) => configOf.get(id)!), space);
    const none = sampleConfigs({ n: maxConfigs, seed, known: held, counts }, space).slice(0, taken);
    const budget = none.reduce((s, c) => s + costOf(c), 0);
    const picks = Math.round(share * taken);
    const sample = sampleConfigs({ n: maxConfigs, seed, known: held, counts, stratum: { share, floors, picks } }, space);
    const strat = takeBudget(sample, costOf, budget);
    const noneIds = none.map((c) => configId(space, c));
    const stratIds = strat.taken.map((c) => configId(space, c));
    const inNight = noneIds.filter((id) => actual.has(id)).length;
    if (inNight !== noneIds.length) faithful = false;
    for (const id of stratIds) kept.add(id);
    for (const id of noneIds) replayed.add(id);
    armNone.push(...none);
    armStratum.push(...strat.taken);
    rounds.push({ round, seed, taken, picks, budgetMinutes: budget / 60000, noneInNight: inNight, stratumTaken: stratIds.length, stratumCostMinutes: strat.cost / 60000, sameAsNone: stratIds.filter((id) => noneIds.includes(id)).length });
    // The next round starts from the configs of the night, as the epoch did.
    for (const [k, id] of noneIds.entries()) {
      configOf.set(id, none[k]!);
      held.add(id);
    }
  }
  const missing = [...actual].filter((id) => !replayed.has(id)).length;
  if (missing > 0) faithful = false;
  stratumNight.set(night.date, kept);
  nights.push({ date: night.date, seedOfState: night.seed, seedOfReplay: nightSeed(night.date), actual: actual.size, missing, rounds });
}

const alive = Object.entries(state.configs)
  .filter(([, c]) => c.status === "alive")
  .sort(([a, x], [b, y]) => (y.mean ?? 0) - (x.mean ?? 0) || (a < b ? -1 : 1))
  .map(([id, c], rank) => ({ rank: rank + 1, id, first: c.first, mean: c.mean, kept: stratumNight.get(c.first ?? "")?.has(id) ?? false }));
const smallest = (configs: readonly StrategyConfig[]): Record<string, number> => {
  const by: Record<string, number> = {};
  for (const row of optionCounts(configs, space, floors)) by[row.stage] = Math.min(by[row.stage] ?? Infinity, row.count);
  return by;
};
const result = {
  schema: "stratum-replay/1",
  epoch: state.epoch,
  share,
  maxConfigs,
  floors,
  faithful,
  nights,
  alive,
  bestKept: alive[0]?.kept ?? null,
  topTenKept: alive.slice(0, 10).filter((a) => a.kept).length,
  aliveKept: alive.filter((a) => a.kept).length,
  smallestCount: { none: smallest(armNone), stratum: smallest(armStratum) },
  counts: optionCounts(armNone, space, floors).map((row, i) => ({ stage: row.stage, option: row.option, floor: row.floor, none: row.count, stratum: optionCounts(armStratum, space, floors)[i]!.count })),
};
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`epoch ${state.epoch}, share ${share}, faithful ${faithful}`);
for (const n of nights) {
  console.log(`${n.date} seed ${n.seedOfState}/${n.seedOfReplay}: ${n.actual} configs, ${n.missing} not replayed`);
  for (const r of n.rounds) console.log(`  round ${r.round}: took ${r.taken}, ${r.noneInNight} in the night; stratum took ${r.stratumTaken} (${r.picks} picks), ${r.sameAsNone} the same`);
}
console.log(`alive ${alive.length}: best kept ${result.bestKept}, top 10 kept ${result.topTenKept}, all kept ${result.aliveKept}`);
console.log(`smallest count per stage, none: ${JSON.stringify(result.smallestCount.none)}, stratum: ${JSON.stringify(result.smallestCount.stratum)}`);
