import { useCallback, useRef, useState } from "react"

export type Toast = { id: number; text: string; tone: "info" | "error" | "success" }

/** Minimal toast queue: replaces blocking alert() pop-ups. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextId.current++
    setToasts((current) => [...current.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3500)
  }, [])
  return { toasts, push }
}
