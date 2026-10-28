// The facts of the computer of a run. This file uses Node, so `src/browser.ts` does not export it.
import { arch, cpus, platform } from "node:os";
import type { RunEnv } from "@mark1russell7/layout-contract";

/** This function gives the facts of the computer of this run. */
export function runEnv(): RunEnv {
  const list = cpus();
  return { node: process.version, os: platform(), arch: arch(), runner: process.env["RUNNER_NAME"] ?? "local", cpu: list[0]?.model ?? "unknown", cpus: list.length };
}
