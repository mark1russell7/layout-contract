// The bench of `/text`: the time of `layoutText` on short labels, for a base build and the head build.
//
//   node scripts/bench-text.mjs --base <file> --head <file> [--calls 100000] [--rounds 7]
//
// <file> is the path of a built `text.js`. The labels have the shape of the labels of a consumer page: 333 distinct texts of approximately 8 characters, mostly one word.
// The rounds of the two builds alternate, so a slow period of the runner touches both. Each round swaps the order of the builds (ABBA), so neither build always runs second.
// A head with `createTextLayoutCache` gets a third arm: the same calls through one new layout cache for each round, so the first pass over the labels fills it.
// A head with `createTextCharset` gets the arms of L71: passes over the labels with a cold measurer, with `sizing` at "exact" and at "bound-first", and one "exact" arm again as the A/A check.
// The L71 arms use a table of proportional advances (`text-labels.ts`). The table is cheap, so these times leave out the cost of a real measure of a browser or a shaper.
// The arms of L144 compare the base and the head in the same rounds: texts that the memo of the words does not hold, so each layout splits its text,
// and long words with `wordBreak: "anywhere"`, so each layout takes the overflow path and cuts the last line.
// One untimed call of each arm comes before the rounds, as the warm-up. The script writes a Markdown table with the CPU model to stdout.
// Start it only in CI (`.github/workflows/text-bench.yml`). A shared computer gives times that are not stable.
import { cpus } from "node:os";
import { pathToFileURL } from "node:url";
import { DIGIT_LABELS, helveticaAdvance, LETTER_LABELS as labels } from "./text-labels.ts";

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

const advance = (text) => Array.from(text).reduce((s, c) => s + (c === " " ? 3.1 : 7.3), 0);
const options = { font: "12px sans-serif", lineHeight: 16, wrapWidth: 160, maxLines: 2 };

/** This function gives the milliseconds of `calls` layouts with one measurer, as a page does. */
function round(text) {
  const measurer = text.createMeasurer(advance);
  const start = performance.now();
  for (let i = 0; i < calls; i++) text.layoutText(labels[i % labels.length], { ...options, measurer });
  return performance.now() - start;
}

/** 8192 distinct texts of 3 labels and a number. The memo of the words holds 4096 texts and forgets the oldest, so each layout of a round splits its text. */
const SPLIT_TEXTS = Array.from({ length: 8192 }, (_, i) => `${labels[i % labels.length]} ${labels[(i * 7 + 3) % labels.length]} n${i}`);

/** Words of 6 labels with no space, approximately 48 characters: wider than the wrap width of `OVERFLOW`. */
const OVERFLOW_TEXTS = labels.map((_, i) => Array.from({ length: 6 }, (_, k) => labels[(i + k * 17) % labels.length]).join(""));
const OVERFLOW = { wrapWidth: 60, maxLines: 2, wordBreak: "anywhere" };

/** This function gives the milliseconds of `calls` layouts of texts that miss the memo of the words. */
function splitRound(text) {
  const measurer = text.createMeasurer(advance);
  const start = performance.now();
  for (let i = 0; i < calls; i++) text.layoutText(SPLIT_TEXTS[i % SPLIT_TEXTS.length], { ...options, measurer });
  return performance.now() - start;
}

/** This function gives the milliseconds of `calls` layouts on the overflow path. */
function overflowRound(text) {
  const measurer = text.createMeasurer(advance);
  const start = performance.now();
  for (let i = 0; i < calls; i++) text.layoutText(OVERFLOW_TEXTS[i % OVERFLOW_TEXTS.length], { ...options, ...OVERFLOW, measurer });
  return performance.now() - start;
}

/** This function gives the milliseconds of `calls` layouts through one new layout cache. */
function cachedRound(text) {
  const measurer = text.createMeasurer(advance);
  const cache = text.createTextLayoutCache();
  const start = performance.now();
  for (let i = 0; i < calls; i++) cache.layout(labels[i % labels.length], { ...options, measurer });
  return performance.now() - start;
}

/** This function gives the milliseconds of passes over the labels. Each pass has a new cold measurer, and the passes make `calls` layouts or a little more. */
function coldRound(text, family, sizing) {
  const passes = Math.ceil(calls / family.labels.length);
  const start = performance.now();
  for (let p = 0; p < passes; p++) {
    const measurer = text.createMeasurer(helveticaAdvance);
    for (const label of family.labels) text.layoutText(label, { ...options, measurer, sizing, charset: family.charset });
  }
  return performance.now() - start;
}

const builds = {};
for (const name of ["base", "head"]) {
  const before = made;
  const text = await import(pathToFileURL(args[name]).href);
  round(text);
  builds[name] = { text, run: round, times: [], segmenters: made - before };
}
// The base can be a release from before the cache, so the arm is there only when the head has it.
if (typeof builds.head.text.createTextLayoutCache === "function") {
  cachedRound(builds.head.text);
  builds["head with the cache"] = { text: builds.head.text, run: cachedRound, times: [], segmenters: 0 };
}
// The families of L71. A set is a value for `createTextCharset`.
const head = builds.head.text;
const families =
  typeof head.createTextCharset === "function"
    ? [
        { name: "letter labels, printable ASCII set", labels, charset: head.createTextCharset(head.PRINTABLE_ASCII) },
        { name: "letter labels, set of a to z and the space", labels, charset: head.createTextCharset(" abcdefghijklmnopqrstuvwxyz") },
        { name: "digit labels, digit set", labels: DIGIT_LABELS, charset: head.createTextCharset(head.DIGITS) },
      ]
    : [];

/** This function runs the rounds of some arms, with the order swapped in each round. */
function roundsOf(names) {
  for (let k = 0; k < rounds; k++) for (const name of k % 2 === 0 ? names : [...names].reverse()) builds[name].times.push(builds[name].run(builds[name].text));
}

const compared = Object.keys(builds);
roundsOf(compared);

// The L71 arms run after those rounds. They give `layoutText` of the head other option shapes, and in the same rounds that slows the head only.
for (const family of families) {
  for (const [label, sizing] of [["exact", "exact"], ["exact again", "exact"], ["bound-first", "bound-first"]]) {
    const run = (text) => coldRound(text, family, sizing);
    run(head);
    builds[`cold ${label}: ${family.name}`] = { text: head, run, times: [], segmenters: 0 };
  }
}
roundsOf(Object.keys(builds).filter((name) => !compared.includes(name)));

// The arms of L144. Each pair has the base and the head in the same rounds, in the order ABBA.
const PAIRS = [
  ["split of new texts", splitRound],
  ["overflow path", overflowRound],
];
const paired = [];
for (const [label, run] of PAIRS) {
  for (const name of ["base", "head"]) {
    run(builds[name].text);
    builds[`${name}: ${label}`] = { text: builds[name].text, run, times: [], segmenters: 0 };
    paired.push(`${name}: ${label}`);
  }
}
roundsOf(paired);
const arms = Object.keys(builds);

const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const baseMs = median(builds.base.times);
const headMs = median(builds.head.times);
console.log(`The bench of \`/text\`: ${calls} layouts of ${labels.length} labels for each round, ${rounds} rounds in the order ABBA, node ${process.version}, CPU ${cpus()[0]?.model ?? "unknown"}.`);
console.log("");
console.log("| Build | Median ms | Microseconds for each layout | Segmenters made |");
console.log("|---|---|---|---|");
for (const name of arms) {
  const ms = median(builds[name].times);
  console.log(`| ${name} | ${ms.toFixed(1)} | ${((ms * 1000) / calls).toFixed(2)} | ${builds[name].segmenters} |`);
}
console.log("");
console.log(`The head takes ${(headMs / baseMs).toFixed(3)} of the time of the base.`);
if (arms.includes("head with the cache")) console.log(`The head with the cache takes ${(median(builds["head with the cache"].times) / headMs).toFixed(3)} of the time of the head.`);
for (const [label] of PAIRS) console.log(`On the ${label}, the head takes ${(median(builds[`head: ${label}`].times) / median(builds[`base: ${label}`].times)).toFixed(3)} of the time of the base.`);
console.log("");
if (families.length > 0) {
  console.log("`sizing` on one cold pass, with the options of the bench and the table of proportional advances. The counts do not change from run to run. The slack is (bound - exact) / exact of the whole label on one line.");
  console.log("");
  console.log("| Family | Labels | Skip the measure | Measure calls, exact | Measure calls, bound-first | Median slack of bound | Bound-first / exact, cold | Exact again / exact, cold |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const family of families) {
    const pass = (sizing) => {
      const measurer = head.createMeasurer(helveticaAdvance);
      const layouts = family.labels.map((label) => head.layoutText(label, { ...options, measurer, sizing, charset: family.charset }));
      return { layouts, calls: measurer.stats().calls };
    };
    const exact = pass("exact");
    const first = pass("bound-first");
    const skipped = first.layouts.filter((layout) => layout.bounded === true).length;
    const measurer = head.createMeasurer(helveticaAdvance);
    const natural = (label, sizing) => head.layoutText(label, { font: options.font, lineHeight: options.lineHeight, measurer, sizing, charset: family.charset }).widths[0];
    const slack = median(family.labels.map((label) => (natural(label, "bound") - natural(label, "exact")) / natural(label, "exact")));
    const ms = (label) => median(builds[`cold ${label}: ${family.name}`].times);
    console.log(`| ${family.name} | ${family.labels.length} | ${((100 * skipped) / family.labels.length).toFixed(1)}% | ${exact.calls} | ${first.calls} | ${(100 * slack).toFixed(1)}% | ${(ms("bound-first") / ms("exact")).toFixed(3)} | ${(ms("exact again") / ms("exact")).toFixed(3)} |`);
  }
  console.log("");
}
console.log("The two builds run in one process, one after the other. Thus these times and this ratio are not the cost of a build alone (the bench rule of this repository of 2026-11-02). This bench is a report, not a gate.");
