import { breakers, linesOf, type Box, type Item, type Penalty } from "@mark1russell7/typeset/breaking";
import type { MeasureSpec } from "./measures.ts";

/**
 * The advance function of a host: the width of a run of text in a font, in pixels.
 * A browser host gives `canvasAdvance(context)`. A test or a server host gives a function of a font file.
 */
export type AdvanceFn = (text: string, font: string) => number;

/** The count of the units in one pixel. Each advance is a whole number of units, so each sum is exact and each port gets the same pixels. */
export const TEXT_UNITS = 64;

/** The counts of a measurer: the requests, the cache hits and the calls of the advance function. */
export interface MeasurerStats {
  readonly requests: number;
  readonly hits: number;
  readonly calls: number;
}

/** A measurer: the advance of a segment in a font, in whole units of 1/`TEXT_UNITS` pixel, with a cache. */
export interface TextMeasurer {
  /** This function gives the advance of the segment in the font, in units. */
  advance(segment: string, font: string): number;
  /** This function gives the counts since the start or since the last `reset`. */
  stats(): MeasurerStats;
  /** This function clears the cache and the counts. */
  reset(): void;
  /** This function gives the count of the `reset` calls. A `TextLayoutCache` reads it, and it does not give a layout from before a reset. */
  generation?(): number;
}

/** The options of `createMeasurer`. */
export interface MeasurerOptions {
  /** The count of the cache entries. The default is 10000. With 0, the measurer has no cache. */
  readonly maxEntries?: number;
}

/** This function gives the key of a font: the font string with its white space collapsed and trimmed. */
export function fontKey(font: string): string {
  return font.trim().replace(/\s+/g, " ");
}

/**
 * This function gives a measurer with a cache keyed by the font and the segment.
 * The cache removes its oldest entry when it is full. The advance function rounds each width to whole units.
 */
export function createMeasurer(measure: AdvanceFn, options: MeasurerOptions = {}): TextMeasurer {
  const max = options.maxEntries ?? 10000;
  if (!(Number.isInteger(max) && max >= 0)) throw new RangeError(`createMeasurer: maxEntries is an integer of 0 or more, not ${max}.`);
  const cache = new Map<string, number>();
  let requests = 0;
  let hits = 0;
  let calls = 0;
  let generation = 0;
  return {
    advance(segment, font) {
      requests++;
      const key = `${fontKey(font)}\u0000${segment}`;
      const known = cache.get(key);
      if (known !== undefined) {
        hits++;
        return known;
      }
      calls++;
      const px = measure(segment, font);
      if (!Number.isFinite(px) || px < 0) throw new RangeError(`The advance of "${segment}" in "${font}" is ${px}, not a finite number of 0 or more.`);
      const units = Math.round(px * TEXT_UNITS);
      if (max > 0) {
        if (cache.size >= max) cache.delete(cache.keys().next().value!);
        cache.set(key, units);
      }
      return units;
    },
    stats: () => ({ requests, hits, calls }),
    reset() {
      cache.clear();
      requests = 0;
      hits = 0;
      calls = 0;
      generation++;
    },
    generation: () => generation,
  };
}

/** The part of a canvas context that `canvasAdvance` uses. */
export interface CanvasTextContext {
  font: string;
  measureText(text: string): { readonly width: number };
}

/** This function gives the advance function of a canvas context. It sets `font` only when the font changes, because a browser parses each new font string. */
export function canvasAdvance(context: CanvasTextContext): AdvanceFn {
  let current: string | undefined;
  return (text, font) => {
    if (font !== current) {
      context.font = font;
      current = font;
    }
    return context.measureText(text).width;
  };
}

/** A word of a text: its segments, which the measurer measures and caches one by one. */
interface Word {
  readonly text: string;
  readonly parts: readonly string[];
}

const SPACE = /^\s+$/u;

/** The segmenters of the module. A new `Intl.Segmenter` loads the data of the locale, so the module makes each granularity only once. */
const segmenters = /* @__PURE__ */ new Map<"word" | "grapheme", Intl.Segmenter | null>();

/** This function gives the segmenter of a granularity, or `null` without `Intl.Segmenter`. */
function segmenterOf(granularity: "word" | "grapheme"): Intl.Segmenter | null {
  let s = segmenters.get(granularity);
  if (s === undefined) {
    s = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity }) : null;
    segmenters.set(granularity, s);
  }
  return s;
}

/** The largest count of texts in the memo of `wordsOf`. A page often asks for the same labels many times. */
const WORDS_MEMO = 4096;
const wordsMemo = /* @__PURE__ */ new Map<string, readonly Word[]>();

/** This function splits the text into words at white space. Each word holds its word segments (`Intl.Segmenter`), so words that share segments share the cache. */
function wordsOf(text: string): readonly Word[] {
  const known = wordsMemo.get(text);
  if (known !== undefined) return known;
  const words = splitWords(text);
  // The memo forgets its oldest text when it is full.
  if (wordsMemo.size >= WORDS_MEMO) wordsMemo.delete(wordsMemo.keys().next().value!);
  wordsMemo.set(text, words);
  return words;
}

/** This function gives the words of `wordsOf` with no memo. */
function splitWords(text: string): Word[] {
  const words: Word[] = [];
  let parts: string[] = [];
  const flush = (): void => {
    if (parts.length > 0) words.push({ text: parts.join(""), parts });
    parts = [];
  };
  const segmenter = segmenterOf("word");
  if (segmenter !== null) {
    for (const s of segmenter.segment(text)) {
      if (SPACE.test(s.segment)) flush();
      else parts.push(s.segment);
    }
  } else {
    for (const s of text.split(/(\s+)/u)) {
      if (s === "" || SPACE.test(s)) flush();
      else parts.push(s);
    }
  }
  flush();
  return words;
}

/** This function gives the grapheme clusters of a text. Without `Intl.Segmenter`, it gives the code points. */
export function graphemesOf(text: string): string[] {
  const segmenter = segmenterOf("grapheme");
  if (segmenter !== null) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** The digits, as a value for `createTextCharset`. */
export const DIGITS = "0123456789";

/** The printable characters of ASCII with the space, as a value for `createTextCharset`. */
export const PRINTABLE_ASCII = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

/** The scripts of a member of a character set. The characters of other scripts can join or change their shape, so their advances do not add. */
const SIMPLE_SCRIPT = /^[\p{Script=Common}\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u;

/** The characters that are not plain advances: marks, control and format characters, emoji parts, and each white space but the space. */
const NOT_AN_ADVANCE = /[\p{M}\p{C}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]|[^\S ]/u;

/** The largest count of fonts in the memo of a character set for one measurer. */
const CHARSET_FONTS = 64;

/** The options of `createTextCharset`. */
export interface TextCharsetOptions {
  /**
   * The largest width that two neighbor characters add to the sum of their advances, as a share of the largest advance. The default is 0.
   * A kerning pair that is narrower adds no width. Give a value for a font with kerning pairs or ligatures that are wider.
   */
  readonly pairMargin?: number;
}

/** A declared character set. A caller asks for it with `createTextCharset`. It is frozen, so `createTextLayoutCache` can use its identity as a key. */
export interface TextCharset {
  readonly characters: string;
  /** This function tells if each code point of the text is a member of the set. */
  covers(text: string): boolean;
  /**
   * This function gives the bound of one UTF-16 code unit of a member in the font, in units of 1/`TEXT_UNITS` pixel.
   * It measures each member once for a measurer with `generation`, and again after a `reset`. It measures on each call for a different measurer.
   * It gives `undefined` when a member has no positive finite advance: that is a gap in the font.
   */
  unit(font: string, measurer: TextMeasurer): number | undefined;
}

/**
 * This function gives a declared character set. A member is one code point with a plain advance.
 * A tab, a line break, a soft hyphen, a zero-width character, a combining mark, an emoji part or a bidirectional control gives a `RangeError`.
 * A letter of a script that joins or changes its shape, for example Arabic or Devanagari, also gives a `RangeError`. A label with this letter gets a measure.
 */
export function createTextCharset(characters: string, options: TextCharsetOptions = {}): TextCharset {
  const pairMargin = options.pairMargin ?? 0;
  if (!(Number.isFinite(pairMargin) && pairMargin >= 0)) throw new RangeError(`createTextCharset: pairMargin is a finite number of 0 or more, not ${pairMargin}.`);
  const members = new Set(characters);
  if (members.size === 0) throw new RangeError("createTextCharset: the set has no character.");
  for (const c of members) {
    if (NOT_AN_ADVANCE.test(c) || !SIMPLE_SCRIPT.test(c)) throw new RangeError(`createTextCharset: U+${c.codePointAt(0)!.toString(16).toUpperCase()} is not a plain advance.`);
  }
  /** This function gives the bound of one character. The added unit holds the rounding of each advance, so a sum of rounded segments stays under the bound. */
  const scan = (font: string, measurer: TextMeasurer): number | undefined => {
    let largest = 0;
    for (const c of members) {
      const units = measurer.advance(c, font);
      if (!(Number.isFinite(units) && units > 0)) return undefined;
      largest = Math.max(largest, units);
    }
    return Math.ceil((largest + 1) * (1 + pairMargin));
  };
  const memo = new WeakMap<TextMeasurer, Map<string, { readonly generation: number; readonly unit: number | undefined }>>();
  return Object.freeze({
    characters,
    covers(text: string): boolean {
      for (const c of text) if (!members.has(c)) return false;
      return true;
    },
    unit(font: string, measurer: TextMeasurer): number | undefined {
      const generation = measurer.generation?.();
      // A measurer without `generation` does not tell of a change of its advances, so a memo can keep a low bound.
      if (generation === undefined) return scan(font, measurer);
      let fonts = memo.get(measurer);
      if (fonts === undefined) {
        fonts = new Map();
        memo.set(measurer, fonts);
      }
      const known = fonts.get(font);
      if (known?.generation === generation) return known.unit;
      const unit = scan(font, measurer);
      if (fonts.size >= CHARSET_FONTS) fonts.delete(fonts.keys().next().value!);
      fonts.set(font, { generation, unit });
      return unit;
    },
  });
}

/** The source of the width of a label. The option `sizing` of `layoutText` tells each value. */
export type TextSizing = "exact" | "bound-first" | "bound";

/** The options of `layoutText`. All lengths are in pixels. */
export interface TextLayoutOptions {
  readonly font: string;
  readonly measurer: TextMeasurer;
  /** The line height. A finite number above 0. */
  readonly lineHeight: number;
  /** The width of the lines of a text that does not fit on one line. Without it, the text stays on one line. */
  readonly wrapWidth?: number;
  /** The count of the lines. The last line that stays gets the ellipsis. The default is no limit. */
  readonly maxLines?: number;
  /** The count of the grapheme clusters. A longer text keeps `maxChars` clusters with the ellipsis at the end. The default is no limit. */
  readonly maxChars?: number;
  /** The text at the end of a cut text. The default is "…". */
  readonly ellipsis?: string;
  /** The space that the box adds to the width of the text. The default is 0. */
  readonly padding?: number;
  /** The smallest width of a box with one line. The default is 0. */
  readonly minWidth?: number;
  /** The largest width of a box with one line. A text that does not fit wraps at `wrapWidth`. The default is `wrapWidth` plus the padding, or no limit without `wrapWidth`. */
  readonly maxWidth?: number;
  /**
   * The break of a word that is wider than a line. `keep` (the default) keeps the word whole, and the line overflows.
   * `anywhere` breaks it between two grapheme clusters, as the CSS `overflow-wrap: anywhere`.
   */
  readonly wordBreak?: "keep" | "anywhere";
  /**
   * The line breaker of `@mark1russell7/typeset`. `greedy` (the default) fills each line, as a browser. `total-fit` (Knuth and Plass)
   * makes the lines more equal. `balanced` keeps the greedy line count with the least width.
   */
  readonly breaker?: "greedy" | "total-fit" | "balanced";
  /**
   * The source of the width of a label. `exact` (the default) measures each label.
   * `bound-first` keeps a label of `charset` on one line with no measure when its bound fits. It measures each other label.
   * `bound` sizes each label of `charset` from its bound, also when the label wraps. A label that has a character out of `charset` gets a measure in all modes.
   */
  readonly sizing?: TextSizing;
  /** The declared character set of `sizing`. `bound-first` and `bound` need it, and `exact` does not read it. */
  readonly charset?: TextCharset;
}

/** The layout of a text: its lines and its box. */
export interface TextLayout {
  readonly lines: readonly string[];
  /** The width of each line, in pixels. Each width is a whole number of units of 1/`TEXT_UNITS` pixel. */
  readonly widths: readonly number[];
  readonly lineCount: number;
  /** The width of the box: the text and the padding. */
  readonly width: number;
  readonly height: number;
  /** The width of the lines, or `undefined` for a text on one line. */
  readonly wrapWidth?: number;
  /** `true` when `maxChars` or `maxLines` cut the text. */
  readonly truncated: boolean;
  /** `true` when the widths and the box come from the bound of a character set. Each width is then at or above the measured width. A measured layout does not have this field. */
  readonly bounded?: true;
}

/** A forced break: a penalty with no text, no width and the cost `-Infinity`. */
const FORCED: Penalty = { type: "penalty", text: "", width: 0, cost: -Infinity, flagged: false };

/** This function gives the box of a part of a word. */
/** This function gives the units of a segment: the bound for one character times the length, or a measure when there is no bound. */
function advanceOf(segment: string, font: string, measurer: TextMeasurer, bound: number | undefined): number {
  return bound === undefined ? measurer.advance(segment, font) : segment.length * bound;
}

function boxOf(part: { readonly text: string; readonly width: number }): Box {
  return { type: "box", text: part.text, width: part.width };
}

/** A line of a layout, with its width in units. */
interface Line {
  text: string;
  units: number;
}

/**
 * This function lays out a text. It cuts the text to `maxChars`. It keeps the text on one line when it fits in `maxWidth`. Else it breaks the text into lines of `wrapWidth`.
 *
 * The breaker comes from `@mark1russell7/typeset`. The default is greedy, as a browser with `white-space: normal`.
 * It collapses each run of white space to one space, and a line does not count its last space.
 * The width of a word is the sum of the advances of its segments. `docs/TEXT.md` gives the rules and the error of this sum.
 *
 * The option `sizing` replaces a measure with the bound of a declared character set. A caller that does not set it gets each measured result.
 */
export function layoutText(text: string, options: TextLayoutOptions): TextLayout {
  const { font, measurer, lineHeight } = options;
  if (!(Number.isFinite(lineHeight) && lineHeight > 0)) throw new RangeError(`layoutText: lineHeight is a finite number above 0, not ${lineHeight}.`);
  const ellipsis = options.ellipsis ?? "…";
  const padding = options.padding ?? 0;
  const keep = (options.wordBreak ?? "keep") === "keep";
  const name = options.breaker ?? "greedy";
  if (!Object.hasOwn(breakers, name)) throw new RangeError(`layoutText: breaker is "greedy", "total-fit" or "balanced", not ${String(name)}.`);
  const breaker = breakers[name];
  const sizing = options.sizing ?? "exact";
  if (sizing !== "exact" && sizing !== "bound-first" && sizing !== "bound") throw new RangeError(`layoutText: sizing is "exact", "bound-first" or "bound", not ${String(sizing)}.`);
  const charset = sizing === "exact" ? undefined : options.charset;
  if (sizing !== "exact" && charset === undefined) throw new RangeError(`layoutText: sizing "${sizing}" needs a charset from createTextCharset.`);
  let truncated = false;

  let source = text;
  if (options.maxChars !== undefined) {
    const clusters = graphemesOf(source);
    if (clusters.length > options.maxChars) {
      const room = Math.max(0, options.maxChars - graphemesOf(ellipsis).length);
      source = clusters.slice(0, room).join("") + ellipsis;
      truncated = true;
    }
  }

  const words = wordsOf(source);
  const maxWidth = options.maxWidth ?? (options.wrapWidth === undefined ? Infinity : options.wrapWidth + padding);
  const oneLine = (natural: number, bounded: boolean): TextLayout => {
    const one = words.map((w) => w.text).join(" ");
    const px = natural / TEXT_UNITS;
    const box = Math.min(maxWidth, Math.max(options.minWidth ?? 0, px + padding));
    const layout: TextLayout = { lines: [one], widths: [px], lineCount: 1, width: box, height: lineHeight, truncated };
    return bounded ? { ...layout, bounded } : layout;
  };

  // The raw text, not its words: the check sees a tab or a line break before they collapse.
  const unit = charset?.covers(source) === true ? charset.unit(font, measurer) : undefined;
  if (sizing === "bound-first" && unit !== undefined) {
    const natural = words.reduce((s, w) => s + w.text.length, Math.max(0, words.length - 1)) * unit;
    if (options.wrapWidth === undefined || natural / TEXT_UNITS + padding <= maxWidth) return oneLine(natural, true);
  }
  const bound = sizing === "bound" ? unit : undefined;
  const space = advanceOf(" ", font, measurer, bound);
  const width = (w: Word): number => w.parts.reduce((s, p) => s + advanceOf(p, font, measurer, bound), 0);
  const lineUnits = (line: string): number => {
    const ws = wordsOf(line);
    return ws.reduce((s, w) => s + width(w), 0) + space * Math.max(0, ws.length - 1);
  };
  const widths = words.map(width);
  const natural = widths.reduce((s, w) => s + w, 0) + space * Math.max(0, words.length - 1);

  const fits = natural / TEXT_UNITS + padding <= maxWidth;
  if (options.wrapWidth === undefined || fits) return oneLine(natural, bound !== undefined);

  const limit = Math.round(options.wrapWidth * TEXT_UNITS);
  // The items of the breaker: a box for each word, and glue of one space between two words.
  const items: Item[] = [];
  /** This function puts a word that is wider than a line on new lines, with a break between grapheme clusters. Each forced penalty ends a line. */
  const split = (word: Word): void => {
    if (items.length > 0) items.push(FORCED);
    let cur: { text: string; width: number } | undefined;
    for (const g of graphemesOf(word.text)) {
      const w = advanceOf(g, font, measurer, bound);
      if (cur !== undefined && cur.width + w > limit) {
        items.push(boxOf(cur), FORCED);
        cur = undefined;
      }
      if (cur === undefined) cur = { text: g, width: w };
      else {
        cur.text += g;
        cur.width += w;
      }
    }
    if (cur !== undefined) items.push(boxOf(cur));
  };
  words.forEach((word, i) => {
    const w = widths[i]!;
    if (w > limit && !keep) split(word);
    else {
      if (items.length > 0) items.push({ type: "glue", text: " ", width: space });
      items.push({ type: "box", text: word.text, width: w });
    }
  });
  const paragraph = { items };
  const lines: Line[] = linesOf(paragraph, breaker.breaks(paragraph, limit)).map((l) => ({ text: l.text, units: l.width }));
  if (lines.length === 0) lines.push({ text: "", units: 0 });

  const maxLines = options.maxLines ?? Infinity;
  if (lines.length > maxLines) {
    lines.length = Math.max(1, maxLines);
    const last = lines[lines.length - 1]!;
    const tail = measurer.advance(ellipsis, font);
    const clusters = graphemesOf(last.text);
    while (clusters.length > 0 && lineUnits(clusters.join("")) + tail > limit) clusters.pop();
    const kept = clusters.join("").replace(/\s+$/u, "");
    last.text = kept + ellipsis;
    last.units = lineUnits(kept) + tail;
    truncated = true;
  }

  const layout: TextLayout = {
    lines: lines.map((l) => l.text),
    widths: lines.map((l) => l.units / TEXT_UNITS),
    lineCount: lines.length,
    width: options.wrapWidth + padding,
    height: lines.length * lineHeight,
    wrapWidth: options.wrapWidth,
    truncated,
  };
  return bound === undefined ? layout : { ...layout, bounded: true };
}

/** The counts of a `TextLayoutCache`. `calls` is the count of the `layoutText` calls, and `size` is the count of the entries. */
export interface TextLayoutCacheStats extends MeasurerStats {
  readonly size: number;
}

/** The options of `createTextLayoutCache`. */
export interface TextLayoutCacheOptions {
  /** The largest count of the entries. The default is 4096. With 0, the cache keeps no entry. */
  readonly maxEntries?: number;
}

/** A cache of `layoutText` results. A caller asks for it with `createTextLayoutCache`. `layoutText` itself has no cache of results. */
export interface TextLayoutCache {
  /**
   * This function gives the result of `layoutText` for the text and the options.
   * The result is deeply frozen. Equal arguments give the same object until the cache removes the entry.
   */
  layout(text: string, options: TextLayoutOptions): TextLayout;
  /** This function gives the counts since the start or since the last `reset`. */
  stats(): TextLayoutCacheStats;
  /** This function clears the entries and the counts. */
  reset(): void;
}

/** This function gives the key text of a number. It keeps -0, because `layoutText` can give -0 back in a result. */
function numberKey(value: number | undefined): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

/**
 * This function gives the key of a set of options, without the text and the measurer. Two different sets do not give one key.
 * A number has no comma. The two lengths mark the end of the font and of the ellipsis.
 */
function optionsKey(o: TextLayoutOptions): string {
  const numbers = `${numberKey(o.lineHeight)},${numberKey(o.wrapWidth)},${numberKey(o.maxLines)},${numberKey(o.maxChars)},${numberKey(o.padding)},${numberKey(o.minWidth)},${numberKey(o.maxWidth)}`;
  return `${numbers},${(o.wordBreak ?? "keep") === "keep"},${o.breaker},${o.sizing ?? "exact"},${o.font.length},${o.ellipsis?.length},${o.font}${o.ellipsis ?? ""}`;
}

/** This function tells if two sets of options are the same. It uses `Object.is`, so 0 and -0 are different. It makes no string, so it is cheap on each hit. */
function sameOptions(a: TextLayoutOptions, b: TextLayoutOptions): boolean {
  return (
    a.font === b.font &&
    a.measurer === b.measurer &&
    Object.is(a.lineHeight, b.lineHeight) &&
    Object.is(a.wrapWidth, b.wrapWidth) &&
    Object.is(a.maxLines, b.maxLines) &&
    Object.is(a.maxChars, b.maxChars) &&
    Object.is(a.padding, b.padding) &&
    Object.is(a.minWidth, b.minWidth) &&
    Object.is(a.maxWidth, b.maxWidth) &&
    a.ellipsis === b.ellipsis &&
    a.wordBreak === b.wordBreak &&
    a.breaker === b.breaker &&
    a.sizing === b.sizing &&
    a.charset === b.charset
  );
}

/** The set of options of the last call of a cache, with its layouts by text. */
interface CurrentOptions {
  /** A copy of the options, so a later change of the object of the caller does not touch it. */
  readonly options: TextLayoutOptions;
  readonly generation: number | undefined;
  readonly key: string;
  readonly layouts: Map<string, TextLayout>;
}

/**
 * This function gives a bounded cache of `layoutText` results, keyed by the text, the options, the measurer and the character set.
 * A full cache removes one entry. It takes the set of options that a caller used least recently, and in it the text that a caller used least recently.
 * The key holds the raw font string, because a host can give two spellings of a font two different advances.
 * A measurer with `generation` starts a new set of keys after each `reset`. For a different measurer, start `reset` of the cache after a change of the advances.
 */
export function createTextLayoutCache(options: TextLayoutCacheOptions = {}): TextLayoutCache {
  const max = options.maxEntries ?? 4096;
  if (!(Number.isInteger(max) && max >= 0)) throw new RangeError(`createTextLayoutCache: maxEntries is an integer of 0 or more, not ${max}.`);
  // Each Map keeps the order of insertion, so its first key is the least recently used. A set of options is here only while it has an entry.
  const groups = new Map<string, Map<string, TextLayout>>();
  // A measurer and a character set are objects. Each gets a number here, so a key does not keep it alive.
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  let current: CurrentOptions | undefined;
  let size = 0;
  let requests = 0;
  let hits = 0;
  let calls = 0;
  const idOf = (item: object): number => {
    let id = ids.get(item);
    if (id === undefined) {
      id = nextId++;
      ids.set(item, id);
    }
    return id;
  };
  /** This function finds the layouts of a set of options, and it makes that set the most recently used. */
  const open = (layoutOptions: TextLayoutOptions, generation: number | undefined): CurrentOptions => {
    const charset = layoutOptions.charset === undefined ? "" : idOf(layoutOptions.charset);
    const key = `${idOf(layoutOptions.measurer)},${generation},${charset},${optionsKey(layoutOptions)}`;
    const layouts = groups.get(key) ?? new Map<string, TextLayout>();
    if (groups.delete(key)) groups.set(key, layouts);
    return { options: { ...layoutOptions }, generation, key, layouts };
  };
  /** This function removes one entry. */
  const evict = (): void => {
    const [key, layouts] = groups.entries().next().value!;
    layouts.delete(layouts.keys().next().value!);
    size--;
    if (layouts.size === 0) groups.delete(key);
  };
  return {
    layout(text, layoutOptions) {
      requests++;
      const generation = layoutOptions.measurer.generation?.();
      if (current === undefined || generation !== current.generation || !sameOptions(current.options, layoutOptions)) current = open(layoutOptions, generation);
      const { key, layouts } = current;
      const known = layouts.get(text);
      if (known !== undefined) {
        hits++;
        // This moves the text to the end of the order.
        layouts.delete(text);
        layouts.set(text, known);
        return known;
      }
      calls++;
      const layout = layoutText(text, layoutOptions);
      // The callers share this object, so it is frozen also when the cache does not keep it.
      Object.freeze(layout.lines);
      Object.freeze(layout.widths);
      Object.freeze(layout);
      if (max > 0) {
        if (size >= max) evict();
        if (layouts.size === 0) groups.set(key, layouts);
        layouts.set(text, layout);
        size++;
      }
      return layout;
    },
    stats: () => ({ requests, hits, calls, size }),
    reset() {
      groups.clear();
      current = undefined;
      size = 0;
      requests = 0;
      hits = 0;
      calls = 0;
    },
  };
}

/** The id of a text measure. `docs/TEXT.md` gives the definitions. */
export type TextMeasureId = "text.lines" | "text.raggedness" | "text.overflow" | "text.cacheHit" | "text.ms";

/** The specs of the text measures. */
export const TEXT_MEASURES: readonly MeasureSpec<TextMeasureId>[] = /* @__PURE__ */ Object.freeze([
  { id: "text.lines", unit: "count", direction: "lower", min: 1, max: Infinity, minEffect: 0, family: "text" },
  { id: "text.raggedness", unit: "0 to 1", direction: "lower", min: 0, max: 1, minEffect: 0.005, family: "text" },
  { id: "text.overflow", unit: "share of the wrap width", direction: "lower", min: 0, max: Infinity, floor: 0, tol: 0, minEffect: 0, family: "text", role: "guard" },
  { id: "text.cacheHit", unit: "0 to 1", direction: "higher", min: 0, max: 1, family: "text", role: "diagnostic" },
  { id: "text.ms", unit: "milliseconds", direction: "lower", min: 0, max: Infinity, family: "text", role: "time" },
] as const);

/**
 * This function gives the measures of a layout. `text.raggedness` is the mean of `((wrapWidth - width) / wrapWidth)^2` over the lines before the last line.
 * `text.overflow` is the largest excess of a line over `wrapWidth`, as a share of `wrapWidth`. A text on one line gives 0 for the two values.
 * With `stats`, the measures also hold `text.cacheHit`: the hits divided by the requests.
 */
export function textMeasures(layout: TextLayout, stats?: MeasurerStats): Partial<Record<TextMeasureId, number>> {
  const w = layout.wrapWidth;
  const body = layout.widths.slice(0, -1);
  const raggedness = w === undefined || body.length === 0 ? 0 : body.reduce((s, x) => s + (Math.max(0, w - x) / w) ** 2, 0) / body.length;
  const overflow = w === undefined ? 0 : Math.max(0, ...layout.widths.map((x) => (x - w) / w));
  return {
    "text.lines": layout.lineCount,
    "text.raggedness": raggedness,
    "text.overflow": overflow,
    ...(stats === undefined ? {} : { "text.cacheHit": stats.requests === 0 ? 0 : stats.hits / stats.requests }),
  };
}
