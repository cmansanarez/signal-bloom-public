// 01 — Hello Hydra
// Start here. A minimal sketch, heavily commented, teaching the syntax this
// whole library is built on. Hydra chains functions into a pipeline: each
// line transforms the output of the line above it, ending in .out() — the
// pixels that pipeline produces become the texture wrapped on the tunnel
// wall around you (or fill the screen in flat mode — T key).
//
// Try this: change any number below, save the file, watch it hot-reload
// live in the browser — no refresh needed. Edit → save → see, live, is the
// whole workflow this project runs on. Press K to see this code overlaid
// on the visual as you edit it.

osc(10, 0.05, 0.8)
  // osc(frequency, sync, colorOffset) — scrolling color bars.
  // Raise frequency for more bars, raise sync for faster scroll.

  .color(0.0, 0.85, 1.0)
  // Recolor the bars. Each value is 0–1: (red, green, blue).

  .modulate(noise(3, 0.2), 0.15)
  // modulate() distorts an image using a second pattern as a displacement
  // map. Here noise() — organic, flowing static — warps the oscillator, so
  // the sharp bars start to ripple. Raise 0.15 for a stronger warp, or swap
  // noise(3, 0.2) for voronoi(10, 3) to see a completely different warp.
  // See 03-modulation-and-noise.js for more on this technique.

  .rotate(() => (window.micLevel || 0) * 0.3)
  // Audio reactivity: window.micLevel is a live 0–1 value driven by the
  // microphone (src/MicInput.js). Any Hydra parameter can be a function
  // instead of a plain number — Hydra calls it fresh every frame. Here,
  // loudness in the room spins the whole image. See 04-audio-reactive.js
  // for a deeper dive, including per-frequency-band reactivity.

  .out()
  // .out() sends the pipeline to the default buffer (o0), which is what
  // gets displayed. Hydra gives you four buffers (o0–o3) that can read from
  // each other — see 05-buffers-and-feedback.js for what that unlocks.
