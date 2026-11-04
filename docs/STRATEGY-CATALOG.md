# The strategy catalog

The schema `strategy-catalog/1` gives each strategy and each option of one engine as JSON. A chooser renders it with no code for each strategy. The module `strategy-catalog.ts` of `layout-contract` has the format, the parser, the writer and the check. The module `strategy-options.ts` has the declarations of the options.

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
| `options` | The declarations. |

The entry has no `defaults` field, because two places can disagree. The default is on the declaration, and `catalogDefaults(entry)` gives the record.

A limit has the form `{ "max": 10000, "describe": "..." }`, under the name of the measure, for example `nodes`. It has `min`, `max` or both.

### Who owns the positions of the nodes

`supports` has the dimension `nodePositions` (`NODE_POSITIONS_DIMENSION`) for a strategy that takes nodes. The value `host` means that the strategy keeps the positions of the host. The value `engine` means that the strategy can set them. A strategy that moves nodes has only `engine`, and a host that owns the positions does not offer it. A `SupportProbe` tests the claim with a run.

The claim is for the default options, as `deterministic` is, so an entry has one value here. An option of the type `strategy` can change the answer. The chosen entry has its own claim, so a host that owns the positions also leaves out those choices.

## The declaration

| `type` | Fields |
| --- | --- |
| `number`, `integer` | `min`, `max`, `step`, `scale`, `special`, `marks`, `values` |
| `boolean` | no other fields |
| `enum` | `values`, `custom` |
| `strategy` | `step`, `kinds`, `optionsKey`, `inlineOptions`, `optIn` |
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
- `optionsKey` names the option that holds the options of the chosen strategy. A form renders that option from the chosen entry.
- `inlineOptions: true` is the other form: the value holds its options. The value is a key or an object `{ "strategy": "maxrects", "options": { "rule": "bl" }, "id": "maxrects-bl" }`, and `options` and `id` are optional. The options of the value have the JSON form of the declarations of the chosen entry. A declaration does not have both forms.
- A list of members is a `list` with `of`: `{ "type": "list", "of": { "type": "strategy", "kinds": ["single"], "inlineOptions": true }, "min": 2, "max": 8 }`. An item has no sibling option, so `of` does not have `optionsKey`.

## The check of an engine

`checkCatalog(source, registry, options)` has one set of rules for each engine. Its result has `faults`, `notRun` and `notMatched`. A good catalog has no fault, and a test states the two counts.

1. Each key of the live defaults has a declaration.
2. Each declaration has a `default` or a `noDefault`.
3. `catalogDefaults` equals the live defaults, apart from functions and strategy objects.
4. The catalog equals the registry plus the stated opt-in list, and each `optIn` agrees.
5. A round trip through JSON gives the same bytes.
6. `limits` equals the limits in the code.
7. Each entry with `deterministic: true` runs two times on a fixture, with the same output bytes. An entry that cannot run goes to `notRun`, by name. The output of the fixture holds no times.
8. Each `SupportProbe` runs each entry. The refusal and `supports` agree. A probe on a dimension that an entry does not list expects the engine to take the value, so a refusal is a fault.
9. Each param of a space is inside the declaration of its option. A stage option or a param without a match goes to `notMatched`.
10. With `refusesChoice`, each strategy that an option offers runs as the value of that option. A refusal is a fault, because a chooser offers only what works.

## The relation to the strategy space

The two formats have two jobs. A space (`docs/STRATEGY-SPACE.md`) holds what a search can enumerate. A catalog holds all that a person can set, also functions, objects and lists. Rule 9 keeps the two in step.

## The options module

`strategy-options.ts` holds the declarations and their functions: `listOptions`, `optionDefaults`, `checkOptions`, `clampOptions`, `sweepValues`, `sweepOf`, `sweepGrid` and `checkSchema`. They take a `DeclaredStrategy`, with `name`, `defaults` and `schema`. An engine with its own type of step uses the type parameter `S` of `OptionSchema`.
