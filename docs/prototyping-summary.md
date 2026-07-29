# Signal Bloom — Prototyping Phase Summary

## Original Brief

> Develop prototypes, including wireframes, low-resolution renders, code studies, and mockups.
> Wireframes: Offer low-fidelity outlines focusing on structure, layout, and navigation.
> Mockups: Create high-fidelity static representations to refine the visual aspects before adding interactivity.
> Prototypes: Develop interactive versions to simulate user interactions and test usability.

---

## Overview

Before a single line of production code was written for Signal Bloom, a complete set of design and technical artifacts was developed across four categories: wireframes, a high-fidelity mockup, interactive prototypes, and annotated code studies.

All artifacts live in the `prototypes/` directory, indexed at [`prototypes/README.md`](../prototypes/README.md).

---

## Wireframes

Three low-fidelity ASCII wireframes were produced to document structure, layout, and component relationships across the system.

[`prototypes/wireframes/wireframe-01-performer-ui.md`](../prototypes/wireframes/wireframe-01-performer-ui.md) diagrams the full performer browser interface — the screen a performer sees during a live set. It details every overlay zone in the system: the Three.js tunnel canvas as the base layer, the code display overlay triggered by the `K` key, the prompt input overlay triggered by `P`, the blackout state, the status bar, and the scanlines overlay. The wireframe also documents the complete z-index stack showing how all layers relate spatially, and includes the full keyboard control reference table for the system.

[`prototypes/wireframes/wireframe-02-system-architecture.md`](../prototypes/wireframes/wireframe-02-system-architecture.md) maps the full data flow of the Signal Bloom system from top to bottom — audio input through MicInput.js, the live coding environment in VS Code, the Node.js bridge server that mediates between the browser and ComfyUI, the ComfyUI API endpoints and WebSocket streaming behavior, and the browser rendering layer where Hydra, Three.js, and the performer UI converge. A second section traces a single AI generation event step by step: from the performer typing a prompt, through ComfyUI's denoising loop, to individual SSE events being received in the browser and updating the tunnel scene in real time.

[`prototypes/wireframes/wireframe-03-tunnel-spatial-layout.md`](../prototypes/wireframes/wireframe-03-tunnel-spatial-layout.md) diagrams the Three.js tunnel scene as a spatial environment rather than a UI. It maps the three distinct zones of the tunnel — the near zone where the performer's current Hydra sketch textures the walls, the AI encounter zone where generated forms crystallize as the camera approaches, and the far zone where fog deepens and post-processing intensifies. The wireframe also documents the camera's figure-8 trajectory, the geometry structure of the Fracture tunnel (1,584 vertices across 22 recycling rings), the layer stack from post-processing through geometry to fog, AI form spawn and fade behavior, and the intended color temperature gradient from near to far.

---

## Mockup

[`prototypes/mockups/mockup-01-performer-interface.html`](../prototypes/mockups/mockup-01-performer-interface.html) is a static, non-interactive HTML/CSS high-fidelity mockup of the full performer interface as it will appear during a live set. It is not a placeholder or sketch — it is a complete visual design document built in code.

The mockup renders the tunnel environment using CSS radial gradients and animation to simulate the generative texture on the tunnel walls and the continuous forward motion of the camera. A CSS-animated AI form floats in the middle distance, crystallizing from blur toward sharpness over an eight-second loop to communicate the central visual arc of the system. The status bar at the top displays the active sketch name and a pulsing live indicator. The code overlay on the left shows a Hydra sketch with syntax coloring and a highlighted line indicating the most recently changed code — mirroring the NoirMak code overlay behavior. The prompt overlay is rendered in its generating state, showing a partially filled progress bar and an active prompt, communicating the visual design of the AI generation interface. The key reference bar at the bottom lists the full control scheme in minimal type.

The color palette is drawn directly from the NoirMak VJ system: `#00f0ff` (cyan) as the primary interface color, `#ff00ee` (magenta) as secondary, `#1a1aff` (electric blue) as depth fill, against a pure black background. Monospace typography throughout.

*This file can be opened directly in any browser — no server required.*

---

## Interactive Prototypes

Two interactive browser prototypes were built to simulate the two most critical performer interactions in the system before any production infrastructure exists.

[`prototypes/interactive/prototype-01-performer-controls.html`](../prototypes/interactive/prototype-01-performer-controls.html) simulates the complete keyboard control scheme. The performer can press every key in the system — `←` and `→` to cycle through a mock sketch list, `0`–`9` to jump to sketches by index with the 600ms multi-digit buffer, `K` to toggle the code overlay, `P` to open the prompt overlay with a live text input supporting prompt history via `↑`, `B` to cut to blackout, `L` to toggle scanlines, `H` to show and hide the status bar, `C` / `S` / `V` to jump to sketches by keyword, and `Space` to simulate a silent sketch reload. Every key press logs its action to a real-time control log panel on the right side of the screen, providing immediate visual confirmation of the intended system behavior. This prototype lets the full keyboard interaction design be evaluated and refined without any of the production systems running.

[`prototypes/interactive/prototype-02-generation-arc.html`](../prototypes/interactive/prototype-02-generation-arc.html) simulates the central artistic interaction of Signal Bloom — the noise-to-crystallization arc. A performer enters a text prompt, selects a target shape (torus, lattice, sphere, or body form), and dispatches the generation. A 360×360 canvas then animates through 20 simulated denoising steps, starting at pure noise and progressively blending toward a drawn representation of the selected shape — rendered with WebGL-style glow, bloom, and depth using Canvas 2D compositing. An SSE event stream panel on the right side updates with simulated `step-preview`, `image-ready`, and `generation-done` events in real time, demonstrating exactly the event protocol the production bridge server will emit. The generation takes approximately 10 seconds to complete, matching the expected latency of an LCM model run on Apple Silicon. Pressing `Esc` during generation cancels it.

**Deployment note:** Both interactive prototypes are standalone HTML files with no external dependencies. They require only a browser to run — open directly from the file system or serve via any static file server. Walkthroughs of both prototypes will be recorded locally and linked from this document once captured.

---

## Code Studies

Four annotated JavaScript files in [`prototypes/code-studies/`](../prototypes/code-studies/) document the key integration patterns that will be implemented during Phase 1 and Phase 2 of development. These are reference implementations — not yet wired into the production system, but written at production quality so they can be directly adapted during the build.

[`study-01-sse-bridge.js`](../prototypes/code-studies/study-01-sse-bridge.js) is a complete Node.js bridge server that extends the NoirMak `watcher.js` pattern with two new capabilities: a `GET /events` SSE endpoint that streams four event types to the browser (`sketch-changed`, `step-preview`, `image-ready`, `generation-done`), and a `POST /prompt` endpoint that accepts a text prompt, dispatches it to ComfyUI, streams denoising step previews back via SSE, writes the final PNG to `/generated/latest.png`, and archives timestamped copies.

[`study-02-comfyui-websocket.js`](../prototypes/code-studies/study-02-comfyui-websocket.js) documents the ComfyUI REST and WebSocket API integration — how to dispatch a workflow, open a WebSocket connection to receive per-step preview frames, and detect completion. It also includes fully documented `buildTxt2ImgWorkflow()` and `buildImg2ImgWorkflow()` functions that generate the ComfyUI node graph JSON for LCM-accelerated generation, calibrated for Apple Silicon performance targets.

[`study-03-hydra-to-threejs.js`](../prototypes/code-studies/study-03-hydra-to-threejs.js) documents the Hydra → Three.js texture pipeline — the pattern proven in the Orpheus Protocol Portal scene. It includes a `HydraTextureManager` class that manages multiple isolated Hydra instances rendering to offscreen canvases, a `buildTunnelMaterial()` function applying those canvases as `THREE.CanvasTexture` to the tunnel geometry, an `AIFormLayer` class managing the full lifecycle of AI-generated planes in the tunnel (spawn at distance, scale-in, timeout, fade-out), and an `connectSSE()` function wiring all SSE events from the bridge to the Three.js scene.

[`study-04-audio-tunnel.js`](../prototypes/code-studies/study-04-audio-tunnel.js) documents the audio reactivity wiring — MicInput.js FFT band data driving Three.js tunnel geometry deformation via per-vertex Perlin noise, a `CameraSpeedController` class that detects bass transients and triggers forward speed bursts matching the Orpheus Protocol Fracture scene behavior, a `PostProcessingController` that scales bloom strength with amplitude and triggers chromatic aberration glitch bursts on high-frequency peaks, and a `bridgeAudioToHydra()` function synchronizing MicInput.js values into isolated Hydra instances that cannot read the global `a` object directly.

---

## Mood Board & Prototype Screenrecording

The mood board has been created defining the overall aesthetic and mood for Signal Bloom. The mood board was created using Milanote and can be viewed here: https://app.milanote.com/1WwmqG1IOtuebF/signal-bloom

To view the interactive prototypes, a screen recording can be viewed here:
https://www.loom.com/share/b052ff84c8ce49c59d73e15d3114baa7 
