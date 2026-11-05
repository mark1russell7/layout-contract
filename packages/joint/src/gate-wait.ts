// The wait of the pull request gates and the release gates, by UTC hour, with the nightly memory gate running and not.
// `docs/JOINT-BENCH.md`, "The read of the gate waits", gives the use. The workflow `queue-read.yml` reads the facts from GitHub. This module has no I/O and reads no clock.
import { quantile } from "@mark1russell7/rigor-statistics";

/** The report counts each wait over this count of minutes. */
export const GATE_WAIT_LINE = 15;

const GATE_REPO = "layout-contract";
const GATE_FILE = "memory-probe.yml";
const GATE_EVENTS = new Set(["schedule", "workflow_run"]);
// A run of the workflow that stops in its plan has a small count of jobs, and it holds no slots.
const GATE_MIN_JOBS = 20;
const PR_EVENTS = new Set(["pull_request", "pull_request_target", "merge_group"]);
const NOT_RUN = new Set(["skipped", "cancelled"]);
const MINUTE = 60_000;
const LONGEST = 12;

/** One job, with the fields of the GitHub API that this read uses. */
export interface ReadJob {
  readonly status?: string | null;
  readonly conclusion?: string | null;
  readonly created_at?: string | null;
  readonly started_at?: string | null;
  readonly completed_at?: string | null;
}

/** One run, with its jobs, as the workflow writes it in a line of the facts. */
export interface ReadRun {
  readonly repo: string;
  readonly id: number;
  readonly name: string;
  readonly path: string;
  readonly event: string;
  readonly status: string;
  readonly conclusion?: string | null;
  readonly run_started_at: string;
  readonly jobs: readonly ReadJob[];
}

/** The wait of one gate run. Both waits are in minutes. */
export interface WaitRow {
  readonly repo: string;
  readonly id: number;
  readonly name: string;
  readonly kind: "pr" | "release";
  readonly at: string;
  /** The first job start minus the start of the run: nothing of the run itself holds its first job. */
  readonly firstWait: number;
  /** The largest job start minus job creation: this also counts the `max-parallel` of the run itself. */
  readonly jobWait: number;
  readonly memoryGate: boolean;
}

/** The time that one nightly memory gate held its slots. */
export interface GateSpan {
  readonly id: number;
  readonly from: number;
  readonly to: number;
  readonly jobs: number;
  /** The largest count of jobs that ran at one time. */
  readonly peak: number;
  readonly open: boolean;
}

/**
 * This function reads the lines of the facts. A later line of a run replaces an earlier line, because a run in progress is read again.
 */
export function parseFacts(text: string): ReadRun[] {
  const runs = new Map<string, ReadRun>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const run = JSON.parse(line) as ReadRun;
    runs.set(`${run.repo}/${run.id}`, run);
  }
  return [...runs.values()];
}

/** This function gives the time of a date of GitHub. A job that did not start can have a date at the year 1, and that date gives no time. */
function timeOf(date: string | null | undefined): number | undefined {
  const t = Date.parse(date ?? "");
  return t > 0 ? t : undefined;
}

// GitHub gives a job in the queue a `started_at` equal to its `created_at`, so that time is no start. Only the status tells.
const NOT_STARTED: ReadonlySet<string> = new Set(["queued", "waiting", "pending", "requested"]);

function ranJobs(run: ReadRun): readonly ReadJob[] {
  return run.jobs.filter((j) => !NOT_STARTED.has(j.status ?? "") && !NOT_RUN.has(j.conclusion ?? "") && timeOf(j.started_at) !== undefined);
}

/** This function gives the kind of a gate run. The queue record of the CI slots has the same rule, so the two reads compare. */
export function gateKind(run: Pick<ReadRun, "event" | "path" | "name">): "pr" | "release" | undefined {
  const file = run.path.split("/").at(-1) ?? "";
  if (/release/i.test(file) || /release/i.test(run.name)) return "release";
  return PR_EVENTS.has(run.event) ? "pr" : undefined;
}

/** This function gives the spans of the nightly memory gates. A gate that has not ended reaches `now`. */
export function gateSpans(runs: readonly ReadRun[], now: number): GateSpan[] {
  const spans: GateSpan[] = [];
  for (const run of runs) {
    if (run.repo !== GATE_REPO || !run.path.endsWith(GATE_FILE) || !GATE_EVENTS.has(run.event)) continue;
    const jobs = ranJobs(run);
    if (jobs.length < GATE_MIN_JOBS) continue;
    const times = jobs.map((j) => [timeOf(j.started_at) ?? now, timeOf(j.completed_at) ?? now] as const);
    const edges = times.flatMap(([start, end]) => [[start, 1] as const, [end, -1] as const]);
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let running = 0;
    let peak = 0;
    for (const [, step] of edges) {
      running += step;
      peak = Math.max(peak, running);
    }
    spans.push({
      id: run.id,
      from: Math.min(...times.map((t) => t[0])),
      to: Math.max(...times.map((t) => t[1])),
      jobs: jobs.length,
      peak,
      open: run.status !== "completed",
    });
  }
  return spans.sort((a, b) => a.from - b.from);
}

/** This function gives the wait of each gate run that ran a job. A wait counts as under a memory gate when the two times overlap. */
export function waitRows(runs: readonly ReadRun[], spans: readonly GateSpan[]): WaitRow[] {
  const rows: WaitRow[] = [];
  for (const run of runs) {
    const kind = gateKind(run);
    const begin = timeOf(run.run_started_at);
    const jobs = ranJobs(run);
    if (kind === undefined || begin === undefined || jobs.length === 0 || NOT_RUN.has(run.conclusion ?? "")) continue;
    const starts = jobs.map((j) => timeOf(j.started_at) ?? begin);
    const firstWait = Math.max(0, Math.min(...starts) - begin) / MINUTE;
    const jobWait = Math.max(0, ...jobs.map((j) => ((timeOf(j.started_at) ?? 0) - (timeOf(j.created_at) ?? Number.POSITIVE_INFINITY)) / MINUTE));
    const end = begin + Math.max(firstWait, jobWait) * MINUTE;
    const memoryGate = spans.some((s) => begin <= s.to && end >= s.from);
    rows.push({ repo: run.repo, id: run.id, name: run.name, kind, at: run.run_started_at, firstWait, jobWait, memoryGate });
  }
  return rows;
}

const shown = (values: readonly number[], p: number): string => (values.length === 0 ? "-" : quantile(values, p).toFixed(1));
const over = (values: readonly number[]): number => values.filter((v) => v > GATE_WAIT_LINE).length;
const dateText = (t: number): string => new Date(t).toISOString().slice(5, 16).replace("T", " ");

function groupLine(name: string, rows: readonly WaitRow[]): string {
  const job = rows.map((r) => r.jobWait);
  const first = rows.map((r) => r.firstWait);
  return `| ${name} | ${rows.length} | ${shown(job, 0.5)} | ${shown(job, 0.95)} | ${over(job)} | ${shown(first, 0.5)} | ${shown(first, 0.95)} | ${over(first)} |`;
}

/** This function writes the report of the read. `cut` is the count of runs that the read left out, because of the rate limit or a failed read. */
export function waitReport(rows: readonly WaitRow[], spans: readonly GateSpan[], cut: number): string {
  const lines = [
    "# The read of the gate waits",
    "",
    `Runs read: ${rows.length}. Runs left out: ${cut}.${cut > 0 ? " The next run goes on from these facts, and this read is thin until the count is 0." : ""}`,
    "",
    "Only public repositories are read. The job wait is the job start minus the job creation, so it also counts the `max-parallel` of the run itself. The first wait does not.",
    "",
    "## By kind, with the memory gate running and not",
    "",
    "| Group | Runs | Job wait median | Job wait p95 | Job wait over 15 | First wait median | First wait p95 | First wait over 15 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const kind of ["pr", "release"] as const) {
    for (const gate of [true, false]) {
      lines.push(groupLine(`${kind}, gate ${gate ? "running" : "not running"}`, rows.filter((r) => r.kind === kind && r.memoryGate === gate)));
    }
  }
  lines.push("", "## By UTC hour of the start of the run", "", "| Hour | Runs, gate | Median, gate | Over 15, gate | Runs, no gate | Median, no gate | Over 15, no gate |", "|---|---:|---:|---:|---:|---:|---:|");
  for (let hour = 0; hour < 24; hour++) {
    const at = rows.filter((r) => new Date(r.at).getUTCHours() === hour);
    const gate = at.filter((r) => r.memoryGate).map((r) => r.jobWait);
    const none = at.filter((r) => !r.memoryGate).map((r) => r.jobWait);
    lines.push(`| ${String(hour).padStart(2, "0")} | ${gate.length} | ${shown(gate, 0.5)} | ${over(gate)} | ${none.length} | ${shown(none, 0.5)} | ${over(none)} |`);
  }
  lines.push("", "## The nightly memory gates", "", "| Run | First job start | Last job end | Span minutes | Jobs | Peak jobs at one time |", "|---|---|---|---:|---:|---:|");
  for (const s of spans) {
    lines.push(`| ${s.id} | ${dateText(s.from)} | ${s.open ? "not ended" : dateText(s.to)} | ${Math.round((s.to - s.from) / MINUTE)} | ${s.jobs} | ${s.peak} |`);
  }
  lines.push("", "## The longest waits", "", "| Job wait | First wait | Repository | Workflow | Start | Run | Gate running |", "|---:|---:|---|---|---|---|---|");
  for (const r of [...rows].sort((a, b) => b.jobWait - a.jobWait).slice(0, LONGEST)) {
    lines.push(`| ${r.jobWait.toFixed(1)} | ${r.firstWait.toFixed(1)} | ${r.repo} | ${r.name} | ${dateText(Date.parse(r.at))} | ${r.id} | ${r.memoryGate ? "yes" : "no"} |`);
  }
  return `${lines.join("\n")}\n`;
}
