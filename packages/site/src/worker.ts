// The worker of the joint pages. It operates each job of `jobs.ts`, so the page stays responsive, and it stops a job with `terminate`.
import { operate } from "./jobs.ts";
import type { RunJob, WorkerMessage } from "./protocol.ts";

const post = (m: WorkerMessage): void => (self as unknown as { postMessage(m: WorkerMessage): void }).postMessage(m);

self.addEventListener("message", (e: MessageEvent<RunJob>) => {
  const job = e.data;
  try {
    operate(job, post);
  } catch (err) {
    post({ type: "error", job: job.job, message: err instanceof Error ? err.message : String(err) });
  }
});
