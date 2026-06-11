/**
 * The only module allowed to translate between tldraw records and the Log
 * node model. Everything outside src/model speaks LogNode.
 *
 * `artifact` and `region` nodes have no canvas object yet (M1/M2); they are
 * schema-only and intentionally have no mapping here.
 */
import {
  isPageId,
  type TLDrawShape,
  type TLParentId,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'
import type { ChatCardShape } from '../shapes/ChatCard'
import type { InkGroupNode, InkSegment, LogNode } from './nodes'

function segmentBounds(segments: InkSegment[]): { w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const seg of segments) {
    for (const p of seg.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (minX === Infinity) return { w: 0, h: 0 }
  return { w: maxX - minX, h: maxY - minY }
}

/** Maps a tldraw shape to a LogNode, or null for shape types the model
 *  does not persist. */
export function shapeToNode(shape: TLShape): LogNode | null {
  const base = {
    id: shape.id as string,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    z: shape.index as string,
    parentId: isPageId(shape.parentId) ? null : (shape.parentId as string),
  }

  switch (shape.type) {
    case 'chat-card': {
      const s = shape as ChatCardShape
      return {
        ...base,
        type: 'chat',
        w: s.props.w,
        h: s.props.h,
        title: s.props.title,
        body: s.props.summary,
        timestamp: new Date(s.props.createdAt).toISOString(),
      }
    }
    case 'draw': {
      const s = shape as TLDrawShape
      const { segments, ...style } = s.props
      return {
        ...base,
        type: 'ink-group',
        // Draw shapes carry no w/h; bounds are derived from stroke points.
        ...segmentBounds(segments as InkSegment[]),
        segments: segments as InkSegment[],
        style,
      }
    }
    default:
      return null
  }
}

/** Maps a LogNode back to a tldraw shape partial for creation. `pageId` is
 *  the parent used for top-level nodes (parentId === null). */
export function nodeToShape(node: LogNode, pageId: TLParentId): TLShapePartial | null {
  const base = {
    id: node.id as TLShapeId,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    index: node.z as TLShapePartial['index'],
    parentId: node.parentId === null ? pageId : (node.parentId as TLParentId),
  }

  switch (node.type) {
    case 'chat':
      return {
        ...base,
        type: 'chat-card',
        props: {
          w: node.w,
          h: node.h,
          title: node.title,
          messages: [],
          summary: node.body,
          createdAt: new Date(node.timestamp).getTime(),
        },
      }
    case 'ink-group': {
      const ink = node as InkGroupNode
      return {
        ...base,
        type: 'draw',
        props: { ...ink.style, segments: ink.segments },
      }
    }
    default:
      return null
  }
}
