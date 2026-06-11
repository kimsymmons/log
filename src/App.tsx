import 'tldraw/tldraw.css'
import { Tldraw } from 'tldraw'
import { ChatCardShapeUtil } from './shapes/ChatCard'

const shapeUtils = [ChatCardShapeUtil]

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw shapeUtils={shapeUtils} />
    </div>
  )
}
