/**
 * Q3: Does tldraw's ink tool produce first-class persistable objects?
 *
 * Creates a TLDrawShape record programmatically and verifies it round-trips
 * through JSON serialisation — confirming ink strokes are plain data, not
 * ephemeral canvas state.
 */
import { describe, it, expect } from 'vitest'
import { createShapeId } from '@tldraw/tlschema'
import type { TLDrawShape, TLDrawShapeSegment } from '@tldraw/tlschema'

function makeDrawShape(segments: TLDrawShapeSegment[]): TLDrawShape {
  return {
    id: createShapeId('ink-test'),
    type: 'draw',
    x: 10,
    y: 20,
    rotation: 0,
    index: 'a1' as TLDrawShape['index'],
    parentId: 'page:page' as TLDrawShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    typeName: 'shape',
    props: {
      color: 'black',
      fill: 'none',
      dash: 'draw',
      size: 'm',
      segments,
      isComplete: true,
      isClosed: false,
      isPen: false,
      scale: 1,
    },
  }
}

describe('ink-layer: TLDrawShape serialisation', () => {
  it('a draw shape serialises to JSON without loss', () => {
    const segments: TLDrawShapeSegment[] = [
      {
        type: 'free',
        points: [
          { x: 0, y: 0, z: 0.5 },
          { x: 10, y: 5, z: 0.6 },
          { x: 20, y: 0, z: 0.4 },
        ],
      },
    ]

    const shape = makeDrawShape(segments)
    const json = JSON.stringify(shape)
    const restored = JSON.parse(json) as TLDrawShape

    expect(restored.type).toBe('draw')
    expect(restored.props.segments).toHaveLength(1)
    expect(restored.props.segments[0].points).toHaveLength(3)
    expect(restored.props.isComplete).toBe(true)
  })

  it('serialised draw shape preserves all segment point coordinates', () => {
    const segments: TLDrawShapeSegment[] = [
      {
        type: 'free',
        points: [
          { x: 100, y: 200, z: 1 },
          { x: 150, y: 250, z: 1 },
        ],
      },
    ]

    const shape = makeDrawShape(segments)
    const json = JSON.stringify(shape)
    const restored = JSON.parse(json) as TLDrawShape

    const pts = restored.props.segments[0].points
    expect(pts[0]).toEqual({ x: 100, y: 200, z: 1 })
    expect(pts[1]).toEqual({ x: 150, y: 250, z: 1 })
  })

  it('createShapeId produces a stable typed id', () => {
    const id = createShapeId('my-stroke')
    expect(typeof id).toBe('string')
    expect(id).toBe('shape:my-stroke')
  })

  it('multiple independent strokes serialise as separate shapes', () => {
    const stroke1 = makeDrawShape([{ type: 'free', points: [{ x: 0, y: 0, z: 1 }] }])
    const stroke2 = makeDrawShape([{ type: 'free', points: [{ x: 50, y: 50, z: 1 }] }])

    const payload = JSON.stringify([stroke1, stroke2])
    const [r1, r2] = JSON.parse(payload) as [TLDrawShape, TLDrawShape]

    expect(r1.props.segments[0].points[0]).toEqual({ x: 0, y: 0, z: 1 })
    expect(r2.props.segments[0].points[0]).toEqual({ x: 50, y: 50, z: 1 })
  })
})
