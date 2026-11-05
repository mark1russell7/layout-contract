import { heldOutError, parseResponseRecord } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import type { JointManifest } from "./corpus.ts";
import { fitJointResponse, jointResponseData, jointResponseTerms, type JointResponseRow } from "./response.ts";

const COUNTS = ["1", "10", "100", "1k"];
const SHAPES = ["rect", "circle"];

/** This function gives a small manifest: each count with each shape, each with two seeds. */
function manifest(): Pick<JointManifest, "corpus" | "inputs"> {
  const inputs = COUNTS.flatMap((count) =>
    SHAPES.flatMap((containerShape) =>
      [1, 2].map((seed) => ({ id: `c/${containerShape}.n${count}/s${seed}`, hash: "h", cell: { count, containerShape, mode: "offline" } })),
    ),
  );
  return { corpus: "c", inputs: inputs as unknown as JointManifest["inputs"] };
}

/** This function gives a record of a pair on an input. The fill depends on the pack, so a fit can find it. */
function row(pack: string, router: string, input: string, skipped?: string): JointResponseRow {
  const fill = pack === "rows" ? 0.8 : 0.4;
  const noise = (input.length % 7) / 100;
  return {
    strategy: `${pack}+${router}`,
    input,
    options: { pack, router },
    measures: skipped === undefined ? { "joint.fill": fill + noise, "joint.spill": 0, "route.crossings": router === "straight" ? 0 : 12, "joint.ms": 100.123456 } : {},
    ...(skipped === undefined ? {} : { skipped }),
  };
}

const allRows = (): JointResponseRow[] => manifest().inputs.flatMap((e) => ["rows", "shelf"].flatMap((pack) => ["straight", "plugs"].map((router) => row(pack, router, e.id))));

describe("jointResponseData", () => {
  it("gives one point for each record, with the spec as its group", () => {
    const data = jointResponseData(allRows(), manifest());
    expect(data.points).toHaveLength(64);
    expect(data.points[0]?.group).toBe("c/rect.n1");
    expect(data.points[0]?.id).toBe("rows+straight|c/rect.n1/s1");
  });

  it("has the arms, the fields with levels and no field with one level", () => {
    const data = jointResponseData(allRows(), manifest());
    expect(data.dimensions.map((d) => d.id)).toEqual(["pack", "router", "count", "containerShape"]);
    expect(data.dimensions.find((d) => d.id === "count")).toMatchObject({ kind: "ordinal", log: true, levels: [1, 10, 100, 1000] });
    expect(data.points[0]?.values["count"]).toBe(1);
  });

  it("reads 1k as 1000", () => {
    const data = jointResponseData(allRows(), manifest());
    expect(data.points.some((p) => p.values["count"] === 1000)).toBe(true);
  });

  it("keeps the first seeds of each spec", () => {
    const data = jointResponseData(allRows(), manifest(), { seeds: 1 });
    expect(data.points).toHaveLength(32);
    expect(data.points.every((p) => p.id.endsWith("/s1"))).toBe(true);
  });

  it("gives a value 5 significant digits", () => {
    const data = jointResponseData(allRows(), manifest());
    expect(data.points[0]?.measures["joint.ms"]).toBe(100.12);
  });

  it("leaves out a measure that no record has", () => {
    const data = jointResponseData(allRows(), manifest());
    expect(data.measures.map((m) => m.id)).toEqual(["joint.fill", "joint.spill", "route.crossings", "joint.ms"]);
  });

  it("gives each absent measure of a pair over the budget its reason", () => {
    const rows = [...allRows(), row("maxrects", "plugs", "c/rect.n1/s1", "over budget")];
    const data = jointResponseData(rows, manifest());
    const point = data.points.at(-1);
    expect(point?.measures["joint.fill"]).toBeNull();
    expect(point?.absent?.["joint.fill"]).toBe("over-budget");
    expect(data.reasons?.map((r) => r.id)).toEqual(["over-budget"]);
  });

  it("keeps the two tags of the budget apart", () => {
    const rows = [...allRows(), row("a", "plugs", "c/rect.n1/s1", "over budget"), row("b", "plugs", "c/rect.n1/s1", "not run: over budget on this input"), row("d", "plugs", "c/rect.n1/s1", "other")];
    expect(jointResponseData(rows, manifest()).reasons?.map((r) => r.id)).toEqual(["not-run", "over-budget", "skipped"]);
  });

  it("gives a reason to a measure that a measured pair does not give", () => {
    const rows = allRows();
    const first = rows[0]!;
    rows[0] = { ...first, measures: { "joint.fill": 0.5 } };
    const data = jointResponseData(rows, manifest());
    expect(data.points[0]?.absent?.["joint.ms"]).toBe("not-given");
    expect(data.points[0]?.absent?.["joint.fill"]).toBeUndefined();
  });

  it("drops a stated range when a value is out of it", () => {
    const rows = allRows();
    const first = rows[0]!;
    rows[0] = { ...first, measures: { ...first.measures, "joint.fill": 1.5 } };
    expect(jointResponseData(rows, manifest()).measures[0]?.range).toBeUndefined();
    expect(jointResponseData(allRows(), manifest()).measures[0]?.range).toEqual([0, 1]);
  });

  it("stops on a record of another corpus", () => {
    expect(() => jointResponseData([row("rows", "plugs", "other/x/s1")], manifest())).toThrow('The input "other/x/s1" is not in the corpus c.');
  });

  it("stops on a cell with the name of an arm", () => {
    const m = { corpus: "c", inputs: [{ id: "c/x/s1", hash: "h", cell: { pack: "a" } }] } as unknown as JointManifest;
    expect(() => jointResponseData([row("rows", "plugs", "c/x/s1")], m)).toThrow('has the field "pack"');
  });
});

describe("jointResponseTerms", () => {
  const data = jointResponseData(allRows(), manifest());
  const has = (id: string): boolean => jointResponseTerms(data).some((t) => JSON.stringify(t).includes(id));

  it("has the count at powers 1 and 2", () => {
    const terms = jointResponseTerms(data);
    expect(terms).toContainEqual([{ dimension: "count", power: 1 }]);
    expect(terms).toContainEqual([{ dimension: "count", power: 2 }]);
  });

  it("has each level of each categorical dimension", () => {
    expect(has('"level":"circle"')).toBe(true);
    expect(has('"level":"straight"')).toBe(true);
  });

  it("has only the products of a pack and a router with points", () => {
    const rows = allRows().filter((r) => !(r.options.pack === "rows" && r.options.router === "plugs"));
    const terms = jointResponseTerms(jointResponseData(rows, manifest()));
    const pairs = terms.filter((t) => t.length === 2 && t[0]?.dimension === "pack");
    expect(pairs).toEqual([
      [{ dimension: "pack", level: "rows" }, { dimension: "router", level: "straight" }],
      [{ dimension: "pack", level: "shelf" }, { dimension: "router", level: "plugs" }],
      [{ dimension: "pack", level: "shelf" }, { dimension: "router", level: "straight" }],
    ]);
  });

  it("keeps the pairs with the most points under the limit, with the intercept counted", () => {
    const rows = [...allRows(), row("shelf", "plugs", "c/rect.n1/s1")];
    const small = jointResponseData(rows, manifest());
    const others = jointResponseTerms(small).filter((t) => !(t.length === 2 && t[0]?.dimension === "pack")).length;
    const terms = jointResponseTerms(small, others + 2);
    expect(terms).toHaveLength(others + 1);
    expect(terms.at(-1)).toEqual([{ dimension: "pack", level: "shelf" }, { dimension: "router", level: "plugs" }]);
  });

  it("gives no pair under a limit that the other terms reach", () => {
    const terms = jointResponseTerms(data, 1);
    expect(terms.some((t) => t.length === 2 && t[0]?.dimension === "pack")).toBe(false);
  });

  it("has the count with each arm, and has no such term with no count", () => {
    const terms = jointResponseTerms(data);
    expect(terms).toContainEqual([{ dimension: "count", power: 1 }, { dimension: "pack", level: "rows" }]);
    expect(terms).toContainEqual([{ dimension: "count", power: 1 }, { dimension: "router", level: "plugs" }]);
    const one = { corpus: "c", inputs: ["a", "b", "c"].map((s) => ({ id: `c/${s}/s1`, hash: "h", cell: { sizes: s } })) } as unknown as JointManifest;
    const noCount = jointResponseTerms(jointResponseData(["a", "b", "c"].map((s) => row("rows", "plugs", `c/${s}/s1`)), one));
    expect(noCount.some((t) => t.some((f) => f.dimension === "count"))).toBe(false);
  });
});

describe("fitJointResponse", () => {
  const record = fitJointResponse(jointResponseData(allRows(), manifest()), { folds: 3 });

  it("gives a record that the format reads", () => {
    expect(parseResponseRecord(JSON.parse(JSON.stringify(record))).ok).toBe(true);
  });

  it("fits a share better than its mean when the pack sets the share", () => {
    const error = heldOutError(record, "joint.fill");
    expect(error.mae).toBeLessThan(error.baselineMae);
  });

  it("gives the same record for the same data", () => {
    const again = fitJointResponse(jointResponseData(allRows(), manifest()), { folds: 3 });
    expect(JSON.stringify(again)).toBe(JSON.stringify(record));
  });

  it("reads a value of 0 on a log scale with the floor", () => {
    expect(record.models.some((m) => m.measure === "route.crossings")).toBe(true);
  });
});
