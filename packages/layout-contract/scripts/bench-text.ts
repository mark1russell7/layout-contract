// The bench of `/text`: the time of `layoutText` on short labels, for a base build and the head build.
//
//   node scripts/bench-text.ts --base <file> --head <file> [--rounds 16] [--target-ms 50]
//
// <file> is the path of a built `text.js`. The labels have the shape of the labels of a consumer page: 333 distinct texts of approximately 8 characters, mostly one word.
// `timeArmRounds` of `@mark1russell7/rigor-bench` times each case. Each round times one batch of the base arm, of the candidate arm and of the A/A arm
// (the base a second time). The order of the arms turns in each round, so each pair has each order equally often. The count of calls of a batch
// grows until a batch of the base takes the target time, and each arm of the case uses that count.
// The cases:
// - labels: the head against the base, with one measurer for each build, as a page does.
// - the cache: the head through one layout cache against the head. A head with `createTextLayoutCache` gets this case. After the warm-up, each call hits the cache.
// - L71: for each family of labels, passes over the labels with a cold measurer, with `sizing` at "bound-first" against "exact". A head with `createTextCharset`
//   gets these cases. The L71 arms use a table of proportional advances (`text-labels.ts`). The table is cheap, so these times leave out the cost of a real
//   measure of a browser or a shaper.
// - L144: the head against the base on texts that the memo of the words does not hold, so each layout splits its text, and on long words with
//   `wordBreak: "anywhere"`, so each layout takes the overflow path and cuts the last line.
// The ratio of a case is candidate / base: the median of the ratios of the rounds, with its distribution-free 95% interval (`caseIntervals`).
// The A/A ratio of the case and its interval show the noise of the run.
// The script writes a Markdown report with the CPU model to stdout. Start it only in CI (`.github/workflows/text-bench.yml`). A shared computer gives times that are not stable.
import { cpus } from "node:os";
import { pathToFileURL } from "node:url";
import { type CaseInterval, type ProcessArm, caseIntervals, timeArmRounds } from "@mark1russell7/rigor-bench";
import { quantile } from "@mark1russell7/rigor-statistics";
import type * as TextModule from "../src/text.ts";
import { DIGIT_LABELS, helveticaAdvance, LETTER_LABELS as labels } from "./text-labels.ts";

type Text = typeof TextModule;

const args: Record<string, string | undefined> = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]!.replace(/^--/, "")] = process.argv[i + 1];
const basePath = args["base"];
const headPath = args["head"];
if (!basePath || !headPath) throw new Error("bench-text: give --base <file> and --head <file>.");
const rounds = Number(args["rounds"] ?? 16);
const targetMs = Number(args["target-ms"] ?? 50);
// `caseIntervals` needs 6 rounds or more for its level 0.95. An even count gives each pair each order equally often.
if (!Number.isSafeInteger(rounds) || rounds < 6 || rounds % 2 !== 0) throw new Error(`bench-text: --rounds is an even whole number of 6 or more, not ${args["rounds"]}.`);
if (!(targetMs > 0)) throw new Error(`bench-text: --target-ms is a number above 0, not ${args["target-ms"]}.`);

// The count of the segmenters that each build makes.
const Original = Intl.Segmenter;
let made = 0;
// The type of `Intl.Segmenter` is read-only. `Object.assign` sets the property as an assignment does.
Object.assign(Intl, {
  Segmenter: class extends Original {
    constructor(...a: ConstructorParameters<typeof Intl.Segmenter>) {
      super(...a);
      made++;
    }
  },
});

const advance = (text: string): number => Array.from(text).reduce((s, c) => s + (c === " " ? 3.1 : 7.3), 0);
const options = { font: "12px sans-serif", lineHeight: 16, wrapWidth: 160, maxLines: 2 } as const;

/** 8192 distinct texts of 3 labels and a number. The memo of the words holds 4096 texts and forgets the oldest, so each layout splits its text. */
const SPLIT_TEXTS = Array.from({ length: 8192 }, (_, i) => `${labels[i % labels.length]} ${labels[(i * 7 + 3) % labels.length]} n${i}`);

/** Words of 6 labels with no space, approximately 48 characters: wider than the wrap width of `OVERFLOW`. */
const OVERFLOW_TEXTS = labels.map((_, i) => Array.from({ length: 6 }, (_, k) => labels[(i + k * 17) % labels.length]).join(""));
const OVERFLOW = { wrapWidth: 60, maxLines: 2, wordBreak: "anywhere" } as const;

/** One build in the bench: its module, and the count of the segmenters that its import and its first pass over the labels made. */
interface Build {
  readonly text: Text;
  readonly segmenters: number;
}

/** This function imports a built `text.js`, and makes one pass over the labels. A file that does not exist stops the bench. */
async function load(path: string): Promise<Build> {
  const before = made;
  const text = (await import(pathToFileURL(path).href)) as Text;
  const measurer = text.createMeasurer(advance);
  for (const label of labels) text.layoutText(label, { ...options, measurer });
  return { text, segmenters: made - before };
}

const base = await load(basePath);
const head = await load(headPath);

/** This function gives an arm that lays out the texts in turn, one text for each call. Each call gives the line count, so the work stays. */
function cycle(id: string, texts: readonly string[], layout: (text: string) => TextModule.TextLayout): ProcessArm {
  let i = 0;
  return {
    id,
    run: () => {
      const text = texts[i]!;
      i = i + 1 === texts.length ? 0 : i + 1;
      return layout(text).lines.length;
    },
  };
}

/** This function gives an arm of `layoutText` of a build, with one measurer for the whole run, as a page does. */
function layoutArm(id: string, build: Build, texts: readonly string[], extra: Partial<TextModule.TextLayoutOptions> = {}): ProcessArm {
  const measurer = build.text.createMeasurer(advance);
  return cycle(id, texts, (text) => build.text.layoutText(text, { ...options, ...extra, measurer }));
}

/** A family of labels of L71: its labels and the value of `createTextCharset` for them. */
interface Family {
  readonly name: string;
  readonly labels: readonly string[];
  readonly charset: TextModule.TextCharset;
}

/** This function gives an arm of one cold pass over the labels of a family for each call: each pass has a new measurer. */
function coldArm(id: string, family: Family, sizing: TextModule.TextSizing): ProcessArm {
  return {
    id,
    run: () => {
      const measurer = head.text.createMeasurer(helveticaAdvance);
      let lines = 0;
      for (const label of family.labels) lines += head.text.layoutText(label, { ...options, measurer, sizing, charset: family.charset }).lines.length;
      return lines;
    },
  };
}

/** One case of the bench: a base arm, a candidate arm, and the count of layouts in one call of each arm. */
interface Case {
  readonly name: string;
  readonly base: ProcessArm;
  readonly candidate: ProcessArm;
  readonly layouts: number;
}

const cases: Case[] = [{ name: "labels", base: layoutArm("base", base, labels), candidate: layoutArm("head", head, labels), layouts: 1 }];

// The base can be a release from before the cache, so the case is there only when the head has it.
if (typeof head.text.createTextLayoutCache === "function") {
  const measurer = head.text.createMeasurer(advance);
  const cache = head.text.createTextLayoutCache();
  const cached = cycle("head with the cache", labels, (text) => cache.layout(text, { ...options, measurer }));
  cases.push({ name: "labels through the cache", base: layoutArm("head", head, labels), candidate: cached, layouts: 1 });
}

// The families of L71. A set is a value for `createTextCharset`.
const families: Family[] =
  typeof head.text.createTextCharset === "function"
    ? [
        { name: "letter labels, printable ASCII set", labels, charset: head.text.createTextCharset(head.text.PRINTABLE_ASCII) },
        { name: "letter labels, set of a to z and the space", labels, charset: head.text.createTextCharset(" abcdefghijklmnopqrstuvwxyz") },
        { name: "digit labels, digit set", labels: DIGIT_LABELS, charset: head.text.createTextCharset(head.text.DIGITS) },
      ]
    : [];
for (const family of families) {
  cases.push({ name: `cold: ${family.name}`, base: coldArm("exact", family, "exact"), candidate: coldArm("bound-first", family, "bound-first"), layouts: family.labels.length });
}

// The cases of L144.
cases.push({ name: "split of new texts", base: layoutArm("base", base, SPLIT_TEXTS), candidate: layoutArm("head", head, SPLIT_TEXTS), layouts: 1 });
cases.push({ name: "overflow path", base: layoutArm("base", base, OVERFLOW_TEXTS, OVERFLOW), candidate: layoutArm("head", head, OVERFLOW_TEXTS, OVERFLOW), layouts: 1 });

/** The result of one case: the count of calls of a batch, the median batch times, the ratio of the case and its A/A ratio. */
interface Result {
  readonly case: Case;
  readonly count: number;
  readonly baseMs: number;
  readonly candidateMs: number;
  readonly ratio: CaseInterval;
  readonly aa: CaseInterval;
}

const median = (values: readonly number[]): number => quantile(values, 0.5, "higher");

// The index of each case turns its arms before the order of the rounds, so the cases start with different arms.
const results: Result[] = cases.map((c, offset) => {
  const run = timeArmRounds({ case: c.name, base: c.base, candidates: [c.candidate], rounds, offset, targetMs });
  const records = run.pairs[c.candidate.id]!;
  const [ratio] = caseIntervals(records);
  const [aa] = caseIntervals(run.pairs[`${c.base.id}~aa`]!);
  return { case: c, count: run.count, baseMs: median(records.map((r) => r.a)), candidateMs: median(records.map((r) => r.b)), ratio: ratio!, aa: aa! };
});

const micro = (ms: number, r: Result): string => ((ms * 1000) / (r.count * r.case.layouts)).toFixed(3);
const span = (i: CaseInterval): string => `[${i.low.toFixed(3)}, ${i.high.toFixed(3)}]`;

console.log(
  `The bench of \`/text\`: ${rounds} rounds of \`timeArmRounds\` for each case. A batch of the base takes ${targetMs} ms or more. Node ${process.version}, CPU ${cpus()[0]?.model ?? "unknown"}.`,
);
console.log("");
console.log(`The base made ${base.segmenters} segmenters on its import and its first pass over the labels, and the head made ${head.segmenters}.`);
console.log("");
console.log("| Case | Base | Candidate | Calls in a batch | Microseconds for each layout, base | Microseconds for each layout, candidate | Candidate / base | 95% interval | A/A | A/A 95% interval |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const c = r.case;
  console.log(`| ${c.name} | ${c.base.id} | ${c.candidate.id} | ${r.count} | ${micro(r.baseMs, r)} | ${micro(r.candidateMs, r)} | ${r.ratio.ratio.toFixed(3)} | ${span(r.ratio)} | ${r.aa.ratio.toFixed(3)} | ${span(r.aa)} |`);
}
console.log("");
console.log("A ratio below 1 is faster. The A/A columns time the base against itself in the same rounds: their interval shows the noise of the case.");
console.log("");

if (families.length > 0) {
  console.log("`sizing` on one cold pass, with the options of the bench and the table of proportional advances. The counts do not change from run to run. The slack is (bound - exact) / exact of the whole label on one line.");
  console.log("");
  console.log("| Family | Labels | Skip the measure | Measure calls, exact | Measure calls, bound-first | Median slack of bound |");
  console.log("|---|---|---|---|---|---|");
  for (const family of families) {
    const pass = (sizing: TextModule.TextSizing): { layouts: TextModule.TextLayout[]; calls: number } => {
      const measurer = head.text.createMeasurer(helveticaAdvance);
      const layouts = family.labels.map((label) => head.text.layoutText(label, { ...options, measurer, sizing, charset: family.charset }));
      return { layouts, calls: measurer.stats().calls };
    };
    const exact = pass("exact");
    const first = pass("bound-first");
    const skipped = first.layouts.filter((layout) => layout.bounded === true).length;
    const measurer = head.text.createMeasurer(helveticaAdvance);
    const natural = (label: string, sizing: TextModule.TextSizing): number =>
      head.text.layoutText(label, { font: options.font, lineHeight: options.lineHeight, measurer, sizing, charset: family.charset }).widths[0]!;
    const slack = median(family.labels.map((label) => (natural(label, "bound") - natural(label, "exact")) / natural(label, "exact")));
    console.log(`| ${family.name} | ${family.labels.length} | ${((100 * skipped) / family.labels.length).toFixed(1)}% | ${exact.calls} | ${first.calls} | ${(100 * slack).toFixed(1)}% |`);
  }
  console.log("");
}
console.log("The builds share one process. Thus these times and these ratios are not the cost of a build alone (the bench rule of this repository of 2026-11-02). This bench is a report, not a gate.");
