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

The package is not on npm.
