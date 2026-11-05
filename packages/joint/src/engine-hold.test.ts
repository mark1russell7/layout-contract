import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { HOLD_REPOSITORY, engineHoldFaults, renovateHolds, trainHolds } from "./engine-hold.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const rule = (date: string, names: readonly string[] = ["a"]) => ({ description: `Held to ${date}, for one epoch.`, matchPackageNames: names, enabled: false });
const renovate = (...rules: readonly unknown[]) => ({ packageRules: rules });
const row = (until: string, name = "a", repo: string = HOLD_REPOSITORY) => ({ package: name, repo, reason: "One epoch.", ruling: "https://example.test/r", until });
const holds = (...rows: readonly unknown[]) => ({ holds: rows });

describe("renovateHolds", () => {
  it("gives each stopped package with the date of its rule", () => {
    expect([...renovateHolds(renovate(rule("2026-11-17", ["a", "b"])))]).toEqual([["a", "2026-11-17"], ["b", "2026-11-17"]]);
  });

  it("reads no hold from a rule that does not stop its packages", () => {
    expect(renovateHolds(renovate({ description: "Held to 2026-11-17.", matchPackageNames: ["a"], automerge: false })).size).toBe(0);
  });

  it("gives null for a rule with no date", () => {
    expect(renovateHolds(renovate({ matchPackageNames: ["a"], enabled: false })).get("a")).toBeNull();
  });

  it("reads no hold from a file with no rules", () => {
    expect(renovateHolds({ extends: ["x"] }).size).toBe(0);
  });
});

describe("trainHolds", () => {
  it("reads only the rows of this repository", () => {
    const read = trainHolds(holds(row("2026-11-17"), row("2026-11-20", "b", "other"), { package: "c", until: "2026-11-20" }));
    expect([...(read ?? [])]).toEqual([["a", "2026-11-17"]]);
  });

  it("gives null for a file with no list, and not an empty hold", () => {
    expect(trainHolds({ rows: [] })).toBeNull();
    expect(trainHolds(holds())?.size).toBe(0);
  });
});

describe("engineHoldFaults", () => {
  it("gives no fault for the same date on both sides, up to the last day", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(row("2026-11-17")), NOW)).toEqual([]);
    expect(engineHoldFaults(renovate(rule("2026-11-10")), holds(row("2026-11-10")), NOW)).toEqual([]);
  });

  it("gives no fault with no hold on both sides", () => {
    expect(engineHoldFaults({}, holds(), NOW)).toEqual([]);
  });

  it("gives a fault for two different dates", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(row("2026-11-18")), NOW)).toEqual(["The hold of a has two dates: 2026-11-17 in Renovate and 2026-11-18 in release-train."]);
  });

  it("gives a fault for a rule with no row", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(), NOW)).toEqual(["The Renovate rule of a has no row in release-train."]);
  });

  it("gives a fault for a row with no rule", () => {
    expect(engineHoldFaults({}, holds(row("2026-11-17")), NOW)).toEqual(["The row of a in release-train, to 2026-11-17, has no Renovate rule."]);
  });

  it("gives a fault for a rule with no date", () => {
    expect(engineHoldFaults(renovate({ matchPackageNames: ["a"], enabled: false }), holds(row("2026-11-17")), NOW)).toEqual(["The Renovate rule of a states no date."]);
  });

  it("gives a fault on each side for a date in the past", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-09")), holds(row("2026-11-09")), NOW)).toEqual([
      "The Renovate rule of a ended on 2026-11-09.",
      "The row of a in release-train ended on 2026-11-09.",
    ]);
  });

  it("gives a fault for a file with no list of holds, so a new form does not read as no hold", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), { rows: [] }, NOW)).toEqual(["The hold file of release-train has no list of holds."]);
  });
});

describe("the script of the check", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "hold-check-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const start = (left: unknown, right: unknown) => {
    const a = join(dir, "renovate.json");
    const b = join(dir, "holds.json");
    writeFileSync(a, JSON.stringify(left));
    writeFileSync(b, JSON.stringify(right));
    return spawnSync(process.execPath, [join(root, "scripts", "hold-check.ts"), a, b], { cwd: root, encoding: "utf8" });
  };

  it("exits 0 when the two files agree", () => {
    const run = start(renovate(rule("2099-01-01")), holds(row("2099-01-01")));
    expect(run.stdout).toContain("1 package(s) held");
    expect(run.status).toBe(0);
  });

  it("exits 1 and names the fault when the dates differ", () => {
    const run = start(renovate(rule("2099-01-01")), holds(row("2099-01-02")));
    expect(run.stderr).toContain("::error::The hold of a has two dates");
    expect(run.status).toBe(1);
  });

  it("exits 1 when the date has passed", () => {
    const run = start(renovate(rule("2001-01-01")), holds(row("2001-01-01")));
    expect(run.stderr).toContain("ended on 2001-01-01");
    expect(run.status).toBe(1);
  });
});

describe("renovate.json of this repository", () => {
  it("states a date on each rule that stops a package", () => {
    const text = readFileSync(new URL("../../../renovate.json", import.meta.url), "utf8");
    for (const [name, date] of renovateHolds(JSON.parse(text))) expect([name, date]).toEqual([name, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
  });
});
