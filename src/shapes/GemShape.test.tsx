import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { GemShapeUtil, GemInner, DEFAULT_GEM_SIZE, type GemShape } from './GemShape'

function makeShape(overrides: Partial<GemShape['props']> = {}): GemShape {
  return {
    id: 'shape:gem-1' as GemShape['id'],
    typeName: 'shape',
    type: 'gem',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as GemShape['index'],
    parentId: 'page:page' as GemShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      w: DEFAULT_GEM_SIZE.w,
      h: DEFAULT_GEM_SIZE.h,
      name: 'Test Gem',
      description: 'A test gem',
      systemPrompt: '',
      tags: [],
      ...overrides,
    },
  }
}

describe('GemShapeUtil', () => {
  it('has type gem', () => {
    expect(GemShapeUtil.type).toBe('gem')
  })

  it('getDefaultProps returns expected defaults', () => {
    const util = new GemShapeUtil({} as never)
    const defaults = util.getDefaultProps()
    expect(defaults.name).toBe('')
    expect(defaults.description).toBe('')
    expect(defaults.systemPrompt).toBe('')
    expect(defaults.tags).toEqual([])
    expect(defaults.linkedTo).toEqual([])
    expect(defaults.w).toBe(DEFAULT_GEM_SIZE.w)
    expect(defaults.h).toBe(DEFAULT_GEM_SIZE.h)
  })
})

describe('GemInner', () => {
  it('renders gem name', () => {
    const shape = makeShape({ name: 'Coding Expert' })
    render(<GemInner shape={shape} />)
    expect(screen.getByText('Coding Expert')).toBeInTheDocument()
  })

  it('renders description', () => {
    const shape = makeShape({ description: 'Expert at writing clean code' })
    render(<GemInner shape={shape} />)
    expect(screen.getByText('Expert at writing clean code')).toBeInTheDocument()
  })

  it('renders tag chips', () => {
    const shape = makeShape({ tags: ['coding', 'expert'] })
    render(<GemInner shape={shape} />)
    expect(screen.getByText('coding')).toBeInTheDocument()
    expect(screen.getByText('expert')).toBeInTheDocument()
  })

  it('renders without linkedTo', () => {
    const shape = makeShape({ linkedTo: undefined })
    render(<GemInner shape={shape} />)
    expect(screen.getByText('Test Gem')).toBeInTheDocument()
  })
})
