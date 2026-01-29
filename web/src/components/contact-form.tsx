'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function ContactForm () {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const email = String(formData.get('email') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()

    setStatus('sending')
    setErrorMessage('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to send message')
      }

      form.reset()
      setStatus('sent')
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send message')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-3 text-left">
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="contact-email">
          Your email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          placeholder="you@domain.com"
          className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          disabled={status === 'sending'}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={4}
          placeholder="Tell us about your request..."
          className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          disabled={status === 'sending'}
        />
      </div>
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
      {status === 'sent' && (
        <p className="text-sm font-medium text-emerald-600">Message sent. We will reply soon.</p>
      )}
      {status === 'error' && (
        <p className="text-sm font-medium text-red-600">{errorMessage}</p>
      )}
    </form>
  )
}
