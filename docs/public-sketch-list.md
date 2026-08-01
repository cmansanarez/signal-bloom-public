# Sketch Library

*New here? Get Signal Bloom running first via the main
[README.md](../README.md)'s Quickstart — this page assumes that's done.*

`sketches/` ships five brand-new, generic Hydra example sketches — not
performance material. They exist purely to teach the syntax, the hot-reload
workflow, and the audio-reactive vocabulary this project is built on, in a
deliberate order from basics to feedback loops. Read them in the code
overlay (`K` key) — the comments are the tutorial.

## Included

| File | Teaches |
|---|---|
| `sketches/01-hello-hydra.js` | **Start here.** The minimal pipeline: `osc` → `color` → `modulate` → `rotate` → `out`. Introduces the hot-reload loop and the `window.micLevel` hook. |
| `sketches/02-shapes-and-transforms.js` | `shape()`, `kaleid()`, `rotate()`, `scale()`, `scrollX()` — geometric transforms and how they compose. |
| `sketches/03-modulation-and-noise.js` | `modulate()`, `modulateScale()`, `modulateRotate()` — using one pattern's brightness to displace another, Hydra's core technique. |
| `sketches/04-audio-reactive.js` | `window.micFFT` band-splitting (bass/mid/high) to drive different parameters independently — the step beyond `micLevel`. |
| `sketches/05-buffers-and-feedback.js` | The four buffers (`o0`–`o3`), `src()`, and self-referential feedback — trails, echoes, layering one buffer into another. |

Each sketch builds on the last; `01` through `05` is a complete on-ramp from
zero to the full vocabulary these examples use. From there, the natural next
step is combining techniques into a sketch of your own.

## Naming convention

`nn-descriptive-name.js` — two-digit prefix, lowercase, hyphenated. Numbers
are ordering, not IDs; renumbering when sketches are added or removed is
fine as long as the prefixes stay sorted.

## Adding your own

Drop a new `.js` file in `sketches/` and it appears in the sketch list
automatically (SSE `list-changed` event, no restart needed) — see
`watcher.js`'s `getSketchList()`. A sketch is plain Hydra code ending in
`.out()`; nothing else is required. If it references local media, drop the
files in `videos/`/`images/` at the project root (already listed in
`.gitignore`, so they won't get uploaded if you publish your own fork —
see the README's "Extending it" section) and load them the way Hydra's
`s0`–`s3` source slots do.
