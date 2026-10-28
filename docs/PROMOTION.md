# Promotion guards

These guards are the same in `layout-contract`, `packing` and `highways`.

### Activation

A candidate is "exercised" on an input when one of these conditions is true:

- Its own move count is more than 0. The record keeps the count as the trace measure `move.<name>`.
- It has a base, and its `outputHash` on the input is different from the `outputHash` of the base.

The base of an option is the same strategy without the option. The base of a highway finder is the same step with no highway. A packing strategy of the zoo has no base.

A verdict counts only when the candidate is exercised on one or more decision inputs. Otherwise the verdict is `not-exercised`, with a reason. The idea then goes back to be built again. It does not go to dropped.

### Distinctness

Candidates with the same `outputHash` on each decision input make one "output group". The group id is the first candidate id in sort order. A group counts as one candidate in the counts of a wave and of a portfolio. The verdict of the group applies to each member.

A "cell group" has the same `outputHash` on each input of one cell. Only a selector rule uses a cell group: in that cell, its members are one option. The screen shows the cell groups as diagnostics.

### The output hash

The `outputHash` of a record is the first 16 hexadecimal digits of the SHA-256 of the canonical JSON of the output. `outputHash` of layout-contract calculates it. Each stage sets the canonical form of its output:

- highways rounds each number to the grid of `RECORD_EPS`, and changes -0 to 0. Two code paths can give the same routes with different float noise.
- packing rounds each number of the placements to the grid of `RECORD_EPS` (3 decimals), and changes -0 to 0. It sorts the placements by id.
- The joint runner of layout-contract hashes the list of 2 hashes: the `outputHash` of the pack, then the `outputHash` of the routes. Each part uses the form of its stage.

Groups compare hashes only in one stage. A number near a rounding boundary can split a group, and then a real copy counts two times. Two outputs with the same rounded hash have each number in one grid step of the other.
