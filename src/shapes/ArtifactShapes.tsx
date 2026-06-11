import React, { useState, useCallback } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, T, type TLBaseShape } from 'tldraw'
import type { ArtifactType } from '../types/artifact'

// ── Types ───────────────────────────────────────────────────────────────────

export type ArtifactProps = {
  w: number
  h: number
  chatId: string
  content: string
  title: string
}

export type MarkdownArtifactShape = TLBaseShape<'markdown-artifact', ArtifactProps>
export type CodeArtifactShape = TLBaseShape<'code-artifact', ArtifactProps>
export type ImageArtifactShape = TLBaseShape<'image-artifact', ArtifactProps>
export type AnyArtifactShape = MarkdownArtifactShape | CodeArtifactShape | ImageArtifactShape

// ── Constants ───────────────────────────────────────────────────────────────

export const ARTIFACT_COLLAPSED_SIZE = { w: 220, h: 80 }
export const ARTIFACT_EXPANDED_SIZE = { w: 360, h: 420 }

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function truncateContent(content: string, max = 40): string {
  return content.length > max ? content.slice(0, max) + '…' : content
}

export function artifactTypeToShapeType(type: ArtifactType): 'markdown-artifact' | 'code-artifact' | 'image-artifact' {
  const map: Record<ArtifactType, 'markdown-artifact' | 'code-artifact' | 'image-artifact'> = {
    markdown: 'markdown-artifact',
    code: 'code-artifact',
    image: 'image-artifact',
  }
  return map[type]
}

export function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML entities first to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings (must come before bold to avoid conflicts)
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Inline code (before bold/italic)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Blank lines → paragraph break
    .replace(/\n\n/g, '<br><br>')
  return html
}

// ── Shared props validator ───────────────────────────────────────────────────

const ARTIFACT_PROPS = {
  w: T.number,
  h: T.number,
  chatId: T.string,
  content: T.string,
  title: T.string,
}

function defaultArtifactProps(): ArtifactProps {
  return { w: ARTIFACT_COLLAPSED_SIZE.w, h: ARTIFACT_COLLAPSED_SIZE.h, chatId: '', content: '', title: '' }
}

// ── Artifact type icons ──────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  'markdown-artifact': '📝',
  'code-artifact': '💻',
  'image-artifact': '🖼',
}

// ── Shared inner component ───────────────────────────────────────────────────

function ArtifactInner({ shape }: { shape: AnyArtifactShape }) {
  const [expanded, setExpanded] = useState(false)
  const icon = TYPE_ICONS[shape.type] ?? '📄'
  const { content, title } = shape.props

  const toggle = useCallback(() => setExpanded(e => !e), [])

  if (!expanded) {
    return (
      <div
        onClick={toggle}
        style={{
          width: ARTIFACT_COLLAPSED_SIZE.w,
          height: ARTIFACT_COLLAPSED_SIZE.h,
          background: '#f0f4ff',
          border: '1px solid #b8c8f0',
          borderRadius: 6,
          padding: '8px 10px',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title || 'Artifact'}
          </div>
          <div style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {truncateContent(content)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: ARTIFACT_EXPANDED_SIZE.w,
        height: ARTIFACT_EXPANDED_SIZE.h,
        background: '#fff',
        border: '1px solid #b8c8f0',
        borderRadius: 6,
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{icon} {title || 'Artifact'}</span>
        <button
          onClick={toggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#888', padding: '0 2px' }}
          aria-label="Collapse"
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
        <ArtifactViewer shape={shape} />
      </div>
    </div>
  )
}

function ArtifactViewer({ shape }: { shape: AnyArtifactShape }) {
  const { content } = shape.props

  if (shape.type === 'markdown-artifact') {
    return (
      <div
        style={{ fontSize: 12, lineHeight: 1.5, fontFamily: 'system-ui, sans-serif' }}
        // renderMarkdown escapes HTML before processing — safe to set as innerHTML
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    )
  }

  if (shape.type === 'code-artifact') {
    return <CodeViewer content={content} />
  }

  if (shape.type === 'image-artifact') {
    return (
      <img
        src={content}
        alt={shape.props.title}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    )
  }

  return <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{content}</pre>
}

function CodeViewer({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [content])

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute', top: 4, right: 4,
          fontSize: 10, padding: '2px 6px',
          border: '1px solid #ccc', borderRadius: 3,
          background: '#f8f8f8', cursor: 'pointer',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre style={{ fontSize: 11, lineHeight: 1.4, whiteSpace: 'pre-wrap', margin: 0, paddingTop: 24 }}>
        <code>{content}</code>
      </pre>
    </div>
  )
}

// ── Shape utils ──────────────────────────────────────────────────────────────

export class MarkdownArtifactShapeUtil extends BaseBoxShapeUtil<MarkdownArtifactShape> {
  static override type = 'markdown-artifact' as const
  static override props = ARTIFACT_PROPS
  getDefaultProps(): ArtifactProps { return defaultArtifactProps() }
  component(shape: MarkdownArtifactShape) {
    return <HTMLContainer style={{ pointerEvents: 'all' }}><ArtifactInner shape={shape} /></HTMLContainer>
  }
  indicator(shape: MarkdownArtifactShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />
  }
}

export class CodeArtifactShapeUtil extends BaseBoxShapeUtil<CodeArtifactShape> {
  static override type = 'code-artifact' as const
  static override props = ARTIFACT_PROPS
  getDefaultProps(): ArtifactProps { return defaultArtifactProps() }
  component(shape: CodeArtifactShape) {
    return <HTMLContainer style={{ pointerEvents: 'all' }}><ArtifactInner shape={shape} /></HTMLContainer>
  }
  indicator(shape: CodeArtifactShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />
  }
}

export class ImageArtifactShapeUtil extends BaseBoxShapeUtil<ImageArtifactShape> {
  static override type = 'image-artifact' as const
  static override props = ARTIFACT_PROPS
  getDefaultProps(): ArtifactProps { return defaultArtifactProps() }
  component(shape: ImageArtifactShape) {
    return <HTMLContainer style={{ pointerEvents: 'all' }}><ArtifactInner shape={shape} /></HTMLContainer>
  }
  indicator(shape: ImageArtifactShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />
  }
}
