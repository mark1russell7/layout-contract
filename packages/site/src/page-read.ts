// The facts of a read of a live page (scripts/page-read.ts): the names of its files and the line of each read.

/** The widths of a read, in pixels. */
export const READ_WIDTHS: readonly number[] = Object.freeze([1280, 390]);

/** A color scheme of a read. */
export type ReadScheme = "light" | "dark";

/** The color schemes of a read. */
export const READ_SCHEMES: readonly ReadScheme[] = Object.freeze(["light", "dark"] as const);

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
}

/** This function gives the file name of the screenshot of a page. */
export function screenshotName(page: string, width: number, colorScheme: ReadScheme): string {
  return `${page.replace(/\W+/g, "-")}-${width}-${colorScheme}.png`;
}

/** This function gives the URL of a page. The base can end with a slash. */
export function pageUrl(base: string, page: string): string {
  return `${base.replace(/\/$/, "")}/${page}`;
}

/** This function gives the line of one read: the counts of the two tags, the count of all tags, the overflow and the errors. */
export function readLine(read: PageRead): string {
  const count = (text: string): number => read.tags.filter((t) => t.text === text).length;
  return `${read.page} ${read.width} ${read.colorScheme}: ${count(WAITING_TAG)} waiting, ${count(EXCEPTION_TAG)} with no joint input, ${read.tags.length} tags, overflow ${read.overflow}, errors ${read.errors.length}`;
}
