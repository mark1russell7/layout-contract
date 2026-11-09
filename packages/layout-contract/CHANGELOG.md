# Changelog

## 0.10.0

- MINOR before 1.0.0: a break. The unit text of the measure specs changes for its readers, and `HARD_RULE_VERSION` is 3. The other entries add exports or options.
- New module `curves`: the Hilbert, Moore and Morton (Z order) curves on a grid. The side of the grid is a power of 2. `docs/CURVES.md` gives the rules.
- `CurveSpec` holds a curve as data: the order of its four parts and the symmetry of each part. `HILBERT_CURVE`, `MOORE_CURVE` and `MORTON_CURVE` are the three curves, and `HILBERT_PATTERN` and `MOORE_PATTERN` are their patterns.
- `curveCell` and `curveIndex` give the cell at a place and the place of a cell. `curveCells` gives each cell in the order of the curve.
- `hilbertCell`, `hilbertIndex`, `mooreCell`, `mooreIndex`, `mortonCell` and `mortonIndex` give the same values for one curve.
- `CurveSymmetry`, `CURVE_SYMMETRIES`, `applySymmetry` and `inverseSymmetry` give the 8 symmetries of a square. `CURVE_MAX_SIDE` is the largest side.
- New exports: the measure registry (L65). `MeasureEntry` adds the source package, the noise, the normalization and the cost to `MeasureSpec`. `MEASURE_REGISTRY` holds the entries of the joint measures.
- `measureEntry` makes an entry from a spec. `normalizeMeasure` gives a loss from 0 to 1 by the rule `range` or `scale`. `checkRegistry` gives the faults of a list of entries.
- `MeasureSurvey`, `checkSurvey` and `surveyFindings` read the survey of the measures of each package. `docs/MEASURE-REGISTRY.md` tells the rules and the findings of the survey of 2026-11-09.
- Unit rules (L65 part 2): `unitFault` gives the fault of a unit. A value from 0 to 1 has the unit `share` (`SHARE_UNIT`), and a unit text that names a range is a fault. `NO_UNIT` is the unit of a range with no other unit.
- Breaking for a reader of the unit text: the specs use the new words. `joint.fill`, `joint.spill`, `joint.stability.moved`, the three balance measures and `text.raggedness` and `text.cacheHit` change from `0 to 1` to `share`. `joint.proxy.rank` changes from `-1 to 1` to `no unit`, and `text.overflow` changes to `wrap widths`. The values do not change.
- `MeasureEntry.planned` holds the reason that no code computes a measure. `joint.stability.mean` and `joint.stability.moved` are planned, and `normalizeMeasure` gives an `Error` for a planned measure.
- The rule `none` has a reason. A spec can have the `min` `-Infinity`. The rule `range` needs a finite `min` and `max`, and the rule `scale` needs a finite `min`.
- New measure `balance.gapMean`: the mean of the nearest-neighbour gaps, in layout units. `Balance.gapMean`, `BALANCE_MEASURE_SUFFIXES`, `balanceMeasures` and `balanceMeasureSpecs` give it. Its role is `diagnostic`, because an objective gives it a target.
- `Resize.reshape` lets a packer give a `rect` box a shape, for example the polygon cell of a Voronoi treemap (L161).
- `Placement.shape` gives the shape of the placed box, relative to its origin, as `LayoutBox.shape`. `applyPack` gives the box that shape and removes its `shapeKind`.
- `size-kept` also counts a placement with a shape on a box without `reshape`, or with a shape outside its size (`shapeFits`). A placement counts one time.
- `packOutputForm` has the shape of a placement only when it is set. Thus the fingerprint of an output without a shape does not change.
- `checkInput` gives a problem for a `reshape` value that is not `true` or `false`.
- New cell measures (L161 part 2): `cell.areaError` (share, lower) and `cell.compactness` (ratio from 1, lower) of the cells of a Voronoi treemap.
  `cellsOf`, `cellMeasures`, `cellMeasureSpecs` and `cellMeasureEntries` give the values, the specs and the registry entries. `docs/CELLS.md` gives the definitions.
- `regionPerimeter` gives the perimeter of a region. An ellipse uses the second formula of Ramanujan.
- `HARD_RULE_VERSION` is 3. The counts of `no-overlap` and `in-container` on a convex polygon are exact (L161). The counts of each other input do not change.
- `no-overlap`: a pair with a convex polygon and no margin, beside a rectangle or another convex polygon, counts by the separating axis theorem. Thus two cells of a Voronoi treemap with a common side do not count.
- `in-container`: a convex polygon without a margin in a convex container with the size `fixed` counts by its corners.
- A margin, a concave polygon, a hole, a circle, an obstacle and a pair of `pairGaps` keep the bounding box. The kind `polygon` stays `safe` in `PACK_HARD_RULES`, because a concave polygon is not exact.
- New exports: `convexCorners`, `convexOverlap`, `cornersInConvex` and `placedConvex`.

## 0.9.9

- PATCH before 1.0.0: new optional options and a new type. Without the new options, each layout stays the same.
- `layoutText` gets `justify: { stretch, shrink }` (the type `TextJustify`). With it, `TextLayout.ratios` gives the adjustment ratio of each line, and `total-fit` chooses the lines by these ratios.
- `layoutText` gets `hyphenate`, a hook that gives the hyphen places of a word. A break there costs 50, and the line ends with "-". `docs/TEXT.md` tells the rules.
- `createTextLayoutCache` keys the values of `justify` and the identity of `hyphenate`.
- Runtime dependency: the range of `@mark1russell7/typeset` goes from `^0.2.0` to `^0.5.1`. The package imports no hyphen pattern set.

## 0.9.8

- PATCH before 1.0.0: a fix and 4 new exports. `dimensionAt` and `dimensionUnit` use `paramAt` and `paramUnit` of `@mark1russell7/strategy-space`, so the scale of a range has one home.
- The values of an `int` or a `real` dimension do not change. A dimension that is not numeric gives a `RangeError`. Before this change it gave a value that is not a number.
- The package re-exports `paramAt` and `paramUnit`.
- The range of `@mark1russell7/strategy-space` is `^0.0.5`. A caret range on `0.0.x` holds one patch only, so `^0.0.2` does not get 0.0.5. Version 0.0.5 adds `omitUnused`, and a space without it keeps each config id.
- The geometry gets `ringCentroid(ring)` and `clipRing(ring, a, b, c)` for the cells of a power diagram (#311). `ringCentroid` gives the centroid of the area of a ring. `clipRing` gives the part of a ring in the half-plane `a * x + b * y <= c`.

## 0.9.7

- PATCH before 1.0.0: a new form of `ParamRoute`. `{ strategy, fixed }` tells that a stage option of a space is one value of another strategy (`docs/STRATEGY-CATALOG.md`).
- `checkCatalog` examines the params of such a stage option against the declarations of that strategy, and each value of `fixed` against its declaration.
- A route with an absent strategy, an absent or bad fixed option, or a param with the name of a fixed option is a fault. A `strategy` route on a param is also a fault.

## 0.9.6

- PATCH before 1.0.0: new optional fields and new exports. A packer can give a box another size.
- `LayoutBox.resize` (`Resize`) gives the bounds of the size: `minW`, `maxW`, `minH`, `maxH` and `aspect` (`keep` or `free`). A bound that it does not set is the size of the box.
- `Placement.w` and `Placement.h` give the size of the placed box after the turn. `applyPack` gives the box that size with `resizeBox`. A port with `x` or `y` moves with the scale, and a port with `along` stays. The margin stays.
- `turnBox` turns the bounds of a resize with `turnResize`.
- The hard rule `size-kept` (`countResizeBreaks`, `sizeFits`) counts each placement with a size outside the bounds of its box, in the tolerance `RECORD_EPS`. A placement with a size on a box without a resize breaks it.
- `PackHard` has `size-kept` as an optional key. `packHard` gives it only when a box has `resize` or a placement has `w` or `h`. Thus the counts and the records of each other input do not change, and `HARD_RULE_VERSION` stays 2.
- `checkInput` gives these problems of a resize (`resizeProblems`):
  - a resize on a box with a shape, or with a kind other than `rect`
  - a bound that is not positive and finite
  - an `aspect` other than `keep` and `free`
  - a size of the box outside its bounds.
- `packOutputForm` has `w` and `h` of a placement only when they are set. Thus the fingerprint of an output without a size does not change.
- `size-kept` is not in `PACK_HARD_RULES`. A rule of that list limits the shape kinds of each input, and `checkInput` already refuses a resize on a shape.
- The new optional field `carried.code` (`CarriedCode`) holds the facts of a carry over a change of the measure code (L147 rule B).
  These facts are the two commits, the size of the code audit and the 95 % upper bound of the rate of a difference.
- With `carried.code`, `checkLayoutRecord` accepts the same engine versions in `carried.from` and `carried.to`. A record without `carried.code` keeps the old rule.
- `carryRecord` takes the option `code`. A record that a run carried before keeps its `carried.code.from`.

## 0.9.5

- PATCH before 1.0.0: new exports and a fix. `pointInRing` and `pointInRings` tell if a point is inside a ring, or a ring with holes, by the even-odd rule. `Ring` is the type of a ring.
- `boxCenterDistance` gives the distance between the centers of two rectangles. `frameMove` uses it, and its values do not change.
- The rules of the containers use `pointInRings`. Before this change, they had a private copy of it.
- Fix: `segmentsCross` uses the exact signs of `orient2dSign` of `@mark1russell7/predicates`, in place of a float cross product. An input that is almost collinear gets the correct answer. A coordinate that is not finite gives `false`.
- `crossingPoint` keeps its point on the segment `ab` when the float cross products and the exact signs do not agree.

## 0.9.4

- PATCH before 1.0.0: a new export only. `scaleRect(rect, factor)` gives a rectangle with each coordinate and each size times the factor. It changes the unit of a rectangle, for example from CSS pixels to the pixels of a window.

## 0.9.3

- PATCH before 1.0.0: a new export only. `snapRect(rect)` gives a rectangle on whole pixels. It rounds each edge, not the size, so two rectangles that touch still touch.
- `snapRect` gives 0, not -0. A property test with `fast-check` examines 2000 pairs of rectangles that touch.

## 0.9.2

- PATCH before 1.0.0: new exports only. `CorpusManifest<Spec, Claims, Input>` is the type of a corpus manifest `layout-corpus/1`, with `HeldOut` and `ManifestClaims` (`docs/CORPUS.md`).
- `corpusManifestText` writes a manifest in one field order, with one line for each spec and each input. The style `spaced` is the form of the bench of `packing`, and the style `compact` is the form of the joint bench.
- `manifestText` writes a manifest with other fields, and `lineJson` gives a value on one line.
- The joint bench writes its manifest with `corpusManifestText`. Tests pin the writer to the bytes of 5 corpus files of `packing` and of the 3 joint corpus files.

## 0.9.1

- PATCH before 1.0.0: new exports only. The record `layout-frame/1` is one frame of a layout change (`docs/FRAMES.md`).
- `frameOf` makes a frame of a layout, and `outputOf` gives the placements of a frame, so an engine can start a layout from it.
- `frameAt` gives the frame at a time between two layouts, with boxes that stay, enter and leave. The options `enter` and `leave` take `fade` or `cut`.
- `frameMove` gives the move between two frames, and `fixedPointMove` gives the move of an engine from a start frame.
- Property tests with `fast-check` examine the laws of `docs/FRAMES.md` over generated pairs of layouts. An example is the composition of two changes.
- Each package with Vitest has `@vitest/coverage-v8` 5.0.5 as a dev dependency, at the version of its Vitest. The root has `@mark1russell7/conventions` ^0.38.4.

## 0.9.0

- MINOR before 1.0.0: the format of a strategy space has its home in `@mark1russell7/strategy-space` 0.0.2. `layout-contract` re-exports its types and functions, with the same names. The types have the operator fields `identity` of a stage option and `chooses` of a member rule.
- The change that can break a caller: a shape kind is a tag. The field `shape` of `OptionSupports` and the field `shapes` of `ShapeFilter` take a `string`, not a `ShapeKind`. `spaceShapeKinds` gives `string[]`.
- `checkSpace`, `spaceSize`, `enumerateSpace` and `spaceShapeKinds` take the new option `kinds`, with the new type `KindOptions`. Without it, they use `SHAPE_KIND_IDS`, so their results do not change.
- The id of a config does not change. A test compares `configId` with the SHA-256 of the canonical JSON of the hashes of this package.
- The modules `strategy-options.ts` and `space-walk.ts` and their tests move whole to the home. The earlier test of `strategy-space.ts` passes on the re-export (192 tests with the catalog and the families), and it stays in the home.
- `docs/STRATEGY-SPACE.md` keeps the named strategies and the results of L34. The rules of the format are in the home.

## 0.8.0

- MINOR before 1.0.0: `sha256Hex`, `canonicalJson` and `fnv1a32` use their home, `@mark1russell7/rigor-generators` 0.1.8. The local SHA-256, the local canonical form and the local UTF-8 encoder are gone.
- `sha256Hex` and `fnv1a32` use the option `input: "wtf8"`, so a lone surrogate gives the 3 bytes of its code, as before. Each digest and each hash of a record stays the same.
- `canonicalJson` uses the option `form: "json"`. A JSON value gets the same text as before.
- The change that can break a caller: a value with a method `toJSON` gives the form of the result of that method. An example is a `Date`. Before, it gave the form of its own keys.
- A function, a symbol and a cycle cause a `TypeError`. Before, a function and a symbol gave `null`, and a cycle caused a `RangeError` of the stack.
- `verdict` uses `bootstrapStrata`, `bootstrap`, `signFlipTest` and `signTest` of `@mark1russell7/rigor-statistics` 0.1.23, a new runtime dependency (L149). Its local loops are gone.
- The seed of each step is `deriveSeed(seed, step)`, so each stream is the stream of `stepRandom(seed, step)`. The intervals and the permutation p stay the same.
- A test compares the text of the intervals and of the permutation with the earlier loops, for 24 made-up screens. Some screens use the exact test, and some use draws.
- `signTest.p` of a result can differ in the last digits, by at most 1e-13 of its value. It is a report only, so no label changes.
  - A comparison with the exact p (bigint terms, for each count of families up to 80) shows the earlier loop is closer. Its largest relative error is 5.8e-16, and the largest of `signTest` is 2.5e-14.
  - The fix goes to the home of `signTest`: mark1russell7/rigor#158.
- `@mark1russell7/rigor-generators` goes to ^0.1.8, the range of `@mark1russell7/rigor-statistics` 0.1.23.

## 0.7.0

The release train changes the range of `@mark1russell7/typeset` to a version outside the old range. The public types name @mark1russell7/typeset, so its new version outside the old range can change them.

### Breaking

- The range `^0.1.8` of `@mark1russell7/typeset` in `dependencies` does not hold `0.2.0`, so it changes.

## 0.6.2

- PATCH before 1.0.0: the new export `dropIndex` gives the index at which a point goes among the items of a list on the screen.
- The reading order is the rows from top to bottom, and each row from left to right. A center within `rowTolerance` of the point is in its row.
- `dropIndex` came from `@mark1russell7/collections`, whose API review gives it this home. Collections marks its copy `@deprecated`.

## 0.6.1

- PATCH before 1.0.0: a record of `layout-record/1` can have the new optional field `carried` (L147). The new exports are the type `Carried`, the type `CarryFacts` and the function `carryRecord`.
- `carried` tells that a later run kept the record after an engine release, with no new measure. `carried.from` gives the engine versions of the measure, and `carried.to` gives the engine versions of the run that keeps the record.
- `carried.fingerprints` gives the fingerprint of each strategy of the record. `carried.run` gives the id of the run that measured the record.
- `checkLayoutRecord` refuses a `carried` with a bad form or with no fingerprint. It refuses other engine names in `from` and `to`, and the same versions in the two. It also refuses `carried` on a skipped record.
- `carryRecord` adds the field. A second carry keeps `carried.from` and `carried.run` of the first carry, so the record always names its measure.
- A record with no `carried` does not change, and a reader that does not know the field reads the record as before.

## 0.6.0

- MINOR before 1.0.0: `layoutText` breaks lines at the break places of UAX #14, not at white space only. Some texts get other lines.
- The words come from `lineBreaks` of `@mark1russell7/typeset` 0.1.8 (Unicode 17.0.0). The word segments of the measure cache come from `wordBreaks`, and `graphemesOf` gives `graphemes`. The three use no locale.
- A new text gets one call of `wordBreaks` for all its words: the words joined by line feeds. UAX #29 breaks on the two sides of a line feed, so each word gets the segments of a call on the word alone.
- The local splitter and its `Intl.Segmenter` objects are gone. The module needs `Intl.Segmenter` when it loads, because typeset makes its segmenters at that time. Before, a runtime with no `Intl.Segmenter` got code points.
- The install tree gets 2 packages through `@mark1russell7/typeset` 0.1.8: `@mark1russell7/collections` and `@mark1russell7/optional`. The browser-safety test examines their builds too.

### Migration: the inputs with other lines

- A text with a break place in a word: after a hyphen (`well-known`), after a slash or a dash, and between CJK characters.
  - A line can end at that place in 0.6.0, with no space at its end. A one-line text keeps the text with no added space.
- A text with a no-break space: the words on the two sides stay on one line, and the no-break space stays a no-break space. Before, it was a space between two words.
- A text with an ideographic space: that space stays in its word, with its own advance. The same is true for each white space of Unicode that CSS keeps.
- A text with a combining mark after a space: the mark starts the next word, as UAX #14 rule LB10 tells.
- A text with a space before a closing bracket, or before `!`, `?`, `/`, `.`, `,`, `:` or `;`. UAX #14 has no break place at that space.
  - The space stays in the word, so a line cannot end there. For example, `r .` stays on one line.
  - The measure cache also gets one more request for the space.
- A text with white space at its break places only gives the same lines, widths and cache counts as 0.5.5. The parity test against 0.2.21 in `src/text-breakers.test.ts` names each text of its corpus with other lines.
- `docs/TEXT.md` gives the rules and the test against `LineBreakTest.txt`.

## 0.5.6

- PATCH before 1.0.0: a new optional field. Each old call and each old file keeps its result, because the writer uses the new schema only for an entry with the field.
- `STRATEGY_CATALOG_SCHEMA` has a new value, and the type of `StrategyCatalog.schema` is wider. A code search of the public repositories found no caller of the two outside this package.
- A reader with an older contract refuses a file of the schema `strategy-catalog/3`. So an engine adds a fingerprint after its readers take 0.5.6.
- The new schema `strategy-catalog/3` adds an optional text `fingerprint` to `CatalogEntry`. It is the value of `fingerprintOf` for the probes of the engine: 16 lowercase hex digits.
- `parseStrategyCatalog` refuses another form, and it refuses the field in a file of the schema 1 or 2.
- `writeStrategyCatalog` writes the oldest schema that holds the file. A catalog with no `fingerprint` keeps its schema and its bytes.

## 0.5.5

- PATCH before 1.0.0: new exports and one new optional option, with no change to an old hash.
- `HashOptions` has the option `skip`: the names of report fields that the hash does not read, at each depth. An empty list gives the old hash.
- `packOutputForm` gives the normal form of the output of a packer. It has the placements, the overflow, the size and the moved obstacles, in the order of their ids. A placement without `turn` gets `turn: 0`. The form has no trace.
- `probeHash` gives the hash of one probe of a strategy, with exact numbers by default. A refusal gives the token `REFUSED_PROBE`, with no reason text.
- `fingerprintOf` gives one hash of the probe hashes of a strategy, by probe id. An engine gives it for each entry, so a bench reruns only the entries whose output changed.

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
