import React from 'react'
import { Icon } from './Icon'

export const typeGlyphMeta: Record<string, { icon: string; label: string; color: string }> = {
  project: { icon: 'box', label: 'Project', color: 'var(--accent)' },
  idea:    { icon: 'lightbulb', label: 'Idea', color: 'var(--type-idea)' },
  thread:  { icon: 'messages-square', label: 'Thread', color: 'var(--green)' },
  chat:    { icon: 'messages-square', label: 'Chat', color: 'var(--green)' },
  doc:     { icon: 'file-text', label: 'Doc', color: 'var(--type-doc)' },
  sketch:  { icon: 'pen-line', label: 'Sketch', color: 'var(--type-sketch)' },
  agent:   { icon: 'bot', label: 'Agent', color: 'var(--type-agent)' },
  skill:   { icon: 'wrench', label: 'Skill', color: 'var(--type-skill)' },
  mcp:     { icon: 'plug', label: 'MCP', color: 'var(--type-mcp)' },
  gem:     { icon: 'gem', label: 'Gem', color: 'var(--type-gem)' },
}

interface TypeGlyphProps {
  type?: string
  size?: number
  icon?: string
  dim?: boolean
  style?: React.CSSProperties
}

export function TypeGlyph({ type = 'project', size = 16, icon, dim = false, style }: TypeGlyphProps) {
  const m = typeGlyphMeta[type] ?? typeGlyphMeta.project
  return (
    <Icon
      name={icon ?? m.icon}
      size={size}
      color={dim ? 'var(--text-4)' : m.color}
      style={{ transition: 'color var(--duration) var(--ease-mech)', ...style }}
    />
  )
}
