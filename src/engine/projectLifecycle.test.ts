import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  promoteToActive,
  demoteToStale,
  setManualStatus,
  type LifecycleShape,
  type SignalPayload,
  STALE_THRESHOLD_MS,
  HIGHLIGHT_DURATION_MS,
} from './projectLifecycle'

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

function makeShape(overrides: Partial<LifecycleShape> = {}): LifecycleShape {
  return {
    props: { status: 'active', updatedAt: Date.now(), ...overrides.props },
    meta: { ...overrides.meta },
  }
}

describe('projectLifecycle', () => {
  const NOW = 1_700_000_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── promoteToActive ──────────────────────────────────────────────────────

  describe('promoteToActive', () => {
    it('sets status to active', () => {
      const shape = makeShape({ props: { status: 'stale', updatedAt: NOW } })
      const signal: SignalPayload = { source: 'linear', id: 'LIN-1' }
      const result = promoteToActive(shape, signal)
      expect(result.props.status).toBe('active')
    })

    it('sets meta.stateChangedAt to now', () => {
      const shape = makeShape({ props: { status: 'paused', updatedAt: NOW } })
      const result = promoteToActive(shape, { source: 'commit', id: 'abc123' })
      expect(result.meta.stateChangedAt).toBe(NOW)
    })

    it('sets meta.highlightUntil to now + HIGHLIGHT_DURATION_MS', () => {
      const shape = makeShape({ props: { status: 'stale', updatedAt: NOW } })
      const result = promoteToActive(shape, { source: 'agent', id: 'agent-42' })
      expect(result.meta.highlightUntil).toBe(NOW + HIGHLIGHT_DURATION_MS)
    })

    it('does not mutate the input shape', () => {
      const shape = makeShape({ props: { status: 'stale', updatedAt: NOW } })
      const originalStatus = shape.props.status
      promoteToActive(shape, { source: 'linear', id: 'x' })
      expect(shape.props.status).toBe(originalStatus)
    })

    it('accepts all valid signal sources', () => {
      const sources: SignalPayload['source'][] = ['linear', 'agent', 'commit']
      for (const source of sources) {
        const shape = makeShape({ props: { status: 'stale', updatedAt: NOW } })
        const result = promoteToActive(shape, { source, id: 'x' })
        expect(result.props.status).toBe('active')
      }
    })
  })

  // ── demoteToStale ────────────────────────────────────────────────────────

  describe('demoteToStale', () => {
    it('sets status to stale when updatedAt is older than 14 days', () => {
      const shape = makeShape({
        props: { status: 'active', updatedAt: NOW - FOURTEEN_DAYS_MS - 1 },
      })
      const result = demoteToStale(shape)
      expect(result.props.status).toBe('stale')
    })

    it('sets meta.stateChangedAt when demoting', () => {
      const shape = makeShape({
        props: { status: 'active', updatedAt: NOW - FOURTEEN_DAYS_MS - 1 },
      })
      const result = demoteToStale(shape)
      expect(result.meta.stateChangedAt).toBe(NOW)
    })

    it('sets meta.highlightUntil when demoting', () => {
      const shape = makeShape({
        props: { status: 'active', updatedAt: NOW - FOURTEEN_DAYS_MS - 1 },
      })
      const result = demoteToStale(shape)
      expect(result.meta.highlightUntil).toBe(NOW + HIGHLIGHT_DURATION_MS)
    })

    it('does NOT change status when updatedAt is exactly 14 days ago', () => {
      const shape = makeShape({
        props: { status: 'active', updatedAt: NOW - FOURTEEN_DAYS_MS },
      })
      const result = demoteToStale(shape)
      expect(result.props.status).toBe('active')
    })

    it('does NOT change status when updatedAt is recent', () => {
      const shape = makeShape({
        props: { status: 'active', updatedAt: NOW - 1000 },
      })
      const result = demoteToStale(shape)
      expect(result.props.status).toBe('active')
    })

    it('does NOT touch meta when shape is not stale', () => {
      const shape = makeShape({
        props: { status: 'active', updatedAt: NOW - 1000 },
        meta: { stateChangedAt: 999 },
      })
      const result = demoteToStale(shape)
      expect(result.meta.stateChangedAt).toBe(999)
      expect(result.meta.highlightUntil).toBeUndefined()
    })

    it('uses STALE_THRESHOLD_MS constant (14 days)', () => {
      expect(STALE_THRESHOLD_MS).toBe(FOURTEEN_DAYS_MS)
    })
  })

  // ── setManualStatus ──────────────────────────────────────────────────────

  describe('setManualStatus', () => {
    it('sets status to paused', () => {
      const shape = makeShape()
      const result = setManualStatus(shape, 'paused')
      expect(result.props.status).toBe('paused')
    })

    it('sets status to complete', () => {
      const shape = makeShape()
      const result = setManualStatus(shape, 'complete')
      expect(result.props.status).toBe('complete')
    })

    it('sets meta.stateChangedAt to now', () => {
      const shape = makeShape()
      const result = setManualStatus(shape, 'paused')
      expect(result.meta.stateChangedAt).toBe(NOW)
    })

    it('sets meta.highlightUntil to now + HIGHLIGHT_DURATION_MS', () => {
      const shape = makeShape()
      const result = setManualStatus(shape, 'complete')
      expect(result.meta.highlightUntil).toBe(NOW + HIGHLIGHT_DURATION_MS)
    })

    it('does not mutate the input shape', () => {
      const shape = makeShape()
      const original = shape.props.status
      setManualStatus(shape, 'paused')
      expect(shape.props.status).toBe(original)
    })
  })

  // ── highlight flag behaviour ─────────────────────────────────────────────

  describe('highlight flag behaviour', () => {
    it('highlightUntil is 5 seconds after the transition', () => {
      expect(HIGHLIGHT_DURATION_MS).toBe(5000)
      const shape = makeShape({ props: { status: 'stale', updatedAt: NOW } })
      const result = promoteToActive(shape, { source: 'linear', id: 'x' })
      expect(result.meta.highlightUntil! - result.meta.stateChangedAt!).toBe(5000)
    })

    it('highlight meta overwrites previous values on re-transition', () => {
      const shape = makeShape({
        props: { status: 'stale', updatedAt: NOW },
        meta: { stateChangedAt: NOW - 10_000, highlightUntil: NOW - 5_000 },
      })
      const result = promoteToActive(shape, { source: 'agent', id: 'y' })
      expect(result.meta.stateChangedAt).toBe(NOW)
      expect(result.meta.highlightUntil).toBe(NOW + 5000)
    })
  })
})
