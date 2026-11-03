// The joint pack entries as points of `packSpace` of `packing` (roadmap item L34). The joint space keeps its own pack part at this time.
// The joint space switches to `packSpace` together with the route space of `highways`, in one change of the sweep epoch.
import { canonicalConfig, checkConfig, type ParamValue, type StageChoice, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { PACK_SPACE_LEFT_OUT, PACK_SPACE_OPTIONS, packSpace } from "@mark1russell7/packing";
import type { PackEntry } from "./runner.ts";

/** The strategy space of `packing`, with the type of `layout-contract`. */
export const PACK_SPACE: StrategySpace = packSpace as unknown as StrategySpace;

/** The point of a pack entry in `packSpace`, or the reason that the entry has no point. */
export type PackPoint = { readonly ok: true; readonly config: StrategyConfig } | { readonly ok: false; readonly reason: string };

/** This function tells if a value is an object and not a list. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * This function gives the pack entry of a member value of a meta strategy: a strategy id, or a member entry with `strategy` and `options`.
 * Another value gives `undefined`.
 */
function memberEntry(value: unknown): PackEntry | undefined {
  if (typeof value === "string") return { id: value, strategy: value, options: {} };
  if (!isRecord(value) || typeof value["strategy"] !== "string") return undefined;
  const options = value["options"] ?? {};
  if (!isRecord(options)) return undefined;
  return { id: typeof value["id"] === "string" ? value["id"] : value["strategy"], strategy: value["strategy"], options };
}

/** This function gives the config of a pack entry before the checks: the named config of its strategy, with each option at its place. */
function rawPoint(entry: PackEntry): PackPoint {
  const base = PACK_SPACE.named?.[entry.strategy];
  if (base === undefined) return { ok: false, reason: `packSpace has no named config for the strategy ${entry.strategy}.` };
  const places = PACK_SPACE_OPTIONS[entry.strategy] ?? {};
  const stages: Record<string, StageChoice | null> = { ...base.stages };
  for (const [name, value] of Object.entries(entry.options)) {
    const key = `${entry.strategy}.${name}`;
    const place = places[name];
    if (place === undefined) return { ok: false, reason: `PACK_SPACE_OPTIONS has no place for the option ${key}.` };
    if (place === null) return { ok: false, reason: `packSpace does not hold the option ${key}: ${PACK_SPACE_LEFT_OUT[key] ?? "PACK_SPACE_LEFT_OUT gives no reason."}` };
    const [stage, option, param] = place.split(".");
    if (option === undefined) {
      // The place is a stage, and the value is the option of the stage.
      if (typeof value !== "string") return { ok: false, reason: `The option ${key} sets the stage ${place}, but its value is not a string.` };
      stages[place] = stages[place]?.option === value ? stages[place] : { option: value };
      continue;
    }
    const choice = stages[stage!];
    if (choice === undefined || choice === null || choice.option !== option) {
      return { ok: false, reason: `The option ${key} sets ${place}, but the config has the option ${choice?.option ?? "null"} for the stage ${stage}.` };
    }
    if (param === "members") {
      const list = Array.isArray(value) ? value : [value];
      const members: StrategyConfig[] = [];
      for (const m of list) {
        const member = memberEntry(m);
        if (member === undefined) return { ok: false, reason: `The option ${key} has a member that is not a strategy id or a member entry.` };
        const point = rawPoint(member);
        if (!point.ok) return { ok: false, reason: `The member ${member.id} of the option ${key} has no point. ${point.reason}` };
        members.push(point.config);
      }
      stages[stage!] = { ...choice, members };
      continue;
    }
    // The checks of `checkConfig` find a value that is not a param value.
    stages[stage!] = { ...choice, params: { ...choice.params, [param!]: value as ParamValue } };
  }
  return { ok: true, config: { space: PACK_SPACE.engine, stages } };
}

/**
 * This function gives the point of a pack entry in `packSpace`: the canonical config with the output of the entry.
 * - The start is the named config of the strategy of the entry. `PACK_SPACE_OPTIONS` gives the place of each option of the entry.
 * - A member of a meta strategy, for example `member` of `anneal`, gets its own point in the same way.
 * - The result has a reason in place of a config when an option has no place, or when `checkConfig` finds a break.
 * `src/pack-points.test.ts` compares the output of `packConfig` on the point with the output of the entry.
 */
export function packPointOf(entry: PackEntry): PackPoint {
  const raw = rawPoint(entry);
  if (!raw.ok) return raw;
  const breaks = checkConfig(PACK_SPACE, raw.config);
  if (breaks.length > 0) return { ok: false, reason: `The config is not a point of packSpace: ${breaks.map((b) => `${b.claim}: ${b.detail}`).join("; ")}.` };
  return { ok: true, config: canonicalConfig(PACK_SPACE, raw.config) };
}
