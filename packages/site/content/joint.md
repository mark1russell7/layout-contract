The joint benchmark packs each input with a packer of `packing`, and then routes the edges with a router of `highways`. A **pair** is one packer and one router. CI starts the benchmark of each pair on each input.

- **Miss:** the pair is below the floor of an input. The floor is the set of the best pairs on that input after the hard rules and the overflow. Fewer misses is better.
- **Score:** the fill of the pair on an input when the pair is on the floor, and 0 for a miss. The page gives the mean over the inputs.
- **Oracle:** a pick of the best pair for each input. No single pair can do better. The **gain** is the oracle score minus the score of the best single pair.
- **Share:** the part of the oracle gain that a greedy portfolio of k pairs gets on the held-out seeds.
- **Interval:** the numbers in brackets are a 95% interval. The word "open" tells that the interval holds 0.
- **Cell:** one rule and one cap of the router `portfolio`. The cap is the largest stretch of a route. The headline cell has the rule `all` and the cap 1.25.
- **Stress inputs:** inputs with no margin and no gap between the boxes. The headline numbers do not use them.
