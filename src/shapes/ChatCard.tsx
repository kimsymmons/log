import React, { useState, useEffect, useCallback } from 'react'
import {
  BaseBoxShapeUtil,
  EditorContext,
  HTMLContainer,
  T,
  type TLBaseShape,
} from 'tldraw'
import { useContext } from 'react'
import { getLOD } from '../canvas/perf'

// ── Types ──────────────────────────────────────────────────────────────────

export type Message = { role: 'user' | 'assistant'; content: string }

export type ChatCardState = 'collapsed' | 'expanded' | 'streaming'
export type ChatCardEvent = 'expand' | 'collapse' | 'startStreaming' | 'streamingDone'

export const COLLAPSED_SIZE = { w: 240, h: 120 }
export const EXPANDED_SIZE = { w: 400, h: 500 }

export type ChatCardShape = TLBaseShape<'chat-card', {
  w: number
  h: number
  title: string
  messages: Message[]
  summary: string
  createdAt: number
}>

function ChatCardInner({ shape }: { shape: ChatCardShape }) {
  const editor = useContext(EditorContext)
  const lod = getLOD(editor?.getCamera().z ?? 1)
  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '10px 12px',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'all',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {shape.props.title}
      </div>
      {lod === 'full' && (
        <>
          <div style={{ fontSize: 12, color: '#4a5568', flexGrow: 1, overflow: 'hidden' }}>
            {shape.props.body}
          </div>
          <div style={{ fontSize: 10, color: '#a0aec0' }}>
            {new Date(shape.props.timestamp).toLocaleString()}
          </div>
        </>
      )}
    </HTMLContainer>
  )
}

export class ChatCardShapeUtil extends BaseBoxShapeUtil<ChatCardShape> {
  static override type = 'chat-card' as const

  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    messages: T.arrayOf(T.object({ role: T.string, content: T.string })),
    summary: T.string,
    createdAt: T.number,
  }

  getDefaultProps(): ChatCardShape['props'] {
    return {
      w: COLLAPSED_SIZE.w,
      h: COLLAPSED_SIZE.h,
      title: 'Untitled Chat',
      messages: [],
      summary: '',
      createdAt: Date.now(),
    }
  }

  component(shape: ChatCardShape) {
    return <ChatCardInner shape={shape} />
  }

  indicator(shape: ChatCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />
  }
}
