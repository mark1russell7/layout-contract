# Text layout

The subpath `@mark1russell7/layout-contract/text` lays out the text of a label: it measures the text, breaks it into lines and gives the box. A layout that knows the size of each label before it places the nodes uses it. This is phase A: the measurer, the cache, the greedy breaker and the measures. Phase B adds more breakers as strategies, a text corpus and a bench.

## The parts

| Export | What it does |
|---|---|
| `AdvanceFn` | The function of the host that gives the width of a text in a font, in pixels. |
| `canvasAdvance(context)` | The advance function of a canvas context. It sets `font` only when the font changes. |
| `createMeasurer(advance, { maxEntries })` | A measurer with a cache keyed by the font and the segment. It gives each advance in whole units of 1/`TEXT_UNITS` (1/64) pixel. |
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
5. Else the breaker is greedy. It adds each word to the current line while the line stays in `wrapWidth`. The box has the width `wrapWidth` plus `padding`.
6. A word that is wider than `wrapWidth` stays whole with `wordBreak: "keep"`. With `wordBreak: "anywhere"`, it breaks between grapheme clusters, as `overflow-wrap: anywhere` in CSS.
7. With `maxLines`, a longer text keeps `maxLines` lines. The last line drops clusters until the line and the ellipsis fit in `wrapWidth`.

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
| `text.cacheHit` | 0 to 1 | higher | diagnostic | The cache hits divided by the requests of the measurer. |
| `text.ms` | milliseconds | lower | time | The time of the layout. The bench measures it. |
