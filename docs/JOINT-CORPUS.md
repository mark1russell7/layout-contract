# The joint corpus

A joint input has boxes and edges, but no positions. The packer places the boxes, and then the router routes the edges between them. Thus the edges of a joint input come from the topology alone, not from positions.

- The base of a joint input is an input of a generator of `packing` (`docs/FORMAT.md` of `packing`).
- `edgeStep` of this package adds the edges, the groups and the ports to the base input.
- The joint corpus `joint-v1` has 2 pairwise covering arrays over the 10 dimensions of the cells, with the seeds 1 to 3.
- The joint corpus `joint-v2` adds the step `spacing` and its dimension `spacing`. Thus its cells have 11 dimensions.
- The families of the joint corpora are on the shared family registry of `docs/CORPUS.md`. The manifests do not change.
- The decision is `d14` of the tracker of `layout-stack`.

## The step `edges` (version 1)

`edgeStep(input, params, seed)` gives a new input. The default of `seed` is `input.seed`. The input does not change.

- An input with edges is a bad input. `edgeStep` refuses it with a `RangeError`.
- The random numbers come from 2 steps: `edges` and `ports`. Each step starts its own generator: `mulberry32(fnv1a32(seed + ":" + step))`, as in `packing`.
- The function appends its stamp `{ name: "edges", version: 1, params, seed }` to `steps`. `params` has each parameter with its default.
- The function removes the old `hash`. The runner calculates the hash of the new file.
- The function does not write `cell`. The manifest of the corpus writes the cell, as in `packing`.

The parameters:

| Parameter | Values | Default |
|---|---|---|
| `edgeDensity` | `sparse` (0.5 edges for each box), `medium` (1.5), `dense` (4) | none |
| `edgeShape` | `random`, `clustered`, `hubChain`, `hubs`, `longRange`, `tree`, `bundled` | none |
| `groups` | `none`, `flat`, `nested` | `none` |
| `ports` | `free`, `sides`, `fixed` | `free` |
| `hubBy` | `area`, `random` | `area` |

`hubs` is not a value of `LayoutCell.edgeShape` yet. It becomes a value at the next breaking change of the contract.

## The step `spacing` (version 1)

`spacingStep(input, { spacing }, seed)` of `packages/joint/src/spacing.ts` gives a new input. The input does not change. The step is in the joint package, not in the contract.

- The step removes each margin of the boxes. Then it sets the margin of each box and the gap of the input from the value of `spacing`.
- It sets `margin` only when the margin is above 0. It always sets `gap`, also to 0.
- It appends its stamp `{ name: "spacing", version: 1, params: { spacing, margin, gap }, seed }` to `steps`.
- It removes `hash`, as each step does.

| `spacing` | Margin of each box | Gap | Space between two boxes | Space between a box and an obstacle |
|---|---|---|---|---|
| `stress` | 0 | 0 | 0 | 0 |
| `gap` | 0 | 10 | 10 | 5 |
| `margin` | 10 | 0 | 20 | 10 |
| `both` | 5 | 5 | 15 | 7.5 |

### The reasons of the values

The values come from the router of `highways` and from the frame of `packing` 0.2.6. Decision `d3` tells the meaning of the margin and the gap.

- The router puts its corners 5 units from each bare box: this is its option `margin`, with the default 5.
- The router drops a corner inside another box with the pad 2.5. It examines each segment with the same pad.
- Thus a channel between two boxes needs 7.5 units or more. A corner 5 units from box A must be 2.5 units or more from box B.
- The route clearance `ROUTE_CLEARANCE` is 10: two times the corner margin. Then the two corner lines meet in one middle line, 5 units from each box.
- The frame of `packing` grows each box by its margin and half the gap. It grows each obstacle by half the gap.
- Thus two placed boxes are 2m + g apart, and a box is m + g/2 from an obstacle. The border space is m + inset.
- Each pack strategy (`rows`, `skyline`, `shelf` and `maxrects`) uses this frame. The test `spacing.test.ts` measures the spaces of each pack entry.

Thus the values are these:

- `stress` is the stress cell of decision `d7`: margin 0 and gap 0. The rule `no-pass-through` fails there.
- `gap` puts the full clearance into the gap. It has no margins.
- `margin` puts the full clearance into the margin of each box. It has the gap 0.
- `both` puts half of the clearance into each.

Some facts of the values:

- The router of `highways` 0.5.1 ignores the margin of a box, the gap, the inset and the container. It sees only the bare boxes.
- The value `gap` leaves only 5 units between a box and an obstacle. This is less than the 7.5 units of a channel.
- The value `margin` gives 20 units between two boxes, two times the space of `gap`. Thus its fill is lower for 2 reasons, not only at the border.

## The order of the random numbers

The generator `r` of the step `edges` gives the numbers in this order. `int(r, lo, hi)` is a whole number from `lo` to `hi`, both included.

1. The shuffle: for `i` from `n - 1` down to 1, `j = int(r, 0, i)`, and the indices `i` and `j` change places.
2. The clusters: the box at the place `p` of the shuffle is in the cluster `floor(p / 8)`. A cluster has 8 boxes, and the last cluster can have fewer.
3. The collections: with `bundled`, the collection of a box is `<name>-<cluster>`. With the other shapes, the collection of each box is one name of `users`, `orders`, `items` and `events`, in the order of the boxes.
4. The edges of the shape, as in the next section.

The order of the hubs is the order of the area of the boxes, the largest first, with `hubBy` `area`. Two boxes with the same area keep the order of the input. With `hubBy` `random`, the order of the hubs is the shuffle.

## The shapes

The target count of the edges is `round(n * density)`, and at most `n * (n - 1) / 2`. A pair of boxes has at most 1 edge, and no edge goes from a box to the same box. An input with fewer than 2 boxes gets no edges.

- `random`: the source and the target are 2 random boxes.
- `clustered`: the source is a random box. With a chance of 0.85, the target is a random box of the same cluster. Else, the target is a random box.
- `longRange`: the target is a random box of a different cluster.
- `hubs`: the target is the hub at the place `floor(n * r()^3)` of the order of the hubs. Thus a few hubs get most of the edges.
- `tree`: the box at each place `i` from 1 to `n - 1` of the order of the hubs gets one edge. It comes from the box at a random place of 0 to `i - 1`. The tree has `n - 1` edges, and the density does not change it.
- `hubChain`: the shuffle makes chains of at most 32 boxes. Each box of a chain has an edge to the next box.
- Then `hubChain` adds skip links to the target count. A skip link goes from a box at the place `i` of a chain to the place `i + floor(L / 8) + int(r, 0, floor(L / 2))` of the next chain. `L` is the length of the chain.
- `bundled`: fan-outs make 60% of the edges. A fan-out goes from one random box to 4 to 15 random boxes of one other cluster. The rule of `clustered` makes the other edges.

Each edge has the id `e<k>`, in the order of the edges. Its `data.collection` is the collection of its target box. The rule `collection` of `highways` reads it.

## The groups and the ports

- `flat`: each box gets the group `g<c>` of its cluster `c`, in `group` and in `data.group`. The grouping rule `keys` of `highways` reads `data.group`.
- `nested`: `group` is `g<c>`, and `data.group` is the path `G<floor(c / 4)>/g<c>`. Thus 4 clusters make one large group.
- The rule `keys` of `highways` reads all of `data.group` as one key at this time. Thus a `nested` cell gives the same groups as a `flat` cell in `highways`. A new option of `keys` splits the path at `/`.
- `sides`: each end of an edge gets its own port, with a random side and no position. The port of the source is `<edge id>.s`, and the port of the target is `<edge id>.t`.
- `fixed`: each box gets a fixed port `out` with a chance of 0.2. The port has a random side and a random position on that side, rounded to 3 decimals.
- The edges from a box with the port `out` use that port as their `sourcePort`. A fixed port has `x` and `y` relative to the box, thus a pack does not change it.

## The pinned hashes

The base input of the test has 40 boxes from the step `boxes`, with `w = int(r, 20, 120)` and `h = int(r, 20, 80)`. The hash is the first 16 hex characters of the SHA-256 of the canonical form.

| Seed | Parameters | `hash` |
|---|---|---|
| 1 | `clustered`, `medium` | `dedf6f7ccb193d40` |
| 2 | `bundled`, `dense`, `flat`, `sides` | `f808e8ae593d9bd9` |
| 3 | `hubChain`, `medium`, `nested`, `fixed` | `6b07703b51ca6c23` |

## The corpus `joint-v1`

The private package `packages/joint` makes the corpus. Its function `jointCorpus()` gives the manifest and the input files.

- The base inputs come from `rect-grid`, `gallery`, `dashboard`, `cards`, `word-cloud` and `edge-cases` of `packing` 0.2.1 or later.
- `edgeStep` adds the edges to each base input, with the seed of the base input.
- The cell of a joint input has 10 dimensions: the 6 dimensions of `packing` and the 4 dimensions of the edges.
- The dimensions of `packing` are `containerSize`, `containerShape`, `obstacles`, `sizes`, `count` and `mode`. `mode` has only the value `offline`.
- The dimensions of the edges are `edgeDensity`, `edgeShape`, `groups` and `ports`. `edgeShape` has the 7 shapes of `edgeStep`, with `hubs`.
- Each input has at most 1000 boxes.

### The arrays

A pairwise covering array has each pair of values of 2 different dimensions in one row or more. Each row is one spec, with the seeds 1, 2 and 3.

| Array | Generators | Dimensions and their counts of values | Rows |
|---|---|---|---|
| `grid` | `rect-grid` | `containerSize` 5, `containerShape` 6, `obstacles` 7, `sizes` 6, `count` 3, `edgeDensity` 3, `edgeShape` 7, `groups` 3, `ports` 3 | 55 |
| `ui` | `gallery`, `dashboard`, `cards`, `word-cloud` | the family 4, `containerSize` 5, `edgeDensity` 3, `edgeShape` 7, `groups` 3, `ports` 3 | 37 |

- The function `pairwise` of the package makes each array with a greedy AETG algorithm. Its random numbers come from the step `pairwise` of the seed 1.
- For each row, the algorithm makes 50 candidate rows and keeps the row that covers the most new pairs.
- The least possible count of rows is 49 for `grid` (7 obstacle layouts by 7 edge shapes) and 35 for `ui`.
- The counts of `grid` are 10, 100 and 1000. The count 1 gives no routes, and 10000 boxes are more than the limit.
- Each family of `ui` has its default count: 10 for `dashboard`, and 100 for the other families.
- `mode` has one value, thus the arrays do not include it.
- The function `coverage` gives the pairs of a set of cells, the covered pairs and the share. The test gets a share of 1 for each array.

### The fixed inputs

- The cases `empty`, `one` and `oversize` of `edge-cases` are fixed inputs outside the arrays. `empty` and `one` give no routes.
- Their edges have `edgeShape` `random` and `edgeDensity` `medium`, with the groups `none` and the ports `free`.

Thus the corpus has 95 specs (55, 37 and 3) and 285 inputs.

### The files

- The id of an input is `joint-v1/<family>/s<seed>`, and its `set` is `joint-v1`.
- The family is the family of `packing` and the part of the edges: `e-<edgeDensity>.<edgeShape>.<groups>.<ports>`.
- An example of a family is `rect-grid.fixed.rect.wall.uniform.n100.e-medium.clustered.flat.sides`.
- The hash comes from the file after `edgeStep`, as in the section "The pinned hashes".
- The manifest `packages/joint/corpus/joint-v1/corpus.json` has the format `layout-corpus/1`. Each spec has its array, its generator, its full parameters, the stamp of the step `edges` and its seeds.
- `inputs` of the manifest has the id, the hash and the cell of each input. The input files do not have the cell, as in `packing`.
- The cell has the values of `packing`, with the 4 dimensions of the edges. Its `edgeShape` can be `hubs`.
- The test of the package compares the corpus with the manifest. After a change of the corpus, write the manifest again with the script `corpus` of the package.
- The joint runner comes later. It uses `packing` and `highways` from npm, and CI starts the benchmark.

## The corpus `joint-v2`

`jointCorpus("joint-v2")` gives the second corpus. The corpus `joint-v1` stays frozen: its manifest, its inputs and its tests do not change.

- The specs are the specs of `joint-v1`, with `spacing` as the 11th dimension of the 2 arrays.
- The function `pairwise` makes each array again, with the same seed. The test gets a share of 1 for each array.
- `spacing` is a dimension of the cell types of the joint package, not of `LayoutCell` of the contract.
- After `edgeStep`, the step `spacing` sets the margins and the gap of each input. The hash comes from the file after the 2 steps.

| Array | Dimensions | Rows |
|---|---|---|
| `grid` | the 9 dimensions of `joint-v1`, and `spacing` 4 | 59 |
| `ui` | the 6 dimensions of `joint-v1`, and `spacing` 4 | 36 |

- The fixed cases `empty` and `one` have the value `both`. They give no routes, so 1 value is sufficient.
- The fixed case `oversize` has each of the 4 values.
- Thus the corpus has 101 specs (59, 36 and 6) and 303 inputs.
- 81 inputs have the value `stress`, 78 `gap`, 66 `margin` and 78 `both`.

### The files of `joint-v2`

- The id of an input is `joint-v2/<family>/s<seed>`. The family of `joint-v1` gets the part `.sp-<spacing>`.
- The manifest is `packages/joint/corpus/joint-v2/corpus.json`. Each spec has the stamps of the steps `edges` and `spacing`.
- Each entry of the stress cell has the field `stress: true`. The cell of each entry has the value `spacing`.
- The manifest has the field `claims`. The section "The corpus check" of `docs/JOINT-BENCH.md` tells the claims.
- The script `corpus` of the package writes the manifests of the 2 corpora. `pnpm corpus joint-v2` writes only `joint-v2`.
