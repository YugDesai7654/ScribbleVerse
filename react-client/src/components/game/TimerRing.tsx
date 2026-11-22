interface TimerRingProps {
  seconds: number
  total: number
}

/** Circular countdown that turns red and pulses in the final ten seconds. */
export default function TimerRing({ seconds, total }: TimerRingProps) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0
  const urgent = seconds <= 10

  return (
    <div className={`relative h-14 w-14 shrink-0 ${urgent && seconds > 0 ? "animate-pulse" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--color-panel-2)" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={urgent ? "var(--color-danger)" : "var(--color-gold)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${urgent ? "text-danger" : "text-cream"}`}>
        {seconds}
      </span>
    </div>
  )
}
