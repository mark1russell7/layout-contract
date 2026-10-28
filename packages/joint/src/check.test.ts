import { describe, expect, it } from "vitest";
import { checkCorpus } from "./check.ts";
import { JOINT_V1_CLAIMS, JOINT_V2_CLAIMS, jointCorpus, SET, SET_V2, type JointManifest } from "./corpus.ts";

const v1 = jointCorpus(SET);
const v2 = jointCorpus(SET_V2);

/** This function gives the claims that break in a corpus. */
const broken = (manifest: JointManifest, inputs: Parameters<typeof checkCorpus>[1]): string[] => checkCorpus(manifest, inputs).map((b) => b.claim);

describe("checkCorpus", () => {
  it("passes on joint-v1 and on joint-v2", () => {
    expect(checkCorpus(v1.manifest, v1.inputs)).toEqual([]);
    expect(checkCorpus(v2.manifest, v2.inputs)).toEqual([]);
  });

  it("gives joint-v1 the claims of the code, with stressOnly and no spacing claim", () => {
    expect(v1.manifest.claims).toBeUndefined();
    expect(JOINT_V1_CLAIMS.stressOnly).toBe(true);
    expect(JOINT_V1_CLAIMS.spacing).toBeUndefined();
    expect(v2.manifest.claims).toEqual(JOINT_V2_CLAIMS);
  });

  it("breaks the claim spacing for a stress input with a gap, and for an input with no margin and no gap outside the stress cell", () => {
    const stress = v2.manifest.inputs.findIndex((e) => e.stress === true);
    const other = v2.manifest.inputs.findIndex((e) => e.stress !== true && v2.inputs[v2.manifest.inputs.indexOf(e)]!.boxes.length > 0);
    const inputs = v2.inputs.map((f, i) =>
      i === stress ? { ...f, gap: 4 } : i === other ? { ...f, gap: 0, boxes: f.boxes.map(({ margin: _m, ...b }) => b) } : f,
    );
    const breaks = checkCorpus(v2.manifest, inputs, JOINT_V2_CLAIMS).filter((b) => b.claim === "spacing");
    expect(breaks).toHaveLength(1);
    expect([...breaks[0]!.inputs].sort()).toEqual([v2.inputs[stress]!.id, v2.inputs[other]!.id].sort());
  });

  it("breaks the claim stressOnly for an input of joint-v1 with a margin", () => {
    const inputs = v1.inputs.map((f, i) => (i === 3 ? { ...f, boxes: f.boxes.map((b) => ({ ...b, margin: 2 })) } : f));
    const breaks = checkCorpus(v1.manifest, inputs, JOINT_V1_CLAIMS);
    expect(breaks.find((b) => b.claim === "stressOnly")?.inputs).toEqual([v1.inputs[3]!.id]);
  });

  it("breaks the claim coverage when the inputs lose the pairs of a dimension", () => {
    const manifest = { ...v2.manifest, inputs: v2.manifest.inputs.map((e) => ({ ...e, cell: { ...e.cell, spacing: "gap" } })) } as JointManifest;
    const { spacing: _s, ...claims } = JOINT_V2_CLAIMS;
    expect(checkCorpus(manifest, v2.inputs, claims).map((b) => b.claim)).toEqual(["coverage", "coverage"]);
  });

  it("breaks the claim minPerKind for a thin kind that the list does not have, and for a listed kind that is not thin", () => {
    const tooHigh = { ...JOINT_V2_CLAIMS, minPerKind: { count: 1000, thin: [] } };
    const listed = { ...JOINT_V2_CLAIMS, minPerKind: { count: 10, thin: ["gallery"] } };
    expect(checkCorpus(v2.manifest, v2.inputs, tooHigh).map((b) => b.claim)).toEqual(["minPerKind"]);
    expect(checkCorpus(v2.manifest, v2.inputs, listed).map((b) => b.claim)).toEqual(["minPerKind"]);
  });

  it("breaks the claim maxBoxes for an input with too many boxes", () => {
    const most = Math.max(...v2.inputs.map((f) => f.boxes.length));
    const breaks = checkCorpus(v2.manifest, v2.inputs, { ...JOINT_V2_CLAIMS, maxBoxes: most - 1 });
    expect(breaks.map((b) => b.claim)).toEqual(["maxBoxes"]);
    expect(breaks[0]!.inputs.length).toBeGreaterThan(0);
  });

  it("breaks the claim index for a hash that differs, and for a corpus with no claims", () => {
    const inputs = v2.inputs.map((f, i) => (i === 5 ? { ...f, hash: "0000000000000000" } : f));
    expect(broken(v2.manifest, inputs)).toEqual(["index"]);
    const { claims: _c, ...bare } = v2.manifest;
    const noClaims = { ...bare, corpus: "joint-v9" } as JointManifest;
    expect(checkCorpus(noClaims, v2.inputs).map((b) => b.claim)).toEqual(["index"]);
  });
});
