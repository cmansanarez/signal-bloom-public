/**
 * HydraManager.js — Signal Bloom
 * Manages a single off-screen Hydra instance whose canvas feeds as
 * THREE.CanvasTexture onto the tunnel wall geometry.
 *
 * makeGlobal: true → standard Hydra sketch syntax works unchanged.
 * Sketches are injected via <script> tags by sketch-loader.js.
 * Call needsUpdate = true on the returned texture each animation frame.
 */

export class HydraManager {
  constructor() {
    this.canvas   = null
    this.instance = null
    this._container = null
  }

  /**
   * Create off-screen canvas, init Hydra, register lib-cond transforms,
   * then load hydra-wrap.js (requires window.hydraSynth to exist first).
   */
  async init(width = 512, height = 512) {
    this._container = document.createElement('div')
    Object.assign(this._container.style, {
      position:      'fixed',
      top:           '-9999px',
      left:          '-9999px',
      pointerEvents: 'none',
      visibility:    'hidden',
    })
    document.body.appendChild(this._container)

    this.canvas        = document.createElement('canvas')
    this.canvas.width  = width
    this.canvas.height = height
    this.canvas.id     = 'hydra-offscreen'
    this._container.appendChild(this.canvas)

    this.instance = new Hydra({
      canvas:              this.canvas,
      makeGlobal:          true,
      detectAudio:         true,
      autoLoop:            true,
      enableStreamCapture: false,
    })

    // Conditional GLSL transforms (same as NoirMak)
    ;[
      {
        name: 'ifpos', type: 'combine',
        inputs: [{ name: 'value', type: 'float', default: 1.0 }],
        glsl: 'return value < 0.0 ? _c0 : _c1;',
      },
      {
        name: 'ifeven', type: 'combine',
        inputs: [
          { name: 'value', type: 'float', default: 0.0 },
          { name: 'eps',   type: 'float', default: 0.01 },
        ],
        glsl: 'return abs(mod(floor(value), 2.0)) < eps ? _c0 : _c1;',
      },
      {
        name: 'ifzero', type: 'combine',
        inputs: [
          { name: 'value', type: 'float', default: 0.0 },
          { name: 'eps',   type: 'float', default: 0.1 },
        ],
        glsl: 'return abs(value) < eps ? _c0 : _c1;',
      },
      {
        name: 'splitview', type: 'combine',
        inputs: [{ name: 'where', type: 'float', default: 0.5 }],
        glsl: 'return gl_FragCoord.x / resolution.x > where ? _c0 : _c1;',
      },
      {
        name: 'splitviewh', type: 'combine',
        inputs: [{ name: 'where', type: 'float', default: 0.5 }],
        glsl: 'return gl_FragCoord.y / resolution.y > where ? _c0 : _c1;',
      },
    ].forEach(fn => this.instance.synth.setFunction(fn))

    // Expose for hydra-wrap.js and datamosh.js
    window.hydraSynth = this.instance

    // Universal media helpers — available in every sketch as loadVideo(slot, path) / loadImage(slot, path).
    // Slot 0–3 maps to s0–s3. Path should be an absolute URL or root-relative path (e.g. '/assets/vid/file.mp4').
    const _srcs = [
      this.instance.synth.s0,
      this.instance.synth.s1,
      this.instance.synth.s2,
      this.instance.synth.s3,
    ]
    window.loadVideo = (slot, path) => { try { _srcs[slot]?.initVideo(path) } catch (e) { console.warn('[loadVideo]', e) } }
    window.loadImage = (slot, path) => { try { _srcs[slot]?.initImage(path) } catch (e) { console.warn('[loadImage]', e) } }

    // loadVid(id, src, slot): hidden looping <video> bound to a Hydra source object
    // (s0–s3), the way the vj sketches mix in footage. The id lets cleanupSketchMedia
    // release the element on sketch switch. Hardened over the inline copy the sketches
    // used to carry each: inits the slot as soon as a frame is decodable instead of
    // waiting only on 'playing' (the browser skips that under decoder pressure — the
    // bug that used to need a hard refresh), guards so the slot inits once, and retries
    // play() if the element stalls.
    window.loadVid = (id, src, slot) => {
      document.getElementById(id)?.remove()
      const vid = document.createElement('video')
      vid.id = id; vid.src = src; vid.loop = true; vid.muted = true
      vid.autoplay = true; vid.playsInline = true; vid.preload = 'auto'; vid.style.display = 'none'
      document.body.appendChild(vid)
      let inited = false
      const go = () => { if (inited) return; inited = true; try { slot.init({ src: vid, dynamic: true }) } catch (e) { console.warn('[loadVid]', e) } }
      const retry = () => vid.play().catch(() => {})
      ;['loadeddata', 'canplay', 'playing'].forEach(ev => vid.addEventListener(ev, go))
      ;['pause', 'stalled', 'waiting'].forEach(ev => vid.addEventListener(ev, retry))
      retry()
      if (vid.readyState >= 2) go()
    }

    // hydra-wrap.js must load after window.hydraSynth is set
    await new Promise(resolve => {
      const s   = document.createElement('script')
      s.src     = '/libs/hydra-wrap.js?t=' + Date.now()
      s.onload  = resolve
      s.onerror = resolve
      document.head.appendChild(s)
    })

    console.log(`[HydraManager] Ready — ${width}×${height} offscreen canvas`)
    return this
  }

  /** Returns the raw canvas — wrap in new THREE.CanvasTexture(manager.getCanvas()) */
  getCanvas() { return this.canvas }

  dispose() {
    this._container?.remove()
    this._container = null
    this.canvas     = null
    this.instance   = null
  }
}
