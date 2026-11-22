import { AnimatePresence, motion } from "framer-motion"
import type { Toast } from "../../game/useToasts"

const toneClass: Record<Toast["tone"], string> = {
  info: "border-line bg-panel text-cream",
  error: "border-danger/60 bg-panel text-danger",
  success: "border-success/60 bg-panel text-success",
}

export function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-lg ${toneClass[toast.tone]}`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
