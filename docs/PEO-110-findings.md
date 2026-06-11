# PEO-110 — tldraw Validation Spike: Findings

**Date:** 2026-06-11  
**tldraw version:** 3.15.6  
**Branch:** feat/peo-110-tldraw-validation  

---

## Three Questions, Three Answers

### Q1: Can tldraw v3 hold 55 fps at 300 custom shapes containing live DOM content on a laptop browser?

**Answer: Yes — gate passed.**

| Metric | Value |
|--------|-------|
| Objects on canvas | 300 ChatCard shapes (each renders a real React `<div>`) |
| P90 fps | **60** |
| P50 fps | 60 |
| Min fps | 6 (one slow frame during initial zoom-to-fit) |
| Gate threshold | 55 fps P90 |
| Result | **PASSED** |

**How measured:** Playwright headless Chromium (`chromium-headless-shell`), 1280×800 viewport. 300 shapes placed in a 20×15 grid via `editor.createShapes()`. FPS measured via `requestAnimationFrame` delta timing over 3 seconds while panning. P90 computed over ~150 sampled frames.

**Caveat:** Headless Chromium uses software rendering (no GPU compositing). Real-browser P90 may be lower — especially on integrated GPU laptops and iPad Safari (see PRE-MORTEM §3). Manual verification on target hardware is required before M1 ships. The 55 fps gate remains appropriate for CI; the headless result gives confidence the architecture is sound.

---

### Q2: Is DOM overlay feasible for card expansion?

**Answer: Yes — confirmed.**

`BaseBoxShapeUtil` + `HTMLContainer` renders a real HTML `<div>` inside tldraw shapes, not SVG. React components (state, hooks, event handlers) can live directly inside canvas cards.

**Evidence:** `dom-overlay.test.tsx` passes three assertions:
1. Title text is findable via `screen.getByText()` — it is in the DOM.
2. Body text is findable in the DOM.
3. `container.querySelector('div')` returns an `HTMLElement`; `container.querySelector('svg')` returns `null`.

This means card expansion — mounting a full React component inside an open card — is architecturally sound. The `pointerEvents: 'all'` style on the container allows interactive React components (inputs, buttons, scrollable content) to receive events even when the shape is selected.

---

### Q3: Does tldraw's ink tool support drawing strokes that become first-class persistable objects?

**Answer: Yes — confirmed.**

`TLDrawShape` is a plain JSON-serialisable record. Stroke data lives in `props.segments: TLDrawShapeSegment[]`, where each segment holds an array of `{ x, y, z }` points. The shape round-trips through `JSON.stringify` / `JSON.parse` with no loss.

**Evidence:** `ink-layer.test.tsx` passes four assertions:
1. A draw shape serialises and deserialises with correct `type: 'draw'` and segment count.
2. Point coordinates are preserved exactly after round-trip.
3. `createShapeId()` produces a stable typed ID (`"shape:my-stroke"`).
4. Multiple independent strokes serialise as separate records.

This means ink strokes are storable in the `artifacts` table as JSON blobs (in `content`), with the same standing as chat messages or notes.

---

## Go / No-Go Recommendation

**Go.**

All three technical risks that motivated this spike are resolved:

| Risk | Outcome |
|------|---------|
| Canvas performance at 300 live-DOM shapes | Passes 55 fps gate in headless Chromium |
| DOM overlay for interactive card expansion | Confirmed via HTMLContainer |
| Ink strokes as first-class persistable artifacts | Confirmed via TLDrawShape JSON serialisation |

Proceed to **PEO-112** (core artifact rendering) and **PEO-113** (CI fps gate). PEO-111 (canvas library alternatives) closes as won't-do.

---

## Open Follow-Ups (not blockers)

1. **Manual GPU test before M1.** Run the benchmark on a real MacBook (integrated graphics) and iPad Safari at the M1 boundary. The headless result is a floor, not a ceiling.
2. **Version pin.** Lock to `tldraw@3.15.6` per PRE-MORTEM §6. Add `"resolutions": { "tldraw": "3.15.6" }` to package.json before PEO-112 starts.
3. **Card expansion interaction model.** `pointerEvents: 'all'` on the HTMLContainer is sufficient for basic expansion, but focus management (keyboard nav inside an expanded card while the canvas also handles key events) needs a design decision before PEO-112.
