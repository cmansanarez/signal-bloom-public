# Signal Bloom — Development Guide for Codex

This file is the primary orientation document for any Codex session working on this project.
Read it fully before suggesting or writing any code.

---

## Who This Is For

Cameron Mansanarez is a solo artist-developer building a live audiovisual performance system as a capstone project. Background spans Hydra live coding, Three.js, generative art, VJ performance, and ComfyUI/Stable Diffusion. Technical decisions always have artistic consequences — treat them as inseparable. Do not separate engineering suggestions from their effect on the performance experience.

---

## Thesis & Artistic Intention

**Thesis statement:** *The evolving relationship between performer, machine, and emergence.*

Signal Bloom is a live performance ecosystem, not a software product. The audience descends through a Three.js tunnel whose walls are live Hydra audio-reactive textures. As the performer types text prompts, AI-generated forms crystallize out of noise in the tunnel space ahead of the viewer — noise first, then vague shape, then resolved geometry — over 5–15 seconds. The emergence IS the performance. Instability is not a bug; it is the aesthetic and the argument.

The artistic framework is **queer futurism** and **cybernetic aesthetics**. Glitches operate as both visual language and conceptual metaphor — they interrupt dominant systems and expose hidden structures. The z-axis tunnel carries the Orpheus Protocol's underlying mythology: descent into a digital underworld, the queer body in impossible space, the feedback loop of looking back at what you are trying to hold. These themes are not decoration; they should inform every interaction design decision.

From the artist statement:
> "I am drawn to moments where control begins to collapse, where glitches behave like interruptions in dominant structures, and where new visual languages emerge through improvisation between human and machine intelligence."

When making any technical decision, ask: does this serve emergence, instability, and the performer's ability to improvise? If a cleaner solution removes unpredictability, the less clean solution is often correct.

---

## Central Visual Interaction

The noise-to-crystallization arc:
1. Performer types a prompt (e.g. "three-dimensional torus primitive")
2. ComfyUI begins generating via LCM — 4–8 denoising steps
3. Each step pushes a latent preview frame via SSE to the browser
4. The browser updates a texture in the Three.js tunnel — the audience sees noise resolving into a form in the tunnel space ahead of them
5. The fully resolved image materializes as floating geometry in the tunnel
6. That form is then available as an img2img seed — the feedback loop continues

The tunnel walls are Hydra textures, live-coded in real time. The performer modulates them via audio reactivity (bass → warp scale, mid → frequency, hi → glitch bursts). The audience is always falling forward through the performer's coded environment, moving toward whatever is being generated.

---

## Prior Projects — Reference These, Not External Libraries

Two prior projects are the foundation of Signal Bloom. Do not reinvent what already exists in them.

**NoirMak VJ System**
Path: `/Users/cameronmansanarez/Documents/Documents - Cameron Mac mini/VSCode_Files/NoirMak_VJSystem_Local-main`

What to use:
- `watcher.js` — Node.js HTTP server + SSE hot-reload. The Signal Bloom bridge extends this.
- `sketch-loader.js` — Sketch cycling, keyboard controls, code overlay. Adapt directly.
- `libs/hydra-synth.js` — Vendored Hydra library (no CDN).
- `libs/hydra-wrap.js`, `libs/lib-cond.js`, `libs/datamosh.js` — Custom GLSL extensions.
- `sketches/` — 16 audio-reactive performance sketches. Port directly into Signal Bloom.
- Color palette: `#00f0ff` cyan, `#ff00ee` magenta, `#1a1aff` electric blue, `#ffaa00` amber.
- SSE pattern: 80ms debounced file watcher → `sketch-changed` / `list-changed` broadcast.
- Code overlay: `mix-blend-mode: difference`, always readable over any visual.

**Orpheus Protocol**
Repo: `https://github.com/cmansanarez/Orpheus_Protocol`

What to use:
- `js/scenes/fracture.js` — The tunnel geometry: 1,584 points in 22 recycling rings, Perlin-deformed, figure-8 camera trajectory, forward motion 0.14 units/frame, 2.2× acceleration on audio peaks. This IS the tunnel.
- `js/utils/HydraManager.js` — Multi-instance Hydra canvas management. Use this to feed Hydra canvases into Three.js as `CanvasTexture` objects. This is the Hydra → Three.js bridge.
- `js/utils/MicInput.js` — Web Audio API + FFT pipeline. Sets `window.micLevel` and `window.micFFT[]`. Battle-tested.
- Post-processing: `UnrealBloomPass` (strength 0.6–1.8), `AfterimagePass` (damping 0.84–0.88), chromatic aberration shader (0.003–0.018 offset). Already tuned — carry forward directly.
- Portal scene pattern: Six canvas-texture faces on a cube. This proves the Hydra → Three.js texture pipeline works.
- `assets/lib-cond.js` — Same conditional GLSL library as NoirMak. Continuous across both.

---

## System Architecture

Single bridge/proxy — the browser talks only to the Node.js bridge at `localhost:3001`.
ComfyUI runs at `localhost:8188` and is never accessed directly by the browser.

```
Audio (MicInput.js)     VS Code (live coding)
       │                        │ fs.watch / chokidar
       └──────────┬─────────────┘
                  │ SSE events
         Node.js Bridge (localhost:3001)
           watcher.js + bridge.js
                  │ HTTP + WebSocket
         ComfyUI (localhost:8188)
                  │ step previews → SSE → browser
         Browser (Chrome)
           HydraManager → offscreen canvases
           Three.js tunnel (Fracture geometry)
           CanvasTexture: Hydra → tunnel walls
           AI frames: floating planes in tunnel
           Performer overlay UI
                  │
               OBS Studio → projection
```

**SSE event types the bridge emits:**
- `sketch-changed` — file saved in `/sketches/`, browser reloads sketch
- `list-changed` — sketch added/removed, browser re-fetches list
- `step-preview` — `{ step, total, preview: base64 }` — one per denoising step
- `image-ready` — `{ src: '/generated/latest.png' }` — generation complete
- `generation-start` / `generation-done` / `generation-error` — UI state events

**Key files:**
```
signal-bloom/
├── index.html              ← performer browser entry point
├── sketch-loader.js        ← sketch cycling, keyboard controls, overlays
├── watcher.js              ← file watch + SSE + static server (from NoirMak)
├── bridge.js               ← ComfyUI integration (Phase 2, new)
├── package.json
├── sketches/               ← Hydra sketch library (.js files)
├── libs/                   ← vendored: hydra-synth, hydra-wrap, lib-cond, datamosh
├── generated/              ← ComfyUI output (latest.png + archive/)
└── workflows/              ← ComfyUI workflow JSON (txt2img.json, img2img.json)
```

**Reference implementations** for all major integration patterns are in `prototypes/code-studies/`. Read these before writing production code:
- `study-01-sse-bridge.js` — bridge server skeleton
- `study-02-comfyui-websocket.js` — ComfyUI API + workflow builders
- `study-03-hydra-to-threejs.js` — HydraTextureManager, AIFormLayer, SSE wiring
- `study-04-audio-tunnel.js` — FFT → tunnel deformation, camera speed, post-processing

---

## Development Roadmap

**Current state as of July 2026:** Phases 1–5 below are complete — the tunnel, Hydra sketch library, ComfyUI/Flux bridge, and performer UI are all built and have run in a live performance. The original 5-week build roadmap is historical at this point; it's kept below as a record of how the system was built, not as active tasks.

The project's current phase is **production-readiness and open-source release** — see `production.md` for the live audit, findings, and the actual sequenced plan in progress now. If you're picking up work on this codebase, read `production.md` first; this roadmap section is reference, not a task list.

---

### Phase 1 — Codebase Merge ✅ Complete
*Milestone: Hydra-textured tunnel running with audio reactivity. No AI yet.*

Tasks:
1. Create `package.json` with dependencies: `three`, `simplex-noise`, `ws`, `node-fetch`, `chokidar`
2. Copy from NoirMak: `watcher.js`, `sketch-loader.js`, `libs/` (hydra-synth, hydra-wrap, lib-cond, datamosh)
3. Copy all 16 sketches from NoirMak `sketches/` into Signal Bloom `sketches/`
4. Port Orpheus Protocol: `HydraManager.js`, `MicInput.js`, Fracture tunnel geometry, post-processing chain
5. Build `index.html` that initializes Three.js scene with Fracture tunnel
6. Wire HydraManager: create 2–3 offscreen Hydra canvases → `CanvasTexture` → tunnel wall material (`THREE.BackSide`)
7. Wire `MicInput.js` → tunnel Perlin deformation amplitude (bass) and frequency (mid)
8. Wire `MicInput.js` → `bridgeAudioToHydra()` so isolated Hydra instances get FFT data
9. Confirm `sketch-loader.js` keyboard controls load sketches into Hydra instance 0
10. Confirm post-processing: UnrealBloomPass + AfterimagePass + chromatic aberration
11. Confirm `watcher.js` hot-reloads sketches on file save

Completion check: open browser, see tunnel with Hydra texture on walls, make noise near microphone and see tunnel walls deform, press `←`/`→` to change the wall texture, save a sketch file and see it hot-reload.

---

### Phase 2 — ComfyUI Bridge ✅ Complete
*Milestone: Type a prompt, see noise crystallize into a form floating in the tunnel.*

**Before starting:** Run `system_profiler SPHardwareDataType` and confirm Mac mini chip. Apple Silicon (M-series) uses MPS backend — ComfyUI will work but at 8–15s per generation. Intel Mac mini uses CPU only — generation will be 60–120s+ and the streaming arc will need a fallback approach (pre-generated image cycling). This affects which ComfyUI model to install.

Tasks:
1. Install ComfyUI locally. Recommended model: `dreamshaper_8LCM.safetensors` (LCM checkpoint — 4–8 steps, fastest on Apple Silicon)
2. Build `bridge.js` extending `watcher.js`: add `POST /prompt` endpoint and ComfyUI WebSocket client
3. Use `buildTxt2ImgWorkflow()` from `study-02-comfyui-websocket.js` as the workflow template
4. Implement step-preview streaming: ComfyUI WS `b_preview` event → base64 → SSE `step-preview` to browser
5. Create `/generated/` directory; write final PNG output there on completion
6. In Three.js scene: receive `step-preview` SSE events → update texture on a preview plane positioned 60 units ahead of camera
7. On `image-ready`: replace preview plane with full-resolution final plane, positioned at 80 units ahead
8. Implement `AIFormLayer` from `study-03-hydra-to-threejs.js`: spawn, scale-in over 3s, fade-out after 30s
9. Implement `img2img` workflow: capture current tunnel frame → send as base64 to `buildImg2ImgWorkflow()` → feed output back into scene
10. Wire prompt input UI: `P` key opens overlay, `Enter` dispatches to `POST /prompt`, status updates via SSE events

Completion check: type "glowing torus, cybernetic" in prompt overlay, press Enter, watch noise appear in tunnel ahead and crystallize into a form over 4–8 steps.

---

### Phase 3 — Performer UI + Audio ✅ Complete
*Milestone: A solo performer can run a complete improvisational set.*

Tasks:
1. Prompt overlay: full design from `wireframe-01-performer-ui.md` — step progress bar, generation status, prompt history (`↑`), `Esc` cancel
2. Repurpose NoirMak code overlay for Signal Bloom: show active prompt + generation step count alongside live sketch code
3. Status bar: sketch name, audio level indicator, generation count
4. Extend keyboard map: add `P` (prompt), generation cancel (`Esc`), prompt history navigation
5. Verify all NoirMak controls still work: `B` blackout, `L` scanlines, `K` code overlay, `J` color cycle, `W` warp
6. Full MicInput.js integration test: verify bass → tunnel deformation, mid → Hydra modulation, hi → chromatic aberration bursts
7. Add camera speed controller from `study-04-audio-tunnel.js`: bass transients → 2.2× forward speed burst
8. Performance simulation: run 30-minute improvisational session, log any crashes or UX friction points

---

### Phase 4 — Signal Bloom Sketch Library ✅ Complete
*Milestone: 8–10 new sketches designed for tunnel-wall texturing. OBS working.*

The 16 NoirMak sketches were designed for flat-screen display. New Signal Bloom sketches should be designed for curved tunnel geometry — they need to work as textures mapped to `THREE.BackSide` surfaces seen in perspective. Consider:
- Avoid hard edges that will look wrong on curved geometry
- Favor flowing, organic, or radially symmetric patterns
- Audio reactivity should read clearly even at small texture scale
- Think about how a sketch will look as a wall you are flying through, not a screen you are watching

Tasks:
1. Write 8–10 new Hydra sketches optimized for tunnel texturing
2. Each sketch should have a distinct character fitting the aesthetic vocabulary: feedback, recursion, voronoi, noise fields, oscillator interference, luma-key layering, datamosh
3. Name sketches with the Signal Bloom naming convention: `nn-descriptive-name.js` (e.g. `10-bloom-recursive.js`)
4. Test each sketch as a tunnel wall texture in Three.js — not just in isolation
5. Tune post-processing chain: bloom strength, afterimage damping, fog density — calibrated for projection
6. OBS setup: browser source or window capture, confirm full-resolution capture at 60fps
7. Projection environment test: if projector available, test actual throw distance and brightness

---

### Phase 5 — Performance Testing + Final Build ✅ Complete
*Milestone: Performance-ready system, fully documented.*

Tasks:
1. Run 3× full-length performance simulations (30–45 minutes each) without stopping
2. Log every crash, hang, or UX friction point — fix before final build
3. Tune ComfyUI generation parameters for the actual performance hardware (step count, CFG, model)
4. Build a performance "score" — a loose arc from surface to depth, with specific prompt sequences and sketch transitions
5. Document the keyboard control sheet as a single printable reference card
6. Final README update with setup instructions, ComfyUI installation, and performance checklist
7. Archive: record a 10-minute performance documentation video

---

## Aesthetic & Design Guidelines

These are non-negotiable constraints, not preferences. Every UI element and code decision should be checked against them.

**Visual language:**
- Dark backgrounds only. Never white or light backgrounds.
- Instability is correct. Smooth, polished, resolved aesthetics are wrong for this project.
- Glitch is intentional. If something looks like a rendering error but feels right, keep it.
- Cyan (`#00f0ff`) is the primary color. Magenta (`#ff00ee`) is secondary. Electric blue (`#1a1aff`) is depth. Amber (`#ffaa00`) is used sparingly for alert/accent only.
- Monospace typography throughout all UI elements. `'Courier New', Courier, monospace`.
- Code overlay always uses `mix-blend-mode: difference` — it must remain readable over any visual.

**Interaction design:**
- The performer cannot use a mouse during a set. Everything must be keyboard-operable.
- Cognitive load during performance must be minimal. No menus, no multi-step confirmations.
- Single-key actions wherever possible. If an action requires two keys, it is too slow.
- Blackout (`B` key) must always be instant — it is the emergency brake during live performance.
- The system should be resilient to errors silently. A sketch that crashes should log to console and reload, not freeze the interface.

**Code aesthetic:**
- Prefer fluid, continuous processes over discrete state machines.
- Prefer emergence over control. Don't try to eliminate unpredictable behavior from generative systems.
- `mix-blend-mode`, `afterimage`, `feedback` — lean into these. They are the aesthetic.
- Latency in AI generation is not a problem to eliminate — it is the duration of the crystallization arc. Manage it aesthetically, not technically.

---

## Coding Conventions

- **Sketch files:** `/sketches/nn-descriptive-name.js`, lowercase hyphenated, numbered with two-digit prefix.
- **No CDN dependencies during performance.** All libraries must be vendored in `/libs/`. Tested offline.
- **No TypeScript.** Vanilla JS throughout. No build step — the browser serves files directly.
- **SSE over WebSocket for browser communication.** `EventSource` is one-way and simpler; reserve WebSocket for the bridge ↔ ComfyUI connection only.
- **Hydra instances must use `makeGlobal: false`** when managed by `HydraManager` to avoid window pollution between instances.
- **`CanvasTexture.needsUpdate = true`** must be called every frame in the Three.js render loop. Not once at load time — every frame.
- **Error handling at sketch boundaries:** wrap sketch `eval`/`Function` calls in try/catch. Log errors and continue — never let a bad sketch freeze the renderer.
- **`THREE.BackSide`** on tunnel wall material — always. The camera is inside the tunnel.
- **ComfyUI workflows as JSON files** in `/workflows/`, not hardcoded strings. Makes them editable during performance without touching JavaScript.
- **Generated images** always write to `/generated/latest.png` + archived to `/generated/archive/[timestamp].png`. The browser always requests `latest.png?t=[timestamp]` to bust cache.
- **No comments that explain what the code does.** Comments only for non-obvious WHY — a hidden constraint, a ComfyUI API quirk, a Hydra behavior that would surprise a reader.

---

## Hardware Note (Action Required Before Phase 2)

Before beginning Phase 2, run this command on the performance Mac mini and record the output:

```bash
system_profiler SPHardwareDataType | grep "Chip\|Processor"
```

- **Apple Silicon (M1/M2/M3/M4):** ComfyUI uses MPS backend. Install with `--use-mps-device` flag. LCM generation: ~4–8 seconds per run at 4–8 steps. Full crystallization arc is viable.
- **Intel Mac mini:** ComfyUI runs CPU-only. Generation: 60–120+ seconds. Streaming arc is not viable without a fallback strategy (pre-generate and cycle images). This changes Phase 2 significantly.

Do not begin Phase 2 until this is confirmed.

---

## Performance Checklist (For Final Build)

Before any live performance:
- [ ] ComfyUI running at `localhost:8188`, queue clear
- [ ] Signal Bloom bridge running at `localhost:3001`
- [ ] Chrome open at `localhost:3001`, full-screen (`F11`)
- [ ] Mic input routed and MicInput.js showing level
- [ ] OBS capturing browser window, projector output confirmed
- [ ] Test blackout (`B`) and restore
- [ ] Test prompt dispatch — one generation successful
- [ ] Sketch list loaded, keyboard navigation confirmed
- [ ] Internet connection disabled or firewalled (performance is offline-safe by design)

---

## Key Documentation

- `prototypes/wireframes/` — system architecture, performer UI layout, tunnel spatial zones
- `prototypes/code-studies/` — reference implementations for all Phase 1–2 integration patterns
- `prototypes/mockups/mockup-01-performer-interface.html` — visual design reference (open in browser)
- `prototypes/interactive/prototype-01-performer-controls.html` — keyboard interaction simulation
- `prototypes/interactive/prototype-02-generation-arc.html` — AI generation arc simulation
- `docs/prototyping-summary.md` — full narrative description of all prototyping deliverables
