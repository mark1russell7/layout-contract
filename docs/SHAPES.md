# The shape kinds (L46)

The packer of `packing` packs only rectangles today. Later strategies pack other shapes. Thus the shape kind of an item is a dimension of the contract.

## The prediction

The prediction comes before the code. The section "The score" gives the result.

| # | Claim | Confidence |
|---|---|---|
| P1 | No input hash, record hash or `configId` pin changes. Each test of 0.2.12 passes without a change. | 0.85 |
| P2 | 7 of the 9 joint measures work on a convex polygon with only its bounding box. Only `joint.fill` and `joint.straight.length` need the area of the shape. | 0.5 |
| P3 | 2 of the 4 hard rules of a pack (`locked-kept` and `complete`) support each kind. `no-overlap` and `in-container` stay on `rect`. | 0.7 |
| P4 | The API report gets fewer than 25 new lines, and it loses no line. | 0.4 |
| P5 | The change needs no edit of `corpus.ts`, `edges.ts` or `packages/joint`. | 0.85 |
| P6 | The shape filter adds fewer than 60 lines to `strategy-space.ts`. | 0.45 |
