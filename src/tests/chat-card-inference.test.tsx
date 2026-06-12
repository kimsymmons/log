/**
 * PEO-118: Anthropic SSE integration — frontend unit tests.
 * Tests parseSseData (pure) and a component-level streaming integration test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { parseSseData, ChatCardInner } from '../shapes/ChatCard'
import type { ChatCardShape } from '../shapes/ChatCard'

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

// ── ChatCardInner streaming integration ────────────────────────────────────

function makeShape(): ChatCardShape {
  return {
    id: 'shape:test-chat' as ChatCardShape['id'],
    type: 'chat-card',
    x: 0, y: 0, rotation: 0,
    index: 'a1' as ChatCardShape['index'],
    parentId: 'page:test' as ChatCardShape['parentId'],
    isLocked: false, opacity: 1, meta: {},
    props: { w: 240, h: 120, title: 'Test Chat', messages: [], summary: '', createdAt: Date.now() },
    typeName: 'shape',
  } as unknown as ChatCardShape
}

describe('ChatCardInner — streaming integration', () => {
  beforeEach(() => {
    // jsdom's localStorage may be non-functional when --localstorage-file has no valid path.
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('displays accumulated delta text while streaming', async () => {
    // Hold back [DONE] so we can assert the streaming state before it ends.
    let resolveStream!: () => void
    const streamReady = new Promise<void>(r => { resolveStream = r })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"delta":"Hello"}\n\n'))
        controller.enqueue(encoder.encode('data: {"delta":" world"}\n\n'))
        await streamReady
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    ))

    render(<ChatCardInner shape={makeShape()} />)

    // Expand the collapsed card, then type and send.
    fireEvent.click(screen.getByText('Test Chat'))
    fireEvent.change(screen.getByPlaceholderText('Send a message…'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByText('Send'))

    // Delta text must appear in the DOM while streaming is in progress.
    await waitFor(() => {
      expect(screen.getByText(/Hello/)).toBeInTheDocument()
    })

    resolveStream()
  })

  it('shows error message on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    render(<ChatCardInner shape={makeShape()} />)

    fireEvent.click(screen.getByText('Test Chat'))
    fireEvent.change(screen.getByPlaceholderText('Send a message…'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByText('Send'))

    // On error the component collapses (no messages) and shows the error inline.
    await waitFor(() => {
      expect(screen.getByText(/Error: Network error/)).toBeInTheDocument()
    })
  })
})
