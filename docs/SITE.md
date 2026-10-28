# The project site

The project site is at <https://mark1russell7.github.io/layout-contract/>. It has four sections:

1. **Joint benchmark:** the headline cell of the latest result, the misses by router and by packer, the ranked pairs, the baselines and the stress cell.
2. **Strategy space:** the schema `strategy-space/1`, and an interactive view of a space. Until an engine publishes its space, the view shows an example space.
3. **Sweep coverage and efficacy maps:** a placeholder. The roadmap items L35 and L36 fill it.
4. **What's new:** a dated list of the work items, with their releases and pull requests.

Each section with data shows the date and the source of its data. The site links to the sites of [packing](https://mark1russell7.github.io/packing/) and [highways](https://mark1russell7.github.io/highways/).

## How the site is built

- The package `packages/site` (`@layout-contract/site`) holds the site. It is a Vite site with TypeScript and no framework, from the preset `vite`.
- The workflow `.github/workflows/pages.yml` builds the site on each push to `main`. It uses `reusable-pages.yml` of the template (`CI.md`, section "Pages").
- The workflow sets `SITE_BASE` to `/layout-contract`. A local build uses the root `/`.
- The site reads only the files in `packages/site/data`, at build time. The build does not download a CI artifact.
- The prose of the site is in `packages/site/content/*.md`. `pnpm lint:ste` examines it.

The data folder has these files:

| Path | Schema | What it holds |
|---|---|---|
| `data/joint/<run>.json` | `site-joint/1` | One result of the joint benchmark, from the `report.json` of the CI run `<run>`. |
| `data/spaces/<engine>.json` | `site-space/1` | The strategy space of an engine, with its source and its date. |
| `data/examples/<name>.json` | `site-space/1` | An example space. The site labels it as an example. |
| `data/news.json` | `site-news/1` | The news, from the newest item to the oldest. |

`src/data.ts` holds the formats and their checks:

- The Vite config examines each data file with `checkDataFile`. A bad file stops the build, so the old site stays on Pages.
- The tests examine each data file again, and they give each space to `checkSpace` of `layout-contract`.
- The page examines the files again, and it shows a bad file in a red box.

## How an item updates the site

### A new result of the joint benchmark

The records of a run are CI artifacts, and the repository does not keep them. Thus each result adds one compact file, made from the `report.json` of the run.

1. Download the report of the run: `gh run download <run> -R mark1russell7/layout-contract -n joint-report -D <dir>`. A later analysis of the records of `<run>` keeps its report as the artifact `joint-report-of-<run>` of the later run.
2. Make the data file. Use an absolute path for the report:

   ```sh
   pnpm --filter @layout-contract/site run data:joint -- <dir>/report.json --run <run> --date <YYYY-MM-DD> --item <id> --versions highways=<v>,packing=<v>
   ```

3. Commit `packages/site/data/joint/<run>.json`. The site shows the latest result first, and a list gives the earlier results.

The script `scripts/joint-data.mjs` keeps the headline cell (the rule `all` with the cap 1.25) and the same cell on the stress inputs. It also keeps the 6 cells of the headline inputs and the predictions of the run. The corpus is `joint-v2` by default. The option `--corpus` changes it.

### The strategy space of an engine

Write `packages/site/data/spaces/<engine>.json` with the schema `site-space/1`:

```json
{ "schema": "site-space/1", "source": "packing 0.3.0", "date": "2026-11-02", "space": { "schema": "strategy-space/1", "engine": "pack", "version": "1", "stages": [] } }
```

The field `space` is the value of `packSpace` or `routeSpace`, as JSON. The site shows an engine space before the example.

### A news item

Add the item at the top of `items` in `packages/site/data/news.json`. Take the date and the pull request numbers from `git log` of `main`. The field `release` is the npm version of `@mark1russell7/layout-contract`, when the item has one.

### The sweep maps

The items L35 and L36 add a data folder for the sweep results, its check in `src/data.ts`, and the section. Until then, the section shows no data.

## Local commands

From the root of the repository:

- `pnpm --filter @layout-contract/site run dev` starts the site on a local server.
- `pnpm --filter @layout-contract/site run build` writes the site to `packages/site/dist`.
- `pnpm --filter @layout-contract/site run test` examines the data files and the sections.

## The prediction for the first build

This prediction comes before the first Pages build (L42). The scores of the local claims come from the local build and tests. The CI claims stay open until the first CI results.

| Id | Confidence | Claim |
|---|---|---|
| W1 | 0.85 | The first Pages run, after the Pages source is "GitHub Actions", builds and deploys in less than 5 minutes. |
| W2 | 0.9 | The page weight is less than 300 KB: the HTML, the CSS and the JavaScript, before compression. |
| W3 | 0.9 | Each section with data shows the date of its data, and the sweep section tells that it has no data. |
| W4 | 0.95 | A data file that is not valid JSON, or that does not pass its check, makes the build fail. |
| W5 | 0.5 | At a width of 360 px, the page has no horizontal scroll, in the light theme and in the dark theme. |
| W6 | 0.45 | The CI of the pull request passes on the first push, with no fix commit. |

W5 and W6 are the risky claims. The tables, the long pair names and the strategy-space view are the risks of W5. The check `check:api` needs a build, so only CI starts it. It and the frozen install of CI are the risks of W6.

### The local scores

| Id | Score | Facts |
|---|---|---|
| W1 | open | The local build takes less than 1 second. The install and the deploy of CI are not in this time. |
| W2 | held (local) | The build is 143.6 KB: the HTML 3.4 KB, the CSS 10.7 KB and the JavaScript 129.5 KB. With gzip, the total is approximately 40 KB. |
| W3 | held (local) | The tests of the sections find the run date of the joint result, the date of the example space and the date of the news. |
| W4 | held (local) | A joint file without its fields and a file with broken JSON each stopped the build with exit code 1. |
| W5 | open | The local checks start no browser. |
| W6 | open | CI starts after the push. |
