# Signal Bloom

A live audiovisual performance instrument: a Three.js tunnel textured with
live-coded Hydra visuals, audio-reactive to whatever's in the room, with an
optional local AI generation layer (ComfyUI + Flux) that lets a performer type
a prompt and watch a form crystallize out of noise in the space ahead of the
audience.

It's built to be played, not just watched — every visual parameter is
keyboard-driven, sketches hot-reload the instant you save them, and the whole
system runs fully offline once installed.

## Quickstart (visuals only, ~10 minutes)

No AI setup, no ComfyUI, no model downloads. This gets you the tunnel, the
Hydra sketch library, audio reactivity, and live-coding hot-reload. These
steps assume no prior experience with any of this — if you already know
your way around Node and a terminal, skip ahead to step 4.

### What you'll need first

- **[Node.js](https://nodejs.org/)**, version 22 or newer. This is the
  program that actually runs Signal Bloom. If you're not sure whether you
  have it, open a terminal (step 3 below shows how) and type
  `node --version`. A number of 22 or higher means you're set; an error, or
  a lower number, means you need to install it — download the button
  labeled **LTS** from [nodejs.org](https://nodejs.org/) and run the
  installer like any other app.
- **[Visual Studio Code](https://code.visualstudio.com/)** — free, and what
  these instructions assume you're using. Any code editor works, but the
  steps below (like "open a terminal") are specific to VS Code.
- **Google Chrome** — the browser this project is actually tested in.

### 1. Download this repository

Near the top of this page on GitHub, click the green **Code** button, then
**Download ZIP**. Unzip the file you get — you'll end up with a folder
named something like `signal-bloom-public`. (If you already use git,
`git clone` works too, but the ZIP is the simpler path if that's unfamiliar.)

### 2. Open that folder in VS Code

Open VS Code, then **File → Open Folder…**, and select the folder from
step 1.

### 3. Open a terminal inside VS Code

From the top menu: **Terminal → New Terminal**. A command-line panel opens
at the bottom of the window — it starts out already inside the project
folder, so you don't need to type anything to navigate there.

### 4. Install and start

Type each line below into that terminal and press Enter after each one:

```bash
npm install
npm run dev
```

`npm install` downloads the small number of code libraries this project
depends on — a one-time step (skip it next time you run the project,
unless you delete the `node_modules` folder it creates). `npm run dev`
then starts Signal Bloom itself. Leave this terminal open and running —
closing it stops the project.

### 5. Open it in your browser

Go to `http://localhost:5173` in Chrome. ("localhost" means your own
computer — this is a local address, not a website; nothing you do here
gets uploaded anywhere.) If your browser asks for microphone access, that's
optional — declining just means the visuals won't react to sound. Press
`F11` for full-screen.

### What you should see

A tunnel with a Hydra-textured wall, falling forward through recycling
rings of points. Try:

- `←` / `→` — change the sketch on screen
- `K` — see its source code as a live-updating overlay
- `B` — instant blackout

Then, back in VS Code, open `sketches/01-hello-hydra.js` from the file list
on the left, change a number, and save. Watch the browser update instantly,
with no refresh — that loop, edit → save → see it live, is the whole
instrument.

Full keyboard reference: **[controls.md](controls.md)**.

## Trust model

Sketches are **code, not media** — a `.js` file in `sketches/` isn't a
picture or a video you're viewing, it's a program that runs with full
access to the page the moment it loads (that's what "live coding" means:
the file you save *is* the running program). Only run sketches you've
read, the same way you'd only run any other script from the internet. The
bridge server (`watcher.js`) only listens on your own machine
(`127.0.0.1`) and is never reachable from the network; ComfyUI is the
same. Nothing in this project phones home — no telemetry, no accounts, no
API keys, no cloud calls. A prompt you type into the AI layer never
leaves your machine.

## Tier 2 — AI generation (optional)

Everything above (Tier 1) is the full visual instrument on its own — this
section is for the additional layer where a typed prompt crystallizes into
a generated form in the tunnel. It's an optional, heavier setup: a second
program (ComfyUI) installed alongside Signal Bloom, plus ~15 GB of AI model
files downloaded once. It also needs capable hardware — either an Apple
Silicon Mac (M1 or newer) or a Windows/Linux PC with a dedicated graphics
card that has a good amount of video memory (12+ GB VRAM). A laptop with
only integrated graphics can run Tier 1 fine, but isn't a good fit for this
part.

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
docs](https://hydra.ojack.xyz/docs/) for the full `s0`–`s3` API). Those two
folders are already listed in `.gitignore`, so if you ever publish your own
fork, your own media files won't get swept up and uploaded along with it.

`window.micLevel` (0–1 RMS) and `window.micFFT` (per-band frequency data) are
available in every sketch for audio reactivity — see `01-hello-hydra.js` for
the basic hook or `04-audio-reactive.js` for bass/mid/high band-splitting.

The seven floating shapes drifting through the tunnel (`G` to toggle, `R` to
spin) are `.glb` models loaded from `assets/3D/` — swap in your own or
change how many there are; see
[`assets/3D/README.md`](assets/3D/README.md) for what to edit.

## Architecture

*Background for the curious — none of this is required reading to use
Signal Bloom.*

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
