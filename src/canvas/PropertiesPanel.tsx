import React from 'react'
import { useEditor, useValue } from 'tldraw'
import { TypeGlyph, typeGlyphMeta } from '../design-system/TypeGlyph'
import { Tag } from '../design-system/Tag'
import { tagColorFor, tagGlyphFor } from './tagStore'
import { DEFAULT_CARD_TYPE, type ChatCardShape } from '../shapes/ChatCard'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', minHeight: 22 }}>
      <span
        style={{
          width: 84, flexShrink: 0,
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--text-3)',
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', color: 'var(--text-1)' }}>
        {children}
      </span>
    </div>
  )
}

const EMPTY = <span style={{ color: 'var(--text-4)' }}>—</span>

/**
 * Floating, top-right properties panel (P4). Renders when a single ChatCard is
 * selected, surfacing the card's type, metadata and tags. Status / target date
 * / issues are project-card fields the chat-card data model doesn't carry yet,
 * so they render as empty until that data exists.
 */
export function PropertiesPanel() {
  const editor = useEditor()
  const selected = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])

  if (selected.length !== 1 || selected[0].type !== 'chat-card') return null
  const shape = selected[0] as ChatCardShape
  const cardType = shape.props.cardType ?? DEFAULT_CARD_TYPE
  const tags = shape.props.tags ?? []
  const label = typeGlyphMeta[cardType]?.label ?? cardType

  return (
    <div
      style={{
        position: 'absolute',
        top: 'var(--space-3)',
        right: 'var(--space-3)',
        zIndex: 20,
        width: 248,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4)',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-4)',
        boxShadow: 'var(--shadow-floating)',
        pointerEvents: 'all',
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--track-wide)', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 'var(--space-1)' }}>
        Properties
      </div>

      <Row label="Type">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <TypeGlyph type={cardType} size={14} />
          {label}
        </span>
      </Row>
      <Row label="Status">{EMPTY}</Row>
      <Row label="Target date">{EMPTY}</Row>
      <Row label="Issues">{EMPTY}</Row>
      <Row label="Tags">
        {tags.length > 0 ? (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {tags.map((t) => (
              <Tag key={t} label={t} icon={tagGlyphFor(t)} color={tagColorFor(t)} style={{ height: 22 }} />
            ))}
          </span>
        ) : (
          EMPTY
        )}
      </Row>
    </div>
  )
}
