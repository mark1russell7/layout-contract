# Roadmap

This file lists the items of the roadmap of this repository. The status page of the site reads it.

## In progress

A row with the status `later (parked to 11-11)` waits until 2026-11-11. Until that date, the work goes to the measures of the targets of the site.

| ID | Status | Priority | Title |
| --- | --- | --- | --- |
| L129 | in progress | P1 | The joint bench and the site use `packing` 0.10.2 and `highways` 0.15.0, and read the routers of `KEYED_STRATEGIES` (88 names) |
| L5 | later (parked to 11-11) | P2 | highways reads the contract |
| L34 | in progress | P1 | The strategy space as data |
| L52 | in progress | P1 | Measure joint space coverage, with a weekly trend that rises |
| L81 | later (parked to 11-11) | P2 | Memory gate over each family of the bench, then the dense-hubs peak (3.4-4.3 GB) |
| L82 | later (parked to 11-11) | P2 | The bench scripts in TypeScript (rule typed-scripts of conventions 0.5.0) |
| L132 | in progress | P1 | A short run of chosen rows on each engine release, at most one a day. Part 1: the site reads a short run, opens on the newest full run, and the age of the data is the age of the oldest shown pair |
| L96 | later (parked to 11-11) | P2 | Two named tables of the family `recorded` in `rigor-generators`, with source, license and date, as joint inputs and size choices of the site |
| L98 | done | P2 | Bench: run only chosen rows of the cover |
| L94 | in progress | P1 | Circle items in the joint bench: one shared family and an exact hard rule in the contract (0.4.0), then the joint corpus. Part 1: the array `shapes` of `joint-v3` gives inputs to `hole-degree`, `circle-quasi-physical` and `exact-strip`. Part 2: a cover run of `joint-v3` removes the 3 cover exceptions. Routes read the box until highways routes around the true shape |
| L108 | later (parked to 11-11) | P2 | The news of the site holds no typed version. The release page is the one list of versions |
| L111 | later (parked to 11-11) | P2 | The cost claim of the sweep is an interval for the whole night, then for each shard, and the night record states the inputs of its budget |
| L110 | later (parked to 11-11) | P2 | The step between two sweep nights reads route values: detour, routed crossings and the route length of the contract (`joint.route.length`) |
| L109 | later (parked to 11-11) | P2 | The point where two segments cross has its home in the contract, beside `segmentsCross`, and gives a point exactly when that function is true |
| L105 | later (parked to 11-11) | P2 | State the key of the edges as a dimension (`edgeKey`), and do not read crossings alone across routers that share segments |
| L103 | later (parked to 11-11) | P2 | A load factor for each shard from the router `straight`, so a time limit does not depend on the runner |
| L104 | in progress | P1 | A response explorer on the site, from the records of a joint run: the builder first, the page with the data of the cover run |
| L102 | later (parked to 11-11) | P2 | The strategy catalog: each strategy and option of an engine as JSON (`docs/STRATEGY-CATALOG.md`) |
| L101 | in progress | P0 | Bench: a shard with a deadline, a record for each pair, and a resume of a run |
| L147 | in progress | P1 | After an engine release, the joint bench measures again only the pairs whose engine output fingerprint changed. Part 3: the carry in `joint-bench.yml` (the input `carry`) |
| L152 | in progress | P1 | One manifest type and one writer of `layout-corpus/1` in the contract, pinned to the bytes of the corpus files of `packing` and of the joint bench (0.9.2) |
| L148 | in progress | P1 | The strategy space as a package of its own (`@mark1russell7/strategy-space`): operators, combinators, the count of the grammar, screening and racing |
| L159 | in progress | P1 | A catalog route for a stage option that is one value of another strategy (`{ strategy, fixed }`), so the check examines its params (0.9.6) |
| L100 | later (parked to 11-11) | P2 | The step between two epochs: raw values of the baseline arm, with a marked step on the charts |
| L122 | later (parked to 11-11) | P2 | A floor per option for a walk sample: the count per option beside uniform, a floor with its reason, a stratum if an option falls under it, and a test that pins the smallest count. By 2026-11-17. Part 1, the sample option `fixed`, is in version 0.5.4. |
| L99 | later (parked to 11-11) | P2 | A night with no result shows: `night-check.yml`, a line on the site, retries on API reads, and no green skip after a failed gate |
| L131 | in progress | P1 | Targets per rung for the routers on the compare view, the date of the run and the current engines. Rung 1: the site data of the cover run 41898523423 |

## Order after L101

This order holds after L101 and L147. Each step gives the reason for its place.

1. L147: after an engine release, the bench measures again only the pairs whose engine output fingerprint changed. Without it, each release makes the whole joint record old, and a full bench of the joint corpus takes approximately 3 days.
2. L65, size M: one registry of the measures. L66 and each later step read the measures from it.
3. L66, size M: an objective spec with compactness first, in tiers, and a term for stability. The first consumer wants compactness first and a stable layout.
4. L50: refinement after the pack, a physical step. Its bench jobs go to CI beside L66.
5. L36: efficacy maps on the records after the catch-up. It unblocks L16 and L67.
6. L12, then L14: terms of the L66 objective in the packer. The packer code goes to `packing`.
7. L15: one joint search with the L66 objective.
8. L62, then L68: the physical layout step, then one optimizer with energy terms. L62 is its first slice.

L67 is later: it needs the models of L36, the spec of L66 and a new page of the site. L34 keeps the part of the contract that it has. The stages of each engine are the work of `packing` and `highways`.

Of 21 items of size M that shipped, the median took less than 1 day from start to ship, and the longest took 4 days. So L65 and L66 take 1 to 8 days together, from the end of the catch-up.

## Next

| ID | Status | Priority | Title |
| --- | --- | --- | --- |
| L36 | blocked by the order after L101 | P1 | Efficacy maps |
| L40 | later (parked to 11-11) | P2 | Confirm the first joint default |
| L44 | later (parked to 11-11) | P2 | The atlas of the joint space |
| L61 | later (parked to 11-11) | P2 | Promotion test of the 9 night-1 configs against the default lanes-sides |
| L62 | blocked by L52 and L61 | P1 | Node layout by physics as a joint step |
| L65 | blocked by the order after L101 | P1 | One measure registry in layout-contract |
| L66 | blocked by L65 | P1 | An objective spec with one evaluator |
| L72 | later (parked to 11-11) | P2 | Neat is a family of objectives, not one |
| L73 | later (parked to 11-11) | P2 | Clarity of structure: macro and micro measures |
| L127 | next | P1 | The page says that the data is current at the start of a run, and what it does not know |
| L154 | blocked by mark1russell7/packing#431 | P1 | A start frame and the frames of a run in `packing`: a fixed-point start gives the move 0 |
| L156 | next | P1 | Custom terms of the objective spec as Vex formulas over the measure record of one layout, after a bench of the cost of the evaluator (after L66, 11-18) |
| L157 | next | P1 | A distribution axis for the shared layout families: a `DistributionSpec` for each size and aspect dimension, drawn with `sampler()` of `rigor-generators` (11-20) |

## Later

| ID | Status | Priority | Title |
| --- | --- | --- | --- |
| L12 | blocked by the order after L101 | P1 | Routing-aware placement costs |
| L14 | blocked by the order after L101 | P1 | Port-aware placement |
| L15 | blocked by the order after L101 | P1 | Joint search |
| L16 | blocked by L36 | P1 | A learned selector over the pair |
| L25 | later | P3 | A cooperative time budget for portfolio() members |
| L38 | later | P2 | A select rule learned on the joint records |
| L48 | later (parked to 11-11) | P2 | Route-first skeleton |
| L50 | blocked by the order after L101 | P1 | Force-directed refinement after pack |
| L53 | blocked by the full cover run | P1 | Mark solved regions in the atlas |
| L67 | later | P2 | Any objective, answered post hoc by the atlas |
| L68 | later | P2 | One optimizer with pluggable energy terms |
| L146 | later | P2 | `layoutText` gives the visual order of each line from the UAX #9 levels of `@mark1russell7/typeset` |
| L69 | later | P1 | Learned preferences from pairwise choices |
| L74 | later | P2 | Forces you compose from queries (ghost edges) |
| L75 | later | P2 | Objectives under an interaction |
| L76 | later | P2 | The orbit of a node: a soft keep-out margin |
| L80 | later | P3 | Site forms for packSpace of packing and routeSpace of highways, then drop PACK_EXTRAS |
| L87 | later | P3 | Move the boxes and the bend points in one pass |
| L88 | later | P3 | Compact the layout after the route |
| L89 | later | P3 | A route demand map in the cost of the packer |
| L90 | later | P3 | Search the objective against real routes |
| L91 | later | P3 | Align linked boxes so that the edges are straight |
| L92 | later | P3 | A learned route proxy for the placer |
| L93 | later | P3 | An exact joint reference for small inputs |
| L121 | later | P3 | The local `permutation` of the strategy space uses `Random.shuffle` of `@mark1russell7/rigor-generators`, after a byte-equal read. |
| L106 | later | P2 | One name for routes through a shape: `route.through` takes the true shape when the measure of the router is on npm, and the extra key stops |
| L107 | later | P2 | An exact rule for a circle beside another shape kind, an obstacle or a polygon container, due 2026-11-28 |
| L112 | later (parked to 11-11) | P2 | A flip test for each gate check of a measure: an injected fault turns the check red, with a clean copy green in the same job |
| L117 | later (parked to 11-11) | P2 | One timed run over 60 s on the joint runner, with a same-twice check that can go red and its flip, in the engine epoch of 2026-11-15 |
| L113 | later (parked to 11-11) | P2 | A CI read of the wait of each pull request gate and release gate, by UTC hour, with the memory gate running and not |
| L116 | later (parked to 11-11) | P2 | A held config cannot stay out of the full race for ever: a censored row after 2 planned nights with a miss, a limit of 0.5 % of the inputs, a plan in part, and kept records that give a value once their reference returns. By 2026-11-12 |
| L133 | later | P2 | The epoch key changes when the joint space changes |

## Done

| ID | Status | Priority | Title |
| --- | --- | --- | --- |
| L155 | done | P2 | Coverage in CI: `@vitest/coverage-v8` in each package with Vitest (layout-contract 0.9.1, strategy-space#6) |
| L153 | done | P1 | A frame record (`layout-frame/1`) and the frames between two layouts, with the laws as property tests (`docs/FRAMES.md`, 0.9.1) |
| L144 | done | P1 | `layoutText` breaks lines at the break places of UAX #14 from `@mark1russell7/typeset` 0.1.8, with the test of `LineBreakTest.txt` |
| L136 | done | P1 | The publish of a sweep night builds on the commit that its check read, so a night that runs at the same time is not lost |
| L95 | done | P1 | Open size families in the joint corpus (`joint-v3`) |
| L140 | done | P2 | The coverage counts name the corpus and the run of each counted name: `kpi-sources.json` and the joint section |
| L134 | done | P1 | Each measure of `kpi.json` has its own date: the age reads the newest run, and the coverage reads the newest cover run |
| L1 | done | P0 | Answer the 5 open questions of the Packer draft |
| L2 | done | P0 | s47: the home of the shared contract |
| L3 | done | P1 | npm bootstrap of the contract package |
| L4 | done | P1 | packing builds the Packer on the contract |
| L7 | done | P1 | s49: the joint measures (joint.*) |
| L8 | done | P1 | The joint corpus |
| L9 | done | P1 | The joint benchmark in CI |
| L10 | done | P1 | The sequential baseline: pack, then route |
| L11 | done | P1 | Iterate place, route, place |
| L13 | done | P1 | Routing-aware gaps |
| L17 | done | P1 | One compare helper: compareMeasure and minEffect (contract 0.2.2) |
| L18 | done | P2 | An exact container test in packHard |
| L19 | done | P1 | Output hash and output groups for the promotion guards |
| L20 | done | P1 | One portfolio combinator for packing, highways and the joint runner |
| L21 | done | P1 | joint-v2: every input gets margin + gap above 0 (d7), with a gap-0 stress cell |
| L22 | done | P2 | A shared corpus claims check in the contract, for packing, highways and the joint corpus |
| L23 | done | P1 | Ties on the record grid: compareMeasure without float noise (0.2.7) |
| L24 | done | P1 | Shared PROMOTION.md blocks with pinned hashes in all three repos |
| L26 | done | P2 | Caller profiles: guards per profile in the shared promotion rule |
| L27 | done | P1 | portfolio(): option hashes "pick" skips the hash of members that do not decide picked |
| L28 | done | P2 | Joint runner on highways 0.6.0 (exactStretches) and packing 0.2.10 |
| L29 | done | P2 | Refit the shard cost plan from measured times |
| L30 | done | P2 | Profile and speed up the joint measures and facts |
| L31 | done | P2 | Move the joint bench to highways 0.8.0 |
| L32 | done | P2 | Add the select packer and measure the new default pair |
| L33 | done | P2 | Move the joint bench to highways 0.8.1 (ROUTE-SCALE) |
| L35 | done | P1 | A nightly sweep over the strategy space in CI |
| L37 | done | P2 | Joint verdicts under both weightings (SCREEN-WEIGHT) |
| L39 | done | P1 | A pool of fixed member sets in strategy-space |
| L41 | done | P2 | A pack() default entry in the joint bench |
| L42 | done | P1 | The layout-contract site on GitHub Pages |
| L43 | done | P1 | Joint compare page and playground with every strategy |
| L45 | done | P1 | One shared corpus generator in layout-contract |
| L46 | done | P1 | Shape kind as a contract dimension |
| L47 | done | P1 | Graph-aware item order: the joint entries rows-graph-bfs and maxrects-bl-graph-bfs |
| L49 | done | P1 | Spacing per channel |
| L51 | done | P2 | Close the 3 corpus API gaps that packing found in k73 |
| L54 | done | P1 | Grow the joint input families every week |
| L55 | done | P2 | Survey joint place-and-route methods as data |
| L56 | done | P2 | A port position relative to its side (Port.along) |
| L57 | done | P2 | Close the 3 shape gaps that packing found in k91 |
| L59 | done | P1 | Measure the 5 wave-3 highway routers in the joint bench |
| L60 | done | P1 | Text measuring and line breaking as a layout step |
| L63 | done | P1 | Bound the memory of the joint runner before bench-4 |
| L64 | done | P1 | Balance and stability measures in the contract (0.2.19) |
| L70 | done | P2 | A layout cache per text and options in /text |
| L71 | done | P2 | A bound-first fast path for labels from a declared character set |
| L77 | done | P1 | Find and bound what fills 6 GB on the 1000-box inputs |
| L78 | done | P2 | An open playground |
| L79 | done | P2 | bench-4: the next version of the joint space |
| L83 | done | P2 | Record fields for highways: env.mode and env.context, and no deterministic claim on a skipped record |
| L84 | done | P1 | A paired-time A/A arm in the joint bench, for the new Time row |
| L85 | done | P2 | CI runs each command of the sweep script on a small fixture |
| L86 | done | P3 | Move the random generators and the joint statistics to the rigor packages |
| L118 | done | P1 | A sample of a space whose constraints reject most draws: the option `draw: "walk"` of `enumerateSpace`. Version 0.5.2. |
| L119 | done | P1 | A meta option that chooses its members from the input: the member rule with `min` and `max` 0. Version 0.5.3. |
| L115 | done | P1 | A deadline inside each shard with a censored row and a flip, the held configs and the origin of a label in the report, and a count of each planned pair with no value |
| L130 | done | P1 | The routers measure of kpi.json reads the rows of the run |
| L145 | done | P1 | Each gate of the joint bench prints a case with no read as a warning annotation on its check |
| L135 | done | P1 | One form of the output fingerprint of an engine entry in the contract: `skip`, `packOutputForm`, `probeHash`, `REFUSED_PROBE` and `fingerprintOf` (0.5.5), and the catalog field `fingerprint` of the schema `strategy-catalog/3` (0.5.6). The engines give the fingerprints. |
