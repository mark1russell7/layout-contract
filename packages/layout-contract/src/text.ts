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
    },
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

/** This function splits the text into words at white space. Each word holds its word segments (`Intl.Segmenter`), so words that share segments share the cache. */
function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  let parts: string[] = [];
  const flush = (): void => {
    if (parts.length > 0) words.push({ text: parts.join(""), parts });
    parts = [];
  };
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    for (const s of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)) {
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
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

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
}

/** A line of a layout, with its width in units. */
interface Line {
  text: string;
  units: number;
}

/**
 * This function lays out a text. It cuts the text to `maxChars`. It keeps the text on one line when it fits in `maxWidth`. Else it breaks the text into lines of `wrapWidth`.
 *
 * The breaker is greedy, as a browser with `white-space: normal`. It collapses each run of white space to one space, and a line does not count its last space.
 * The width of a word is the sum of the advances of its segments. `docs/TEXT.md` gives the rules and the error of this sum.
 */
export function layoutText(text: string, options: TextLayoutOptions): TextLayout {
  const { font, measurer, lineHeight } = options;
  if (!(Number.isFinite(lineHeight) && lineHeight > 0)) throw new RangeError(`layoutText: lineHeight is a finite number above 0, not ${lineHeight}.`);
  const ellipsis = options.ellipsis ?? "…";
  const padding = options.padding ?? 0;
  const keep = (options.wordBreak ?? "keep") === "keep";
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
  const space = measurer.advance(" ", font);
  const width = (w: Word): number => w.parts.reduce((s, p) => s + measurer.advance(p, font), 0);
  const lineUnits = (line: string): number => {
    const ws = wordsOf(line);
    return ws.reduce((s, w) => s + width(w), 0) + space * Math.max(0, ws.length - 1);
  };
  const widths = words.map(width);
  const natural = widths.reduce((s, w) => s + w, 0) + space * Math.max(0, words.length - 1);

  const maxWidth = options.maxWidth ?? (options.wrapWidth === undefined ? Infinity : options.wrapWidth + padding);
  const fits = natural / TEXT_UNITS + padding <= maxWidth;
  if (options.wrapWidth === undefined || fits) {
    const one = words.map((w) => w.text).join(" ");
    const px = natural / TEXT_UNITS;
    const box = Math.min(maxWidth, Math.max(options.minWidth ?? 0, px + padding));
    return { lines: [one], widths: [px], lineCount: 1, width: box, height: lineHeight, truncated };
  }

  const limit = Math.round(options.wrapWidth * TEXT_UNITS);
  const lines: Line[] = [];
  let cur: Line | undefined;
  const push = (): void => {
    if (cur !== undefined) lines.push(cur);
    cur = undefined;
  };
  /** This function puts a word that is wider than a line on new lines, with a break between grapheme clusters. */
  const split = (word: Word): void => {
    for (const g of graphemesOf(word.text)) {
      const w = measurer.advance(g, font);
      if (cur !== undefined && cur.units + w > limit) push();
      if (cur === undefined) cur = { text: g, units: w };
      else {
        cur.text += g;
        cur.units += w;
      }
    }
  };
  words.forEach((word, i) => {
    const w = widths[i]!;
    if (cur !== undefined && cur.units + space + w <= limit) {
      cur.text += ` ${word.text}`;
      cur.units += space + w;
      return;
    }
    push();
    if (w > limit && !keep) split(word);
    else cur = { text: word.text, units: w };
  });
  push();
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

  return {
    lines: lines.map((l) => l.text),
    widths: lines.map((l) => l.units / TEXT_UNITS),
    lineCount: lines.length,
    width: options.wrapWidth + padding,
    height: lines.length * lineHeight,
    wrapWidth: options.wrapWidth,
    truncated,
  };
}

/** The id of a text measure. `docs/TEXT.md` gives the definitions. */
export type TextMeasureId = "text.lines" | "text.raggedness" | "text.overflow" | "text.cacheHit" | "text.ms";

/** The specs of the text measures. */
export const TEXT_MEASURES: readonly MeasureSpec<TextMeasureId>[] = Object.freeze([
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
