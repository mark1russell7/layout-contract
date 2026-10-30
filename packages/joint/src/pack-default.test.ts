// The pack entry `pack` against `defaultLayoutOf` of `packing`: the choice of `pack()` without a strategy (step A of roadmap item k58 of `packing`).
// The registry of `packing` packs an input of free size with a sweep over widths, and `pack()` packs it with one width. Thus the test compares the choice, not the output of `pack()`.
import { defaultLayoutOf, outputHash, packWith, Rect, type PackInput } from "@mark1russell7/packing";
import { describe, expect, it } from "vitest";
import { jointCorpus, SET_V2 } from "./corpus.ts";
import { PACK_DEFAULT_TABLE, PACK_ENTRIES, packInputOf } from "./runner.ts";

/** This function gives the id of the member that `pack()` without a strategy uses for an input: `rows` or `maxrects-bl`. */
function packChoiceOf(input: PackInput): string {
  const rects = input.items.map((item) => {
    const r = new Rect<string>();
    r.size.set(item.w, item.h);
    r.locked = item.locked === true;
    return r;
  });
  const outer = new Rect<string>();
  outer.fixedSize = input.container.fixed === "size";
  outer.fixedWidth = input.container.fixed === "width";
  outer.size.set(input.container.w ?? 0, input.container.h ?? 0);
  const choice = defaultLayoutOf(rects, outer);
  if (choice.strategy === "rows") return "rows";
  expect(choice).toEqual({ strategy: "maxrects", rule: "bl" });
  return "maxrects-bl";
}

const SAMPLE = 3;

describe("the pack entry pack", () => {
  const entry = PACK_ENTRIES.find((p) => p.id === "pack")!;
  const inputs = jointCorpus(SET_V2).inputs.map((input) => ({ id: input.id, p: packInputOf(input) })).filter(({ p }) => p.items.length > 1);
  // Up to 3 inputs of each container kind and each choice
  const groups = new Map<string, { id: string; p: PackInput }[]>();
  for (const { id, p } of inputs) {
    const key = `${p.container.fixed}/${packChoiceOf(p)}`;
    const list = groups.get(key) ?? [];
    if (list.length < SAMPLE) list.push({ id, p });
    groups.set(key, list);
  }

  it("is select with the table PACK_DEFAULT_TABLE", () => {
    expect(entry).toEqual({ id: "pack", strategy: "select", options: { table: PACK_DEFAULT_TABLE } });
  });

  it("has inputs of each container kind, and inputs of fixed size with each choice", () => {
    expect([...groups.keys()].sort()).toEqual(["height/rows", "none/rows", "size/maxrects-bl", "size/rows", "width/rows"]);
  });

  it("gives the output of the member that pack() chooses, on the inputs of each kind", () => {
    for (const [key, list] of groups) {
      const member = PACK_ENTRIES.find((p) => p.id === key.split("/")[1])!;
      for (const { id, p } of list) {
        const want = outputHash(packWith(member.strategy, p, member.options));
        expect(outputHash(packWith(entry.strategy, p, entry.options)), `${key} ${id}`).toBe(want);
      }
    }
  }, 120_000);
});
