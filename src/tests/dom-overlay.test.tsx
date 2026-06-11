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
    messages: [],
    summary: 'A summary of the chat.',
    createdAt: Date.now(),
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

  it('renders summary text inside the shape in collapsed state', () => {
    const util = Object.create(ChatCardShapeUtil.prototype) as ChatCardShapeUtil
    const element = util.component(mockShape)

    render(<>{element}</>)

    expect(screen.getByText('A summary of the chat.')).toBeTruthy()
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
