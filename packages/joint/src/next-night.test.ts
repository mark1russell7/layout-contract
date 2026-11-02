import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextNightProblem, readNights, type NightsState } from "./next-night.ts";

/** This function makes the nights of a state. */
const state = (...dates: string[]): NightsState => ({ epoch: "e1", nights: dates.map((date) => ({ date })) });

describe("nextNightProblem", () => {
  it("accepts the next night of the branch", () => {
    expect(nextNightProblem(state("2026-11-01", "2026-11-02"), state("2026-11-01"))).toBeNull();
  });

  it("accepts the first night of a new epoch", () => {
    expect(nextNightProblem(state("2026-11-02"), null)).toBeNull();
  });

  it("refuses a tree when the branch already has a later night", () => {
    expect(nextNightProblem(state("2026-11-01", "2026-11-02"), state("2026-11-01", "2026-11-02"))).toMatch(/removes the data of a night/);
    expect(nextNightProblem(state("2026-11-01", "2026-11-03"), state("2026-11-01", "2026-11-02"))).toMatch(/2026-11-03 comes after 2026-11-01/);
  });

  it("refuses a tree with no night", () => {
    expect(nextNightProblem(state(), null)).toMatch(/no night/);
  });
});

describe("readNights", () => {
  it("reads the latest epoch of the tree and the same epoch of the branch", () => {
    const root = mkdtempSync(join(tmpdir(), "next-night-"));
    const write = (dir: string, epoch: string, s: NightsState) => {
      mkdirSync(join(root, dir, "epochs", epoch), { recursive: true });
      writeFileSync(join(root, dir, "epochs", epoch, "state.json"), JSON.stringify(s));
    };
    mkdirSync(join(root, "tree"), { recursive: true });
    writeFileSync(join(root, "tree", "index.json"), JSON.stringify({ latest: "e1" }));
    write("tree", "e1", state("2026-11-01", "2026-11-02"));
    write("branch", "e1", state("2026-11-01"));
    write("branch", "e0", state("2026-10-01"));
    const { tree, branch } = readNights(join(root, "tree"), join(root, "branch"));
    expect(nextNightProblem(tree, branch)).toBeNull();
    expect(readNights(join(root, "tree"), join(root, "none")).branch).toBeNull();
  });
});
