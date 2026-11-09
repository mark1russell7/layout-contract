import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { carrySourceCheck, carrySourceLines, measureFiles, namedCarrySources } from "./carry-sources.ts";

const files = ["lanes.ts", "runner.ts"];
const base = new Map([
  ["runner.ts", 'import { x } from "./lanes.ts";\nexport const a = 1;\n'],
  ["lanes.ts", "export const x = 1;\n"],
]);
const head = new Map([...base, ["lanes.ts", "export const x = 2;\n"]]);
const older = new Map([...base, ["runner.ts", 'import { x } from "./lanes.ts";\nexport const a = 0;\n']]);

describe("measureFiles", () => {
  it("gives the local imports of runner.ts at the base and at the head", () => {
    const at = (m: Record<string, string>) => (file: string) => m[file];
    const b = at({ "runner.ts": 'import "./a.ts";\nfrom "./a.ts"', "a.ts": "" });
    const h = at({ "runner.ts": 'from "./b.ts"', "b.ts": 'from "./c.ts"', "c.ts": "" });
    expect(measureFiles(b, h)).toEqual(["a.ts", "b.ts", "c.ts", "runner.ts"]);
    expect(measureFiles(at({}), at({}))).toEqual(["runner.ts"]);
  });

  it("finds the measure files of this checkout", () => {
    const read = (file: string): string | undefined => {
      try {
        return readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      } catch {
        return undefined;
      }
    };
    expect(measureFiles(read, read)).toContain("runner.ts");
    expect(measureFiles(read, read)).not.toContain("carry-sources.ts");
  });
});

describe("carrySourceCheck", () => {
  const sources = [
    { run: "42428038369", text: base },
    { run: "42392708258", text: older },
    { run: "40000000000", text: undefined },
  ];

  it("names each run with the code of the base when the measure code changes", () => {
    const check = carrySourceCheck(files, base, head, sources, new Set());
    expect(check).toEqual({ changed: ["lanes.ts"], bridged: ["42428038369"], unnamed: ["42428038369"], unknown: ["40000000000"] });
    expect(carrySourceLines(check)).toContain(
      "This pull request ends the plain carry of run 42428038369. A carry from it is a code bridge after the merge (not named: add the line `Carry-Source: 42428038369` to the body or to a commit message).",
    );
  });

  it("passes when a line names the run", () => {
    const check = carrySourceCheck(files, base, head, sources, namedCarrySources("Text.\nCarry-Source: 42428038369\n"));
    expect(check.unnamed).toEqual([]);
    expect(check.bridged).toEqual(["42428038369"]);
  });

  it("names no run when the measure code does not change, or when a file is new", () => {
    const same = carrySourceCheck(files, base, base, sources, new Set());
    expect(same).toEqual({ changed: [], bridged: [], unnamed: [], unknown: [] });
    expect(carrySourceLines(same)).toEqual(["The measure code does not change, so each carry source keeps a plain carry."]);
    // A new measure file: the base and each run do not have it, so the run with the code of the base ends its plain carry.
    const added = new Map([...head, ["pick.ts", "export {};\n"]]);
    const withNew = carrySourceCheck([...files, "pick.ts"], base, added, sources, new Set());
    expect(withNew.changed).toEqual(["lanes.ts", "pick.ts"]);
    expect(withNew.bridged).toEqual(["42428038369"]);
  });

  it("reads only whole lines Carry-Source", () => {
    expect([...namedCarrySources("carry-source: 1\n  Carry-Source: 2\nCarry-Source: 3 4\nCarry-Source:5")]).toEqual(["1", "5"]);
  });
});
