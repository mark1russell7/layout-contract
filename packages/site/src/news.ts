// The section "What's new": the dated list of data/news.json.
import type { NewsData } from "./data.ts";
import { esc } from "./ui.ts";

const REPO = "https://github.com/mark1russell7/layout-contract";

/** This function shows the news in the element `root`, from the newest item to the oldest. */
export function renderNews(root: HTMLElement, news: NewsData | undefined): void {
  if (news === undefined || news.items.length === 0) {
    root.innerHTML = `<p class="empty">No news is in <code>data/news.json</code> yet.</p>`;
    return;
  }
  const items = news.items
    .map((n) => {
      const prs = n.prs.map((p) => `<a href="${REPO}/pull/${p}">#${p}</a>`).join(", ");
      const release = n.release
        ? ` <a class="badge good" href="https://www.npmjs.com/package/@mark1russell7/layout-contract/v/${esc(n.release)}">npm ${esc(n.release)}</a>`
        : "";
      return `<li class="news-item"><time datetime="${esc(n.date)}">${esc(n.date)}</time><div>
        <h3><span class="badge">${esc(n.item)}</span> ${esc(n.title)}${release}</h3>
        <p>${esc(n.summary)}</p>
        <p class="hint">Pull requests: ${prs}</p></div></li>`;
    })
    .join("");
  root.innerHTML = `<p class="dataline">Data of <code>data/news.json</code>, last entry ${esc(news.items[0]!.date)}</p><ol class="news">${items}</ol>`;
}
