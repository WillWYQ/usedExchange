// Theme persistence for studio. localStorage wins, the system preference
// breaks the tie on first run. The value lands on <html data-theme="…">;
// tokens.css keys every colour off that attribute.

export type Theme = "light" | "dark";

const STORAGE_KEY = "studio-theme";

export function initialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
