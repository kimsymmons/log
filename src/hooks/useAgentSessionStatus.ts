import { useEffect, useState } from 'react'
import type { AgentStatus } from '../shapes/AgentCardShape'

const apiBase = () => (import.meta.env as Record<string, string>).VITE_API_URL ?? 'http://localhost:3001'

const VALID_STATUS: ReadonlySet<string> = new Set(['running', 'idle', 'complete', 'error'])

export const SESSION_POLL_INTERVAL_MS = 5000

/**
 * Poll the backend for an agent session's live status (PEO-150).
 *
 * Returns the latest server-reported status, falling back to `fallback`
 * until a value arrives or when no `sessionId` is set. Fetches immediately
 * on mount, then every `intervalMs`, and clears the interval on unmount.
 * Network/HTTP errors are swallowed so the card keeps its last known status.
 */
export function useAgentSessionStatus(
  sessionId: string | undefined,
  fallback: AgentStatus,
  intervalMs: number = SESSION_POLL_INTERVAL_MS,
): AgentStatus {
  const [status, setStatus] = useState<AgentStatus | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setStatus(null)
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const token = localStorage.getItem('auth_token') ?? ''
        const res = await fetch(`${apiBase()}/sessions/${encodeURIComponent(sessionId)}/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) return
        const data = (await res.json()) as { status?: string }
        if (!cancelled && data.status && VALID_STATUS.has(data.status)) {
          setStatus(data.status as AgentStatus)
        }
      } catch {
        // network error — keep last known status
      }
    }

    poll()
    const id = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [sessionId, intervalMs])

  return status ?? fallback
}
