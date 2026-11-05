# The strategy catalog

The schema `strategy-catalog/2` gives each strategy and each option of one engine as JSON. It adds the field `output` to the schema `strategy-catalog/1`. A chooser renders it with no code for each strategy. The module `strategy-catalog.ts` of `layout-contract` has the format, the parser, the writer and the check. The module `strategy-options.ts` has the declarations of the options.

## The file

Each engine exports the file `./strategy-catalog.json` at a package path. The file is the main form, because a reader of the catalog does not run engine code. The engine also exports the same data as a constant `strategyCatalog`, at its root or at a subpath. A subpath keeps the declarations out of the root bundle.

```json
{
  "schema": "strategy-catalog/1",
  "engine": "packing",
  "version": "0.7.0",
  "strategies": []
}
```

- `engine` is the npm name without its scope. `version` is the npm version of the engine.
- The constant holds no version. The build gives the version from `package.json` to `writeStrategyCatalog(source, version)`.
- The file has no time, commit or run stamp. The same source and version give the same bytes.
- The strategies are sorted by `key`. The options keep the order of the schema, because a form shows them in that order.
- `parseStrategyCatalog` refuses each unknown field. A new field is a new version of the schema.
- `parseStrategyCatalog` reads the two schemas, and it refuses `output` in a file of the schema 1. So a file of the schema 1 stays valid, and each engine moves at its own time.
- `writeStrategyCatalog` writes the oldest schema that holds the file. A catalog with no `output` keeps the schema 1 and its bytes. A reader with an older contract refuses a file of the schema 2.
- An engine test fails if the file differs from the writer output, or if `version` differs from `package.json`.

## The entry

| Field | Rule |
| --- | --- |
| `key` | Unique in the catalog: `<step>/<id>` with a step, else `id`. Two steps of an engine can have the same `id`. |
| `id` | The name that the engine reads. |
| `step` | Optional: the step of the pipeline of the engine. |
| `family` | The group in a chooser. An engine without groups gives the step. |
| `kind` | `single`, `composite` or `shape`. |
| `describe` | One line for a chooser. |
| `supports` | The values that the strategy takes, by dimension. A dimension that is not here has no declared limit, so a chooser offers the strategy. A `SupportProbe` makes this a tested claim: an entry that refuses the value must list the dimension. |
| `limits` | The limits on the measures of the input, by measure. An empty record means that the engine declares no limit. |
| `deterministic` | A claim for the default options: the result depends only on the input, the options and the seed. It has no unknown value. |
| `determinismNote` | Optional: one sentence on what can change the claim, for example a clock. |
| `optIn` | `true` when the strategy is outside the default set of the engine, and a caller asks for it by name. |
| `baseline` | Optional, and only the value `true`: the strategy is a baseline of a bench, and a screen compares with it. It has `optIn: true`, and a chooser does not offer it. |
| `output` | Optional, in the schema 2: the reads of the output of the strategy, as rows. Each pair of `property` and `optionSet` has one row. |
| `options` | The declarations. |

The entry has no `defaults` field, because two places can disagree. The default is on the declaration, and `catalogDefaults(entry)` gives the record.

A limit has the form `{ "max": 10000, "describe": "..." }`, under the name of the measure, for example `nodes`. It has `min`, `max` or both.

### Who owns the positions of the nodes

`supports` has the dimension `nodePositions` (`NODE_POSITIONS_DIMENSION`) for a strategy that takes nodes. The value `host` means that the strategy keeps the positions of the host. The value `engine` means that the strategy can set them. A strategy that moves nodes has only `engine`, and a host that owns the positions does not offer it. A `SupportProbe` tests the claim with a run.

The claim is for the default options, as `deterministic` is, so an entry has one value here. An option of the type `strategy` can change the answer. The chosen entry has its own claim, so a host that owns the positions also leaves out those choices.

### The output of a strategy

A row of `output` tells what one read of the results of the strategy found. The strategy states no promise beyond the evidence of the row. A row on the default options does not tell about other options.

| Field | Rule |
| --- | --- |
| `property` | The property, as an open text. `position-grid` is for the positions and `size-grid` is for the sizes: the class tells if they are whole numbers. |
| `class` | The class. For the two grid properties, it is `whole`, `near-whole`, `fractional` or `untested`. For another property, it is a text. |
| `evidence.inputs` | The count of inputs that the strategy packed in this read. |
| `evidence.fractionalInputs` | The count of inputs with a fractional value. A grid property must have this field. |
| `evidence.nearWholeInputs` | The count of inputs with a near-whole value and no fractional value. A grid property must have this field. |
| `evidence.source` | The input family or the study of the read. |
| `evidence.optionSet` | The name of the options of the read, for example `default`. |
| `evidence.catalogVersion` | The version of the catalog that the read used. |

A value is near-whole when it is at most `OUTPUT_NEAR_WHOLE` (1e-9) from a whole number and is not whole. A value at a larger distance is fractional.

For a grid property, the parser refuses a class that the counts do not give. `outputGridClass` has this rule:

1. One fractional input gives `fractional` at any count, because one counterexample is a proof.
2. With no fraction, fewer than `OUTPUT_CLASS_MIN_INPUTS` (30) inputs give `untested`. The row keeps the count.
3. With no fraction and at least 30 inputs, a near-whole input gives `near-whole`. Otherwise the class is `whole`.

The class `whole` tells what the read found, and it does not mean always whole. This bound is on the share of inputs with a fraction. With no fraction in 30 inputs, the rule of three gives approximately 10 % at 95 %. A larger count in `evidence.inputs` gives a smaller bound.

A new property needs no new schema. The parser examines only the form of its row.

## The declaration

| `type` | Fields |
| --- | --- |
| `number`, `integer` | `min`, `max`, `step`, `scale`, `special`, `marks`, `values` |
| `boolean` | no other fields |
| `enum` | `values`, `custom` |
| `strategy` | `step`, `kinds`, `optionsKey`, `inlineOptions`, `optIn`, `needs` |
| `list` | `of`, `min`, `max` |
| `object` | no other fields |
| `function` | no other fields, and a form cannot set it from JSON |

Each declaration has `describe`, and exactly one of `default` and `noDefault`. It can have `when`, with the form of `ParamWhen`: an earlier option of the same strategy, and the values that make this option active.

### An option without a default

```json
"noDefault": { "reason": "unset", "describe": "Without this option, the router uses the whole board." }
```

| `reason` | Meaning |
| --- | --- |
| `unset` | The absence is a valid state. `describe` tells what the engine does. |
| `required` | The caller sets it. The engine has no value. |
| `derived` | The engine calculates it from the input. |
| `function` | The default is code. |

### Infinity

JSON has no form for `Infinity`, and `JSON.stringify(Infinity)` gives `null` with no error.

- In a `number` or `integer` declaration, `default`, `special` and `marks` hold the strings `"Infinity"` and `"-Infinity"`. The writer writes them, and the parser restores the numbers.
- The writer refuses `NaN`, a function and each other number that is not finite.
- A reader stores the JSON form. `decodeOptionValue(value, declaration)` gives the value for the call to the engine, so no reader keeps a copy of this rule. `encodeOptionValue` is its inverse.

### An option that names a strategy

```json
"strategy": { "type": "strategy", "describe": "The inner strategy.", "kinds": ["single", "shape"], "optionsKey": "options", "default": "maxrects" },
"options": { "type": "object", "describe": "The options of the inner strategy.", "default": {} }
```

- The value is the `key` of an entry of the same catalog. A reference does not go to another engine.
- `step`, `kinds` and `optIn` limit the choice. `optIn: false` leaves out the opt-in strategies, for an engine that finds a member only in its default set. `catalogChoices(strategies, declaration)` gives the strategies that an option offers, so no chooser keeps a copy of this rule. It does not give a baseline. Without a declaration, it gives each strategy that a chooser offers.
- `needs` gives a value that a chosen strategy must take, by dimension of `supports`. An example is `{ "obstacleMove": "fixed" }`, for a strategy that packs around locked items. A strategy that does not list the dimension has no declared limit, so the option offers it.
- `optionsKey` names the option that holds the options of the chosen strategy. A form renders that option from the chosen entry.
- `inlineOptions: true` is the other form: the value holds its options. The value is a key or an object `{ "strategy": "maxrects", "options": { "rule": "bl" }, "id": "maxrects-bl" }`, and `options` and `id` are optional. The options of the value have the JSON form of the declarations of the chosen entry. A declaration does not have both forms.
- A list of members is a `list` with `of`: `{ "type": "list", "of": { "type": "strategy", "kinds": ["single"], "inlineOptions": true }, "min": 2, "max": 8 }`. An item has no sibling option, so `of` does not have `optionsKey`.

## The check of an engine

`checkCatalog(source, registry, options)` has one set of rules for each engine. Its result has `faults`, `notRun`, `notMatched` and `spaceOnly`. A good catalog has no fault, and a test states the three counts.

1. Each key of the live defaults has a declaration.
2. Each declaration has a `default` or a `noDefault`.
3. `catalogDefaults` equals the live defaults, apart from functions and strategy objects.
4. The catalog equals the registry plus the stated opt-in list, and each `optIn` agrees.
5. A round trip through JSON gives the same bytes.
6. `limits` equals the limits in the code.
7. Each entry with `deterministic: true` runs two times on a fixture, with the same output bytes. An entry that cannot run goes to `notRun`, by name. The output of the fixture holds no times.
8. Each `SupportProbe` runs each entry. The refusal and `supports` agree. A probe on a dimension that an entry does not list expects the engine to take the value, so a refusal is a fault.
9. Each param of a space is inside the declaration of its option, through its route. A stage option or a param without a match or a route goes to `notMatched`.
10. With `refusesChoice`, each strategy that an option offers runs as the value of that option. A refusal is a fault, because a chooser offers only what works.

### The routes of a space

A param of a space can hold another form of the value of its option. The option `paramRoutes` of the check states the route, because the route is engine code and the file does not hold code. The key is `<stage>/<option>.<param>`, or `<stage>/<option>` for a stage option.

| Route | Meaning |
| --- | --- |
| `{ "value": toOption }` | The check examines `toOption(value)` against the declaration. The result `undefined` means that this value sets no option. |
| `{ "option": "name" }` | The option has another name. A route can also have `value`. |
| `{ "spaceOnly": "reason" }` | The place sets no option. The place goes to `spaceOnly`, with its reason. |

A route that matches nothing is a fault, and so is a route that names an absent option. A `spaceOnly` route on a param that is an option is also a fault. Thus each route stays true when the space changes.

## The relation to the strategy space

The two formats have two jobs. A space (`docs/STRATEGY-SPACE.md`) holds what a search can enumerate. A catalog holds all that a person can set, also functions, objects and lists. Rule 9 keeps the two in step.

## The options module

`strategy-options.ts` holds the declarations and their functions: `listOptions`, `optionDefaults`, `checkOptions`, `clampOptions`, `sweepValues`, `sweepOf`, `sweepGrid` and `checkSchema`. They take a `DeclaredStrategy`, with `name`, `defaults` and `schema`. An engine with its own type of step uses the type parameter `S` of `OptionSchema`.
