export type Theme = "light" | "dark"

const STORAGE_KEY = "scribbleverse:theme"
const THEME_COLORS: Record<Theme, string> = { dark: "#0d0d0d", light: "#faf5ec" }

/** The theme on <html>, set before first paint by the inline script in index.html. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme])
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked: the choice just won't survive a reload.
  }
}
