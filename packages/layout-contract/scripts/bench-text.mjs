// The bench of `/text`: the time of `layoutText` on short labels, for a base build and the head build.
//
//   node scripts/bench-text.mjs --base <file> --head <file> [--calls 100000] [--rounds 7]
//
// <file> is the path of a built `text.js`. The labels have the shape of the labels of a consumer page: 333 distinct texts of approximately 8 characters, mostly one word.
// The rounds of the two builds alternate, so a slow period of the runner touches both. Each round swaps the order of the builds (ABBA), so neither build always runs second.
// One untimed call of each build comes before the rounds, as the warm-up. The script writes a Markdown table with the CPU model to stdout.
// Start it only in CI (`.github/workflows/text-bench.yml`). A shared computer gives times that are not stable.
import { cpus } from "node:os";
import { pathToFileURL } from "node:url";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
if (!args.base || !args.head) throw new Error("bench-text: give --base <file> and --head <file>.");
const calls = Number(args.calls ?? 100000);
const rounds = Number(args.rounds ?? 7);

// The count of the segmenters that each build makes.
const Original = Intl.Segmenter;
let made = 0;
Intl.Segmenter = class extends Original {
  constructor(...a) {
    super(...a);
    made++;
  }
};

/** This function gives a seeded generator, so each run uses the same labels. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = rng(333);
const word = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(r() * 26))).join("");
const labels = [];
while (labels.length < 333) {
  const words = r() < 0.9 ? 1 : 2 + Math.floor(r() * 2);
  const text = Array.from({ length: words }, () => word(3 + Math.floor(r() * 12))).join(" ");
  if (!labels.includes(text)) labels.push(text);
}

const advance = (text) => Array.from(text).reduce((s, c) => s + (c === " " ? 3.1 : 7.3), 0);
const options = { font: "12px sans-serif", lineHeight: 16, wrapWidth: 160, maxLines: 2 };

/** This function gives the milliseconds of `calls` layouts with one measurer, as a page does. */
function round(text) {
  const measurer = text.createMeasurer(advance);
  const start = performance.now();
  for (let i = 0; i < calls; i++) text.layoutText(labels[i % labels.length], { ...options, measurer });
  return performance.now() - start;
}

const builds = {};
for (const name of ["base", "head"]) {
  const before = made;
  const text = await import(pathToFileURL(args[name]).href);
  round(text);
  builds[name] = { text, times: [], segmenters: made - before };
}
for (let k = 0; k < rounds; k++) for (const name of k % 2 === 0 ? ["base", "head"] : ["head", "base"]) builds[name].times.push(round(builds[name].text));

const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const base = median(builds.base.times);
const head = median(builds.head.times);
console.log(`The bench of \`/text\`: ${calls} layouts of ${labels.length} labels for each round, ${rounds} rounds in the order ABBA, node ${process.version}, CPU ${cpus()[0]?.model ?? "unknown"}.`);
console.log("");
console.log("| Build | Median ms | Microseconds for each layout | Segmenters made |");
console.log("|---|---|---|---|");
for (const [name, ms] of [["base", base], ["head", head]]) console.log(`| ${name} | ${ms.toFixed(1)} | ${((ms * 1000) / calls).toFixed(2)} | ${builds[name].segmenters} |`);
console.log("");
console.log(`The head takes ${(head / base).toFixed(3)} of the time of the base.`);
