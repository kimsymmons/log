# Pre-Mortem: log-orchestration

**Date:** 2026-06-11
**Scenario:** The project shipped but failed. Work backwards: why?

Each risk is rated for Severity and Likelihood independently. Mitigations are specific, not generic.

---

## A. Common Software Project Risks

### 1. Scope creep / feature bloat

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | High |
| **Status** | Partially in place |

The canvas metaphor is expansive. "One more view mode", "just add annotations", "link to Notion too" — each feels small. Collectively they delay the core loop indefinitely. The project failed because M0 became M0.5, then M0.75, and the tldraw benchmark was never run.

**Mitigation:** Milestone gates enforced in Linear. M0 ships nothing beyond the rendering spike and persistence layer. New ideas go to an Icebox label, not into the current milestone. Kim approves any scope change touching the active milestone before an agent picks it up.

---

### 2. Technical debt in a fast-moving codebase

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | High |
| **Status** | Needs adding |

Canvas code accretes fast. tldraw bindings, custom shapes, event handlers — written quickly under milestone pressure — become load-bearing and untouchable. By M2, nobody wants to touch the shape registry.

**Mitigation:** Every PR includes a one-line "corners cut" note. A debt-burning sprint is scheduled before M2 begins. The supervisor agent flags any PR that introduces a workaround without a linked follow-up issue.

---

### 3. Canvas performance regressions (tldraw custom shapes beyond the 500-object gate)

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | Medium |
| **Status** | PEO-110 in progress; CI gate not yet wired |

tldraw renders well to ~500 standard shapes. Custom shapes carrying live DOM content (chat cards) are heavier — the real threshold may be 150–200 objects before jank on iPad Safari. A regression introduced during the Linking Engine phase goes unnoticed until a real user has 600 chats on canvas.

**Mitigation:** PEO-110 benchmarks this explicitly. Gate: custom shapes must hold 55 fps at 300 objects on laptop before M1 ships. A Playwright script measuring frame timing runs in CI on every PR that touches shape rendering. iPad Safari tested manually at each milestone boundary.

---

### 4. Data loss / corruption in local-first sync

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | Medium |
| **Status** | Needs adding — not yet designed |

An unhandled exception during a sync cycle silently drops a canvas object. The user never sees an error; they just notice a chat card has gone.

**Mitigation:** Every mutation goes through a typed action log (append-only). Periodic snapshots with a 3-generation ring buffer. Integration test: open two tabs, make conflicting moves, verify merge is lossless. On corrupt state detected at load, prompt user to restore from the last clean snapshot rather than failing silently.

---

### 5. Auth failure modes (magic-link deliverability, token expiry, multi-device session conflicts)

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | Medium |
| **Status** | Needs adding — auth design not started |

Magic links fail silently in spam filters. Token expiry mid-session logs the user out while mid-canvas, and unsaved work is lost.

**Mitigation:** Magic link fallback: offer OTP code on the same screen. Token refresh runs silently 15 minutes before expiry. On auth failure, canvas state is snapshotted to localStorage before redirect. Multi-device: last-write-wins on session with a "signed in elsewhere" toast.

---

### 6. Dependency risk (tldraw SDK v3 is pre-stable)

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | Medium |
| **Status** | Needs adding — no version pinning strategy |

tldraw v3 is pre-1.0 stable. A breaking change in the shape API could require a week of migration work mid-milestone.

**Mitigation:** Pin to a specific tldraw minor version (e.g. `3.4.x`). Subscribe to the tldraw changelog. Upgrades happen only in a dedicated PR with the full benchmark re-run. tldraw's store API is wrapped behind an abstraction boundary, not called directly from product code.

---

### 7. CI fragility (bench/eval-links gates are environment-sensitive)

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | High |
| **Status** | Needs adding — CI not yet set up |

Playwright benchmarks measuring frame timings are sensitive to CI runner load. Eval-link tests depending on LLM output are non-deterministic by nature.

**Mitigation:** Benchmark gates use P90, not mean, with ±15% variance tolerance. Eval tests use fixed seeds and snapshot top-5 link scores rather than exact outputs. Flaky tests (failing 3× in a row with no code change) are auto-quarantined.

---

### 8. No test coverage on canvas interaction paths

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | High |
| **Status** | Needs adding |

Drag, drop, multi-select, link-draw, zoom, pan — none exercisable by unit tests alone. Without e2e coverage, a regression in any interaction is invisible until a human finds it.

**Mitigation:** Playwright e2e suite covering the 10 most critical interaction paths ships before M1. Acceptance criteria for canvas-touching issues must include "add or update e2e test".

---

## B. Model-First / AI-Generated Software Risks

### 9. Context drift: agent-generated code diverges from architecture as codebase grows

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | High |
| **Status** | Partially in place (CLAUDE.md started) |

An agent working on inference integration has no memory of the store design decisions from the object model sprint. It invents its own persistence patterns. By M2 there are three subtly different ways to persist a canvas object, none of which match the ADR.

**Mitigation:** CLAUDE.md kept current — every architectural decision documented before an agent picks up the next ticket. Supervisor agent reviews cross-cutting patterns at milestone boundaries. Issues reference the relevant CLAUDE.md section in acceptance criteria.

---

### 10. Hallucinated APIs: agent references non-existent functions in actual SDK versions

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | High |
| **Status** | Needs adding — vendor snapshot not created |

The agent confidently uses a plausible-sounding tldraw API that does not exist in v3. The build fails, or worse, falls back silently and produces wrong behaviour that passes tests.

**Mitigation:** The tldraw SDK source is checked into `docs/vendor-api-snapshot/` at the pinned version. Agents are instructed to reference only functions present in that snapshot. PR reviewer checks imports against the snapshot before merging.

---

### 11. Inconsistent naming and conventions across agent-generated modules

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | High |
| **Status** | Needs adding |

One agent uses `chatNode`, another uses `ChatCard`, a third uses `chat_object`. The codebase becomes a naming zoo within three milestones.

**Mitigation:** Naming conventions defined in CLAUDE.md: camelCase for entity instances, PascalCase for React components, kebab-case for file names. ESLint custom rule enforces component naming. Supervisor runs a naming audit at the close of each milestone.

---

### 12. Over-engineering: agents generating abstractions for non-existent problems

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | High |
| **Status** | Needs adding |

An agent implements a full plugin architecture with adapters and registries where a 40-line write function was needed. The abstractions become load-bearing before anyone notices they were unnecessary.

**Mitigation:** Issues include a complexity budget: S / M / L. L-complexity issues require explicit justification before an agent adds a new abstraction layer. Supervisor flags any PR introducing a new interface or registry not mentioned in the issue description.

---

### 13. Linear issue ambiguity: poor acceptance criteria lead to wrong implementation

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | Medium |
| **Status** | Partially in place — template used inconsistently |

A vague issue produces working but wrong code. The PR is green. The feature is wrong. The user finds it in QA.

**Mitigation:** Issue template requires: user story, acceptance criteria as checkboxes, non-goals, and a mockup reference. No agent is assigned until acceptance criteria are approved. Supervisor validates implementation against acceptance criteria before marking Done.

---

### 14. Supervisor blind spots: emergent architectural problems invisible across multiple PRs

| | |
|---|---|
| **Severity** | High |
| **Likelihood** | Medium |
| **Status** | Needs adding |

Each individual PR looks fine. Across five PRs, a dependency cycle has quietly formed. No single PR review caught it because each change was locally correct.

**Mitigation:** Supervisor agent runs a cross-PR architecture scan at the end of each sprint: checks for circular dependencies, duplicate logic, and unbounded re-render paths. Separate from per-PR review.

---

### 15. Memory layer poisoning: stale entries degrade model context quality

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | Medium |
| **Status** | Needs adding |

A wrong architectural decision is noted in the memory layer without being marked provisional. Every subsequent agent builds on the wrong assumption. The error compounds silently.

**Mitigation:** Memory entries carry a `last-validated` date. Entries older than 30 days are flagged for review. A consolidation pass runs at each milestone boundary. Kim reviews the output before each milestone starts.

---

### 16. Agent retry loops: blocked agents retry with variation rather than surfacing blockers

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | High |
| **Status** | Needs adding |

An agent cannot resolve a type error. Rather than surfacing the blocker, it tries five variations — each subtly wrong — and submits the least-broken one.

**Mitigation:** Agents have an explicit "I am blocked" path: comment on the Linear issue and stop. Supervisor monitors for signs of looping (more than 3 iterations on the same file with no meaningful diff).

---

### 17. Model provider outages block the build loop

| | |
|---|---|
| **Severity** | Medium |
| **Likelihood** | Low |
| **Status** | Needs adding — no outage plan documented |

An Anthropic API outage during a focused build sprint stops the entire agent-assisted workflow.

**Mitigation:** Critical-path items have human-executable fallbacks documented. A 4-hour outage tolerance is accepted. A 24-hour outage triggers a "manual mode" sprint plan with tasks scoped for human-only execution.

---

## Risk Summary

| # | Risk | Severity | Likelihood | Status |
|---|------|----------|------------|--------|
| 3 | Canvas performance beyond 500-object gate | High | Medium | In progress (PEO-110) |
| 4 | Data loss in local-first sync | High | Medium | Not started |
| 8 | No e2e coverage on canvas interactions | High | High | Not started |
| 9 | Context drift across agent-generated code | High | High | Partial (CLAUDE.md) |
| 10 | Hallucinated SDK APIs | High | High | Not started |
| 13 | Issue ambiguity → wrong implementation | High | Medium | Partial |
| 14 | Supervisor blind spots across PRs | High | Medium | Not started |
| 1 | Scope creep | High | High | Partial (milestones) |
| 6 | tldraw v3 breaking changes | High | Medium | Not started |
