# Wireframe 01 — Performer Browser Interface
Signal Bloom | Low-Fidelity Layout | Chrome, 1920×1080

---

## Full Screen View (Default State)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STATUS BAR [H to toggle] — dim, always rendered, top edge                  │
│  SIGNAL BLOOM  ·  sketch: 04-fracture-bloom  ·  ● LIVE  ·  ▊▊▊▌░ audio   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│                                                                             │
│                    THREE.JS TUNNEL CANVAS                                  │
│                    (full viewport, WebGL, z-axis falling)                  │
│                                                                             │
│              ╱─────────────────────────────────╲                          │
│             ╱    Hydra texture on tunnel walls   ╲                         │
│            │     audio-reactive modulation        │                        │
│            │                                      │                        │
│            │         · · [AI FORM] · ·            │                        │
│            │      crystallizing from noise        │                        │
│            │      (torus / lattice / body)        │                        │
│            │                                      │                        │
│             ╲     fog deepens toward z=+∞        ╱                         │
│              ╲─────────────────────────────────╱                          │
│                                                                             │
│                                                                             │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ KEY REF [dim] ← → sketch  ·  0–9 jump  ·  K code  ·  P prompt  ·  B black │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Overlay States (rendered over tunnel canvas, z-index layers)

### [K] Code Overlay — Left Side, mix-blend-mode: difference

```
┌─────────────────────────────────────────────────────────────┐
│ ▌CODE  04-fracture-bloom.js  [LIVE] ↺ 3               [K×] │
├─────────────────────────────────────────────────────────────┤
│  01  osc(4, 0.1, 0.8)                                      │
│  02    .rotate(() => a.fft[2] * 3.14)                      │
│  03    .color(0, () => a.fft[0], () => a.fft[3])           │
│  04    .modulate(                                           │
│  05      noise(3, 0.5).brightness(-0.4)                    │
│  06    )                                                    │
│ ░07░   .blend(o1, () => a.smooth * 0.6)                   │
│  08    .out(o0)                                             │
│  09                                                         │
│  10  solid(0,0,0)                                           │
│  11    .diff(                                               │
│  12      src(o0).scrollX(0.003)                            │
│  13    )                                                    │
│  14    .out(o1)                                             │
│                                                             │
│  render(o0)                                                 │
└─────────────────────────────────────────────────────────────┘
Line 07 highlighted (last change, 2s ago) — cyan inset glow
```

### [P] Prompt Overlay — Center, triggered state

```
                    ┌──────────────────────────────────┐
                    │  ▸ GENERATE                       │
                    │ ┌──────────────────────────────┐ │
                    │ │ three-dimensional torus _     │ │
                    │ └──────────────────────────────┘ │
                    │                                  │
                    │  STEP  ████████████░░░░░  14/20  │
                    │  STATUS: generating · 8s elapsed │
                    │                                  │
                    │  last: "glitch membrane"  3m ago │
                    └──────────────────────────────────┘
                    [Enter] dispatch  [Esc] cancel  [↑] history
```

### [P] Prompt Overlay — Idle state (no active generation)

```
                    ┌──────────────────────────────────┐
                    │  ▸ GENERATE                       │
                    │ ┌──────────────────────────────┐ │
                    │ │ _                             │ │
                    │ └──────────────────────────────┘ │
                    │                                  │
                    │  STEP  ░░░░░░░░░░░░░░░  ready   │
                    │  STATUS: idle                    │
                    │                                  │
                    └──────────────────────────────────┘
```

### [B] Blackout State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                                                             │
│                                                                             │
│                              ██████████████                                │
│                          (full black — hush())                             │
│                                                                             │
│                              [B] to restore                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Keyboard Control Reference

| Key | Action | Notes |
|---|---|---|
| `←` / `→` | Previous / Next sketch | Wraps |
| `0`–`9` | Jump to sketch by index | 600ms multi-digit buffer |
| `Space` | Reload current sketch | Silent reload |
| `K` | Toggle code overlay | mix-blend-mode: difference |
| `J` | Cycle code color | difference → cyan → magenta → blue → amber |
| `W` | Warp code overlay | skew + scale distortion |
| `H` | Toggle status bar | |
| `L` | Toggle scanlines | |
| `B` | Blackout (hush) | Instant cut |
| `P` | Open / close prompt input | Focuses text field |
| `C` / `S` / `V` | Jump to webcam / screen / video sketch | Filename match |
| `Enter` | Dispatch prompt (when P overlay open) | Queues to ComfyUI |
| `↑` | Prompt history (when P overlay open) | Last 10 prompts |
| `Esc` | Close prompt overlay | Cancels if not yet dispatched |

---

## Layout Zones & Z-Index Stack

```
z-index 100  [Key reference bar]       — fixed bottom, dim
z-index  90  [Prompt overlay]          — centered, toggled by P
z-index  80  [Code overlay]            — left side, toggled by K
z-index  70  [Status bar]              — top edge, toggled by H
z-index  60  [Scanlines overlay]       — full screen, toggled by L
z-index  50  [Blackout overlay]        — full screen, toggled by B
z-index   1  [Three.js canvas]         — fullscreen WebGL
z-index   0  [body background]         — #000
```

---

## Notes

- All overlay elements use `position: absolute` over the canvas
- Code overlay uses `mix-blend-mode: difference` — always readable over any visual
- Prompt overlay uses `backdrop-filter: blur(8px)` for legibility
- Status bar auto-hides after 3 seconds of no activity (optional behavior)
- Scanlines are a CSS repeating linear-gradient overlay, 3px repeat
