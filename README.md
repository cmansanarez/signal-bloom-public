# Signal Bloom

A live audiovisual performance instrument: a Three.js tunnel textured with
live-coded Hydra visuals, audio-reactive to whatever's in the room, with an
optional local AI generation layer (ComfyUI + Flux) that lets a performer type
a prompt and watch a form crystallize out of noise in the space ahead of the
audience.

It's built to be played, not just watched — every visual parameter is
keyboard-driven, sketches hot-reload the instant you save them, and the whole
system runs fully offline once installed.

## Quickstart (visuals only, ~5 minutes)

No AI setup, no ComfyUI, no models. This gets you the tunnel, the Hydra
sketch library, audio reactivity, and live-coding hot-reload.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome. Grant microphone access when prompted
(optional — declining just means the visuals won't react to sound). Press `F11`
for full-screen.

You should see a tunnel with a Hydra-textured wall, falling forward through
recycling rings of points. Press `←`/`→` to change the sketch on screen, `K`
to see its source as a live-updating code overlay, `B` for instant blackout.
Open `sketches/01-hello-hydra.js` in your editor, change a number, save —
watch it update in the browser with no refresh. That loop is the whole
instrument.

Full keyboard reference: **[controls.md](controls.md)**.

## Trust model

Sketches are **code, not media** — they run with full page privileges the
moment they load (that's what live coding means: the file you save *is* the
running program). Only run sketches you've read. The bridge server
(`watcher.js`) binds to `127.0.0.1` only and is never reachable over a
network; ComfyUI is the same. Nothing in this project phones home — no
telemetry, no accounts, no API keys, no cloud calls. A prompt you type into
the AI layer never leaves your machine.

## Tier 2 — AI generation (optional)

The full noise-to-crystallization arc needs a local ComfyUI install and the
Flux.1 schnell model. This is the heavier setup — budget ~15 GB of downloads
and either Apple Silicon or a GPU with real VRAM.

**[docs/comfyui-model-setup.md](docs/comfyui-model-setup.md)** — exact files,
where to get them, where they go, and how to verify it's working.

Once it's running: press `P` to open the prompt input, type a description,
hit `Enter`. Watch the status line go `summoning…` → `crystallizing N/4` →
`formed` as latent previews stream into the tunnel and resolve into a shape.
Press `I` to toggle img2img mode, which evolves the last generation instead
of starting from pure noise — the feedback loop the whole system is built
around.

## What Signal Bloom is

*The evolving relationship between performer, machine, and emergence.*

The audience descends through the tunnel; the performer types prompts and
AI-generated forms crystallize out of noise ahead of them — noise first,
then vague shape, then resolved geometry, over roughly 5–15 seconds. The
emergence **is** the performance. Instability isn't a bug to engineer away;
it's the aesthetic and the argument.

The framework is queer futurism and cybernetic aesthetics. Glitches operate
as both visual language and conceptual metaphor — interruptions in dominant
systems, structures exposed by their own failure modes. From the artist
statement:

> "I am drawn to moments where control begins to collapse, where glitches
> behave like interruptions in dominant structures, and where new visual
> languages emerge through improvisation between human and machine
> intelligence."

## Why this is open source

Signal Bloom is built almost entirely on open-source technologies — Hydra,
Three.js, ComfyUI, Flux, and the broader creative-coding community. This
project's existence depends on that generosity, and releasing it back isn't
a distribution strategy so much as a continuation of it: a flexible framework
for live coding, AI generation, and improvisational performance that other
artists can study, adapt, and push somewhere I wouldn't have taken it. The
value isn't a specific aesthetic — it's the framework underneath one.

## Extending it — sketches, media, and 3D primitives

Sketches live in `sketches/` as plain `.js` files — Hydra code run directly,
no build step. Naming convention: `nn-descriptive-name.js`, two-digit prefix,
lowercase hyphenated. This repo ships five generic teaching sketches (see
`docs/public-sketch-list.md`) that build from basics to feedback loops —
start with `01-hello-hydra.js`.

To write your own media-driven sketch, drop files in `videos/` or `images/`
at the project root and reference them the way Hydra's source slots do
(`s0.initVideo('/videos/yours.mp4')` — see the [Hydra
docs](https://hydra.ojack.xyz/docs/) for the full `s0`–`s3` API); those
directories are gitignored by default so your own media stays yours.

`window.micLevel` (0–1 RMS) and `window.micFFT` (per-band frequency data) are
available in every sketch for audio reactivity — see `01-hello-hydra.js` for
the basic hook or `04-audio-reactive.js` for bass/mid/high band-splitting.

The seven floating shapes drifting through the tunnel (`G` to toggle, `R` to
spin) are `.glb` models loaded from `assets/3D/` — swap in your own or
change how many there are; see
[`assets/3D/README.md`](assets/3D/README.md) for what to edit.

## Architecture

```
Browser (Hydra sketches + Three.js tunnel + mic input)
        │  SSE (/events) + HTTP
Node.js bridge — watcher.js + comfyui.js  (127.0.0.1:3001, loopback only)
        │  HTTP + WebSocket
ComfyUI (127.0.0.1:8188)  ← optional, Tier 2 only
```

The browser never talks to ComfyUI directly — the bridge is the only thing
that does, and the bridge only listens on loopback. `watcher.js` also serves
the sketch files and watches them for hot-reload (SSE, 80 ms debounce).
`config.json` and `workflows/*.json` are read fresh on every generation, so
tuning prompts, LoRA strength, or sampler settings needs no restart.

## Credits & lineage

- **[Hydra](https://github.com/hydra-synth/hydra)** (AGPL-3.0) — the live
  video synth this entire visual language is built on.
- **[Three.js](https://github.com/mrdoob/three.js)** (MIT) — the tunnel.
- **[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** and
  **[Flux](https://github.com/black-forest-labs/flux)** — the AI generation
  layer.
- The tunnel geometry, audio pipeline, and post-processing chain descend
  from an earlier project, Orpheus Protocol.
- The sketch-cycling/hot-reload/code-overlay pattern descends from an
  earlier VJ system built for the same practice.

## License

AGPL-3.0 — see [LICENSE](LICENSE). Chosen to match Hydra's own license and to
keep this framework, and anything built directly on it, open.
