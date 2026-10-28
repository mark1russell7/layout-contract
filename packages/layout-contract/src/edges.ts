import { SIDES, type Side } from "./geometry.ts";
import type { LayoutBox, LayoutEdge, LayoutGenerator, LayoutInput, Port } from "./input.ts";
import { randomInt, stepRandom } from "./random.ts";

/**
 * The shape of the edges of `edgeStep`. The values are the cells of `edgeShape`, and `hubs`.
 * `hubs` waits for the next breaking change to become a value of `LayoutCell.edgeShape`.
 */
export type EdgeShape = "random" | "clustered" | "hubChain" | "hubs" | "longRange" | "tree" | "bundled";

/** The parameters of `edgeStep`. */
export interface EdgeStepParams {
  readonly edgeDensity: "sparse" | "medium" | "dense";
  readonly edgeShape: EdgeShape;
  /** The default is `none`. */
  readonly groups?: "none" | "flat" | "nested";
  /** The default is `free`. */
  readonly ports?: "free" | "sides" | "fixed";
  /** The order of the hubs of `hubs` and `tree`: the largest box first, or a random order. The default is `area`. */
  readonly hubBy?: "area" | "random";
}

/** The mean count of the edges of each box for each value of `edgeDensity`. */
export const EDGE_DENSITY: Readonly<Record<EdgeStepParams["edgeDensity"], number>> = Object.freeze({ sparse: 0.5, medium: 1.5, dense: 4 });

/** The version of `edgeStep`. A change of its output gives a new version. */
export const EDGE_STEP_VERSION = 1;

const CLUSTER = 8;
const CHAIN = 32;
const INSIDE = 0.85;
const FAN_SHARE = 0.6;
const FIXED_SHARE = 0.2;
const COLLECTIONS = ["users", "orders", "items", "events"] as const;

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * This function gives the input with edges, groups and ports from its topology alone: a joint input has no positions before the pack.
 * The random numbers come from the steps `edges` and `ports` of `seed`. The function appends its stamp to `steps`, and removes the old `hash`.
 * The rules of each shape are in `docs/JOINT-CORPUS.md`.
 */
export function edgeStep(input: LayoutInput, params: EdgeStepParams, seed: number = input.seed ?? 0): LayoutInput {
  if ((input.edges?.length ?? 0) > 0) throw new RangeError("edgeStep: the input has edges already");
  const full: Required<EdgeStepParams> = { groups: "none", ports: "free", hubBy: "area", ...params };
  const n = input.boxes.length;
  const r = stepRandom(seed, "edges");

  const perm = input.boxes.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(r, 0, i);
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  const clusterOf: number[] = new Array<number>(n);
  perm.forEach((box, p) => (clusterOf[box] = Math.floor(p / CLUSTER)));
  const clusters = Math.ceil(n / CLUSTER);
  const members = (c: number): readonly number[] => perm.slice(c * CLUSTER, (c + 1) * CLUSTER);
  const collectionOf =
    full.edgeShape === "bundled"
      ? clusterOf.map((c) => `${COLLECTIONS[c % COLLECTIONS.length]!}-${c}`)
      : input.boxes.map(() => COLLECTIONS[randomInt(r, 0, COLLECTIONS.length - 1)]!);
  const area = (i: number): number => input.boxes[i]!.w * input.boxes[i]!.h;
  const rank = full.hubBy === "area" ? input.boxes.map((_, i) => i).sort((a, b) => area(b) - area(a) || a - b) : perm;

  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  const add = (u: number, v: number): void => {
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    if (u === v || seen.has(key)) return;
    seen.add(key);
    pairs.push([u, v]);
  };
  const anyBox = (): number => randomInt(r, 0, n - 1);
  const inCluster = (c: number): number => {
    const m = members(c);
    return m[randomInt(r, 0, m.length - 1)]!;
  };
  const otherCluster = (c: number): number => {
    const o = randomInt(r, 0, clusters - 2);
    return o >= c ? o + 1 : o;
  };
  const target = Math.min(Math.round(n * EDGE_DENSITY[full.edgeDensity]), (n * (n - 1)) / 2);
  const fill = (pick: () => [number, number]): void => {
    for (let tries = 0; pairs.length < target && tries < target * 30; tries++) add(...pick());
  };
  const clustered = (): [number, number] => {
    const u = anyBox();
    return [u, r() < INSIDE ? inCluster(clusterOf[u]!) : anyBox()];
  };

  if (n >= 2) {
    switch (full.edgeShape) {
      case "random":
        fill(() => [anyBox(), anyBox()]);
        break;
      case "clustered":
        fill(clustered);
        break;
      case "longRange":
        fill(() => {
          const u = anyBox();
          return [u, clusters > 1 ? inCluster(otherCluster(clusterOf[u]!)) : anyBox()];
        });
        break;
      case "hubs":
        fill(() => [anyBox(), rank[Math.floor(n * r() ** 3)]!]);
        break;
      case "tree":
        for (let i = 1; i < n; i++) add(rank[randomInt(r, 0, i - 1)]!, rank[i]!);
        break;
      case "hubChain": {
        const k = Math.ceil(n / CHAIN);
        const length = Math.ceil(n / k);
        const chains = Array.from({ length: k }, (_, c) => perm.slice(c * length, (c + 1) * length));
        for (const chain of chains) for (let i = 0; i + 1 < chain.length; i++) add(chain[i]!, chain[i + 1]!);
        const skips = Math.max(0, target - pairs.length);
        for (let s = 0; s < skips; s++) {
          const c = k > 1 ? randomInt(r, 0, k - 2) : 0;
          const from = chains[c]!;
          const to = chains[k > 1 ? c + 1 : 0]!;
          const i = randomInt(r, 0, from.length - 1);
          const j = i + Math.floor(from.length / 8) + randomInt(r, 0, Math.floor(from.length / 2));
          if (j < to.length) add(from[i]!, to[j]!);
        }
        break;
      }
      case "bundled":
        for (let rounds = 0; pairs.length < target * FAN_SHARE && clusters > 1 && rounds < target; rounds++) {
          const u = anyBox();
          const c = otherCluster(clusterOf[u]!);
          const fan = randomInt(r, 4, 15);
          for (let f = 0; f < fan && pairs.length < target; f++) add(u, inCluster(c));
        }
        fill(clustered);
        break;
    }
  }

  const rp = stepRandom(seed, "ports");
  const ports: Port[][] = input.boxes.map((b) => [...(b.ports ?? [])]);
  const portOn = (box: LayoutBox, id: string, side: Side, fixed: boolean): Port => {
    if (!fixed) return { id, side };
    const along = round3(rp() * (side === "top" || side === "bottom" ? box.w : box.h));
    const at = { top: [along, 0], bottom: [along, box.h], left: [0, along], right: [box.w, along] }[side];
    return { id, side, x: at[0]!, y: at[1]! };
  };
  const out = new Set<number>();
  if (full.ports === "fixed") {
    input.boxes.forEach((box, i) => {
      if (rp() >= FIXED_SHARE) return;
      const side = SIDES[randomInt(rp, 0, 3)]!;
      ports[i]!.push(portOn(box, "out", side, true));
      out.add(i);
    });
  }
  const edges: LayoutEdge[] = pairs.map(([u, v], k) => {
    const id = `e${k}`;
    const s = input.boxes[u]!;
    const t = input.boxes[v]!;
    let ends: { sourcePort?: string; targetPort?: string } = {};
    if (full.ports === "sides") {
      ports[u]!.push(portOn(s, `${id}.s`, SIDES[randomInt(rp, 0, 3)]!, false));
      ports[v]!.push(portOn(t, `${id}.t`, SIDES[randomInt(rp, 0, 3)]!, false));
      ends = { sourcePort: `${id}.s`, targetPort: `${id}.t` };
    } else if (out.has(u)) {
      ends = { sourcePort: "out" };
    }
    return { id, source: s.id, target: t.id, ...ends, data: { collection: collectionOf[v]! } };
  });

  const boxes = input.boxes.map((box, i): LayoutBox => {
    const c = clusterOf[i]!;
    const group = full.groups === "none" ? undefined : `g${c}`;
    const path = full.groups === "nested" ? `G${Math.floor(c / 4)}/g${c}` : group;
    return {
      ...box,
      ...(group === undefined ? {} : { group, data: { ...box.data, group: path } }),
      ...(ports[i]!.length === 0 ? {} : { ports: ports[i]! }),
    };
  });
  const stamp: LayoutGenerator = { name: "edges", version: EDGE_STEP_VERSION, params: { ...full }, seed };
  const { hash: _old, ...rest } = input;
  return { ...rest, boxes, edges, steps: [...(input.steps ?? []), stamp] };
}
