import { useState } from "react"
import { Moon, Sun } from "lucide-react"
import { applyTheme, currentTheme, type Theme } from "../theme"

/** Switches between the dark and light themes and remembers the choice. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next: Theme = theme === "dark" ? "light" : "dark"
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel/80 text-cream backdrop-blur transition-colors hover:bg-panel-2 ${className}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  )
}
