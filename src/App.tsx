import 'tldraw/tldraw.css'
import { Tldraw, type Editor } from 'tldraw'
import { ChatCardShapeUtil } from './shapes/ChatCard'

const shapeUtils = [ChatCardShapeUtil]

declare global {
  interface Window { __tldrawEditor?: Editor }
}

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(editor) => { window.__tldrawEditor = editor }}
      />
    </div>
  )
}
