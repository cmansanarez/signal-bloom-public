/**
 * main.js — Signal Bloom
 * Three.js fracture tunnel + Hydra wall texture + audio reactivity.
 *
 * Scene layers:
 *   1. Inner cylinder (CylinderGeometry, BackSide) — Hydra CanvasTexture on tunnel walls
 *   2. Point cloud (PointsMaterial, AdditiveBlending) — Perlin-deformed fracture structure
 *   3. Accent rings (LineBasicMaterial) — thin wireframe accents at 2× ring spacing
 *   4. Post-processing — UnrealBloomPass → AfterimagePass → ChromaShader
 *
 * Audio pipeline:
 *   MicInput → FFT → bass drives geometry deformation + camera speed burst + glitch trigger
 */

import * as THREE from 'three'
import { ImprovedNoise }   from 'three/addons/math/ImprovedNoise.js'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { AfterimagePass }  from 'three/addons/postprocessing/AfterimagePass.js'
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js'

import { HydraManager }        from './HydraManager.js'
import { HydraFormProcessor }  from './HydraFormProcessor.js'
import { MicInput }            from './MicInput.js'
import { AIFormLayer }         from './ai-forms.js'
import { StarLayer }           from './StarLayer.js'
import { init as sketchInit, onSketchLoad, updateOverlay } from './sketch-loader.js'
import { MachineLiturgy } from './MachineLiturgy.js'

// ── Tunnel constants (match Orpheus Protocol Fracture scene) ──────────────────
const SEGMENT_COUNT   = 22
const RING_POINTS     = 72
const TUNNEL_RADIUS   = 4.5
const SEGMENT_SPACING = 6
const TOTAL_LEN       = SEGMENT_COUNT * SEGMENT_SPACING   // 308
const TOTAL_POINTS    = SEGMENT_COUNT * RING_POINTS       // 1584

const RING_COUNT      = 10
const RING_SPACING    = SEGMENT_SPACING * 2               // 28
const TOTAL_RING_LEN  = RING_COUNT * RING_SPACING         // 168

const RECYCLE_Z       = -4
const BASE_SPEED      = 0.14

const NOISE_FREQ      = 0.22
const NOISE_AMP       = 1.15

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('tunnel-canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

// Off-screen target for the AI form — rendered here first so the chroma shader
// can composite it with the same aberration offset as the tunnel, putting both
// in the same optical space. Must match screen resolution; resized on window resize.
const formRT = new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight,
  { format: THREE.RGBAFormat }
)

const scene  = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

// AI forms live in their own scene so they can be composited crisp ON TOP of the
// bloomed tunnel — the tunnel glow is a screen-space additive pass and would
// otherwise wash over them regardless of 3D depth. Same camera → perspective,
// depth-scaling, and drift still read correctly.
const formScene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(82, window.innerWidth / window.innerHeight, 0.1, 400)
scene.add(camera)   // so camera-parented children (flat-mode quad) are traversed by the renderer

const clock = new THREE.Clock()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
  formRT.setSize(window.innerWidth, window.innerHeight)
  resizeFlatQuad()
})

// ── Noise ─────────────────────────────────────────────────────────────────────
const noise = new ImprovedNoise()

// ── Fracture point cloud ──────────────────────────────────────────────────────
const positions = new Float32Array(TOTAL_POINTS * 3)
const colors    = new Float32Array(TOTAL_POINTS * 3)

const tunnelGeo = new THREE.BufferGeometry()
tunnelGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
tunnelGeo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))

// Each sizeAttenuation mode wants its own size: ON = world units (perspective-scaled),
// OFF = flat screen-space pixels. The A-key toggle swaps both together.
const POINT_SIZE_ATTENUATED = 1.8
const POINT_SIZE_FLAT       = 8.2

const tunnelMat = new THREE.PointsMaterial({
  size:            POINT_SIZE_ATTENUATED,
  vertexColors:    true,
  blending:        THREE.AdditiveBlending,
  depthWrite:      false,
  sizeAttenuation: true,
  transparent:     true,
  opacity:         0.75,
})
const tunnelPoints = new THREE.Points(tunnelGeo, tunnelMat)
scene.add(tunnelPoints)

// sizeAttenuation is a shader #define — toggling it needs needsUpdate=true to recompile.
function toggleSizeAttenuation() {
  const on = !tunnelMat.sizeAttenuation
  tunnelMat.sizeAttenuation = on
  tunnelMat.size = on ? POINT_SIZE_ATTENUATED : POINT_SIZE_FLAT
  tunnelMat.needsUpdate = true
}

const segZ = Array.from({ length: SEGMENT_COUNT }, (_, i) => -i * SEGMENT_SPACING)

// ── Wireframe accent rings ────────────────────────────────────────────────────
const accentZ     = Array.from({ length: RING_COUNT }, (_, i) => -i * RING_SPACING)
const accentRings = []

{
  const pts = []
  for (let i = 0; i <= RING_POINTS; i++) {
    const a = (i / RING_POINTS) * Math.PI * 2
    pts.push(new THREE.Vector3(
      Math.cos(a) * TUNNEL_RADIUS * 1.1,
      Math.sin(a) * TUNNEL_RADIUS * 1.1,
      0,
    ))
  }
  const accentGeo = new THREE.BufferGeometry().setFromPoints(pts)
  for (let i = 0; i < RING_COUNT; i++) {
    const mat  = new THREE.LineBasicMaterial({ color: 0x3d00ff, transparent: true, opacity: 0.35 })
    const line = new THREE.Line(accentGeo, mat)
    line.position.z = accentZ[i]
    accentRings.push(line)
    scene.add(line)
  }
}

// ── Inner cylinder — Hydra CanvasTexture on tunnel walls ──────────────────────
let hydraTexture = null
let innerTube    = null

function buildInnerTube(hydraCanvas) {
  const tex = new THREE.CanvasTexture(hydraCanvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 2)
  hydraTexture = tex

  // CylinderGeometry aligned with Z-axis via rotateX so camera travels through it
  const geo = new THREE.CylinderGeometry(TUNNEL_RADIUS * 0.9, TUNNEL_RADIUS * 0.9, TOTAL_LEN + 60, 64, 1, true)
  geo.rotateX(Math.PI / 2)

  const mat = new THREE.MeshBasicMaterial({
    map:         tex,
    side:        THREE.BackSide,
    transparent: true,
    opacity:     0.88,
    depthWrite:  false,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.z = -(TOTAL_LEN / 2)
  scene.add(mesh)
  innerTube = mesh
}

// ── Flat mode — collapse the tunnel into a full-frame Hydra wall ──────────────
// The sketch already renders to a standalone canvas; flat mode just shows it on
// a camera-facing quad instead of wrapped on the tunnel cylinder. Stays inside
// the composer, so bloom / afterimage / chroma + AI form compositing all persist.
let flatMode  = false
let flatQuad  = null
let flatTex   = null

function buildFlatQuad(hydraCanvas) {
  // Own texture (not the tunnel's) so repeat/orientation are independent.
  flatTex = new THREE.CanvasTexture(hydraCanvas)
  flatTex.colorSpace = THREE.SRGBColorSpace

  const mat = new THREE.MeshBasicMaterial({
    map:        flatTex,
    depthTest:  false,
    depthWrite: false,
  })
  flatQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  flatQuad.position.z = -2          // just in front of the camera; fills the frustum
  flatQuad.renderOrder = -1
  flatQuad.visible = false
  camera.add(flatQuad)              // parented → always centered in view
  resizeFlatQuad()
}

// Size the quad to exactly fill the perspective frustum at its z distance.
function resizeFlatQuad() {
  if (!flatQuad) return
  const dist = Math.abs(flatQuad.position.z)
  const h    = 2 * dist * Math.tan((camera.fov * Math.PI / 180) / 2)
  flatQuad.scale.set(h * camera.aspect * 1.02, h * 1.02, 1)   // 2% margin covers edges
}

function setFlatMode(on) {
  flatMode = on
  if (flatQuad) flatQuad.visible = on
  if (innerTube) innerTube.visible = !on
  tunnelPoints.visible = !on
  for (const ring of accentRings) ring.visible = !on
  // Re-center the camera so the parented quad sits dead-center (no leftover serpentine offset)
  if (on) camera.position.set(0, 0, 0)
}

// ── Mood board palette — depth gradient colors cycle slowly during a set ─────
// Carbon Black and Ghost White excluded: too dark / too bright for additive points.
// Cycle speed: ~2.5 min to traverse the full palette at BASE_SPEED forward motion.
const PALETTE = [
  new THREE.Color(0xe0ca3c),  // Golden Glow
  new THREE.Color(0x9381ff),  // Soft Periwinkle
  new THREE.Color(0xd81e5b),  // Raspberry Red
  new THREE.Color(0xff6b35),  // Atomic Tangerine
  new THREE.Color(0x171664),  // Deep Twilight (dark anchor between bright phases)
]
const PALETTE_SPEED = 0.015   // tune to taste: higher = faster color shifts

// Accent rings cycle the SAME palette but on their own clock (wall-time `elapsed`,
// not the audio-coupled noiseT the points use) — so ring color drifts out of sync
// with the point-cloud color on purpose.
const RING_PALETTE_SPEED = 0.07

let COL_FAR  = new THREE.Color().copy(PALETTE[0])
let COL_MID  = new THREE.Color().copy(PALETTE[1])
let COL_NEAR = new THREE.Color().copy(PALETTE[2])
const _col   = new THREE.Color()
const _palC  = new THREE.Color()
const _ringC = new THREE.Color()

function samplePalette(t) {
  const n   = PALETTE.length
  const pos = ((t % n) + n) % n
  const a   = Math.floor(pos) % n
  return _palC.copy(PALETTE[a]).lerp(PALETTE[(a + 1) % n], pos - a)
}

function updatePalette() {
  const n = PALETTE.length
  const t = noiseT * PALETTE_SPEED
  COL_FAR.copy(samplePalette(t))
  COL_MID.copy(samplePalette(t + n / 3))
  COL_NEAR.copy(samplePalette(t + n * 2 / 3))
}

function depthColor(t) {
  if (t < 0.5) return _col.copy(COL_FAR).lerp(COL_MID,  t * 2)
  return             _col.copy(COL_MID).lerp(COL_NEAR, (t - 0.5) * 2)
}

// ── Post-processing ───────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.65,   // strength — lower keeps halos from merging into white wash
  0.50,   // radius
  0.38,   // threshold — only the genuinely bright highlight points bloom
)
composer.addPass(bloomPass)

const afterimagePass = new AfterimagePass(0.82)
composer.addPass(afterimagePass)

const ChromaShader = {
  uniforms: {
    tDiffuse: { value: null },
    tForm:    { value: null },   // AI form render target — composited here with matching offset
    offsetX:  { value: 0.003 },
    offsetY:  { value: 0.000 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tForm;
    uniform float offsetX;
    uniform float offsetY;
    varying vec2 vUv;
    void main() {
      // Tunnel — chromatic aberration on each channel
      float r = texture2D(tDiffuse, vUv + vec2( offsetX,  offsetY)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + vec2(-offsetX, -offsetY)).b;

      // Form — same aberration offset so it reads as in the same optical space
      float fr = texture2D(tForm, vUv + vec2( offsetX,  offsetY)).r;
      float fg = texture2D(tForm, vUv).g;
      float fb = texture2D(tForm, vUv + vec2(-offsetX, -offsetY)).b;
      float fa = texture2D(tForm, vUv).a;   // form plane opacity (fade-in / fade-out)

      // Additive composite: bright form areas glow over the tunnel;
      // near-black areas (luma residue) add nothing — the square border disappears.
      gl_FragColor = vec4(vec3(r, g, b) + vec3(fr, fg, fb) * fa, 1.0);
    }
  `,
}
const chromaPass = new ShaderPass(ChromaShader)
composer.addPass(chromaPass)
// Wire the form render target into the chroma pass — this reference persists;
// the RT content updates each frame before composer.render() is called.
chromaPass.uniforms.tForm.value = formRT.texture

// ── Runtime state ─────────────────────────────────────────────────────────────
let noiseT          = 0
let scrollVelocity  = 0
let prevBass        = 0
let glitchIntensity = 0
let glitchCooldown  = 3.0 + Math.random() * 3.0
let aiLayer         = null
let starLayer       = null

// ── Glitch system ─────────────────────────────────────────────────────────────
function updateGlitch(delta) {
  glitchCooldown -= delta
  if (glitchCooldown <= 0) {
    glitchIntensity = 1.0
    glitchCooldown  = 2.5 + Math.random() * 4.5
  }
  glitchIntensity = Math.max(0, glitchIntensity - delta * 7.0)

  chromaPass.uniforms.offsetX.value = 0.003 + glitchIntensity * 0.018
  chromaPass.uniforms.offsetY.value = glitchIntensity * 0.005
  bloomPass.strength = 0.65 + glitchIntensity * 0.55   // peak 1.2 on hard glitch, not 2.1
}

// ── Tunnel geometry update + audio deformation ────────────────────────────────
function updateTunnel(mic) {
  updatePalette()

  const fft  = mic.getFFT()
  const bass = (fft[0] + fft[1] + fft[2] + fft[3]) / (4 * 255)
  const mid  = (fft[4] + fft[5] + fft[6] + fft[7]) / (4 * 255)

  // Bass transient → speed burst + glitch spike
  const delta = bass - prevBass
  if (delta > 0.15) {
    scrollVelocity  = Math.min(scrollVelocity + delta * 2.2, 0.25)
    glitchIntensity = Math.max(glitchIntensity, delta * 0.8)
  }
  prevBass = bass

  // Expose for Hydra sketches
  window.micLevel = mic.getLevel()
  window.micFFT   = fft

  // Flat mode: tunnel geometry is hidden, so skip the per-point deform entirely.
  // Audio exposure + glitch triggering above still run so the flat wall stays reactive.
  if (flatMode) return

  const speed      = BASE_SPEED + scrollVelocity
  const bassAmp    = 1.0 + bass * 4.0
  const noiseScale = NOISE_FREQ + mid * 0.20

  // Advance + recycle point rings
  for (let s = 0; s < SEGMENT_COUNT; s++) {
    segZ[s] += speed
    if (segZ[s] > RECYCLE_Z) segZ[s] -= TOTAL_LEN
  }

  // Advance + recycle accent rings
  for (let r = 0; r < RING_COUNT; r++) {
    accentZ[r] += speed
    if (accentZ[r] > RECYCLE_Z) accentZ[r] -= TOTAL_RING_LEN
    accentRings[r].position.z = accentZ[r]
  }

  // Update point positions + colors
  const posAttr = tunnelGeo.attributes.position
  const colAttr = tunnelGeo.attributes.color

  for (let s = 0; s < SEGMENT_COUNT; s++) {
    const z      = segZ[s]
    const depthT = 1.0 - Math.max(0, Math.min(1, -z / TOTAL_LEN))
    const radMod = 1.0 + noise.noise(z * 0.07, noiseT * 0.10, 0.0) * 0.30 * bassAmp

    for (let i = 0; i < RING_POINTS; i++) {
      const idx   = s * RING_POINTS + i
      const angle = (i / RING_POINTS) * Math.PI * 2
      const r     = TUNNEL_RADIUS * radMod
      const bx    = Math.cos(angle) * r
      const by    = Math.sin(angle) * r
      const nx    = noise.noise(bx * noiseScale,      z * 0.09,      noiseT * 0.4) * NOISE_AMP * bassAmp
      const ny    = noise.noise(by * noiseScale + 50, z * 0.09 + 20, noiseT * 0.4) * NOISE_AMP * bassAmp

      posAttr.setXYZ(idx, bx + nx, by + ny, z)

      const colorVar = noise.noise(bx * 0.10, by * 0.10, noiseT * 0.25) * 0.22
      const c = depthColor(Math.max(0, Math.min(1, depthT + colorVar)))
      colAttr.setXYZ(idx, c.r, c.g, c.b)
    }
  }

  posAttr.needsUpdate = true
  colAttr.needsUpdate = true

  noiseT += speed * 0.32
  scrollVelocity *= 0.91
}

// ── ComfyUI generation events → AI form layer + prompt status ─────────────────
// A second EventSource on /events (sketch-loader owns the first). The bridge
// broadcasts to every client, so both connections receive the same stream.
function connectGenerationEvents(layer) {
  const status    = document.getElementById('prompt-status')
  const stepTrack = document.getElementById('step-track')
  const stepFill  = document.getElementById('step-fill')
  const setStatus = (t) => { if (status) status.textContent = t }

  let stepTimer = null

  function resetStep() {
    clearTimeout(stepTimer)
    if (stepFill)  stepFill.style.width    = '0%'
    if (stepTrack) stepTrack.style.opacity = '1'
  }

  function completeStep() {
    if (stepFill) stepFill.style.width = '100%'
    stepTimer = setTimeout(() => {
      if (stepTrack) stepTrack.style.opacity = '0.25'
    }, 2000)
  }

  const es = new EventSource('/events')

  es.addEventListener('generation-start', (e) => {
    resetStep()
    try {
      const { mode } = JSON.parse(e.data)
      setStatus(mode === 'img2img' ? 'evolving…' : 'summoning…')
    } catch (_) { setStatus('summoning…') }
  })

  es.addEventListener('step-preview', (e) => {
    try {
      const { step, total, preview } = JSON.parse(e.data)
      if (preview) layer.preview(`data:image/jpeg;base64,${preview}`)
      if (step != null && total != null) {
        setStatus(`crystallizing ${step}/${total}`)
        if (stepFill) stepFill.style.width = `${(step / total) * 100}%`
      }
    } catch (_) {}
  })

  es.addEventListener('image-ready', (e) => {
    try {
      const { src } = JSON.parse(e.data)
      layer.finalize(`${src}?t=${Date.now()}`)   // cache-bust — latest.png is overwritten each run
      completeStep()
      setStatus('formed')
    } catch (_) {}
  })

  es.addEventListener('generation-error', (e) => {
    let msg = 'error'
    try { msg = JSON.parse(e.data).message || msg } catch (_) {}
    const offline = /8188|refused|websocket|running/i.test(msg)
    if (stepTrack) stepTrack.style.opacity = '0'
    setStatus(offline ? 'comfyui offline' : msg.slice(0, 60))
  })

  // EventSource reconnects on its own; swallow transient errors silently.
  es.onerror = () => {}
}

// ── Adaptive code-overlay contrast ──────────────────────────────────────────
// While the code overlay is open, sample the just-rendered frame a few times a
// second and flip the code text light↔dark so it contrasts whatever's behind it.
// Runs ONLY when the overlay is visible, so there's zero cost during a normal set.
const _codeSampleCanvas = document.createElement('canvas')
_codeSampleCanvas.width = 32
_codeSampleCanvas.height = 18
const _codeSampleCtx = _codeSampleCanvas.getContext('2d', { willReadFrequently: true })
let _codeLum   = 0.5      // smoothed background luminance (0..1)
let _codeDark  = false    // is the text currently dark? (hysteresis latch)
let _codeFrame = 0

// Must run in the same frame as the render — without preserveDrawingBuffer the
// canvas is only readable before control returns to the browser.
function sampleCodeOverlayContrast() {
  const overlay = document.getElementById('code-overlay')
  if (!overlay || overlay.classList.contains('hidden') || overlay.classList.contains('edit-mode')) return
  if ((_codeFrame++ % 10) !== 0) return   // ~6 Hz at 60fps
  const display = document.getElementById('code-display')
  if (!display) return
  try {
    const { width: w, height: h } = _codeSampleCanvas
    _codeSampleCtx.drawImage(canvas, 0, 0, w, h)
    const d = _codeSampleCtx.getImageData(0, 0, w, h).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) {
      sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255   // Rec.601 luma
    }
    _codeLum += (sum / (d.length / 4) - _codeLum) * 0.25                  // smooth to kill flicker
    if (!_codeDark && _codeLum > 0.58) _codeDark = true                   // hysteresis band around mid-gray
    else if (_codeDark && _codeLum < 0.42) _codeDark = false
    if (_codeDark) {
      display.style.setProperty('--code-fg', '#08080e')
      display.style.setProperty('--code-halo', 'rgba(255, 255, 255, 0.85)')
    } else {
      display.style.setProperty('--code-fg', '#f4f8ff')
      display.style.setProperty('--code-halo', 'rgba(0, 0, 6, 0.9)')
    }
  } catch (_) { /* frame not readable this tick — skip */ }
}

// ── Render loop ───────────────────────────────────────────────────────────────
function startRenderLoop(mic) {
  const audioFill = document.getElementById('audio-meter-fill')
  let elapsed = 0
  const loop = () => {
    requestAnimationFrame(loop)
    const delta = clock.getDelta()
    elapsed += delta

    updateTunnel(mic)
    updateGlitch(delta)

    if (audioFill) audioFill.style.width = `${Math.min(100, (window.micLevel ?? 0) * 300).toFixed(1)}%`

    // Camera figure-8 serpentine — glitch spike widens the drift.
    // Frozen in flat mode so the wall sits dead-center.
    if (!flatMode) {
      const amp = 0.55 + glitchIntensity * 0.45
      camera.position.x = Math.sin(elapsed * 0.38) * amp
      camera.position.y = Math.cos(elapsed * 0.29) * amp * 0.65
    }

    // Accent ring color — palette sampled on the rings' own clock (desynced from points)
    _ringC.copy(samplePalette(elapsed * RING_PALETTE_SPEED))

    // Accent ring opacity — gentle pulse + glitch
    for (let r = 0; r < RING_COUNT; r++) {
      accentRings[r].material.color.copy(_ringC)
      accentRings[r].material.opacity =
        0.25 + Math.sin(elapsed * 1.1 + r * 0.9) * 0.10 + glitchIntensity * 0.35
    }

    // Tell Three.js to re-upload the Hydra canvas to the GPU each frame
    if (hydraTexture) hydraTexture.needsUpdate = true
    if (flatMode && flatTex) flatTex.needsUpdate = true

    // Advance crystallizing / floating AI forms
    if (aiLayer) aiLayer.tick(performance.now())

    // Animate star polyhedra
    if (starLayer) starLayer.tick(delta, elapsed)

    // Render form scene to isolated RT — the chroma shader composites it over
    // the tunnel with matching aberration so both share the same optical space.
    renderer.setRenderTarget(formRT)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(formScene, camera)
    renderer.setRenderTarget(null)
    renderer.setClearColor(0x000000, 1)

    // Tunnel pipeline: bloom → afterimage → chroma (composites form inline)
    composer.render(delta)

    // Adapt code-overlay text colour to the frame we just drew (overlay-only cost)
    sampleCodeOverlayContrast()
  }
  loop()
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  // 1. Hydra — must init before sketch-loader loads any sketches
  const hydra = new HydraManager()
  await hydra.init(512, 512)

  // 2. Tunnel wall texture from Hydra canvas + flat-mode quad (same canvas)
  buildInnerTube(hydra.getCanvas())
  buildFlatQuad(hydra.getCanvas())

  // 3. Mic — try silent re-init first, prompt on fail
  const mic = new MicInput()
  const ok  = await mic.autoInit()
  if (!ok) await mic.init()

  // 4. Sketch loader — fetch list, load first sketch, keyboard, SSE watcher
  onSketchLoad(() => {
    if (hydraTexture) hydraTexture.needsUpdate = true
  })
  await sketchInit()

  // 5. AI form layer — dedicated Hydra instance processes the form with audio reactivity
  const formProcessor = new HydraFormProcessor()
  await formProcessor.init(512, 512)
  aiLayer = new AIFormLayer(formScene, formProcessor)
  connectGenerationEvents(aiLayer)

  // 6. Star polyhedra — load all glbs, wire G (toggle) and R (rotation)
  starLayer = new StarLayer(scene)
  await starLayer.load()
  window.addEventListener('toggle-stars',       () => starLayer.toggle())
  window.addEventListener('toggle-form-rotate', () => starLayer.toggleRotation())
  window.addEventListener('star-z-shift',       (e) => starLayer.shiftZ(e.detail.dir))

  // 7. Flat-mode toggle — sketch-loader's keymap dispatches this
  window.addEventListener('toggle-flat-mode', () => setFlatMode(!flatMode))
  window.addEventListener('toggle-size-attenuation', toggleSizeAttenuation)
  window.addEventListener('toggle-form-rotate', () => formProcessor.toggleRotation())

  // Bloom toggle (* / Shift+8) — the signal bloom becomes a performable gesture:
  // bring it in on peaks, drop it otherwise. Starts enabled to preserve the default
  // look. The glitch system keeps writing bloomPass.strength either way — harmless
  // while the pass is disabled, so it picks up seamlessly when toggled back on.
  window.addEventListener('toggle-bloom', () => { bloomPass.enabled = !bloomPass.enabled })

  // 8. Machine Liturgy banner — M toggles on/off, N advances to the next phrase
  const liturgy = new MachineLiturgy()
  window.addEventListener('toggle-liturgy', () => liturgy.toggle())
  window.addEventListener('next-liturgy',   () => liturgy.next())
  window.addEventListener('liturgy-custom', (e) => liturgy.trigger(e.detail.text))
  // Expose globally so the performer can trigger specific phrases from the console:
  // window.liturgy.trigger('your phrase here')
  window.liturgy = liturgy

  // 7. Render
  clock.start()
  startRenderLoop(mic)
}

boot().catch(err => console.error('[Signal Bloom] Boot error:', err))
