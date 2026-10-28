# The corpus checks

A corpus states claims about its inputs. `packing`, `highways` and the joint corpus of this repository use the same checks from `layout-contract`. Thus the three benchmarks refuse the same bad corpus.

Each check gives a list of `ClaimBreak`. An empty list tells that each claim is true. A break has these fields:

| Field | Value |
|---|---|
| `claim` | The name of the claim, for example `declared` or `split`. |
| `detail` | The text of the problem. |
| `inputs` | The ids of the inputs that break the claim. The list is empty when no input is the cause. |

## The declared properties

The field `claims.declared` of a manifest gives the count of the inputs for each declared property. A property is a feature of an input that a selector reads. An example is a container with the field `aspect`.

```json
{ "claims": { "declared": { "minCount": 10, "thin": ["shaped"], "counts": { "order": 40, "aspect": 12, "shaped": 3 } } } }
```

- `declaredClaimOf(manifest)` reads the claim. A manifest without it gives `undefined`. A claim that is not whole causes an `Error`.
- The hook `declares(input)` gives the ids of the properties of one input. Each benchmark has its own hook.
- `declaredCounts(inputs, declares, ids)` counts the inputs of each id. Each id of `ids` gets a count, also the count 0.
- `checkDeclared(inputs, declares, claim, ids)` gives one break `declared` for each problem. The default of `ids` is the ids of `claim.counts`.

`checkDeclared` finds these problems:

1. An id of `ids` has no count, or its count is not the count of the inputs.
2. `claim.counts` has an id that is not in `ids`.
3. An id has fewer inputs than `minCount`, and `thin` does not have it.
4. `thin` has an id that is not in `ids`.
5. The hook gives an id that is not in `ids`.

The text of each problem is the text of the claim check of the benchmark of `packing`. Thus `packing` can join the texts and keep its error message.

## The corpus hash

`corpusHashOf(corpus, inputs)` gives the hash of a corpus. It is the SHA-256 of `canonicalJson({ corpus, inputs })`, cut to the first 16 hex characters. Each input is the pair `[id, hash]`, in the order of the manifest.

A change of one input id, one input hash or the order changes the corpus hash. The hash is equal to the corpus hash of `packing`.

The test of the contract pins one value. The corpus `t` with the inputs `t/a/s1`, `t/a/s2` and `t/a/s3`, and the hashes `h1`, `h2` and `h3`, gives `85baebbf77017041`. `packing` and `highways` pin the same value.

## The split files

A split file divides the seeds of a corpus into folds. Each fold has training seeds and held-out seeds. A selector learns on the training seeds and gets its score on the held-out seeds.

The file is beside the corpus, so the corpus does not change. Its name is `<corpus id>.<corpus hash>.json` (`splitFileName`). A change of the inputs thus needs a new split file.

```json
{
  "schema": "corpus-split/1",
  "corpus": "joint-v2",
  "corpusHash": "1d0909caec40631e",
  "splits": { "default": { "folds": [{ "train": [2, 3], "heldOut": [1] }] } }
}
```

`checkSplit(split, corpus, name)` gives one break `split` for each problem:

- The schema is not `corpus-split/1`, or the corpus is not the id of the manifest.
- `corpusHash` is not `corpusHashOf` of the manifest.
- `splits` is not an object, or a split has no folds.
- A fold has an empty `train` or an empty `heldOut`.
- A seed is in `train` and also in `heldOut`.
- A seed is not a seed of a spec of the manifest.
- With `name`, the file has no split of that name.

`splitFolds(split, corpus, name, where)` gives a copy of the folds of one split. It throws an `Error` for each problem of `checkSplit`. Then it throws for an unknown split name. `where` names the file in the message. The messages are the messages of `loadSplit` of `packing`.

`leaveOneSeedOut(seeds)` gives one fold for each seed. The fold holds out that seed and trains on the other seeds.

## The joint corpus

- `checkCorpus` of `packages/joint` gives the type `ClaimBreak` of the contract. Its claims and their results do not change.
- `minPerKind` counts the inputs of each board kind with `declaredCounts`. Its rule is stricter than `checkDeclared`: a kind in the list `thin` must also be thin. Thus it keeps its own check.
- `packages/joint/corpus/splits` has a split file for `joint-v1` and for `joint-v2`. Each split `default` has 3 folds, and each fold holds out one seed.
- The analysis reads the folds of the greedy portfolios from the split `default`. The folds are the folds of leave-one-seed-out, so the report does not change.
