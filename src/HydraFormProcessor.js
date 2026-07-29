// HydraFormProcessor.js — Signal Bloom
// A second Hydra instance (makeGlobal: false) dedicated to real-time
// audio-reactive processing of AI-generated forms.
//
// The wall Hydra (makeGlobal: true) owns the tunnel walls and runs performer
// sketches. This instance runs a fixed patch: the generated image fed into s0,
// warped by mic level, brightness-modulated by bass. Its canvas feeds directly
// into AIFormLayer as a THREE.CanvasTexture — the form breathes with the audio
// rather than sitting as a static PNG in the tunnel.
//
// window.micLevel and window.micFFT[] are populated by MicInput each frame.

export class HydraFormProcessor {
  constructor() {
    this.canvas          = null
    this.synth           = null
    this._ready          = false
    this._rotateEnabled  = false
  }

  async init(width = 512, height = 512) {
    const canvas = document.createElement('canvas')
    canvas.width  = width
    canvas.height = height
    Object.assign(canvas.style, {
      position: 'fixed', top: '-9999px', left: '-9999px',
      pointerEvents: 'none', visibility: 'hidden',
    })
    document.body.appendChild(canvas)
    this.canvas = canvas

    const instance = new Hydra({
      canvas,
      makeGlobal:          false,
      detectAudio:         false,
      autoLoop:            true,
      enableStreamCapture: false,
    })
    this.synth = instance.synth

    // Default patch: image source + noise warp at mic level + brightness on bass.
    // Subtle enough to preserve crystallization legibility; alive enough that the
    // form feels embedded in the same system as the tunnel walls.
    const s = this.synth
    s.src(s.s0)
      .modulate(s.noise(4, 0.4), () => (window.micLevel || 0) * 0.15)
      //.luma(() => (window.micFFT?.[0] || 0) / 255 * 0.2)
      .contrast(1.15)
      .rotate(0, () => this._rotateEnabled ? 0.1 : 0)
      .mask(s.shape(2, 0.5, 0.5))
      .scale([1, 1.3].fast(0.5).smooth(0.4))
      .out()

    this._ready = true
    console.log(`[HydraForm] Ready — ${width}×${height}`)
    return this
  }

  // Load the current AI image into this instance's s0.
  // Called on each latent preview step and on image-ready.
  // src must be a full URL or data URL (data:image/jpeg;base64,…).
  updateSource(src) {
    if (!this._ready) return
    try { this.synth.s0.initImage(src) } catch (_) {}
  }

  toggleRotation() { this._rotateEnabled = !this._rotateEnabled }

  getCanvas() { return this.canvas }

  dispose() {
    this.canvas?.remove()
    this.canvas = null
    this.synth  = null
    this._ready = false
  }
}
