// The memory gate of L81: the probe inputs cover each family of the corpus, and the gate fails on each kind of bad probe.
import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { familyOf, familyProbeInputs, gateMarkdown, MEMORY_GATE_MB, memoryGate, type ProbeResult } from "./memory-gate.ts";
import { plannedCost } from "./plan.ts";
import { PACK_ENTRIES, ROUTERS } from "./runner.ts";

/** The dense input with hubs that L77 did not probe. Its 3 seeds peaked at 3438-4287 MB in bench-4. */
const DENSE_HUBS_FAMILY = "joint-v2/rect-grid.freeHeight.holes.none.bimodal.n1000.e-dense.hubs.none.free.sp-gap";

describe("the probe inputs", () => {
  it("gives the input with the largest cost of each family", () => {
    const ids = familyProbeInputs([
      { id: "c/a/s1", cost: 2 },
      { id: "c/a/s2", cost: 5 },
      { id: "c/b/s1", cost: 1 },
      { id: "c/a/s3", cost: 5 },
    ]);
    expect(ids).toEqual(["c/a/s2", "c/b/s1"]);
    expect(familyOf("c/a/s12")).toBe("c/a");
  });

  it("covers each family of joint-v2, the dense input with hubs too", () => {
    const pairs = PACK_ENTRIES.length * ROUTERS.length;
    const inputs = jointCorpus(SET_V2).inputs.map((input) => ({ id: input.id, cost: plannedCost(familyOf(input.id), input.boxes.length, input.edges?.length ?? 0, pairs) }));
    const ids = familyProbeInputs(inputs);
    const families = new Set(inputs.map((i) => familyOf(i.id)));
    expect(ids).toHaveLength(families.size);
    expect(new Set(ids.map(familyOf))).toEqual(families);
    expect(families.size).toBe(101);
    expect(ids.some((id) => familyOf(id) === DENSE_HUBS_FAMILY)).toBe(true);
  });
});

describe("the gate", () => {
  const ok = (input: string, peakRssMb: number): ProbeResult => ({ input, mode: "bench-6144", status: 0, peakRssMb });

  it("passes when each input has a probe under the limit", () => {
    const gate = memoryGate(["a", "b"], ["bench-6144"], [ok("a", 900), ok("b", 3071)]);
    expect(gate.pass).toBe(true);
    expect(gate.rows.map((r) => r.input)).toEqual(["b", "a"]);
  });

  it("fails on a missing probe, an OOM, another status, no peak and a peak at the limit", () => {
    const gate = memoryGate(
      ["a", "b", "c", "d", "e", "f"],
      ["bench-6144"],
      [
        { input: "b", mode: "bench-6144", status: 134, peakRssMb: undefined },
        { input: "c", mode: "bench-6144", status: 1, peakRssMb: 500 },
        { input: "d", mode: "bench-6144", status: 0, peakRssMb: undefined },
        ok("e", MEMORY_GATE_MB),
        ok("f", 100),
      ],
    );
    expect(gate.pass).toBe(false);
    expect(Object.fromEntries(gate.rows.map((r) => [r.input, r.reason]))).toEqual({
      a: "no probe",
      b: "OOM (status 134)",
      c: "status 1",
      d: "no peak",
      e: `peak ${MEMORY_GATE_MB} MB, limit ${MEMORY_GATE_MB} MB`,
      f: "",
    });
  });

  it("needs a probe in each mode", () => {
    const gate = memoryGate(["a"], ["bench-6144", "cap-2048"], [ok("a", 100)]);
    expect(gate.rows.map((r) => `${r.mode} ${r.reason}`).sort()).toEqual(["bench-6144 ", "cap-2048 no probe"]);
    expect(gateMarkdown(gate)).toContain("### Memory gate: fail");
  });
});
