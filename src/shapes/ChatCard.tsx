import {
  BaseBoxShapeUtil,
  EditorContext,
  HTMLContainer,
  T,
  type TLBaseShape,
} from 'tldraw'
import { useContext } from 'react'
import { getLOD } from '../canvas/perf'

export type ChatCardShape = TLBaseShape<'chat-card', {
  w: number
  h: number
  title: string
  body: string
  timestamp: string
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
    body: T.string,
    timestamp: T.string,
  }

  getDefaultProps(): ChatCardShape['props'] {
    return {
      w: 240,
      h: 120,
      title: 'Untitled Chat',
      body: 'Chat body goes here.',
      timestamp: new Date().toISOString(),
    }
  }

  component(shape: ChatCardShape) {
    return <ChatCardInner shape={shape} />
  }

  indicator(shape: ChatCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}
