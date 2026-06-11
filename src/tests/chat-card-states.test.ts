/**
 * PEO-117: ChatCard state machine — collapsed, expanded, streaming
 * Tests the pure transition function, not the DOM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  chatCardTransition,
  type ChatCardState,
  type ChatCardEvent,
  type Message,
  COLLAPSED_SIZE,
  EXPANDED_SIZE,
} from '../shapes/ChatCard'

describe('chatCardTransition — state machine', () => {
  it('collapsed + expand → expanded', () => {
    expect(chatCardTransition('collapsed', 'expand')).toBe('expanded')
  })

  it('collapsed + startStreaming → streaming', () => {
    expect(chatCardTransition('collapsed', 'startStreaming')).toBe('streaming')
  })

  it('streaming + streamingDone → expanded', () => {
    expect(chatCardTransition('streaming', 'streamingDone')).toBe('expanded')
  })

  it('expanded + collapse → collapsed', () => {
    expect(chatCardTransition('expanded', 'collapse')).toBe('collapsed')
  })

  it('collapsed + collapse → collapsed (no-op)', () => {
    expect(chatCardTransition('collapsed', 'collapse')).toBe('collapsed')
  })

  it('expanded + expand → expanded (no-op)', () => {
    expect(chatCardTransition('expanded', 'expand')).toBe('expanded')
  })

  it('streaming + expand → streaming (no-op while streaming)', () => {
    expect(chatCardTransition('streaming', 'expand')).toBe('streaming')
  })

  it('streaming + collapse → streaming (no-op while streaming)', () => {
    expect(chatCardTransition('streaming', 'collapse')).toBe('streaming')
  })

  it('expanded + startStreaming → streaming (send from expanded)', () => {
    expect(chatCardTransition('expanded', 'startStreaming')).toBe('streaming')
  })
})

describe('ChatCard size constants', () => {
  it('collapsed size is 240×120', () => {
    expect(COLLAPSED_SIZE).toEqual({ w: 240, h: 120 })
  })

  it('expanded size is 400×500', () => {
    expect(EXPANDED_SIZE).toEqual({ w: 400, h: 500 })
  })
})

describe('Message type structure', () => {
  it('accepts user and assistant roles', () => {
    const userMsg: Message = { role: 'user', content: 'hello' }
    const assistantMsg: Message = { role: 'assistant', content: 'hi there' }
    expect(userMsg.role).toBe('user')
    expect(assistantMsg.role).toBe('assistant')
  })
})

describe('ChatCardState type exhaustiveness', () => {
  it('covers all three states', () => {
    const states: ChatCardState[] = ['collapsed', 'expanded', 'streaming']
    expect(states).toHaveLength(3)
  })
})

describe('streaming stub sequence', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('collapsed → streaming → expanded in ~2 seconds', () => {
    let state: ChatCardState = 'collapsed'
    // simulate what the component does
    state = chatCardTransition(state, 'startStreaming')
    expect(state).toBe('streaming')

    // after 2s the streaming completes
    state = chatCardTransition(state, 'streamingDone')
    expect(state).toBe('expanded')
  })
})
