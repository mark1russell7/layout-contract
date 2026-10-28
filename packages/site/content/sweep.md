This section has no data yet. The roadmap items L35 and L36 fill it:

- **The nightly sweep:** each night, CI starts a sample of the joint strategy space. The sample comes from `enumerateSpace` of the packer space and the router space.
- **The coverage map:** the part of the space that the sweeps have examined, by stage and by option.
- **The Pareto fronts:** the configs that no other config beats on each measure.
- **The win regions:** the regions of the inputs where each config wins.

The site shows these maps when the first sweep result is in the repository.
