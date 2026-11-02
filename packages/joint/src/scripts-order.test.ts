import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A script runs its command at the top level. A top-level `const` below that code is not initialized when a command uses it.
// The sweep of 2026-11-02 failed in `summarize` for this reason (`COST_CLAIM` of `sweep.ts`).
const dir = new URL("../scripts/", import.meta.url);

/** This function gives the top-level `const` and `let` lines of a script that come after its first command branch. */
function lateDeclarations(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^if \(command\b/.test(l));
  if (start < 0) return [];
  return lines.slice(start).filter((l) => /^(const|let) /.test(l));
}

describe("the scripts of packages/joint", () => {
  it("declare no top-level constant after the code of their commands", () => {
    const late = readdirSync(dir)
      .filter((n) => n.endsWith(".ts"))
      .flatMap((n) => lateDeclarations(readFileSync(new URL(n, dir), "utf8")).map((l) => `${n}: ${l}`));
    expect(late).toEqual([]);
  });

  it("finds a late declaration", () => {
    expect(lateDeclarations('if (command === "a") {\n  use(X);\n}\nconst X = 1;\n')).toEqual(["const X = 1;"]);
  });
});
