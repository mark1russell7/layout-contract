// The memory gate of roadmap item L81. The probe runs the largest input of each family of the corpus, and the gate examines the peak RSS of each probe.
// The bench gives the list of the inputs, so the gate cannot leave out a family.

/** One input of the corpus with its planned cost (`plannedCost`). */
export interface CostedInput {
  readonly id: string;
  readonly cost: number;
}

/** The limit of the gate in MB: the target of L77, a peak RSS of less than 3 GB on each input. */
export const MEMORY_GATE_MB = 3072;

/** This function gives the family of an input id: the id without its seed. For example, `joint-v2/cards.x/s2` gives `joint-v2/cards.x`. */
export function familyOf(id: string): string {
  return id.replace(/\/s\d+$/, "");
}

/**
 * This function gives the probe group of each family: each input with the largest planned cost of the family, in the order of the families.
 * The seeds of a family often have the same cost. Then the group has each of these seeds, because the peak of a seed can be 25% above the peak of seed 1.
 */
export function familyProbeGroups(inputs: readonly CostedInput[]): string[][] {
  const best = new Map<string, { cost: number; ids: string[] }>();
  for (const input of inputs) {
    const family = familyOf(input.id);
    const old = best.get(family);
    if (old === undefined || input.cost > old.cost) best.set(family, { cost: input.cost, ids: [input.id] });
    else if (input.cost === old.cost) old.ids.push(input.id);
  }
  return [...best.values()].map((group) => group.ids);
}

/** The result of the probe of one input in one heap mode. The peak is `undefined` when the probe wrote no facts, for example after an OOM. */
export interface ProbeResult {
  readonly input: string;
  readonly mode: string;
  readonly status: number;
  readonly peakRssMb: number | undefined;
}

/** One row of the gate: one input in one mode. The field `reason` tells why the row fails, and it is empty when the row passes. */
export interface GateRow {
  readonly family: string;
  readonly input: string;
  readonly mode: string;
  readonly status: number | undefined;
  readonly peakRssMb: number | undefined;
  readonly reason: string;
}

/** The result of the gate. It passes when each row passes. */
export interface GateResult {
  readonly pass: boolean;
  readonly limitMb: number;
  readonly rows: readonly GateRow[];
}

/**
 * This function examines the probes for each expected input in each mode. A row fails in these conditions:
 *
 * - The input has no probe in the mode.
 * - The status is not 0. The status 134 is an OOM of V8.
 * - The probe has no peak, or the peak is the limit or more.
 *
 * The gate also fails when it has no rows: no expected input or no mode.
 *
 * The rows with the largest peaks come first, and the rows without a peak come before them.
 */
export function memoryGate(expected: readonly string[], modes: readonly string[], results: readonly ProbeResult[], limitMb: number = MEMORY_GATE_MB): GateResult {
  const byKey = new Map(results.map((r) => [`${r.mode}|${r.input}`, r]));
  const rows: GateRow[] = [];
  for (const mode of modes)
    for (const input of expected) {
      const r = byKey.get(`${mode}|${input}`);
      const reason =
        r === undefined ? "no probe" : r.status === 134 ? "OOM (status 134)" : r.status !== 0 ? `status ${r.status}` : r.peakRssMb === undefined ? "no peak" : r.peakRssMb >= limitMb ? `peak ${r.peakRssMb} MB, limit ${limitMb} MB` : "";
      rows.push({ family: familyOf(input), input, mode, status: r?.status, peakRssMb: r?.peakRssMb, reason });
    }
  rows.sort((a, b) => (b.peakRssMb ?? Infinity) - (a.peakRssMb ?? Infinity));
  // A gate with no rows examined nothing, so it fails.
  return { pass: rows.length > 0 && rows.every((r) => r.reason === ""), limitMb, rows };
}

/** This function gives the gate as Markdown: the result, the count of the failed rows, and a table of all rows. */
export function gateMarkdown(gate: GateResult): string {
  const failed = gate.rows.filter((r) => r.reason !== "");
  return [
    `### Memory gate: ${gate.pass ? "pass" : "fail"}`,
    "",
    `The gate examined ${gate.rows.length} probes, with the limit ${gate.limitMb} MB. ${failed.length} failed.`,
    "",
    "| Input | Mode | Status | Peak RSS (MB) | Result |",
    "| --- | --- | --- | --- | --- |",
    ...gate.rows.map((r) => `| ${r.input} | ${r.mode} | ${r.status ?? ""} | ${r.peakRssMb ?? ""} | ${r.reason === "" ? "pass" : r.reason} |`),
  ].join("\n") + "\n";
}
