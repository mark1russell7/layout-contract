// The jobs of the worker of the joint pages: make the input, then pack and route it for each pair, one pair at a time, with the joint runner of the benchmark.
import {
  configRun,
  JOINT_ENGINE,
  jointEdgesOf,
  jointInput,
  jointSpecOf,
  jointSpecs,
  LANE_SPACE_STAGE,
  LANE_STAGE,
  pairId,
  pairRuns,
  rankPairs,
  SET_V2,
  type IterEntry,
  type JointSpec,
  type LaneEntry,
} from "@layout-contract/joint/browser";
import { STRATEGY_SPACE_SCHEMA, type LayoutInput, type LayoutRecord, type StageChoice, type StrategySpace } from "@mark1russell7/layout-contract";
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

/** The space of the stage `lanes.mode` alone. `configRun` reads a lane choice with it, and the adapter gives the pack and the router. */
const LANE_ONLY: StrategySpace = { schema: STRATEGY_SPACE_SCHEMA, engine: JOINT_ENGINE, version: "site", stages: [{ ...LANE_SPACE_STAGE, name: LANE_STAGE }] };

/** This function gives the lane entries, the iteration entries and the pair ids of a lane choice for each pair of a job. `configRun` of the joint package names them. */
export function laneRuns(job: Pick<RunJob, "packs" | "routers">, choice: StageChoice): { readonly lanes: LaneEntry[]; readonly iterate: IterEntry[]; readonly pairs: string[] } {
  const lanes: LaneEntry[] = [];
  const iterate: IterEntry[] = [];
  const pairs: string[] = [];
  for (const p of job.packs)
    for (const r of job.routers) {
      const run = configRun({ space: JOINT_ENGINE, stages: { [LANE_STAGE]: choice } }, LANE_ONLY, { pack: () => p.id, router: () => r.id });
      if (run.lane !== undefined) lanes.push(run.lane);
      if (run.iter !== undefined) iterate.push(run.iter);
      pairs.push(run.pair);
    }
  return { lanes, iterate, pairs };
}

/** This function operates one job, and posts the view of each pair and the ranks after it. The worker gives `post`, and a test gives a list. */
export function operate(job: RunJob, post: (m: WorkerMessage) => void): void {
  const t0 = performance.now();
  const { input, cell } = inputOf(job.input);
  post({ type: "input", job: job.job, input: { id: input.id, boxes: input.boxes.length, edges: input.edges?.length ?? 0, hash: input.hash ?? "" } });
  const only = job.lane === undefined ? undefined : laneRuns(job, job.lane);
  const lanes = only?.lanes ?? job.lanes ?? [];
  const iterate = only?.iterate ?? job.iterate ?? [];
  // With a lane choice, the runner operates no pair without lanes, because the list `pairs` holds only the lane pairs and the iteration pairs.
  const total = (only === undefined ? job.packs.length * job.routers.length : 0) + lanes.length + iterate.length;
  const options = { packs: job.packs, routers: job.routers, lanes, iterate, repeat: 1, corpus: SET_V2, ...(only === undefined ? {} : { pairs: only.pairs }) };
  const records: LayoutRecord[] = [];
  // The pack part and the router of each pair id. A lane pair and an iteration pair name the pack entry of their base pair.
  const partsOf = new Map<string, { readonly pack: string; readonly router: string }>();
  for (const p of job.packs) for (const r of job.routers) partsOf.set(pairId(p.id, r.id), { pack: p.id, router: r.id });
  for (const e of [...lanes, ...iterate]) partsOf.set(pairId(e.id, e.router), { pack: e.pack, router: e.router });
  let done = 0;
  for (const run of pairRuns(input, cell, options)) {
    records.push(run.record);
    done++;
    const { pack, router } = partsOf.get(run.record.strategy) ?? { pack: "", router: "" };
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

