/**
 * PrimitiveLayer.js — Signal Bloom
 * Loads .glb model assets into the Three.js tunnel scene.
 *
 * This is an example of dropping arbitrary 3D geometry into the tunnel as a
 * decorative layer — swap assets/3D/*.glb for whatever suits the piece you're
 * building; nothing about this layer assumes a specific shape.
 *
 * Animation model (per primitive):
 *   • XZ orbital drift around a perimeter rest position (wider radii, stay off-center)
 *   • Y-axis buoyant float (per-primitive phase + speed)
 *   • Mic-reactive emissive pulse via EMA-smoothed glowPulse
 *   • Optional Y/X spin when rotation is toggled (R key)
 *   • Z-offset controlled by ↑/↓ arrow keys (shiftZ)
 *
 * Lighting (affects only MeshStandardMaterial GLBs — tunnel materials ignore lights):
 *   • AmbientLight  — soft electric-blue base so materials are never fully dark
 *   • PointLight x2 — cyan + magenta accent lights that pulse with mic
 */

import * as THREE    from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ── Asset list ────────────────────────────────────────────────────────────────
const GLB_PATHS = [
  '/assets/3D/signal-bloom-primitive-01.glb',
  '/assets/3D/signal-bloom-primitive-02.glb',
  '/assets/3D/signal-bloom-primitive-03.glb',
  '/assets/3D/signal-bloom-primitive-04.glb',
  '/assets/3D/signal-bloom-primitive-05.glb',
  '/assets/3D/signal-bloom-primitive-06.glb',
  '/assets/3D/signal-bloom-primitive-07.glb',
]

// Rest positions arranged in a loose ring around the tunnel perimeter.
// Center is intentionally left clear — reserved for generative AI forms.
// Adjust BASE_SCALE below if glbs are too large or too small on first load.
const REST = [
  { x: -2.8, y:  1.6, z: -10 },   // upper-left
  { x:  2.6, y:  1.8, z: -12 },   // upper-right
  { x: -3.2, y:  0.0, z: -9  },   // left
  { x:  3.0, y: -0.2, z: -11 },   // right
  { x: -2.2, y: -2.0, z: -13 },   // lower-left
  { x:  2.4, y: -1.8, z: -10 },   // lower-right
  { x:  0.2, y:  2.8, z: -14 },   // top-center
]

// Emissive accent colors — one per primitive, drawn from Signal Bloom palette
const EMISSIVE = [
  new THREE.Color(0x00f0ff),   // cyan
  new THREE.Color(0xff00ee),   // magenta
  new THREE.Color(0x1a1aff),   // electric blue
  new THREE.Color(0x00f0ff),   // cyan
  new THREE.Color(0xff00ee),   // magenta
  new THREE.Color(0x1a1aff),   // electric blue
  new THREE.Color(0xffaa00),   // amber (accent)
]

const BASE_SCALE        = 1.0   // overall size — tune if glbs are authored at a different unit scale
const PRIMITIVE_OPACITY = 0.92  // glass-chrome: high enough to show metallic depth, not fully opaque
const FLOAT_AMP          = 0.92  // Y sine-float amplitude (world units)
const CENTER_EXCL_RADIUS = 2.6   // keep primitives off the tunnel axis — wider so nothing grazes center
const MIN_XY_SEP         = 2.4   // minimum XY separation between primitives (7 can fit at this spacing)
const MIC_SCALE    = 0.60  // max scale boost at full mic level
const Z_SHIFT_STEP = 1.8   // world units per ↑/↓ key press
const Z_OFFSET_MIN = -18   // how far back primitives can be pushed
const Z_OFFSET_MAX = 7     // how close primitives can come (nearest stays at ~z=-2)

export class PrimitiveLayer {
  constructor(scene) {
    this.scene      = scene
    this.primitives = []
    this.visible   = false
    this.rotating  = false
    this.glowPulse = 0
    this.loaded    = false
    this.zOffset   = 0

    // Lights are added to the scene in load() so they exist whether or not primitives are visible.
    // They only affect MeshStandardMaterial — PointsMaterial / MeshBasicMaterial are unaffected.
    this.ambientLight    = null
    this.hemisphereLight = null
    this.fillLight       = null
    this.cyanLight       = null
    this.magentaLight    = null
  }

  async load() {
    // ── Lights ──────────────────────────────────────────────────────────────
    this.ambientLight = new THREE.AmbientLight(0x1a1aff, 0.45)
    this.scene.add(this.ambientLight)

    // Cyan sky / magenta ground — gives metallic faces a visible palette gradient
    // across all surface angles without needing a camera reference or env map.
    // High metalness without this reads as black because there's nothing to reflect.
    this.hemisphereLight = new THREE.HemisphereLight(0x00f0ff, 0xff00ee, 1.8)
    this.scene.add(this.hemisphereLight)

    // White fill aimed down the tunnel from the camera side so forward-facing
    // geometry is never dark regardless of where the point lights sit.
    this.fillLight = new THREE.DirectionalLight(0xffffff, 1.4)
    this.fillLight.position.set(0, 0, 10)
    this.fillLight.target.position.set(0, 0, -12)
    this.scene.add(this.fillLight)
    this.scene.add(this.fillLight.target)

    this.cyanLight = new THREE.PointLight(0x00f0ff, 2.2, 32)
    this.cyanLight.position.set(-2.5, 1.0, -11)
    this.scene.add(this.cyanLight)

    this.magentaLight = new THREE.PointLight(0xff00ee, 1.8, 32)
    this.magentaLight.position.set(2.5, -1.0, -12)
    this.scene.add(this.magentaLight)

    // ── Load GLBs ────────────────────────────────────────────────────────────
    const loader = new GLTFLoader()

    const loads = GLB_PATHS.map((path, i) =>
      new Promise((resolve) => {
        loader.load(
          path,
          (gltf) => {
            const root = gltf.scene

            // Per-primitive scale variety
            const primitiveScale = BASE_SCALE * (0.82 + Math.random() * 0.36)
            root.scale.setScalar(primitiveScale)
            root.position.set(REST[i].x, REST[i].y, REST[i].z)
            root.visible = false

            // Keep the GLB's native PBR material (MeshStandardMaterial / MeshPhysicalMaterial)
            // so metalness, roughness, normal maps, and emissive all work. Clone so we don't
            // mutate the shared GLTF asset cache. MeshBasicMaterial was previously used here
            // but it's unlit — it ignores lights entirely and produces the flat appearance.
            const emissiveColor = EMISSIVE[i]
            root.traverse((child) => {
              if (!child.isMesh) return
              const mats = Array.isArray(child.material) ? child.material : [child.material]
              const next = mats.map((src) => {
                const mat = src.clone()

                // Chrome-glass PBR: metallic with enough diffuse to stay visible.
                // metalness 0.92 + no envMap = pure specular = black. 0.72 keeps the
                // chrome character while the diffuse component catches the hemisphere light.
                mat.metalness         = 0.72
                mat.roughness         = 0.22
                mat.opacity           = PRIMITIVE_OPACITY
                mat.transparent       = true
                mat.side              = THREE.DoubleSide
                mat.depthWrite        = false

                // Seed emissive with palette color — intensity driven by audio in tick()
                if (mat.emissive)    mat.emissive.copy(emissiveColor)
                mat.emissiveIntensity = 0.75   // high enough to read against bright backgrounds

                return mat
              })
              child.material = next.length === 1 ? next[0] : next
            })

            this.scene.add(root)
            this.primitives.push({
              root,
              primitiveScale,
              emissiveColor,
              phase:       Math.random() * Math.PI * 2,
              floatSpd:    0.04 + Math.random() * 0.05,   // 0.04–0.09 — slow buoyant float
              orbitAngle:  Math.random() * Math.PI * 2,
              orbitR:      2.3  + Math.random() * 1.73,   // 2.3–4.0 — wide sweep around perimeter
              orbitSpd:    0.006 + Math.random() * 0.010, // 0.006–0.016 — slow orbital drift
              driftAngle:  Math.random() * Math.PI * 2,   // secondary meander, independent phase
              driftR:      0.8  + Math.random() * 0.92,   // 0.8–1.72 — secondary wander radius
              driftSpd:    0.004 + Math.random() * 0.008, // 0.004–0.012 — slower than main orbit
              rotSpd:      (0.25 + Math.random() * 1.40) * (Math.random() < 0.5 ? 1 : -1),
            })
            resolve()
          },
          undefined,
          (err) => { console.warn(`[PrimitiveLayer] Failed to load ${path}`, err); resolve() }
        )
      })
    )

    await Promise.all(loads)
    this.loaded = true
    console.log(`[PrimitiveLayer] ${this.primitives.length} primitive(s) ready`)
  }

  toggle() {
    this.visible = !this.visible
    for (const primitive of this.primitives) primitive.root.visible = this.visible
  }

  toggleRotation() {
    this.rotating = !this.rotating
  }

  // ↑ key: dir = +1 (move forward toward camera, appears larger)
  // ↓ key: dir = -1 (move back away from camera, appears smaller)
  shiftZ(dir) {
    this.zOffset = Math.max(Z_OFFSET_MIN, Math.min(Z_OFFSET_MAX, this.zOffset + dir * Z_SHIFT_STEP))
    // Keep lights tracking the primitive cluster depth
    if (this.cyanLight)    this.cyanLight.position.z    = -11 + this.zOffset
    if (this.magentaLight) this.magentaLight.position.z = -12 + this.zOffset
  }

  tick(delta, elapsed) {
    if (!this.loaded) return

    const micLevel = window.micLevel ?? 0
    // EMA-smoothed pulse: snaps up with mic, decays ~10 %/frame
    this.glowPulse = Math.max(this.glowPulse * 0.90, micLevel)

    // Pulse accent lights with mic
    if (this.cyanLight)    this.cyanLight.intensity    = 2.2 + this.glowPulse * 3.5
    if (this.magentaLight) this.magentaLight.intensity = 1.8 + this.glowPulse * 2.8

    for (let i = 0; i < this.primitives.length; i++) {
      const primitive = this.primitives[i]
      const rest = REST[i]

      // Primary orbital drift — slow, wide sweep around rest position
      primitive.orbitAngle += delta * primitive.orbitSpd
      const ox = Math.cos(primitive.orbitAngle)       * primitive.orbitR * (1.0 + this.glowPulse * 0.35)
      const oz = Math.sin(primitive.orbitAngle * 0.6) * primitive.orbitR * 0.3

      // Secondary meander — different frequency ratio so the combined path is never a clean circle
      primitive.driftAngle += delta * primitive.driftSpd
      const mx = Math.cos(primitive.driftAngle * 1.4 + Math.PI * 0.5) * primitive.driftR
      const my = Math.sin(primitive.driftAngle        + Math.PI * 1.1) * primitive.driftR * 0.6

      // Y buoyant float
      const fy = Math.sin(elapsed * primitive.floatSpd + primitive.phase) * FLOAT_AMP

      let px = rest.x + ox + mx
      let py = rest.y + fy + my
      const pz = rest.z + oz + this.zOffset

      // Center exclusion — push primitives off the tunnel axis so the AI form zone stays clear.
      // Quadratic scaling means primitives near center get a decisive push; primitives grazing
      // the edge get only a gentle nudge. Fallback normal uses REST quadrant so a primitive at
      // exactly (0,0) still gets sent in the right direction.
      const xyDist = Math.sqrt(px * px + py * py)
      if (xyDist < CENTER_EXCL_RADIUS) {
        const t    = (CENTER_EXCL_RADIUS - xyDist) / CENTER_EXCL_RADIUS
        const push = t * t * 3.5
        const nx   = xyDist > 0.01 ? px / xyDist : (rest.x >= 0 ? 1.0 : -1.0)
        const ny   = xyDist > 0.01 ? py / xyDist : (rest.y >= 0 ? 1.0 : -1.0)
        px += nx * push
        py += ny * push
      }

      // XY separation — primitives at different Z depths still visually overlap in screen space.
      // Reads previous-frame positions (one frame stale at 60 fps — imperceptible).
      for (let j = 0; j < this.primitives.length; j++) {
        if (j === i) continue
        const op = this.primitives[j].root.position
        const sx = px - op.x
        const sy = py - op.y
        const sd = Math.sqrt(sx * sx + sy * sy)
        if (sd < MIN_XY_SEP && sd > 0.001) {
          const f = (MIN_XY_SEP - sd) / MIN_XY_SEP * 0.9
          px += (sx / sd) * f
          py += (sy / sd) * f
        }
      }

      primitive.root.position.set(px, py, pz)

      // Mic-reactive scale
      primitive.root.scale.setScalar(primitive.primitiveScale * (1.0 + this.glowPulse * MIC_SCALE))

      // Mic-reactive emissive pulse — highlights bloom through UnrealBloomPass, then the
      // ChromaShader splits them into cyan/magenta fringing (CA for free via post chain).
      primitive.root.traverse((child) => {
        if (!child.isMesh) return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          mat.emissiveIntensity = 0.75 + this.glowPulse * 2.8
        }
      })

      // Rotation when toggled
      if (this.rotating) {
        primitive.root.rotation.y += delta * primitive.rotSpd
        primitive.root.rotation.x += delta * primitive.rotSpd * 0.22
      }
    }
  }
}
