# The joint corpus

This private package makes the joint corpus `joint-v1`: inputs with boxes and edges, but no positions. The packer places the boxes, and then the router routes the edges.

- The generators of `@mark1russell7/packing` give the base inputs. `edgeStep` of `@mark1russell7/layout-contract` adds the edges, the groups and the ports.
- `jointCorpus()` gives the manifest and the input files. The same versions of the packages give the same files, byte for byte.
- `coverage()` gives the pairs of values of a set of cells, the pairs that the cells cover and the share.
- `pairwise()` gives a pairwise covering array with a greedy algorithm and a seed.
- The manifest is `corpus/joint-v1/corpus.json`. The test compares it with the corpus.

The rules of the corpus are in `docs/JOINT-CORPUS.md` of this repository.

## Write the manifest again

After a change of the corpus, write the manifest again and commit it:

```sh
pnpm --filter @layout-contract/joint corpus
```

## The joint benchmark

The package also holds the joint runner and its analysis. `docs/JOINT-BENCH.md` of this repository tells the rules.

- `runInput()` packs an input with each pack entry and routes it with each router. It gives one record for each pair.
- `analyze()` gives the report: the pack ranking, the best pair, the oracle and the greedy portfolios of each cell.
- The workflow `joint-bench.yml` runs the benchmark in CI. Do not run it on a local computer, because it measures times.

The script `scripts/bench.mjs` has the commands `run` and `analyze`:

```sh
node scripts/bench.mjs run --shards 48 --shard 0 --out records
node scripts/bench.mjs analyze --records records --out report
```

The package is not on npm.
