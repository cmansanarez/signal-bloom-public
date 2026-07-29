/**
 * Signal Bloom — Audio → Tunnel Deformation + Hydra Modulation
 * study-04-audio-tunnel.js
 *
 * Wires MicInput.js FFT data to:
 *   1. Three.js Fracture tunnel geometry (Perlin deformation amplitude)
 *   2. Hydra sketch parameters (via window.micLevel / window.micFFT globals)
 *
 * MicInput.js (from Orpheus Protocol) exposes:
 *   window.micLevel   — normalized 0–1 RMS amplitude
 *   window.micFFT[]   — Float32Array, 24–32 bins (configurable)
 *
 * Fracture tunnel reference: Orpheus Protocol /js/scenes/fracture.js
 * Simplex noise: same dependency used in Orpheus Protocol
 */

import { createNoise3D } from 'simplex-noise';
import * as THREE from 'three';

const noise3D = createNoise3D();

// ─── Tunnel Geometry Deformation ───────────────────────────────────────────
//
// Called every frame in the Three.js animation loop.
// Replaces the scroll-based deformation from Orpheus Protocol's Fracture scene
// with audio-reactive deformation driven by MicInput.js FFT bands.

function deformTunnelGeometry(geometry, elapsed) {
  const pos     = geometry.attributes.position;
  const level   = window.micLevel ?? 0;
  const fft     = window.micFFT   ?? new Float32Array(32);

  // Band extraction — match Orpheus Protocol's three-tier approach
  const bass = average(fft, 0, 3);    // kick / low end → overall warp scale
  const mid  = average(fft, 4, 10);   // snare / melodic → warp frequency
  const hi   = average(fft, 11, 24);  // hats / air → fine detail noise

  // Deformation parameters driven by audio bands
  const deformScale     = 0.08 + mid  * 0.20;   // noise sampling frequency
  const deformAmplitude = 1.2  + bass * 5.0;    // displacement magnitude
  const detailAmount    = hi   * 0.4;            // high-freq micro-jitter

  // Store original positions on first call
  if (!geometry._original) {
    geometry._original = new Float32Array(pos.array);
  }
  const orig = geometry._original;

  for (let i = 0; i < pos.count; i++) {
    const ox = orig[i * 3];
    const oy = orig[i * 3 + 1];
    const oz = orig[i * 3 + 2];

    // Primary warp — matches Fracture scene's Perlin deformation
    const nx = noise3D(ox * deformScale,       oy * deformScale,       elapsed * 0.3) * deformAmplitude;
    const ny = noise3D(ox * deformScale + 100, oy * deformScale + 100, elapsed * 0.3) * deformAmplitude;

    // High-frequency detail jitter on loud transients
    const dx = noise3D(ox * 0.4, oy * 0.4, elapsed * 1.2) * detailAmount;
    const dy = noise3D(ox * 0.4 + 50, oy * 0.4 + 50, elapsed * 1.2) * detailAmount;

    pos.setX(i, ox + nx + dx);
    pos.setY(i, oy + ny + dy);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// ─── Camera Speed Modulation ───────────────────────────────────────────────
//
// Mirrors Fracture scene's scroll-to-acceleration mapping.
// Peak bass transients → 2.2× forward speed burst (decays over ~12 frames).

class CameraSpeedController {
  constructor({ baseSpeed = 0.14, peakMultiplier = 2.2, decayRate = 0.88 } = {}) {
    this.baseSpeed      = baseSpeed;
    this.peakMultiplier = peakMultiplier;
    this.decayRate      = decayRate;
    this._boost         = 0;
    this._prevBass      = 0;
  }

  update() {
    const fft  = window.micFFT ?? new Float32Array(32);
    const bass = average(fft, 0, 3);

    // Detect transient (bass increase above threshold)
    const delta = bass - this._prevBass;
    if (delta > 0.15) {
      this._boost = (this.peakMultiplier - 1) * this.baseSpeed;
    }
    this._prevBass = bass;

    // Decay boost
    this._boost *= this.decayRate;

    return this.baseSpeed + this._boost;
  }
}

// ─── Post-Processing Audio Reactivity ─────────────────────────────────────
//
// Bloom strength and chromatic aberration scale with audio.
// Mirrors Orpheus Protocol's Fracture scene glitch burst system.

class PostProcessingController {
  constructor({ bloomPass, chromaticAberrationPass }) {
    this.bloomPass = bloomPass;
    this.chromPass = chromaticAberrationPass;
    this._glitchTimer    = 0;
    this._glitchCooldown = 0;
    this._chromOffset    = 0.003;
  }

  update(elapsed) {
    const level = window.micLevel ?? 0;
    const fft   = window.micFFT  ?? new Float32Array(32);
    const hi    = average(fft, 11, 24);

    // Bloom scales with overall amplitude
    this.bloomPass.strength = 0.6 + level * 1.2;

    // Glitch bursts on loud high-freq transients (matches Fracture behavior)
    this._glitchCooldown -= 0.016;
    if (hi > 0.7 && this._glitchCooldown <= 0) {
      this._chromOffset    = 0.018;
      this._glitchTimer    = 2 + Math.random() * 5;  // 2–7s burst duration
      this._glitchCooldown = 8;
    }

    // Decay chromatic aberration (0.14 units/frame → matches Fracture)
    if (this._glitchTimer > 0) {
      this._glitchTimer -= 0.016;
    } else {
      this._chromOffset = Math.max(0.003, this._chromOffset - 0.001);
    }

    if (this.chromPass?.uniforms?.offset) {
      this.chromPass.uniforms.offset.value.set(this._chromOffset, this._chromOffset);
    }
  }
}

// ─── Hydra Audio Bridge ────────────────────────────────────────────────────
//
// MicInput.js sets window.micLevel and window.micFFT.
// Hydra sketches read these via:
//   a.fft[n]   — NOT directly wired; use the shim below for isolated instances
//
// For HydraManager instances with makeGlobal: false, manually set
// the audio analysis values on each Hydra's audio object.

function bridgeAudioToHydra(hydraManager) {
  return function syncAudio() {
    const level = window.micLevel ?? 0;
    const fft   = window.micFFT  ?? new Float32Array(32);

    for (const instance of hydraManager.instances) {
      if (!instance?.synth?.a) continue;
      const a = instance.synth.a;
      // Mirror MicInput.js values into Hydra's audio analysis object
      a._energy    = level;
      a.fft[0]     = fft[0] ?? 0;
      a.fft[1]     = fft[3] ?? 0;
      a.fft[2]     = fft[7] ?? 0;
      a.fft[3]     = fft[14] ?? 0;
      a.smooth     = level;
    }
  };
}

// ─── Utility ───────────────────────────────────────────────────────────────

function average(arr, start, end) {
  let sum = 0, count = 0;
  for (let i = start; i <= Math.min(end, arr.length - 1); i++) {
    sum += arr[i]; count++;
  }
  return count > 0 ? sum / count : 0;
}

// ─── Animation Loop Integration ────────────────────────────────────────────
//
// Suggested structure for the Three.js animate() function:
//
//  const speedCtrl = new CameraSpeedController();
//  const ppCtrl    = new PostProcessingController({ bloomPass, chromaticAberrationPass });
//  const syncAudio = bridgeAudioToHydra(hydraManager);
//
//  function animate(elapsed) {
//    requestAnimationFrame(() => animate(elapsed + 0.016));
//
//    // 1. Sync audio to Hydra instances
//    syncAudio();
//
//    // 2. Deform tunnel geometry with audio
//    deformTunnelGeometry(tunnelGeometry, elapsed);
//
//    // 3. Advance camera
//    const speed = speedCtrl.update();
//    camera.position.z += speed;
//    camera.position.x  = Math.sin(elapsed * 0.38) * 1.5;
//    camera.position.y  = Math.cos(elapsed * 0.29) * 0.8;
//    camera.lookAt(camera.position.x, camera.position.y, camera.position.z + 20);
//
//    // 4. Update post-processing
//    ppCtrl.update(elapsed);
//
//    // 5. Update Hydra → Three.js textures
//    hydraManager.updateTextures();
//
//    // 6. Tick AI form layer
//    aiLayer.tick(performance.now());
//
//    // 7. Render
//    composer.render();
//  }

export { deformTunnelGeometry, CameraSpeedController, PostProcessingController, bridgeAudioToHydra };
