// Tiny synthesized sound effects (Web Audio), so the game ships no audio files.
type Cue = "correct" | "otherCorrect" | "close" | "tick" | "turnStart" | "gameOver"

const MUTE_KEY = "scribbleverse:muted"
let context: AudioContext | null = null

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1"
  } catch {
    return false
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0")
  } catch {
    // Storage unavailable (private mode etc.) — the toggle just won't persist.
  }
}

function tone(frequency: number, startOffset: number, duration: number, type: OscillatorType = "sine", gain = 0.12) {
  if (!context) return
  const osc = context.createOscillator()
  const amp = context.createGain()
  const start = context.currentTime + startOffset
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain, start + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp).connect(context.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export function play(cue: Cue) {
  if (isMuted() || typeof window === "undefined") return
  try {
    context ??= new AudioContext()
    if (context.state === "suspended") void context.resume()
  } catch {
    return
  }
  switch (cue) {
    case "correct":
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.25, "triangle"))
      break
    case "otherCorrect":
      tone(880, 0, 0.15, "sine", 0.08)
      break
    case "close":
      tone(440, 0, 0.12, "square", 0.04)
      tone(494, 0.1, 0.12, "square", 0.04)
      break
    case "tick":
      tone(1200, 0, 0.05, "square", 0.03)
      break
    case "turnStart":
      tone(392, 0, 0.12, "triangle")
      tone(587, 0.1, 0.2, "triangle")
      break
    case "gameOver":
      ;[523, 659, 784, 659, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, "triangle"))
      break
  }
}
