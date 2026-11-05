# The project site

The project site is at <https://mark1russell7.github.io/layout-contract/>. It has four sections:

1. **Joint benchmark:** the headline cell of the latest result, the misses by router and by packer, the ranked pairs, the baselines and the stress cell.
2. **Strategy space:** the schema `strategy-space/1`, and an interactive view of a space. Until an engine publishes its space, the view shows an example space.
3. **Sweep coverage and efficacy maps:** the trend of the space coverage, from the branch `sweep-data`. The efficacy maps of L35 and L36 come later.
4. **What's new:** a dated list of the work items, with their releases and pull requests.

Each section with data shows the date and the source of its data.

The navigation of each page links to the sites of [highways](https://mark1russell7.github.io/highways/) and [packing](https://mark1russell7.github.io/packing/). The two engine sites link back to this site.

- `ENGINE_SITES` in `packages/site/src/links.ts` holds the two addresses. No other file of the site holds them.
- Each page has the mark `<!-- engine-sites -->` in its navigation. The Vite plugin `engineSites` puts the links there, and a page without the mark stops the build.
- The test `src/links.test.ts` examines each page of the site.
- At phone width, the links of the navigation go onto a second row, so each link stays in view.

## How the site is built

- The package `packages/site` (`@layout-contract/site`) holds the site. It is a Vite site with TypeScript and no framework, from the preset `vite`.
- The workflow `.github/workflows/pages.yml` builds the site on each push to `main`. It uses `reusable-pages.yml` of the template (`CI.md`, section "Pages").
- The workflow sets `SITE_BASE` to `/layout-contract`. A local build uses the root `/`.
- The step `site-pages` of the shared workflow adds the Releases page (`releases/`), the Status page (`status/`), `data/releases.json` and `data/status.json`. Its inputs are `packages: "@mark1russell7/layout-contract"` and `site-name: layout-contract`.
- The repository has no `docs/ROADMAP.md`, so the input `roadmap` is empty. The Status page shows the open pull requests and the open issues.
- After the deployment, the job `served` of `pages.yml` reads the 4 paths from the public site. A missing path fails the job.
- The home page links to the Releases page and to the Status page. A local build does not have them.
- The build reads only the files in `packages/site/data`. The build does not download a CI artifact.
- The sweep section is the one exception. The page reads the branch `sweep-data` when it opens. The section "The sweep maps" tells how.
- The prose of the site is in `packages/site/content/*.md`. `pnpm lint:ste` examines it.

The data folder has these files:

| Path | Schema | What it holds |
|---|---|---|
| `data/joint/<run>.json` | `site-joint/1` | One result of the joint benchmark, from the `report.json` of the CI run `<run>`. |
| `data/spaces/<engine>.json` | `site-space/1` | The strategy space of an engine, with its source and its date. |
| `data/examples/<name>.json` | `site-space/1` | An example space. The site labels it as an example. |
| `data/news.json` | `site-news/1` | The news, from the newest item to the oldest. |
| `data/stamps.json` | `data-stamp/1` | The runs of each measured page, with their dates and engine versions, and a run in flight. |

The measure `engines-current` of `kpi.json` counts the engines of the newest run that have the newest stable version on npm. The measure `engine-releases-behind-<engine>` counts the stable versions after the run. The measure `engines-behind-unheld` counts the engines that are behind npm with no stated hold. A hold covers a gap only when the run used the version in the rule of `renovate.json`, and only up to its date. The page then reads "held to <date> by this row". A hold does not change `engines-current`. The build reads npm, and the daily build reads it again, so these numbers fall when an engine has a release. This limit is stricter than the freshness gate, on purpose. If npm does not answer, the file has no such measures, and each stamped page says that the gap is unknown. So the reading ages, and the KPI rules see it. A scheduled build stops when the last deploy also has no read of npm.

The measure `routers-on-compare` counts the routers with a row in the newest joint run. Each one is a router or highway entry of the registry of the pinned `highways`. A router in a list of the site with no row does not count, because a list is not a comparison. A row of a router outside the registry, for example a member form of the portfolio, does not count. The measure `routers-keyed` gives the count of these registry entries, so a reader sees the count beside its denominator. The other families of the registry are parts of a router, so neither measure counts them.

A run changes `data/stamps.json`. Set `inFlight` when a run starts on newer engines. Move the run to `runs` in the pull request of its data file. The build stops when the stamp does not agree with the newest joint run. The Pages workflow runs the freshness gate on this file at each build and each morning. The limits are 3 days of age, or a newer run in flight, and 1 minor version behind npm at the start of the run. A run in flight for more than 3 days fails the gate, so a resume run takes its place in `inFlight`.

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

3. Commit `packages/site/data/joint/<run>.json`. The site shows the newest result first, and a list gives the other results. Give `--cover on` for a cover run. The site marks that result and tells that its floors do not compare with older runs. Until a cover run is in `data/joint/`, each covered entry has the tag "waiting for the first cover run". The next build removes the tag when that file lands.

The script `scripts/joint-data.mjs` keeps the headline cell (the rule `all` with the cap 1.25) and the same cell on the stress inputs. It also keeps the 6 cells of the headline inputs and the predictions of the run. The corpus is `joint-v2` by default. The option `--corpus` changes it.

### The strategy space of an engine

Each engine of `ENGINE_SPACES` has a file `packages/site/data/spaces/<engine>.json` with the schema `site-space/1`. Run `pnpm --filter @layout-contract/site run data:spaces -- <YYYY-MM-DD>` to write these files from the installed engines. A test fails if a file is missing, or if its space is not the space that the engine publishes. Thus a new engine version with a new space needs this script.

```json
{ "schema": "site-space/1", "source": "packing 0.3.0", "date": "2026-11-02", "space": { "schema": "strategy-space/1", "engine": "pack", "version": "1", "stages": [] } }
```

The field `space` is the value of `packSpace` or `routeSpace`, as JSON. The site shows an engine space before the example.

### A news item

Add the item at the top of `items` in `packages/site/data/news.json`. Take the date and the pull request numbers from `git log` of `main`. Do not type a version in an item. The release page has the versions, from the changelog and the tags, and the data check refuses a typed version.

### The sweep maps

The section shows the trend of the space coverage (`docs/SWEEP.md`, "The trend"). The nightly sweep writes the data, so the site needs no commit for a new night.

- The page reads `index.json` of the branch `sweep-data` from `raw.githubusercontent.com`. This host sends `Access-Control-Allow-Origin: *`.
- Then it reads `epochs/<latest>/surrogate-trend.jsonl`. It keeps the records of the latest epoch with the variant `blocks`, one for each night, in night order.
- A night with two records keeps the later line. A line with bad JSON or a bad record does not stop the page. The page counts and skips it.
- `src/coverage.ts` holds the checks and the week view, with no DOM. `src/sweep.ts` reads the files and draws the section. `src/coverage.test.ts` examines both.
- The page shows a loading state first. A failed read shows the reason and a link to the branch.

The section shows these parts:

- The tiles of the latest night: the held-out median skill, the overfit gap, the covered share, λ, the rows and the configs. A λ at the edge of its list gets a mark.
- A chart of the held-out median skill of each night, with its band from q10 to q90, and the in-sample median as a second line.
- A chart of the guard lines: the covered cells, the cells with 20 rows or more and the cells with rows.
- A table of the numbers of each night, and the links to the file and to the CI run of the latest record.

The week view compares the latest record with the newest record of at least `WEEK_DAYS` (7) days before it. A change of the held-out median skill below `FLAT_WEEK` (0.01) in absolute value is a flat week. The page labels it "flat week: a finding to explain". With one record, the page tells that the trend starts with the next night.

The items L35 and L36 add the efficacy maps below the trend. Until then, that part shows no data.

## The joint pages

The site has two more pages: `compare.html` and `playground.html`. Both use the joint runner of the benchmark in a Web Worker, one pair at a time. The page stays responsive, and the button "Stop" ends the worker.

- **Compare all pairs:** pick one input, then the packers, the routers and the joint pairs. All are on by default. The page draws each pair, with its verdict of the floor, its score, `joint.fill`, the pass-through count, the overflow and the time. The order is the order of the benchmark: the fewest misses, then the highest score.
- **Playground:** pick any packer, any router and any joint option, and set each option. The page shows the config id of the joint config and the record of the pair.

A joint pair packs, routes, then packs again with more space for the lanes of the routes. The joint options are the stage `lanes.mode` of the joint space:

- `max` and `sides` are the lane pairs of L13. Their params are `passes`, `clearance`, `space` and `cap`.
- `iter` is the iteration of L11, with the param `rounds`.
- The option `none` of the playground sets no lane pass. It is not an option of the space, because the stage is optional.

The compare takes inputs of up to 100 boxes. The playground takes each input, and it shows a warning above 100 boxes.

### Where the lists come from

The Vite plugin `jointCatalog` makes the module `virtual:joint-catalog` at build time. A new strategy or option of an engine shows up after the next build, with no change of the site.

| List | Source |
|---|---|
| The packers | `strategies`, `composites` and `shapeStrategies` of `@mark1russell7/packing`. The entries are `PACK_ENTRIES` of `@layout-contract/joint`. Each other strategy gets one entry. |
| The routers | `listStrategies(STRATEGIES, "router")` of `@mark1russell7/highways`, the highway strategies of `HIGHWAY_ROUTERS`, then `portfolio`. They are `ROUTERS` of the joint benchmark. The list then has the open routers of `OPEN_ROUTERS`. The benchmark does not race those routers, and only the playground uses them. |
| The options of a router | The field `schema` of each strategy, with `optionDefaults`. `portfolio` has no schema, so the site makes one from `PORTFOLIO_RULES`, `PORTFOLIO_CAPS`, `PORTFOLIO_KS_API` and `PORTFOLIO_HASHES`. |
| The options of a packer | The field `defaults` of each strategy. `packing` declares no schema, so the site makes a range from each default and tags it "site range". `PACK_EXTRAS` in `src/engines.ts` lists the options without a default. |
| The joint pairs | `laneEntries()` and `iterEntries()` of `@layout-contract/joint`: 18 lane pairs and 18 iteration pairs. They are the named configs of `JOINT_SPACE` after the pairs of the product. |
| The joint options | `laneSpace()` of `@layout-contract/joint`. |
| The inputs | `jointCorpus("joint-v2")`. The build compares each hash with the committed manifest. |

The spaces come from `packSpace` and `routeSpace` when an engine exports them. Until then, the site makes the two spaces from the lists.

The joint space is `jointSpace(pack, route)` of `@layout-contract/joint`, the function that also makes `JOINT_SPACE`. Thus the site and the benchmark have one joint space. Its named pairs are each pack entry of the site with each router of `ROUTERS`, then the joint pairs. The playground gives the current counts.

The worker gives the joint pairs to `pairRuns` as `lanes` and `iterate`. For a lane choice of the playground, `configRun` gives the lane entry or the iteration entry.

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

## Read a live page

The workflow `page-read.yml` reads pages of the live site in a browser, so a reader does not use a local browser.

- Start it with `gh workflow run page-read.yml -R mark1russell7/layout-contract -f pages="index.html compare.html"`.
- The artifact `page-read` holds one full screenshot and one set of crops for each page, width and color scheme.
- Read the crops. A full screenshot of a long page scales down too far to read. A crop has the native scale and is at most 1,000 pixels tall.
- The name of a crop gives its page, width, scheme, section and number, for example `index-html-390-dark-spaces-01.png`.
- `tags.txt` gives the counts of the tags, the overflow, the errors and the crops of each read.
