/**
 * Signal Bloom — Hydra → Three.js CanvasTexture Pipeline
 * study-03-hydra-to-threejs.js
 *
 * Pattern derived from Orpheus Protocol's HydraManager.js + Portal scene.
 * Each Hydra instance renders to an offscreen 512×512 canvas.
 * Three.js reads these canvases as live CanvasTexture objects.
 * Call updateTextures() in the Three.js render loop every frame.
 *
 * Usage (ES module, in-browser):
 *   import { HydraTextureManager } from './study-03-hydra-to-threejs.js';
 */

import * as THREE from 'three';

// ─── HydraTextureManager ───────────────────────────────────────────────────

class HydraTextureManager {
  constructor({ canvasSize = 512, instanceCount = 2 } = {}) {
    this.canvasSize = canvasSize;
    this.instanceCount = instanceCount;
    this.instances = [];   // Hydra instances
    this.canvases  = [];   // offscreen <canvas> elements
    this.textures  = [];   // THREE.CanvasTexture objects
  }

  async init() {
    for (let i = 0; i < this.instanceCount; i++) {
      const canvas = document.createElement('canvas');
      canvas.width  = this.canvasSize;
      canvas.height = this.canvasSize;

      // Hydra constructor takes the canvas directly.
      // detectAudio: true enables a.fft[] / a.smooth via MicInput.js globals.
      const hydra = new Hydra({
        canvas,
        detectAudio: false,  // we wire audio manually via window.micLevel/micFFT
        autoLoop: true,
        makeGlobal: false,   // avoid polluting window — each instance is isolated
      });

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      this.canvases.push(canvas);
      this.instances.push(hydra);
      this.textures.push(texture);
    }
  }

  // Call every frame in the Three.js animation loop.
  // Marks all textures dirty so GPU uploads the latest canvas content.
  updateTextures() {
    for (const tex of this.textures) tex.needsUpdate = true;
  }

  // Load a Hydra sketch string into a specific instance.
  // Mirrors sketch-loader.js loadSketch() pattern from NoirMak.
  loadSketch(instanceIndex, sketchCode) {
    const h = this.instances[instanceIndex];
    if (!h) return;
    // Expose Hydra's source/output globals scoped to this instance
    const { s0, s1, s2, s3, o0, o1, o2, o3, src, osc, noise, voronoi,
            solid, shape, gradient, render, hush } = h.synth;
    try {
      const fn = new Function(
        's0','s1','s2','s3','o0','o1','o2','o3',
        'src','osc','noise','voronoi','solid','shape','gradient','render','hush',
        sketchCode
      );
      fn(s0,s1,s2,s3,o0,o1,o2,o3,src,osc,noise,voronoi,solid,shape,gradient,render,hush);
    } catch (err) {
      console.error(`Sketch load error (instance ${instanceIndex}):`, err);
    }
  }

  getTexture(index) { return this.textures[index]; }
  getCanvas(index)  { return this.canvases[index]; }
}

// ─── Tunnel Material Setup ─────────────────────────────────────────────────

function buildTunnelMaterial(hydraManager, textureIndex = 0) {
  return new THREE.MeshBasicMaterial({
    map:  hydraManager.getTexture(textureIndex),
    side: THREE.BackSide,   // render inside the tunnel tube
  });
}

// ─── AI Frame Layer ────────────────────────────────────────────────────────
//
// When ComfyUI sends "image-ready", spawn a plane in the tunnel
// positioned 80 units ahead of the camera. Scale-in over 3 seconds.
// Each new generation adds a new plane; old ones fade out after 30s.

class AIFormLayer {
  constructor(scene) {
    this.scene  = scene;
    this.planes = [];
  }

  spawn(imageSrc, cameraZ) {
    const texture = new THREE.TextureLoader().load(imageSrc);
    const geo     = new THREE.PlaneGeometry(8, 8);
    const mat     = new THREE.MeshBasicMaterial({
      map:         texture,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
    });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(0, 0, cameraZ + 80);
    mesh.scale.set(0.01, 0.01, 0.01);
    this.scene.add(mesh);

    const entry = {
      mesh,
      spawnTime:  performance.now(),
      fadeIn:     true,
      fadeOut:    false,
      lifetime:   30_000,  // ms before fade-out begins
    };
    this.planes.push(entry);
    return entry;
  }

  // Call updateTextures() in step-preview handler to show partial frames
  updatePreviewTexture(entry, imageDataUrl) {
    const tex = new THREE.TextureLoader().load(imageDataUrl);
    entry.mesh.material.map = tex;
    entry.mesh.material.needsUpdate = true;
  }

  // Call every frame
  tick(now) {
    this.planes = this.planes.filter(entry => {
      const age = now - entry.spawnTime;
      const { mesh, lifetime } = entry;

      if (entry.fadeIn) {
        mesh.material.opacity = Math.min(1, mesh.material.opacity + 0.02);
        mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.08);
        if (mesh.material.opacity >= 1) entry.fadeIn = false;
      }

      if (age > lifetime) entry.fadeOut = true;

      if (entry.fadeOut) {
        mesh.material.opacity = Math.max(0, mesh.material.opacity - 0.01);
        if (mesh.material.opacity <= 0) {
          this.scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
          return false;
        }
      }
      return true;
    });
  }
}

// ─── Wire SSE Events to Scene ──────────────────────────────────────────────

function connectSSE(hydraManager, aiLayer, camera, onSketchChange) {
  const es = new EventSource('/events');

  es.addEventListener('sketch-changed', ({ data }) => {
    const { file } = JSON.parse(data);
    onSketchChange(file);
  });

  es.addEventListener('step-preview', ({ data }) => {
    const { step, total, preview } = JSON.parse(data);
    if (preview) {
      const dataUrl = `data:image/jpeg;base64,${preview}`;
      // Update the "preview" entry if it exists, or spawn one
      if (aiLayer._previewEntry) {
        aiLayer.updatePreviewTexture(aiLayer._previewEntry, dataUrl);
      } else {
        aiLayer._previewEntry = aiLayer.spawn(dataUrl, camera.position.z);
      }
    }
  });

  es.addEventListener('image-ready', ({ data }) => {
    const { src } = JSON.parse(data);
    // Replace preview entry with full-resolution final image
    if (aiLayer._previewEntry) {
      aiLayer.updatePreviewTexture(aiLayer._previewEntry, src + '?t=' + Date.now());
      aiLayer._previewEntry = null;
    } else {
      aiLayer.spawn(src + '?t=' + Date.now(), camera.position.z);
    }
  });

  return es;
}

export { HydraTextureManager, buildTunnelMaterial, AIFormLayer, connectSSE };
