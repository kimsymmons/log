import 'tldraw/tldraw.css'
import { Tldraw, type Editor, type TLShapePartial } from 'tldraw'
import { ChatCardShapeUtil } from './shapes/ChatCard'
import { shapeToNode, nodeToShape } from './model/tldraw-adapter'
import { createLocalNodeStore } from './persistence/local'
import type { LogNode } from './model/nodes'

const shapeUtils = [ChatCardShapeUtil]
const SAVE_DEBOUNCE_MS = 500

declare global {
  interface Window { __tldrawEditor?: Editor }
}

function setupPersistence(editor: Editor) {
  const store = createLocalNodeStore()

  const saved = store.load()
  if (saved !== null && editor.getCurrentPageShapeIds().size === 0) {
    const pageId = editor.getCurrentPageId()
    const shapes = saved
      .map((n) => nodeToShape(n, pageId))
      .filter((s): s is TLShapePartial => s !== null)
    if (shapes.length > 0) editor.createShapes(shapes)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const unlisten = editor.store.listen(
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        store.save(
          editor
            .getCurrentPageShapes()
            .map(shapeToNode)
            .filter((n): n is LogNode => n !== null)
        )
      }, SAVE_DEBOUNCE_MS)
    },
    { scope: 'document' }
  )

  return () => {
    clearTimeout(timer)
    unlisten()
  }
}

export default function App() {
<<<<<<< feat/peo-112-interactions
  return <CanvasApp />
=======
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(editor) => {
          window.__tldrawEditor = editor
          return setupPersistence(editor)
        }}
      />
    </div>
  )
>>>>>>> main
}
