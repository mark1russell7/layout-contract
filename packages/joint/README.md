# The joint corpus

This private package makes the joint corpora `joint-v1` and `joint-v2`: inputs with boxes and edges, but no positions. The packer places the boxes, and then the router routes the edges.

- The generators of `@mark1russell7/packing` give the base inputs. `edgeStep` of `@mark1russell7/layout-contract` adds the edges, the groups and the ports.
- `jointCorpus(set)` gives the manifest and the input files. The same versions of the packages give the same files, byte for byte.
- `spacingStep()` sets the margins and the gap of an input for the dimension `spacing` of `joint-v2`.
- `checkCorpus()` examines the claims of a manifest against its input files.
- `coverage()` gives the pairs of values of a set of cells, the pairs that the cells cover and the share.
- `pairwise()` gives a pairwise covering array with a greedy algorithm and a seed.
- The manifests are `corpus/joint-v1/corpus.json` and `corpus/joint-v2/corpus.json`. The tests compare them with the corpora.

The rules of the corpus are in `docs/JOINT-CORPUS.md` of this repository.

## Write the manifest again

After a change of the corpus, write the manifest again and commit it:

```sh
pnpm --filter @layout-contract/joint corpus
```

## The joint benchmark

The package also holds the joint runner and its analysis. `docs/JOINT-BENCH.md` of this repository tells the rules.

The package also holds the nightly sweep over the joint strategy space: the space, the sampler, the planner and the race. `docs/SWEEP.md` tells the sweep.

- `runInput()` packs an input with each pack entry and routes it with each router. It gives one record for each pair.
- `analyze()` gives the report: the pack ranking, the best pair, the oracle and the greedy portfolios of each cell.
- The workflow `joint-bench.yml` runs the benchmark in CI. Do not run it on a local computer, because it measures times.

The script `scripts/bench.mjs` has the commands `check`, `smoke`, `plan`, `run` and `analyze`. The option `--corpus` selects the corpus, with the default `joint-v2`:

```sh
node scripts/bench.mjs check --corpus joint-v2
node scripts/bench.mjs smoke --corpus joint-v2
node scripts/bench.mjs plan --shards 64
node scripts/bench.mjs run --shards 64 --shard 0 --out records
node scripts/bench.mjs analyze --records records --out report --subset data/joint-v2-recorded.txt
```

`analyze` fails when an input of the manifest has no records. The option `--allow-missing <file>` lists the inputs that can have no records.

`plan` and `run` give the inputs to the shards by the cost model `data/cost-margins.json`. The script `scripts/fit-cost.mjs` writes this file from the logs of the shard jobs of a full run:

```sh
node scripts/fit-cost.mjs --logs <dir> --run <run id> --commit <sha>
```

The package is not on npm.
