import type { LinkType } from '../../linking'

export type CorpusEntry = {
  source: { id: string; content: string }
  candidate: { id: string; content: string }
  expected: {
    shouldLink: boolean
    type?: LinkType
    minConfidence?: number
  }
  note: string
}

export const corpus: CorpusEntry[] = [
  // ── True positives: clear links ──────────────────────────────────────────

  {
    source: {
      id: 'src-tp-1',
      content: `[chat] Sprint 14 planning
We decided to move the auth service to JWT tokens. Timeline: two weeks.
Alice owns the backend changes, Bob takes the frontend. Need to deprecate
the old session cookie approach by end of sprint.`,
    },
    candidate: {
      id: 'cand-tp-1',
      content: `[chat] Auth service migration — follow-up
Picked up from the sprint planning. Backend JWT implementation is done.
Still waiting on Bob's frontend PR. Need to update the docs once merged.`,
    },
    expected: { shouldLink: true, type: 'continuation', minConfidence: 0.7 },
    note: 'Direct continuation: follow-up chat explicitly references the planning session',
  },

  {
    source: {
      id: 'src-tp-2',
      content: `[note] Q3 OKRs — Design team
Objective: ship the new onboarding flow by September.
KR1: Reduce drop-off in step 2 from 40% to 20%.
KR2: Get CSAT score above 4.2 on first-week survey.
KR3: Launch mobile-responsive version.`,
    },
    candidate: {
      id: 'cand-tp-2',
      content: `[note] Onboarding redesign project brief
Project: redesign the user onboarding flow for Q3.
Goal: reduce step-2 drop-off by half. Owner: design team.
Scope: web and mobile. Deadline: end of August for design handoff.`,
    },
    expected: { shouldLink: true, type: 'same-project', minConfidence: 0.7 },
    note: 'Both belong to same Q3 onboarding initiative with explicit shared goals',
  },

  {
    source: {
      id: 'src-tp-3',
      content: `[chat] SQLite WAL mode investigation
Ran benchmarks on our local DB: WAL mode gives ~3x throughput improvement on
concurrent reads. Write latency is slightly higher (+8ms avg). We should
enable it in production. See attached bench results.`,
    },
    candidate: {
      id: 'cand-tp-3',
      content: `[note] SQLite performance tuning — WAL mode
WAL (Write-Ahead Logging) enables concurrent readers without blocking writers.
Best for read-heavy workloads. Enable with: PRAGMA journal_mode=WAL;
Trade-off: slightly higher write latency. Recommended for our use case.`,
    },
    expected: { shouldLink: true, type: 'same-topic', minConfidence: 0.65 },
    note: 'Both discuss SQLite WAL mode; reader of investigation benefits from the reference note',
  },

  // ── True negatives: unrelated content ────────────────────────────────────

  {
    source: {
      id: 'src-tn-1',
      content: `[chat] Team dinner — venue suggestions
We're thinking Zuni Café or Cotogna for the team dinner next Friday.
Both are within budget. Alice prefers Italian, most others are flexible.
Let's do a quick poll in Slack.`,
    },
    candidate: {
      id: 'cand-tn-1',
      content: `[note] Q3 OKRs — Engineering team
Objective: reduce p95 API latency below 200ms.
KR1: Profile and fix top 3 slow endpoints.
KR2: Add caching layer for artifact reads.
KR3: Ship DB index improvements.`,
    },
    expected: { shouldLink: false },
    note: 'Team dinner vs engineering OKRs: completely different domains, no relationship',
  },

  {
    source: {
      id: 'src-tn-2',
      content: `[sketch] Wireframe — mobile nav bar
Low-fidelity wireframe for the bottom navigation bar on mobile.
Four tabs: Home, Search, Notifications, Profile. Tab bar stays fixed.
Prototype link attached.`,
    },
    candidate: {
      id: 'cand-tn-2',
      content: `[chat] Vendor contract renewal
The Datadog contract is up in October. Current spend: $4,200/mo.
We should evaluate whether Honeycomb or Grafana Cloud would be cheaper.
Sarah to get quotes by end of month.`,
    },
    expected: { shouldLink: false },
    note: 'UI wireframe vs vendor contract renewal: unrelated in every dimension',
  },

  {
    source: {
      id: 'src-tn-3',
      content: `[note] Bread sourdough starter notes
Day 3: starter is active, doubling in 6-8 hours. Feeding ratio 1:1:1 (starter:flour:water).
Using whole wheat for the first few days to boost wild yeast population.
Room temp ~72°F.`,
    },
    candidate: {
      id: 'cand-tn-3',
      content: `[chat] Weekly sync — platform team
Covered: deploy pipeline improvements, the new feature-flag rollout,
and postmortem on last week's incident. Action items in Linear.
Next sync Thursday.`,
    },
    expected: { shouldLink: false },
    note: 'Personal baking notes vs engineering sync: no relationship whatsoever',
  },

  // ── Hard cases: ambiguous — test for over-linking ─────────────────────────

  {
    source: {
      id: 'src-hard-1',
      content: `[chat] Performance review — Alice
Alice is doing well on the technical side. Communication could improve.
Rating: meets expectations. Plan: pair her with a senior on the next cross-team project.`,
    },
    candidate: {
      id: 'cand-hard-1',
      content: `[chat] Performance review — Bob
Bob exceeded expectations this quarter. Strong delivery on the auth refactor.
Promoted to senior engineer. Compensation adjustment approved.`,
    },
    expected: { shouldLink: false },
    note: 'Hard case: both are perf reviews but for different people with no shared content; model should NOT link on category alone',
  },

  {
    source: {
      id: 'src-hard-2',
      content: `[note] Meeting notes — product sync 2024-10-01
Discussed roadmap prioritisation. Decided to push the analytics dashboard to Q4.
Bumped the API versioning work up to next sprint. No blockers.`,
    },
    candidate: {
      id: 'cand-hard-2',
      content: `[note] Meeting notes — product sync 2024-09-17
Roadmap review. Analytics dashboard scoped for Q3. API versioning work
deprioritised. Agreed to revisit in two weeks.`,
    },
    expected: { shouldLink: true, type: 'continuation', minConfidence: 0.6 },
    note: 'Hard case: recurring meeting notes — the Oct 1 note directly supersedes/continues from Sept 17 decision on same items',
  },

  {
    source: {
      id: 'src-hard-3',
      content: `[chat] Should we use Redis or Memcached?
Both are in-memory caches. Redis supports data structures, persistence, pub/sub.
Memcached is simpler and marginally faster for pure key-value. We lean Redis
for flexibility. No decision yet.`,
    },
    candidate: {
      id: 'cand-hard-3',
      content: `[chat] Cache eviction policies
LRU vs LFU: LRU evicts the least recently used, LFU the least frequently used.
LRU is simpler and works well for most workloads. Redis defaults to LRU (allkeys-lru).
Pick based on access patterns.`,
    },
    expected: { shouldLink: false },
    note: 'Hard case: both discuss caching but different angles (which tool vs eviction policy). Loose thematic overlap — should NOT link unless model sees strong benefit',
  },

  // ── Edge cases ────────────────────────────────────────────────────────────

  {
    source: {
      id: 'src-edge-1',
      content: 'TODO',
    },
    candidate: {
      id: 'cand-edge-1',
      content: `[note] Project backlog
- Refactor auth module
- Add dark mode
- Fix mobile layout
- Write API docs`,
    },
    expected: { shouldLink: false },
    note: 'Edge case: extremely short source content ("TODO") — should not link to anything',
  },

  {
    source: {
      id: 'src-edge-2',
      content: `const fetchUser = async (id: string) => {
  const res = await fetch(\`/api/users/\${id}\`)
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
  return res.json() as Promise<User>
}`,
    },
    candidate: {
      id: 'cand-edge-2',
      content: `const fetchArtifact = async (id: string) => {
  const res = await fetch(\`/api/artifacts/\${id}\`)
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
  return res.json() as Promise<Artifact>
}`,
    },
    expected: { shouldLink: false },
    note: 'Edge case: two code-only snippets with identical pattern but different domains — structural similarity alone should not create a link',
  },

  {
    source: {
      id: 'src-edge-3',
      content: `[chat] Retro des Sprints — résumé
Ce sprint nous avons livré le nouveau flux d'authentification.
Problèmes rencontrés: flakiness des tests d'intégration.
Actions: stabiliser le pipeline CI avant le prochain sprint.`,
    },
    candidate: {
      id: 'cand-edge-3',
      content: `[note] CI pipeline stability
Integration tests are flaky on the auth flow — timing issues with the DB reset.
Fix: add a teardown hook. Assigned to Alice. Target: this sprint.`,
    },
    expected: { shouldLink: true, type: 'references', minConfidence: 0.6 },
    note: 'Edge case: non-English source (French sprint retro) references an English note about the exact same CI problem it mentions',
  },
]
