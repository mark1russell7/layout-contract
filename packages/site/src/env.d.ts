/** The commit and the date of the build. The Vite config sets them. */
declare const __BUILD__: { readonly sha: string; readonly date: string };

/** The catalog of the joint pages. The Vite config makes it at build time from the engines (`src/build-catalog.ts`). */
/** The source of each name that packers-measured and routers-on-compare count. The Vite config makes it at build time (L140). */
declare module "virtual:count-sources" {
  const sources: import("./kpi.ts").CountSources;
  export default sources;
}

declare module "virtual:joint-catalog" {
  const catalog: import("./catalog.ts").JointCatalog;
  export default catalog;
}
