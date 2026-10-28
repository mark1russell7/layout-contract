// The entry of the site: it reads the data files at build time, and it fills the four sections.
import contract from "@mark1russell7/layout-contract/package.json";
import { marked } from "marked";
import jointText from "../content/joint.md?raw";
import leadText from "../content/lead.md?raw";
import spaceText from "../content/space.md?raw";
import sweepText from "../content/sweep.md?raw";
import { initBuild, initTheme } from "./chrome.ts";
import { checkJoint, checkNews, checkSpaceFile, type JointData, type NewsData, type SpaceFile } from "./data.ts";
import { renderJoint } from "./joint.ts";
import { renderNews } from "./news.ts";
import { renderSpace, type SpaceEntry } from "./space.ts";
import "./style.css";
import { byId, esc } from "./ui.ts";

// The Vite config examines each file at build time. The page examines them again, and it shows a bad file.
const jointFiles = import.meta.glob<unknown>("../data/joint/*.json", { eager: true, import: "default" });
const spaceFiles = import.meta.glob<unknown>(["../data/spaces/*.json", "../data/examples/*.json"], { eager: true, import: "default" });
const newsFiles = import.meta.glob<unknown>("../data/news.json", { eager: true, import: "default" });

const problems: string[] = [];
function good<T>(files: Record<string, unknown>, check: (v: unknown) => string[]): [string, T][] {
  return Object.entries(files).flatMap(([path, value]): [string, T][] => {
    const found = check(value);
    if (found.length === 0) return [[path.replace(/^\.\.\//, ""), value as T]];
    problems.push(`${path.replace(/^\.\.\//, "")}: ${found.join("; ")}`);
    return [];
  });
}

const md = (text: string): string => marked.parse(text, { async: false });

byId("lead").innerHTML = md(leadText);
byId("joint-about").innerHTML = md(jointText);
byId("space-about").innerHTML = md(spaceText);
byId("sweep").innerHTML = md(sweepText);

renderJoint(byId("joint"), good<JointData>(jointFiles, checkJoint).map(([, v]) => v));
renderSpace(
  byId("space"),
  good<SpaceFile>(spaceFiles, checkSpaceFile).map(([path, file]): SpaceEntry => ({ path, file })),
  contract.version,
);
renderNews(byId("news"), good<NewsData>(newsFiles, checkNews)[0]?.[1]);

if (problems.length > 0) {
  const box = byId("problems");
  box.hidden = false;
  box.innerHTML = `<strong>Some data files are not good:</strong><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
}

initBuild();
initTheme();

// The navigation marks the section on the screen.
const links = [...document.querySelectorAll<HTMLAnchorElement>(".nav a")].filter((a) => a.getAttribute("href")?.startsWith("#") === true);
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of links) a.toggleAttribute("aria-current", a.hash === `#${e.target.id}`);
    }
  },
  { rootMargin: "-40% 0px -55% 0px" },
);
for (const a of links) {
  const target = document.querySelector(a.hash);
  if (target) observer.observe(target);
}
