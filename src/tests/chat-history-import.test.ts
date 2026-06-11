import { describe, it, expect } from 'vitest'

// Will fail until src/lib/importChats.ts is created
import { parseConversations, conversationToCardSeed } from '../lib/importChats'

// ── parseConversations ───────────────────────────────────────────────────────

describe('parseConversations', () => {
  it('returns valid conversations as-is', () => {
    const input = [
      { title: 'Chat 1', created_at: '2024-01-01T00:00:00Z', messages: [{ role: 'human', content: 'hi' }] },
    ]
    const result = parseConversations(input)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Chat 1')
  })

  it('skips items missing title', () => {
    const input = [
      { created_at: '2024-01-01T00:00:00Z', messages: [{ role: 'human', content: 'hi' }] },
      { title: 'Good Chat', created_at: '2024-01-01T00:00:00Z', messages: [{ role: 'human', content: 'hi' }] },
    ]
    const result = parseConversations(input)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Good Chat')
  })

  it('skips items missing messages', () => {
    const input = [
      { title: 'No messages' },
      { title: 'Has messages', created_at: '2024-01-01T00:00:00Z', messages: [{ role: 'human', content: 'hi' }] },
    ]
    const result = parseConversations(input)
    expect(result).toHaveLength(1)
  })

  it('skips items with empty messages array', () => {
    const input = [
      { title: 'Empty', created_at: '2024-01-01T00:00:00Z', messages: [] },
    ]
    expect(parseConversations(input)).toHaveLength(0)
  })

  it('returns empty array for non-array input', () => {
    expect(parseConversations(null)).toHaveLength(0)
    expect(parseConversations({})).toHaveLength(0)
    expect(parseConversations('string')).toHaveLength(0)
  })

  it('returns empty array for empty array input', () => {
    expect(parseConversations([])).toHaveLength(0)
  })
})

// ── conversationToCardSeed ───────────────────────────────────────────────────

const baseConv = {
  title: 'Test Chat',
  created_at: '2024-06-01T12:00:00Z',
  messages: [
    { role: 'human', content: 'Hello' },
    { role: 'assistant', content: 'Hi there! How can I help you today?' },
  ],
}

describe('conversationToCardSeed', () => {
  it('normalises human → user in messages', () => {
    const seed = conversationToCardSeed(baseConv, 0, 0, 0)
    expect(seed.messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true)
    expect(seed.messages[0].role).toBe('user')
  })

  it('summary is first 120 chars of first assistant message', () => {
    const seed = conversationToCardSeed(baseConv, 0, 0, 0)
    expect(seed.summary).toBe('Hi there! How can I help you today?')
  })

  it('summary is "No summary" when there is no assistant message', () => {
    const conv = { ...baseConv, messages: [{ role: 'human', content: 'Hello' }] }
    const seed = conversationToCardSeed(conv, 0, 0, 0)
    expect(seed.summary).toBe('No summary')
  })

  it('summary truncates to 120 chars', () => {
    const long = 'a'.repeat(200)
    const conv = { ...baseConv, messages: [{ role: 'assistant', content: long }] }
    const seed = conversationToCardSeed(conv, 0, 0, 0)
    expect(seed.summary).toBe('a'.repeat(120))
    expect(seed.summary).toHaveLength(120)
  })

  it('createdAt is a unix timestamp parsed from created_at', () => {
    const seed = conversationToCardSeed(baseConv, 0, 0, 0)
    expect(seed.createdAt).toBe(new Date('2024-06-01T12:00:00Z').getTime())
  })

  it('createdAt falls back to Date.now() when created_at is missing or invalid', () => {
    const conv = { ...baseConv, created_at: '' }
    const before = Date.now()
    const seed = conversationToCardSeed(conv, 0, 0, 0)
    expect(seed.createdAt).toBeGreaterThanOrEqual(before)
  })

  it('index 0 places card at (originX, originY)', () => {
    const seed = conversationToCardSeed(baseConv, 0, 100, 200)
    expect(seed.x).toBe(100)
    expect(seed.y).toBe(200)
  })

  it('index 1 offsets by 260px in x', () => {
    const seed = conversationToCardSeed(baseConv, 1, 0, 0)
    expect(seed.x).toBe(260)
    expect(seed.y).toBe(0)
  })

  it('index 5 wraps to second row at (originX, originY + 160)', () => {
    const seed = conversationToCardSeed(baseConv, 5, 0, 0)
    expect(seed.x).toBe(0)
    expect(seed.y).toBe(160)
  })

  it('index 6 is second row, second column', () => {
    const seed = conversationToCardSeed(baseConv, 6, 0, 0)
    expect(seed.x).toBe(260)
    expect(seed.y).toBe(160)
  })

  it('preserves title from conversation', () => {
    const seed = conversationToCardSeed(baseConv, 0, 0, 0)
    expect(seed.title).toBe('Test Chat')
  })
})
