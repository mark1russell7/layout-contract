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

### Deterministic defaults

A default is deterministic. A portfolio limits its work by the member count and the input size, not by the wall time. A time budget is only an opt-in ceiling. A cut by the budget makes the output depend on the speed of the machine, so the record is not deterministic.

### A bound by count

On mixed sizes, a lower bound by count is weak. It drops the largest items first, but a packer leaves out many small items. On the screen 3 of packing, the count bound was 1.5% of the overflow count. The area bound was 42% to 62% of the overflow area. Judge an overflow by the area excess (`pack.overflow.excessArea`), not by the count excess.

The `pack` step ranks its strategies in each cell in two levels. In a cell with a free size, the area excess is 0, thus `pack.fill` decides.

1. Rank by the area excess, with its `minEffect`.
2. Compare `pack.fill` only between the strategies with a tie on the area excess. Use only the inputs that each compared strategy packs with no overflow. A cell is "thin" when these shared inputs are less than 30% of the cell.
