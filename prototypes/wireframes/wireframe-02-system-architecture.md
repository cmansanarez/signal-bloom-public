# Wireframe 02 — System Architecture & Data Flow
Signal Bloom | Component Map | Low-Fidelity Diagram

---

## Full System Overview

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                         PERFORMER ENVIRONMENT                             ║
║                                                                           ║
║   ┌──────────────────┐          ┌───────────────────────────────────┐    ║
║   │   AUDIO INPUT    │          │        VS CODE (Live Coding)       │    ║
║   │                  │          │   Hydra sketch .js files          │    ║
║   │  Mic / DAW       │          │   Hot-save → file watcher         │    ║
║   │  MicInput.js     │          │   Code overlay visible on screen  │    ║
║   │  FFT + RMS       │          └────────────────┬──────────────────┘    ║
║   └────────┬─────────┘                           │                       ║
║            │                                     │ fs.watch() / chokidar ║
╚════════════╪═════════════════════════════════════╪═══════════════════════╝
             │ Web Audio API                        │ SSE: sketch-changed
             ▼                                     ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║                   NODE.JS BRIDGE SERVER  (localhost:3001)                 ║
║                                                                           ║
║   ┌───────────────────────────┐   ┌──────────────────────────────────┐  ║
║   │       watcher.js          │   │           bridge.js              │  ║
║   │                           │   │                                  │  ║
║   │  · File watcher           │   │  POST /prompt                    │  ║
║   │  · Static file server     │   │    → parse prompt text           │  ║
║   │  · SSE: sketch-changed    │   │    → build ComfyUI workflow JSON │  ║
║   │  · SSE: list-changed      │   │    → POST to ComfyUI /prompt     │  ║
║   │  · 80ms debounce          │   │    → open WebSocket to ComfyUI   │  ║
║   └───────────────────────────┘   │    → stream step previews → SSE │  ║
║                                   │    → write final PNG → /generated│  ║
║                                   │    → SSE: image-ready            │  ║
║                                   └──────────────┬───────────────────┘  ║
║                                                  │                       ║
╚══════════════════════════════════════════════════╪═══════════════════════╝
                                                   │ HTTP + WebSocket
                                                   ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║                  COMFYUI  (localhost:8188)                                ║
║                                                                           ║
║   REST  /prompt      ← receives workflow JSON + client_id                ║
║   REST  /history     ← poll for completed output paths                   ║
║   WS    /ws          → streams per-step latent preview frames (b_preview) ║
║                      → streams progress events (progress)                ║
║                      → streams completion event (executing, node=null)   ║
║                                                                           ║
║   WORKFLOWS:                                                              ║
║   · txt2img.json     — prompt → 512×512 PNG (LCM, 4–8 steps)            ║
║   · img2img.json     — frame capture → mutated PNG (feedback loop)       ║
║                                                                           ║
║   OUTPUT: /generated/latest.png + /generated/archive/[timestamp].png     ║
╚═══════════════════════════════════════════════════════════════════════════╝

       SSE events over EventSource (localhost:3001/events)
       ┌──────────────────────────────────────────────────────┐
       │  sketch-changed  → reload Hydra sketch               │
       │  step-preview    → update AI layer canvas (per step) │
       │  image-ready     → load /generated/latest.png        │
       │  generation-done → update prompt overlay status      │
       └──────────────────────────────────────────────────────┘
                               ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║                  BROWSER  (Chrome, localhost:3001)                        ║
║                                                                           ║
║   ┌─────────────────────────┐   ┌─────────────────────────────────────┐ ║
║   │     HYDRA SYNTH          │   │        PERFORMER OVERLAY UI         │ ║
║   │   (HydraManager.js)      │   │                                     │ ║
║   │                          │   │  · Prompt input field (P key)       │ ║
║   │  · N offscreen canvases  │   │  · Step progress bar                │ ║
║   │  · Each runs one sketch  │   │  · Generation status text           │ ║
║   │  · Audio via MicInput.js │   │  · Code overlay (K key)             │ ║
║   │  · MicInput → a.fft[]   │   │  · Status bar (H key)               │ ║
║   │  · CanvasTexture objects │   │  · Scanlines (L key)                │ ║
║   └───────────┬─────────────┘   │  · Blackout (B key)                 │ ║
║               │ canvas textures  └─────────────────────────────────────┘ ║
║               ▼                                                           ║
║   ┌───────────────────────────────────────────────────────────────────┐  ║
║   │                      THREE.JS SCENE                               │  ║
║   │                                                                   │  ║
║   │   · Fracture tunnel geometry (1584-point Perlin-deformed wormhole)│  ║
║   │   · Tunnel walls: THREE.BackSide material + Hydra CanvasTexture   │  ║
║   │   · AI form geometry: floating in tunnel space, receives AI frames │  ║
║   │   · Camera: forward motion (0.14 units/frame) + figure-8 sway     │  ║
║   │   · Audio: MicInput FFT → tunnel Perlin deformation amplitude     │  ║
║   │   · Post-processing: UnrealBloomPass + AfterimagePass + Chrom.Abr │  ║
║   │   · Fog: THREE.FogExp2 (density 0.022)                            │  ║
║   └───────────────────────────────┬───────────────────────────────────┘  ║
║                                   │                                       ║
╚═══════════════════════════════════╪═══════════════════════════════════════╝
                                    │ browser window / canvas capture
                                    ▼
                       ┌────────────────────────┐
                       │       OBS STUDIO        │
                       │                         │
                       │  · Browser source       │
                       │  · Projection routing   │
                       │  · Performance recording│
                       └────────────────────────┘
```

---

## AI Generation Data Flow (Detailed)

```
PERFORMER TYPES: "three-dimensional torus primitive"
       │
       │ [P overlay open, Enter pressed]
       ▼
POST localhost:3001/prompt  { "prompt": "three-dimensional torus primitive" }
       │
       ▼
bridge.js buildTxt2ImgWorkflow(prompt)
  → inject into ComfyUI LCM workflow JSON
       │
       ▼
POST localhost:8188/prompt  { prompt: {...}, client_id: "signal-bloom" }
  ← returns { prompt_id: "abc123" }
       │
       ▼
WebSocket ws://localhost:8188/ws?clientId=signal-bloom
       │
       ├── msg: { type: "progress", data: { value: 1, max: 8 } }
       │     └── SSE → browser: event: step-preview, data: { step:1, total:8 }
       │           └── browser: update progress bar, dispatch "noise" frame
       │
       ├── msg: { type: "b_preview", data: "<base64 PNG>" }
       │     └── SSE → browser: event: step-preview, data: { preview: "<b64>" }
       │           └── browser: update AI canvas layer in Three.js scene
       │
       ├── (steps 2–7 repeat above...)
       │     └── AUDIENCE SEES: noise → progressively crystallizing torus
       │
       └── msg: { type: "executing", data: { node: null } }  ← generation complete
             └── bridge: fetch full output from /history/abc123
                   → write PNG to /generated/latest.png
                   → SSE → browser: event: image-ready
                         └── browser: s0.initImage('/generated/latest.png')
                               → AI form fully resolved in tunnel space
```

---

## File System Layout

```
signal-bloom/
├── index.html                    ← performer browser entry point
├── sketch-loader.js              ← sketch cycling, keyboard controls, overlays
├── watcher.js                    ← extended: file watch + SSE + static server
├── bridge.js                     ← ComfyUI integration (Phase 2 new file)
├── package.json
│
├── sketches/                     ← Hydra sketch library
│   ├── 00-[name].js
│   └── ...
│
├── libs/                         ← vendored libraries (no CDN during performance)
│   ├── hydra-synth.js
│   ├── hydra-wrap.js
│   ├── lib-cond.js
│   └── datamosh.js
│
├── generated/                    ← ComfyUI output (written by bridge.js)
│   ├── latest.png
│   └── archive/
│
├── workflows/                    ← ComfyUI workflow JSON files
│   ├── txt2img.json
│   └── img2img.json
│
└── prototypes/                   ← this folder
```
