import React, { useState, useEffect } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type TLBaseShape,
} from 'tldraw'
import { AgentNode } from '../design-system/AgentNode'
import { Tag } from '../design-system/Tag'
import { useDetailLevel, detailDisplay } from '../hooks/useDetailLevel'

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentStatus = 'running' | 'idle' | 'complete' | 'error'

export type AgentCardShape = TLBaseShape<'agent-card', {
  w: number
  h: number
  agentName: string
  model: string
  status: AgentStatus
  taskDescription: string
  linkedTicket?: string
  linkedChatId?: string
  tags: string[]
  startedAt: number
}>

export const DEFAULT_AGENT_CARD_SIZE = { w: 300, h: 220 }

// ── Status config ─────────────────────────────────────────────────────────

const STATUS_COLOR: Record<AgentStatus, string> = {
  running: 'var(--accent)',
  idle: 'var(--text-3)',
  complete: 'var(--green)',
  error: 'var(--red)',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'running',
  idle: 'idle',
  complete: 'complete',
  error: 'error',
}

// ── Elapsed time ──────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// ── Inner component ────────────────────────────────────────────────────────

export function AgentCardInner({ shape }: { shape: AgentCardShape }) {
  const { agentName, model, status, taskDescription, linkedTicket, tags, startedAt } = shape.props
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const statusColor = STATUS_COLOR[status]
  const isRunning = status === 'running'
  const detail = useDetailLevel()
  const d = detailDisplay(detail)

  return (
    <div
      data-detail={detail}
      style={{
        width: shape.props.w,
        height: d.minimal ? 'auto' : shape.props.h,
        minHeight: d.minimal ? 40 : undefined,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-2)',
        borderTop: `2px solid ${statusColor}`,
        borderRadius: 'var(--radius-3)',
        padding: '10px 12px',
        fontFamily: 'var(--font-ui)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxSizing: 'border-box',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* header: disc + name (glyph + title, always visible) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AgentNode
          model={model}
          task={taskDescription}
          size={24}
          state={isRunning ? 'working' : 'working'}
          style={isRunning ? undefined : { opacity: 0.4 }}
        />
        <span style={{
          flex: 1,
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {agentName || 'Unnamed agent'}
        </span>
        <span style={{
          display: d.secondary ?? 'block',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-3)',
          whiteSpace: 'nowrap',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius-1)',
          padding: '1px 5px',
        }}>
          {model}
        </span>
      </div>

      {/* status row */}
      <div style={{ display: d.secondary ?? 'flex', alignItems: 'center', gap: 6 }}>
        <span
          data-status={status}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            ...(isRunning ? {
              animation: 'agent-status-pulse 1.4s ease-in-out infinite',
            } : {}),
          }}
        />
        <span style={{
          fontSize: 'var(--text-xs)',
          color: statusColor,
          fontWeight: 'var(--weight-medium)',
        }}>
          {STATUS_LABEL[status]}
        </span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-3)',
        }}>
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* task description (body) */}
      <p
        data-detail-body
        style={{
          margin: 0,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-2)',
          lineHeight: 'var(--leading-normal)',
          flex: 1,
          overflow: 'hidden',
          display: d.body ?? '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {taskDescription || <span style={{ color: 'var(--text-4)' }}>No task description</span>}
      </p>

      {/* linked ticket (external link) */}
      {linkedTicket && (
        <div data-detail-link style={{ display: d.body ?? 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--accent-text)',
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-1)',
            padding: '1px 6px',
          }}>
            {linkedTicket}
          </span>
        </div>
      )}

      {/* tags */}
      {tags.length > 0 && (
        <div style={{ display: d.secondary ?? 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <Tag key={tag} label={tag} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── ShapeUtil ──────────────────────────────────────────────────────────────

export class AgentCardShapeUtil extends BaseBoxShapeUtil<AgentCardShape> {
  static override type = 'agent-card' as const

  static override props = {
    w: T.number,
    h: T.number,
    agentName: T.string,
    model: T.string,
    status: T.string,
    taskDescription: T.string,
    linkedTicket: T.optional(T.string),
    linkedChatId: T.optional(T.string),
    tags: T.arrayOf(T.string),
    startedAt: T.number,
  }

  getDefaultProps(): AgentCardShape['props'] {
    return {
      w: DEFAULT_AGENT_CARD_SIZE.w,
      h: DEFAULT_AGENT_CARD_SIZE.h,
      agentName: '',
      model: 'claude-sonnet-4-6',
      status: 'idle',
      taskDescription: '',
      tags: [],
      startedAt: Date.now(),
    }
  }

  component(shape: AgentCardShape) {
    return (
      <HTMLContainer
        data-shape-type="agent-card"
        style={{ pointerEvents: 'all' }}
      >
        <AgentCardInner shape={shape} />
      </HTMLContainer>
    )
  }

  indicator(shape: AgentCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
