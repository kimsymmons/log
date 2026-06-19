import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  nodeContext,
  buildSeedMessage,
  ChatPanelProvider,
  useChatPanel,
  type NodeView,
} from '../ChatPanelContext'

const mk = (type: string, props: Record<string, unknown>): NodeView => ({ type, props })

describe('nodeContext', () => {
  it('labels and seeds known node types from their primary fields', () => {
    expect(nodeContext(mk('musing', { text: 'a quiet thought' }))).toEqual({ typeLabel: 'idea', seed: 'a quiet thought' })
    expect(nodeContext(mk('skill', { name: 'Summarise', description: 'd' }))).toEqual({ typeLabel: 'skill', seed: 'Summarise' })
    expect(nodeContext(mk('mcp-server', { name: 'GitHub' }))).toEqual({ typeLabel: 'MCP server', seed: 'GitHub' })
    expect(nodeContext(mk('gem', { name: 'Helper' }))).toEqual({ typeLabel: 'gem', seed: 'Helper' })
    expect(nodeContext(mk('agent-card', { agentName: 'Builder', taskDescription: 't' }))).toEqual({ typeLabel: 'agent', seed: 'Builder' })
    expect(nodeContext(mk('chat-card', { title: 'My chat', summary: 's' }))).toEqual({ typeLabel: 'chat', seed: 'My chat' })
  })

  it('falls back to content when there is no title (musing) and caps at 60 chars', () => {
    const long = 'x'.repeat(100)
    expect(nodeContext(mk('musing', { text: long })).seed).toHaveLength(60)
  })

  it('falls back to a description when a named node has no name', () => {
    expect(nodeContext(mk('skill', { name: '', description: 'does a thing' })).seed).toBe('does a thing')
  })

  it('uses the raw type for unknown shapes and best-effort seed', () => {
    expect(nodeContext(mk('mystery', { title: 'X' }))).toEqual({ typeLabel: 'mystery', seed: 'X' })
    expect(nodeContext({ type: 'frame' })).toEqual({ typeLabel: 'frame', seed: '' })
  })
})

describe('buildSeedMessage', () => {
  it('produces the pre-seeded first message including type and seed', () => {
    expect(buildSeedMessage(mk('skill', { name: 'Summarise' }))).toBe('Tell me about this skill: Summarise')
    expect(buildSeedMessage(mk('musing', { text: 'hello' }))).toBe('Tell me about this idea: hello')
  })

  it('omits the colon when there is no seed text', () => {
    expect(buildSeedMessage(mk('draw', {}))).toBe('Tell me about this sketch.')
  })
})

// Provider behaviour
function Harness() {
  const { isOpen, sourceShape, activeChatId, openPanel, closePanel, setActiveChatId } = useChatPanel()
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="source">{sourceShape?.id ?? ''}</span>
      <span data-testid="chatId">{activeChatId ?? ''}</span>
      <button onClick={() => openPanel({ id: 'shape:1', type: 'musing', props: { text: 'hi' } })}>open</button>
      <button onClick={() => setActiveChatId('shape:chat1')}>setChat</button>
      <button onClick={closePanel}>close</button>
    </div>
  )
}

describe('ChatPanelProvider', () => {
  const setup = () => render(<ChatPanelProvider><Harness /></ChatPanelProvider>)

  it('starts closed', () => {
    setup()
    expect(screen.getByTestId('open').textContent).toBe('false')
  })

  it('openPanel sets the source node and opens', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('open')) })
    expect(screen.getByTestId('open').textContent).toBe('true')
    expect(screen.getByTestId('source').textContent).toBe('shape:1')
  })

  it('closePanel closes but retains nothing required to reopen', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('open')) })
    act(() => { fireEvent.click(screen.getByText('close')) })
    expect(screen.getByTestId('open').textContent).toBe('false')
  })

  it('opening resets activeChatId', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('setChat')) })
    expect(screen.getByTestId('chatId').textContent).toBe('shape:chat1')
    act(() => { fireEvent.click(screen.getByText('open')) })
    expect(screen.getByTestId('chatId').textContent).toBe('')
  })
})
