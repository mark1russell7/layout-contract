Pick one input. The page packs it with each packer, then routes the packed boxes with each router. Each card shows one pair, best first.

- A **pair** is one packer of `packing` and one router of `highways`.
- A **joint pair** packs, routes, then packs again with more space where the routes are crowded. Its tag names its variant, for example `lanes-sides`.
- A **hard break** is a broken rule that a layout must keep, for example two boxes that overlap.
- The **hard count** of a pair adds its hard breaks and its routes that are more than 1.25 times as long as a straight line.
- The **floor** is the lowest hard count of all the pairs on this input. A pair with a higher hard count **misses** the floor.
- The **score** is `joint.fill` of a pair that reaches the floor, else 0. `joint.fill` is the share of the area of the layout that the boxes fill.
- **pass-through** counts the routes that go through a box. The rule `route.no-pass-through` of `highways` finds them.
- **Overflow** counts the boxes that do not fit, and the edges that the router does not get because of them.

The order is the order of the benchmark: the fewest misses, then the highest score. Your browser does all the work in a background thread, so the page stays responsive.
