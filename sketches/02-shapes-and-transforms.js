// 02 — Shapes and Transforms
// Hydra isn't only oscillators. shape() draws a regular polygon (3 = triangle,
// 4 = square, 100 = basically a circle), and the geometric transforms below —
// kaleid, rotate, scale, scroll, pixelate — reshape whatever source they're
// chained onto. This sketch stacks several to show how they compose.

shape(4, 0.4, 0.01)
  // shape(sides, radius, smoothing) — a soft-edged square.
  // Try 3 for a triangle, 6 for a hexagon, 60+ for a circle.

  .kaleid(5)
  // kaleid(segments) — mirrors the frame into N pie-slice wedges around the
  // center, like a kaleidoscope. Higher numbers = more repetitions. Try 1
  // (no effect) up to 12+ (dense mandala).

  .color(1.0, 0.0, 0.85)
  // Magenta. Swap for any (r, g, b) triple, 0–1 each.

  .rotate(0.2, () => Math.sin(Date.now() / 2000) * 0.1)
  // rotate(initialAngle, speed) — speed can be a plain number (constant
  // spin) or, like here, a function that changes over time. Date.now() in
  // milliseconds, divided down and passed through sin(), gives a slow
  // oscillation back and forth instead of a one-directional spin.

  .scale(1, () => 1 + Math.sin(Date.now() / 800) * 0.15)
  // scale(x, y) — independent horizontal/vertical stretch. A sine wave on
  // the y-scale makes the shape breathe.

  .scrollX(0.1, 0.05)
  // scrollX(scrollAmount, speed) — shifts pixels horizontally and wraps them
  // around, like a conveyor belt. scrollY is the vertical equivalent.

  .out()
  // Next: 03-modulation-and-noise.js — use a second pattern to warp this one
  // instead of transforming it directly.
