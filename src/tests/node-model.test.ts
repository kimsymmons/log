/**
 * PEO-111: typed node model + tldraw adapter.
 *
 * Verifies the chat and ink mappings round-trip with float-exact spatial
 * fields, parent references resolve correctly, and z-order keys are
 * preserved verbatim.
 */
import { describe, it, expect } from 'vitest'
import type { TLDrawShape, TLParentId } from 'tldraw'
import type { ChatCardShape } from '../shapes/ChatCard'
import { shapeToNode, nodeToShape } from '../model/tldraw-adapter'
import { serializeNodes, deserializeNodes, type ChatNode, type InkGroupNode, type LogNode } from '../model/nodes'

const PAGE_ID = 'page:main' as TLParentId

// Deliberately awkward floats: 0.1 + 0.2 !== 0.3
const X = 0.1 + 0.2
const Y = 987.6543210123456

function makeChatShape(overrides: Partial<ChatCardShape> = {}): ChatCardShape {
  return {
    id: 'shape:chat-1' as ChatCardShape['id'],
    type: 'chat-card',
    x: X,
    y: Y,
    rotation: 0.7853981633974483, // π/4
    index: 'a2V' as ChatCardShape['index'],
    parentId: PAGE_ID,
    isLocked: false,
    opacity: 1,
    meta: {},
    typeName: 'shape',
    props: {
      w: 240.5,
      h: 120.25,
      title: 'Chat title',
      body: 'Chat body',
      timestamp: '2026-06-11T12:00:00.000Z',
    },
    ...overrides,
  }
}

function makeDrawShape(): TLDrawShape {
  return {
    id: 'shape:ink-1' as TLDrawShape['id'],
    type: 'draw',
    x: 10.000000001,
    y: -42.5,
    rotation: 0,
    index: 'a1' as TLDrawShape['index'],
    parentId: PAGE_ID,
    isLocked: false,
    opacity: 1,
    meta: {},
    typeName: 'shape',
    props: {
      color: 'black',
      fill: 'none',
      dash: 'draw',
      size: 'm',
      segments: [
        { type: 'free', points: [{ x: 0, y: 0, z: 0.5 }, { x: 30.25, y: 15.125, z: 0.6 }] },
      ],
      isComplete: true,
      isClosed: false,
      isPen: false,
      scale: 1,
    },
  }
}

describe('chat-card mapping', () => {
  it('maps a chat-card shape to a ChatNode with float-exact spatial fields', () => {
    const node = shapeToNode(makeChatShape()) as ChatNode

    expect(node.type).toBe('chat')
    expect(node.x).toBe(X)
    expect(node.y).toBe(Y)
    expect(node.rotation).toBe(0.7853981633974483)
    expect(node.w).toBe(240.5)
    expect(node.h).toBe(120.25)
    expect(node.z).toBe('a2V')
    expect(node.parentId).toBeNull() // page parent → top level
    expect(node.title).toBe('Chat title')
  })

  it('round-trips node → shape → node identically', () => {
    const node = shapeToNode(makeChatShape())!
    const partial = nodeToShape(node, PAGE_ID)!
    const back = shapeToNode({ ...makeChatShape(), ...partial, props: partial.props } as ChatCardShape)

    expect(back).toEqual(node)
  })

  it('preserves a non-page parent reference', () => {
    const shape = makeChatShape({ parentId: 'shape:region-1' as TLParentId })
    const node = shapeToNode(shape)!
    expect(node.parentId).toBe('shape:region-1')

    const partial = nodeToShape(node, PAGE_ID)!
    expect(partial.parentId).toBe('shape:region-1')
  })
})

describe('ink mapping', () => {
  it('maps a draw shape to an InkGroupNode with exact stroke points', () => {
    const node = shapeToNode(makeDrawShape()) as InkGroupNode

    expect(node.type).toBe('ink-group')
    expect(node.x).toBe(10.000000001)
    expect(node.segments[0].points[1]).toEqual({ x: 30.25, y: 15.125, z: 0.6 })
    // Bounds derived from stroke extents
    expect(node.w).toBe(30.25)
    expect(node.h).toBe(15.125)
    // Style passthrough keeps every non-segment prop
    expect(node.style).toEqual({
      color: 'black', fill: 'none', dash: 'draw', size: 'm',
      isComplete: true, isClosed: false, isPen: false, scale: 1,
    })
  })

  it('restores a draw shape with identical props', () => {
    const node = shapeToNode(makeDrawShape())!
    const partial = nodeToShape(node, PAGE_ID)!

    expect(partial.type).toBe('draw')
    expect(partial.props).toEqual(makeDrawShape().props)
  })
})

describe('model serialisation', () => {
  it('JSON round-trip is float-exact', () => {
    const nodes = [shapeToNode(makeChatShape())!, shapeToNode(makeDrawShape())!]
    const restored = deserializeNodes(serializeNodes(nodes))

    expect(restored).toEqual(nodes)
    expect((restored[0] as ChatNode).x).toBe(X)
  })

  it('z keys sort nodes in original stacking order', () => {
    const bottom = shapeToNode(makeDrawShape())! // z: 'a1'
    const top = shapeToNode(makeChatShape())! // z: 'a2V'
    const sorted: LogNode[] = [top, bottom].sort((a, b) => (a.z < b.z ? -1 : 1))

    expect(sorted.map((n) => n.id)).toEqual(['shape:ink-1', 'shape:chat-1'])
  })
})

describe('unmapped types', () => {
  it('returns null for shape types outside the node model', () => {
    const geo = { ...makeChatShape(), type: 'geo' } as unknown as Parameters<typeof shapeToNode>[0]
    expect(shapeToNode(geo)).toBeNull()
  })

  it('returns null for schema-only node types (artifact, region)', () => {
    const artifact: LogNode = {
      id: 'n1', type: 'artifact', x: 0, y: 0, rotation: 0, w: 10, h: 10, z: 'a1', parentId: null,
    }
    expect(nodeToShape(artifact, PAGE_ID)).toBeNull()
  })
})
