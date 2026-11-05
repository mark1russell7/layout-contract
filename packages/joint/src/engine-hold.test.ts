import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { HOLD_REPOSITORY, engineHoldFaults, lockFaults, lockVersions, renovateHolds, trainHolds } from "./engine-hold.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const rule = (date: string, names: readonly string[] = ["a"], version = "1.2.3") => ({ description: `Held to ${date}, for one epoch.`, matchPackageNames: names, allowedVersions: version, enabled: false });
const renovate = (...rules: readonly unknown[]) => ({ packageRules: rules });
const row = (until: string, name = "a", repo: string = HOLD_REPOSITORY) => ({ package: name, repo, reason: "One epoch.", ruling: "https://example.test/r", until });
const holds = (...rows: readonly unknown[]) => ({ holds: rows });
const lockOf = (...keys: readonly string[]) => ["lockfileVersion: '9.0'", "", "importers:", "", "  .:", "    dependencies:", "      a:", "        specifier: ^9.9.9", "        version: 9.9.9", "", "packages:", "", ...keys.flatMap((key) => [`  ${key}:`, "    resolution: {integrity: sha512-x}", ""]), "snapshots:", "", "  a@8.8.8:", "    dependencies: {}", ""].join("\n");
const LOCK = lockOf("a@1.2.3");

describe("renovateHolds", () => {
  it("gives each stopped package with the date of its rule", () => {
    const hold = { until: "2026-11-17", version: "1.2.3" };
    expect([...renovateHolds(renovate(rule("2026-11-17", ["a", "b"])))]).toEqual([["a", hold], ["b", hold]]);
  });

  it("reads no hold from a rule that does not stop its packages", () => {
    expect(renovateHolds(renovate({ description: "Held to 2026-11-17.", matchPackageNames: ["a"], automerge: false })).size).toBe(0);
  });

  it("gives null for a rule with no date", () => {
    expect(renovateHolds(renovate({ matchPackageNames: ["a"], enabled: false })).get("a")?.until).toBeNull();
  });

  it("gives null for a rule with a range in place of one version", () => {
    expect(renovateHolds(renovate(rule("2026-11-17", ["a"], "^1.2.3"))).get("a")?.version).toBeNull();
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

describe("lockVersions", () => {
  it("reads each version of a package in the section of the packages", () => {
    expect(lockVersions(lockOf("'@s/a@1.2.3'", "'@s/a@1.3.0'", "'@s/ab@7.0.0'"), "@s/a")).toEqual(["1.2.3", "1.3.0"]);
  });

  it("reads a name with no quotes", () => {
    expect(lockVersions(lockOf("a@1.2.3"), "a")).toEqual(["1.2.3"]);
  });

  it("does not read the importers or the snapshots", () => {
    expect(lockVersions(lockOf(), "a")).toEqual([]);
  });

  it("reads a lock with Windows line ends", () => {
    expect(lockVersions(lockOf("a@1.2.3").replaceAll("\n", "\r\n"), "a")).toEqual(["1.2.3"]);
  });
});

describe("lockFaults", () => {
  const rules = renovateHolds(renovate(rule("2026-11-17")));

  it("gives no fault when the lock resolves the held version", () => {
    expect(lockFaults(rules, LOCK)).toEqual([]);
  });

  it("gives a fault for a raise by hand", () => {
    expect(lockFaults(rules, lockOf("a@1.3.0"))).toEqual(["The lock resolves a to 1.3.0, and the hold states 1.2.3."]);
  });

  it("gives a fault for a second version beside the held version, because this mixes an epoch", () => {
    expect(lockFaults(rules, lockOf("a@1.2.3", "a@1.3.0"))).toEqual(["The lock resolves a to 1.3.0, and the hold states 1.2.3."]);
  });

  it("gives a fault for a package that is not in the lock", () => {
    expect(lockFaults(rules, lockOf())).toEqual(["The lock has no version of a, and the hold states 1.2.3."]);
  });

  it("gives a fault for a rule with no exact version", () => {
    expect(lockFaults(renovateHolds(renovate(rule("2026-11-17", ["a"], "^1.2.3"))), LOCK)).toEqual(["The Renovate rule of a states no exact version."]);
  });
});

describe("engineHoldFaults", () => {
  it("gives no fault for the same date on both sides, up to the last day", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(row("2026-11-17")), LOCK, NOW)).toEqual([]);
    expect(engineHoldFaults(renovate(rule("2026-11-10")), holds(row("2026-11-10")), LOCK, NOW)).toEqual([]);
  });

  it("gives a fault for the lock, with the dates in agreement", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(row("2026-11-17")), lockOf("a@1.3.0"), NOW)).toEqual(["The lock resolves a to 1.3.0, and the hold states 1.2.3."]);
  });

  it("gives no fault with no hold on both sides", () => {
    expect(engineHoldFaults({}, holds(), LOCK, NOW)).toEqual([]);
  });

  it("gives a fault for two different dates", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(row("2026-11-18")), LOCK, NOW)).toEqual(["The hold of a has two dates: 2026-11-17 in Renovate and 2026-11-18 in release-train."]);
  });

  it("gives a fault for a rule with no row", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), holds(), LOCK, NOW)).toEqual(["The Renovate rule of a has no row in release-train."]);
  });

  it("gives a fault for a row with no rule", () => {
    expect(engineHoldFaults({}, holds(row("2026-11-17")), LOCK, NOW)).toEqual(["The row of a in release-train, to 2026-11-17, has no Renovate rule."]);
  });

  it("gives a fault for a rule with no date", () => {
    expect(engineHoldFaults(renovate({ matchPackageNames: ["a"], allowedVersions: "1.2.3", enabled: false }), holds(row("2026-11-17")), LOCK, NOW)).toEqual(["The Renovate rule of a states no date."]);
  });

  it("gives a fault on each side for a date in the past", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-09")), holds(row("2026-11-09")), LOCK, NOW)).toEqual([
      "The Renovate rule of a ended on 2026-11-09.",
      "The row of a in release-train ended on 2026-11-09.",
    ]);
  });

  it("gives a fault for a file with no list of holds, so a new form does not read as no hold", () => {
    expect(engineHoldFaults(renovate(rule("2026-11-17")), { rows: [] }, LOCK, NOW)).toEqual(["The hold file of release-train has no list of holds."]);
  });
});

describe("the script of the check", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "hold-check-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const start = (left: unknown, right: unknown, lock = LOCK) => {
    const a = join(dir, "renovate.json");
    const b = join(dir, "holds.json");
    const c = join(dir, "pnpm-lock.yaml");
    writeFileSync(a, JSON.stringify(left));
    writeFileSync(b, JSON.stringify(right));
    writeFileSync(c, lock);
    return spawnSync(process.execPath, [join(root, "scripts", "hold-check.ts"), a, b, c], { cwd: root, encoding: "utf8" });
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

  it("exits 1 when the lock resolves another version", () => {
    const run = start(renovate(rule("2099-01-01")), holds(row("2099-01-01")), lockOf("a@1.3.0"));
    expect(run.stderr).toContain("::error::The lock resolves a to 1.3.0");
    expect(run.status).toBe(1);
  });

  it("exits 1 when the date has passed", () => {
    const run = start(renovate(rule("2001-01-01")), holds(row("2001-01-01")));
    expect(run.stderr).toContain("ended on 2001-01-01");
    expect(run.status).toBe(1);
  });
});

describe("renovate.json and the lock of this repository", () => {
  const rules = renovateHolds(JSON.parse(readFileSync(new URL("../../../renovate.json", import.meta.url), "utf8")));

  it("states a date on each rule that stops a package", () => {
    for (const [name, { until }] of rules) expect([name, until]).toEqual([name, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
  });

  it("resolves the held version of each rule, so a raise by hand fails in its own pull request", () => {
    expect(lockFaults(rules, readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8"))).toEqual([]);
  });
});
