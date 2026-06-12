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

export type McpStatus = 'connected' | 'disconnected' | 'error'

export type McpServerShape = TLBaseShape<'mcp-server', {
  w: number
  h: number
  name: string
  description: string
  endpoint: string
  status: McpStatus
  tools: string[]
  tags: string[]
}>

export const DEFAULT_MCP_SIZE = { w: 280, h: 190 }

const STATUS_COLOR: Record<McpStatus, string> = {
  connected: 'var(--green)',
  disconnected: 'var(--text-4)',
  error: 'var(--red)',
}

// ── Inner component ────────────────────────────────────────────────────────

export function McpServerInner({ shape }: { shape: McpServerShape }) {
  const { name, description, endpoint, status, tools, tags } = shape.props
  const visibleTools = tools.slice(0, 3)
  const overflow = tools.length - 3

  return (
    <div
      style={{
        width: shape.props.w,
        height: shape.props.h,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-2)',
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
        <Icon name="plug" size={14} color="var(--blue)" />
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-1)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {name || 'Untitled server'}
        </span>
        {/* status dot */}
        <span
          data-status={status}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: STATUS_COLOR[status],
            flexShrink: 0,
          }}
        />
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
      }}>
        {description || <span style={{ color: 'var(--text-4)' }}>No description</span>}
      </p>

      {/* endpoint */}
      {endpoint && (
        <span style={{
          fontSize: 'var(--text-2xs)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {endpoint}
        </span>
      )}

      {/* tools */}
      {visibleTools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visibleTools.map(tool => (
            <span key={tool} style={{
              fontSize: 'var(--text-2xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-3)',
              background: 'var(--bg-raised)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {tool}
            </span>
          ))}
          {overflow > 0 && (
            <span style={{
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-4)',
              fontFamily: 'var(--font-ui)',
            }}>
              +{overflow} more
            </span>
          )}
        </div>
      )}

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

export class McpServerShapeUtil extends BaseBoxShapeUtil<McpServerShape> {
  static override type = 'mcp-server' as const

  static override props = {
    w: T.number,
    h: T.number,
    name: T.string,
    description: T.string,
    endpoint: T.string,
    status: T.literalEnum('connected', 'disconnected', 'error'),
    tools: T.arrayOf(T.string),
    tags: T.arrayOf(T.string),
  }

  getDefaultProps(): McpServerShape['props'] {
    return {
      w: DEFAULT_MCP_SIZE.w,
      h: DEFAULT_MCP_SIZE.h,
      name: '',
      description: '',
      endpoint: '',
      status: 'disconnected',
      tools: [],
      tags: [],
    }
  }

  component(shape: McpServerShape) {
    return (
      <FilterDimContainer shape={shape} dataShapeType="mcp-server">
        <McpServerInner shape={shape} />
      </FilterDimContainer>
    )
  }

  indicator(shape: McpServerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
