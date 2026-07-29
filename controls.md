# Signal Bloom — Controls & Startup Reference

Operational cheat-sheet for running a set. Keep this open (or printed) during performance.

---

## Initialization

Two separate processes. **Start ComfyUI first** — it's the slowest to boot.

### 1. ComfyUI  (Terminal 1)
```bash
cd ~/ComfyUI && source venv/bin/activate && python main.py

```
Wait for it to print that it's serving on `127.0.0.1:8188`.

### 2. Signal Bloom bridge + Vite  (Terminal 2)
```bash
cd "/Users/cammacmini/Documents/Documents - Cameron Mac mini/VSCode_Files/Signal_Bloom"
npm run dev
```
`npm run dev` launches **both** the bridge (`watcher.js` → `:3001`) and Vite (`:5173`) together — there is no separate "activate the bridge" step. The `predev` hook auto-kills anything stale on those ports first.

### 3. Open the browser
Navigate Chrome to **http://localhost:5173** (the Vite URL — it proxies `/prompt`, `/events`, `/generated`, `/sketches` to the bridge). Press `F11` for full-screen.

### Health checks
- **Bridge ready:** Terminal 2 prints `[watcher] ready → http://localhost:3001` and `[watcher] N sketch(es) found`.
- **ComfyUI connected:** fire one test prompt. Terminal 2 shows `[bridge] txt2img: "..."` + `full prompt → ...`. A websocket error instead means ComfyUI isn't up yet.

### Notes
- **Order is forgiving.** If Signal Bloom starts before ComfyUI, the bridge still runs — the first prompt just shows `comfyui offline` until ComfyUI is live. No restart needed; the next prompt works.
- **Tuning is live — no restart.** `config.json` and `workflows/*.json` reload on every generation. Only restart `npm run dev` when you change actual JavaScript (`watcher.js`, `comfyui.js`, `src/`).

---

## Keyboard Controls

### Sketch navigation
| Key | Action |
|---|---|
| `←` | Previous sketch |
| `→` | Next sketch |
| `0`–`9` | Jump to sketch by number (type digits, commits after 600 ms) |
| `Enter` | Commit a typed sketch number immediately |
| `Space` | Reload the current sketch |

### Scene / visuals
| Key | Action |
|---|---|
| `T` | **Flat mode** — collapse the tunnel into a full-frame Hydra wall (toggle) |
| `A` | Point-cloud size attenuation (toggle) — perspective-scaled vs. flat screen-space points |
| `*` | **Bloom** (Shift+8) — toggle the global bloom/glow post-effect; bring it in on peaks, drop it otherwise |
| `G` | **Star polyhedra** — toggle the star shapes visible/hidden in the tunnel |
| `R` | **Rotation** — toggle spin on star polyhedra + AI form (toggle) |
| `↑` | Move star cluster toward camera (appears larger) |
| `↓` | Move star cluster away from camera (appears smaller) |
| `B` | **Blackout** — instant hush, the emergency brake |
| `L` | Scanlines overlay (toggle) |
| `H` | Status overlay (toggle) |

### Code overlay
| Key | Action |
|---|---|
| `K` | Code overlay (toggle) |
| `J` | Cycle code color |
| `W` | Code warp effect (toggle — only while code overlay is visible) |

### AI generation
| Key | Action |
|---|---|
| `P` | Prompt input — raise for typing / hide (toggle) |
| `I` | img2img mode — use the last generated form as the seed instead of pure noise (toggle) |

### Source sketches (load only if a matching sketch exists)
| Key | Action |
|---|---|
| `C` | Load a sketch whose filename contains "webcam" |
| `S` | Load a sketch whose filename contains "screen" |
| `V` | Load a sketch whose filename contains "video" |

None of the shipped example sketches match these — they're a convenience
hook for sketches you add yourself (e.g. `sketches/webcam-feed.js`); the
keys silently no-op otherwise.

### Prompt input (while the text field is focused)
| Key | Action |
|---|---|
| `Enter` | Send the prompt and dock the input to the bottom |
| `Esc` | Close the prompt input |
| `↑` | Previous prompt from history |
| `↓` | Next prompt from history |

---

## Prompt Syntax

The text you type is the **subject**. The base style (`stylePrompt` in `config.json`) is appended automatically every generation, and your subject is weighted up so short prompts survive the long style tail.

### Style modifiers
Prefix a prompt with `@<modifier>` to layer in a content lens for that one generation:

| Prefix | Adds |
|---|---|
| `@sculpture` | hellenistic marble sculpture, classical statue, weathered stone |
| `@angel` | ethereal wings, celestial figure, divine glow |
| `@cyber` | chrome surfaces, futuristic tech, holographic interfaces |
| `@floral` | organic botanical forms, blooming flowers, petals, vines |

Examples:
- `@sculpture a face dissolving into static`
- `@floral rose` 
- `rose` — base style only, no modifier

To make a modifier persistent (no `@` prefix needed), set `"activeModifier": "sculpture"` in `config.json`. Modifiers are defined in `config.json` under `styleModifiers` — add or edit freely; changes are live.

---

## Quick Pre-Set Checklist

- [ ] ComfyUI running on `:8188`, queue clear
- [ ] `npm run dev` up — bridge `:3001` + Vite `:5173`
- [ ] Chrome at `http://localhost:5173`, full-screen (`F11`)
- [ ] Mic level showing in the status bar
- [ ] One test prompt generates successfully
- [ ] `B` blackout tested and restored
- [ ] Sketch navigation (`←`/`→`) confirmed
