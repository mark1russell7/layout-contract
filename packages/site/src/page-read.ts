// The facts of a read of a live page (scripts/page-read.ts): the names of its files and the line of each read.

/** The widths of a read, in pixels. */
export const READ_WIDTHS: readonly number[] = Object.freeze([1280, 390]);

/** A color scheme of a read. */
export type ReadScheme = "light" | "dark";

/** The color schemes of a read. */
export const READ_SCHEMES: readonly ReadScheme[] = Object.freeze(["light", "dark"] as const);

/** The tallest crop of a read, in pixels. A viewer shows a crop of this height at its native scale. */
export const CROP_HEIGHT = 1000;

/** The text of the tag of a row that waits for the first cover run. */
export const WAITING_TAG = "waiting for the first cover run";

/** The text of the tag of a row that has no joint input. */
export const EXCEPTION_TAG = "no joint input";

/** One tag of a page. */
export interface ReadTag {
  readonly text: string;
  readonly title: string;
  /** The start of the text of the parent of the tag. */
  readonly row: string;
}

/** The read of one page at one width and one color scheme. */
export interface PageRead {
  readonly page: string;
  readonly width: number;
  readonly colorScheme: ReadScheme;
  readonly tags: readonly ReadTag[];
  /** The width of the page past the width of the window, in pixels. */
  readonly overflow: number;
  readonly errors: readonly string[];
  /** The file names of the crops of the sections of the page. */
  readonly crops: readonly string[];
}

/** The box of a part of a page, in pixels from the top left corner of the page. */
export interface CropBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A section of a page. An empty id gives a name from the place of the section. */
export interface ReadSection {
  readonly id: string;
  readonly box: CropBox;
}

/** This function gives the file name of the screenshot of a page. */
export function screenshotName(page: string, width: number, colorScheme: ReadScheme): string {
  return `${page.replace(/\W+/g, "-")}-${width}-${colorScheme}.png`;
}

/** This function gives the file name of one crop of a section. The first crop of a section has the number 1. */
export function cropName(page: string, width: number, colorScheme: ReadScheme, section: string, crop: number): string {
  return `${screenshotName(page, width, colorScheme).replace(/\.png$/, "")}-${section.replace(/\W+/g, "-")}-${String(crop).padStart(2, "0")}.png`;
}

/** This function gives the name of a section in its file names. `place` is the place of the section on its page, from 1. */
export function sectionName(id: string, place: number): string {
  return id === "" ? `section-${place}` : id;
}

/**
 * This function cuts a box into crops from top to bottom. Each crop is at most `height` pixels tall, and the crops have no gap.
 * Each edge goes to a whole pixel on the outer side, so a cut does not lose a line of pixels. A box with no area gives no crop.
 */
export function cropTiles(box: CropBox, height: number = CROP_HEIGHT): CropBox[] {
  if (!(height > 0)) throw new RangeError(`A crop height must be positive, and it is ${height}.`);
  if (box.width <= 0 || box.height <= 0) return [];
  const x = Math.floor(box.x);
  const width = Math.ceil(box.x + box.width) - x;
  const top = Math.floor(box.y);
  const bottom = Math.ceil(box.y + box.height);
  const tiles: CropBox[] = [];
  for (let y = top; y < bottom; y += height) tiles.push({ x, y, width, height: Math.min(height, bottom - y) });
  return tiles;
}

/** This function gives the URL of a page. The base can end with a slash. */
export function pageUrl(base: string, page: string): string {
  return `${base.replace(/\/$/, "")}/${page}`;
}

/** This function gives the line of one read: the counts of the tags, the overflow, the errors and the crops. */
export function readLine(read: PageRead): string {
  const count = (text: string): number => read.tags.filter((t) => t.text === text).length;
  return `${read.page} ${read.width} ${read.colorScheme}: ${count(WAITING_TAG)} waiting, ${count(EXCEPTION_TAG)} with no joint input, ${read.tags.length} tags, overflow ${read.overflow}, errors ${read.errors.length}, crops ${read.crops.length}`;
}
