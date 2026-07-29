// ai-forms.js — Signal Bloom
// The crystallization layer: ComfyUI latent previews and the final resolved
// image rendered as a plane floating ahead in the tunnel.
//
// Lifecycle of one generation:
//   step-preview -> spawn a plane ahead, update HydraFormProcessor's
//                   s0 each step so the audience watches noise resolve into a form
//   image-ready  -> finalize: swap in the full PNG URL, release to linger
//   thereafter   -> gentle forward drift + fade-out after lifetime
//
// All planes share a single THREE.CanvasTexture backed by HydraFormProcessor's
// canvas -- the form breathes with audio in real time rather than rendering as
// a static PNG. needsUpdate = true is called every tick to re-upload the canvas.

import * as THREE from 'three'

const SPAWN_Z   = -46      // units ahead of camera
const FORM_SIZE = 20       // world-space units
const LIFETIME  = 45_000   // ms a finalized form lingers before fading out
const DRIFT     = 0.015    // forward drift per frame

const _ONE = new THREE.Vector3(1, 1, 1)

export class AIFormLayer {
  /**
   * @param {THREE.Scene}           scene     - formScene in main.js (composited over tunnel)
   * @param {HydraFormProcessor}    processor - second Hydra instance, owned by main.js
   */
  constructor(scene, processor) {
    this.scene     = scene
    this.processor = processor

    // Single CanvasTexture shared by all active planes. The canvas updates every
    // Hydra frame; we mark needsUpdate = true each tick so Three.js re-uploads it.
    this._tex = new THREE.CanvasTexture(processor.getCanvas())
    this._tex.colorSpace = THREE.SRGBColorSpace
    this._tex.minFilter  = THREE.LinearFilter
    this._tex.magFilter  = THREE.LinearFilter

    // Radial gradient mask -- white center fading to black at edges.
    // Used as alphaMap on every plane so edge feathering is independent
    // of Hydra's alpha pipeline (which doesn't reliably survive CanvasTexture -> formRT).
    this._vignette = this._makeVignette()

    this.planes  = []
    this._active = null   // the plane currently crystallizing (preview -> final)
  }

  _makeVignette(size = 256) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const cx = size / 2, r = size / 2
    const grd = ctx.createRadialGradient(cx, cx, r * 0.25, cx, cx, r)
    grd.addColorStop(0,   'white')
    grd.addColorStop(0.7, 'white')
    grd.addColorStop(1,   'black')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }

  _spawn() {
    const mat = new THREE.MeshBasicMaterial({
      map:         this._tex,
      alphaMap:    this._vignette,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FORM_SIZE, FORM_SIZE), mat)
    mesh.position.set(0, 0, SPAWN_Z)
    mesh.scale.setScalar(0.02)
    this.scene.add(mesh)
    return mesh
  }

  // A latent preview frame arrived. Update the Hydra source so the canvas shows
  // the current denoising step. Spawn a new plane if none is mid-arc.
  preview(src) {
    this.processor.updateSource(src)
    if (this._active) return this._active

    const mesh  = this._spawn()
    const entry = { mesh, spawnTime: performance.now(), fadeIn: true, fadeOut: false, settling: true }
    this._active = entry
    this.planes.push(entry)
    return entry
  }

  // Generation finished. Swap in the final image URL; release the active plane
  // to linger as a resolved form. If no preview ever arrived, spawn directly.
  finalize(src) {
    this.processor.updateSource(src)
    if (!this._active) {
      const mesh  = this._spawn()
      const entry = { mesh, spawnTime: performance.now(), fadeIn: true, fadeOut: false, settling: false }
      this.planes.push(entry)
      return
    }
    this._active.settling  = false
    this._active.spawnTime = performance.now()   // lifetime counts from the resolved form
    this._active           = null
  }

  // Called every frame from the render loop.
  tick(now) {
    // Re-upload the Hydra form canvas to GPU -- the canvas updates every Hydra frame.
    this._tex.needsUpdate = true

    this.planes = this.planes.filter((entry) => {
      const { mesh } = entry
      const mat = mesh.material

      if (entry.fadeIn) {
        mat.opacity = Math.min(1, mat.opacity + 0.025)
        mesh.scale.lerp(_ONE, 0.08)
        if (mat.opacity >= 1) entry.fadeIn = false
      }

      // Only finalized forms age out -- a plane still crystallizing stays put.
      if (!entry.settling && !entry.fadeOut && now - entry.spawnTime > LIFETIME) {
        entry.fadeOut = true
      }

      if (entry.fadeOut) {
        mat.opacity = Math.max(0, mat.opacity - 0.012)
        if (mat.opacity <= 0) {
          this.scene.remove(mesh)
          mesh.geometry.dispose()
          // _tex and _vignette are shared across all planes -- do NOT dispose them here
          mat.map      = null
          mat.alphaMap = null
          mat.dispose()
          if (this._active === entry) this._active = null
          return false
        }
      }

      mesh.position.z += DRIFT
      return true
    })
  }
}
