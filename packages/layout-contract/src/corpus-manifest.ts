// The manifest of a corpus, `layout-corpus/1`, and the one writer of its text (`docs/CORPUS.md`).
// The bench of each engine and the joint bench write the same form: one line for each field, and one line for each item of a list.
import type { DeclaredClaim } from "./corpus.ts";

/** The schema of a corpus manifest. */
export const CORPUS_MANIFEST_SCHEMA = "layout-corpus/1";

/** The held-out split of a portfolio report: a seed, or `all` when each input is held out. */
export type HeldOut = number | "all";

/** The claims of a corpus that each bench reads. `declared` is the count of the inputs of each declared property. */
export interface ManifestClaims {
  readonly declared?: DeclaredClaim;
}

/**
 * A corpus manifest: the name, the specs of the inputs and, as an option, the held-out split, the claims and the inputs.
 * `Spec`, `Claims` and `Input` are the types of the bench that writes the manifest.
 */
export interface CorpusManifest<Spec = unknown, Claims extends object = ManifestClaims, Input = unknown> {
  readonly schema: typeof CORPUS_MANIFEST_SCHEMA;
  readonly corpus: string;
  readonly heldOut?: HeldOut;
  readonly claims?: Claims;
  readonly specs: readonly Spec[];
  readonly inputs?: readonly Input[];
}

/**
 * The form of a JSON value on one line.
 * With `spaced`, a space comes after each colon and each comma. With `compact`, the text is the text of `JSON.stringify`.
 */
export type JsonStyle = "spaced" | "compact";

/** This function gives a JSON value on one line, in the style `style`. The keys of an object keep their order. */
export function lineJson(value: unknown, style: JsonStyle = "spaced"): string {
  if (style === "compact") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => lineJson(v)).join(", ")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${lineJson(v)}`).join(", ")}}`;
  return JSON.stringify(value);
}

/** One field of a manifest text. */
export interface ManifestField {
  readonly key: string;
  /** The value. With `rows`, it is an array, and each item gets its own line. */
  readonly value: unknown;
  readonly rows?: boolean;
  /** The style of the value or of each item. The default is the style of the options. */
  readonly style?: JsonStyle;
}

/** The options of `manifestText`. */
export interface ManifestTextOptions {
  /** The style of each field with no style of its own. The default is `spaced`. */
  readonly style?: JsonStyle;
  /** The text of a list with no item: `[]` (the default), or `[` and `]` with an empty line between them. */
  readonly emptyRows?: "brackets" | "line";
}

/** This function gives the text of a manifest: `{`, one line for each field in the order of `fields`, `}` and a newline. */
export function manifestText(fields: readonly ManifestField[], options: ManifestTextOptions = {}): string {
  const keys = new Set<string>();
  const lines = fields.map((field, i) => {
    if (keys.has(field.key)) throw new RangeError(`manifestText: the key ${field.key} occurs two times.`);
    keys.add(field.key);
    const style = field.style ?? options.style ?? "spaced";
    const end = i === fields.length - 1 ? "" : ",";
    const head = `  ${JSON.stringify(field.key)}: `;
    if (field.rows !== true) return `${head}${lineJson(field.value, style)}${end}`;
    if (!Array.isArray(field.value)) throw new RangeError(`manifestText: the field ${field.key} has rows, so its value is an array.`);
    if (field.value.length === 0 && options.emptyRows !== "line") return `${head}[]${end}`;
    return `${head}[\n${field.value.map((item) => `    ${lineJson(item, style)}`).join(",\n")}\n  ]${end}`;
  });
  return `{\n${lines.join("\n")}\n}\n`;
}

/**
 * This function gives the text of a corpus manifest.
 * The fields come in the order `schema`, `corpus`, `heldOut`, `claims`, `specs` and `inputs`. A field with no value is not in the text.
 * `specs` and `inputs` have one line for each item.
 */
export function corpusManifestText<Spec, Claims extends object, Input>(manifest: CorpusManifest<Spec, Claims, Input>, options: ManifestTextOptions = {}): string {
  if (manifest.schema !== CORPUS_MANIFEST_SCHEMA) throw new RangeError(`corpusManifestText: the schema is ${String(manifest.schema)}, not ${CORPUS_MANIFEST_SCHEMA}.`);
  const fields: ManifestField[] = [
    { key: "schema", value: manifest.schema },
    { key: "corpus", value: manifest.corpus },
  ];
  if (manifest.heldOut !== undefined) fields.push({ key: "heldOut", value: manifest.heldOut });
  if (manifest.claims !== undefined) fields.push({ key: "claims", value: manifest.claims });
  fields.push({ key: "specs", value: manifest.specs, rows: true });
  if (manifest.inputs !== undefined) fields.push({ key: "inputs", value: manifest.inputs, rows: true });
  return manifestText(fields, options);
}
