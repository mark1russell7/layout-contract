A strategy space describes the strategies of an engine as data. A sweep reads the space, and it makes configs from it. The schema is `strategy-space/1`, and `docs/STRATEGY-SPACE.md` tells the rules.

| Part | What it holds |
|---|---|
| Stage | One step of the pipeline of the engine. An optional stage can have no option. |
| Option | One implementation of a stage, with its params. A meta option chooses between whole configs. |
| Param | A value of an option: `int`, `real`, `enum` or `bool`, with a range, a step and a scale. |
| `when` | A condition: the param is active only for some values of an earlier param. |
| Constraint | A rule that keeps out a combination of options. |
| Named point | A named strategy of the engine, as a point of the space. Old records stay comparable through it. |
| `spaceSize` | The count of the grid points. The base count has no meta option. The meta count has them. |

Select an option to see its params. Select a named point to see its options and its `configId`. Change the levels to count the grid again.
