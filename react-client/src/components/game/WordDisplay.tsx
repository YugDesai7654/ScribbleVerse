import { AnimatePresence, m } from "framer-motion"

interface WordDisplayProps {
  /** Server placeholder/hint format: characters separated by single spaces, words by triple spaces. */
  pattern: string
  isDrawer: boolean
}

/** Splits "a _ _   b _" into words of characters. */
function toWords(pattern: string): string[][] {
  return pattern.split("   ").map((word) => word.split(" ").filter(Boolean))
}

export default function WordDisplay({ pattern, isDrawer }: WordDisplayProps) {
  const words = toWords(pattern)
  const letterCount = words.reduce((sum, w) => sum + w.length, 0)

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="whitespace-nowrap text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] text-cream/50">
        {isDrawer ? "Draw this" : `Guess · ${letterCount} letters`}
      </span>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label={isDrawer ? pattern.replace(/ /g, "") : `${letterCount} letter word`}>
        {words.map((word, w) => (
          <div key={w} className="flex flex-wrap justify-center gap-0.5 sm:gap-1">
            {word.map((char, i) => {
              const revealed = char !== "_"
              return (
                <div
                  key={i}
                  className={`h-8 w-5 sm:h-10 sm:w-8 flex items-center justify-center rounded-md border-b-[3px] sm:border-b-4 font-display text-base sm:text-2xl font-bold uppercase ${
                    revealed ? "border-gold bg-gold/10 text-cream" : "border-cream/40 bg-panel-2 text-transparent"
                  }`}
                >
                  <AnimatePresence mode="wait">
                    <m.span
                      key={char}
                      initial={{ rotateX: 90, opacity: 0 }}
                      animate={{ rotateX: 0, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      {revealed ? char : "·"}
                    </m.span>
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
