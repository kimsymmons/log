import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { McpServerShapeUtil, McpServerInner, DEFAULT_MCP_SIZE, type McpServerShape } from './McpServerShape'

function makeShape(overrides: Partial<McpServerShape['props']> = {}): McpServerShape {
  return {
    id: 'shape:mcp-1' as McpServerShape['id'],
    typeName: 'shape',
    type: 'mcp-server',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as McpServerShape['index'],
    parentId: 'page:page' as McpServerShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      w: DEFAULT_MCP_SIZE.w,
      h: DEFAULT_MCP_SIZE.h,
      name: 'Test MCP',
      description: 'A test MCP server',
      endpoint: 'http://localhost:8080',
      status: 'connected',
      tools: [],
      tags: [],
      ...overrides,
    },
  }
}

describe('McpServerShapeUtil', () => {
  it('has type mcp-server', () => {
    expect(McpServerShapeUtil.type).toBe('mcp-server')
  })

  it('getDefaultProps returns expected defaults', () => {
    const util = new McpServerShapeUtil({} as never)
    const defaults = util.getDefaultProps()
    expect(defaults.name).toBe('')
    expect(defaults.status).toBe('disconnected')
    expect(defaults.tools).toEqual([])
    expect(defaults.tags).toEqual([])
    expect(defaults.w).toBe(DEFAULT_MCP_SIZE.w)
    expect(defaults.h).toBe(DEFAULT_MCP_SIZE.h)
  })
})

describe('McpServerInner', () => {
  it('renders server name', () => {
    const shape = makeShape({ name: 'GitHub MCP' })
    render(<McpServerInner shape={shape} />)
    expect(screen.getByText('GitHub MCP')).toBeInTheDocument()
  })

  it('renders description', () => {
    const shape = makeShape({ description: 'GitHub integration' })
    render(<McpServerInner shape={shape} />)
    expect(screen.getByText('GitHub integration')).toBeInTheDocument()
  })

  it('renders up to 3 tool names', () => {
    const shape = makeShape({ tools: ['read_file', 'write_file', 'list_dir', 'delete_file'] })
    render(<McpServerInner shape={shape} />)
    expect(screen.getByText('read_file')).toBeInTheDocument()
    expect(screen.getByText('write_file')).toBeInTheDocument()
    expect(screen.getByText('list_dir')).toBeInTheDocument()
    expect(screen.queryByText('delete_file')).toBeNull()
  })

  it('renders overflow count when more than 3 tools', () => {
    const shape = makeShape({ tools: ['a', 'b', 'c', 'd', 'e'] })
    render(<McpServerInner shape={shape} />)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('does not render overflow when 3 or fewer tools', () => {
    const shape = makeShape({ tools: ['a', 'b', 'c'] })
    render(<McpServerInner shape={shape} />)
    expect(screen.queryByText(/\+\d+ more/)).toBeNull()
  })

  it('renders tag chips', () => {
    const shape = makeShape({ tags: ['infra', 'api'] })
    render(<McpServerInner shape={shape} />)
    expect(screen.getByText('infra')).toBeInTheDocument()
    expect(screen.getByText('api')).toBeInTheDocument()
  })

  it('shows connected status indicator', () => {
    const shape = makeShape({ status: 'connected' })
    const { container } = render(<McpServerInner shape={shape} />)
    expect(container.querySelector('[data-status="connected"]')).toBeTruthy()
  })

  it('shows error status indicator', () => {
    const shape = makeShape({ status: 'error' })
    const { container } = render(<McpServerInner shape={shape} />)
    expect(container.querySelector('[data-status="error"]')).toBeTruthy()
  })
})
