import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MusingShapeUtil, MusingInner, DEFAULT_MUSING_SIZE, type MusingShape } from './MusingShape'

function makeShape(overrides: Partial<MusingShape['props']> = {}): MusingShape {
  return {
    id: 'shape:musing-1' as MusingShape['id'],
    typeName: 'shape',
    type: 'musing',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as MusingShape['index'],
    parentId: 'page:page' as MusingShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      w: DEFAULT_MUSING_SIZE.w,
      h: DEFAULT_MUSING_SIZE.h,
      text: '',
      tags: [],
      createdAt: 1000000,
      linkedTo: [],
      ...overrides,
    },
  }
}

describe('MusingShapeUtil', () => {
  it('has type musing', () => {
    expect(MusingShapeUtil.type).toBe('musing')
  })

  it('getDefaultProps returns expected defaults', () => {
    const util = new MusingShapeUtil({} as never)
    const defaults = util.getDefaultProps()
    expect(defaults.text).toBe('')
    expect(defaults.tags).toEqual([])
    expect(defaults.linkedTo).toEqual([])
    expect(typeof defaults.createdAt).toBe('number')
    expect(defaults.w).toBe(DEFAULT_MUSING_SIZE.w)
    expect(defaults.h).toBe(DEFAULT_MUSING_SIZE.h)
  })
})

describe('MusingInner', () => {
  it('renders text content', () => {
    const shape = makeShape({ text: 'Hello world' })
    render(<MusingInner shape={shape} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders tag chips', () => {
    const shape = makeShape({ tags: ['idea', 'reflection'] })
    render(<MusingInner shape={shape} />)
    expect(screen.getByText('idea')).toBeInTheDocument()
    expect(screen.getByText('reflection')).toBeInTheDocument()
  })

  it('shows placeholder when text is empty', () => {
    const shape = makeShape({ text: '' })
    render(<MusingInner shape={shape} />)
    expect(screen.getByText('Write a musing…')).toBeInTheDocument()
  })

  it('clicking text area switches to edit mode', () => {
    const shape = makeShape({ text: 'Some thought' })
    render(<MusingInner shape={shape} />)
    const textEl = screen.getByText('Some thought')
    fireEvent.click(textEl)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('textarea has correct initial value in edit mode', () => {
    const shape = makeShape({ text: 'My thought' })
    render(<MusingInner shape={shape} />)
    fireEvent.click(screen.getByText('My thought'))
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(ta.value).toBe('My thought')
  })

  it('does not render an AI summary button', () => {
    const shape = makeShape({ text: 'x' })
    render(<MusingInner shape={shape} />)
    expect(screen.queryByRole('button', { name: /summarise|summary|ai/i })).toBeNull()
  })
})
