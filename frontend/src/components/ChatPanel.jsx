import { useState, useRef, useEffect } from 'react'

const SUGGESTIONS = [
  'What phones have the best margin?',
  'Show phones held over 30 days.',
  'Which iPhone models are moving fastest?',
  'Highlight negative-margin inventory.',
  'Suggest a flip with $1,000 to spend.',
]

export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Ask me about inventory, margins, Atlas pricing, or deal selection.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    if (!input.trim() || loading) return
    const query = input.trim()
    setMessages((current) => [...current, { role: 'user', content: query }])
    setInput('')
    setLoading(true)

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      })
      const data = await r.json()
      if (data.reply) {
        setMessages((current) => [...current, { role: 'assistant', content: data.reply }])
      } else if (data.error) {
        setMessages((current) => [...current, { role: 'assistant', content: 'Error: ' + data.error }])
      } else {
        setMessages((current) => [...current, { role: 'assistant', content: 'No reply returned.' }])
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Cannot reach the AI endpoint on port 8080.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200/80 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-900">Phone Flip AI</p>
            <p className="mt-1 text-xs text-slate-500">MiniMax-M2.7 via Hermes</p>
          </div>
          <button
            onClick={onClose}
            className="app-button app-button-secondary h-9 rounded-full px-3 text-xs"
            aria-label="Close chat"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'ml-auto flex max-w-[90%] justify-end' : 'max-w-[90%]'}>
            <div
              className={
                'rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm ' +
                (message.role === 'user'
                  ? 'border-slate-200 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700')
              }
            >
              {message.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="max-w-[90%]">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              Thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {!loading && messages.length === 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInput(suggestion)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-teal-200 hover:text-slate-900"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-slate-200/80 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about inventory, margins, or pricing..."
            rows={2}
            className="min-h-[3.5rem] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-400"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="app-button app-button-primary self-end px-4"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
