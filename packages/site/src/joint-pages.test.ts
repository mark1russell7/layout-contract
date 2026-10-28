// The tests of the parts of the joint pages: the form, the input picker, the drawing and the jobs of the worker.
import { checkConfig, configId, joinConfigs, productSpace, splitConfig } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import manifestText from "../../joint/corpus/joint-v2/corpus.json?raw";
import { buildCatalog } from "./build-catalog.ts";
import { OMIT, PACK_STAGE, pairOfConfigs, ROUTE_STAGE } from "./catalog.ts";
import { pairSvg } from "./draw.ts";
import { configOfState, formHtml, parseValue, stateOfConfig } from "./form.ts";
import { boxesOf, parsePicked, pickedText, pickerHtml, PRESETS, refOf, type Picked } from "./inputs.ts";
import { operate } from "./jobs.ts";
import type { WorkerMessage } from "./protocol.ts";

const raw = buildCatalog(manifestText, { packing: "test", highways: "test", contract: "test" });
const catalog = { ...raw, joint: productSpace(raw.pack, raw.route, "joint") };
const facts = (engine: string) => ({ controls: catalog.controls.filter((c) => c.engine === engine), about: {} });

describe("the forms", () => {
  it("gives back each named pair of the joint space from its form states", () => {
    for (const [name, joint] of Object.entries(catalog.joint.named ?? {})) {
      const pack = configOfState(catalog.pack, PACK_STAGE, stateOfConfig(splitConfig(joint, "packing"), PACK_STAGE));
      const route = configOfState(catalog.route, ROUTE_STAGE, stateOfConfig(splitConfig(joint, "highways"), ROUTE_STAGE));
      expect(checkConfig(catalog.pack, pack)).toEqual([]);
      expect(checkConfig(catalog.route, route)).toEqual([]);
      expect(configId(catalog.joint, joinConfigs("joint", [pack, route])), name).toBe(configId(catalog.joint, joint));
      const pair = pairOfConfigs(catalog, pack, route);
      expect(`${pair.pack.id}+${pair.router.id}`).toBe(name);
    }
  });

  it("gives a custom pair an id with the start of its config id", () => {
    const pack = configOfState(catalog.pack, PACK_STAGE, { option: "rows", params: { samples: 16 } });
    const route = configOfState(catalog.route, ROUTE_STAGE, { option: catalog.routers[0]!, params: {} });
    const pair = pairOfConfigs(catalog, pack, route);
    expect(pair.pack.id).toMatch(/^rows~[0-9a-f]{6}$/);
    expect(pair.pack.options).toMatchObject({ samples: 16 });
  });

  it("gives a meta option the form of its member", () => {
    const html = formHtml(catalog.pack, PACK_STAGE, { option: "aspect-fit", params: {} }, facts("packing"), "p.");
    expect(html).toContain('data-option="p.m."');
    expect(html).toContain("<fieldset");
  });

  it("escapes the text of the form", () => {
    const html = formHtml(catalog.route, ROUTE_STAGE, { option: catalog.routers[0]!, params: {} }, { controls: [], about: { [catalog.routers[0]!]: "<script>x</script>" } }, "r.");
    expect(html).not.toContain("<script>");
  });

  it("parses the value of each kind of control", () => {
    expect(parseValue("bool", "", true)).toBe(true);
    expect(parseValue("enum", JSON.stringify(OMIT), false)).toBe(OMIT);
    expect(parseValue("enum", "1.5", false)).toBe(1.5);
    expect(parseValue("int", "7", false)).toBe(7);
  });
});

describe("the input picker", () => {
  it("reads back the text of each kind of choice", () => {
    const choices: Picked[] = [
      { kind: "preset", id: PRESETS[1]!.id },
      { kind: "corpus", id: catalog.inputs[5]!.id },
      { kind: "build", dims: PRESETS[2]!.dims, count: 20, seed: 4 },
    ];
    for (const p of choices) expect(parsePicked(catalog, pickedText(p))).toEqual(p);
  });

  it("refuses a bad text", () => {
    for (const t of ["", "preset:nope", "corpus:joint-v2/nope", "build:7:1:a=b", "javascript:alert(1)"]) expect(parsePicked(catalog, t)).toBeUndefined();
  });

  it("disables the inputs above the cap", () => {
    const html = pickerHtml(catalog, { kind: "preset", id: "quick" }, catalog.compareMaxBoxes);
    const big = catalog.inputs.find((i) => i.boxes > catalog.compareMaxBoxes)!;
    expect(html).toContain(`value="${big.id}" disabled`);
  });

  it("gives the reference and the count of boxes of a choice", () => {
    const row = catalog.inputs[0]!;
    expect(refOf(catalog, { kind: "corpus", id: row.id })).toEqual({ kind: "corpus", spec: row.spec, seed: row.seed, hash: row.hash });
    expect(boxesOf(catalog, { kind: "preset", id: "bundled" })).toBe(100);
  });
});

describe("the drawing", () => {
  it("draws the boxes and the routes, and escapes the label", () => {
    const svg = pairSvg({ w: 10, h: 10, boxes: [0, 0, 4, 4, 5, 5, 4, 4], routes: [[2, 2, 7, 7]] }, `a <b> "c"`);
    expect(svg).toContain('class="boxes"');
    expect(svg).toContain('class="routes"');
    expect(svg).not.toContain("<b>");
  });
});

describe("the jobs of the worker", () => {
  it("posts the input, one view of each pair with the ranks, and the end", () => {
    const messages: WorkerMessage[] = [];
    const packs = catalog.benchPacks.slice(0, 2);
    const routers = catalog.routers.slice(0, 2).map((r) => ({ id: r, router: r, options: {} }));
    operate({ type: "run", job: 1, input: refOf(catalog, { kind: "preset", id: "quick" })!, packs, routers }, (m) => messages.push(m));
    expect(messages[0]!.type).toBe("input");
    const pairs = messages.filter((m) => m.type === "pair");
    expect(pairs).toHaveLength(4);
    expect(messages.at(-1)!.type).toBe("done");
    const last = pairs.at(-1)!;
    if (last.type !== "pair") throw new Error("no pair");
    expect(last.ranks).toHaveLength(4);
    expect(last.ranks.map((r) => r.rank)).toContain(1);
    for (const m of pairs) if (m.type === "pair" && m.view.skipped === undefined) expect(m.view.boxes.length).toBe(40);
  });

  it("refuses an input of the corpus with another hash", () => {
    const row = catalog.inputs[0]!;
    expect(() => operate({ type: "run", job: 2, input: { kind: "corpus", spec: row.spec, seed: row.seed, hash: "bad" }, packs: [], routers: [] }, () => undefined)).toThrow(/hash/);
  });
});
