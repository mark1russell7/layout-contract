# The joint corpus

A joint input has boxes and edges, but no positions. The packer places the boxes, and then the router routes the edges between them. Thus the edges of a joint input come from the topology alone, not from positions.

- The base of a joint input is an input of a generator of `packing` (`docs/FORMAT.md` of `packing`).
- `edgeStep` of this package adds the edges, the groups and the ports to the base input.
- The joint corpus `joint-v1` has a pairwise covering array over the 14 dimensions of the cells, with the seeds 1 to 3.
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

- The base inputs come from `rect-grid` and the families `gallery`, `dashboard`, `cards` and `word-cloud` of `packing` 0.2.1 or later.
- The covering array covers each pair of values of the 14 dimensions: the 10 dimensions of `packing` and the 4 dimensions of the edges.
- Each input has at most 1000 boxes, unless its cell asks for more.
- The cases `empty`, `one` and `oversize` of `edge-cases` are fixed inputs outside the covering array. They give no routes.
- The joint runner is a private package of this repository. It uses `packing` and `highways` from npm, and the benchmark runs in CI.
