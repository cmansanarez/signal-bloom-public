// 05 — Buffers and Feedback
// Every sketch so far has ended in .out() — shorthand for .out(o0), the
// default display buffer. Hydra actually gives you four buffers (o0–o3)
// that can read from and write to each other. Two techniques that unlocks:
// building a pattern on one buffer while reading it on another (layering),
// and having a buffer read its OWN previous frame (feedback — trails,
// echoes, slow decay).

shape(4, 0.35, 0.1)
  .color(1.0, 0.0, 0.85)
  .rotate(0, 0.15)
  .out(o1)
  // A pulsing square, rendered to o1 instead of o0 — it doesn't show up on
  // screen by itself. o1 is just a texture in memory until something reads
  // it, which is what the next block does.

src(o0)
  // src(buffer) reads a buffer as a source, same as osc() or noise() would.
  // Reading o0 from a pipeline that writes back to o0 is the feedback
  // trick: each frame starts from what was on screen last frame.

  .modulate(noise(3, 0.2), 0.01)
  // A gentle warp applied every frame compounds over time — straight lines
  // slowly become organic drift the longer this runs.

  .scale(0.995)
  // Scaling fractionally below 1 every frame makes the feedback trail
  // slowly zoom inward, so old frames appear to recede rather than just
  // sitting static. Try 1.005 to zoom outward instead.

  .diff(src(o1))
  // diff() combines two sources by absolute difference — where they agree
  // goes dark, where they disagree lights up. This is where the o1 buffer
  // (the pulsing square from above) gets composited into the feedback
  // trail on o0.

  .out(o0)
  // Writing back to o0 closes the loop: next frame's src(o0) reads exactly
  // this frame's result. This is the whole mechanism behind trails, echoes,
  // and the slow-decay look — no special "trail" function exists in Hydra,
  // it's just feedback.
