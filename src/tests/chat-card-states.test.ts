/**
 * PEO-117: ChatCard state machine — collapsed, expanded, streaming
 * Tests the pure transition function, not the DOM.
 */
import { describe, it, expect } from 'vitest'
import {
  chatCardTransition,
  type ChatCardState,
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

describe('streaming transition sequence', () => {
  it('collapsed → streaming → expanded', () => {
    let state: ChatCardState = 'collapsed'
    state = chatCardTransition(state, 'startStreaming')
    expect(state).toBe('streaming')
    state = chatCardTransition(state, 'streamingDone')
    expect(state).toBe('expanded')
  })
})
