import React from 'react'
import {
  BaseBoxShapeUtil,
  T,
  type TLBaseShape,
} from 'tldraw'
import { FilterDimContainer } from '../canvas/FilterContext'
import { Tag } from '../design-system/Tag'
import { KeyHint } from '../design-system/KeyHint'
import { Icon } from '../design-system/Icon'

// ── Types ──────────────────────────────────────────────────────────────────

export type SkillShape = TLBaseShape<'skill', {
  w: number
  h: number
  name: string
  description: string
  invocationKey: string
  tags: string[]
  sourceUrl?: string
}>

export const DEFAULT_SKILL_SIZE = { w: 280, h: 160 }

// ── Inner component ────────────────────────────────────────────────────────

export function SkillInner({ shape }: { shape: SkillShape }) {
  const { name, description, invocationKey, tags } = shape.props

  return (
    <div
      style={{
        width: shape.props.w,
        height: shape.props.h,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-2)',
        borderTop: '2px solid var(--orange)',
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
        <Icon name="wrench" size={14} color="var(--orange)" />
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-1)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {name || 'Untitled skill'}
        </span>
        <KeyHint keys={invocationKey} />
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

export class SkillShapeUtil extends BaseBoxShapeUtil<SkillShape> {
  static override type = 'skill' as const

  static override props = {
    w: T.number,
    h: T.number,
    name: T.string,
    description: T.string,
    invocationKey: T.string,
    tags: T.arrayOf(T.string),
    sourceUrl: T.optional(T.string),
  }

  getDefaultProps(): SkillShape['props'] {
    return {
      w: DEFAULT_SKILL_SIZE.w,
      h: DEFAULT_SKILL_SIZE.h,
      name: '',
      description: '',
      invocationKey: '',
      tags: [],
    }
  }

  component(shape: SkillShape) {
    return (
      <FilterDimContainer shape={shape} dataShapeType="skill">
        <SkillInner shape={shape} />
      </FilterDimContainer>
    )
  }

  indicator(shape: SkillShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
