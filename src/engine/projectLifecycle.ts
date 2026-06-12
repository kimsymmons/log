export type LifecycleStatus = 'active' | 'paused' | 'complete' | 'stale'

export interface LifecycleShape {
  props: {
    status: LifecycleStatus
    updatedAt: number
  }
  meta: {
    stateChangedAt?: number
    highlightUntil?: number
    [key: string]: unknown
  }
}

export interface SignalPayload {
  source: 'linear' | 'agent' | 'commit'
  id: string
}

export const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000
export const HIGHLIGHT_DURATION_MS = 5000

function withStatusChange<S extends LifecycleShape>(
  shape: S,
  status: LifecycleStatus,
): S {
  const now = Date.now()
  return {
    ...shape,
    props: { ...shape.props, status },
    meta: {
      ...shape.meta,
      stateChangedAt: now,
      highlightUntil: now + HIGHLIGHT_DURATION_MS,
    },
  }
}

export function promoteToActive<S extends LifecycleShape>(
  shape: S,
  _signal: SignalPayload,
): S {
  return withStatusChange(shape, 'active')
}

export function demoteToStale<S extends LifecycleShape>(shape: S): S {
  const age = Date.now() - shape.props.updatedAt
  if (age <= STALE_THRESHOLD_MS) return { ...shape, props: { ...shape.props }, meta: { ...shape.meta } }
  return withStatusChange(shape, 'stale')
}

export function setManualStatus<S extends LifecycleShape>(
  shape: S,
  status: 'paused' | 'complete',
): S {
  return withStatusChange(shape, status)
}
