/**
 * MicInput.js — Signal Bloom
 * Web Audio API microphone wrapper (ported from Orpheus Protocol).
 *
 * Usage:
 *   const mic = new MicInput()
 *   const ok  = await mic.init()     // prompts browser permission
 *
 *   // In animation loop:
 *   mic.getLevel()   // 0–1 RMS amplitude  → window.micLevel
 *   mic.getFFT()     // Uint8Array (0–255)  → window.micFFT
 */

export class MicInput {
  constructor(options = {}) {
    this.fftSize   = options.fftSize   ?? 1024
    this.smoothing = options.smoothing ?? 0.8

    this._ctx      = null
    this._analyser = null
    this._source   = null
    this._fftBuf   = null
    this._timeBuf  = null
    this.ready     = false
  }

  async init() {
    try {
      // echoCancellation must be OFF: BlackHole mirrors the system output, so
      // Chrome's echo canceller treats the loopback as echo of what's playing and
      // gates it to near-silence. noiseSuppression/autoGainControl also mangle
      // music — we want the raw signal for audio reactivity.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
        },
        video: false,
      })

      this._ctx = new (window.AudioContext || window.webkitAudioContext)()
      // A context created before a user gesture starts suspended → analyser reads zeros.
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {})
      this._analyser = this._ctx.createAnalyser()
      this._analyser.fftSize = this.fftSize
      this._analyser.smoothingTimeConstant = this.smoothing

      this._source = this._ctx.createMediaStreamSource(stream)
      this._source.connect(this._analyser)

      this._fftBuf  = new Uint8Array(this._analyser.frequencyBinCount)
      this._timeBuf = new Uint8Array(this._analyser.fftSize)

      this.ready = true
      localStorage.setItem('signal-bloom-mic', '1')
      console.log('[MicInput] Ready. Bins:', this.binCount)
      return true
    } catch (err) {
      console.warn('[MicInput] Unavailable:', err.message)
      this._fftBuf  = new Uint8Array(this.fftSize / 2)
      this._timeBuf = new Uint8Array(this.fftSize)
      this.ready = false
      return false
    }
  }

  /** Silent re-init if permission was granted in a previous session. */
  async autoInit() {
    if (localStorage.getItem('signal-bloom-mic') !== '1') return false
    return this.init()
  }

  /** 0–1 RMS amplitude. Call once per frame. */
  getLevel() {
    if (!this.ready) return 0
    this._analyser.getByteTimeDomainData(this._timeBuf)
    let sum = 0
    for (let i = 0; i < this._timeBuf.length; i++) {
      const v = (this._timeBuf[i] / 128.0) - 1.0
      sum += v * v
    }
    return Math.sqrt(sum / this._timeBuf.length)
  }

  /** Frequency data as Uint8Array (0–255 per bin). Array is reused each frame. */
  getFFT() {
    if (!this.ready) return this._fftBuf
    this._analyser.getByteFrequencyData(this._fftBuf)
    return this._fftBuf
  }

  /** Normalised amplitude for a single FFT bin (0–1). */
  getBinLevel(binIndex) {
    this.getFFT()
    return (this._fftBuf[binIndex] ?? 0) / 255
  }

  get binCount() { return this._analyser?.frequencyBinCount ?? this.fftSize / 2 }

  dispose() {
    if (!this._ctx) return
    this._source?.disconnect()
    this._ctx.close()
    this._ctx  = null
    this.ready = false
  }
}
