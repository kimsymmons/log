#!/usr/bin/env npx tsx
import Anthropic from '@anthropic-ai/sdk'
import { buildLinkingPrompt, parseLinkingResponse, LINKING_MODEL } from '../../linking'
import { corpus } from './linking-corpus'

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY not set, skipping eval')
  process.exit(0)
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type EvalResult = {
  entry: (typeof corpus)[number]
  linked: boolean
  type?: string
  confidence?: number
  rationale?: string
}

async function scoreLinkPair(
  source: { id: string; content: string },
  candidate: { id: string; content: string }
): Promise<{ linked: boolean; type?: string; confidence?: number; rationale?: string }> {
  const prompt = buildLinkingPrompt(source.content, [{ id: candidate.id, content: candidate.content }])

  const resp = await anthropic.messages.create({
    model: LINKING_MODEL,
    max_tokens: 512,
    system:
      'You identify relationships between artifacts in a spatial knowledge canvas. Be precise — only link when the relationship is clear and meaningful. Respond only with valid JSON, no markdown.',
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = resp.content[0]?.type === 'text' ? (resp.content[0].text ?? '') : ''
  const links = parseLinkingResponse(raw, new Set([candidate.id]))

  if (links.length === 0) return { linked: false }
  const link = links[0]
  return { linked: true, type: link.type, confidence: link.confidence, rationale: link.rationale }
}

async function main() {
  console.log(`\nRunning linking eval on ${corpus.length} pairs with ${LINKING_MODEL}\n`)
  console.log('─'.repeat(72))

  const results: EvalResult[] = []

  for (const entry of corpus) {
    process.stdout.write(`  ${entry.source.id} → ${entry.candidate.id} ... `)
    try {
      const r = await scoreLinkPair(entry.source, entry.candidate)
      results.push({ entry, ...r })

      const correct =
        r.linked === entry.expected.shouldLink &&
        (!entry.expected.shouldLink || !entry.expected.type || r.type === entry.expected.type) &&
        (!entry.expected.minConfidence || !r.confidence || r.confidence >= entry.expected.minConfidence)

      const status = correct ? '✓ PASS' : '✗ FAIL'
      const detail = r.linked
        ? `linked=${r.type} conf=${r.confidence?.toFixed(2)}`
        : 'no link'
      console.log(`${status}  [${detail}]`)
      if (!correct) {
        console.log(`         expected: shouldLink=${entry.expected.shouldLink} type=${entry.expected.type ?? 'any'}`)
        console.log(`         rationale: ${r.rationale ?? '—'}`)
        console.log(`         note: ${entry.note}`)
      }
    } catch (err) {
      console.log(`ERROR: ${err}`)
      results.push({ entry, linked: false })
    }
  }

  console.log('\n' + '─'.repeat(72))

  // Compute precision, recall, F1
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const r of results) {
    const predicted = r.linked
    const actual = r.entry.expected.shouldLink
    if (predicted && actual) tp++
    else if (predicted && !actual) fp++
    else if (!predicted && actual) fn++
    else tn++
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  console.log(`\nResults: TP=${tp} FP=${fp} FN=${fn} TN=${tn}`)
  console.log(`Precision: ${(precision * 100).toFixed(1)}%`)
  console.log(`Recall:    ${(recall * 100).toFixed(1)}%`)
  console.log(`F1:        ${(f1 * 100).toFixed(1)}%`)

  const passed = f1 >= 0.7
  console.log(`\nF1 threshold (0.70): ${passed ? '✓ PASS' : '✗ FAIL'}\n`)

  process.exit(passed ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
