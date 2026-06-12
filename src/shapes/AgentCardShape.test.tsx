import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { AgentCardShapeUtil, AgentCardInner, DEFAULT_AGENT_CARD_SIZE, type AgentCardShape } from './AgentCardShape'

function makeShape(overrides: Partial<AgentCardShape['props']> = {}): AgentCardShape {
  return {
    id: 'shape:agent-1' as AgentCardShape['id'],
    typeName: 'shape',
    type: 'agent-card',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as AgentCardShape['index'],
    parentId: 'page:page' as AgentCardShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      w: DEFAULT_AGENT_CARD_SIZE.w,
      h: DEFAULT_AGENT_CARD_SIZE.h,
      agentName: 'Test Agent',
      model: 'claude-sonnet-4-6',
      status: 'idle',
      taskDescription: 'Doing something useful',
      tags: [],
      startedAt: 1_000_000,
      ...overrides,
    },
  }
}

describe('AgentCardShapeUtil', () => {
  it('has type agent-card', () => {
    expect(AgentCardShapeUtil.type).toBe('agent-card')
  })

  it('getDefaultProps returns expected defaults', () => {
    const util = new AgentCardShapeUtil({} as never)
    const defaults = util.getDefaultProps()
    expect(defaults.agentName).toBe('')
    expect(defaults.model).toBe('claude-sonnet-4-6')
    expect(defaults.status).toBe('idle')
    expect(defaults.taskDescription).toBe('')
    expect(defaults.tags).toEqual([])
    expect(typeof defaults.startedAt).toBe('number')
    expect(defaults.w).toBe(DEFAULT_AGENT_CARD_SIZE.w)
    expect(defaults.h).toBe(DEFAULT_AGENT_CARD_SIZE.h)
  })

  it('props schema has required fields', () => {
    expect(AgentCardShapeUtil.props).toHaveProperty('agentName')
    expect(AgentCardShapeUtil.props).toHaveProperty('model')
    expect(AgentCardShapeUtil.props).toHaveProperty('status')
    expect(AgentCardShapeUtil.props).toHaveProperty('taskDescription')
    expect(AgentCardShapeUtil.props).toHaveProperty('tags')
    expect(AgentCardShapeUtil.props).toHaveProperty('startedAt')
    expect(AgentCardShapeUtil.props).toHaveProperty('linkedTicket')
    expect(AgentCardShapeUtil.props).toHaveProperty('linkedChatId')
  })
})

describe('AgentCardInner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders agent name', () => {
    const shape = makeShape({ agentName: 'Planner' })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('Planner')).toBeInTheDocument()
  })

  it('renders model name', () => {
    const shape = makeShape({ model: 'claude-opus-4-8' })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('claude-opus-4-8')).toBeInTheDocument()
  })

  it('renders task description', () => {
    const shape = makeShape({ taskDescription: 'Analyse the logs and summarise findings' })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('Analyse the logs and summarise findings')).toBeInTheDocument()
  })

  it('renders tag chips', () => {
    const shape = makeShape({ tags: ['research', 'async'] })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('research')).toBeInTheDocument()
    expect(screen.getByText('async')).toBeInTheDocument()
  })

  it('renders linked ticket when provided', () => {
    const shape = makeShape({ linkedTicket: 'PEO-134' })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('PEO-134')).toBeInTheDocument()
  })

  it('does not render linked ticket when absent', () => {
    const shape = makeShape({ linkedTicket: undefined })
    render(<AgentCardInner shape={shape} />)
    expect(screen.queryByText(/PEO-/)).toBeNull()
  })

  it('shows running status indicator', () => {
    const shape = makeShape({ status: 'running' })
    const { container } = render(<AgentCardInner shape={shape} />)
    expect(container.querySelector('[data-status="running"]')).toBeTruthy()
  })

  it('shows idle status indicator', () => {
    const shape = makeShape({ status: 'idle' })
    const { container } = render(<AgentCardInner shape={shape} />)
    expect(container.querySelector('[data-status="idle"]')).toBeTruthy()
  })

  it('shows complete status indicator', () => {
    const shape = makeShape({ status: 'complete' })
    const { container } = render(<AgentCardInner shape={shape} />)
    expect(container.querySelector('[data-status="complete"]')).toBeTruthy()
  })

  it('shows error status indicator', () => {
    const shape = makeShape({ status: 'error' })
    const { container } = render(<AgentCardInner shape={shape} />)
    expect(container.querySelector('[data-status="error"]')).toBeTruthy()
  })

  it('updates elapsed time every second', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    const shape = makeShape({ startedAt: now - 60_000, status: 'running' })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('1m')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('2m')).toBeInTheDocument()
  })

  it('shows elapsed time for idle and complete states', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    const shape = makeShape({ startedAt: now - 90_000, status: 'complete' })
    render(<AgentCardInner shape={shape} />)
    expect(screen.getByText('1m')).toBeInTheDocument()
  })
})
