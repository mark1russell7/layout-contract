# Text layout

The subpath `@mark1russell7/layout-contract/text` lays out the text of a label: it measures the text, breaks it into lines and gives the box. A layout that knows the size of each label before it places the nodes uses it. Phase A gave the measurer, the cache, the greedy breaker and the measures. In phase B, the breakers come from `@mark1russell7/typeset`, and the option `breaker` selects one of them.

## The parts

| Export | What it does |
|---|---|
| `AdvanceFn` | The function of the host that gives the width of a text in a font, in pixels. |
| `canvasAdvance(context)` | The advance function of a canvas context. It sets `font` only when the font changes. |
| `createMeasurer(advance, { maxEntries })` | A measurer with a cache keyed by the font and the segment. It gives each advance in whole units of 1/`TEXT_UNITS` (1/64) pixel. |
| `createTextCharset(characters, { pairMargin })` | A declared character set for the option `sizing`. "Sizing from a declared character set" below gives its rules. |
| `createTextLayoutCache({ maxEntries })` | A bounded cache of `layoutText` results. "The layout cache" below gives its rules. |
| `DIGITS`, `PRINTABLE_ASCII` | Two strings for `createTextCharset`. |
| `fontKey(font)` | The key of a font: the font string with its white space collapsed. |
| `graphemesOf(text)` | The grapheme clusters of a text. |
| `layoutText(text, options)` | The lines, the width of each line, the line count, the box and the `truncated` flag. |
| `textMeasures(layout, stats)` | The values of the text measures. |
| `TEXT_MEASURES` | The specs of the text measures. |

## The rules of `layoutText`

1. With `maxChars`, a text with more grapheme clusters keeps `maxChars` clusters. The ellipsis is the last of them. The clusters are the clusters of UAX #29 (`graphemes` of `@mark1russell7/typeset`), with no locale.
2. The breaker splits the text into words at the break places of UAX #14 (`lineBreaks` of `@mark1russell7/typeset`, Unicode 17.0.0). A word is the text from one break place to the next, with no white space at its end.
   - A word with white space after it has a gap of one space. A word with no white space after it, for example after a hyphen or a CJK character, has a gap of no width. A line can end at each gap.
   - The white space of CSS collapses to one space, as `white-space: normal` in CSS. It is the space, the tab, the line feed, the form feed and the carriage return.
   - The other mandatory breaks of UAX #14 (the classes `BK` and `NL`) also collapse.
   - A no-break space and an ideographic space are not white space of CSS. They stay in their word.
   - A line feed in the text is white space, as in CSS. Only the end of the text ends the last line.
3. The width of a word is the sum of the advances of its word segments (`wordBreaks` of `@mark1russell7/typeset`, UAX #29). Labels that share words thus share cache entries.
4. When the line fits in `maxWidth`, the text stays on one line. The box is the text plus `padding`, clamped to `minWidth` and `maxWidth`.
5. Else the breaker breaks the text into lines of `wrapWidth`. The box has the width `wrapWidth` plus `padding`. The option `breaker` selects the breaker:
   - `greedy` (the default) adds each word to the current line while the line stays in `wrapWidth`. Its lines are the lines of 0.2.21 when the break places of the text are at its white space only.
   - `total-fit` is the total fit breaker of Knuth and Plass. It makes the sum of the demerits of all lines as small as possible, so the lines have more equal widths.
   - `balanced` keeps the line count of `greedy`. It finds the smallest width with that count, as `text-wrap: balance` in CSS.
6. A word that is wider than `wrapWidth` stays whole with `wordBreak: "keep"`. With `wordBreak: "anywhere"`, it breaks between grapheme clusters, as `overflow-wrap: anywhere` in CSS. Each breaker keeps these forced breaks.
7. With `maxLines`, a longer text keeps `maxLines` lines. The last line drops clusters until the line and the ellipsis fit in `wrapWidth`.

## Justified lines and hyphens

Two options of a text that wraps come from typeset 0.3.0 and later (typeset T14). Without them, each layout stays the same.

- **`justify: { stretch, shrink }`.** Each space can stretch by `stretch` and shrink by `shrink`, as a share of the width of a space. TeX uses 0.5 and 1/3. The shrink is from 0 to 1.
- **`ratios`.** With `justify`, the layout gives the adjustment ratio of each line. A text that fits on one line at its natural width does not have this field. A renderer adds `ratio × stretch × space` to each space of a line, or `ratio × shrink × space` for a negative ratio. The last line does not stretch, so its ratio is 0 or less. A line with free space and no space to stretch has an infinite ratio.
- **`total-fit` with `justify`.** The total fit breaker chooses the lines by the adjustment ratio of Knuth and Plass. `greedy` and `balanced` do not read the stretch and the shrink, but the layout gives their ratios.
- **`hyphenate`.** The hook gives the offsets in a word where a break with a hyphen is possible. A break there costs 50, as in TeX, and the line ends with "-". The layout keeps only the places between two grapheme clusters. The pieces of a word have the width of the whole word, so a hook does not change a line with no hyphen. The subpaths `./hyphen/en-us`, `./hyphen/de` and `./hyphen/fr` of typeset give a hook. layout-contract imports no pattern set, so its size does not change.
- **The cache.** `createTextLayoutCache` keys the values of `justify` and the identity of `hyphenate`. Give the same function for each call, or the cache makes a new entry.

The test in `src/text-breakers.test.ts` lays out the 80 corpus paragraphs with a stretch of 0.5 and a shrink of 1/3. At 480 px, total fit gives 11 paragraphs a worst ratio of 1 or less, and greedy gives 2. The mean worst ratio is 1.94 for total fit and 3.50 for greedy. The words of the corpus have no hyphen places, so most lines cannot reach the edge.

## The test of the break places

`src/text-linebreak.test.ts` lays out each of the 19338 lines of `LineBreakTest.txt` of Unicode 17.0.0 with a line width smaller than each word. So each break place ends a line.

- The lines must be the text between the break places of the file, with the white space of rule 2 collapsed.
- The test skips no line. A mandatory break (`BK`, `CR`, `LF`, `NL`) is a break place there too, because each break place ends a line at that width.
- The file is in `test/fixtures` with gzip. The test checks its SHA-256 against the pin of the conformance gate of `@mark1russell7/typeset`.

## The layout cache

A page that asks for the same labels many times can use `createTextLayoutCache` in place of its own memo. `layoutText` itself keeps no result. It gives a new object for each call, and it does not use this cache.

```ts
const cache = createTextLayoutCache({ maxEntries: 4096 });
const layout = cache.layout(text, { font, measurer, lineHeight: 16, wrapWidth: 160 });
```

- **Key.** The key holds the text, each option and the measurer. Two calls share an entry only when the text and all these values are the same. The options include `sizing` and `charset`.
- **Character set.** The cache gives each character set object a number, as for a measurer. Two sets with the same characters thus do not share an entry.
- **Font.** The key holds the raw font string, not `fontKey(font)`. Two spellings of one font thus use two entries.
- **Measurer.** The cache gives each measurer object a number. Two measurer objects thus do not share an entry. The cache keeps only the measurer of its last call alive.
- **Reset of a measurer.** `generation()` of a measurer is part of the key, so `measurer.reset()` makes the old entries unreachable. They stay in the count until the cache removes them.
- **A measurer without `generation`.** Start `cache.reset()` after a change of its advances.
- **Bound.** `maxEntries` limits the count of the entries. The default is 4096. The cache has one bound for all measurers. The bound does not limit the length of a text.
- **Eviction.** A full cache removes one entry. It takes the set of options with the oldest last use, and in it the text with the oldest last use. A hit is a use. With `maxEntries: 0`, the cache keeps no entry.
- **Speed.** A call with the same options as the last call compares the fields and makes no key string. A change of the options builds a key string. One set of options for a run of labels is thus the fastest use.
- **Shared result.** Each result is deeply frozen, because all callers with one key get the same object. A change of a result throws a `TypeError` in strict mode, and it has no effect in other code. To change a result, change a copy from `structuredClone(layout)`.
- **Errors.** A call that throws keeps no entry.
- **Counts.** `cache.stats()` gives `requests`, `hits`, `calls` and `size`. A hit does not use the measurer, so the counts of the measurer do not include it.

## Sizing from a declared character set

A label can skip the measure when each of its characters comes from a declared set. The width of the label is then at most its length times the largest advance of the set. This product costs O(1) after the check of the characters, and it uses no measure.

```ts
const digits = createTextCharset(DIGITS);
const layout = layoutText("12345", { font, measurer, lineHeight: 16, wrapWidth: 160, sizing: "bound-first", charset: digits });
```

| `sizing` | A label in the set | A label out of the set |
|---|---|---|
| `exact` (the default) | It gets a measure. | It gets a measure. |
| `bound-first` | It stays on one line with no measure when its bound fits. Else it gets a measure, and its layout is the `exact` layout. | It gets a measure. |
| `bound` | It gets no measure. All widths and the box come from the bound, also when the label wraps. | It gets a measure. |

- **Result.** A layout from the bound has the field `bounded: true`. Each of its widths is at or above the measured width. A measured layout does not have the field.
- **Box of a skipped label.** No measure means no exact width, so the box of a skipped label is the box of the bound. The lines, the height and `truncated` of a skipped label are the `exact` values.
- **Lines of `bound`.** The breaker uses the bound of each word. A label can thus get more lines than `exact`, and the greedy breaker does not give fewer. A label that wraps at `maxLines` gets one measure, for the ellipsis.
- **Charset.** `bound-first` and `bound` need `charset`. Without it, `layoutText` gives a `RangeError`.
- **First use.** The set measures each of its members once for each font and measurer: 10 measures for `DIGITS`, 95 for `PRINTABLE_ASCII`. After `measurer.reset()`, it measures them again. For a measurer without `generation`, it measures them on each call.
- **The largest advance.** The set takes the largest member advance in units, and it adds 1 unit. The added unit is necessary: 5 characters of 7.3 pixels give 2336 units as one segment, but 5 times the rounded advance is 2335.

The cases that can break a bound:

| Case | What happens |
|---|---|
| A kerning pair that is narrower | The bound holds, because the sum of the advances stays above the width. |
| A kerning pair or a ligature that is wider | The bound is low with the default `pairMargin` of 0. Give the largest added width of a pair as a share of the largest advance. A test shows the low bound and the correction. The Adobe metrics of Helvetica have positive pairs, but no text of up to 200 characters from `DIGITS`, `PRINTABLE_ASCII` or a to z and the space goes over the bound. This check is for one font only, so give a margin for a font that you did not check. |
| Letter spacing and word spacing | `layoutText` has no such option. A host puts them in its advance function, so each member advance holds them. A host that adds letter spacing only between two characters gives it in `pairMargin`. |
| Tab, line break, soft hyphen, zero-width character | `createTextCharset` refuses them, so a label with one gets a measure. `exact` collapses a tab or a line break to one space, so `layoutText` has no hard break. |
| White space other than the space | `createTextCharset` refuses it, because `exact` replaces it with one space of a different width. |
| Combining marks, emoji parts, bidirectional controls | `createTextCharset` refuses them, so a label with one gets a measure. |
| Scripts that join or change their shape | `createTextCharset` refuses them. Only the Latin, Greek, Cyrillic, Han, Hiragana, Katakana and Common scripts are members. Thus Hebrew and Arabic text gets a measure. |
| A character out of the set | The label gets a measure. |
| A member with an advance of 0 or no number | That is a gap in the font. Each label of the font gets a measure. |
| An ellipsis from `maxChars` | The check reads the text after the cut, so an ellipsis out of the set gives a measure. |

The bench `packages/layout-contract/scripts/bench-text.mjs` gives these numbers. They come from the CI run 41766216704, with 100000 layouts for each round and 7 rounds, on Node 26. The bench is a report, not a gate. The labels are the 333 letter labels of the bench and 333 labels of digits, with `wrapWidth: 160` and `maxLines: 2`. The advances come from the Helvetica table of `scripts/text-labels.ts` at 12 pixels, with no kerning.

| Labels and set | Labels that skip | Measure calls, `exact` | Measure calls, `bound-first` | Median slack of `bound` | Time, `bound-first` / `exact` | Time, `exact` / `exact` (A/A) |
|---|---|---|---|---|---|---|
| Letters, `PRINTABLE_ASCII` | 82.9% | 387 | 200 | 109.7% | 0.703 | 0.999 |
| Letters, a to z and the space | 91.9% | 387 | 97 | 72.1% | 0.622 | 0.998 |
| Digits, `DIGITS` | 100.0% | 334 | 10 | 0.2% | 0.418 | 0.998 |

- A caller that does not set `sizing` keeps the exact path. In the same run the head took 1.027 of the time of the release before it. One run gives no proof that this difference is real.
- The slack is the bound minus the exact width, divided by the exact width, for the whole label on one line.
- The counts come from one cold pass over the labels, so they are the same in each job.
- Each time comes from passes with a new cold measurer for each pass. The table costs little, so a time ratio leaves out the cost of a real measure. The A/A column shows the noise of this job: differences under approximately 0.2% have no meaning here.
- The time of `exact` with no cold measurer is in the same table of the bench. CI gives this time against the last release, on the pull request.
- A small set gives a smaller slack. One wide character, for example `@`, sets the bound for all members.

## The units and the error

- Each advance is a whole number of units. A sum of units is exact, so each port of the breaker gets the same lines and the same pixels.
- The rounding error of one segment is at most 1/128 pixel. A line of `n` segments has an error of at most `n`/128 pixel against the sum of the true advances.
- The sum of the segment advances does not include the kerning at the edges of the segments. The bench of phase B measures this error against the advance of the whole line, with a font file and a shaping library. Claim T6 of the roadmap item L60 predicts 1 pixel or less on 99% of the lines.

## The measures

| Id | Unit | Better | Role | Definition |
|---|---|---|---|---|
| `text.lines` | count | lower | objective | The count of the lines. |
| `text.raggedness` | 0 to 1 | lower | objective | The mean of `((wrapWidth - width) / wrapWidth)^2` over the lines before the last line. A text on one line has the value 0. |
| `text.overflow` | share of `wrapWidth` | lower | guard | The largest excess of a line over `wrapWidth`, divided by `wrapWidth`. Only a long word with `wordBreak: "keep"` makes it larger than 0. |
| `text.cacheHit` | 0 to 1 | higher | diagnostic | The cache hits divided by the requests. The counts of a measurer give the share of the segments. The counts of a layout cache give the share of the layouts. |
| `text.ms` | milliseconds | lower | time | The time of the layout. The bench measures it. |
