import type { LayoutRecord } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import type { AnalysisInput } from "./analysis.ts";
import {
  CONFIRM_BASE,
  CONFIRM_BASELINES,
  CONFIRM_GUARDS,
  CONFIRM_INCUMBENT,
  CONFIRM_ITER2,
  CONFIRM_ITER3,
  CONFIRM_PAIRS,
  CONFIRM_PLAIN_PAIRS,
  CONFIRM_SEEDS,
  confirmDefault,
  confirmIterate,
  confirmLanes,
  confirmMarkdown,
} from "./confirm.ts";
import { jointCorpus, jointInput, jointSpecs, SET, SET_V2 } from "./corpus.ts";
import { pairRuns } from "./runner.ts";

/** The count of the made-up families. */
const FAMILIES = 12;

/** This function gives made-up inputs: 3 seeds of each family, with one more family of stress inputs. */
function madeInputs(): AnalysisInput[] {
  const out: AnalysisInput[] = [];
  for (let f = 0; f <= FAMILIES; f++) {
    const stress = f === FAMILIES;
    for (const seed of CONFIRM_SEEDS) out.push({ id: `joint-v2/made.f${f}/s${seed}`, seed, spec: `joint-v2/made.f${f}`, kind: "made", cell: {}, ...(stress ? { stress: true } : {}) });
  }
  return out;
}

/** This function gives a made-up record of a pair on an input. Each input gives each pair its own `joint.fill`, so no pair ties by chance. */
function madeRecord(pair: string, input: AnalysisInput, measures: Readonly<Record<string, number>>, ms = 10): LayoutRecord {
  const guards = Object.fromEntries(CONFIRM_GUARDS.map((g) => [g.id, 0]));
  return { strategy: pair, input: input.id, seed: input.seed, hard: {}, measures: { ...guards, ...measures }, ms } as unknown as LayoutRecord;
}

/** This function gives the records of each pair of the run, with the fill of each pair. */
function records(inputs: readonly AnalysisInput[], fills: Readonly<Record<string, number>>, extra: (pair: string) => Readonly<Record<string, number>> = () => ({})): LayoutRecord[] {
  return inputs.flatMap((input, i) => CONFIRM_PAIRS.map((pair) => madeRecord(pair, input, { "joint.fill": (fills[pair] ?? 0.5) + (i % 3) * 1e-4, ...extra(pair) })));
}

/** The fills of a clear result: the candidates tie and they are better than each other pair. */
const CLEAR = { [CONFIRM_ITER3]: 0.8, [CONFIRM_ITER2]: 0.8, [CONFIRM_INCUMBENT]: 0.7, [CONFIRM_BASE]: 0.7, "rows+portfolio": 0.5, "select+portfolio": 0.5 };

describe("the pairs of the confirmation", () => {
  it("gives the 6 pairs and no others on one input of the corpus", () => {
    // The first spec is an empty input, and an empty input has no spill. The next inputs of the list have boxes.
    const { input, entry } = jointSpecs(SET_V2).filter((s) => s.array === "fixed").map((spec) => jointInput(spec, CONFIRM_SEEDS[0]!, SET_V2)).find((made) => made.input.boxes.length > 0 && (made.input.edges?.length ?? 0) > 0)!;
    const runs = [...pairRuns(input, entry.cell, { corpus: SET_V2, lanes: confirmLanes(), iterate: confirmIterate(), pairs: CONFIRM_PLAIN_PAIRS, freeRoutes: true })];
    const strategies = runs.map((run) => run.record.strategy);
    expect([...new Set(strategies)].sort()).toEqual([...CONFIRM_PAIRS].sort());
    expect(strategies).toHaveLength(CONFIRM_PAIRS.length);
    // A guard that no record has gives no decision, so this test reads each guard on a real run.
    for (const pair of [CONFIRM_ITER2, CONFIRM_ITER3, CONFIRM_INCUMBENT]) {
      const record = runs.find((run) => run.record.strategy === pair)!.record;
      expect(CONFIRM_GUARDS.filter((g) => record.measures[g.id] === undefined).map((g) => g.id), pair).toEqual([]);
    }
  }, 60_000);

  it("uses no seed of the earlier runs", () => {
    expect(jointSpecs(SET_V2).flatMap((s) => s.seeds).filter((s) => CONFIRM_SEEDS.includes(s))).toEqual([]);
  });

  it("gives the fresh seeds in the ids of the corpus, and changes nothing without the option", () => {
    const fresh = jointCorpus(SET, { seeds: [4, 5] });
    const specs = jointSpecs(SET).length;
    expect(fresh.manifest.inputs).toHaveLength(specs * 2);
    expect(fresh.manifest.inputs.every((e) => /\/s[45]$/.test(e.id))).toBe(true);
    expect(fresh.manifest.specs.every((s) => s.seeds.join() === "4,5")).toBe(true);
    expect(jointSpecs(SET).every((s) => s.seeds.join() === "1,2,3")).toBe(true);
  }, 60_000);

  it("has each guard once, with the fill as a measure where more is better", () => {
    const ids = CONFIRM_GUARDS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONFIRM_GUARDS.find((g) => g.id === "joint.fill")?.direction).toBe("higher");
    expect(CONFIRM_GUARDS.find((g) => g.id === "pack.fill")?.direction).toBe("higher");
    expect(CONFIRM_GUARDS.find((g) => g.id === "joint.spill")?.direction).toBe("lower");
  });
});

describe("confirmDefault", () => {
  const inputs = madeInputs();

  it("confirms the faster cap on a clear result with a tie of the caps", () => {
    const report = confirmDefault(records(inputs, CLEAR), inputs);
    expect(report.chosen).toBe(CONFIRM_ITER2);
    expect(report.conditions).toEqual({
      complete: true,
      "better than rows+portfolio": true,
      "better than select+portfolio": true,
      "not worse than the incumbent": true,
      "not worse than the base pair": true,
      "no worse guard": true,
      "each guard read": true,
    });
    expect(report.confirmed).toBe(true);
    expect(report.headline.inputs).toBe(FAMILIES * 3);
    expect(report.stress.inputs).toBe(3);
    expect(report.headline.compares).toHaveLength(9);
  });

  it("keeps the cap 3 only when it is better than the cap 2", () => {
    const report = confirmDefault(records(inputs, { ...CLEAR, [CONFIRM_ITER3]: 0.9 }), inputs);
    expect(report.chosen).toBe(CONFIRM_ITER3);
    expect(report.confirmed).toBe(true);
  });

  it("does not confirm when a baseline ties with the chosen cap", () => {
    const report = confirmDefault(records(inputs, { ...CLEAR, [CONFIRM_BASELINES[1]!]: 0.8 }), inputs);
    expect(report.conditions["better than select+portfolio"]).toBe(false);
    expect(report.confirmed).toBe(false);
  });

  it("does not confirm when the chosen cap is worse than the incumbent", () => {
    const report = confirmDefault(records(inputs, { ...CLEAR, [CONFIRM_INCUMBENT]: 0.9 }), inputs);
    expect(report.conditions["not worse than the incumbent"]).toBe(false);
    expect(report.confirmed).toBe(false);
  });

  it("does not confirm when a shard lost the records of an input", () => {
    const lost = records(inputs, CLEAR).filter((r) => !(r.input === inputs[0]!.id && r.strategy === CONFIRM_ITER2));
    const report = confirmDefault(lost, inputs);
    expect(report.headline.incomplete).toBe(1);
    expect(report.conditions["complete"]).toBe(false);
    expect(report.confirmed).toBe(false);
  });

  it("counts a guard that is worse against the incumbent for the chosen cap only", () => {
    // A spill only for the cap 3: the chosen cap is the cap 2, so the guard count stays 0, and the list keeps the guard of the cap 3.
    const spill = (pair: string): Readonly<Record<string, number>> => ({ "joint.spill": pair === CONFIRM_ITER3 ? 0.2 : 0 });
    const report = confirmDefault(records(inputs, CLEAR, spill), inputs);
    expect(report.worseGuards.some((g) => g.b === CONFIRM_ITER3 && g.a === CONFIRM_INCUMBENT && g.measure === "joint.spill")).toBe(true);
    expect(report.guardCount).toBe(0);
    const chosen = confirmDefault(records(inputs, CLEAR, (pair) => ({ "joint.spill": pair === CONFIRM_ITER2 ? 0.2 : 0 })), inputs);
    expect(chosen.guardCount).toBe(1);
    expect(chosen.conditions["no worse guard"]).toBe(false);
    expect(chosen.confirmed).toBe(false);
  });

  it("does not confirm when a guard has no values", () => {
    const gone = records(inputs, CLEAR).map((r) => {
      const { "pack.area": _, ...measures } = r.measures;
      return { ...r, measures };
    });
    const report = confirmDefault(gone, inputs);
    expect(report.unreadGuards).toEqual(["pack.area"]);
    expect(report.conditions["each guard read"]).toBe(false);
    expect(report.confirmed).toBe(false);
    expect(confirmMarkdown(report)).toContain("The guards with no value: pack.area.");
  });

  it("does not use the stress inputs in the decision", () => {
    const lost = records(inputs, CLEAR).filter((r) => r.input !== inputs[inputs.length - 1]!.id);
    const report = confirmDefault(lost, inputs);
    expect(report.stress.incomplete).toBe(1);
    expect(report.confirmed).toBe(true);
  });

  it("gives the decision, the pairs and the guards in the text", () => {
    const text = confirmMarkdown(confirmDefault(records(inputs, CLEAR), inputs));
    expect(text).toContain("confirmed");
    expect(text).toContain("The seeds are 4, 5, 6.");
    for (const pair of CONFIRM_PAIRS) expect(text).toContain(pair);
    expect(text).toContain("The worse guards: 0");
  });
});
