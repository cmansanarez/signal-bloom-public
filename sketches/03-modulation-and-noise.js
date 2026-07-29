// 03 — Modulation and Noise
// modulate() is Hydra's core trick: use one pattern's brightness as a
// per-pixel displacement map for another. This sketch layers three
// modulation variants on the same base pattern so you can compare them.
// Comment/uncomment the .modulate*() lines to isolate each effect.

voronoi(6, 0.3, 0.3)
  // voronoi(scale, speed, blend) — organic cell pattern, like cracked glass
  // or cells under a microscope. Good raw material for modulation because
  // its edges read clearly even after heavy distortion.

  .color(0.0, 0.85, 1.0)

  .modulate(noise(4, 0.15), 0.3)
  // modulate(pattern, amount) — displaces pixels using noise() as a vector
  // field. amount controls displacement strength. This is the general-
  // purpose warp — use it whenever you want organic distortion.

  .modulateScale(osc(4, 0, 0), 0.5, 1)
  // modulateScale(pattern, multiple, offset) — displaces by scaling instead
  // of shifting, so it reads as pulsing/breathing rather than melting.
  // Driven by an oscillator here, so the pulse has a rhythmic, periodic feel
  // rather than noise's randomness.

  .modulateRotate(noise(3, 0.1), 0.5, 0.2)
  // modulateRotate(pattern, multiple, offset) — displaces by rotating each
  // pixel around the center by an amount driven by the pattern. Combined
  // with the two modulations above, the cell pattern now ripples, breathes,
  // and swirls simultaneously.

  .out()
  // Try this: swap the noise() calls above for voronoi(10, 3) — a
  // structured pattern makes a very different kind of warp than organic
  // noise does. Next: 04-audio-reactive.js drives these same parameters
  // from the microphone instead of noise()/osc().
