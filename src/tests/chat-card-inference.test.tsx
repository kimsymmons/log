/**
 * PEO-118: Anthropic SSE integration — frontend unit tests.
 * Tests parseSseData (pure) and a stubbed fetch integration.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseSseData } from '../shapes/ChatCard'

// ── parseSseData unit tests ────────────────────────────────────────────────

describe('parseSseData', () => {
  it('parses a delta event', () => {
    expect(parseSseData('{"delta":"Hello"}')).toEqual({ type: 'delta', text: 'Hello' })
  })

  it('parses a delta event with spaces', () => {
    expect(parseSseData('{"delta":" world"}')).toEqual({ type: 'delta', text: ' world' })
  })

  it('parses an empty delta', () => {
    expect(parseSseData('{"delta":""}')).toEqual({ type: 'delta', text: '' })
  })

  it('parses a summary event', () => {
    const result = parseSseData('{"summary":{"title":"My Chat","body":"A test conversation."}}')
    expect(result).toEqual({ type: 'summary', title: 'My Chat', body: 'A test conversation.' })
  })

  it('parses the DONE sentinel', () => {
    expect(parseSseData('[DONE]')).toEqual({ type: 'done' })
  })

  it('parses an error event', () => {
    expect(parseSseData('{"error":"API quota exceeded"}')).toEqual({
      type: 'error',
      message: 'API quota exceeded',
    })
  })

  it('returns null for malformed JSON', () => {
    expect(parseSseData('not-valid-json')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSseData('')).toBeNull()
  })

  it('returns null for unrecognised object', () => {
    expect(parseSseData('{"foo":"bar"}')).toBeNull()
  })
})

// ── Stubbed fetch / SSE stream integration ─────────────────────────────────

function makeSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function collectSseEvents(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }
  return raw
    .split('\n')
    .filter(l => l.startsWith('data: '))
    .map(l => parseSseData(l.slice(6)))
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

describe('fetch stub — SSE stream round-trip', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses all event types from a stubbed SSE fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeSseResponse([
        'data: {"delta":"Hello"}\n\n',
        'data: {"delta":" world"}\n\n',
        'data: {"summary":{"title":"Test Chat","body":"A summary."}}\n\n',
        'data: [DONE]\n\n',
      ])
    ))

    const res = await fetch('/inference', { method: 'POST', body: '{}' })
    const events = await collectSseEvents(res)

    expect(events).toContainEqual({ type: 'delta', text: 'Hello' })
    expect(events).toContainEqual({ type: 'delta', text: ' world' })
    expect(events).toContainEqual({ type: 'summary', title: 'Test Chat', body: 'A summary.' })
    expect(events).toContainEqual({ type: 'done' })
  })

  it('surfaces an error event from the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeSseResponse([
        'data: {"error":"Model overloaded"}\n\n',
        'data: [DONE]\n\n',
      ])
    ))

    const res = await fetch('/inference', { method: 'POST', body: '{}' })
    const events = await collectSseEvents(res)

    expect(events).toContainEqual({ type: 'error', message: 'Model overloaded' })
    expect(events).toContainEqual({ type: 'done' })
  })

  it('summary event precedes done in the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeSseResponse([
        'data: {"delta":"token"}\n\n',
        'data: {"summary":{"title":"T","body":"B"}}\n\n',
        'data: [DONE]\n\n',
      ])
    ))

    const res = await fetch('/inference', { method: 'POST', body: '{}' })
    const events = await collectSseEvents(res)

    const summaryIdx = events.findIndex(e => e.type === 'summary')
    const doneIdx = events.findIndex(e => e.type === 'done')
    expect(summaryIdx).toBeGreaterThanOrEqual(0)
    expect(summaryIdx).toBeLessThan(doneIdx)
  })
})
