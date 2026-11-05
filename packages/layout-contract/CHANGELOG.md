# Changelog

## 0.5.4

- PATCH before 1.0.0: a new optional option. `SampleOptions` has the option `fixed`. Without it, a sample gives the same configs as before.
- With `fixed`, each config of a sample has the fixed option at each named stage. A meta option of another stage of the same part goes out of the sample.
- The sample refuses a stage or an option that the space does not have with a `RangeError`. It also refuses a fixed meta option with `meta: "skip"`, and a fixed option that the shape filter removes.
- Two fixed options that a constraint forbids get a `RangeError` that names the broken constraints. `docs/STRATEGY-SPACE.md` tells the rules.
- With `draw: "walk"`, the fixed stages draw first. Thus the other stages draw only from the options that keep the constraints with the fixed options. Without `fixed`, the walk keeps its order.

## 0.5.3

- PATCH before 1.0.0: `checkSpace` accepts a new form that it refused before, and each space that was good stays good with the same configs.
- A meta option can have the rule `{ min: 0, max: 0, ordered: false }`. The option chooses its members from the input, and a config of it has the empty list `members`. A `pool` or a `view` on this form is refused.
- The text of the `members` problem of a bad count changes. It names the new form.

## 0.5.2

- PATCH before 1.0.0: a new optional option. `SampleOptions` has the option `draw`, with the values `reject` and `walk`. The default is `reject`, and it gives the same configs as before.
- With `walk`, a point draws its stages from the largest to the smallest. Each stage draws only from the options that keep the constraints with the stages before it. A member list of a meta option draws its pool with the same draw.
- A sample of `walk` is not uniform over the valid configs. `docs/STRATEGY-SPACE.md` states the difference on `routeSpace` of `highways` 0.15.0.
- The error of a failed `reject` sample names `draw: "walk"`. The start of the text does not change.

## 0.5.1

- PATCH before 1.0.0: new exports, one new measure and one wider check, with no change to a type or to an old measure.
- `CIRCLE_SCATTERED` is the shared family `circle-scattered`: circle items in a fixed rectangle or circle container, which they fill approximately half. Its input takes the exact rules of 0.4.0, because it has only circles and no obstacles.
- `segmentThroughShape` tells if a segment goes through a placed box. A circle box reads its circle, and each other kind reads its bounding box.
- `countLinksThroughShapes` counts the routes that go through a box that is not one of their ends. `ShapeLink` is its route.
- `crossingPoint` gives the point where two segments cross. It gives a point exactly when `segmentsCross` is true.
- `EPS_STEPS` is the count of `EPS` steps in one layout unit.
- `JOINT_MEASURES` has the new diagnostic `joint.route.length`: the mean length of the routes in layout units. No verdict reads it.
- `checkLayoutRecord` accepts `deterministic: null` on a record with `oneRun: true`, because such a pair can have no second run to compare. It still refuses `null` on each other record without `skipped`. The type of the field does not change. A reader with an older contract refuses such a record.

## 0.5.0

- MINOR before 1.0.0: a break. A reader with an older contract refuses a file of the schema `strategy-catalog/2`. `STRATEGY_CATALOG_SCHEMA` has a new value, and the type of `StrategyCatalog.schema` is wider.
- The new schema `strategy-catalog/2` adds an optional list `output` to `CatalogEntry`. Each row has a `property`, a `class` and `evidence`. The new types are `OutputRow`, `OutputEvidence`, `OutputGridClass`, `OutputGridCounts` and `StrategyCatalogSchema`.
- `parseStrategyCatalog` reads the schemas in `STRATEGY_CATALOG_SCHEMAS`. A file of the schema 1 stays valid, and a file of the schema 1 with `output` is refused.
- `writeStrategyCatalog` writes the oldest schema that holds the file. A catalog with no `output` keeps the schema 1 and its bytes.
- `outputGridClass` gives the class of a grid property from its counts, and the parser refuses each other class. One fraction gives `fractional`. With no fraction, fewer than `OUTPUT_CLASS_MIN_INPUTS` (30) inputs give `untested`.

## 0.4.0

- MINOR before 1.0.0: the meaning of two hard counts changes on circles and on shaped containers. So a caller can read a different number for one placement. Each count on rectangles in a rectangle container stays the same.
- `no-overlap`: `countOverlaps` and `packHard` count two circles by the distance of their centers, with the stated tolerance. A pair whose boxes overlap and whose circles do not is no longer a break.
- `in-container`: `countOutside` and `packHard` count a circle in a circle container by distance, also when the size is free.
- The default of `exactContainer` is `true`, as the note of 0.2.x stated for the next breaking version. A box of a shaped container with the size `fixed` must stay inside the shape. With `{ exactContainer: false }`, the old count stays.
- `PACK_HARD_RULES` lists `circle` as exact for these 2 rules, with a stated `limit`. A circle beside another shape kind or an obstacle counts by the bounding box. A circle in a polygon or an ellipse container also counts by the bounding box. These inputs read as `safe`, and `checkShapes` refuses them at its default level. The date of the fix is 2026-11-28 (L107).
- The new field `hardRule` of `LayoutRecord` states the version of these rules. `HARD_RULE_VERSION` is 2. `hardRuleOf` gives 1 for a record without the field, where a count over 0 on a circle proves nothing. The schema stays `layout-record/1`.
- New exports: `shapesOverlap`, the rule for one pair, `circleOverlaps`, `circlesOutside`, `placedCircle`, `PlacedCircle`, `inputShapeLevel`, `ShapeInput`, `ShapeLimit`, `hardRuleOf` and `HARD_RULE_VERSION`.
- These tests compare squared distances, with the tolerance of each rule. They use no exact predicate: a rule with a tolerance does not need the exact sign.

## 0.3.12

- PATCH before 1.0.0: new exports and a new row in the shared dimension table, with no break. No existing input changes.
- The shared dimension `edgeKey` states the key of each edge, in `data.collection`, with the values `none`, `random` and `cluster`. `none` means that the field is absent.
- The function `edgeKeyStep` and the corpus step `EDGE_KEY_STEP` apply this dimension directly after `edgeStep`. The 3 values change only the key, so a comparison reads one factor. `cluster` on the shape `bundled` gives the keys of `edgeStep`.

## 0.3.11

- PATCH before 1.0.0: new optional fields of a record, with no break. The schema stays `layout-record/1`.
- The field `oneRun` of `LayoutRecord` marks a record with one time. A measure of the pair chose 1 timed repeat and no warm-up. A time gate reads this mark, not a list of strategies.
- The field `budgetMs` of `LayoutRecord` tells the wall budget of a pair. The field `msAtLeast` tells the lower limit of a censored time. The field `because` tells the pairs that caused a skip.
- `checkLayoutRecord` examines the types of these fields.

## 0.3.10

- PATCH before 1.0.0: a new optional field, a new optional check option, a new result list and a wider type, with no break. The first engine catalog found these gaps.
- The schema stays `strategy-catalog/1`, because no engine has published a file of that schema at this time.
- The field `needs` of a `strategy` option or item gives the values that a chosen strategy must take, by dimension of `supports`. `catalogChoices` reads it, so a chooser does not offer a strategy that the engine refuses.
- The option `paramRoutes` of `checkCatalog` states how a param of a space reaches an option. A route can name another option, or give the option value of a param value. A route can also state, with a reason, that the place is only in the space.
- The result of `checkCatalog` has the new list `spaceOnly`. A route that matches nothing is a fault, and so is a `spaceOnly` route on a param that is an option.
- `OptionDeclaration` of a plain `string` also takes a `strategy` declaration, so an option that holds a strategy key has no local type.

## 0.3.9

- PATCH before 1.0.0: new exports, with no break.
- The schema `strategy-catalog/1` gives each strategy and each option of an engine as JSON: `STRATEGY_CATALOG_SCHEMA`, `parseStrategyCatalog`, `writeStrategyCatalog`, `checkCatalog`, `catalogDefaults`, `catalogOptions`, `catalogChoices`, `catalogKey`, `decodeOptionValue`, `encodeOptionValue`, `NODE_POSITIONS_DIMENSION`.
- This package holds the option declarations: `OptionSchema`, `AnyOption`, `listOptions`, `optionDefaults`, `checkOptions`, `clampOptions`, `sweepValues`, `sweepOf`, `sweepGrid`, `checkSchema`. New fields: `noDefault`, `when`, `kinds`, `optionsKey`, `inlineOptions`, `optIn`, `of`.

## 0.3.8

- PATCH before 1.0.0: a faster `spaceSize`, with no change of a result.
- The count examines each constraint at the last stage that the constraint names, and it leaves a branch at the first break. Before this change, it examined each constraint on each whole combination.

## 0.3.7

- PATCH before 1.0.0: two new exports, with no break.
- `segmentsCross` tells if two segments cross inside both of them. It has no tolerance, so a touch at an end does not cross. It compares the signs of the turns, so a product does not underflow on a small crossing.
- `pointSegmentDistance` gives the shortest distance from a point to a segment.

## 0.3.6

- PATCH before 1.0.0: new optional options, a new optional result field and new exports, with no break. A caller who does not set `sizing` gets each earlier result.
- `layoutText` has the new options `sizing` (`exact`, `bound-first` or `bound`) and `charset`.
- `createTextCharset(characters, { pairMargin })` gives a declared character set. `DIGITS` and `PRINTABLE_ASCII` are two strings for it.
- With `bound-first`, a label of the set stays on one line with no measure when its bound fits. Other labels get a measure.
- With `bound`, a label of the set gets no measure, and its box has the size of the bound. A layout from the bound has `bounded: true`.
- The key of `createTextLayoutCache` holds `sizing` and the character set.
- `docs/TEXT.md` gives the rules, the hard cases and the numbers of one rough bench run.

## 0.3.5

- PATCH before 1.0.0: new exports and an optional method, with no break. `layoutText` does not change.
- `createTextLayoutCache({ maxEntries })` in `./text` gives a bounded cache of `layoutText` results. The key holds the text, the options and the measurer.
- A cached result is frozen, and callers share it. Use `structuredClone` for a copy that you can change.
- `TextMeasurer` gets an optional `generation()`. The measurer of `createMeasurer` gives it, so a `reset` of the measurer does not give old widths. A different measurer calls `reset` of the cache after a change of its advances.
- The gain is large on repeated labels with one set of options. It is small when the options change on each call.

## 0.3.4

- PATCH before 1.0.0: a new type and two new functions, with no break.
- `SizedRect` is a rectangle with `width` and `height` in place of `w` and `h`. Some layout engines use this shape.
- `toRect(rect)` and `toSizedRect(rect)` convert between `SizedRect` and `Rect`. They copy each number and do not round.
- A seeded property test shows the round trip in the two directions, also for negative, fractional, zero and extreme values.

## 0.3.3

- PATCH before 1.0.0: no change of the API or of a value. A bundler removes the constants that a consumer does not import.
- Each top-level call of the package has the mark `/* @__PURE__ */`, and `CORPUS_DIMENSIONS.hubBy` has no spread in its literal.
- Each subpath bundle of packing gets 6.76 to 6.92 kB gzip less (esbuild minified, gzip level 9). `maxrects` goes from 18226 to 11396 bytes.
- A test bundles an import of one constant and fails when a top-level call has no mark.

## 0.3.2

- PATCH before 1.0.0: a new optional option, with no break. The breakers of `/text` come from `@mark1russell7/typeset` 0.1.0 (T3 phase B).
- `layoutText` has the new option `breaker`: `greedy` (the default), `total-fit` or `balanced`. An unknown name gives a `RangeError`.
- With the default, each result is the result of 0.2.21. A test compares 1859 cases with the npm build of 0.2.21, with all fields and the measurer counts.
- On 480 corpus cases, `balanced` keeps the greedy line count on each case. The raggedness of `total-fit` is not more than greedy on 479 cases.
- A forced break ends each line of a word that `wordBreak: "anywhere"` breaks, so each breaker keeps these lines.

## 0.3.1

- PATCH before 1.0.0: a new optional field and a new function, with no break. A pack output without `links` does not change.
- `PackInput.links` gives the links between the items, for the graph orders of a packer (L47). `a` and `b` are indexes into `items`, and the weight is 1 when it has no value.
- `packLinks(input)` gives the links of the edges of a file. The edges of one pair make one link, with the count of the edges as its weight.
- `toPackInput(input, { links: true })` puts these links in the packer input. Without the option, the packer input has no `links`, as before.

## 0.3.0

- MINOR before 1.0.0, a break: `LayoutRecord.deterministic` widens to `boolean | null`. A reader that expects a boolean breaks.
- A skipped record has `deterministic: null`, because no run made a claim. A record without `skipped` keeps a boolean.
- `RunEnv` has two new optional fields: `mode` and `context`. Each timing record names its mode, as the isolation rule of the fleet strategy asks.
- `checkLayoutRecord(value)` gives the problems of one record. `parseLayoutRecord(value)` reads one record, or throws a `TypeError` with the problems.
- An old skipped record with `deterministic: true` is still correct. `parseLayoutRecord` gives `null` in its place.

## 0.2.21

- PATCH: a fix of the speed of `/text`, with no change of the API. In 0.2.20, each call of `layoutText` made a new `Intl.Segmenter`. A consumer port saw its first load take 2 to 3 times longer.
- The module makes only one `Intl.Segmenter` for each granularity.
- A bounded memo keeps the words of the last 4096 texts. A page often asks for the same labels many times.
- A test counts the segmenters of 500 layouts. The count is 2 or fewer.

## 0.2.20

- PATCH: a new subpath export, with no break. In a consumer profile, the text measures and the line breaks take approximately 3.1 s of a first load. Thus text layout is a layout step of the contract.
- The subpath `@mark1russell7/layout-contract/text` has `createMeasurer`, `canvasAdvance`, `fontKey`, `graphemesOf`, `layoutText`, `textMeasures` and `TEXT_MEASURES`.
- The measurer caches the advance of each font and word segment, in whole units of 1/64 pixel. Thus each port gets the same lines.
- `layoutText` has a character clamp, a padding, a min and max width of one line and a wrap width. It also has a max line count with an ellipsis, a line height and a word break option.
- `docs/TEXT.md` gives the rules, the units, the error and the measures.

## 0.2.19

- PATCH: new exports, with no break. The packing engine and the joint bench use the same balance and stability measures, so the contract computes them.
- `balanceOf(boxes, container)` gives the balance of a layout: `gapCv`, `centroidOffset`, the empty share of each side and `sideRange`.
- `procrustesOf(base, next, { unit, rotate })` gives the move of the box centers after the best move and rotation, in units of `W`. `perChange` divides it by the change share.
- `balanceMeasureSpecs(stage)` gives the specs of the 9 measures with the prefix of a stage, for example `pack.balance.sideRange`. `balanceMeasures` gives the values with the same ids.
- `docs/BALANCE.md` gives the definitions and the reasons.

## 0.2.18

- PATCH: docs only, with no change to the API. The packing engine found that the npm package has no `docs/` folder, but the comments name its files.
- The TSDoc of `ShapeBound` has the table of what a bound value proves, so a consumer reads it in the package.
- The package README has a table of each doc that the comments name, with its link in the repository.

## 0.2.17

- PATCH: a new optional field, new exports and a fix, with no break. The packing engine found the 2 gaps when it moved to 0.2.16.
- The new exports are `shapeLevel`, `ShapeLevel` and `ShapeBound`. `MeasureSpec` and `ShapeSupport` have the new optional field `bound`.
- `bound` lists the kinds where the value of a measure is a bound of the true value, and its side `upper` or `lower`. An example is a fill that reads `w * h` of a `free` box.
- `shapeLevel(use, kind)` gives `exact`, `safe`, `bound` or `none`. `ruleLevel` does not read `bound`, and its result stays the same.
- By default, `checkShapes` refuses a bound kind. Its break tells the side, for example "The value of pack.shapeFill is only an upper bound for free".
- `ShapeCheck.level` has the new value `bound`. It accepts the exact, safe and bound kinds. The level `safe` accepts the exact and safe kinds only, as in 0.2.16.
- `shapeSupportProblems` refuses a kind in two of the lists `shapes`, `safe` and `bound.shapes`. It also refuses an unknown kind, a repeated kind and a bad `side`.
- `docs/SHAPES.md` tells what a bound value proves for each `direction` of a measure, and why the level is `bound` and not `safe`.
- Fix: with `meta: "sample"` and `shapes`, a sample does not throw for a meta option without a member list. It draws again, as `spaceSize` gives that option 0.
- A sample throws a `RangeError` only when the space has no config for the kinds. The error names the kinds, the stages without an option and the meta options without members. For such a meta option, it tells to set `members.view` to `"bounds"`.
- Each sample that 0.2.16 gave stays the same, byte for byte. A test pins the samples of 0.2.16 for 8 spaces.
- Each input, manifest, record, hash and `configId` of 0.2.16 stays the same. `JOINT_MEASURES` has no `bound`.

## 0.2.16

- PATCH: new optional exports and fields, with no break (L57). The packing engine found the 3 shape gaps when it packed shapes by their bounding boxes.
- The new exports are `regionArea`, `boxArea`, `ruleLevel`, `RuleLevel`, `shapeSupportProblems` and `ShapeCheck`.
- The new optional fields are `ShapeSupport.safe`, `MemberRule.view` and `CorpusDimension.precision`. `checkShapes` has a new optional third parameter `options`.
- `regionArea` gives the exact area of a region. A polygon uses the shoelace formula, less its holes. `SHAPE_KINDS` gives `geometry.area` to `polygon` and `circle`.
- `boxArea` gives the area of a box, or `undefined` for a `free` box. A box with an ellipse shape is `free`, so it gives `undefined`.
- `safe` lists the kinds with a safe count. `no-overlap` and `in-container` of `PACK_HARD_RULES` are safe on `polygon`, `circle` and `free`.
- `checkShapes` refuses a safe kind by default, as before. Its break also tells that the count is only safe. With `{ level: "safe" }`, it accepts the kind.
- `shapeSupportProblems` refuses a kind in `shapes` and in `safe`, an unknown kind and a repeated kind.
- With `view: "bounds"`, a meta option gives its members the bounding box of each item. A shape filter then checks the members with `rect`.
- With `view: "bounds"`, `checkConfig`, `spaceSize`, `enumerateSpace` and the pool entries use `rect` for the members. `checkSpace` refuses another `view`.
- `precision` rounds a numeric value and its default before the `invalidates` compare. A margin of 0.0004 with `precision: 3` keeps `known`.
- `precision` changes only that compare. The registry, `sharedDimension` and `ownerDimension` refuse a bad `precision`, and `precision` on a dimension that is not numeric.
- Each input, manifest, record, hash and `configId` of 0.2.15 stays the same.

## 0.2.15

- PATCH: new optional exports and fields, with no break. A family, a dimension or an input without them does not change.
- The new exports are `ownerDimension`, `OwnerDimensionSpec`, `dimensionSupports`, `SupportedValues`, `SupportedRange`, `INVALIDATED_FIELD` and `portPoint`.
- The new optional fields are `CorpusDimension.supported`, `CorpusDimension.invalidates`, `CorpusFamily.hash`, `LayoutInput.invalidated` and `Port.along`. `resolveDimensions` has a new optional fourth parameter `by`.
- `supported` marks the values that one family accepts (L51). A list is for an `enum` or a `bool`, and a range `{ min?, max? }` is for a numeric dimension.
- `resolve` and `generate` of a registry refuse another value with a `RangeError` that has the text "not supported by". `levelsOf` and `boundaryCells` keep to the supported values.
- `dimensionSupports(dim, value)` tells a site if a family accepts a value.
- `ownerDimension(name, spec)` gives a dimension of one owner. It refuses a name of `CORPUS_DIMENSIONS`, the name `kind` and a bad default, level, `supported` or `invalidates`.
- `invalidates` lists the output fields that a value other than the default makes wrong. `generate` of a registry removes them, lists them in `invalidated` and calculates the `hash` again.
- `Port.along` fixes a port at a fraction of its side (L56). The start of `left` and `right` is the top end, and the start of `top` and `bottom` is the left end.
- `checkInput` refuses `along` without a side, outside [0, 1] or with `x` or `y`. `turnPort` changes `along` of `left` and `right` to `1 - along`.
- Each input, manifest, record and hash of 0.2.14 stays the same. The tests pin the `joint-v1` and `joint-v2` manifests, `RECT_SCATTERED_HASHES` and an input with ports.

## 0.2.14

- PATCH: new optional exports and fields, with no break: `MemberRule.pool`, `PairGap`, `LayoutInput.pairGaps` and `canonicalInput`. It also has a fix of `generate`.
- `MemberRule.pool` is a fixed list of member lists (L39). Each entry is a list of whole configs of the space of the members.
- With a `pool`, `spaceSize` counts each entry one time. `enumerateSpace` gives only entries of the pool, and `checkConfig` refuses another member list with the claim `pool`.
- `checkSpace` checks each entry of a pool. The shape filter of 0.2.13 also applies to the members of each entry. A rule without `pool` does not change.
- With a pool of 1 list on `cell-portfolio`, the meta count of `packing` at 3 levels goes from approximately 1.49e25 to approximately 1.72e15.
- `LayoutInput.pairGaps` gives a minimum distance to a pair of boxes (L49). For its pair, it replaces the two margins and the `gap`. `PackInput` and `toPackInput` carry it.
- `checkInput` refuses an unknown box, a pair of one box, a repeated pair in either order, a bad `gap` and bad `lanes`.
- The hard rule `no-overlap` reads `pairGaps`. For a pair of the list, in either order, the `gap` replaces the two margins. `countOverlaps` has a new optional third parameter `pairGaps`.
- A pair of the list breaks `no-overlap` only when the boxes are nearer than the gap on each axis. The other pairs keep their margins.
- `canonicalInput` sorts the pairs. `documentHash` uses it for each `layout-input/1` document, so the order of the pairs does not change the hash.
- The fix: `generate`, `resolve`, `cellOf` and `rngOf` of a registry accept a cell of `cellOf`. They ignore a `kind` that is the `familyKind` of the family, and refuse another `kind`.
- Each input, verdict, record, hash and `configId` of 0.2.13 stays the same.

## 0.2.13

- The shape kind of an item is a dimension of the contract (L46). `docs/SHAPES.md` tells the rules.
- `SHAPE_KINDS` declares 4 kinds: `rect`, `polygon`, `circle` and `free`. Only `rect` has all of its geometry. The other kinds have their bounding box.
- `LayoutBox.shapeKind`, the cell dimension `itemShape` and the record field `shapes` are new and optional. A box without them is a `rect`.
- `MeasureSpec.shapes` and `PACK_HARD_RULES` give the kinds of each measure and rule. `checkShapes` refuses a run on a kind that a measure does not support.
- `StageOption.supports.shape` gives the kinds of an option. `checkConfig`, `spaceSize` and `enumerateSpace` take `shapes`. `spaceShapeKinds` gives the kinds of a space.
- Each input, record, hash and `configId` of 0.2.12 stays the same.

## 0.2.12

- The result of `verdict` has 3 new fields: `scope`, `breadth` and `summary`. The label and the rule do not change.
- `scope` is `"these families"`. The test keeps the families as fixed, so the claim is about these families only.
- `breadth` is `{ against, of, ties }`: the count of the families against the side of the verdict, of all the families and of the ties.
- `summary` gives the label, the scope and the breadth in one line, for example `better on these families, worse on 2 of 6 (1 tie)`.

## 0.2.11

- The claim `claims.declared` can have `familyBy`: the key of the family of each input. `familyOf(cell, familyBy)` gives the key of one cell.
- The flat form of `familyBy` is a list of dimensions. The map form chooses a list by the `kind` of the cell, or by the entry `"*"`.
- `checkDeclared` checks the keys: a missing dimension, a missing kind, a kind without an entry and two cells with the same key. `familyMin` sets the minimum count of each family.
- `verdict(records, options)` compares two strategies on one measure, with the family as the unit. `docs/VERDICT.md` tells the rule.
- The verdict gives the mean of the family means and the mean of the inputs, each with a seeded bootstrap interval. It also gives a stratified paired permutation test.
- A verdict counts only when it holds under both weightings. Opposite signs give `depends on the mix`. `tie` and `level` have no default.
- `docs/PROMOTION.md` has the new shared block `verdict-family`.

## 0.2.10

- The contract has the strategy space `strategy-space/1`: the stages of an engine, their options and the ranges of their params, as data. `docs/STRATEGY-SPACE.md` tells the rules.
- A param can have a `when`. Then it is active only when an earlier param has one of the given values.
- A meta option has `members`: whole configs of the same space, with a depth of 1. Portfolios and selectors use it.
- `checkSpace` and `checkConfig` give a `ClaimBreak` for each problem. `canonicalConfig` gives the canonical form, and `configId` gives its hash.
- `spaceSize` counts the grid points, with the meta configs apart. `paramLevels` gives the grid values of one param.
- `enumerateSpace` gives the grid, or a seeded Latin hypercube sample. `productSpace`, `joinConfigs` and `splitConfig` join a packer and a router.

## 0.2.9

- The contract has the corpus checks of `packing`, `highways` and the joint corpus. `docs/CORPUS-CHECKS.md` tells the rules.
- `ClaimBreak` is one broken claim of a corpus. It has the name of the claim, a text and the ids of the inputs.
- `checkDeclared(inputs, declares, claim, ids)` checks the claim `claims.declared`. The hook `declares` gives the properties of one input.
- `declaredCounts` counts the inputs of each property. `declaredClaimOf` reads `claims.declared` of a manifest. `DeclaredClaim` and `Declares` are their types.
- `corpusHashOf(corpus, inputs)` gives the hash of a corpus. The value is equal to the corpus hash of `packing`.
- `checkSplit(split, corpus, name)` checks a split file `corpus-split/1`. `splitFolds` gives the folds of one split, and throws for a problem.
- `leaveOneSeedOut(seeds)` gives one fold for each seed. `splitFileName`, `SPLIT_SCHEMA`, `CorpusSplit`, `SplitFold`, `SplitCorpus` and `CorpusEntry` are the other parts.

## 0.2.8

- `portfolio` has the option `hashes`. The default `all` keeps the behavior of 0.2.7.
- With `hashes: "pick"`, the members get no output hash before the pick. Only member 0 and the winner get a hash, when the winner is not member 0.
- The output hash is most of the key cost of a member. `selectBest` does not use it, so the winner and `picked` do not change.
- Under `pick`, a hash that throws makes `pick` throw a `RangeError`. Only the hashed traces have an `outputHash`.
- A value of `hashes` that is not `all` or `pick` causes a `RangeError`. `docs/PORTFOLIO.md` tells the rules.

## 0.2.7

- `compareMeasure` compares whole grid steps of `RECORD_EPS`. Before, a change of exactly `minEffect` on 3-decimal records was sometimes not a tie, because of float noise. An example is 0.723 against 0.718 with a `minEffect` of 0.005.
- A live value and its rounded record give the same verdict. A test checks this on random values.
- A change below one grid step is a tie. Infinite values and values outside the safe grid keep the old compare.
- `RECORD_SCALE` (1000) is the count of grid steps in one unit, and `RECORD_EPS` is `1 / RECORD_SCALE`. The value of `RECORD_EPS` does not change.
- Round with `Math.round(v * RECORD_SCALE)`, as the records do. A division by `RECORD_EPS` rounds some half steps to the other side.

## 0.2.6

- `portfolio(id, members, key, options)` starts a list of members on an input and gives the output of the best member. The result is also a member.
- `selectBest(candidates, levels)` is the pick rule. It keeps each candidate that is not worse than the best value of a level, so the minEffect ties do not drift.
- The level 0 of a portfolio is the count of hard breaks. A member that throws, or gives a value that is not finite, gets the status `error`.
- The options `maxMembers` and `budgetMs` cut the members. A cut by the time limit makes the trace not deterministic.
- `pickMoves(trace)` gives the move `pick` (the trace measure `move.pick` of a record), so `exercised` reads the effect of a pick. `docs/PORTFOLIO.md` tells the rules.

## 0.2.5

- `outputHash(value, options)` gives the first 16 hex characters of the SHA-256 of the canonical JSON of an output. Each number goes to the grid of `RECORD_EPS` first.
- The option `grid` (`HashOptions`) sets the step of the grid. The value `0` keeps the exact numbers. A number that is not finite causes a `RangeError`.
- `documentHash` gives the input hash of `docs/FORMAT.md` of `packing`. `sha256Hex` and `canonicalJson` are its parts, with no runtime dependencies.
- `outputGroups` puts the candidates with equal output hashes on each decision input in one `OutputGroup`. `exercised` tells if a candidate has an effect.
- `docs/PROMOTION.md` tells the two promotion guards. They are the same in `packing` and `highways`.

## 0.2.4

- `rectInRegion(region, rect)` tells if all of a rectangle is inside a region and not over a hole. A polygon can be concave.
- `countOutside` and `packHard` have the optional last parameter `options` (`ContainerTest`). With `{ exactContainer: true }`, `in-container` tests the shape of the container, not only its bounding box.
- The exact test applies only to a shaped container with the size `fixed`. The default is `false`, so the counts do not change. The default changes to `true` at the next breaking version.

## 0.2.3

- `edgeStep(input, params, seed)` adds edges, groups and ports to an input without positions, from its topology alone. `docs/JOINT-CORPUS.md` tells the rules and the pinned hashes.
- `EdgeShape`, `EdgeStepParams`, `EDGE_DENSITY` and `EDGE_STEP_VERSION` describe the step.
- `LayoutInput` has the optional field `steps`: the stamps of the steps after the generator.
- `mulberry32`, `fnv1a32`, `stepRandom` and `randomInt` give the seeded random numbers of the generators.

## 0.2.2

- `compareMeasure(candidate, baseline, spec)` gives `better`, `worse` or `tie` for one measure on one input. A change of at most `max(RECORD_EPS, minEffect)` is a tie. The test is symmetric, and a tie is not better.
- `MeasureSpec` has the field `minEffect`: an absolute change, or `{ rel }`, a share of the larger of the two values. Each joint guard in `JOINT_MEASURES` has a value. `minEffectOf` gives the threshold.

## 0.2.1

The first version on npm. The versions 0.2.0 and 0.1.0 are only in git. npm does not have them.

- A record can have `outputHash`, the hash of the output of the stage. A reader compares two runs with one field.
- A record can have `msRuns`, the time of each timed repeat. `ms` is their median.
- A record can have `env` (`RunEnv`), the facts of the computer of the run.

## 0.2.0

This version is only in git, at commit `710ec51`. npm does not have it. The version 0.1.0 is only in git, at commit `52fefbb`.

- The type-fit tests of `highways` (highways#82) and `packing` (packing#21) found gaps. This version closes the gaps of the contract.
- `Port.side` and `LayoutInput.container` are optional. A record must have `LayoutRecord.ms`.
- The input has the fields `generator`, `cell` and `step`, and `change` has the value `packed`. A box has the field `data`. A record has the field `skipped`.
- `turnPort` turns a port with only `x` or only `y`.
- `packHard(input, output, tolerance)` applies the output itself. `no-overlap` counts a box over an obstacle (`countObstacleHits`, `regionHitsRect`).
- A locked box breaks `locked-kept` only for a move of more than `RECORD_EPS`, or without a placement. That is one break, not one for `complete` too.
- `checkInput` gives the problems of an input file, for example a locked box without a position.
- New: `toLayoutRecord`, `StrategyInfo`, `MeasureSpec` and the specs of the joint measures (`JOINT_MEASURES`, `JOINT_MOVED_MIN`).

## 0.1.0

The first version of the contract, in git only. The types of `layout-input/1` and `layout-record/1`, the turn, the tolerances and the hard rules of a pack.
