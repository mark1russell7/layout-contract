import { describe, expect, it } from "vitest";
import { gateKind, gateSpans, parseFacts, type ReadJob, type ReadRun, waitReport, waitRows } from "./gate-wait.ts";

const at = (minutes: number): string => new Date(Date.UTC(2026, 10, 5, 0, minutes)).toISOString();
const YEAR_ONE = "0001-01-01T00:00:00Z";

function job(created: number, started: number, completed: number, conclusion = "success"): ReadJob {
  return { conclusion, created_at: at(created), started_at: at(started), completed_at: at(completed) };
}

function run(over: Partial<ReadRun> = {}): ReadRun {
  return {
    repo: "packing",
    id: 1,
    name: "CI",
    path: ".github/workflows/ci.yml",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    run_started_at: at(0),
    jobs: [job(0, 2, 10)],
    ...over,
  };
}

/** This function gives a gate with `count` jobs, and `lanes` of them run at one time. */
function gate(count: number, lanes: number, over: Partial<ReadRun> = {}): ReadRun {
  const jobs = Array.from({ length: count }, (_, i) => {
    const start = 100 + Math.floor(i / lanes) * 10;
    return job(100, start, start + 10);
  });
  return run({ repo: "layout-contract", id: 9, name: "Memory probe", path: ".github/workflows/memory-probe.yml", event: "workflow_run", jobs, ...over });
}

describe("parseFacts", () => {
  it("keeps the later line of a run, and skips empty lines", () => {
    const text = `${JSON.stringify(run({ status: "in_progress" }))}\n\n${JSON.stringify(run())}\n${JSON.stringify(run({ id: 2 }))}\n`;
    const runs = parseFacts(text);
    expect(runs.map((r) => [r.id, r.status])).toEqual([
      [1, "completed"],
      [2, "completed"],
    ]);
  });

  it("keeps two runs with one id in two repositories", () => {
    expect(parseFacts(`${JSON.stringify(run())}\n${JSON.stringify(run({ repo: "highways" }))}`)).toHaveLength(2);
  });
});

/** This function gives a job in the queue, as GitHub writes it: its start time equals its creation time. */
function queued(created: number): ReadJob {
  return { status: "queued", conclusion: null, created_at: at(created), started_at: at(created), completed_at: null };
}

describe("a job in the queue", () => {
  it("does not count as a start in the span or in the peak of a gate", () => {
    const open = gate(24, 3, { status: "in_progress", conclusion: null });
    const waiting = Array.from({ length: 96 }, () => queued(50));
    const [span] = gateSpans([{ ...open, jobs: [...open.jobs, ...waiting] }], Date.parse(at(600)));
    expect(span?.jobs).toBe(24);
    expect(span?.peak).toBe(3);
    expect(span?.from).toBe(Date.parse(at(100)));
  });

  it("does not make a wait of 0", () => {
    const rows = waitRows([run({ status: "in_progress", conclusion: null, jobs: [queued(0), job(0, 20, 30)] })], []);
    expect(rows[0]?.firstWait).toBe(20);
    expect(rows[0]?.jobWait).toBe(20);
  });

  it("gives no row when no job of the run has started", () => {
    expect(waitRows([run({ status: "queued", conclusion: null, jobs: [queued(0)] })], [])).toEqual([]);
  });
});

describe("gateKind", () => {
  it("reads a release from the file or the name, and a pull request from the event", () => {
    expect(gateKind(run())).toBe("pr");
    expect(gateKind(run({ event: "merge_group" }))).toBe("pr");
    expect(gateKind(run({ event: "push", path: ".github/workflows/release.yml", name: "Publish" }))).toBe("release");
    expect(gateKind(run({ event: "workflow_dispatch", name: "Release" }))).toBe("release");
    expect(gateKind(run({ event: "push" }))).toBeUndefined();
    expect(gateKind(run({ event: "schedule" }))).toBeUndefined();
  });
});

describe("gateSpans", () => {
  it("gives the span, the count of jobs and the peak", () => {
    const [span] = gateSpans([gate(24, 6)], 0);
    expect(span).toMatchObject({ id: 9, jobs: 24, peak: 6, open: false });
    expect(span?.from).toBe(Date.parse(at(100)));
    expect(span?.to).toBe(Date.parse(at(140)));
  });

  it("does not count a job that ends as the next one starts two times in the peak", () => {
    expect(gateSpans([gate(24, 1)], 0)[0]?.peak).toBe(1);
  });

  it("reaches now for a gate that has not ended", () => {
    const now = Date.parse(at(500));
    const open = gate(24, 3, { status: "in_progress", conclusion: null });
    const jobs = open.jobs.map((j, i) => (i === 0 ? { ...j, completed_at: null } : j));
    const [span] = gateSpans([{ ...open, jobs }], now);
    expect(span).toMatchObject({ open: true, to: now });
  });

  it("leaves out a run that stops in its plan, a dispatch, and another repository", () => {
    expect(gateSpans([gate(3, 3)], 0)).toEqual([]);
    expect(gateSpans([gate(24, 3, { event: "workflow_dispatch" })], 0)).toEqual([]);
    expect(gateSpans([gate(24, 3, { repo: "packing" })], 0)).toEqual([]);
  });

  it("does not count a skipped job, or a job with a start at the year 1", () => {
    const base = gate(20, 3);
    const skipped = { ...job(0, 0, 0, "skipped") };
    const never = { conclusion: null, created_at: at(0), started_at: YEAR_ONE, completed_at: null };
    expect(gateSpans([{ ...base, jobs: [...base.jobs, skipped, never] }], 0)[0]?.jobs).toBe(20);
  });
});

describe("waitRows", () => {
  it("gives the first wait from the run, and the job wait from the job", () => {
    const [row] = waitRows([run({ jobs: [job(0, 2, 10), job(10, 13, 20)] })], []);
    expect(row).toMatchObject({ kind: "pr", memoryGate: false });
    expect(row?.firstWait).toBe(2);
    expect(row?.jobWait).toBe(3);
  });

  it("does not count the time of an earlier job in the job wait", () => {
    expect(waitRows([run({ jobs: [job(0, 0, 200), job(200, 201, 210)] })], [])[0]?.jobWait).toBe(1);
  });

  it("gives 0 and not a negative wait when GitHub gives a start before the creation", () => {
    const [row] = waitRows([run({ run_started_at: at(5), jobs: [job(4, 3, 9)] })], []);
    expect(row?.firstWait).toBe(0);
    expect(row?.jobWait).toBe(0);
  });

  it("reads a rerun from the start of its attempt, so that the time between attempts is no wait", () => {
    expect(waitRows([run({ run_started_at: at(300), jobs: [job(300, 301, 310)] })], [])[0]?.firstWait).toBe(1);
  });

  it("leaves out a cancelled run, a run with no started job, and a run that is not a gate", () => {
    const never = { conclusion: "skipped", created_at: at(0), started_at: YEAR_ONE };
    expect(waitRows([run({ conclusion: "cancelled" }), run({ id: 2, jobs: [never] }), run({ id: 3, event: "push" })], [])).toEqual([]);
  });

  it("marks a wait that overlaps a gate, and not one that ends before it", () => {
    const spans = gateSpans([gate(24, 6)], 0);
    const rows = waitRows([run({ id: 1, run_started_at: at(95), jobs: [job(95, 110, 120)] }), run({ id: 2, run_started_at: at(50), jobs: [job(50, 51, 60)] }), run({ id: 3, run_started_at: at(130), jobs: [job(130, 131, 140)] })], spans);
    expect(rows.map((r) => r.memoryGate)).toEqual([true, false, true]);
  });
});

describe("waitReport", () => {
  const spans = gateSpans([gate(24, 6)], 0);
  const rows = waitRows(
    [
      run({ id: 1, run_started_at: at(110), jobs: [job(110, 130, 140)] }),
      run({ id: 2, run_started_at: at(5), jobs: [job(5, 6, 10)] }),
      run({ id: 3, name: "Release", event: "push", path: ".github/workflows/release.yml", run_started_at: at(5), jobs: [job(5, 7, 10)] }),
    ],
    spans,
  );

  it("counts a wait over the line in its group and in its hour", () => {
    const text = waitReport(rows, spans, 0);
    expect(text).toContain("| pr, gate running | 1 | 20.0 | 20.0 | 1 | 20.0 | 20.0 | 1 |");
    expect(text).toContain("| pr, gate not running | 1 | 1.0 | 1.0 | 0 | 1.0 | 1.0 | 0 |");
    expect(text).toContain("| release, gate not running | 1 | 2.0 | 2.0 | 0 | 2.0 | 2.0 | 0 |");
    expect(text).toContain("| release, gate running | 0 | - | - | 0 | - | - | 0 |");
    expect(text).toContain("| 01 | 1 | 20.0 | 1 | 0 | - | 0 |");
    expect(text).toContain("| 00 | 0 | - | 0 | 2 | 1.5 | 0 |");
  });

  it("states the gates, the longest wait first, and a thin read", () => {
    const text = waitReport(rows, spans, 7);
    expect(text).toContain("Runs read: 3. Runs left out: 7. The next run goes on");
    expect(text).toContain("| 9 | 11-05 01:40 | 11-05 02:20 | 40 | 24 | 6 |");
    expect(text.indexOf("| 20.0 | 20.0 | packing")).toBeLessThan(text.indexOf("| 2.0 | 2.0 | packing"));
  });

  it("does not call a read with no cut thin", () => {
    expect(waitReport([], [], 0)).toContain("Runs read: 0. Runs left out: 0.\n");
  });
});
