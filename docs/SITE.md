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

## The joint pages

The site has two more pages: `compare.html` and `playground.html`. Both use the joint runner of the benchmark in a Web Worker, one pair at a time. The page stays responsive, and the button "Stop" ends the worker.

- **Compare all pairs:** pick one input, then the packers and the routers. All are on by default. The page draws each pair, with its verdict of the floor, its score, `joint.fill`, the pass-through count, the overflow and the time. The order is the order of the benchmark: the fewest misses, then the highest score.
- **Playground:** pick any packer and any router, and set each option. The page shows the config id of the joint config and the record of the pair.

The compare takes inputs of up to 100 boxes. The playground takes each input, and it shows a warning above 100 boxes.

### Where the lists come from

The Vite plugin `jointCatalog` makes the module `virtual:joint-catalog` at build time. A new strategy or option of an engine shows up after the next build, with no change of the site.

| List | Source |
|---|---|
| The packers | `strategies` and `composites` of `@mark1russell7/packing`. The bench entries are `PACK_ENTRIES` of `@layout-contract/joint`. Each other strategy gets one entry, marked "not in the bench". |
| The routers | `listStrategies(STRATEGIES, "router")` of `@mark1russell7/highways`, then `portfolio`. They are `ROUTERS` of the joint benchmark. |
| The options of a router | The field `schema` of each strategy, with `optionDefaults`. `portfolio` has no schema, so the site makes one from `PORTFOLIO_RULES`, `PORTFOLIO_CAPS`, `PORTFOLIO_KS_API` and `PORTFOLIO_HASHES`. |
| The options of a packer | The field `defaults` of each strategy. `packing` declares no schema, so the site makes a range from each default and tags it "site range". `PACK_EXTRAS` in `src/engines.ts` lists the options without a default. |
| The inputs | `jointCorpus("joint-v2")`. The build compares each hash with the committed manifest. |

The spaces come from `packSpace` and `routeSpace` when an engine exports them. Until then, the site makes the two spaces from the lists. The joint space is `productSpace(pack, route, "joint")`.

The test `src/completeness.test.ts` fails when a strategy, a router or an option has no place on the pages.

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

## The prediction for the joint compare and the playground

This prediction comes before the code of roadmap item L43. Before this prediction, we read the registries of the engines and timed 2 inputs in Node.

| Id | Confidence | Claim |
|---|---|---|
| J1 | 0.7 | The full compare of 130 pairs on a 100-box input of `joint-v2` finishes in less than 8 seconds in a desktop browser. |
| J2 | 0.5 | The new pages and their worker add less than 300 KB of JavaScript after gzip. |
| J3 | 0.9 | The joint runner operates in a browser bundle after one change: `runEnv` moves to a Node file. `packages/layout-contract` does not change. |
| J4 | 0.85 | The completeness test finds 3 strategies of `packing` that the bench does not use: `push`, `portfolio` and `aspect-fit`. It finds no such router. |
| J5 | 0.45 | The spaces that the site makes from the registries pass `checkSpace` at the first test run, with no fix. |
| J6 | 0.8 | Each declared option has a control. At least 85% of the controls set a value. The other controls show a fixed value, for example a function. |
| J7 | 0.6 | The records of the new pair-by-pair runner are the same as the records of `runInput`, so the parity tests pass with no change. |
| J8 | 0.4 | The CI of the pull request passes on the first push, with no fix commit. |

J2, J5 and J8 are the risky claims. The size of `highways` is the risk of J2: its build is 945 KB before minification. The special values of `highways` (for example `Infinity`) are the risk of J5.

### The local scores of the joint prediction

| Id | Score | Facts |
|---|---|---|
| J1 | open | The local checks start no browser. In Node, the built worker did 160 pairs on the preset "bundled" (100 boxes) in 7.7 seconds. The 130 bench pairs on a corpus input of 100 boxes took 2.4 seconds. |
| J2 | held (local) | After gzip, the worker is 143 KB, the catalog 16 KB, the compare page 4 KB and the playground 6 KB. A shared chunk is 21 KB. The total is less than 200 KB. |
| J3 | held | `runEnv` moved to `src/env.ts`. The new entry `@layout-contract/joint/browser` does not export it, `plan.ts` or `split.ts`. `packages/layout-contract` did not change. |
| J4 | held | The extra packers are `push`, `portfolio` and `aspect-fit(select)`. Each router of `highways` is a bench router. |
| J5 | held | The two spaces and the joint space passed `checkSpace` at the first probe, with no fix. |
| J6 | held | Each declared option has a control. 103 of the 117 controls set a value (88%): 101 params and the 2 controls of the wrapped strategy. 14 controls show a fixed value: a function, a list or an object. |
| J7 | held | The parity tests of `packages/joint` passed with no change. A new test compares `pairRuns` with `runInput`. |
| J8 | open | CI starts after the push. |
