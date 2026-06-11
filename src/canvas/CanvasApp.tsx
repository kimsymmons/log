import 'tldraw/tldraw.css'
import { Tldraw } from 'tldraw'
import { ChatCardShapeUtil } from '../shapes/ChatCard'

const shapeUtils = [ChatCardShapeUtil]

export default function CanvasApp() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        persistenceKey="log-canvas"
      />
    </div>
  )
}
