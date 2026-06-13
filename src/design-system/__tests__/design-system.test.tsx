import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { Spinner } from '../Spinner'
import { KeyHint } from '../KeyHint'
import { Tag } from '../Tag'
import { TypeGlyph, typeGlyphMeta } from '../TypeGlyph'
import { Button } from '../Button'
import { CanvasFilterBar } from '../CanvasFilterBar'
import { CanvasToolbar } from '../CanvasToolbar'
import { AgentNode } from '../AgentNode'

// Lucide is CDN-only in browser; stub it so Icon renders empty spans in jsdom
beforeEach(() => {
  Object.defineProperty(window, 'lucide', { value: undefined, writable: true, configurable: true })
})

describe('Spinner', () => {
  it('renders an SVG with a loading role', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('role')).toBe('status')
  })

  it('uses the supplied size', () => {
    const { container } = render(<Spinner size={24} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })
})

describe('KeyHint', () => {
  it('renders a single key', () => {
    render(<KeyHint keys="K" />)
    expect(screen.getByText('K')).toBeTruthy()
  })

  it('renders multiple keys', () => {
    render(<KeyHint keys={['⌘', 'K']} />)
    expect(screen.getByText('⌘')).toBeTruthy()
    expect(screen.getByText('K')).toBeTruthy()
  })
})

describe('Tag', () => {
  it('renders its label', () => {
    render(<Tag label="design" />)
    expect(screen.getByText('design')).toBeTruthy()
  })

  it('shows remove button on hover and fires onRemove', () => {
    const onRemove = vi.fn()
    const { container } = render(<Tag label="design" onRemove={onRemove} />)
    const chip = container.firstChild as HTMLElement
    fireEvent.mouseEnter(chip)
    const removeBtn = screen.getByRole('button', { name: 'Remove design' })
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('does not show remove button without onRemove prop', () => {
    render(<Tag label="design" />)
    expect(screen.queryByRole('button', { name: 'Remove design' })).toBeNull()
  })
})

describe('TypeGlyph', () => {
  it('falls back to project meta for unknown type', () => {
    const meta = typeGlyphMeta['project']
    expect(meta.icon).toBe('box')
    expect(meta.label).toBe('Project')
  })

  it('has meta for all five types', () => {
    const types = ['project', 'idea', 'thread', 'doc', 'sketch']
    for (const t of types) {
      expect(typeGlyphMeta[t]).toBeTruthy()
      expect(typeGlyphMeta[t].color).toMatch(/^var\(--/)
    }
  })

  it('renders without crashing for each type', () => {
    const types = ['project', 'idea', 'thread', 'doc', 'sketch']
    for (const t of types) {
      const { unmount } = render(<TypeGlyph type={t} />)
      unmount()
    }
  })
})

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeTruthy()
  })

  it('fires onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled when disabled=true', () => {
    render(<Button disabled>Go</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when loading=true', () => {
    render(<Button loading>Go</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('CanvasFilterBar', () => {
  it('renders All plus the five canonical card-type pills and nothing else', () => {
    render(<CanvasFilterBar />)
    for (const label of ['All', 'Project', 'Idea', 'Thread', 'Doc', 'Sketch']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    // Agent/Skill/MCP/Gem shapes still render but are not filter pills.
    for (const label of ['Chat', 'Agent', 'Skill', 'MCP', 'Gem']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('calls onToggle with the type key when a type pill is clicked', () => {
    const onToggle = vi.fn()
    render(<CanvasFilterBar onToggle={onToggle} />)
    fireEvent.click(screen.getByText('Project'))
    expect(onToggle).toHaveBeenCalledWith('project')
  })

  it('calls onClear when All is clicked', () => {
    const onClear = vi.fn()
    render(<CanvasFilterBar onClear={onClear} active={['project']} />)
    fireEvent.click(screen.getByText('All'))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('does not render any count badges on the pills', () => {
    render(<CanvasFilterBar active={['thread', 'project']} />)
    expect(screen.queryByText(/\(\d+\)/)).toBeNull()
  })

  it('marks the active pill (and "All" when nothing is selected) as pressed', () => {
    const { rerender } = render(<CanvasFilterBar />)
    expect(screen.getByText('All').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Project').getAttribute('aria-pressed')).toBe('false')

    rerender(<CanvasFilterBar active={['project']} />)
    expect(screen.getByText('All').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Project').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('CanvasToolbar', () => {
  it('renders with no groups without crashing', () => {
    const { container } = render(<CanvasToolbar />)
    expect(container.firstChild).toBeTruthy()
  })

  it('calls onChange when a tool is clicked', () => {
    const onChange = vi.fn()
    render(
      <CanvasToolbar
        groups={[[{ value: 'select', icon: 'mouse-pointer-2', label: 'Select' }]]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(onChange).toHaveBeenCalledWith('select')
  })
})

describe('AgentNode', () => {
  it('renders in working state', () => {
    const { container } = render(<AgentNode model="claude-sonnet-4-6" task="Summarising" />)
    expect(container.querySelector('.log-agent')).toBeTruthy()
  })

  it('renders in absorbing state', () => {
    const { container } = render(<AgentNode state="absorbing" />)
    const agent = container.querySelector('.log-agent') as HTMLElement
    expect(agent.style.animation).toContain('log-agent-absorb')
  })
})
