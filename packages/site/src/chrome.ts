// The parts that each page of the site shares: the theme button and the build line.
import { byId } from "./ui.ts";

/** The themes: auto (the setting of the system), light or dark. */
const THEMES = ["auto", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** This function connects the theme button. The page keeps the choice in `localStorage`. */
export function initTheme(): void {
  const button = byId<HTMLButtonElement>("theme");
  const apply = (theme: Theme): void => {
    if (theme === "auto") delete document.documentElement.dataset["theme"];
    else document.documentElement.dataset["theme"] = theme;
    button.textContent = `Theme: ${theme}`;
  };
  let theme: Theme = THEMES.find((t) => t === localStorage.getItem("theme")) ?? "auto";
  apply(theme);
  button.addEventListener("click", () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
    localStorage.setItem("theme", theme);
    apply(theme);
  });
}

/** This function writes the commit and the date of the build in the footer. */
export function initBuild(): void {
  byId("build").textContent = `Built ${__BUILD__.date} from commit ${__BUILD__.sha}.`;
}
