import { describe, expect, it } from "vitest";
import {
  catalogChoices,
  catalogDefaults,
  catalogKey,
  catalogOptions,
  type CatalogEntry,
  checkCatalog,
  decodeOptionValue,
  encodeOptionValue,
  NODE_POSITIONS_DIMENSION,
  OUTPUT_CLASS_MIN_INPUTS,
  OUTPUT_GRID_PROPERTIES,
  outputGridClass,
  type OutputRow,
  type ParamRoute,
  parseStrategyCatalog,
  type RegistryEntry,
  STRATEGY_CATALOG_SCHEMA,
  STRATEGY_CATALOG_SCHEMAS,
  type StrategyCatalogSource,
  writeStrategyCatalog,
} from "./strategy-catalog.ts";
import type { AnyOption, OptionSchema } from "./strategy-options.ts";
import { STRATEGY_SPACE_SCHEMA, type StrategySpace } from "./strategy-space.ts";

const shelf: CatalogEntry = {
  key: "shelf",
  id: "shelf",
  family: "shelf",
  kind: "single",
  describe: "Rows of items.",
  supports: { itemShape: ["rect"] },
  limits: { nodes: { max: 10000, describe: "Over the limit, the engine refuses the input." } },
  deterministic: true,
  optIn: false,
  options: {
    gap: { type: "number", describe: "The gap.", min: 0, max: 10, special: [Infinity], marks: [0, Infinity], default: Infinity },
    fit: { type: "enum", describe: "The fit.", values: ["first", "best"], default: "first" },
    tight: { type: "boolean", describe: "Tight rows.", default: false, when: { param: "fit", in: ["best"] } },
  },
};
const wrap: CatalogEntry = {
  key: "aspect-fit",
  id: "aspect-fit",
  family: "wrapper",
  kind: "composite",
  describe: "A search on the width.",
  supports: {},
  limits: {},
  deterministic: true,
  determinismNote: "A budget makes the result depend on the speed of the computer.",
  optIn: true,
  options: {
    strategy: { type: "strategy", describe: "The inner strategy.", kinds: ["single"], optionsKey: "options", default: "shelf" },
    options: { type: "object", describe: "The options of the inner strategy.", default: {} },
    members: { type: "list", describe: "The members.", of: { type: "strategy", kinds: ["single"] }, min: 1, max: 2, default: ["shelf"] },
    key: { type: "function", describe: "The key.", noDefault: { reason: "function", describe: "The default is a hash of the input." } },
  },
};
const source: StrategyCatalogSource = { engine: "packing", strategies: [shelf, wrap] };
const registry: readonly RegistryEntry[] = [
  { key: "shelf", defaults: { gap: Infinity, fit: "first" }, optIn: false, limits: { nodes: { max: 10000 } }, run: () => "same" },
  { key: "aspect-fit", defaults: { strategy: "shelf", key: () => 1 }, optIn: true, run: () => "same" },
];
const fileOf = (s: StrategyCatalogSource = source): Record<string, unknown> => JSON.parse(writeStrategyCatalog(s, "1.2.3")) as Record<string, unknown>;
/** This function gives the faults of one entry, after a change of a copy of its file form. */
function faultsOf(key: string, change: (entry: Record<string, unknown>) => void): readonly string[] {
  const doc = fileOf() as { strategies: Record<string, unknown>[] };
  change(doc.strategies.find((s) => s["key"] === key)!);
  const parsed = parseStrategyCatalog(doc);
  return parsed.ok ? [] : parsed.faults;
}
const optionsOf = (entry: Record<string, unknown>): Record<string, Record<string, unknown>> => entry["options"] as Record<string, Record<string, unknown>>;

describe("the writer", () => {
  it("writes the schema, the version, and the keys in order", () => {
    const doc = fileOf() as { schema: string; version: string; strategies: { key: string }[] };
    expect(doc.schema).toBe(STRATEGY_CATALOG_SCHEMAS[0]);
    expect(doc.version).toBe("1.2.3");
    expect(doc.strategies.map((s) => s.key)).toEqual(["aspect-fit", "shelf"]);
  });

  it("writes Infinity as a string in default, special and marks", () => {
    const text = writeStrategyCatalog(source, "1.2.3");
    expect(text).toContain('"default": "Infinity"');
    expect(text).toContain('"special": [\n');
    expect(text).not.toContain("null");
  });

  it("keeps the order of the options, and gives the same bytes for the same source", () => {
    const doc = fileOf() as { strategies: { options: object }[] };
    expect(Object.keys(doc.strategies[1]!.options)).toEqual(["gap", "fit", "tight"]);
    expect(writeStrategyCatalog({ engine: "packing", strategies: [wrap, shelf] }, "1.2.3")).toBe(writeStrategyCatalog(source, "1.2.3"));
  });

  it("refuses values that JSON cannot hold", () => {
    const bad = (o: AnyOption): StrategyCatalogSource => ({ engine: "e", strategies: [{ ...shelf, options: { o } }] });
    expect(() => writeStrategyCatalog(bad({ type: "number", describe: "x", min: 0, max: 1, default: Number.NaN }), "1")).toThrow(/JSON cannot hold/);
    expect(() => writeStrategyCatalog(bad({ type: "object", describe: "x", default: { a: Infinity } }), "1")).toThrow(/JSON cannot hold/);
    expect(() => writeStrategyCatalog(bad({ type: "object", describe: "x", default: [undefined] }), "1")).toThrow(/JSON cannot hold/);
    expect(() => writeStrategyCatalog(bad({ type: "object", describe: "x", default: () => 1 }), "1")).toThrow(/JSON cannot hold/);
  });

  it("refuses a field that is not in the format, and a catalog that breaks a rule", () => {
    const extra = { type: "boolean", describe: "x", default: true, label: "y" } as AnyOption;
    expect(() => writeStrategyCatalog({ engine: "e", strategies: [{ ...shelf, options: { extra } }] }, "1")).toThrow(/label/);
    expect(() => writeStrategyCatalog({ engine: "e", strategies: [{ ...shelf, key: "other" }] }, "1")).toThrow(/breaks the format/);
  });
});

describe("the parser", () => {
  it("gives the same catalog after a round trip, with the numbers restored", () => {
    const parsed = parseStrategyCatalog(fileOf());
    if (!parsed.ok) throw new Error(parsed.faults.join(" "));
    expect(parsed.catalog.strategies.map((s) => s.key)).toEqual(["aspect-fit", "shelf"]);
    const entry = parsed.catalog.strategies[1]!;
    expect(entry).toEqual(shelf);
    expect(entry.options["gap"]).toMatchObject({ default: Infinity, special: [Infinity], marks: [0, Infinity] });
    expect(parsed.catalog.strategies[0]).toEqual(wrap);
    expect(writeStrategyCatalog(parsed.catalog, "1.2.3")).toBe(writeStrategyCatalog(source, "1.2.3"));
  });

  it("refuses what is not a catalog", () => {
    expect(parseStrategyCatalog(null)).toEqual({ ok: false, faults: ["The catalog is not an object."] });
    expect(parseStrategyCatalog({ ...fileOf(), strategies: 1 })).toMatchObject({ ok: false });
    const parsed = parseStrategyCatalog({ ...fileOf(), schema: "strategy-catalog/3", engine: "", version: 1, extra: true });
    expect(parsed.ok ? [] : parsed.faults).toHaveLength(4);
  });

  it("refuses bad entry fields", () => {
    expect(faultsOf("shelf", (e) => (e["kind"] = "other"))).toContain('The strategy shelf: "kind" is unknown.');
    expect(faultsOf("shelf", (e) => (e["optIn"] = 1))).toContain('The strategy shelf: "optIn" is not true or false.');
    expect(faultsOf("shelf", (e) => (e["key"] = "a/shelf"))[0]).toContain("does not follow");
    expect(faultsOf("shelf", (e) => (e["other"] = 1))[0]).toContain('"other" is unknown');
    expect(faultsOf("shelf", (e) => (e["supports"] = { a: 1 }))[0]).toContain("record of text lists");
    expect(faultsOf("shelf", (e) => (e["step"] = 1))[0]).toContain('"step"');
    expect(faultsOf("shelf", (e) => (e["determinismNote"] = 1))[0]).toContain("determinismNote");
    expect(faultsOf("shelf", (e) => (e["options"] = 1))[0]).toContain('"options" is not an object');
    expect(faultsOf("shelf", (e) => (e["describe"] = ""))[0]).toContain('"describe"');
  });

  it("refuses unsorted and repeated keys", () => {
    const doc = fileOf() as { strategies: unknown[] };
    const parsed = parseStrategyCatalog({ ...doc, strategies: [doc.strategies[1], doc.strategies[0]] });
    expect(parsed.ok ? [] : parsed.faults).toContain("The key aspect-fit is out of order.");
    const twice = parseStrategyCatalog({ ...doc, strategies: [doc.strategies[1], doc.strategies[1]] });
    expect(twice.ok ? [] : twice.faults).toContain("The key shelf is not unique.");
  });

  it("refuses bad limits", () => {
    expect(faultsOf("shelf", (e) => (e["limits"] = 1))[0]).toContain('"limits" is not an object');
    expect(faultsOf("shelf", (e) => (e["limits"] = { nodes: 1 }))[0]).toContain("is not an object");
    expect(faultsOf("shelf", (e) => (e["limits"] = { nodes: { describe: "x" } }))[0]).toContain('no "min" and no "max"');
    expect(faultsOf("shelf", (e) => (e["limits"] = { nodes: { max: "Infinity", describe: "x" } }))[0]).toContain("finite");
    expect(faultsOf("shelf", (e) => (e["limits"] = { nodes: { min: 2, max: 1 } }))).toHaveLength(2);
  });

  it("states exactly one of default and noDefault", () => {
    expect(faultsOf("shelf", (e) => delete optionsOf(e)["fit"]!["default"])[0]).toContain('neither of "default" and "noDefault"');
    expect(faultsOf("shelf", (e) => (optionsOf(e)["fit"]!["noDefault"] = { reason: "unset", describe: "x" }))[0]).toContain("both");
    const reason = (noDefault: unknown): readonly string[] =>
      faultsOf("shelf", (e) => {
        delete optionsOf(e)["fit"]!["default"];
        optionsOf(e)["fit"]!["noDefault"] = noDefault;
      });
    expect(reason({ reason: "other", describe: "x" })[0]).toContain("reason");
    expect(reason({ reason: "unset" })[0]).toContain("no description");
    expect(reason(1)[0]).toContain("not an object");
    expect(reason({ reason: "derived", describe: "The engine calculates it." })).toEqual([]);
  });

  it("refuses bad number fields", () => {
    const gap = (f: string, v: unknown): readonly string[] => faultsOf("shelf", (e) => (optionsOf(e)["gap"]![f] = v));
    expect(gap("min", "Infinity")[0]).toContain('"min" is not a finite number');
    expect(gap("step", "x")[0]).toContain('"step"');
    expect(gap("scale", "x")[0]).toContain('"scale"');
    expect(gap("special", 1)[0]).toContain("is not a list");
    expect(gap("marks", ["x"])[0]).toContain("not a number");
    expect(gap("values", ["Infinity"])[0]).toContain('"values"');
    expect(gap("default", "x")[0]).toContain("the default is not a number");
    expect(gap("default", 99)[0]).toContain("out of the range");
    expect(gap("other", 1)[0]).toContain('"other" is unknown');
  });

  it("refuses bad fields of the other types", () => {
    const option = (key: string, name: string, f: string, v: unknown): readonly string[] => faultsOf(key, (e) => (optionsOf(e)[name]![f] = v));
    expect(option("shelf", "tight", "default", 1)[0]).toContain("not true or false");
    expect(option("shelf", "fit", "values", 1)[0]).toContain('"values"');
    expect(option("shelf", "fit", "custom", "x")[0]).toContain('"custom"');
    expect(option("shelf", "fit", "type", "other")[0]).toContain("unknown");
    expect(option("aspect-fit", "key", "default", "x")[0]).toContain("no default in JSON");
    expect(option("aspect-fit", "strategy", "step", 1)[0]).toContain('"step"');
    expect(option("aspect-fit", "strategy", "kinds", ["x"])[0]).toContain('"kinds"');
    expect(option("aspect-fit", "strategy", "optionsKey", 1)[0]).toContain('"optionsKey"');
    expect(option("aspect-fit", "strategy", "default", {})[0]).toContain("not the key of a strategy");
    expect(option("aspect-fit", "members", "min", 0.5)[0]).toContain('"min"');
    expect(option("aspect-fit", "members", "default", 1)[0]).toContain("not a list");
    expect(option("aspect-fit", "members", "max", 0)[0]).toContain('"min" is more than "max"');
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["members"]!["of"] = { type: "strategy", describe: "x" }))[0]).toContain('an item of a list has no "describe"');
    expect(faultsOf("shelf", (e) => (optionsOf(e)["fit"] = 1 as never))[0]).toContain("is not an object");
    expect(faultsOf("shelf", (e) => (optionsOf(e)["fit"] = {}))[0]).toContain("has no type");
    expect(faultsOf("shelf", (e) => delete optionsOf(e)["fit"]!["describe"])[0]).toContain("no description");
  });

  it("refuses a condition on a later option or a bad condition", () => {
    expect(faultsOf("shelf", (e) => (optionsOf(e)["gap"]!["when"] = { param: "fit", in: ["best"] }))[0]).toContain("not an earlier option");
    expect(faultsOf("shelf", (e) => (optionsOf(e)["tight"]!["when"] = { param: "fit" }))[0]).toContain('"when" has no');
    expect(faultsOf("shelf", (e) => (optionsOf(e)["tight"]!["when"] = { param: "fit", in: [], x: 1 }))[0]).toContain('"x" is unknown');
  });

  it("refuses a reference that the catalog does not hold", () => {
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["strategy"]!["default"] = "other"))[0]).toContain("not a strategy that the option takes");
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["strategy"]!["kinds"] = ["shape"]))[0]).toContain("takes no strategy of the catalog");
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["strategy"]!["step"] = "router"))[0]).toContain("takes no strategy of the catalog");
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["strategy"]!["optionsKey"] = "key"))[0]).toContain('"optionsKey" does not name');
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["members"]!["default"] = ["other"]))[0]).toContain("not a strategy that the option takes");
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["members"]!["default"] = []))[0]).toContain("fewer than 1");
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["members"]!["default"] = ["shelf", "shelf", "shelf"]))[0]).toContain("more than 2");
  });
});

describe("the output of a strategy", () => {
  const row = (property: string, rowClass: string, inputs: number, fractionalInputs: number, nearWholeInputs = 0, optionSet = "default"): OutputRow => ({
    property,
    class: rowClass,
    evidence: { inputs, fractionalInputs, nearWholeInputs, source: "made-up-family", optionSet, catalogVersion: "1.2.3" },
  });
  const withRows = (output: readonly OutputRow[]): StrategyCatalogSource => ({ engine: "packing", strategies: [{ ...shelf, output }, wrap] });
  /** This function gives the faults of a schema 2 file whose entry `shelf` has this `output`. */
  const outputFaults = (output: unknown): readonly string[] => {
    const doc = fileOf() as { schema: string; strategies: Record<string, unknown>[] };
    doc.schema = STRATEGY_CATALOG_SCHEMA;
    doc.strategies.find((s) => s["key"] === "shelf")!["output"] = output;
    const parsed = parseStrategyCatalog(doc);
    return parsed.ok ? [] : parsed.faults;
  };

  it("names the two schemas, and the newest is the last", () => {
    expect(STRATEGY_CATALOG_SCHEMAS).toEqual(["strategy-catalog/1", "strategy-catalog/2"]);
    expect(STRATEGY_CATALOG_SCHEMAS.at(-1)).toBe(STRATEGY_CATALOG_SCHEMA);
    expect(OUTPUT_GRID_PROPERTIES).toEqual(["position-grid", "size-grid"]);
  });

  it("keeps schema 1 and its bytes for a catalog with no output", () => {
    const text = writeStrategyCatalog(source, "1.2.3");
    expect(JSON.parse(text)).toMatchObject({ schema: "strategy-catalog/1" });
    const parsed = parseStrategyCatalog(JSON.parse(text));
    if (!parsed.ok) throw new Error(parsed.faults.join(" "));
    expect(parsed.catalog.schema).toBe("strategy-catalog/1");
    expect(writeStrategyCatalog(parsed.catalog, "1.2.3")).toBe(text);
    expect(text).not.toContain("output");
  });

  it("writes a catalog with no output byte for byte as schema 1", () => {
    const entry: CatalogEntry = { key: "a", id: "a", family: "f", kind: "single", describe: "d", supports: {}, limits: {}, deterministic: true, optIn: false, options: {} };
    const fields = '{\n      "key": "a",\n      "id": "a",\n      "family": "f",\n      "kind": "single",\n      "describe": "d",\n      "supports": {},\n      "limits": {},\n      "deterministic": true,\n      "optIn": false,\n      "options": {}\n    }';
    const text = `{\n  "schema": "strategy-catalog/1",\n  "engine": "e",\n  "version": "1.2.3",\n  "strategies": [\n    ${fields}\n  ]\n}\n`;
    expect(writeStrategyCatalog({ engine: "e", strategies: [entry] }, "1.2.3")).toBe(text);
  });

  it("gives a row no other effect on the file than the schema and the field", () => {
    const doc = JSON.parse(writeStrategyCatalog(withRows([row("position-grid", "whole", 240, 0)]), "1.2.3")) as { schema: string; strategies: Record<string, unknown>[] };
    expect(doc.schema).toBe("strategy-catalog/2");
    delete doc.strategies.find((s) => s["key"] === "shelf")!["output"];
    doc.schema = "strategy-catalog/1";
    expect(`${JSON.stringify(doc, null, 2)}\n`).toBe(writeStrategyCatalog(source, "1.2.3"));
  });

  it("writes schema 2 for a catalog with output, and reads the same rows back", () => {
    const rows = [row("position-grid", "whole", 240, 0), row("size-grid", "fractional", 240, 25), row("position-grid", "fractional", 6, 6, 0, "bench-entries")];
    const text = writeStrategyCatalog(withRows(rows), "1.2.3");
    expect(JSON.parse(text)).toMatchObject({ schema: STRATEGY_CATALOG_SCHEMA });
    const parsed = parseStrategyCatalog(JSON.parse(text));
    if (!parsed.ok) throw new Error(parsed.faults.join(" "));
    expect(parsed.catalog.schema).toBe(STRATEGY_CATALOG_SCHEMA);
    expect(parsed.catalog.strategies.find((s) => s.key === "shelf")?.output).toEqual(rows);
    expect(parsed.catalog.strategies.find((s) => s.key === "aspect-fit")).not.toHaveProperty("output");
    expect(writeStrategyCatalog(parsed.catalog, "1.2.3")).toBe(text);
  });

  it("reads a schema 2 file with no output", () => {
    expect(parseStrategyCatalog({ ...fileOf(), schema: STRATEGY_CATALOG_SCHEMA }).ok).toBe(true);
  });

  it("refuses output in a schema 1 file", () => {
    expect(faultsOf("shelf", (e) => (e["output"] = [row("position-grid", "whole", 240, 0)]))).toEqual([`The strategy shelf: the field "output" needs the schema ${STRATEGY_CATALOG_SCHEMA}.`]);
  });

  it("takes the class from the counts: one fraction proves fractional at any count", () => {
    const of = (inputs: number, fractionalInputs: number, nearWholeInputs = 0): string => outputGridClass({ inputs, fractionalInputs, nearWholeInputs });
    expect(OUTPUT_CLASS_MIN_INPUTS).toBe(30);
    expect([of(6, 6), of(24, 4), of(240, 1), of(1, 1)]).toEqual(["fractional", "fractional", "fractional", "fractional"]);
    expect([of(0, 0), of(12, 0), of(29, 0), of(29, 0, 3)]).toEqual(["untested", "untested", "untested", "untested"]);
    expect([of(30, 0), of(240, 0)]).toEqual(["whole", "whole"]);
    expect([of(30, 0, 1), of(240, 0, 240)]).toEqual(["near-whole", "near-whole"]);
    expect(of(240, 1, 5)).toBe("fractional");
  });

  it.each([
    ["whole", 29, 0, 0, "untested"],
    ["whole", 240, 1, 0, "fractional"],
    ["whole", 240, 0, 1, "near-whole"],
    ["untested", 6, 6, 0, "fractional"],
    ["untested", 30, 0, 0, "whole"],
    ["fractional", 240, 0, 0, "whole"],
    ["near-whole", 240, 0, 0, "whole"],
    ["near-whole", 12, 0, 12, "untested"],
    ["round", 240, 0, 0, "whole"],
  ])("refuses the class %s of a grid property on %i inputs, %i fractional, %i near-whole", (rowClass, inputs, fractional, near, expected) => {
    const faults = outputFaults([row("size-grid", rowClass, inputs, fractional, near)]);
    expect(faults).toEqual([`The strategy shelf: the output row 0: the evidence gives the class "${expected}".`]);
  });

  it("keeps an open property: its class is a text, with no rule on the counts", () => {
    const open: OutputRow = { property: "edge-order", class: "stable", evidence: { inputs: 3, source: "a-study", optionSet: "default", catalogVersion: "1.2.3" } };
    expect(outputFaults([open])).toEqual([]);
    expect(outputFaults([{ ...open, evidence: { ...open.evidence, fractionalInputs: 9 } }])).toEqual([]);
    expect(outputFaults([{ ...open, evidence: { ...open.evidence, fractionalInputs: -1 } }])).toEqual([`The strategy shelf: the output row 0: the evidence field "fractionalInputs" is not a count.`]);
  });

  it("refuses a grid row with no counts, or with counts over the inputs", () => {
    const { fractionalInputs: _f, ...noCount } = row("position-grid", "whole", 240, 0).evidence;
    expect(outputFaults([{ ...row("position-grid", "whole", 240, 0), evidence: noCount }])).toEqual([`The strategy shelf: the output row 0: the evidence field "fractionalInputs" is not a count.`]);
    expect(outputFaults([row("position-grid", "fractional", 5, 4, 3)])).toEqual([`The strategy shelf: the output row 0: the fractional and near-whole counts are more than the inputs.`]);
  });

  it("refuses a bad list, a bad row and a bad evidence", () => {
    const good = row("position-grid", "whole", 240, 0);
    const at = "The strategy shelf: the output row 0";
    expect(outputFaults([])).toEqual([`The strategy shelf: "output" is not a list with rows.`]);
    expect(outputFaults({})).toEqual([`The strategy shelf: "output" is not a list with rows.`]);
    expect(outputFaults(["x"])).toEqual([`${at} is not an object.`]);
    expect(outputFaults([{ ...good, extra: 1 }])).toEqual([`${at}: the field "extra" is unknown.`]);
    expect(outputFaults([{ ...good, evidence: { ...good.evidence, extra: 1 } }])).toEqual([`${at}: the evidence: the field "extra" is unknown.`]);
    expect(outputFaults([{ ...good, evidence: "x" }])).toEqual([`${at}: "evidence" is not an object.`]);
    expect(outputFaults([{ ...good, property: " " }])).toContain(`${at}: "property" is not a text.`);
    expect(outputFaults([{ ...good, evidence: { ...good.evidence, source: "" } }])).toEqual([`${at}: the evidence field "source" is not a text.`]);
    expect(outputFaults([{ ...good, evidence: { ...good.evidence, inputs: 1.5 } }])).toContain(`${at}: the evidence field "inputs" is not a count.`);
  });

  it("refuses two rows for one property and option set, and takes two option sets", () => {
    const whole = row("position-grid", "whole", 240, 0);
    expect(outputFaults([whole, whole])).toEqual([`The strategy shelf: the output row 1: the property and the option set are not unique.`]);
    expect(outputFaults([whole, row("position-grid", "whole", 240, 0, 0, "bench-entries")])).toEqual([]);
  });

  it("throws from the writer for a row that breaks a rule", () => {
    expect(() => writeStrategyCatalog(withRows([row("position-grid", "whole", 12, 0)]), "1.2.3")).toThrow(/the evidence gives the class "untested"/);
  });
});

describe("the options inside a value", () => {
  const wide: CatalogEntry = { ...shelf, key: "wide", id: "wide", optIn: true, options: {} };
  const member = { strategy: "shelf", options: { fit: "best", gap: "Infinity" }, id: "shelf-best" };
  const outer = (options: CatalogEntry["options"]): CatalogEntry => ({ ...wrap, key: "outer", id: "outer", options });
  const outerBase = (base: CatalogEntry): CatalogEntry => outer({ member: { type: "strategy", describe: "x", default: base.key } });

  it("takes a member as a default, alone and in a list, and keeps its bytes", () => {
    const entry = outer({
      member: { type: "strategy", describe: "The member.", inlineOptions: true, default: member },
      members: { type: "list", describe: "The members.", of: { type: "strategy", inlineOptions: true }, default: ["shelf", member] },
    });
    const s: StrategyCatalogSource = { engine: "packing", strategies: [entry, shelf] };
    const text = writeStrategyCatalog(s, "1.0.0");
    const parsed = parseStrategyCatalog(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(writeStrategyCatalog(parsed.catalog, "1.0.0")).toBe(text);
    expect(catalogDefaults(entry)["member"]).toEqual(member);
  });

  it("refuses a member without the field, a bad member and both forms", () => {
    const write = (o: AnyOption): (() => string) => () => writeStrategyCatalog({ engine: "packing", strategies: [outer({ member: o }), shelf] }, "1.0.0");
    expect(write({ type: "strategy", describe: "x", default: member })).toThrow(/not the key of a strategy/);
    expect(write({ type: "strategy", describe: "x", inlineOptions: true, default: { strategy: "shelf", other: 1 } })).toThrow(/not the key of a strategy/);
    expect(write({ type: "strategy", describe: "x", inlineOptions: true, optionsKey: "o", default: "shelf" })).toThrow(/two places/);
    expect(write({ type: "strategy", describe: "x", inlineOptions: 1 as never, default: "shelf" })).toThrow(/not true or false/);
    expect(write({ type: "list", describe: "x", of: { type: "strategy", optionsKey: "o" }, default: [] })).toThrow(/no sibling/);
  });

  it("examines the options of a member against the chosen strategy", () => {
    const write = (m: unknown): (() => string) => () => writeStrategyCatalog({ engine: "packing", strategies: [outer({ member: { type: "strategy", describe: "x", inlineOptions: true, default: m } as AnyOption }), shelf] }, "1.0.0");
    expect(write({ strategy: "shelf", options: { other: 1 } })).toThrow(/no such option/);
    expect(write({ strategy: "shelf", options: { fit: "worst" } })).toThrow(/takes first, best/);
    expect(write({ strategy: "other" })).toThrow(/"other" is not a strategy/);
    expect(write({ strategy: "shelf" })).not.toThrow();
  });

  it("leaves out the opt-in strategies, and refuses one as a default", () => {
    const strategies = [shelf, wide];
    expect(catalogChoices(strategies, { type: "strategy", describe: "x", optIn: false }).map((e) => e.key)).toEqual(["shelf"]);
    expect(catalogChoices(strategies, { type: "strategy", describe: "x" }).map((e) => e.key)).toEqual(["shelf", "wide"]);
    expect(catalogChoices(strategies, { type: "list", describe: "x", of: { type: "strategy", optIn: true } }).map((e) => e.key)).toEqual(["wide"]);
    expect(catalogChoices(strategies, { type: "boolean", describe: "x" })).toEqual([]);
    expect(catalogChoices(strategies, { type: "list", describe: "x" })).toEqual([]);
    const bad = outer({ member: { type: "strategy", describe: "x", optIn: false, default: "wide" } });
    expect(() => writeStrategyCatalog({ engine: "packing", strategies: [bad, shelf, wide] }, "1.0.0")).toThrow(/"wide" is not a strategy/);
  });

  it("keeps a baseline out of each choice, and compares it with the engine", () => {
    const base: CatalogEntry = { ...wide, key: "base", id: "base", baseline: true };
    const strategies = [shelf, wide, base];
    expect(catalogChoices(strategies).map((e) => e.key)).toEqual(["shelf", "wide"]);
    expect(catalogChoices(strategies, { type: "strategy", describe: "x" }).map((e) => e.key)).toEqual(["shelf", "wide"]);
    expect(catalogChoices(strategies, { type: "strategy", describe: "x", optIn: true }).map((e) => e.key)).toEqual(["wide"]);
    const s: StrategyCatalogSource = { engine: "packing", strategies: [base, shelf] };
    const text = writeStrategyCatalog(s, "1.0.0");
    expect(text).toContain('"baseline": true');
    expect(text.indexOf('"baseline"')).toBeGreaterThan(text.indexOf('"optIn"'));
    const parsed = parseStrategyCatalog(JSON.parse(text));
    expect(parsed.ok && parsed.catalog.strategies[0]?.baseline).toBe(true);
    const limits = { nodes: { max: 10000 } };
    expect(checkCatalog(s, [{ key: "base", defaults: {}, optIn: true, baseline: true, limits, run: () => "a" }, registry[0]!]).faults).toEqual([]);
    expect(checkCatalog(s, [{ key: "base", defaults: {}, optIn: true, limits, run: () => "a" }, registry[0]!]).faults[0]).toContain('"baseline" differs');
    const bad = (e: CatalogEntry): (() => string) => () => writeStrategyCatalog({ engine: "packing", strategies: [e] }, "1.0.0");
    expect(bad({ ...base, optIn: false })).toThrow(/a baseline has "optIn" true/);
    const file = JSON.parse(text) as { strategies: Record<string, unknown>[] };
    file.strategies[0]!["baseline"] = false;
    const refused = parseStrategyCatalog(file);
    expect(!refused.ok && refused.faults[0]).toContain('"baseline" is not true');
    const inner = outerBase(base);
    expect(() => writeStrategyCatalog({ engine: "packing", strategies: [inner, base, shelf] }, "1.0.0")).toThrow(/"base" is not a strategy/);
  });

  it("keeps a live member on the declaration, and compares it", () => {
    const schema: Record<string, AnyOption> = { member: { type: "strategy", describe: "x", inlineOptions: true } };
    expect(catalogOptions({ member }, schema)["member"]?.default).toEqual(member);
    const entry = outer({ member: { ...schema["member"], default: member } as AnyOption });
    const s: StrategyCatalogSource = { engine: "packing", strategies: [entry, shelf] };
    const run = (live: unknown): readonly string[] => checkCatalog(s, [{ key: "outer", defaults: { member: live }, optIn: true }, registry[0]!]).faults;
    expect(run(member)).toEqual([]);
    expect(run({ ...member, id: "other" })[0]).toContain("differs from the live default");
  });

  it("runs each strategy that an option offers", () => {
    const entry = outer({ member: { type: "strategy", describe: "x", optIn: false, default: "shelf" } });
    const s: StrategyCatalogSource = { engine: "packing", strategies: [entry, shelf, wide] };
    const live: readonly RegistryEntry[] = [{ key: "outer", defaults: {}, optIn: true }, registry[0]!, { key: "wide", defaults: {}, optIn: true, limits: { nodes: { max: 10000 } } }];
    const seen: string[] = [];
    const taken = checkCatalog(s, live, { refusesChoice: (owner, option, choice) => (seen.push(`${owner} ${option} ${choice}`), false) });
    expect(seen).toEqual(["outer member shelf"]);
    expect(taken.notRun.filter((n) => n.includes("option"))).toEqual([]);
    expect(checkCatalog(s, live, { refusesChoice: () => true }).faults.at(-1)).toContain("the engine refuses it");
    expect(checkCatalog(s, live, { refusesChoice: () => undefined }).notRun.join(" ")).toContain("cannot go to this strategy");
    const stopped = checkCatalog(s, live, {
      refusesChoice: () => {
        throw new Error("no input");
      },
    });
    expect(stopped.notRun.join(" ")).toContain("no input");
  });
});

describe("one value by its declaration", () => {
  const number: AnyOption = { type: "number", describe: "x", min: 0, max: 1 };
  const list: AnyOption = { type: "list", describe: "x", of: { type: "number", min: 0, max: 1 } };

  it("restores Infinity in a number option and in a list of numbers", () => {
    expect(decodeOptionValue("Infinity", number)).toBe(Infinity);
    expect(decodeOptionValue("-Infinity", number)).toBe(-Infinity);
    expect(decodeOptionValue(0.5, number)).toBe(0.5);
    expect(decodeOptionValue(["Infinity", 1], list)).toEqual([Infinity, 1]);
  });

  it("keeps each other value", () => {
    expect(decodeOptionValue("Infinity", { type: "enum", describe: "x", values: ["Infinity"] })).toBe("Infinity");
    expect(decodeOptionValue("x", number)).toBe("x");
    expect(decodeOptionValue(1, list)).toBe(1);
  });

  it("is the inverse of the encoder", () => {
    for (const value of [Infinity, -Infinity, 0.5]) expect(decodeOptionValue(encodeOptionValue(value, number), number)).toBe(value);
    expect(encodeOptionValue(Infinity, number)).toBe("Infinity");
    expect(encodeOptionValue([Infinity], list)).toEqual(["Infinity"]);
    expect(encodeOptionValue("x", { type: "object", describe: "x" })).toBe("x");
  });
});

describe("the builders", () => {
  it("gives the key from the step and the id", () => {
    expect(catalogKey("keys", "group")).toBe("group/keys");
    expect(catalogKey("shelf")).toBe("shelf");
  });

  it("gives the defaults of an entry", () => {
    expect(catalogDefaults(shelf)).toEqual({ gap: Infinity, fit: "first", tight: false });
    expect(catalogDefaults(wrap)).not.toHaveProperty("key");
  });

  it("puts live defaults on the declarations, with no function", () => {
    const schema: Readonly<Record<string, AnyOption>> = {
      gap: { type: "number", describe: "x", min: 0, max: 1, default: 1 },
      side: { type: "number", describe: "x", min: 0, max: 1, default: 1 },
      rule: { type: "enum", describe: "x", values: ["a"], custom: "function", noDefault: { reason: "function", describe: "The default is code." } },
      router: { type: "strategy", describe: "x" },
      other: { type: "strategy", describe: "x" },
      open: { type: "boolean", describe: "x", noDefault: { reason: "unset", describe: "Off." } },
    };
    const out = catalogOptions({ gap: 0, rule: () => 1, router: { name: "r" }, other: { name: "o" } }, schema, { strategyKey: (v) => ((v as { name: string }).name === "r" ? "router/r" : undefined) });
    expect(out["gap"]).toMatchObject({ default: 0 });
    expect(out["side"]).toMatchObject({ default: 1 });
    expect(out["rule"]).not.toHaveProperty("default");
    expect(out["router"]).toMatchObject({ default: "router/r" });
    expect(out["other"]).not.toHaveProperty("default");
    expect(out["open"]).not.toHaveProperty("default");
    expect(catalogOptions({ router: {} }, schema)["router"]).not.toHaveProperty("default");
  });
});

describe("the check against the engine", () => {
  it("passes a good catalog", () => {
    expect(checkCatalog(source, registry)).toEqual({ faults: [], notRun: [], notMatched: [], spaceOnly: [] });
  });

  it("finds a strategy on one side only, and a difference of optIn", () => {
    const { faults } = checkCatalog(source, [registry[0]!, { key: "other", defaults: {}, optIn: false }]);
    expect(faults).toContain("other is in the engine, and not in the catalog.");
    expect(faults).toContain("aspect-fit is in the catalog, and not in the engine.");
    expect(checkCatalog(source, [{ ...registry[0]!, optIn: true }, registry[1]!]).faults[0]).toContain('"optIn" is false');
  });

  it("finds a default with no declaration, a different default and undeclared code", () => {
    const run = (defaults: Record<string, unknown>): readonly string[] => checkCatalog(source, [{ ...registry[0]!, defaults }, registry[1]!]).faults;
    expect(run({ other: 1 })[0]).toContain('"other" has no declaration');
    expect(run({ fit: "best" })[0]).toContain('"fit" differs');
    expect(run({ fit: () => 1 })[0]).toContain("is code");
  });

  it("compares the limits with the code", () => {
    const { faults } = checkCatalog(source, [{ ...registry[0]!, limits: { nodes: { max: 5 } } }, registry[1]!]);
    expect(faults[0]).toContain('"limits" differ');
  });

  it("reports a catalog that breaks the format, and a round trip that changes it", () => {
    const bad: StrategyCatalogSource = { engine: "e", strategies: [{ ...shelf, kind: "other" as "single" }] };
    expect(checkCatalog(bad, [registry[0]!]).faults[0]).toContain("breaks the format");
    expect(checkCatalog({ engine: "e", strategies: [{ ...shelf, options: { f: { type: "function", describe: "x" } } }] }, [{ ...registry[0]!, defaults: {} }]).faults[0]).toContain("neither");
  });

  it("runs each deterministic entry two times", () => {
    let i = 0;
    const flaky = { ...registry[0]!, run: () => String(i++) };
    expect(checkCatalog(source, [flaky, registry[1]!]).faults[0]).toContain("two runs differ");
    const free = { ...source, strategies: [{ ...shelf, deterministic: false }, wrap] };
    expect(checkCatalog(free, [flaky, registry[1]!]).faults).toEqual([]);
  });

  it("names each entry that does not run", () => {
    const { run: _unused, ...norun } = registry[0]!;
    const throws = { ...registry[1]!, run: () => { throw new Error("too large"); } };
    const stated = { ...registry[1]!, run: () => { throw "plain"; } };
    expect(checkCatalog(source, [norun, throws]).notRun).toEqual(["shelf: the engine gives no fixture.", "aspect-fit: too large"]);
    expect(checkCatalog(source, [norun, stated]).notRun[1]).toBe("aspect-fit: plain");
  });

  it("compares a refusal with supports", () => {
    const probe = (refused: boolean): readonly string[] =>
      checkCatalog(source, registry, { probes: [{ field: "itemShape", value: "circle", refuses: (key) => (key === "shelf" ? refused : false) }] }).faults;
    expect(probe(true)).toEqual([]);
    expect(probe(false)[0]).toContain('"supports" refuses the value, and the engine takes it');
    const moved = checkCatalog(source, registry, { probes: [{ field: NODE_POSITIONS_DIMENSION, value: "host", refuses: (key) => key === "shelf" }] });
    expect(moved.faults[0]).toContain('shelf on nodePositions host: "supports" takes the value, and the engine refuses it');
  });

  it("names a probe that does not run", () => {
    const check = checkCatalog(source, registry, { probes: [{ field: "itemShape", value: "rect", refuses: (key) => { if (key === "shelf") throw new Error("no fixture"); return undefined; } }] });
    expect(check.notRun).toEqual(["shelf on itemShape rect: no fixture", "aspect-fit on itemShape rect: the input cannot go to this strategy."]);
    const plain = checkCatalog(source, registry, { probes: [{ field: "x", value: "y", refuses: () => { throw "plain"; } }] });
    expect(plain.notRun[0]).toBe("shelf on x y: plain");
  });

  it("examines each param of a space against its declaration", () => {
    const space = (params: StrategySpace["stages"][number]["options"][number]["params"], id = "shelf"): StrategySpace => ({
      schema: STRATEGY_SPACE_SCHEMA,
      engine: "packing",
      version: "1",
      stages: [{ name: "placement", options: [{ id, params }] }],
    });
    const check = (s: StrategySpace) => checkCatalog(source, registry, { spaces: [s] });
    expect(check(space([{ name: "gap", kind: "real", min: 0, max: 5, default: 1 }]))).toEqual({ faults: [], notRun: [], notMatched: [], spaceOnly: [] });
    expect(check(space([{ name: "fit", kind: "enum", values: ["first", "worst"], default: "first" }])).faults[0]).toContain("outside the declaration");
    expect(check(space([{ name: "gap", kind: "real", min: 0, max: 50, default: 1 }])).faults[0]).toContain("out of the range");
    expect(check(space([{ name: "other", kind: "bool", default: true }])).notMatched).toEqual(["placement/shelf.other"]);
    expect(check(space([], "order")).notMatched).toEqual(["placement/order"]);
  });

  describe("with routes", () => {
    type Params = StrategySpace["stages"][number]["options"][number]["params"];
    const space = (params: Params, id = "shelf"): StrategySpace => ({
      schema: STRATEGY_SPACE_SCHEMA,
      engine: "packing",
      version: "1",
      stages: [{ name: "placement", options: [{ id, params }] }],
    });
    const check = (s: StrategySpace, paramRoutes: Readonly<Record<string, ParamRoute>>) => checkCatalog(source, registry, { spaces: [s], paramRoutes });
    const fit: Params = [{ name: "fit", kind: "enum", values: ["none", "first"], default: "none" }];

    it("examines the value of the option, not the value of the param", () => {
      expect(check(space(fit), {}).faults[0]).toContain("takes first, best, not none");
      const none = (value: unknown): unknown => (value === "none" ? undefined : value);
      expect(check(space(fit), { "placement/shelf.fit": { value: none } })).toEqual({ faults: [], notRun: [], notMatched: [], spaceOnly: [] });
      const bad = (value: unknown): unknown => (value === "none" ? "worst" : value);
      expect(check(space(fit), { "placement/shelf.fit": { value: bad } }).faults[0]).toContain("takes first, best, not worst");
    });

    it("reads the option of a route with another name", () => {
      const params: Params = [{ name: "mode", kind: "enum", values: ["first"], default: "first" }];
      expect(check(space(params), { "placement/shelf.mode": { option: "fit" } }).faults).toEqual([]);
      expect(check(space(params), { "placement/shelf.mode": { option: "gone" } }).faults).toEqual(['shelf: the route "placement/shelf.mode" names "gone", and the strategy has no such option.']);
    });

    it("gives a fault for a route that fails", () => {
      const fail = (): unknown => {
        throw new Error("no such name");
      };
      const plain = (): unknown => {
        throw "plain";
      };
      expect(check(space(fit), { "placement/shelf.fit": { value: fail } }).faults[0]).toBe('shelf: the route "placement/shelf.fit" fails on none: no such name');
      expect(check(space(fit), { "placement/shelf.fit": { value: plain } }).faults[0]).toBe('shelf: the route "placement/shelf.fit" fails on none: plain');
    });

    it("moves a stated param and a stated stage option out of notMatched, with the reason", () => {
      const flag: Params = [{ name: "flag", kind: "bool", default: true }];
      expect(check(space(flag), { "placement/shelf.flag": { spaceOnly: "The flag turns on other params." } })).toEqual({ faults: [], notRun: [], notMatched: [], spaceOnly: ["placement/shelf.flag: The flag turns on other params."] });
      expect(check(space([], "none"), { "placement/none": { spaceOnly: "This step does nothing." } })).toEqual({ faults: [], notRun: [], notMatched: [], spaceOnly: ["placement/none: This step does nothing."] });
    });

    it("refuses a statement that the strategy contradicts", () => {
      expect(check(space(fit), { "placement/shelf.fit": { spaceOnly: "It is not an option." } }).faults).toEqual(['shelf: the route "placement/shelf.fit" says that the param is only in the space, and the strategy has this option.']);
    });

    it("refuses a route that matches nothing, and a statement with no reason", () => {
      expect(check(space([]), { "placement/shelf.gone": { spaceOnly: "It left the space." } }).faults).toEqual(['The route "placement/shelf.gone" matches nothing in the spaces.']);
      const unmatched = check(space([], "order"), { "placement/order": { option: "x" } });
      expect(unmatched.notMatched).toEqual(["placement/order"]);
      expect(unmatched.faults).toEqual(['The route "placement/order" matches nothing in the spaces.']);
      expect(check(space([], "order"), { "placement/order": { spaceOnly: " " } }).faults).toEqual(['The route "placement/order" has no reason.']);
    });
  });
});

describe("the field needs", () => {
  const entry = (key: string, supports: Readonly<Record<string, readonly string[]>>): CatalogEntry => ({ ...shelf, key, id: key, supports, limits: {}, options: {} });
  const strategies = [entry("free", {}), entry("moves", { obstacleMove: ["fixed", "move"] }), entry("still", { obstacleMove: [] })];

  it("offers only the strategies that take the value, and a strategy with no such dimension", () => {
    const needs = { obstacleMove: "fixed" };
    expect(catalogChoices(strategies, { type: "strategy", describe: "x", needs }).map((e) => e.key)).toEqual(["free", "moves"]);
    expect(catalogChoices(strategies, { type: "list", describe: "x", of: { type: "strategy", needs } }).map((e) => e.key)).toEqual(["free", "moves"]);
  });

  it("goes through the file, and a default outside it is a fault", () => {
    const owner: CatalogEntry = { ...wrap, options: { member: { type: "strategy", describe: "The member.", needs: { itemShape: "rect" }, default: "shelf" } } };
    const doc = { engine: "packing", strategies: [owner, shelf] };
    const parsed = parseStrategyCatalog(JSON.parse(writeStrategyCatalog(doc, "1.2.3")));
    expect(parsed.ok && parsed.catalog.strategies[0]?.options["member"]).toMatchObject({ needs: { itemShape: "rect" } });
    const refused: CatalogEntry = { ...wrap, options: { member: { type: "strategy", describe: "The member.", needs: { itemShape: "circle" }, default: "shelf" } } };
    expect(() => writeStrategyCatalog({ engine: "packing", strategies: [refused, shelf] }, "1.2.3")).toThrow("is not a strategy that the option takes");
  });

  it("refuses a value that is not a record of texts", () => {
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["strategy"]!["needs"] = { itemShape: 1 }))).toEqual(['The strategy aspect-fit: the option "strategy": "needs" is not a record of texts.']);
    expect(faultsOf("aspect-fit", (e) => (optionsOf(e)["strategy"]!["needs"] = "rect"))).toEqual(['The strategy aspect-fit: the option "strategy": "needs" is not a record of texts.']);
  });
});

describe("OptionSchema", () => {
  it("takes a strategy declaration for a plain string, and only an enum for a union of strings", () => {
    const plain: OptionSchema<{ member: string }> = { member: { type: "strategy", describe: "The member." } };
    const named: OptionSchema<{ fit: "a" | "b" }> = { fit: { type: "enum", describe: "The fit.", values: ["a", "b"] } };
    // @ts-expect-error A union of strings has only the enum declaration.
    const wrong: OptionSchema<{ fit: "a" | "b" }> = { fit: { type: "strategy", describe: "The fit." } };
    expect([plain.member.type, named.fit.type, wrong.fit.type]).toEqual(["strategy", "enum", "strategy"]);
  });
});
