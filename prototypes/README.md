# Signal Bloom — Prototypes

Design artifacts, code studies, and interactive prototypes documenting the Signal Bloom system architecture and performer UX before full implementation.

---

## Wireframes
Low-fidelity ASCII structural layouts. Focus on component relationships, layout zones, and navigation flow.

- `wireframes/wireframe-01-performer-ui.md` — Full performer browser interface layout and overlay zones
- `wireframes/wireframe-02-system-architecture.md` — Data flow diagram across all system layers
- `wireframes/wireframe-03-tunnel-spatial-layout.md` — Three.js tunnel zone map and AI form placement

## Mockups
High-fidelity static HTML/CSS representations. Visual design reference — not interactive.

- `mockups/mockup-01-performer-interface.html` — Complete performer UI with code overlay, prompt overlay, and status bar

## Interactive Prototypes
Working browser prototypes simulating core performer interactions. No Hydra or Three.js — UI and interaction layer only.

- `interactive/prototype-01-performer-controls.html` — Full keyboard control simulation with live feedback
- `interactive/prototype-02-generation-arc.html` — AI crystallization arc simulation (noise → form over 20 steps)

## Code Studies
Standalone annotated code snippets demonstrating key integration patterns. Reference implementation before Phase 1–2 build.

- `code-studies/study-01-sse-bridge.js` — Node.js SSE bridge server skeleton (extends NoirMak watcher.js)
- `code-studies/study-02-comfyui-websocket.js` — ComfyUI WebSocket streaming + workflow dispatch pattern
- `code-studies/study-03-hydra-to-threejs.js` — Hydra offscreen canvas → Three.js CanvasTexture pipeline
- `code-studies/study-04-audio-tunnel.js` — MicInput.js FFT → Three.js tunnel geometry deformation wiring
