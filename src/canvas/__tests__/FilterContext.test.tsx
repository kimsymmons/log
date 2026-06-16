import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import {
  shapeLogicalType,
  isShapeDimmed,
  FilterProvider,
  useFilter,
  type FilterKey,
  type FilterShape,
} from '../FilterContext'

const mk = (type: string, tags?: string[]): FilterShape => ({ type, props: { tags } })

describe('shapeLogicalType', () => {
  it('maps node shape types to logical filter keys', () => {
    expect(shapeLogicalType(mk('musing'))).toBe('idea')
    expect(shapeLogicalType(mk('draw'))).toBe('sketch')
    expect(shapeLogicalType(mk('agent-card'))).toBe('agent')
    expect(shapeLogicalType(mk('skill'))).toBe('skill')
    expect(shapeLogicalType(mk('mcp-server'))).toBe('mcp')
    expect(shapeLogicalType(mk('gem'))).toBe('gem')
    expect(shapeLogicalType(mk('doc'))).toBe('doc')
  })

  it('distinguishes Project from Thread by the "project" tag on chat-card', () => {
    expect(shapeLogicalType(mk('chat-card', ['project']))).toBe('project')
    expect(shapeLogicalType(mk('chat-card', ['misc']))).toBe('thread')
    expect(shapeLogicalType(mk('chat-card'))).toBe('thread')
  })

  it('returns null for non-filterable shapes', () => {
    expect(shapeLogicalType(mk('frame'))).toBeNull()
    expect(shapeLogicalType(mk('arrow'))).toBeNull()
    expect(shapeLogicalType(mk('markdown-artifact'))).toBeNull()
  })
})

describe('isShapeDimmed', () => {
  it('never dims when no filter is active (All)', () => {
    expect(isShapeDimmed(mk('musing'), new Set())).toBe(false)
  })

  it('dims shapes whose logical type is not in the active set', () => {
    const active = new Set<FilterKey>(['thread'])
    expect(isShapeDimmed(mk('chat-card'), active)).toBe(false)
    expect(isShapeDimmed(mk('musing'), active)).toBe(true)
    expect(isShapeDimmed(mk('chat-card', ['project']), active)).toBe(true)
  })

  it('supports multiple active types simultaneously', () => {
    const active = new Set<FilterKey>(['project', 'idea'])
    expect(isShapeDimmed(mk('chat-card', ['project']), active)).toBe(false)
    expect(isShapeDimmed(mk('musing'), active)).toBe(false)
    expect(isShapeDimmed(mk('gem'), active)).toBe(true)
  })

  it('never dims structural shapes even when a filter is active', () => {
    expect(isShapeDimmed(mk('frame'), new Set<FilterKey>(['thread']))).toBe(false)
  })
})

// Exercise the provider's reducer logic through a tiny harness.
function Harness() {
  const { activeTypes, filterActive, toggleType, clearTypes } = useFilter()
  return (
    <div>
      <span data-testid="active">{[...activeTypes].sort().join(',')}</span>
      <span data-testid="filterActive">{String(filterActive)}</span>
      <button onClick={() => toggleType('project')}>toggle-project</button>
      <button onClick={() => toggleType('idea')}>toggle-idea</button>
      <button onClick={clearTypes}>clear</button>
    </div>
  )
}

describe('FilterProvider', () => {
  const setup = () =>
    render(
      <FilterProvider>
        <Harness />
      </FilterProvider>,
    )

  it('starts in All (no active types)', () => {
    setup()
    expect(screen.getByTestId('active').textContent).toBe('')
    expect(screen.getByTestId('filterActive').textContent).toBe('false')
  })

  it('selecting a type activates it and leaves All', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('toggle-project')) })
    expect(screen.getByTestId('active').textContent).toBe('project')
    expect(screen.getByTestId('filterActive').textContent).toBe('true')
  })

  it('supports multi-select', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('toggle-project')) })
    act(() => { fireEvent.click(screen.getByText('toggle-idea')) })
    expect(screen.getByTestId('active').textContent).toBe('idea,project')
  })

  it('toggling a selected type off removes it', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('toggle-project')) })
    act(() => { fireEvent.click(screen.getByText('toggle-project')) })
    expect(screen.getByTestId('active').textContent).toBe('')
    expect(screen.getByTestId('filterActive').textContent).toBe('false')
  })

  it('clear returns to All', () => {
    setup()
    act(() => { fireEvent.click(screen.getByText('toggle-project')) })
    act(() => { fireEvent.click(screen.getByText('toggle-idea')) })
    act(() => { fireEvent.click(screen.getByText('clear')) })
    expect(screen.getByTestId('active').textContent).toBe('')
  })
})
