import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAgentSessionStatus } from './useAgentSessionStatus'

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue('test-token'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAgentSessionStatus', () => {
  it('returns the fallback when no sessionId is set and never fetches', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useAgentSessionStatus(undefined, 'idle'))
    expect(result.current).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches immediately and reflects the server status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'running' })))
    const { result } = renderHook(() => useAgentSessionStatus('sess-1', 'idle'))
    expect(result.current).toBe('idle') // fallback until first response resolves
    await waitFor(() => expect(result.current).toBe('running'))
  })

  it('sends the auth token and hits the session status endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'complete' }))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useAgentSessionStatus('sess-42', 'idle'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/sessions/sess-42/status')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
  })

  it('keeps the fallback when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false)))
    const { result } = renderHook(() => useAgentSessionStatus('sess-1', 'idle'))
    await waitFor(() => {})
    expect(result.current).toBe('idle')
  })

  it('ignores an unrecognised status value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'bogus' })))
    const { result } = renderHook(() => useAgentSessionStatus('sess-1', 'idle'))
    await waitFor(() => {})
    expect(result.current).toBe('idle')
  })

  it('swallows network errors and keeps the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const { result } = renderHook(() => useAgentSessionStatus('sess-1', 'running'))
    await waitFor(() => {})
    expect(result.current).toBe('running')
  })

  it('polls on an interval and clears it on unmount', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'running' }))
      vi.stubGlobal('fetch', fetchMock)
      const { unmount } = renderHook(() => useAgentSessionStatus('sess-1', 'idle', 5000))

      // immediate poll on mount
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(5000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(5000)
      expect(fetchMock).toHaveBeenCalledTimes(3)

      unmount()
      await vi.advanceTimersByTimeAsync(15000)
      expect(fetchMock).toHaveBeenCalledTimes(3) // no further polls after unmount
    } finally {
      vi.useRealTimers()
    }
  })
})
