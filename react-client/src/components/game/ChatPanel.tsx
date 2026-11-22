import { useEffect, useRef, useState } from "react"
import type React from "react"
import { Send } from "lucide-react"
import type { ChatMessage } from "../../game/types"

interface ChatPanelProps {
  messages: ChatMessage[]
  disabled: boolean
  placeholder: string
  onSend: (text: string) => void
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.user === "System") {
    return <li className="px-2 py-1 text-center text-xs italic text-cream/50">{message.text}</li>
  }
  if (message.correct) {
    return (
      <li className="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">🎉 {message.text}</li>
    )
  }
  if (message.close) {
    return (
      <li className="rounded-lg bg-gold/15 px-3 py-1.5 text-sm text-gold">
        “{message.text}” is close!
      </li>
    )
  }
  return (
    <li className={`px-2 py-1 text-sm break-words ${message.guessed ? "rounded-lg bg-success/5 text-success/90" : "text-cream/90"}`}>
      <span className="font-semibold text-cream">{message.user}</span>
      {message.guessed && <span className="ml-1 text-[10px] uppercase tracking-wide text-success/70">guessed</span>}
      <span className="text-cream/40">: </span>
      {message.text}
    </li>
  )
}

export default function ChatPanel({ messages, disabled, placeholder, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || disabled) return
    onSend(text)
    setDraft("")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul ref={listRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto pr-1" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && <li className="py-6 text-center text-sm text-cream/40">No messages yet. Say hi!</li>}
        {messages.map((message, i) => (
          <MessageRow key={`${message.timestamp}-${i}`} message={message} />
        ))}
      </ul>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none disabled:opacity-50"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          maxLength={200}
          aria-label="Chat message or guess"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="rounded-lg bg-gradient-to-r from-cream to-gold px-3 text-ink disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
