/**
 * PEO-111: spatial persistence.
 *
 * Round-trips canvas state through a real tldraw store (schema validation
 * included) and through the localStorage-backed NodeStore, asserting
 * float-exact positions throughout. The full app-reload path is covered by
 * scripts/e2e-persistence.js.
 */
import { describe, it, expect } from 'vitest'
import {
  createTLStore,
  defaultShapeUtils,
  PageRecordType,
  type TLShape,
  type TLParentId,
} from 'tldraw'
import { ChatCardShapeUtil, type ChatCardShape } from '../shapes/ChatCard'
import { shapeToNode, nodeToShape } from '../model/tldraw-adapter'
import { createLocalNodeStore } from '../persistence/local'
import type { LogNode } from '../model/nodes'

const PAGE_ID = PageRecordType.createId('main')

function newStore() {
  return createTLStore({ shapeUtils: [...defaultShapeUtils, ChatCardShapeUtil] })
}

function makePage() {
  return PageRecordType.create({ id: PAGE_ID, name: 'Main', index: 'a1' as never })
}

function chatShapeRecord(id: string, x: number, y: number, index: string): ChatCardShape {
  return {
    id: `shape:${id}` as ChatCardShape['id'],
    type: 'chat-card',
    x,
    y,
    rotation: 0,
    index: index as ChatCardShape['index'],
    parentId: PAGE_ID as TLParentId,
    isLocked: false,
    opacity: 1,
    meta: {},
    typeName: 'shape',
    props: { w: 240, h: 120, title: `Card ${id}`, messages: [], summary: 'body', createdAt: new Date('2026-06-11T00:00:00.000Z').getTime() },
  }
}

/** Completes a nodeToShape partial into a full record for store.put. */
function completeRecord(node: LogNode): TLShape {
  const partial = nodeToShape(node, PAGE_ID as TLParentId)!
  return {
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    typeName: 'shape',
    ...partial,
  } as TLShape
}

describe('store round-trip through the node model', () => {
  it('positions survive store → nodes → JSON → store exactly', () => {
    const x = 0.1 + 0.2 // 0.30000000000000004
    const y = 1234.5678901234567

    const source = newStore()
    source.put([makePage(), chatShapeRecord('a', x, y, 'a2')])

    // Export: shapes → nodes → JSON
    const nodes = source
      .allRecords()
      .filter((r): r is TLShape => r.typeName === 'shape')
      .map(shapeToNode)
      .filter((n): n is LogNode => n !== null)
    const json = JSON.stringify(nodes)

    // Import into a fresh store (validates against tldraw schema)
    const restored: LogNode[] = JSON.parse(json)
    const target = newStore()
    target.put([makePage(), ...restored.map(completeRecord)])

    const shape = target.get(`shape:a` as TLShape['id']) as ChatCardShape
    expect(shape).toBeDefined()
    expect(shape.x).toBe(x)
    expect(shape.y).toBe(y)
    expect(shape.index).toBe('a2')
    expect(shape.props.title).toBe('Card a')
  })

  it('z-order of multiple shapes is preserved verbatim', () => {
    const source = newStore()
    source.put([
      makePage(),
      chatShapeRecord('bottom', 0, 0, 'a1'),
      chatShapeRecord('top', 10, 10, 'a3'),
      chatShapeRecord('middle', 5, 5, 'a2'),
    ])

    const nodes = source
      .allRecords()
      .filter((r): r is TLShape => r.typeName === 'shape')
      .map(shapeToNode)
      .filter((n): n is LogNode => n !== null)
      .sort((a, b) => (a.z < b.z ? -1 : 1))

    expect(nodes.map((n) => n.id)).toEqual(['shape:bottom', 'shape:middle', 'shape:top'])
  })
})

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('NodeStore', () => {
  it('save/load round-trips nodes exactly', () => {
    const store = createLocalNodeStore('test:canvas', memoryStorage())
    const node = shapeToNode(chatShapeRecord('ls', 0.30000000000000004, -99.99999999999, 'a5'))!

    store.save([node])
    const loaded = store.load()!

    expect(loaded).toEqual([node])
    expect(loaded[0].x).toBe(0.30000000000000004)
  })

  it('returns null when nothing has been saved', () => {
    expect(createLocalNodeStore('test:empty', memoryStorage()).load()).toBeNull()
  })

  it('an empty canvas saves and loads as an empty list, not null', () => {
    const store = createLocalNodeStore('test:cleared', memoryStorage())
    store.save([])
    expect(store.load()).toEqual([])
  })
})
