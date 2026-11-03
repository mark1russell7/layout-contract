Each night, the sweep fits a model that predicts the score of a config on an input. These two measures tell how good the model is:

- **Held-out skill:** the gain of the model over the mean score of each cell, on inputs that the fit did not see. The value 0 is the mean, and 1 is no error.
- **Covered cell:** a cell with 20 rows or more. The error of the model in it is at most 1.25 times the noise floor of the cell.

A cell is one router, one pack entry, one lane mode and one board kind. A change of the median skill below 0.01 in one week is a flat week, and a finding to explain.
