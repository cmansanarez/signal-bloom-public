// 04 — Audio Reactive
// window.micLevel (0–1 overall loudness) is the simplest audio hook — see
// 01-hello-hydra.js. This sketch goes one level deeper: window.micFFT is a
// live Uint8Array of frequency-bin values (0–255 each), so you can split
// the signal into bass/mid/high bands and drive different parameters from
// each — that's what makes visuals read as "reactive" rather than just
// "pulsing with everything at once."

// A small helper: average a range of FFT bins into a single 0–1 value.
// window.micFFT has ~512 bins covering 0 Hz up to the Nyquist frequency
// (~22 kHz at a 44.1 kHz sample rate), so low bin indices are bass and high
// bin indices are treble. This isn't Hydra API — it's plain JS you can
// paste into any sketch.
function band(loBin, hiBin) {
  const fft = window.micFFT
  if (!fft || !fft.length) return 0
  let sum = 0
  for (let i = loBin; i < hiBin; i++) sum += fft[i]
  return sum / (hiBin - loBin) / 255
}

const bass = () => band(0, 6)     // ~0–250 Hz   — kick, low bass
const mid  = () => band(6, 46)    // ~250–2000 Hz — vocals, most instruments
const hi   = () => band(46, 186)  // ~2000–8000 Hz — cymbals, sibilance, air

osc(20, 0.02, 0.0)
  .color(0.0, 0.85, 1.0)

  .modulate(noise(3, 0.1), () => 0.05 + mid() * 0.4)
  // Mid frequencies drive the warp strength — voices and instruments make
  // the pattern ripple.

  .scale(1, () => 1 + bass() * 0.5)
  // Bass drives scale — a kick drum makes the whole frame punch outward.

  .modulateRotate(voronoi(6, 0.2, 0), () => hi() * 2)
  // Highs (hi-hats, sibilance, glitchy transients) drive a rotational
  // shear — short, sharp bursts of high-frequency energy read as sudden
  // twists rather than a slow build.

  .out()
  // Try this: swap which band drives which parameter — bass on rotation
  // instead of scale reads completely differently. There's no "correct"
  // mapping; the whole point is finding one that feels right for the
  // material you're playing. Next: 05-buffers-and-feedback.js for trails
  // and multi-buffer composition.
