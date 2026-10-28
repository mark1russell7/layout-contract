# The shared corpus generator

The shared corpus generator is `packages/layout-contract/src/families.ts`. It gives one dimension schema, one family registry and one source of seeded random numbers. The joint sweep, the site of `packing` and the site of `highways` use it. Thus each site shows the same range of inputs, and a browser makes each input live. The item is `L45` of the tracker of `layout-stack`.

The split of the work:

- `layout-contract` owns the interface, the dimension schema, the shared dimension table, the registry, the default random numbers and the browser safety.
- Each engine owns its families and gives them to a registry. `packing` owns `rect-grid`, the 4 families of a user interface, `edge-cases` and `rect-scattered`. `highways` owns its graph families.
- `layout-contract` imports no engine. An import registers nothing. A host makes a registry from the lists of families of the engines.

## The dimension schema

A dimension is a `CorpusDimension`. It is a `SpaceParam` of `docs/STRATEGY-SPACE.md`, with 3 more fields. Thus the dimensions use the value checks of the strategy space.

| Field | Value |
|---|---|
| `name` | The name of the dimension. The name `kind` is reserved: the cell of `cellOf` has the name of the family in `kind`. |
| `kind` | `enum`, `int`, `real` or `bool`. |
| `values` | The values of an `enum`. |
| `min`, `max` | The range of an `int` or a `real`. |
| `step` | The step of the values from `min`. It is optional. |
| `scale` | `linear` or `log`. A log scale with a `min` of 0 is the log of `1 + x - min`. |
| `default` | The value of an input that does not set the dimension. |
| `when` | The dimension is active only when an earlier dimension has one of the values `in`. |
| `meaning` | The meaning, in one sentence. |
| `engines` | The engines that read the dimension. |
| `levels` | The values of a sweep. It is optional. |

- `levelsOf(dim, steps)` gives the values of a sweep. `levels` come first. Then an `enum` gives its values. With `steps`, a range gives `steps` points on its scale. Else the dimension gives its default.
- `dimensionAt(dim, t)` gives the value at the fraction `t` of a range, on its scale. `dimensionUnit(dim, value)` gives the fraction of a value. A slider of a site uses the 2 functions.
- `resolveDimensions(dimensions, dims)` gives the full values of an input. It throws a `RangeError` for an unknown dimension or a bad value.

### The rules of `when`

- A missing value, a default that the caller gives and a value of an inactive dimension give the same full values.
- The family gets the default of an inactive dimension. A generator can read a dimension on more kinds than its `when` tells.
- `cells` and `cellCount` skip the dead combinations of `when`. `cellOf` does not include an inactive dimension.
- The registry examines a value of an inactive dimension. A bad value causes a `RangeError`, also when the dimension is inactive.

## The shared dimension table

`CORPUS_DIMENSIONS` has the shared dimensions. A family takes a dimension with `sharedDimension(name, patch)`, or it declares its own dimension.

| Dimension | Kind | Values or range | Default | Scale | Engines | Meaning |
|---|---|---|---|---|---|---|
| `count` | `int` | 0 to 100000, sweep 1, 10, 100, 1000, 10000 | 100 | `log` | `packing`, `highways`, `joint` | The count of the items (n). |
| `sizes` | `enum` | `identical`, `nearIdentical`, `uniform`, `heavyTail`, `bimodal`, `extremeAspect` | `uniform` | | `packing`, `joint` | The distribution of the sizes of the items. |
| `aspect` | `real` | 0.25 to 4 | 1 | `log` | `packing` | The width over the height of a container with no fixed size. |
| `density` | `real` | 0.05 to 1 | 0.4 | `linear` | `packing` | The area of the items over the area of the frame. |
| `obstacles` | `enum` | `none`, `center`, `scattered`, `wall`, `corridors`, `touching`, `edge` | `none` | | `packing`, `joint` | The layout of the fixed obstacles. |
| `containerSize` | `enum` | `fixed`, `freeHeight`, `freeWidth`, `freeAspect`, `freeArea` | `fixed` | | `packing`, `joint` | The sides of the container that the engine can change. |
| `containerShape` | `enum` | `rect`, `convex`, `polygon`, `circle`, `ellipse`, `holes` | `rect` | | `packing`, `joint` | The kind of the shape of the container. |
| `shape` | `enum` | `rect` | `rect` | | `packing` | The shape kind of each item. `L46` adds `polygon`, `circle` and `free`. |
| `order` | `enum` | `free`, `soft` | `free` | | `packing` | The reading order of the items. |
| `groups` | `enum` | `none`, `flat`, `nested` | `none` | | `highways`, `joint` | The groups of the items. |
| `edgeDensity` | `enum` | `sparse`, `medium`, `dense` | `medium` | | `highways`, `joint` | The mean count of the edges of each item: 0.5, 1.5 or 4. |
| `edgeShape` | `enum` | `random`, `clustered`, `hubChain`, `hubs`, `longRange`, `tree`, `bundled` | `random` | | `highways`, `joint` | The topology of the edges. |
| `ports` | `enum` | `free`, `sides`, `fixed` | `free` | | `highways`, `joint` | The ports of the edges. |
| `hubBy` | `enum` | `area`, `random`, when `edgeShape` is `hubs` or `tree` | `area` | | `joint` | The order of the hubs. |
| `spacing` | `enum` | `stress`, `gap`, `margin`, `both` | `both` | | `joint` | The split of the route clearance (`docs/JOINT-CORPUS.md`). |
| `margin` | `real` | 0 to 32 | 0 | `linear` | `packing`, `joint` | The margin of each item. |
| `gap` | `real` | 0 to 32 | 0 | `linear` | `packing`, `joint` | The free space between two items. |

The dimension `shape` uses the names of `L46`. When `L46` adds the type `ShapeKind`, the dimension uses it.

## The family registry

`createFamilyRegistry(families)` gives a `FamilyRegistry`. A family is a `CorpusFamily` with these fields:

| Field | Value |
|---|---|
| `name`, `version` | The name and the version. Each version is one registration. A dimension of only some versions is in the list of those versions only, for example `order` of `rect-grid` version 2. |
| `owner` | The engine that owns the definition. |
| `meaning` | The meaning, in one sentence. |
| `dimensions` | The dimensions, in their order. |
| `seeding` | The text of the rule that gives the random numbers from the seed and the dimensions. |
| `crossEngine` | `exact`, or `libm-dependent` for a family that uses `Math.log`, `Math.cos`, `**` or a function of the same type. |
| `rng` | The random factory. The default is `DEFAULT_RNG`, the `mulberry32` of `random.ts`. |
| `rngSeed` | The function that gives the seed of the stream from the input seed and the full dimensions. The default gives the input seed. |
| `familyBy` | The dimensions of the family key after the name of the family. The default is no dimension. |
| `generate` | The function `generate(seed, dims, context)` that gives the input or the board. |

The rules of the registry:

1. `generate(name, seed, dims, options)` gives `generate` of the family the raw seed. The seed does not go through `fnv1a32` or `stepRandom`.
2. `context.random` is `rng(rngSeed(seed, dims))`. `context.rng` is the factory, and `context.set` is the name of the corpus.
3. `dims` has a value for each dimension of the family. The family puts into its params only the values that it needs. The registry writes no params.
4. The registry gives the output of the family with no change. It calculates no hash. The family chooses its hash function.
5. Without a version, `family(name)` gives the first version that the registry got, as `generator(name)` of `packing`.
6. `cells(name, options)` gives the cells of a sweep, and `cellCount(name, options)` counts them with no list. The last dimension changes first.
7. `boundaryCells(name)` gives the defaults and each end of each range, with the other dimensions at their defaults.
8. `rngOf(name)(seed, dims)` gives the stream of an input. A test of each family pins its first values.
9. `familyBy()` gives the map form of `FamilyBy` for the cells of `cellOf`. `DEFAULT_FAMILY_BY` is `{ "*": [] }`: the key is the name of the family.

The test `families.test.ts` pins the first 8 values of `mulberry32(0)` as whole numbers of 32 bits: 1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985, 2642484575 and 2787370982. The generators of `highways` give the same stream.

## The steps and the composed families

A `CorpusStep` changes an input after its base family, with the same seed. `composeFamily(base, steps, options)` gives one family of the base and the steps.

- The dimensions of the composed family are the dimensions of the base, then the dimensions of each step. Two dimensions with the same name cause a `RangeError`.
- The family of the input gets the part of each step after a dot. The id becomes `<set>/<family>/s<seed>`.
- The input gets the hash of `options.hash`. The default is `documentHash`.
- The composed family is `libm-dependent` when the base or a step is `libm-dependent`.
- `EDGES_STEP` is the step `edges` of `edgeStep`. Its family part is `e-<edgeDensity>.<edgeShape>.<groups>.<ports>`. It is `libm-dependent`, because the shape `hubs` uses `**`.

## The browser safety

The code path of the registry uses no API of Node: no `fs`, no `crypto` of Node and no `worker_threads`. The SHA-256 of `hash.ts` and the UTF-8 bytes of `utf8.ts` are plain code.

- The test `browser safety` of `families.test.ts` reads the import closure of `families.ts` and of the package root. It finds no external import and no global of Node.
- The joint test `families.test.ts` examines `families.ts`, `spacing.ts` and `pairwise.ts` of the joint package.
- The minified bundle of the registry is approximately 18 KB, and approximately 8 KB with gzip. The bundle of the package root is approximately 59 KB.

## The joint corpus on the registry

`jointRegistry(set)` of `packages/joint/src/families.ts` gives the families of a joint corpus. Each family is a generator of `packing`, then `EDGES_STEP`, then `SPACING_STEP` in `joint-v2`.

- `packingFamily(gen)` gives a family for a generator of `packing`. It changes nothing in the output. When `packing` registers its own families, the joint package uses them, and the function goes.
- `jointCorpus(set)` makes each input with `jointRegistry(set)`. The manifests `corpus/joint-v1/corpus.json` and `corpus/joint-v2/corpus.json` do not change, byte for byte.
- The joint test `families.test.ts` compares the registry with the path before `L45` on 19 specs of `joint-v1` and 20 specs of `joint-v2`, with each seed. The manifest tests compare all the inputs.
- The same test counts 285 inputs of `joint-v1` and 303 inputs of `joint-v2`. The full sweep of the family `rect-grid` of `joint-v2` has 6123600 cells. The test counts them with no input.
- A `rect-grid` input of `joint-v2` with 1000 boxes and 4000 edges takes approximately 90 ms in Node on a loaded machine. A site makes such an input in the browser with no worker.

## The coverage

Each cell tells the family that reads the dimension in each engine. "Own" tells that the engine has its own dimension for the same property. "None" tells that no family of the engine reads it.

| Dimension | `packing` | `highways` | `joint` |
|---|---|---|---|
| `count` | each family | own: `nodes` of the fixtures | each family |
| `sizes` | `rect-grid` | none | `rect-grid` |
| `aspect` | none | none | none |
| `density` | none | none | none |
| `obstacles` | `rect-grid` | none | `rect-grid` |
| `containerSize` | `rect-grid` and the families of a user interface | none | the same families |
| `containerShape` | `rect-grid` | none | `rect-grid` |
| `shape` | none: each item is a rectangle until `L46` | none | none |
| `order` | `rect-grid` version 2 | none | none |
| `groups` | none | own: `groupCols`, `groupRows` and `perGroup` of `many-groups` | `EDGES_STEP` |
| `edgeDensity` | none | own: `edgesPerNode` of the fixtures | `EDGES_STEP` |
| `edgeShape` | none | own: the fixture kind | `EDGES_STEP` |
| `ports` | none | own: `fixedPorts` of the fixtures | `EDGES_STEP` |
| `hubBy` | none | none | `EDGES_STEP` |
| `spacing` | none | none | `SPACING_STEP` of `joint-v2` |
| `margin` | none: a knob of the site | none | through `spacing` |
| `gap` | none: a knob of the site | own: `gap` of `hub-chain`, with a different meaning | through `spacing` |

### The corpora that do not use the registry yet

| Corpus | Engine | What it needs |
|---|---|---|
| `corpus-v1`, `xcheck-v1` and the portfolio sets | `packing` | The registrations of its 8 generators (`k73`), with `crossEngine`. The knobs `margin`, `gap`, `shape` and a log slider of `count` for its site. |
| The screen sets (74 boards) | `highways` | The registrations of its 6 families. A new name for its fixture dimension `kind`, for example `layout`. Its own `documentHash`, with no number grid. |
| The other sets of fixtures | `highways` | The same registrations, after the screen sets. |
| `joint-v1` and `joint-v2` | `joint` | It uses the registry at this time, through the adapter `packingFamily`. It changes to the families of `packing` after `k73`. |

### The owners of the families today

- `packing` owns `rect-grid` (versions 1 and 2), `gallery`, `dashboard`, `cards`, `word-cloud` and `edge-cases`. The joint package has no copy: `packingFamily` starts the generator of `packing`.
- `rect-scattered` has two copies: `generators.ts` of `packing` and `bench/screen/generators.ts` of `highways`. A test in each repository pins the hashes of the seeds 1, 2 and 3.
- The proposal: `layout-contract` gets the one copy of `rect-scattered`, as a family on `stepRandom` with the owner `layout-contract`. Each engine registers that family and removes its copy. Its pinned hashes stay as they are. The hash does not change, because each number of the input is a whole number, so the grid of `documentHash` changes nothing.

## The requests to the engines

### The request to `packing`

> L45 is in `layout-contract` (the release after L46). Register your generators on the registry: `createFamilyRegistry` and `CorpusFamily` of `families.ts`.
>
> 1. Export one `CorpusFamily` for each generator: `rect-grid` versions 1 and 2, `gallery`, `dashboard`, `cards`, `word-cloud`, `edge-cases` and `rect-scattered`. Use `sharedDimension` for each shared parameter. Give `order` only to version 2.
> 2. `generate(seed, dims, context)` starts your generator with `context.set`. Keep `seeding` as the steps `container`, `obstacles` and `boxes` of `stepRandom`. Set `crossEngine` to `libm-dependent` for `rect-grid` (`heavyTail` uses `**`), and `exact` for the other generators.
> 3. Put the knobs of your site into the dimensions: `margin` and `gap` (0 to 32), `shape` (the kinds of L46) and `count` (0 to 10000, `log`). A knob at its default adds no field to the input.
> 4. Make the demo of your site get its inputs from `registry.generate`, and its sliders from `levelsOf`, `dimensionAt` and `dimensionUnit`.
> 5. Add a test: each family through the registry gives the hashes of `corpus-v1` and `xcheck-v1` of today. Then tell `layout-stack`. The joint package then removes `packingFamily`.

### The request to `highways`

> L45 is in `layout-contract` (the release after L46). Register your screen families on the registry: `createFamilyRegistry` and `CorpusFamily` of `families.ts`.
>
> 1. Export one `CorpusFamily` for each family of `screen-v1`: `tiny-uniform`, `small-clustered`, `dense-groups`, `hub-chain`, `many-groups` and `packed-grid`.
> 2. A cell keeps the name of its family in `kind`. Give your fixture dimension another name, for example `layout`.
> 3. Make your `generate` write that dimension into your params as `kind`. Then the hash does not change.
> 4. Use `rngSeed(seed, dims)` for the seed of the stream: `(seed * 2654435761 + dims.nodes) >>> 0` for the 3 fixture families. The other families use the seed. The default `rng` is `mulberry32`, the stream of your `rng`.
> 5. Put `when` on `locality` (only `clustered`) and on `hubSkew` (only `hubs`). The registry gives `generate` the default of an inactive dimension.
> 6. Write into `generator.params` only the dimensions away from their defaults. Use your own `documentHash`: the registry calculates no hash.
> 7. Set `crossEngine` to `libm-dependent` for the kinds that use `Math.log` and `Math.cos`, and `exact` for the other families.
> 8. Make the examples page of your site get its boards from `registry.generate`. Keep your test of the 74 screen boards and of the manifest hashes `e5fe56d1069d2a18` and `35795acefa7148c3`. Then tell `layout-stack`.
