import { describe, expect, it } from "vitest";
import { idList, recordCount } from "./record-count.ts";

describe("recordCount", () => {
  const manifest = ["a/s1", "a/s2", "b/s1", "b/s2"];

  it("passes when each input of the manifest has records", () => {
    expect(recordCount(manifest, ["b/s2", "a/s1", "a/s1", "a/s2", "b/s1"])).toEqual({ manifest: 4, recorded: 4, missing: [], allowed: [], unknown: [], ok: true });
  });

  it("fails on a missing input, and passes when the list of allowed inputs holds it", () => {
    expect(recordCount(manifest, ["a/s1", "b/s1"])).toEqual({ manifest: 4, recorded: 2, missing: ["a/s2", "b/s2"], allowed: [], unknown: [], ok: false });
    expect(recordCount(manifest, ["a/s1", "b/s1"], ["b/s2"]).ok).toBe(false);
    expect(recordCount(manifest, ["a/s1", "b/s1"], ["b/s2", "a/s2", "c/s1"])).toMatchObject({ allowed: ["a/s2", "b/s2"], ok: true });
  });

  it("fails on records of an input outside the manifest", () => {
    expect(recordCount(manifest, [...manifest, "z/s1"])).toMatchObject({ recorded: 4, unknown: ["z/s1"], ok: false });
  });

  it("fails on an empty run: no records at all", () => {
    expect(recordCount(manifest, [])).toMatchObject({ recorded: 0, missing: manifest, ok: false });
  });

  it("fails when no input has records, also when the allow list holds each input or the manifest is empty", () => {
    expect(recordCount(manifest, [], manifest)).toMatchObject({ recorded: 0, allowed: manifest, ok: false });
    expect(recordCount([], [])).toMatchObject({ manifest: 0, recorded: 0, ok: false });
  });

  it("reads a list of ids without empty lines and comments", () => {
    expect(idList("# a comment\r\na/s1\n\n  b/s2  \n")).toEqual(["a/s1", "b/s2"]);
  });
});
