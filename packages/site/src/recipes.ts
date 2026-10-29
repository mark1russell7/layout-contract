// The starting points of the playground: a pack and a router with their options, or a named pair of the benchmark. The data comes from the measures of the docs.
import type { FormState } from "./form.ts";

/** One starting point of the playground. */
export interface Recipe {
  readonly id: string;
  readonly title: string;
  /** One line about the recipe and its source. */
  readonly about: string;
  /** A named pair of the joint space. The recipe then uses its pack, router and joint option. */
  readonly pair?: string;
  readonly pack?: FormState;
  readonly route?: FormState;
}

const SELECT: FormState = { option: "select", params: {} };

/** The starting points, in the order of the page. The first recipe is the default of the page. */
export const RECIPES: readonly Recipe[] = Object.freeze([
  { id: "incumbent", title: "Benchmark winner", about: "The best pair of the night sweep: `maxrects-cp`, `corners`, and the lanes on the sides.", pair: "lanes-sides.maxrects-cp.corners+corners" },
  { id: "growth", title: "Growth bundles", about: "`w3b:growth-s0.3`: the best single highway strategy of the portfolio study, over all the collections.", pack: SELECT, route: { option: "w3b:growth-s0.3", params: {} } },
  { id: "portfolio-3", title: "Portfolio of 3", about: "The portfolio with the rule `all`, the cap 1.5 and 3 members: forms of `growth` and `mlseb`. It is slow on large inputs.", pack: SELECT, route: { option: "portfolio", params: { rule: "all", cap: 1.5, k: 3 } } },
  { id: "portfolio-5", title: "Portfolio of 5", about: "The same portfolio with 5 members. It keeps more of the gain of the oracle, and it takes more time.", pack: SELECT, route: { option: "portfolio", params: { rule: "all", cap: 1.5, k: 5 } } },
  { id: "zipper", title: "Zipper, fast", about: "`w2b:zipper-a1`: the best single strategy of the screen inputs. It is fast.", pack: SELECT, route: { option: "w2b:zipper-a1", params: {} } },
  { id: "fdeb", title: "Force bundles", about: "`fdeb`: force-directed edge bundling. The edges pull together into smooth bundles. The boxes stay where the packer puts them.", pack: SELECT, route: { option: "fdeb", params: {} } },
]);
