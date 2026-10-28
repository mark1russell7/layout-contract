import { stepRandom } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { segmentsCross, straightCrossings, type StraightSegment } from "./joint-measures.ts";

/** The count of `placementFacts` before `straightCrossings`: each pair, with the ids as strings and `segmentsCross`. The test keeps it as the reference. */
function crossingsReference(segments: readonly StraightSegment[]): number {
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    for (let j = i + 1; j < segments.length; j++) {
      const t = segments[j]!;
      const shared = s.source === t.source || s.source === t.target || s.target === t.source || s.target === t.target;
      if (!shared && segmentsCross(s.a, s.b, t.a, t.b)) crossings += 1;
    }
  }
  return crossings;
}

/** Random segments between the centers of `boxes` random boxes. The kind `grid` puts the centers on a regular grid, so many segments are collinear. */
function randomSegments(seed: number, boxes: number, edges: number, kind: "free" | "grid" | "small"): StraightSegment[] {
  const r = stepRandom(seed, "crossings");
  const side = Math.ceil(Math.sqrt(boxes));
  const w = 7.699 + r() * 3;
  const h = 6.616 + r() * 3;
  const centers = Array.from({ length: boxes }, (_, i) => {
    if (kind === "grid") return { x: (i % side) * w + w / 2, y: Math.floor(i / side) * h + h / 2 };
    if (kind === "small") return { x: Math.floor(r() * 4), y: Math.floor(r() * 4) };
    return { x: r() * 1e4, y: r() * 1e4 };
  });
  return Array.from({ length: edges }, () => {
    const s = Math.floor(r() * boxes);
    const t = r() < 0.05 ? s : Math.floor(r() * boxes);
    return { source: `b${s}`, target: `b${t}`, a: centers[s]!, b: centers[t]! };
  });
}

describe("straightCrossings", () => {
  it("gives the count of the reference on random inputs", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const kind of ["free", "grid", "small"] as const) {
        const segments = randomSegments(seed, 5 + (seed % 7) * 15, 10 + seed * 6, kind);
        expect(straightCrossings(segments), `seed ${seed}, kind ${kind}`).toBe(crossingsReference(segments));
      }
    }
  });

  it("gives the count of the reference on a large grid with near-collinear segments", () => {
    const segments = randomSegments(7, 1000, 1500, "grid");
    expect(straightCrossings(segments)).toBe(crossingsReference(segments));
  });

  it("does not count a pair with a shared end box, a touch at an end or a collinear overlap", () => {
    const p = (x: number, y: number) => ({ x, y });
    const segments: StraightSegment[] = [
      { source: "a", target: "b", a: p(0, 0), b: p(10, 10) },
      { source: "c", target: "d", a: p(0, 10), b: p(10, 0) },
      { source: "a", target: "e", a: p(0, 0), b: p(10, 0) },
      { source: "f", target: "g", a: p(10, 0), b: p(20, 5) },
      { source: "h", target: "i", a: p(-5, -5), b: p(5, 5) },
    ];
    expect(straightCrossings(segments)).toBe(1);
    expect(straightCrossings(segments)).toBe(crossingsReference(segments));
    expect(straightCrossings([])).toBe(0);
  });
});
