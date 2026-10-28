# Portfolios

A portfolio starts a list of members on one input and keeps the output of the best member. `portfolio` of `layout-contract` makes one. `selectBest` is the pick rule. The bench and the runtime both use it.

## The pick rule

`selectBest` gets the candidates in a fixed order and a list of levels. Each level has an id, a direction and a `minEffect`.

1. Start with all the candidates.
2. For each level, find the best value of the candidates that stay in. The best value is the minimum for `lower` and the maximum for `higher`.
3. Keep each candidate that is not worse than the best value by `compareMeasure` with the spec of the level.
4. The winner is the first candidate, in the given order, that stays in after the last level.

`kept` has one list for each level: the ids that stay in after the level, in the given order. Without levels, the winner is the first candidate.

A missing value, a `NaN` and an infinite value cause a `RangeError`. The message names the candidate and the level.

### The reason for the rule

A scan that compares each candidate with the current winner is not transitive. The `minEffect` ties cause this problem, and the scan can drift away from the best value.

An example: the level "a" has the direction `lower` and the `minEffect` 0.005. The level "b" has the direction `higher`.

| Candidate | a | b |
|---|---|---|
| A | 0 | 1 |
| B | 0.004 | 2 |
| C | 0.008 | 3 |

- `selectBest` finds the best "a", 0. A and B are in the tie, and C is worse. On "b", B wins. `kept` is `[["A","B"],["B"]]`.
- A scan picks B over A, because "a" is a tie and B is better on "b". Then it picks C over B for the same reason. But A is better than C on "a".

## The levels of a portfolio

The level 0 is `hard`: the count of hard breaks, with the direction `lower` and the `minEffect` 0. The levels of the key follow in their order. Thus a member with a hard break does not win over a member with no hard break. The id `hard` is reserved for level 0.

## The members

- `members` is a list, or a function of the input that gives the list. A stage can use the function to close over its prepared tables.
- An empty list and two members with the same id cause a `RangeError`.
- The members start in the given order.
- A member that throws gets the status `error`. A member with a value that is not finite also gets the status `error`. A level or a hash that throws has the same effect. The member does not win.
- When each member has an error, `pick` throws the original error of the first member.

## The limits

- `maxMembers` is a whole number of 1 or more. Only the first `maxMembers` members start. The other members are cut. This cut is deterministic.
- `budgetMs` is a time limit of 0 or more milliseconds. The clock is `options.now`, or `performance.now` by default.
- The first member always starts. Before each other member, the portfolio reads the clock. When the time since the start is `budgetMs` or more, that member and all later members are cut.
- A member that starts always finishes. The time limit does not stop a member.

## The trace

`pick` gives the output of the winner, the id of the winner and a trace. The trace has these fields:

- `members`: one entry for each member, in order. A cut member is also in the list. An entry has the status `ran`, `cut` or `error`. A member with the status `ran` has its `values`, `ms` and `outputHash`. The option `hashes` "pick" removes most of the hashes (the section "The option `hashes`"). A member with an error has its `ms` and its `error` message.
- `winner` and `winnerIndex`: the id and the index of the winner.
- `kept`: the lists of `selectBest`. The first list is for the level `hard`.
- `cut`: the count of the cut members.
- `totalMs`, and `budgetMs` and `maxMembers` when they are set.
- `picked` and `deterministic` (the next sections).

## The first member is the base

The first member is the base of the shared guards of `docs/PROMOTION.md`. The other members are the candidates against it.

`picked` is `true` when the winner is not member 0, and the `outputHash` of the winner is different from the hash of member 0. When member 0 has an error, `picked` is `true` for each winner after member 0.

### The option `hashes`

The option `hashes` sets the members that get an output hash. The default `all` hashes each member with the status `ran`. Then a hash that throws gives the status `error` to the member, and the member does not win.

With `pick`, the members get no hash before `selectBest`. `selectBest` does not use the hashes, so the winner does not change. After the pick, the portfolio hashes member 0 and the winner, and only when the winner is not member 0. When member 0 has an error, `picked` is `true` and the portfolio hashes nothing.

Under `pick`, only the hashed members have an `outputHash` in the trace. A hash that throws makes `pick` throw a `RangeError` with the hash error as its `cause`. A different value of the option causes a `RangeError` when `portfolio` makes the portfolio.

Each portfolio has its own option. A nested portfolio does not get the option of its parent.

### `pickMoves`

A stage adds `pickMoves(trace)` to the moves of its record. It gives the move `pick`: 1 when `picked` is `true`, else 0. The record keeps it as the trace measure `move.pick`. Then `exercised({ moves })` tells that a portfolio has an effect, with no change.

## Determinism

`deterministic` is `false` only when the time limit cuts one member or more. Then a run on a slower or a faster computer can give a different pick. A cut by `maxMembers` keeps `deterministic` at `true`. A bench that compares records uses only the deterministic picks, or it sets no `budgetMs`.
