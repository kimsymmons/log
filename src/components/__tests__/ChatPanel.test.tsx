import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatPanelProvider, useChatPanel } from '../../canvas/ChatPanelContext'
import { ChatPanel } from '../ChatPanel'

// Build a fake SSE Response whose body is a real ReadableStream of `data: …` lines.
function sseResponse(payloads: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const p of payloads) controller.enqueue(enc.encode(`data: ${p}\n\n`))
      controller.close()
    },
  })
  return { ok: true, status: 200, body } as unknown as Response
}

function Opener({ shape }: { shape: { id: string; type: string; props: Record<string, unknown> } }) {
  const { openPanel } = useChatPanel()
  return <button onClick={() => openPanel(shape)}>open-node</button>
}

// jsdom's localStorage is non-functional when --localstorage-file has no valid
// path; stub a working one keyed on the token under test.
function stubToken(token: string | null) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'auth_token' ? token : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
}

const renderPanel = (
  shape: { id: string; type: string; props: Record<string, unknown> } =
    { id: 'shape:m1', type: 'musing', props: { text: 'a small idea' } },
) =>
  render(
    <ChatPanelProvider>
      <Opener shape={shape} />
      <ChatPanel />
    </ChatPanelProvider>,
  )

describe('ChatPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    stubToken(null)
    fetchMock = vi.fn().mockResolvedValue(
      sseResponse(['{"delta":"Sure"}', '{"summary":{"title":"Idea","body":"About the idea"}}', '[DONE]']),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('is hidden until opened, then renders the header and close button', () => {
    renderPanel()
    expect(screen.getByTestId('chat-panel').getAttribute('data-open')).toBe('false')

    fireEvent.click(screen.getByText('open-node'))

    const panel = screen.getByTestId('chat-panel')
    expect(panel.getAttribute('data-open')).toBe('true')
    expect(screen.getByText('idea')).toBeTruthy() // type label
    expect(screen.getByLabelText('Close chat panel')).toBeTruthy()
  })

  it('pre-seeds the first user message from the node context', async () => {
    renderPanel({ id: 'shape:s1', type: 'skill', props: { name: 'Summarise' } })
    fireEvent.click(screen.getByText('open-node'))
    await waitFor(() =>
      expect(screen.getByText('Tell me about this skill: Summarise')).toBeTruthy(),
    )
  })

  it('includes the Bearer auth header from localStorage in the inference request', async () => {
    stubToken('jwt-xyz')
    renderPanel()
    fireEvent.click(screen.getByText('open-node'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/inference$/)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-xyz')
    // The seeded message is sent to the backend.
    const body = JSON.parse(init.body as string)
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Tell me about this idea: a small idea' })
  })

  it('omits the auth header when no token is stored', async () => {
    renderPanel()
    fireEvent.click(screen.getByText('open-node'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('closes when the close button is clicked', async () => {
    renderPanel()
    fireEvent.click(screen.getByText('open-node'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Close chat panel'))
    expect(screen.getByTestId('chat-panel').getAttribute('data-open')).toBe('false')
  })
})
