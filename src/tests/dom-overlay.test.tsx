/**
 * Q2: Is DOM overlay feasible for card expansion?
 *
 * Confirms that ChatCard renders a real HTML element (not just SVG) inside
 * the tldraw shape via HTMLContainer. If this test passes, live React
 * components can live inside canvas shapes.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ChatCardShapeUtil } from '../shapes/ChatCard'
import type { ChatCardShape } from '../shapes/ChatCard'

const mockShape: ChatCardShape = {
  id: 'shape:test-dom' as ChatCardShape['id'],
  type: 'chat-card',
  x: 0,
  y: 0,
  rotation: 0,
  index: 'a1' as ChatCardShape['index'],
  parentId: 'page:page' as ChatCardShape['parentId'],
  isLocked: false,
  opacity: 1,
  meta: {},
  typeName: 'shape',
  props: {
    w: 240,
    h: 120,
    title: 'DOM Overlay Test',
    body: 'This is a real React div inside a tldraw shape.',
    timestamp: '2026-06-11T00:00:00.000Z',
  },
}

describe('ChatCard DOM overlay', () => {
  it('renders a real HTML div (not just SVG) with title text', () => {
    const util = Object.create(ChatCardShapeUtil.prototype) as ChatCardShapeUtil
    const element = util.component(mockShape)

    render(<>{element}</>)

    // If DOM overlay works, the title text is in a real DOM node
    expect(screen.getByText('DOM Overlay Test')).toBeTruthy()
  })

  it('renders body text inside the shape', () => {
    const util = Object.create(ChatCardShapeUtil.prototype) as ChatCardShapeUtil
    const element = util.component(mockShape)

    render(<>{element}</>)

    expect(screen.getByText('This is a real React div inside a tldraw shape.')).toBeTruthy()
  })

  it('the rendered node is an HTMLElement (not SVGElement)', () => {
    const util = Object.create(ChatCardShapeUtil.prototype) as ChatCardShapeUtil
    const element = util.component(mockShape)

    const { container } = render(<>{element}</>)

    // HTMLContainer renders a <div> — confirm it is an HTMLDivElement
    const titleEl = container.querySelector('div')
    expect(titleEl).not.toBeNull()
    expect(titleEl instanceof HTMLElement).toBe(true)

    // Confirm no SVG wrapper (DOM overlay means HTML, not SVG)
    const svgEl = container.querySelector('svg')
    expect(svgEl).toBeNull()
  })
})
