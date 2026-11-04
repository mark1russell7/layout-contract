import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The checks of the survey of L55 (`packages/joint/data/survey.json`, `docs/JOINT-SURVEY.md`).
// They check the shape of the data and its links to the roadmap. They do not check that a source says a claim.

interface Source {
  readonly key: string;
  readonly authors: string;
  readonly year: number;
  readonly title: string;
  readonly url: string;
}

interface Checked {
  readonly by: string;
  readonly index?: string;
  readonly page?: string;
  readonly claim: string;
}

interface Method {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly published: boolean;
  readonly sources: readonly Source[];
  readonly problemClass: string;
  readonly family: string;
  readonly item: string | null;
  readonly itemTitle: string | null;
  readonly idea: string | null;
  readonly related: readonly string[];
  readonly status: string;
  readonly note: string | null;
  readonly checked: Checked;
  readonly round: number;
}

interface Idea {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly dependsOn: readonly string[];
  readonly gain: number;
  readonly uncertainty: number;
  readonly cost: number;
  readonly score: number;
}

interface Survey {
  readonly schema: string;
  readonly surveyed: string;
  readonly methods: readonly Method[];
  readonly ideas: readonly Idea[];
}

const FAMILIES = ["greedy", "local search", "metaheuristic", "exact", "hybrid", "learned", "analytical", "bound", "benchmark", "geometry"];
const STATUSES = ["built", "queued", "not queued", "rejected"];
const CLASSES = ["graph drawing", "metro maps", "VLSI"];

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const survey = JSON.parse(read("../data/survey.json")) as Survey;
const roadmap = read("../../../docs/ROADMAP.md");
const doc = read("../../../docs/JOINT-SURVEY.md");

/** This function gives the status cell of an item in the roadmap, or undefined when the roadmap has no row for it. */
function roadmapStatus(item: string): string | undefined {
  const row = roadmap.split("\n").find((line) => line.startsWith(`| ${item} |`));
  return row?.split("|")[2]?.trim();
}

describe("the joint survey", () => {
  it("has the schema, and 15 to 30 methods", () => {
    expect(survey.schema).toBe("joint-survey/1");
    expect(survey.methods.length).toBeGreaterThanOrEqual(15);
    expect(survey.methods.length).toBeLessThanOrEqual(30);
  });

  it("numbers the methods J1, J2 and so on, in order", () => {
    expect(survey.methods.map((m) => m.id)).toEqual(survey.methods.map((_, i) => `J${i + 1}`));
  });

  it("uses only the known families, statuses and classes", () => {
    for (const m of survey.methods) {
      expect(FAMILIES, m.id).toContain(m.family);
      expect(STATUSES, m.id).toContain(m.status);
      expect(CLASSES, m.id).toContain(m.problemClass);
    }
  });

  it("gives each method a source with a URL, and a record of the check", () => {
    for (const m of survey.methods) {
      expect(m.sources.length, m.id).toBeGreaterThan(0);
      for (const s of m.sources) {
        expect(s.url, m.id).toMatch(/^https?:\/\//);
        expect(s.title, m.id).not.toBe("");
        expect(s.authors, m.id).not.toBe("");
        expect(Number.isInteger(s.year), m.id).toBe(true);
      }
      expect(["page", "index"], m.id).toContain(m.checked.by);
      if (m.checked.by === "page") expect(m.checked.page, m.id).toMatch(/^https?:\/\//);
      if (m.checked.by === "index") expect(["OpenAlex", "Crossref"], m.id).toContain(m.checked.index);
      expect(["page", "index abstract", "citing paper"], m.id).toContain(m.checked.claim);
      if (m.checked.claim === "citing paper") expect(m.checked.page, m.id).toMatch(/^https?:\/\//);
    }
  });

  it("keeps each method with its status in the roadmap", () => {
    for (const m of survey.methods) {
      if (m.status === "built") expect(roadmapStatus(m.item ?? ""), m.id).toBe("done");
      if (m.status === "queued") {
        expect(roadmapStatus(m.item ?? ""), m.id).toBeDefined();
        expect(roadmapStatus(m.item ?? ""), m.id).not.toBe("done");
      }
      if (m.item !== null) {
        expect(m.itemTitle, m.id).not.toBeNull();
        expect(roadmap, m.id).toContain(`| ${m.itemTitle ?? ""} |`);
      }
      for (const related of m.related) expect(roadmapStatus(related), `${m.id} ${related}`).toBeDefined();
    }
  });

  it("gives each method that is not built an item or an idea, and not both", () => {
    const ideas = new Set(survey.ideas.map((i) => i.id));
    for (const m of survey.methods) {
      if (m.status === "not queued") {
        expect(m.item, m.id).toBeNull();
        expect(ideas.has(m.idea ?? ""), m.id).toBe(true);
      } else {
        expect(m.idea, m.id).toBeNull();
      }
    }
  });

  it("uses each idea, and scores it as gain x uncertainty / cost", () => {
    for (const idea of survey.ideas) {
      expect(survey.methods.some((m) => m.idea === idea.id), idea.id).toBe(true);
      expect(idea.score, idea.id).toBeCloseTo((idea.gain * idea.uncertainty) / idea.cost, 3);
      for (const item of idea.dependsOn) expect(roadmapStatus(item), `${idea.id} ${item}`).toBeDefined();
    }
  });

  it("lists each method and each idea in the document", () => {
    for (const m of survey.methods) expect(doc, m.id).toContain(`| ${m.id} |`);
    for (const idea of survey.ideas) expect(doc, idea.id).toContain(`\`${idea.id}\``);
  });
});
