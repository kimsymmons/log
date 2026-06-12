import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SkillShapeUtil, SkillInner, DEFAULT_SKILL_SIZE, type SkillShape } from './SkillShape'

function makeShape(overrides: Partial<SkillShape['props']> = {}): SkillShape {
  return {
    id: 'shape:skill-1' as SkillShape['id'],
    typeName: 'shape',
    type: 'skill',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as SkillShape['index'],
    parentId: 'page:page' as SkillShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      w: DEFAULT_SKILL_SIZE.w,
      h: DEFAULT_SKILL_SIZE.h,
      name: 'Test Skill',
      description: 'A test skill',
      invocationKey: '/test',
      tags: [],
      ...overrides,
    },
  }
}

describe('SkillShapeUtil', () => {
  it('has type skill', () => {
    expect(SkillShapeUtil.type).toBe('skill')
  })

  it('getDefaultProps returns expected defaults', () => {
    const util = new SkillShapeUtil({} as never)
    const defaults = util.getDefaultProps()
    expect(defaults.name).toBe('')
    expect(defaults.description).toBe('')
    expect(defaults.invocationKey).toBe('')
    expect(defaults.tags).toEqual([])
    expect(defaults.w).toBe(DEFAULT_SKILL_SIZE.w)
    expect(defaults.h).toBe(DEFAULT_SKILL_SIZE.h)
  })
})

describe('SkillInner', () => {
  it('renders skill name', () => {
    const shape = makeShape({ name: 'Code Review' })
    render(<SkillInner shape={shape} />)
    expect(screen.getByText('Code Review')).toBeInTheDocument()
  })

  it('renders description', () => {
    const shape = makeShape({ description: 'Reviews code for issues' })
    render(<SkillInner shape={shape} />)
    expect(screen.getByText('Reviews code for issues')).toBeInTheDocument()
  })

  it('renders invocation key', () => {
    const shape = makeShape({ invocationKey: '/review' })
    render(<SkillInner shape={shape} />)
    expect(screen.getByText('/review')).toBeInTheDocument()
  })

  it('renders tag chips', () => {
    const shape = makeShape({ tags: ['dev', 'qa'] })
    render(<SkillInner shape={shape} />)
    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.getByText('qa')).toBeInTheDocument()
  })

  it('renders without sourceUrl', () => {
    const shape = makeShape({ sourceUrl: undefined })
    render(<SkillInner shape={shape} />)
    expect(screen.getByText('Test Skill')).toBeInTheDocument()
  })
})
