# Wireframe 03 — Tunnel Spatial Layout & AI Form Placement
Signal Bloom | Three.js Scene Zones | Low-Fidelity Diagram

---

## Top-Down View (X/Z plane, camera at origin looking +Z)

```
                          CAMERA  ●
                              │
                              │  (performer codes here — real time)
                              │  Hydra sketch controls wall texture
                              │
         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ NEAR ZONE
                         ┌────┴────┐
                         │        │   Wall material:
                         │  ZONE  │   THREE.BackSide mesh
                         │   A    │   Hydra CanvasTexture (live)
                         │  near  │   audio-reactive: osc/noise/voronoi
                         │        │   bass → scale, mid → frequency
                         └────┬───┘
                              │
         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ AI ENCOUNTER ZONE
                         ┌────┴────┐
                         │        │   AI-generated form appears here.
                         │  ZONE  │   Torus / lattice / body geometry
                         │   B    │   floating as THREE.Mesh or sprite
                         │  mid   │   texture = ComfyUI output PNG
                         │   ·∘·  │   crystallizes over 4–8 seconds
                         └────┬───┘
                              │
         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ FAR ZONE
                         ┌────┴────┐
                         │        │   Wall texture shifts (sketch change)
                         │  ZONE  │   Bloom + fog intensifies
                         │   C    │   AfterimagePass trails deepen
                         │  far   │   Camera acceleration during loud peaks
                         │        │
                         └────┬───┘
                              │
                              ▼
                          z = +∞  (FogExp2 density 0.022)
                          horizon disappears into darkness
```

---

## Camera Path (Fracture Scene, figure-8 trajectory)

```
  X-axis sway:  sin(elapsed × 0.38)  amplitude ±1.5 units
  Y-axis sway:  cos(elapsed × 0.29)  amplitude ±0.8 units
  Z-axis:       base 0.14 units/frame forward
                audio peak → 2.2× acceleration burst

  ┌────────────────────────────────────────────────┐
  │  Top view of camera path (X/Z plane):          │
  │                                                │
  │          ╭────────────────────────╮            │
  │         ╱    figure-8 lateral     ╲            │
  │  ●─────(──────────────────────────)──────►     │
  │         ╲    sway as you fall     ╱            │
  │          ╰────────────────────────╯            │
  │                                    z →         │
  └────────────────────────────────────────────────┘
```

---

## Tunnel Geometry (Fracture Scene Reference)

```
  22 rings × 72 points = 1,584 total vertices

  Ring cross-section (looking down z-axis):

         ╭──────────────╮
        ╱                ╲
       │   tunnel space   │   ← camera travels through here
        ╲                ╱
         ╰──────────────╯
          72 vertices/ring
          Perlin-deformed per frame
          Audio → deformation amplitude

  Rings recycle as camera passes:
    oldest ring repositioned to front of queue
    continuous infinite tunnel illusion
```

---

## Layer Stack (Front-to-Back in 3D Scene)

```
  [FRONT — near camera]
  ─────────────────────────────────────────────────
  │  Post-processing EffectComposer
  │    · UnrealBloomPass  (strength 0.6–1.8)
  │    · AfterimagePass   (damping 0.84–0.88)
  │    · ShaderPass chromatic aberration (0.003–0.018)
  ─────────────────────────────────────────────────
  │  AI Form Geometry (Zone B)
  │    · THREE.TorusGeometry or PlaneGeometry (for 2D AI image)
  │    · material.map = ComfyUI generated PNG texture
  │    · spawns at z = camera.z + 80 units ahead
  │    · scale animates: 0 → full over generation duration
  ─────────────────────────────────────────────────
  │  Tunnel Wall Geometry (Zones A–C)
  │    · 1584-point PointCloud or TubeGeometry
  │    · material: THREE.MeshBasicMaterial, side: BackSide
  │    · map: HydraManager CanvasTexture (512×512, needsUpdate/frame)
  │    · Perlin deformation per vertex per frame
  ─────────────────────────────────────────────────
  │  Fog Volume
  │    · THREE.FogExp2 (color: #000010, density: 0.022)
  │    · makes far geometry fade to black naturally
  ─────────────────────────────────────────────────
  [BACK — z = +∞]
```

---

## AI Form Spawn Behavior

```
  When SSE event "image-ready" fires:
  ────────────────────────────────────

  1. Bridge sends: { event: "image-ready", src: "/generated/latest.png" }

  2. Browser creates new THREE.PlaneGeometry(8, 8)
     → loads PNG as THREE.TextureLoader texture
     → positions at camera.z + 80 units ahead
     → scale = (0, 0, 0)

  3. Each animation frame:
     → scale lerp toward (1, 1, 1) over 3 seconds

  4. After 30 seconds (configurable):
     → scale lerp toward (0, 0, 0) over 5 seconds
     → remove from scene

  During step-preview streaming (steps 1–N):
  ────────────────────────────────────────────

  · A lower-resolution preview plane exists at camera.z + 60 units
  · Each step-preview event updates its texture
  · Audience sees noise → form crystallizing in the distance
  · When image-ready fires: this preview plane transitions
    → replaced by the full-resolution final plane

  Multiple prompts in sequence:
  ──────────────────────────────

  · Each new generation spawns a new plane at different Z depth
  · Forms accumulate in the tunnel, fading with fog
  · Creates a "trail of past generation" visual history
```

---

## Color Temperature Gradient (Z-depth)

```
  NEAR  (tunnel entry, camera position)
  ─────
  Hydra texture dominant — cyan, electric blue, audio-reactive
  Chromatic aberration low (0.003)
  Bloom strength: 0.6

  ───  AI ENCOUNTER ZONE  ───
  Generated form appears with magenta/warm glow corona
  Bloom spikes on form edges

  FAR  (tunnel depths, horizon)
  ────
  FogExp2 deepens — desaturates toward near-black
  AfterimagePass trails visible — ghosting of past textures
  Chromatic aberration max (0.018) during glitch events
  Bloom strength: 1.8
```
