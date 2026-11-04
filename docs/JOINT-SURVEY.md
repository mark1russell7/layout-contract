# The survey of joint place-and-route methods

This file tells the survey of item L55. The survey lists the published methods where the placement and the routing inform each other. The data is `packages/joint/data/survey.json`, and the test `packages/joint/src/survey.test.ts` checks it.

The scope is joint methods only. A method from chip design is here only when its idea carries over to node-link diagrams. A sequential method that places and then routes is not here.

## The format

The format is the survey format of `packing` (`docs/research/SURVEY.md` of that repository). The schema is `joint-survey/1`. The differences are these:

- The id of a method is `J<n>`, and an item is `L<n>`.
- `problemClass` is `graph drawing`, `metro maps` or `VLSI`. The field `shapes` is not here.
- Each source has a `url`, as in the idea records of `highways`.
- `idea` is new. It names a record of the list `ideas` of the data file.
- `checked` is new. It tells how the row was confirmed.
- The scores are in `ideas`, not in each method. A method with an item uses the scores of that item.

| Field | Meaning |
|---|---|
| `id` | The id of the method. |
| `name` | A short name. |
| `description` | The claim of the source, in one line. |
| `published` | `true` for a published method. |
| `sources` | The key, the authors, the year, the title and the URL of each source. |
| `problemClass` | The class of the problem. |
| `family` | The kind of the method. The values are the families of `packing`. |
| `item` | The roadmap item that builds the method, or `null`. |
| `itemTitle` | The title of that item, or `null`. |
| `idea` | The new idea for the method, or `null`. |
| `related` | Other roadmap items. |
| `status` | `built`, `queued`, `not queued` or `rejected`. |
| `note` | The reading of the method for this repository, and what the repositories have. |
| `checked` | The record of the check. |
| `round` | The round of the survey. |

### The two text fields

`description` tells only what the source claims. `note` tells the reading of this repository. Thus the claim of a paper stays apart from the hope for it. Each value in `description` comes from the authors, on their inputs. This repository did not measure it.

### The field `checked`

- `by` is `page` when the session opened a page or a PDF of the paper. It is `index` when the session opened the record of the paper in an index.
- `index` names the index, `OpenAlex` or `Crossref`.
- `page` is the URL of the opened page.
- `claim` tells where the claim comes from: `page`, `index abstract` or `citing paper`.

Each source URL is the DOI link when the DOI is known. Thus the URL of a source and the page in `checked` can be different.

A row with `citing paper` has a weaker claim. Read the paper before you build from that row.

### The meaning of the status

- `built` means that a repository has an analog of the idea. No row is the published algorithm. The `note` tells the difference.
- `queued` means that an open roadmap item covers the method. A method with an `idea` got its item from this survey.
- `not queued` means that no roadmap item covers the method. The field `idea` names its new idea. No row has this status today.
- `rejected` means that the survey keeps the method and does not plan it. No row has this status today.

The session checked `layout-contract`, `packing` and `highways` for each row. For `highways`, it read the idea records at their stages. For `packing`, it read the catalog, the roadmap and the strategy `force`. The session did not read each source file of those repositories.

## The methods

| ID | Method | Source | Class | Status | Item or idea |
|---|---|---|---|---|---|
| J1 | Edge routing inside a force-directed layout | Dwyer 2006 | graph drawing | queued | L87 |
| J2 | Layout that keeps the topology of poly-line connectors | Dwyer 2009 | graph drawing | queued | L87 |
| J3 | Stress layout with ports and flow | Ruegg 2014 | graph drawing | queued | L62 |
| J4 | Grid-like layout by soft and hard constraints | Kieffer 2013 | graph drawing | queued | L91 |
| J5 | Curved edges by dummy vertices in a force layout | Finkel 2005 | graph drawing | queued | L87 |
| J6 | Near-Lombardi drawing by forces | Chernobelskiy 2012 | graph drawing | queued | L87 |
| J7 | Minimum-bend shape by network flow | Tamassia 1987 | graph drawing | queued | L48 |
| J8 | Three-phase orthogonal drawing | Biedl 2000 | graph drawing | queued | L14 |
| J9 | Topology-shape-metrics layout of class diagrams | Eiglsperger 2004 | graph drawing | queued | L48 |
| J10 | Exact compaction of a routed drawing | Klau 1999 | graph drawing | queued | L88 |
| J11 | One-dimensional compaction after a layered layout | Ruegg 2016 | graph drawing | queued | L88 |
| J12 | Layered layout with port constraints | Schulze 2013 | graph drawing | queued | L14 |
| J13 | Dummy nodes for ports in crossing reduction | Klauske 2012 | graph drawing | queued | L14 |
| J14 | Stations and routes on an octilinear grid | Bast 2020 | metro maps | queued | L93 |
| J15 | Metro maps by one mixed-integer program | Nollenburg 2010 | metro maps | queued | L93 |
| J16 | One genetic algorithm for node layout and edge bundling | Meikari 2024 | graph drawing | queued | L15 |
| J17 | Global routing inside placement | Pan 2007 | VLSI | queued | L15 |
| J18 | Simultaneous place and route for FPGAs | Nag 1994 | VLSI | queued | L15 |
| J19 | RUDY, a routing demand estimate without a router | Spindler 2007 | VLSI | queued | L89 |
| J20 | Lookahead routing and cell bloating | Kim 2011 | VLSI | built | L11 |
| J21 | Iterated spreading by temporary inflation | Roy 2009 | VLSI | built | L11 |
| J22 | White space by congestion | Yang 2003 | VLSI | built | L13 |
| J23 | Joint learning of placement and routing | Cheng 2021 | VLSI | queued | L92 |
| J24 | A graph network as a differentiable routability term | Hou 2024 | VLSI | queued | L92 |
| J25 | Placement objectives that evolve from routing feedback | Chen 2026 | VLSI | queued | L90 |
| J26 | Early global routing on a floorplan | Kar 2018 | VLSI | queued | L48 |
| J27 | Floorplanning with pin assignment | Pedram 1990 | VLSI | queued | L14 |
| J28 | Pin assignment inside the floorplanner | Xu 2025 | VLSI | queued | L14 |

## The ideas

Each method that is not built has an open item or an idea. The ideas are in the order of their scores. The score is gain x uncertainty / cost, as in the queue of items. The numbers are estimates of the survey, not measurements. Each idea needs a prediction before its run.

| Idea | Item | Title | Methods | Depends on | Gain | Uncertainty | Cost | Score |
|---|---|---|---|---|---|---|---|---|
| `joint-refine` | L87 | Move the boxes and the bend points in one pass | J1, J2, J5, J6 | L62, L68 | 0.5 | 0.7 | 3 | 0.117 |
| `route-compact` | L88 | Compact the layout after the route | J10, J11 | none | 0.4 | 0.5 | 2 | 0.1 |
| `demand-map` | L89 | A route demand map in the cost of the packer | J19 | L12 | 0.3 | 0.6 | 2 | 0.09 |
| `objective-evolve` | L90 | Search the objective against real routes | J25 | L66, L68 | 0.3 | 0.8 | 3 | 0.08 |
| `straight-align` | L91 | Align linked boxes so that the edges are straight | J4 | L50 | 0.3 | 0.5 | 2 | 0.075 |
| `route-proxy` | L92 | A learned route proxy for the placer | J23, J24 | L12 | 0.3 | 0.7 | 3 | 0.07 |
| `exact-reference` | L93 | An exact joint reference for small inputs | J14, J15 | none | 0.3 | 0.4 | 3 | 0.04 |

## The next round

Do a new round when the queue of joint items has less than one week of work. Use a new number after J28, and set `round` to the new round. Add a row only when a page or an index record confirms it in that round. The record must give the title, the authors and the year. Do not add a row from memory.
