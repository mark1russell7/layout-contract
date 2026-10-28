# The shared corpus generator

The shared corpus generator is `packages/layout-contract/src/families.ts`. It gives one dimension schema, one family registry and one source of seeded random numbers. The joint sweep, the site of `packing` and the site of `highways` use it. Thus each site shows the same range of inputs, and a browser makes each input live. The item is `L45` of the tracker of `layout-stack`.

The split of the work:

- `layout-contract` owns the interface, the dimension schema, the shared dimension table, the registry, the default random numbers and the browser safety.
- Each engine owns its families and gives them to a registry. `packing` owns `rect-grid`, the 4 families of a user interface and `edge-cases`. `highways` owns its graph families.
- `layout-contract` owns the shared family `RECT_SCATTERED`. Both engines register it.
- `layout-contract` imports no engine. An import registers nothing. A host makes a registry from the lists of families of the engines.

## The dimension schema

A dimension is a `CorpusDimension`. It is a `SpaceParam` of `docs/STRATEGY-SPACE.md`, with 5 more fields. Thus the dimensions use the value checks of the strategy space.

| Field | Value |
|---|---|
| `name` | The name of the dimension. The name `kind` is reserved: the cell of `cellOf` has the `familyKind` of the family in `kind`. |
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
| `supported` | The values that the family accepts. It is optional. A list is for an `enum` or a `bool`. A range `{ min?, max? }` is for an `int` or a `real`. |
| `invalidates` | The output fields that a value other than the default makes wrong, for example `known`. It is optional. |
| `precision` | The count of decimal places that the family uses for a numeric value. Only the `invalidates` compare reads it. It is optional. |

- `levelsOf(dim, steps)` gives the values of a sweep. `levels` come first. Then an `enum` gives its values. With `steps`, a range gives `steps` points on its scale. Else the dimension gives its default.
- With `supported`, `levelsOf` gives an `enum` and a `bool` only their supported values. The points of a range stay in the supported range.
- `dimensionAt(dim, t)` gives the value at the fraction `t` of a range, on its scale. `dimensionUnit(dim, value)` gives the fraction of a value. A slider of a site uses the 2 functions.
- `dimensionSupports(dim, value)` tells if the family accepts a value. A site uses it, and not `levelsOf`, to show the values that a family does not support.
- `resolveDimensions(dimensions, dims)` gives the full values of an input. It throws a `RangeError` for an unknown dimension, a bad value or a value that is not supported.

### The rules of `supported`

- `supported` keeps the values of the shared dimension, so a site can show the full axis. It marks the values of one family only.
- The default and each level are supported values. `register` refuses another default or level.
- `resolve`, `generate`, `cellOf` and `rngOf` refuse a value that is not supported. The `RangeError` has the text "not supported by" and the `familyKind` of the family.
- `cells` and `cellCount` refuse a level of `options.levels` that is not supported. `boundaryCells` uses the ends of the supported range.
- The list form fits the `values` of an `enum`. The range form fits `min` and `max` of a numeric dimension, because a list cannot hold the values of a `real`.

### The rules of `invalidates`

- Without `invalidates`, the registry gives the output of the family with no change.
- With a value other than the default, `generate` of the registry removes each field of `invalidates` that the output has.
- Then the output gets the field `invalidated`: the sorted names of the removed fields. The registry then calculates `hash` again with the `hash` function of the family, or `documentHash`.
- An output that has none of the fields does not change. Thus a dimension of many families changes only the outputs with the field.
- The names `hash` and `invalidated` cannot be in `invalidates`, because the registry writes them.
- With `precision`, the registry rounds the value and the default to `precision` decimal places before the compare. A family that rounds its values gets no `invalidated` field for a change that its output does not show.
- For example, with `precision: 3`, a margin of 0.0004 is the default 0. A margin of 0.0006 is 0.001, so it removes `known`.
- `precision` changes only that compare. The cells, the cell keys, `rngOf` and the value that the family gets do not change. Thus no hash changes.
- `register`, `sharedDimension` and `ownerDimension` refuse a `precision` that is not a whole number of 0 or more. They also refuse it on a dimension that is not numeric.

### The rules of `when`

- A missing value, a default that the caller gives and a value of an inactive dimension give the same full values.
- Put a `when` on a dimension only where the generator ignores the dimension. A dimension that each kind reads has no `when`.
- The family gets the default of an inactive dimension.
- `cells` and `cellCount` skip the dead combinations of `when`. `cellOf` does not include an inactive dimension.
- The registry examines a value of an inactive dimension. A bad value causes a `RangeError`, also when the dimension is inactive.
- A dimension with `when` cannot be in `familyBy`. `register` refuses it, because a cell without the dimension has no family key.

## The shared dimension table

`CORPUS_DIMENSIONS` has the shared dimensions. A family takes a dimension with `sharedDimension(name, patch)`, or it declares its own dimension with `ownerDimension(name, spec)`.

- `sharedDimension` refuses a name that is not in the table. With `supported`, `invalidates` or `precision` in the patch, it also refuses a bad dimension.
- `ownerDimension` refuses a name of the table and the reserved name `kind`. It also refuses a bad default, level, `supported`, `invalidates` or `precision`.
- The registry examines the `when` of each dimension, because a `when` needs the earlier dimensions.

| Dimension | Kind | Values or range | Default | Scale | Engines | Meaning |
|---|---|---|---|---|---|---|
| `count` | `int` | 0 to 100000, sweep 1, 10, 100, 1000, 10000 | 100 | `log` | `packing`, `highways`, `joint` | The count of the items (n). |
| `sizes` | `enum` | `identical`, `nearIdentical`, `uniform`, `heavyTail`, `bimodal`, `extremeAspect` | `uniform` | | `packing`, `joint` | The distribution of the sizes of the items. |
| `aspect` | `real` | 0.25 to 4 | 1 | `log` | `packing` | The width over the height of a container with no fixed size. |
| `density` | `real` | 0.05 to 1 | 0.4 | `linear` | `packing` | The area of the items over the area of the frame. |
| `obstacles` | `enum` | `none`, `center`, `scattered`, `wall`, `corridors`, `touching`, `edge` | `none` | | `packing`, `joint` | The layout of the fixed obstacles. |
| `containerSize` | `enum` | `fixed`, `freeHeight`, `freeWidth`, `freeAspect`, `freeArea` | `fixed` | | `packing`, `joint` | The sides of the container that the engine can change. |
| `containerShape` | `enum` | `rect`, `convex`, `polygon`, `circle`, `ellipse`, `holes` | `rect` | | `packing`, `joint` | The kind of the shape of the container. |
| `shape` | `enum` | `rect`, `polygon`, `circle`, `free` | `rect` | | `packing` | The shape kind of each item: a `ShapeKind` of `shapes.ts`. |
| `order` | `enum` | `free`, `soft` | `free` | | `packing` | The reading order of the items. |
| `groups` | `enum` | `none`, `flat`, `nested` | `none` | | `highways`, `joint` | The groups of the items. |
| `edgeDensity` | `enum` | `sparse`, `medium`, `dense` | `medium` | | `highways`, `joint` | The mean count of the edges of each item: 0.5, 1.5 or 4. |
| `edgeShape` | `enum` | `random`, `clustered`, `hubChain`, `hubs`, `longRange`, `tree`, `bundled` | `random` | | `highways`, `joint` | The topology of the edges. |
| `ports` | `enum` | `free`, `sides`, `fixed` | `free` | | `highways`, `joint` | The ports of the edges. |
| `hubBy` | `enum` | `area`, `random`, when `edgeShape` is `hubs` or `tree` | `area` | | `joint` | The order of the hubs. The value `random` adds `.hub-random` to the family of the input. |
| `spacing` | `enum` | `stress`, `gap`, `margin`, `both` | `both` | | `joint` | The split of the route clearance (`docs/JOINT-CORPUS.md`). |
| `margin` | `real` | 0 to 32 | 0 | `linear` | `packing`, `joint` | The margin of each item. |
| `gap` | `real` | 0 to 32 | 0 | `linear` | `packing`, `joint` | The free space between two items. |

The values of `shape` are `SHAPE_KIND_IDS` of `shapes.ts` (`L46`).

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
| `familyBy` | The dimensions of the family key after the kind of the cell. A dimension with `when` is not permitted. The default is no dimension. |
| `hash` | The hash of an output after the registry removes the fields of `invalidates`. The default is `documentHash`. |
| `generate` | The function `generate(seed, dims, context)` that gives the input or the board. |

The rules of the registry:

1. `generate(name, seed, dims, options)` gives `generate` of the family the raw seed. The seed does not go through `fnv1a32` or `stepRandom`.
2. `context.random` is `rng(rngSeed(seed, dims))`. `context.rng` is the factory, and `context.set` is the name of the corpus.
3. `dims` has a value for each dimension of the family. The family puts into its params only the values that it needs. The registry writes no params.
4. The registry gives the output of the family with no change. It calculates no hash. The family chooses its hash function.
   The one exception is a dimension with `invalidates` at a value other than its default. The rules of `invalidates` tell the change.
5. Without a version, `family(name)` gives the first version that the registry got, as `generator(name)` of `packing`.
6. `cells(name, options)` gives the cells of a sweep, and `cellCount(name, options)` counts them with no list. The last dimension changes first.
7. `boundaryCells(name)` gives the defaults and each end of each range. A dimension with `when` gets the first value of its `when` at each end. The other dimensions keep their defaults.
8. `rngOf(name)(seed, dims)` gives the stream of an input. A test of each family pins its first values.
9. `cellOf(name, dims, version)` gives the `kind` `<name>@<version>` of `familyKind`, for example `rect-grid@2`. Thus the cells of two versions do not share a key.
   `generate`, `resolve`, `cellOf` and `rngOf` accept a cell of `cellOf` as `dims`. They ignore a `kind` of the family, and refuse another `kind`.
10. `familyBy()` gives the map form of `FamilyBy` for the cells of `cellOf`, with one entry for each version. `DEFAULT_FAMILY_BY` is `{ "*": [] }`: the key is the kind alone.

The test `families.test.ts` pins the first 8 values of `mulberry32(0)` as whole numbers of 32 bits: 1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985, 2642484575 and 2787370982. The generators of `highways` give the same stream. `highways` adds a test that pins the 8 values.

## The steps and the composed families

A `CorpusStep` changes an input after its base family, with the same seed. `composeFamily(base, steps, options)` gives one family of the base and the steps.

- The dimensions of the composed family are the dimensions of the base, then the dimensions of each step. Two dimensions with the same name cause a `RangeError`.
- The family of the input gets the part of each step after a dot. The id becomes `<set>/<family>/s<seed>`.
- The input gets the hash of `options.hash`. The default is `documentHash`.
- The composed family is `libm-dependent` when the base or a step is `libm-dependent`.
- `EDGES_STEP` is the step `edges` of `edgeStep`. Its family part is `e-<edgeDensity>.<edgeShape>.<groups>.<ports>`. The value `random` of `hubBy` adds `.hub-random`. The step is `libm-dependent`, because the shape `hubs` uses `**`.

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
| `shape` | none: the generators make rectangles only | none | none |
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
| `corpus-v1`, `xcheck-v1` and the portfolio sets | `packing` | The registrations of its 7 generators (`k73`), with `crossEngine`, and `RECT_SCATTERED` of the contract. The knobs `margin`, `gap`, `shape` and a log slider of `count` for its site. |
| The screen sets (74 boards) | `highways` | The registrations of its 6 families. A new name for its fixture dimension `kind`, for example `layout`. Its own `documentHash`, with no number grid. |
| The other sets of fixtures | `highways` | The same registrations, after the screen sets. |
| `joint-v1` and `joint-v2` | `joint` | It uses the registry at this time, through the adapter `packingFamily`. It changes to the families of `packing` after `k73`. |

### The owners of the families today

- `packing` owns `rect-grid` (versions 1 and 2), `gallery`, `dashboard`, `cards`, `word-cloud` and `edge-cases`. The joint package has no copy: `packingFamily` starts the generator of `packing`.
- `rect-scattered` has two copies today: `generators.ts` of `packing` and `bench/screen/generators.ts` of `highways`.
- `layout-contract` has the one shared copy: `RECT_SCATTERED`, with the owner `layout-contract`. Both engines accepted the move. Each engine registers it and removes its own copy.

## The family `rect-scattered`

`RECT_SCATTERED` is version 1 of the generator of `docs/FORMAT.md` of `packing`.

- It has one dimension, `count`, with the default 40. Thus the params of the input are `{ count }`.
- The set is `context.set`. Without it, the set is `xcheck-v1`.
- It uses `stepRandom`. It takes `w` and `h` first, then `n`. Each obstacle then takes `ow`, `oh`, `x` and `y`. Each box then takes `bw` and `bh`.
- Each value is a whole number, so the family is `exact`. It writes its own hash with `documentHash`.
- The joint test `families.test.ts` compares its input with `rectScattered` of `packing` 0.2.17, byte for byte. The test uses 4 counts and 8 seeds, with the default set and with a given set.
- The test of the contract pins the hashes of the seeds 1, 2 and 3: `f5f5c51d1560e41c`, `cfd6ef0ef232aaa3` and `d1638f2406360b2e`.

## The requests to the engines

### The request to `packing`

> L45 is in `layout-contract` (the release after L46). Register your generators on the registry: `createFamilyRegistry` and `CorpusFamily` of `families.ts`.
>
> 1. Export one `CorpusFamily` for each generator: `rect-grid` versions 1 and 2, `gallery`, `dashboard`, `cards`, `word-cloud` and `edge-cases`. Use `sharedDimension` for each shared parameter. Give `order` only to version 2.
> 2. Register `RECT_SCATTERED` of the contract, and remove your copy of `rect-scattered`.
> 3. `generate(seed, dims, context)` starts your generator with `context.set`. Keep `seeding` as the steps `container`, `obstacles` and `boxes` of `stepRandom`. Set `crossEngine` to `libm-dependent` for `rect-grid` (`heavyTail` uses `**`), and `exact` for the other generators.
> 4. Put the knobs of your site into the dimensions: `margin` and `gap` (0 to 32), `shape` (`SHAPE_KIND_IDS`) and `count` (0 to 10000, `log`). A knob at its default adds no field to the input.
> 5. Make the demo of your site get its inputs from `registry.generate`, and its sliders from `levelsOf`, `dimensionAt` and `dimensionUnit`.
> 6. Add a test: each family through the registry gives the hashes of `corpus-v1` and `xcheck-v1` of today. Then tell `layout-stack`. The joint package then removes `packingFamily`.

### The request to `highways`

> L45 is in `layout-contract` (the release after L46). Register your screen families on the registry: `createFamilyRegistry` and `CorpusFamily` of `families.ts`.
>
> 1. Export one `CorpusFamily` for each family of `screen-v1`: `tiny-uniform`, `small-clustered`, `dense-groups`, `hub-chain`, `many-groups` and `packed-grid`.
> 2. A cell keeps `<name>@<version>` of its family in `kind`. Give your fixture dimension another name, for example `layout`.
> 3. Make your `generate` write that dimension into your params as `kind`. Then the hash does not change.
> 4. Use `rngSeed(seed, dims)` for the seed of the stream: `(seed * 2654435761 + dims.nodes) >>> 0` for the 3 fixture families. The other families use the seed. The default `rng` is `mulberry32`, the stream of your `rng`.
> 5. Put no `when` on `locality`, because each fixture kind reads it. A later `hubSkew` gets `when` with `layout` in `hubs`.
> 6. Write into `generator.params` only the dimensions away from their defaults. Use your own `documentHash`: the registry calculates no hash.
> 7. Set `crossEngine` to `libm-dependent` for the kinds that use `Math.log` and `Math.cos`, and `exact` for the other families.
> 8. Register `RECT_SCATTERED` of the contract, and remove your copy of `rect-scattered`.
> 9. Make the examples page of your site get its boards from `registry.generate`. Keep your test of the 74 screen boards and of the manifest hashes `e5fe56d1069d2a18` and `35795acefa7148c3`. Then tell `layout-stack`.
