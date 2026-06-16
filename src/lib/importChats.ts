export type RawConversation = {
  title: string
  created_at: string
  messages: Array<{ role: string; content: string }>
  /** Claude conversation id (export field), used to build the source URL. */
  uuid?: string
}

/** The claude.ai URL for a conversation, or null when it has no id. */
export function conversationSourceUrl(conv: RawConversation): string | null {
  return conv.uuid ? `https://claude.ai/chat/${conv.uuid}` : null
}

export type CardSeed = {
  title: string
  summary: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  createdAt: number
  x: number
  y: number
}

export function parseConversations(raw: unknown): RawConversation[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (item): item is RawConversation =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.title === 'string' &&
      item.title.length > 0 &&
      Array.isArray(item.messages) &&
      item.messages.length > 0
  )
}

export function conversationToCardSeed(
  conv: RawConversation,
  index: number,
  originX: number,
  originY: number
): CardSeed {
  const messages = conv.messages.map(m => ({
    role: (m.role === 'human' ? 'user' : m.role) as 'user' | 'assistant',
    content: m.content,
  }))

  const firstAssistant = messages.find(m => m.role === 'assistant')
  const summary = firstAssistant
    ? firstAssistant.content.slice(0, 120)
    : 'No summary'

  const parsed = conv.created_at ? new Date(conv.created_at).getTime() : NaN
  const createdAt = Number.isFinite(parsed) ? parsed : Date.now()

  return {
    title: conv.title,
    summary,
    messages,
    createdAt,
    x: originX + (index % 5) * 260,
    y: originY + Math.floor(index / 5) * 160,
  }
}
