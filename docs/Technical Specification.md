# Signal Bloom — Technical Specification

**Project:** Signal Bloom  
**Author:** Cameron Mansanarez  
**Last updated:** June 2026  
**Status:** Phase 3 of 5 (active development)

---

## 1. Hardware Requirements

### Performance Machine

| Component | Specification |
|-----------|--------------|
| Model | Apple Mac mini (2024) |
| Chip | Apple M4 Pro |
| RAM | 24 GB unified memory |
| OS | macOS Sequoia |

The M4 Pro chip is the critical hardware dependency for the ComfyUI AI generation pipeline. It provides access to Apple's Metal Performance Shaders (MPS) GPU backend, which reduces LCM image generation from 60–120 seconds (CPU-only on Intel) to approximately 8–12 seconds per run. This latency window is not incidental — it is the duration of the crystallization arc that constitutes the central artistic event of the performance.

**Minimum viable configuration:** Any Apple Silicon Mac mini (M1 or later) with at least 16 GB RAM. Intel Mac mini is technically supported but changes Phase 2 architecture significantly (streaming arc becomes pre-generated cycling rather than live denoising).

---

## 2. Software Requirements

### Runtime Environment

| Software | Version | Role |
|----------|---------|------|
| Node.js | 22.x (LTS) | Bridge server, file watcher, ComfyUI proxy |
| Chrome | Current stable | Performance browser (renderer) |
| ComfyUI | Latest | Local AI image generation server |
| VS Code | Current | Live coding environment (performer) |
| Python | 3.11+ | ComfyUI runtime dependency |

Node 22 is the minimum version. The bridge server uses Node-native `fetch`, `FormData`, `Blob`, and `WebSocket` — no npm packages required for the network layer. Node 18 and below lack native `fetch` and will require `node-fetch` as a polyfill.

### npm Dependencies

**Runtime (bundled by Vite):**

| Package | Version | Role |
|---------|---------|------|
| `three` | ^0.160.0 | 3D tunnel renderer, geometry, post-processing |
| `simplex-noise` | ^4.0.1 | Perlin-style noise for tunnel deformation |

**Development / tooling:**

| Package | Version | Role |
|---------|---------|------|
| `vite` | ^5.0.0 | Dev server, ESM bundler, proxy layer |
| `concurrently` | ^8.2.0 | Runs Vite and watcher.js in parallel (`npm run dev`) |

### Vendored Libraries (no CDN, offline-safe)

Stored in `/libs/` — not installed via npm. Must exist on disk before the browser loads.

| File | Source | Role |
|------|--------|------|
| `hydra-synth.js` | Hydra Synth (MIT) | Live-coding audio-visual synthesis engine |
| `datamosh.js` | Custom (NoirMak VJ System) | GLSL datamosh extension for Hydra |

Additional libraries (`lib-cond.js`, `hydra-wrap.js`) are carried from the NoirMak VJ System if needed for specific sketches.

### ComfyUI Models

| Model | Type | Source | Role |
|-------|------|--------|------|
| `dreamshaper_8LCM.safetensors` | SD 1.5 checkpoint | CivitAI (free) | Primary image generation model |
| `lcm-lora-sdv1-5.safetensors` | LoRA | HuggingFace (Apache 2.0) | LCM acceleration (4–8 steps instead of 20+) |

ComfyUI is launched with `--use-mps-device` on Apple Silicon. The LCM checkpoint + LCM-LoRA combination is what makes sub-10-second generation viable and the streaming crystallization arc aesthetically meaningful.

**Planned addition:** A Signal Bloom-specific LoRA trained on a curated dataset of 20–40 images encoding the project's visual language (glitch aesthetics, identity distortion, queer futurist imagery). Base model must remain SD 1.5 to maintain compatibility with the LCM pipeline. Training target: CivitAI DreamBooth or Google Colab with `kohya_ss`.

---

## 3. System Architecture

Signal Bloom is a three-process system: a **Node.js bridge server**, **ComfyUI**, and a **Chrome browser**. The browser never communicates with ComfyUI directly — all traffic passes through the bridge.

```
┌─────────────────────────────────────────────────────────────────┐
│                        macOS (M4 Pro)                           │
│                                                                 │
│  VS Code (performer edits sketches)                             │
│       │ fs.watch (80ms debounce)                                │
│       ▼                                                         │
│  Node.js Bridge — localhost:3001                                │
│  ├── watcher.js  (HTTP server + SSE + file watch)              │
│  └── comfyui.js  (ComfyUI HTTP + WebSocket client)             │
│       │                           │                             │
│       │ SSE (EventSource)         │ HTTP + WebSocket            │
│       ▼                           ▼                             │
│  Chrome — localhost:5173     ComfyUI — localhost:8188           │
│  ├── main.js (Three.js scene)    (AI generation, MPS backend)  │
│  ├── HydraManager.js             workflows/txt2img.json         │
│  ├── HydraFormProcessor.js       workflows/img2img.json         │
│  ├── MicInput.js (Web Audio)                                    │
│  ├── ai-forms.js                                                │
│  └── sketch-loader.js                                           │
│                                                                 │
│  Audio Input (microphone) → MicInput.js → window.micLevel      │
│                                         → window.micFFT[]       │
└─────────────────────────────────────────────────────────────────┘
```

### Component Roles

**`watcher.js`** — HTTP server on port 3001. Watches `sketches/` with `fs.watch` (80ms debounce). Serves sketch list, sketch files, and generated images. Accepts `POST /prompt` from the browser and delegates to `comfyui.js`. Maintains a pool of SSE connections and broadcasts events to all connected clients.

**`comfyui.js`** — Server-side Node.js module. Reads workflow JSON files fresh on each generation (editable between sets without restarting). Opens a WebSocket to ComfyUI before dispatching each workflow so no early preview events are missed. Strips the 8-byte ComfyUI binary frame header from latent previews before forwarding as base64 data URLs. Implements a 120-second timeout per job as a safety net.

**`main.js`** — Browser entry point. Initializes Three.js scene (Fracture tunnel geometry), HydraManager (two offscreen Hydra canvases → `CanvasTexture`), HydraFormProcessor (second Hydra instance for AI form processing), MicInput (Web Audio + FFT), and the composer (post-processing chain). Runs the animation loop, audio reactivity, and SSE event listeners.

**`HydraManager.js`** — Manages multiple Hydra instances (`makeGlobal: false`) on offscreen canvases. Each canvas is exposed as a `THREE.CanvasTexture`. `needsUpdate = true` is set every frame in the render loop — not once at load time.

**`HydraFormProcessor.js`** — Dedicated second Hydra instance that processes AI-generated images in real time. Runs an audio-reactive patch: the generated image is sourced into `s0`, modulated by noise (driven by `micLevel`), transparency-keyed by bass FFT (`luma()`), and contrast-boosted. All form planes share a single `CanvasTexture` backed by this processor's canvas.

**`MicInput.js`** — Web Audio API + `AnalyserNode` (1024-bin FFT). Sets `window.micLevel` (RMS amplitude) and `window.micFFT[]` (frequency bins) each frame. Used by the tunnel deformation, Hydra instances, and post-processing glitch system.

**`ai-forms.js` (AIFormLayer)** — Manages the lifecycle of AI form planes in the tunnel scene. Forms spawn at z = −35, scale in over the first seconds of their lifetime, drift forward at 0.015 units/frame, and fade out after 45 seconds. All planes share the HydraFormProcessor's `CanvasTexture`.

**`sketch-loader.js`** — Sketch discovery, hot-reload, keyboard controls, prompt overlay, code overlay, img2img toggle, and SSE event wiring. The performer's primary interface layer.

### Data Flow — AI Generation Event

```
Performer types prompt → P key opens overlay → Enter submits
       │
       ▼
POST /prompt  { prompt, imgImg: bool }
       │
       ▼  watcher.js
If imgImg && latest.png exists:
  comfyui.uploadImage(latest.png) → ComfyUI /upload/image → imageName
  comfyui.buildImg2Img(prompt, imageName) → patches img2img.json
Else:
  comfyui.buildTxt2Img(prompt) → patches txt2img.json
  (config.json stylePrompt is prepended to every prompt in both paths)
       │
       ▼
comfyui.streamGeneration(graph)
  Opens WS → ws://localhost:8188/ws
  Dispatches workflow → POST /prompt → prompt_id
       │
       ▼  Per denoising step (4–8 steps):
  WS binary frame → strip 8-byte header → base64 JPEG
  broadcast('step-preview', { step, total, preview: 'data:image/jpeg;base64,...' })
       │
       ▼  Browser (main.js SSE listener):
  layer.preview(preview) → HydraFormProcessor.updateSource(src) → s0.initImage()
  Hydra processes frame in real time → CanvasTexture → AI plane in tunnel
       │
       ▼  On WS executing node===null (generation complete):
  comfyui.fetchOutput(promptId) → GET /view → PNG bytes
  Write to generated/latest.png + generated/archive/[timestamp].png
  broadcast('image-ready', { src: '/generated/latest.png' })
       │
       ▼  Browser:
  layer.finalize('data:image/png;base64,...') → HydraFormProcessor.updateSource()
  Full-resolution form composited into tunnel via chromatic aberration pass
```

### SSE Event Protocol

| Event | Payload | Consumer |
|-------|---------|----------|
| `sketch-changed` | `{ file, t }` | sketch-loader: hot-reloads active sketch |
| `list-changed` | `{ t }` | sketch-loader: re-fetches sketch list |
| `generation-start` | `{ prompt, mode, t }` | main.js: shows status, spawns preview plane |
| `step-preview` | `{ step, total, preview }` | main.js: updates texture on form plane |
| `image-ready` | `{ src, prompt }` | main.js: finalizes form with full PNG |
| `generation-done` | `{ prompt, promptId }` | sketch-loader: updates UI status |
| `generation-error` | `{ message }` | sketch-loader: displays error in status |

### Vite Dev Server Proxy

Vite runs on port 5173 during development. The proxy routes all bridge endpoints to port 3001, so the browser uses a single origin:

```
/events    → http://localhost:3001
/sketches  → http://localhost:3001
/generated → http://localhost:3001
/prompt    → http://localhost:3001
```

### Render Pipeline (Three.js)

```
Offscreen Hydra canvas 0 → CanvasTexture → tunnel wall material (THREE.BackSide)
Offscreen Hydra canvas 1 → CanvasTexture → tunnel inner cylinder

MicInput.js → bass → Perlin deformation amplitude
            → mid  → Hydra modulation depth
            → hi   → chromatic aberration offset (glitch bursts)

formRT (WebGLRenderTarget):
  formScene (AI planes) → renderer.render() → formRT.texture

EffectComposer:
  RenderPass (tunnel scene)
  → UnrealBloomPass (strength 0.65, radius 0.50, threshold 0.38)
  → AfterimagePass (damping 0.82)
  → ChromaShader (custom — chromatic aberration + formRT composite)
    GLSL: gl_FragColor = tunnel.rgb + form.rgb * form.a  (additive)
```

The tunnel point cloud uses `sizeAttenuation: false` (uniform 2.2px screen-space size). With `sizeAttenuation: true`, rings sweeping through the near-field caused points to balloon in screen size, producing brightness spikes that the AfterimagePass accumulated into a persistent white wash.

---

## 4. Configuration

**`config.json`** — read fresh on every generation; editable between sets without restarting the bridge.

```json
{
  "stylePrompt": "glitch aesthetics, identity distortion, symbolic portraiture, queer futurist, digital underworld, abstraction",
  "imgImgDenoise": 0.65
}
```

- `stylePrompt` is prepended to every performer prompt before reaching ComfyUI (both txt2img and img2img paths).
- `imgImgDenoise` controls how much the img2img generation departs from the source image. 0.0 = identical, 1.0 = pure txt2img.

**`workflows/txt2img.json`** — ComfyUI API-format workflow for text-to-image. Loaded and patched at runtime; editable without code changes.

**`workflows/img2img.json`** — ComfyUI API-format workflow for image-to-image. Uses `LoadImage → VAEEncode → KSampler` with `latent_image` sourced from the uploaded PNG.

---

## 5. Keyboard Control Reference

All controls are single-key, keyboard-only. The performer never uses a mouse during a set.

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next sketch |
| `0`–`9` | Jump to sketch by index (600ms buffer for two-digit numbers) |
| `Space` | Reload active sketch (silent, in-place) |
| `P` | Open prompt overlay / close |
| `Enter` (in overlay) | Submit prompt, dock overlay to bottom |
| `↑` / `↓` (in overlay) | Navigate prompt history |
| `Esc` | Close prompt overlay |
| `I` | Toggle img2img mode (next generation evolves from last form) |
| `B` | Blackout (`hush()` — instant, emergency brake) |
| `K` | Toggle code overlay |
| `J` | Cycle code overlay color |
| `W` | Toggle code warp animation |
| `L` | Toggle global scanlines |
| `H` | Toggle status overlay |
| `C` / `S` / `V` | Jump to sketch by keyword (webcam / screen / video) |

---

## 6. Technical Standards

**No CDN dependencies during performance.** All libraries are vendored in `/libs/` or installed via npm. The system operates fully offline once set up. Internet connectivity is not required during a performance.

**No TypeScript.** Vanilla JavaScript throughout. No compilation step for source files. The bridge (`watcher.js`, `comfyui.js`) runs directly in Node with `require()`. The browser bundle is processed by Vite using native ESM.

**Module system split:** Browser code uses ESM (`import`/`export`). Bridge/server code uses CommonJS (`require`/`module.exports`). This is intentional — the bridge runs in Node without a build step, and mixing systems across the boundary is avoided.

**SSE over WebSocket for browser communication.** `EventSource` is unidirectional and simpler. WebSocket is reserved exclusively for the bridge ↔ ComfyUI connection where bidirectional communication is required.

**Sketch error isolation.** All sketch `eval`/`Function` execution is wrapped in try/catch. A sketch that crashes logs to console and the system continues — a bad sketch never freezes the renderer.

**Security surface.** The bridge only accepts connections on `localhost`. There are no authentication tokens because the system is designed for single-machine offline operation. Path traversal is explicitly guarded in all file-serving routes (checks for `..` and enforces `.js`/image extension allowlists).

---

## 7. Licensing

| Component | License | Notes |
|-----------|---------|-------|
| Three.js | MIT | No restrictions |
| Simplex-noise | MIT | No restrictions |
| Vite | MIT | Dev tooling only, not shipped |
| Concurrently | MIT | Dev tooling only |
| Hydra Synth | MIT | Vendored in `/libs/` |
| ComfyUI | GPL-3.0 | Local installation only, not distributed |
| DreamShaper 8 | CreativeML Open RAIL-M | Non-commercial permitted; review terms before commercial exhibition |
| LCM-LoRA | Apache 2.0 | No restrictions |
| Custom LoRA (planned) | N/A — trained asset | Owned by artist |
| NoirMak VJ System code | Artist's own prior work | No external license required |
| Orpheus Protocol code | Artist's own prior work | No external license required |

**Exhibition note:** DreamShaper 8 is distributed under CreativeML Open RAIL-M. This license permits non-commercial artistic use. If Signal Bloom is exhibited in a context involving commercial admission or sales, review the license terms or substitute a permissively licensed model (e.g., a Stable Diffusion base checkpoint from Stability AI).

---

## 8. Development Timeline

Timeline: 5 weeks — May 25 to June 29, 2026.

### Phase 1 — Codebase Merge
**Target:** May 31 | **Status: Complete**

Established the foundational visual pipeline. Ported the Three.js Fracture tunnel (1,584 points, 22 recycling rings, figure-8 camera trajectory) from the Orpheus Protocol. Integrated HydraManager for offscreen Hydra canvases mapped to tunnel walls as `CanvasTexture`. Wired MicInput.js (Web Audio + FFT) to tunnel Perlin deformation and Hydra modulation. Confirmed hot-reload via `watcher.js`. Tuned post-processing chain (UnrealBloom + Afterimage + chromatic aberration shader). Added the mood-board palette system — five colors cycling through the tunnel point cloud over approximately 2.5 minutes.

**Milestone deliverable:** Hydra-textured tunnel running with audio reactivity, hot-reload, and performer keyboard controls.

---

### Phase 2 — ComfyUI Bridge
**Target:** June 7 | **Status: Complete**

Built the full ComfyUI integration. Implemented `watcher.js` POST /prompt endpoint and `comfyui.js` WebSocket client. Streaming latent preview frames (8 steps → 8 SSE `step-preview` events). Step previews update a `THREE.PlaneGeometry` in the tunnel scene in real time as noise resolves into form. Full-resolution final image replaces preview on `image-ready`. Built HydraFormProcessor — a second dedicated Hydra instance that processes each frame of the AI generation with real-time audio reactivity (bass drives luma transparency, micLevel drives warp). Form planes composite into the tunnel via an additive GLSL pass inside the chromatic aberration shader, so AI forms share the tunnel's optical space rather than sitting on top of it. Implemented img2img feedback loop (`I` key): the last generated PNG is uploaded to ComfyUI as the latent seed for the next generation. Implemented `config.json` aesthetic style prompt system.

**Key bugs resolved:**
- Base64 data URL prefix missing — latent preview frames were arriving at the browser but not displaying (silent failure). Added `data:image/jpeg;base64,` prefix in `onStep` handler in `comfyui.js`.
- `sizeAttenuation: true` on point cloud — near-field rings caused points to expand to enormous screen size; AfterimagePass accumulated the spikes into a persistent white wash. Fixed with `sizeAttenuation: false`.
- Bloom strength not resetting after glitch burst — `updateGlitch()` was hardcoding `1.2` as the base strength after we had changed the bloom to `0.65`. Fixed to `0.65 + glitchIntensity * 0.55`.
- Malformed nested try block in `watcher.js` — left a dangling open scope during the img2img refactor. Resolved by rewriting `runGeneration` as a single clean try/catch/finally.

**Milestone deliverable:** Type a prompt, watch noise crystallize into a form in the tunnel over 4–8 steps. Press I, type again, watch the last form evolve.

---

### Phase 3 — Performer UI + Audio
**Target:** June 14 | **Status: In progress**

Prompt overlay three-state system (hidden → open → docked) complete. All keyboard controls finalized. img2img toggle complete. Remaining items:

- [ ] Visual step progress bar in docked prompt overlay (currently text-only "crystallizing 4/8")
- [ ] Audio level indicator in status bar
- [ ] 30-minute full performance simulation — log crashes and UX friction
- [ ] Verify all original NoirMak controls still function after Phase 2 additions

**Milestone deliverable:** A solo performer can run a complete improvisational set without stopping.

---

### Phase 4 — Signal Bloom Sketch Library
**Target:** June 21 | **Status: Pending**

Write 8–10 new Hydra sketches designed specifically for tunnel-wall texturing. The 7 current sketches (`01-the-song-before-loss.js` through `07-signal-bloom.js`) were tuned during Phase 2 development. New Phase 4 sketches must be designed for curved geometry viewed in perspective — avoid hard edges, favor flowing/organic/radially symmetric patterns, ensure audio reactivity reads at tunnel texture scale.

Character targets per sketch: feedback recursion, voronoi fields, noise interference, oscillator layering, luma-key, datamosh, bloom recursive.

OBS capture setup and projection environment test in this phase.

**Milestone deliverable:** 8–10 new sketches, all verified as tunnel-wall textures in the live scene.

---

### Phase 5 — Performance Testing + Final Build
**Target:** June 29 | **Status: Pending**

Three full-length performance simulations (30–45 minutes each). Log every crash, hang, or friction point. Tune ComfyUI generation parameters for final performance hardware (step count, CFG scale, denoise). Build performance score — a loose arc with specific prompt sequences and sketch transitions. Produce printable keyboard reference card. Record 10-minute performance documentation video.

**Milestone deliverable:** System is performance-ready. All documentation complete.

---

## 9. Reference Files

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Development guide and artistic context for Claude Code sessions |
| `docs/prototyping-summary.md` | Narrative description of all prototyping deliverables |
| `prototypes/wireframes/` | System architecture, performer UI layout, tunnel spatial zones (ASCII) |
| `prototypes/mockups/mockup-01-performer-interface.html` | High-fidelity visual design reference (open in browser) |
| `prototypes/interactive/prototype-01-performer-controls.html` | Full keyboard interaction simulation |
| `prototypes/interactive/prototype-02-generation-arc.html` | AI generation arc simulation |
| `prototypes/code-studies/` | Reference implementations for SSE bridge, ComfyUI WS, Hydra→Three.js, audio tunnel |
| `process_journal/` | Weekly progress notes and reflective writing |
