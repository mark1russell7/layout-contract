/**
 * The probe of the playground. The site check of the Pages workflow starts it in a browser at each width, before the
 * deploy. A failed check stops the deploy.
 *
 * The probe drives the core of the site. The worker packs and routes one input with the real engines, a recipe changes
 * the pair, and another input gives another result.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];
declare const click: (target: string | Element) => void;

/** A run of a small input takes less than a second here, so a slow runner gets a large margin. */
const RUN_MS = 30000;

const text = (selector: string): string => $(selector)?.textContent ?? "";
const done = (): boolean => /^Done in /.test(text("#pg-status"));
/** This function gives the value of the tile with this label. */
const tile = (label: string): string => $$("#pg-result .tile").find((el) => el.textContent?.includes(label))?.querySelector(".tile-value")?.textContent ?? "";

// The page starts one run at load, with the first recipe on the first preset.
check("the page has the recipes and the presets", await until(() => $$("[data-recipe]").length >= 6 && $$("[data-preset]").length >= 2), $$("[data-recipe]").length);
check("a recipe card keeps its corners, so the text stays inside it", parseFloat(getComputedStyle($$("[data-recipe]")[0] as Element).borderTopLeftRadius) <= 12, getComputedStyle($$("[data-recipe]")[0] as Element).borderTopLeftRadius);
check("the first run ends", await until(done, RUN_MS), text("#pg-status"));
check("the run draws the layout", $("#pg-result .result-figure svg") !== null, text("#pg-result").slice(0, 200));
check("the run gives a fill above 0", Number(tile("joint.fill")) > 0, tile("joint.fill"));
check("the run has no error", $("#pg-result .problems") === null, text("#pg-result .problems"));

// A recipe changes the pair, and the address holds the new config.
const firstConfig = text(".config-id");
const firstCaption = text(".result-figure figcaption");
click('[data-recipe="zipper"]');
check("a recipe changes the config id", await until(() => text(".config-id") !== firstConfig && text(".config-id") !== ""), text(".config-id"));
check("the address holds the config", location.hash.includes("config=") || location.hash.includes("pair="), location.hash.slice(0, 80));
click("#pg-start");
check("the second run ends", await until(done, RUN_MS), text("#pg-status"));
check("the second run draws another pair", await until(() => text(".result-figure figcaption") !== firstCaption), text(".result-figure figcaption"));

// Another input gives another size and a new run.
const firstSize = text("#pg-size");
const hubs = $$("[data-preset]")[1];
if (hubs !== undefined) click(hubs);
check("another preset changes the size note", await until(() => text("#pg-size") !== firstSize), text("#pg-size"));
const secondCaption = text(".result-figure figcaption");
click("#pg-start");
check("the run of the other input ends", await until(done, RUN_MS), text("#pg-status"));
check("the run of the other input has another caption", await until(() => text(".result-figure figcaption") !== secondCaption), text(".result-figure figcaption"));

// The site publishes its measures, with the time of the data.
const kpi = (await fetch("kpi.json")
  .then((response) => (response.ok ? response.json() : undefined))
  .catch(() => undefined)) as { project?: string; at?: string; measures?: unknown[] } | undefined;
check("the file of measures names this project", kpi?.project === "layout-contract", kpi?.project);
check("the file of measures has a data time", !Number.isNaN(Date.parse(kpi?.at ?? "")), kpi?.at);
// The probe checks the names of the measures, not their count, so a new measure changes one list here.
// Each measure of the joint data is present. With no answer from npm, the build leaves out each measure that reads npm.
const kpiIds = (kpi?.measures ?? []).map((measure) => String((measure as { id?: unknown }).id));
const JOINT_MEASURES = ["pairs-in-run", "pairs-shown", "packers-measured", "routers-on-compare", "routers-keyed"];
// The build gives coverage-shown only when it read the branch sweep-data (L52).
const OPTIONAL_MEASURES: string[] = ["coverage-shown"];
const npmIds = kpiIds.filter((id) => id === "engines-current" || id.startsWith("engine-releases-behind-"));
check("the file of measures has each measure of the joint data", JOINT_MEASURES.every((id) => kpiIds.includes(id)), kpiIds.join(", "));
check("the file of measures has each measure that reads npm, or none of them", npmIds.length === 0 || (npmIds.includes("engines-current") && npmIds.length === 3), npmIds.join(", "));
check(
  "the file of measures has no repeated or unknown measure",
  new Set(kpiIds).size === kpiIds.length && kpiIds.every((id) => JOINT_MEASURES.includes(id) || OPTIONAL_MEASURES.includes(id) || npmIds.includes(id)),
  kpiIds.join(", "),
);

export {};
