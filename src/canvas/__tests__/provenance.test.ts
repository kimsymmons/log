import { describe, it, expect } from 'vitest'
import { provenancePairs, type ProvenanceShapeView } from '../provenance'

const musing: ProvenanceShapeView = { id: 'shape:musing-1', type: 'musing', props: {} }
const chatFrom = (id: string, linkedShapeId?: string): ProvenanceShapeView => ({
  id,
  type: 'chat-card',
  props: linkedShapeId ? { linkedShapeId } : {},
})

describe('provenancePairs', () => {
  it('links a chat-card back to the source shape it was spawned from', () => {
    const pairs = provenancePairs([musing, chatFrom('shape:chat-1', 'shape:musing-1')])
    expect(pairs).toEqual([{ chatId: 'shape:chat-1', sourceId: 'shape:musing-1' }])
  })

  it('ignores chat-cards without a linkedShapeId', () => {
    expect(provenancePairs([musing, chatFrom('shape:chat-1')])).toEqual([])
  })

  it('skips links to a source that is no longer on the page', () => {
    // e.g. the source node was not persisted across a reload.
    expect(provenancePairs([chatFrom('shape:chat-1', 'shape:gone')])).toEqual([])
  })

  it('skips self-links', () => {
    expect(provenancePairs([chatFrom('shape:chat-1', 'shape:chat-1')])).toEqual([])
  })

  it('ignores non-chat shapes even if they carry a linkedShapeId', () => {
    const weird: ProvenanceShapeView = { id: 'shape:x', type: 'musing', props: { linkedShapeId: 'shape:musing-1' } }
    expect(provenancePairs([musing, weird])).toEqual([])
  })

  it('handles a chat spawned from another chat (chat → chat provenance)', () => {
    const pairs = provenancePairs([
      chatFrom('shape:chat-1'),
      chatFrom('shape:chat-2', 'shape:chat-1'),
    ])
    expect(pairs).toEqual([{ chatId: 'shape:chat-2', sourceId: 'shape:chat-1' }])
  })
})
