import { describe, it, expect, afterEach } from 'vitest'
import {
  Editor,
  createTLStore,
  defaultShapeUtils,
  defaultBindingUtils,
  defaultTools,
  defaultShapeTools,
} from 'tldraw'
import { ChatCardShapeUtil } from '../../shapes/ChatCard'

const shapeUtils = [...defaultShapeUtils, ChatCardShapeUtil]
const tools = [...defaultTools, ...defaultShapeTools]

function makeEditor() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const store = createTLStore({ shapeUtils })
  const editor = new Editor({
    store,
    shapeUtils,
    bindingUtils: [...defaultBindingUtils],
    tools,
    getContainer: () => container,
  })
  return { editor, container }
}

const editors: Editor[] = []

afterEach(() => {
  for (const editor of editors) {
    editor.dispose()
  }
  editors.length = 0
})

function create() {
  const result = makeEditor()
  editors.push(result.editor)
  return result
}

describe('canvas interactions', () => {
  it('editor initialises with camera at zoom=1, x=0, y=0', () => {
    const { editor } = create()
    const camera = editor.getCamera()
    expect(camera.z).toBe(1)
    expect(camera.x).toBe(0)
    expect(camera.y).toBe(0)
  })

  it('setCamera updates camera state', () => {
    const { editor } = create()
    editor.setCamera({ x: 150, y: 250, z: 1.5 })
    const camera = editor.getCamera()
    expect(camera.x).toBe(150)
    expect(camera.y).toBe(250)
    expect(camera.z).toBe(1.5)
  })

  it('selectAll selects all shapes', () => {
    const { editor } = create()
    editor.createShapes([
      { type: 'chat-card', x: 0, y: 0, props: { title: 'A', messages: [], summary: '', createdAt: 0 } },
      { type: 'chat-card', x: 200, y: 0, props: { title: 'B', messages: [], summary: '', createdAt: 0 } },
    ])
    editor.selectAll()
    expect(editor.getSelectedShapes().length).toBe(2)
  })

  it('zoomToFit moves camera so a shape is in view', () => {
    const { editor } = create()
    editor.createShapes([
      { type: 'chat-card', x: 0, y: 0, props: { title: 'Test', messages: [], summary: '', createdAt: 0 } },
    ])
    editor.setCamera({ x: 9999, y: 9999, z: 1 })
    editor.zoomToFit()
    const camera = editor.getCamera()
    expect(camera.x).not.toBe(9999)
  })

  it('shape position updates via editor.updateShape', () => {
    const { editor } = create()
    editor.createShapes([
      { type: 'chat-card', x: 10, y: 20, props: { title: 'Move me', messages: [], summary: '', createdAt: 0 } },
    ])
    const [shape] = editor.getCurrentPageShapes()
    editor.updateShape({ ...shape, x: 300, y: 400 })
    const updated = editor.getShape(shape.id)!
    expect(updated.x).toBe(300)
    expect(updated.y).toBe(400)
  })
})
