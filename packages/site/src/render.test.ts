import { describe, expect, it } from "vitest";
import { type JointData, latestFull, type NewsData, type SpaceFile } from "./data.ts";
import { renderJoint } from "./joint.ts";
import { renderNews } from "./news.ts";
import { renderSpace } from "./space.ts";

// The sections write HTML into a root element. A plain object stands in for the element, so the tests need no DOM.
interface FakeRoot {
  innerHTML: string;
  addEventListener(): void;
  querySelector(): null;
}
const fakeRoot = (): FakeRoot => ({ innerHTML: "", addEventListener() {}, querySelector: () => null });
const asElement = (root: FakeRoot): HTMLElement => root as unknown as HTMLElement;

const joint = Object.values(import.meta.glob<JointData>("../data/joint/*.json", { eager: true, import: "default" }));
/** The newest full joint run. The section shows it first, with its run, its date and its versions. A short run does not open the section (L132). */
const newest = latestFull(joint)!;
const spaces = Object.entries(import.meta.glob<SpaceFile>("../data/examples/*.json", { eager: true, import: "default" }));
const engineSpaces = Object.entries(import.meta.glob<SpaceFile>("../data/spaces/*.json", { eager: true, import: "default" }));
const news = Object.values(import.meta.glob<NewsData>("../data/news.json", { eager: true, import: "default" }))[0];

describe("the sections", () => {
  it("marks a cover run, and states that its floors do not compare", () => {
    const root = fakeRoot();
    renderJoint(asElement(root), [{ ...newest, cover: true }]);
    expect(root.innerHTML).toContain("cover run");
    expect(root.innerHTML).toContain("do not compare");
    renderJoint(asElement(root), [{ ...newest, cover: false }]);
    expect(root.innerHTML).not.toContain("cover run");
  });

  it(" with its run, its date and its versions", () => {
    const root = fakeRoot();
    renderJoint(asElement(root), joint);
    const d = newest;
    expect(root.innerHTML).toContain(`run ${d.run}`);
    expect(root.innerHTML).toContain(d.date);
    expect(root.innerHTML).toContain(d.headline.cell.best.pair);
    for (const [name, version] of Object.entries(d.versions)) expect(root.innerHTML).toContain(`${name} ${version}`);
    expect(root.innerHTML.match(/class="bar[ "]/g)?.length).toBe(d.headline.byRouter.length + d.headline.byPacker.length);
  });

  it("shows the example space with its label and its counts", () => {
    const root = fakeRoot();
    renderSpace(asElement(root), spaces.map(([path, file]) => ({ path, file })), "0.0.0");
    expect(root.innerHTML).toContain("Example");
    expect(root.innerHTML).toContain("finds no problems");
    expect(root.innerHTML).toContain("Base configs");
    expect(root.innerHTML).toContain("2026-10-28");
  });

  it("shows an engine space before the example, with its source", () => {
    const root = fakeRoot();
    renderSpace(asElement(root), [...spaces, ...engineSpaces].map(([path, file]) => ({ path, file })), "0.0.0");
    expect(root.innerHTML).toContain("Engine");
    expect(root.innerHTML).toContain("finds no problems");
    expect(root.innerHTML).toContain("highways");
    expect(root.innerHTML).toContain("(example)");
  });

  it("shows the news with a link for each pull request", () => {
    const root = fakeRoot();
    renderNews(asElement(root), news);
    for (const item of news!.items) for (const pr of item.prs) expect(root.innerHTML).toContain(`/pull/${pr}"`);
    expect(root.innerHTML).toContain('href="releases/"');
    expect(root.innerHTML).not.toContain("npmjs.com");
  });

  it("shows a note when no data is there", () => {
    const root = fakeRoot();
    renderJoint(asElement(root), []);
    expect(root.innerHTML).toContain("No joint benchmark result");
  });
});
