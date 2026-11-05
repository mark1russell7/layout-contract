import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkInput,
  countPortsOffBorder,
  EDGE_DENSITY,
  edgeKeyStep,
  edgeStep,
  fnv1a32,
  randomInt,
  stepRandom,
  type EdgeKey,
  type EdgeShape,
  type EdgeStepParams,
  type LayoutInput,
} from "./index.ts";

/** A base input of boxes without edges, as a generator of `packing` gives it. */
function base(count: number, seed = 1): LayoutInput {
  const r = stepRandom(seed, "boxes");
  const boxes = Array.from({ length: count }, (_, i) => ({ id: `b${i}`, w: randomInt(r, 20, 120), h: randomInt(r, 20, 80) }));
  return { schema: "layout-input/1", id: `test/s${seed}`, seed, hash: "0000000000000000", container: { w: 1000, fixed: "width" }, boxes, edges: [] };
}

/** The first 16 hex characters of the SHA-256 of the canonical form: sorted keys, no whitespace. */
function hashOf(value: unknown): string {
  const canon = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(canon).join(",")}]`
      : v !== null && typeof v === "object"
        ? `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
            .join(",")}}`
        : JSON.stringify(v);
  return createHash("sha256").update(canon(value)).digest("hex").slice(0, 16);
}

const SHAPES: readonly EdgeShape[] = ["random", "clustered", "hubChain", "hubs", "longRange", "tree", "bundled"];
const degrees = (out: LayoutInput): Map<string, number> => {
  const d = new Map<string, number>();
  for (const e of out.edges ?? []) for (const id of [e.source, e.target]) d.set(id, (d.get(id) ?? 0) + 1);
  return d;
};

describe("the random numbers", () => {
  it("match the check values of docs/FORMAT.md of packing", () => {
    expect(fnv1a32("1:container")).toBe(3139901265);
    for (const text of ["é", "€", "𝄞", "a:é€𝄞"]) {
      let h = 0x811c9dc5;
      for (const b of Buffer.from(text, "utf8")) h = Math.imul(h ^ b, 0x01000193) >>> 0;
      expect(fnv1a32(text), text).toBe(h);
    }
    const r = stepRandom(1, "container");
    expect(randomInt(r, 600, 1000)).toBe(970);
    expect(randomInt(r, 400, 800)).toBe(705);
  });
});

describe("edgeStep", () => {
  it("gives a good input for each shape, density, port kind and group kind", () => {
    for (const edgeShape of SHAPES)
      for (const edgeDensity of ["sparse", "medium", "dense"] as const)
        for (const ports of ["free", "sides", "fixed"] as const)
          for (const groups of ["none", "flat", "nested"] as const) {
            const params: EdgeStepParams = { edgeShape, edgeDensity, ports, groups };
            const out = edgeStep(base(120), params);
            const tag = JSON.stringify(params);
            expect(checkInput(out), tag).toEqual([]);
            expect(countPortsOffBorder(out.boxes), tag).toBe(0);
            const keys = new Set<string>();
            for (const e of out.edges ?? []) {
              expect(e.source, tag).not.toBe(e.target);
              const key = [e.source, e.target].sort().join("|");
              expect(keys.has(key), tag).toBe(false);
              keys.add(key);
              expect(typeof e.data?.["collection"], tag).toBe("string");
            }
            expect(out.hash).toBeUndefined();
            expect(out.steps?.at(-1)).toEqual({ name: "edges", version: 1, params: { hubBy: "area", ...params }, seed: 1 });
          }
  });

  it("gives the same file for the same input and seed, and a different file for another seed", () => {
    const params: EdgeStepParams = { edgeShape: "bundled", edgeDensity: "medium", ports: "fixed", groups: "nested" };
    expect(edgeStep(base(200), params)).toEqual(edgeStep(base(200), params));
    expect(edgeStep(base(200), params, 2).edges).not.toEqual(edgeStep(base(200), params, 1).edges);
  });

  it("makes the count of the edges of the density", () => {
    for (const edgeShape of ["random", "clustered", "hubs", "longRange", "bundled"] as const)
      for (const edgeDensity of ["sparse", "medium", "dense"] as const)
        expect(edgeStep(base(200), { edgeShape, edgeDensity }).edges?.length, `${edgeShape} ${edgeDensity}`).toBe(Math.round(200 * EDGE_DENSITY[edgeDensity]));
  });

  it("makes a tree with n - 1 edges that connects all the boxes", () => {
    const out = edgeStep(base(150), { edgeShape: "tree", edgeDensity: "dense" });
    expect(out.edges).toHaveLength(149);
    const parent = new Map(out.boxes.map((b) => [b.id, b.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const e of out.edges ?? []) parent.set(find(e.source), find(e.target));
    expect(new Set(out.boxes.map((b) => find(b.id))).size).toBe(1);
  });

  it("makes chains of at most 32 boxes and skip links for hubChain", () => {
    const out = edgeStep(base(96), { edgeShape: "hubChain", edgeDensity: "medium" });
    const edges = out.edges ?? [];
    expect(edges.length).toBeGreaterThanOrEqual(93);
    expect(edges.length).toBeLessThanOrEqual(Math.round(96 * 1.5));
    expect(edgeStep(base(96), { edgeShape: "hubChain", edgeDensity: "sparse" }).edges).toHaveLength(93);
  });

  it("keeps most edges of clustered inside a group of 8", () => {
    const out = edgeStep(base(400), { edgeShape: "clustered", edgeDensity: "medium", groups: "flat" });
    const group = new Map(out.boxes.map((b) => [b.id, b.group]));
    const inside = (out.edges ?? []).filter((e) => group.get(e.source) === group.get(e.target)).length;
    expect(inside / (out.edges?.length ?? 1)).toBeGreaterThan(0.8);
  });

  it("makes the largest boxes the hubs of hubs with hubBy area", () => {
    const input = base(300);
    const largest = [...input.boxes].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 10).map((b) => b.id);
    const d = degrees(edgeStep(input, { edgeShape: "hubs", edgeDensity: "dense" }));
    const top = [...d.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(largest).toContain(top);
  });

  it("makes fan-outs of 4 to 15 boxes into one other cluster for bundled", () => {
    const out = edgeStep(base(240), { edgeShape: "bundled", edgeDensity: "medium", groups: "flat" });
    const group = new Map(out.boxes.map((b) => [b.id, b.group]));
    const fans = new Map<string, number>();
    for (const e of out.edges ?? []) {
      if (group.get(e.source) === group.get(e.target)) continue;
      const key = `${e.source}>${group.get(e.target)}`;
      fans.set(key, (fans.get(key) ?? 0) + 1);
    }
    expect(Math.max(...fans.values())).toBeGreaterThanOrEqual(4);
    for (const e of out.edges ?? []) expect(e.data?.["collection"]).toMatch(new RegExp(`-${group.get(e.target)!.slice(1)}$`));
  });

  it("gives a fixed port out to about 20% of the boxes, and their edges use it", () => {
    const out = edgeStep(base(500), { edgeShape: "random", edgeDensity: "medium", ports: "fixed" });
    const withOut = out.boxes.filter((b) => b.ports?.some((p) => p.id === "out"));
    expect(withOut.length / 500).toBeGreaterThan(0.15);
    expect(withOut.length / 500).toBeLessThan(0.25);
    const ids = new Set(withOut.map((b) => b.id));
    for (const e of out.edges ?? []) expect(e.sourcePort === "out").toBe(ids.has(e.source));
  });

  it("writes the nested group as a path in data.group", () => {
    const out = edgeStep(base(64), { edgeShape: "random", edgeDensity: "sparse", groups: "nested" });
    for (const b of out.boxes) expect(b.data?.["group"]).toBe(`G${Math.floor(Number(b.group!.slice(1)) / 4)}/${b.group}`);
  });

  it("refuses an input with edges", () => {
    const input = { ...base(3), edges: [{ id: "e", source: "b0", target: "b1" }] };
    expect(() => edgeStep(input, { edgeShape: "random", edgeDensity: "sparse" })).toThrow(RangeError);
  });

  it("gives no edges for fewer than 2 boxes", () => {
    expect(edgeStep(base(1), { edgeShape: "tree", edgeDensity: "dense" }).edges).toEqual([]);
    expect(edgeStep(base(0), { edgeShape: "bundled", edgeDensity: "dense" }).edges).toEqual([]);
  });

  it("gives the pinned hashes of docs/JOINT-CORPUS.md", () => {
    const pinned = [
      hashOf(edgeStep(base(40, 1), { edgeShape: "clustered", edgeDensity: "medium" })),
      hashOf(edgeStep(base(40, 2), { edgeShape: "bundled", edgeDensity: "dense", groups: "flat", ports: "sides" })),
      hashOf(edgeStep(base(40, 3), { edgeShape: "hubChain", edgeDensity: "medium", groups: "nested", ports: "fixed" })),
    ];
    expect(pinned).toEqual(["dedf6f7ccb193d40", "f808e8ae593d9bd9", "6b07703b51ca6c23"]);
  });
});

describe("edgeKeyStep", () => {
  const KEYS: readonly EdgeKey[] = ["none", "random", "cluster"];
  const made = (edgeShape: EdgeShape, seed = 1): LayoutInput => edgeStep(base(120, seed), { edgeShape, edgeDensity: "medium" }, seed);
  const noKey = (input: LayoutInput): unknown => input.edges?.map(({ data: _data, ...edge }) => edge);
  const keyOfEdges = (input: LayoutInput): readonly unknown[] => (input.edges ?? []).map((e) => e.data?.["collection"]);

  it("changes only the key of the edges, on each shape and each value", () => {
    for (const edgeShape of ["random", "clustered", "hubChain", "hubs", "longRange", "tree", "bundled"] as const) {
      const input = made(edgeShape);
      for (const edgeKey of KEYS) {
        const out = edgeKeyStep(input, { edgeKey }, 1);
        expect(noKey(out), `${edgeShape} ${edgeKey}`).toEqual(noKey(input));
        expect(out.boxes).toEqual(input.boxes);
      }
    }
  });

  it("removes the field for none, and keeps the other data of an edge", () => {
    const input = made("hubs");
    expect(edgeKeyStep(input, { edgeKey: "none" }, 1).edges?.every((e) => e.data === undefined)).toBe(true);
    const first = input.edges![0]!;
    const extra: LayoutInput = { ...input, edges: [{ ...first, data: { ...first.data, weight: 2 } }] };
    expect(edgeKeyStep(extra, { edgeKey: "none" }, 1).edges?.[0]?.data).toEqual({ weight: 2 });
    expect(edgeKeyStep(extra, { edgeKey: "random" }, 1).edges?.[0]?.data?.["weight"]).toBe(2);
  });

  it("gives the keys of edgeStep for cluster on the shape bundled", () => {
    const input = made("bundled", 3);
    expect(edgeKeyStep(input, { edgeKey: "cluster" }, 3).edges).toEqual(input.edges);
  });

  it("gives the same key to the edges of one target box, with more names for cluster than for random", () => {
    const input = made("random");
    const names = (edgeKey: EdgeKey): number => {
      const out = edgeKeyStep(input, { edgeKey }, 1);
      const byTarget = new Map<string, unknown>();
      for (const e of out.edges!) {
        const key = e.data?.["collection"];
        expect(byTarget.get(e.target) ?? key).toBe(key);
        byTarget.set(e.target, key);
      }
      return new Set(byTarget.values()).size;
    };
    expect(names("random")).toBe(4);
    expect(names("cluster")).toBe(15);
  });

  it("is a function of the seed, and the stream of random is not the stream of edgeStep", () => {
    const input = made("hubs");
    expect(edgeKeyStep(input, { edgeKey: "random" }, 1)).toEqual(edgeKeyStep(input, { edgeKey: "random" }, 1));
    expect(keyOfEdges(edgeKeyStep(input, { edgeKey: "random" }, 2))).not.toEqual(keyOfEdges(edgeKeyStep(input, { edgeKey: "random" }, 1)));
    expect(keyOfEdges(edgeKeyStep(input, { edgeKey: "random" }, 1))).not.toEqual(keyOfEdges(input));
  });

  it("appends its stamp, removes the hash, and accepts an input with no edges", () => {
    const out = edgeKeyStep(made("tree"), { edgeKey: "cluster" }, 1);
    expect(out.steps?.at(-1)).toEqual({ name: "edge-key", version: 1, params: { edgeKey: "cluster" }, seed: 1 });
    expect(out.hash).toBeUndefined();
    const { edges: _edges, ...noEdges } = base(5);
    expect(edgeKeyStep(noEdges, { edgeKey: "random" }, 1).edges).toBeUndefined();
    expect(edgeKeyStep(base(5), { edgeKey: "cluster" }, 1).edges).toEqual([]);
  });

  it("refuses an edge with an unknown target", () => {
    const input = base(3);
    const bad: LayoutInput = { ...input, edges: [{ id: "e", source: "b0", target: "nobody" }] };
    expect(() => edgeKeyStep(bad, { edgeKey: "random" }, 1)).toThrow(/unknown target "nobody"/);
    expect(edgeKeyStep(bad, { edgeKey: "none" }, 1).edges).toEqual(bad.edges);
  });
});
