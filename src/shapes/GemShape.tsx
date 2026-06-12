import React from 'react'
import {
  BaseBoxShapeUtil,
  T,
  type TLBaseShape,
} from 'tldraw'
import { FilterDimContainer } from '../canvas/FilterContext'
import { Tag } from '../design-system/Tag'
import { Icon } from '../design-system/Icon'

// ── Types ──────────────────────────────────────────────────────────────────

export type GemShape = TLBaseShape<'gem', {
  w: number
  h: number
  name: string
  description: string
  systemPrompt: string
  tags: string[]
  linkedTo?: string[]
}>

export const DEFAULT_GEM_SIZE = { w: 280, h: 160 }

// ── Inner component ────────────────────────────────────────────────────────

export function GemInner({ shape }: { shape: GemShape }) {
  const { name, description, tags } = shape.props

  return (
    <div
      style={{
        width: shape.props.w,
        height: shape.props.h,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-2)',
        borderTop: '2px solid var(--purple)',
        borderRadius: 'var(--radius-3)',
        padding: '10px 12px',
        fontFamily: 'var(--font-ui)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxSizing: 'border-box',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="gem" size={14} color="var(--purple)" />
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-1)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {name || 'Untitled gem'}
        </span>
      </div>

      {/* description */}
      <p style={{
        margin: 0,
        fontSize: 'var(--text-xs)',
        color: 'var(--text-2)',
        lineHeight: 'var(--leading-normal)',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        flex: 1,
      }}>
        {description || <span style={{ color: 'var(--text-4)' }}>No description</span>}
      </p>

      {/* tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <Tag key={tag} label={tag} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── ShapeUtil ──────────────────────────────────────────────────────────────

export class GemShapeUtil extends BaseBoxShapeUtil<GemShape> {
  static override type = 'gem' as const

  static override props = {
    w: T.number,
    h: T.number,
    name: T.string,
    description: T.string,
    systemPrompt: T.string,
    tags: T.arrayOf(T.string),
    linkedTo: T.optional(T.arrayOf(T.string)),
  }

  getDefaultProps(): GemShape['props'] {
    return {
      w: DEFAULT_GEM_SIZE.w,
      h: DEFAULT_GEM_SIZE.h,
      name: '',
      description: '',
      systemPrompt: '',
      tags: [],
      linkedTo: [],
    }
  }

  component(shape: GemShape) {
    return (
      <FilterDimContainer shape={shape} dataShapeType="gem">
        <GemInner shape={shape} />
      </FilterDimContainer>
    )
  }

  indicator(shape: GemShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
