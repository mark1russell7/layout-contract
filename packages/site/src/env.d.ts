/** The commit and the date of the build. The Vite config sets them. */
declare const __BUILD__: { readonly sha: string; readonly date: string };

/** The catalog of the joint pages. The Vite config makes it at build time from the engines (`src/build-catalog.ts`). */
declare module "virtual:joint-catalog" {
  const catalog: import("./catalog.ts").JointCatalog;
  export default catalog;
}
