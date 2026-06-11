import 'tldraw/tldraw.css'
import {
  Tldraw,
  DefaultToolbar,
  SelectToolbarItem,
  HandToolbarItem,
  DrawToolbarItem,
  type TLComponents,
} from 'tldraw'
import { ChatCardShapeUtil } from '../shapes/ChatCard'

const shapeUtils = [ChatCardShapeUtil]

function MinimalToolbar() {
  return (
    <DefaultToolbar>
      <SelectToolbarItem />
      <HandToolbarItem />
      <DrawToolbarItem />
    </DefaultToolbar>
  )
}

const components: TLComponents = {
  Toolbar: MinimalToolbar,
}

export default function CanvasApp() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        persistenceKey="log-canvas"
        components={components}
      />
    </div>
  )
}
