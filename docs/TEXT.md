# Text layout

The subpath `@mark1russell7/layout-contract/text` lays out the text of a label: it measures the text, breaks it into lines and gives the box. A layout that knows the size of each label before it places the nodes uses it. Phase A gave the measurer, the cache, the greedy breaker and the measures. In phase B, the breakers come from `@mark1russell7/typeset`, and the option `breaker` selects one of them.

## The parts

| Export | What it does |
|---|---|
| `AdvanceFn` | The function of the host that gives the width of a text in a font, in pixels. |
| `canvasAdvance(context)` | The advance function of a canvas context. It sets `font` only when the font changes. |
| `createMeasurer(advance, { maxEntries })` | A measurer with a cache keyed by the font and the segment. It gives each advance in whole units of 1/`TEXT_UNITS` (1/64) pixel. |
| `createTextLayoutCache({ maxEntries })` | A bounded cache of `layoutText` results. "The layout cache" below gives its rules. |
| `fontKey(font)` | The key of a font: the font string with its white space collapsed. |
| `graphemesOf(text)` | The grapheme clusters of a text. |
| `layoutText(text, options)` | The lines, the width of each line, the line count, the box and the `truncated` flag. |
| `textMeasures(layout, stats)` | The values of the text measures. |
| `TEXT_MEASURES` | The specs of the text measures. |

## The rules of `layoutText`

1. With `maxChars`, a text with more grapheme clusters keeps `maxChars` clusters. The ellipsis is the last of them.
2. The breaker splits the text into words at white space. It collapses each run of white space to one space, as `white-space: normal` in CSS.
3. The width of a word is the sum of the advances of its word segments (`Intl.Segmenter`). Labels that share words thus share cache entries.
4. When the line fits in `maxWidth`, the text stays on one line. The box is the text plus `padding`, clamped to `minWidth` and `maxWidth`.
5. Else the breaker breaks the text into lines of `wrapWidth`. The box has the width `wrapWidth` plus `padding`. The option `breaker` selects the breaker:
   - `greedy` (the default) adds each word to the current line while the line stays in `wrapWidth`. Its lines are the lines of 0.2.21.
   - `total-fit` is the total fit breaker of Knuth and Plass. It makes the sum of the demerits of all lines as small as possible, so the lines have more equal widths.
   - `balanced` keeps the line count of `greedy`. It finds the smallest width with that count, as `text-wrap: balance` in CSS.
6. A word that is wider than `wrapWidth` stays whole with `wordBreak: "keep"`. With `wordBreak: "anywhere"`, it breaks between grapheme clusters, as `overflow-wrap: anywhere` in CSS. Each breaker keeps these forced breaks.
7. With `maxLines`, a longer text keeps `maxLines` lines. The last line drops clusters until the line and the ellipsis fit in `wrapWidth`.

## The layout cache

A page that asks for the same labels many times can use `createTextLayoutCache` in place of its own memo. `layoutText` itself keeps no result. It gives a new object for each call, and it does not use this cache.

```ts
const cache = createTextLayoutCache({ maxEntries: 4096 });
const layout = cache.layout(text, { font, measurer, lineHeight: 16, wrapWidth: 160 });
```

- **Key.** The key holds the text, each option and the measurer. Two calls share an entry only when the text and all these values are the same.
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
