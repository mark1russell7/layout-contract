// The links of the navigation to the sites of the two engines. The build writes them into each page, so the URLs are in this file only.

/** One site of an engine: the name of the link and its address. */
export interface EngineSite {
  readonly name: string;
  readonly href: string;
}

/** The sites of the two engines. Each page links to them in its navigation, and the sites of the engines link back to this site. */
export const ENGINE_SITES: readonly EngineSite[] = Object.freeze([
  Object.freeze({ name: "highways", href: "https://mark1russell7.github.io/highways/" }),
  Object.freeze({ name: "packing", href: "https://mark1russell7.github.io/packing/" }),
]);

/** The mark in the navigation of each page. The build puts the links of `ENGINE_SITES` in its place. */
export const ENGINE_SITES_MARK = "<!-- engine-sites -->";

/** This function gives the HTML of the links to the sites of the engines. The names and the addresses are constants, so they need no escaping. */
export function engineLinksHtml(sites: readonly EngineSite[] = ENGINE_SITES): string {
  return sites.map((s) => `<a class="ext-link" href="${s.href}">${s.name}</a>`).join("\n        ");
}

/** This function puts the links of the engines in the place of the mark of a page. It throws an `Error` when the page has no mark, or more than one. */
export function withEngineLinks(html: string, page: string): string {
  const parts = html.split(ENGINE_SITES_MARK);
  if (parts.length !== 2) throw new Error(`The page ${page} has ${parts.length - 1} marks ${ENGINE_SITES_MARK}, not 1.`);
  return parts.join(engineLinksHtml());
}
