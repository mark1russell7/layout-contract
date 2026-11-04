import { readdirSync, readFileSync } from "node:fs";
import type { DataStamps } from "@mark1russell7/site-pages";
import { describe, expect, it } from "vitest";
import { type JointData, latestJoint } from "./data.ts";
import { readStamps, stampFaults, withDataStamp } from "./stamps.ts";

const data = new URL("../data/", import.meta.url);
const stamps = readStamps(readFileSync(new URL("stamps.json", data), "utf8"));
const jointDir = new URL("joint/", data);
const joints = readdirSync(jointDir).map((name) => JSON.parse(readFileSync(new URL(name, jointDir), "utf8")) as JointData);

const stampOf = (id: string, engines: Readonly<Record<string, string>>): DataStamps => ({
  schema: "data-stamp/1",
  pages: [{ page: "index.html", runs: [{ id, url: `https://example.test/${id}`, date: "2026-10-28T18:14:08Z", engines }] }],
});

const run = { run: "7", date: "2026-10-28", versions: { packing: "0.2.16" } };

describe("the file data/stamps.json", () => {
  it("agrees with the newest joint run", () => {
    expect(stampFaults(stamps, latestJoint(joints)!)).toEqual([]);
  });

  it("stamps the compare page with the runs of the home page, because its tags read the newest run", () => {
    const of = (name: string) => stamps.pages.find((p) => p.page === name);
    expect(of("compare.html")?.runs).toEqual(of("index.html")?.runs);
    expect(of("compare.html")?.inFlight).toEqual(of("index.html")?.inFlight);
  });

  it("names a run in flight on newer engines while the data is old", () => {
    expect(stamps.pages.find((p) => p.page === "index.html")?.inFlight?.engines["@mark1russell7/packing"]).toBeDefined();
  });
});

describe("stampFaults", () => {
  it("gives no fault for the same run and the same engines", () => {
    expect(stampFaults(stampOf("7", { "@mark1russell7/packing": "0.2.16" }), run)).toEqual([]);
  });

  it("gives a fault for each stamped page, not only for the home page", () => {
    const home = stampOf("7", { "@mark1russell7/packing": "0.2.16" });
    const old = stampOf("6", { "@mark1russell7/packing": "0.2.16" }).pages.map((p) => ({ ...p, page: "compare.html" }));
    expect(stampFaults({ ...home, pages: [...home.pages, ...old] }, run)).toEqual(["The stamp of compare.html does not name the run 7, the newest joint run."]);
  });

  it("gives a fault for a stamp of an older run", () => {
    expect(stampFaults(stampOf("6", { "@mark1russell7/packing": "0.2.16" }), run)).toEqual(["The stamp of index.html does not name the run 7, the newest joint run."]);
  });

  it("gives a fault for other engines than the data", () => {
    expect(stampFaults(stampOf("7", { "@mark1russell7/packing": "0.7.0" }), run)).toEqual(["The stamp of the run 7 gives packing 0.7.0, and its data gives 0.2.16."]);
  });

  it("gives a fault for an engine that the stamp does not name", () => {
    expect(stampFaults(stampOf("7", { "@mark1russell7/highways": "0.8.1" }), run)).toEqual(["The stamp of the run 7 gives packing undefined, and its data gives 0.2.16."]);
  });

  it("gives a fault for a stamp date after the date of the data", () => {
    const faults = stampFaults(stampOf("7", { "@mark1russell7/packing": "0.2.16" }), { ...run, date: "2026-10-27" });
    expect(faults).toEqual(["The stamp of the run 7 has the date 2026-10-28T18:14:08Z, after the date 2026-10-27 of its data."]);
  });

  it("gives a fault when the home page has no stamp", () => {
    expect(stampFaults({ schema: "data-stamp/1", pages: [] }, run)).toEqual(["The file data/stamps.json has no stamp for index.html."]);
  });
});

describe("withDataStamp", () => {
  const page = "<div><!-- data-stamp --></div>";
  const one = stampOf("7", { "@mark1russell7/packing": "0.2.16" });

  it("puts the line of the run at the mark", () => {
    const html = withDataStamp(page, "C:\\site\\index.html", one);
    expect(html).toContain('class="data-stamp"');
    expect(html).toContain("packing 0.2.16");
    expect(html).not.toContain("<!-- data-stamp -->");
  });

  it("leaves a page with no stamp and no mark", () => {
    expect(withDataStamp("<div></div>", "/site/compare.html", one)).toBe("<div></div>");
  });

  it("stops the build on a mark with no stamp", () => {
    expect(() => withDataStamp(page, "/site/compare.html", one)).toThrow("has no stamp for it");
  });

  it("stops the build on a stamp with no mark", () => {
    expect(() => withDataStamp("<div></div>", "/site/index.html", one)).toThrow("the page has no mark");
  });
});
