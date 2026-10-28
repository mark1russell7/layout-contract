// The jobs of the worker of the joint pages: make the input, then pack and route it for each pair, one pair at a time, with the joint runner of the benchmark.
import { jointEdgesOf, jointInput, jointSpecOf, jointSpecs, pairRuns, rankPairs, SET_V2, type JointSpec } from "@layout-contract/joint/browser";
import type { LayoutInput, LayoutRecord } from "@mark1russell7/layout-contract";
import { pairView, type InputRef, type RunJob, type WorkerMessage } from "./protocol.ts";

let specs: JointSpec[] | undefined;

/** This function gives the input of a reference and its cell. An input of the corpus must have the hash of the manifest. */
export function inputOf(ref: InputRef): { readonly input: LayoutInput; readonly cell: Readonly<Record<string, unknown>> } {
  if (ref.kind === "corpus") {
    specs ??= jointSpecs(SET_V2);
    const spec = specs[ref.spec];
    if (spec === undefined) throw new RangeError(`The corpus has no spec ${ref.spec}.`);
    const { input, entry } = jointInput(spec, ref.seed, SET_V2);
    if (entry.hash !== ref.hash) throw new Error(`The input ${entry.id} has the hash ${entry.hash}, not the hash ${ref.hash} of the manifest.`);
    return { input, cell: entry.cell };
  }
  const d = ref.dims;
  const spec = jointSpecOf(
    "grid",
    "rect-grid",
    { containerSize: d["containerSize"]!, containerShape: d["containerShape"]!, obstacles: d["obstacles"]!, sizes: d["sizes"]!, count: ref.count },
    jointEdgesOf(d),
    d["spacing"] as Parameters<typeof jointSpecOf>[4],
  );
  const { input, entry } = jointInput({ ...spec, seeds: [ref.seed] }, ref.seed, SET_V2);
  return { input, cell: entry.cell };
}

/** This function operates one job, and posts the view of each pair and the ranks after it. The worker gives `post`, and a test gives a list. */
export function operate(job: RunJob, post: (m: WorkerMessage) => void): void {
  const t0 = performance.now();
  const { input, cell } = inputOf(job.input);
  post({ type: "input", job: job.job, input: { id: input.id, boxes: input.boxes.length, edges: input.edges?.length ?? 0, hash: input.hash ?? "" } });
  const total = job.packs.length * job.routers.length;
  const records: LayoutRecord[] = [];
  const packOf = new Map<string, string>();
  for (const p of job.packs) for (const r of job.routers) packOf.set(`${p.id}+${r.id}`, `${p.id}\u0000${r.id}`);
  let done = 0;
  for (const run of pairRuns(input, cell, { packs: job.packs, routers: job.routers, repeat: 1, corpus: SET_V2 })) {
    records.push(run.record);
    done++;
    const [pack = "", router = ""] = (packOf.get(run.record.strategy) ?? "").split("\u0000");
    const view = pairView({
      record: run.record,
      pack,
      router,
      ...(run.pack === undefined ? {} : { size: run.pack.size }),
      ...(run.packed === undefined ? {} : { boxes: run.packed.input.boxes }),
      ...(run.result === undefined ? {} : { routes: run.result.routes }),
    });
    const ranks = rankPairs(records).map((r) => ({ rank: r.rank, pair: r.pair, misses: r.misses, score: r.score, hard: r.hard }));
    post({ type: "pair", job: job.job, done, total, view, ranks, record: run.record });
  }
  post({ type: "done", job: job.job, ms: performance.now() - t0 });
}

