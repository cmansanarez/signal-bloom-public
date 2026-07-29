// sketch-loader.js — Signal Bloom
// Adapted from NoirMak VJ System (noir-hydra-live/sketch-loader.js).
//
// Changes from NoirMak:
//   • initHydra() removed — HydraManager in main.js owns Hydra init
//   • SSE/fetch endpoints are relative (/events, /sketches) — Vite proxies to watcher
//   • Video cleanup removed — Signal Bloom has no video sketches in Phase 1
//   • init() exported — called from main.js after HydraManager is ready
//   • onSketchLoad callback allows main.js to refresh the Hydra texture
//
// Sketch files in sketches/ are plain Hydra code — osc(10).out() etc.
// They run in the global scope and write to the HydraManager offscreen canvas.

// Sketches are grouped into named libraries: top-level sketches/ is always
// 'arc'; any subdirectory (sketches/<name>/) becomes its own named library
// (see watcher.js's getSketchList()). Tab switches the active library; ←/→
// cycle within it. `sketches` always points at the active library's list so
// the rest of the loader is unchanged. Ships with only 'arc' populated —
// Tab is a no-op until a subdirectory library exists.
let libraries       = { arc: [] }
let libraryNames    = ['arc']
let activeLib       = 'arc'
let libIndex        = { arc: 0 }   // remembered cursor per library
let sketches        = []
let currentIndex    = 0
let activeScript    = null
let prevSource      = ''
let reloadCount     = 0
let overlayVisible  = true
let codeOverlayVisible = false
let editMode        = false
let codeColorIndex  = 0
let codeWarpActive  = false
let scanlinesActive = false
let scrollInterval  = null

const CODE_COLORS = [null, 'signal', 'fragment', 'noise', 'warn', 'txt']

// Called by main.js after each sketch loads so the Three.js texture gets refreshed
let _onSketchLoad = null
export function onSketchLoad(fn) { _onSketchLoad = fn }

// ── Sketch Loading ────────────────────────────────────────────────────────────

// Sketches spawn <video> elements for s0–s3 and only clean up their OWN ids on
// reload — so cycling sketches left every previous sketch's videos looping and
// decoding offscreen forever, the dominant cause of the runaway slowdown across
// a set. Tear them down on every real switch (skipped on silent hot-reload, so
// live-editing one sketch doesn't flash its own media).
function cleanupSketchMedia() {
  // Release the Hydra source slots: frees their GPU textures and stops any
  // webcam / screen-capture MediaStream the previous sketch left running.
  for (const s of [window.s0, window.s1, window.s2, window.s3]) {
    try { s?.clear?.() } catch (_) {}
  }
  // Remove the <video> elements sketches appended to <body>. pause + clear src +
  // load() releases the decoder and buffered frames; remove() drops the node.
  for (const v of document.querySelectorAll('video')) {
    try {
      v.pause()
      const stream = v.srcObject
      if (stream?.getTracks) stream.getTracks().forEach(t => t.stop())
      v.srcObject = null
      v.removeAttribute('src')
      v.load()
      v.remove()
    } catch (_) {}
  }
}

// silent=true: in-place hot-reload — don't hush, keep visual running until new .out() fires
export function loadSketch(index, silent = false) {
  if (index < 0 || index >= sketches.length) return

  if (!silent) {
    try { hush() } catch (_) {}
    cleanupSketchMedia()
    prevSource  = ''
    reloadCount = 0
  }

  if (activeScript?.parentNode) {
    activeScript.parentNode.removeChild(activeScript)
    activeScript = null
  }

  currentIndex = index
  const sketchPath = sketches[index]

  const script    = document.createElement('script')
  script.src      = sketchPath + '?t=' + Date.now()
  script.onerror  = () => { console.error('[VJ] Failed to load:', sketchPath); updateOverlay() }
  script.onload   = () => {
    if (!silent) console.log('[VJ] Loaded sketch', index + 1, ':', sketchPath)
    _onSketchLoad?.()
  }

  // Reset Hydra's global speed to the default BEFORE the incoming sketch runs, so a
  // sketch that sets its own `speed` keeps it. (Doing this in onload clobbered the
  // sketch's value, since onload fires *after* the sketch has already executed.)
  if (typeof speed !== 'undefined') speed = 1
  document.body.appendChild(script)
  activeScript = script

  if (!silent) updateOverlay()
  if (!silent) refreshCodeOverlay()
}

export function nextSketch() { loadSketch((currentIndex + 1) % sketches.length) }
export function prevSketch() { loadSketch((currentIndex - 1 + sketches.length) % sketches.length) }
export function getCurrentIndex() { return currentIndex }
export function getSketches() { return sketches }

// ── Sketch Discovery ──────────────────────────────────────────────────────────

export async function fetchSketchList() {
  try {
    const res  = await fetch('/sketches')
    const data = await res.json()
    // Back-compat: an array means a single (arc) library.
    libraries = Array.isArray(data) ? { arc: data } : data
    libraryNames = Object.keys(libraries).filter(k => libraries[k]?.length)
    if (!libraryNames.length) libraryNames = ['arc']
    if (!libraryNames.includes(activeLib)) activeLib = libraryNames[0]
    for (const name of libraryNames) if (libIndex[name] == null) libIndex[name] = 0
    sketches = libraries[activeLib] || []
    console.log(`[VJ] libraries: ${libraryNames.map(n => `${n}(${libraries[n].length})`).join(', ')}`)
    return sketches
  } catch (_) {
    console.error('[VJ] watcher not running — start: npm run dev')
    return []
  }
}

// Tab: advance to the next library, restoring that library's last cursor.
export function switchLibrary() {
  if (libraryNames.length < 2) return
  libIndex[activeLib] = currentIndex
  const i = libraryNames.indexOf(activeLib)
  activeLib = libraryNames[(i + 1) % libraryNames.length]
  sketches  = libraries[activeLib] || []
  const idx = Math.min(libIndex[activeLib] ?? 0, sketches.length - 1)
  loadSketch(idx < 0 ? 0 : idx)
}

export function getActiveLibrary() { return activeLib }

// ── Hot-Reload (SSE from watcher.js) ─────────────────────────────────────────

export function connectWatcher() {
  const sse = new EventSource('/events')

  sse.addEventListener('sketch-changed', (e) => {
    try {
      const { file } = JSON.parse(e.data)
      // file is the full path (./sketches/… or ./sketches/vj/…) — only hot-reload
      // when the changed file is the one currently on screen.
      if (file === sketches[currentIndex]) { loadSketch(currentIndex, true); refreshCodeOverlay() }
    } catch (_) {}
  })

  sse.addEventListener('list-changed', async () => {
    await fetchSketchList()
    updateOverlay()
  })

  sse.onerror = () => sse.close()
}

// ── Code Overlay ──────────────────────────────────────────────────────────────

async function fetchSketchCode() {
  try {
    const res = await fetch(sketches[currentIndex] + '?raw=' + Date.now())
    return await res.text()
  } catch (_) {
    return '// could not load sketch source'
  }
}

function formatCode(raw) {
  const prevLines = prevSource ? prevSource.split('\n') : []
  prevSource = raw
  let inBlock = false
  return raw.split('\n').map((line, i) => {
    const num    = String(i + 1).padStart(3, ' ')
    const safe   = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const trimmed = line.trim()
    let isComment = inBlock
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false
    } else if (trimmed.startsWith('//')) {
      isComment = true
    } else if (trimmed.startsWith('/*')) {
      isComment = true
      if (!trimmed.slice(2).includes('*/')) inBlock = true
    }
    const content = isComment ? `<span class="comment">${safe}</span>` : safe
    const changed = prevLines.length > 0 && prevLines[i] !== line
    const cls     = changed ? ' class="line-changed"' : ''
    return `<span${cls}><span class="ln">${num}</span>  ${content}</span>`
  }).join('\n')
}

function flashLiveIndicator() {
  const el = document.getElementById('code-live-indicator')
  if (!el) return
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true })
}

function shakeOverlay() {
  const el = document.getElementById('code-overlay')
  if (!el) return
  el.classList.remove('shaking')
  void el.offsetWidth
  el.classList.add('shaking')
  el.addEventListener('animationend', () => el.classList.remove('shaking'), { once: true })
}

function startAutoScroll() {
  const el = document.getElementById('code-overlay')
  if (!el) return
  clearInterval(scrollInterval)
  el.scrollTop = 0
  scrollInterval = setInterval(() => {
    if (el.scrollTop >= el.scrollHeight - el.clientHeight) {
      el.scrollTop = 0
    } else {
      el.scrollTop += 1
    }
  }, 60)
}

function stopAutoScroll() {
  clearInterval(scrollInterval)
  scrollInterval = null
}

export async function refreshCodeOverlay() {
  if (!codeOverlayVisible || editMode) return
  const raw      = await fetchSketchCode()
  const filename = sketches[currentIndex]?.split('/').pop() ?? '–'
  reloadCount++
  const fnEl  = document.getElementById('code-overlay-filename')
  const rcEl  = document.getElementById('code-reload-count')
  const cdEl  = document.getElementById('code-display')
  if (!fnEl || !cdEl) return
  fnEl.textContent = filename
  if (rcEl) rcEl.textContent = reloadCount
  cdEl.innerHTML = formatCode(raw)
  flashLiveIndicator()
  shakeOverlay()

  const firstChanged = document.querySelector('#code-display .line-changed')
  if (firstChanged) {
    stopAutoScroll()
    firstChanged.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      const overlay = document.getElementById('code-overlay')
      if (!overlay || !codeOverlayVisible) return
      startAutoScroll()
    }, 2000)
  } else {
    startAutoScroll()
  }
}

function cycleCodeColor() {
  const el = document.getElementById('code-display')
  if (!el) return
  codeColorIndex = (codeColorIndex + 1) % CODE_COLORS.length
  const color = CODE_COLORS[codeColorIndex]
  if (color) { el.dataset.color = color } else { delete el.dataset.color }
}

function toggleCodeWarp() {
  const el = document.getElementById('code-display')
  if (!el) return
  codeWarpActive = !codeWarpActive
  el.classList.toggle('warping', codeWarpActive)
}

function toggleScanlines() {
  const el = document.getElementById('scanlines-layer')
  if (!el) return
  scanlinesActive = !scanlinesActive
  el.classList.toggle('active', scanlinesActive)
}

async function toggleCodeOverlay() {
  const overlay = document.getElementById('code-overlay')
  if (!overlay) return
  codeOverlayVisible = !codeOverlayVisible
  overlay.classList.toggle('hidden', !codeOverlayVisible)
  if (codeOverlayVisible) {
    prevSource = ''
    await refreshCodeOverlay()
  } else {
    if (editMode) exitEditMode()
    stopAutoScroll()
  }
}

// ── In-browser code editor ────────────────────────────────────────────────────
// E key (while code overlay is open) toggles edit mode.
// Cmd+Shift+Enter (or Ctrl+Shift+Enter) evaluates the textarea and saves to disk.

async function enterEditMode() {
  if (!codeOverlayVisible) return
  editMode = true
  stopAutoScroll()

  const overlay = document.getElementById('code-overlay')
  const editor  = document.getElementById('code-editor')
  overlay.classList.add('edit-mode')

  const raw = await fetchSketchCode()
  editor.value = raw
  editor.classList.remove('eval-error')
  editor.focus()
  editor.setSelectionRange(0, 0)
  editor.scrollTop = 0
}

function exitEditMode() {
  editMode = false
  const overlay = document.getElementById('code-overlay')
  const editor  = document.getElementById('code-editor')
  const status  = document.getElementById('code-edit-status')
  overlay.classList.remove('edit-mode')
  editor.classList.remove('eval-error')
  editor.blur()
  if (status) status.textContent = ''
  prevSource = ''
  refreshCodeOverlay()
}

async function evalAndSave() {
  const editor = document.getElementById('code-editor')
  const status = document.getElementById('code-edit-status')
  const code   = editor.value

  try {
    // eslint-disable-next-line no-new-func
    new Function(code)()
    editor.classList.remove('eval-error')
    if (status) { status.textContent = 'applied'; status.style.color = 'var(--cyan)'; setTimeout(() => { if (status) status.textContent = '' }, 2000) }
    flashLiveIndicator()
    shakeOverlay()
  } catch (err) {
    editor.classList.add('eval-error')
    if (status) { status.textContent = err.message.slice(0, 50); status.style.color = 'var(--amber)' }
    console.error('[eval]', err)
    return
  }

  // Strip the leading ./sketches/ so the save path keeps any subfolder (vj/…).
  const relPath = sketches[currentIndex]?.replace(/^\.\/sketches\//, '')
  if (relPath) {
    try {
      await fetch(`/sketch/${relPath}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: code })
    } catch (_) {}
  }
}

// ── Status Overlay ────────────────────────────────────────────────────────────

export function updateOverlay() {
  const el = document.getElementById('overlay-text')
  if (!el || !sketches.length) return
  const num   = String(currentIndex).padStart(2, '0')
  const total = String(sketches.length - 1).padStart(2, '0')
  const name  = sketches[currentIndex]?.split('/').pop() ?? '–'
  const lib   = libraryNames.length > 1 ? `[${activeLib.toUpperCase()}] ` : ''
  el.textContent = `${lib}${num} / ${total}  ${name}`
}

function toggleOverlay() {
  const el = document.getElementById('overlay')
  if (!el) return
  overlayVisible = !overlayVisible
  el.classList.toggle('hidden', !overlayVisible)
}

// ── Liturgy text input (Shift+M) ─────────────────────────────────────────────

let liturgyInputVisible = false

function openLiturgyInput() {
  const overlay = document.getElementById('liturgy-input-overlay')
  const input   = document.getElementById('liturgy-input-field')
  if (!overlay) return
  liturgyInputVisible = true
  overlay.classList.remove('hidden')
  setTimeout(() => { input?.focus(); input?.select() }, 0)
}

function closeLiturgyInput() {
  const overlay = document.getElementById('liturgy-input-overlay')
  const input   = document.getElementById('liturgy-input-field')
  if (!overlay) return
  liturgyInputVisible = false
  overlay.classList.add('hidden')
  input?.blur()
}

// ── img2img mode ─────────────────────────────────────────────────────────────

function toggleImgImg() {
  imgImgMode = !imgImgMode
  const status = document.getElementById('prompt-status')
  if (status) status.textContent = imgImgMode ? 'img2img — evolving last form' : 'ready'
  // Also flash the overlay briefly if it's hidden, so the performer gets feedback
  const overlay = document.getElementById('prompt-overlay')
  if (!promptVisible && overlay) {
    overlay.classList.remove('hidden')
    overlay.classList.add('docked')
    setTimeout(() => {
      if (!promptVisible) overlay.classList.add('hidden')
    }, 1800)
  }
}

// ── Prompt Overlay ────────────────────────────────────────────────────────────
// Three states: hidden → open (centered, focused for typing) → docked (compact
// status bar at the bottom, out of the way of the generation). P brings the
// input up / hides it; Enter submits and docks; Escape always closes.

let promptVisible    = false
let promptDocked     = false
let promptHistory    = []
let promptHistoryIdx = -1
let imgImgMode       = false   // I key: use last generation as seed instead of pure noise

function openPrompt() {
  const overlay = document.getElementById('prompt-overlay')
  const input   = document.getElementById('prompt-input')
  if (!overlay) return
  promptVisible = true
  promptDocked  = false
  overlay.classList.remove('hidden', 'docked')
  setTimeout(() => { input?.focus(); input?.select() }, 0)
}

function dockPrompt() {
  const overlay = document.getElementById('prompt-overlay')
  const input   = document.getElementById('prompt-input')
  if (!overlay) return
  promptVisible = true
  promptDocked  = true
  overlay.classList.remove('hidden')
  overlay.classList.add('docked')
  input?.blur()   // release focus so global keys (P, B, ← →) work again
}

function closePrompt() {
  const overlay = document.getElementById('prompt-overlay')
  const input   = document.getElementById('prompt-input')
  if (!overlay) return
  promptVisible = false
  promptDocked  = false
  overlay.classList.add('hidden')
  overlay.classList.remove('docked')
  input?.blur()
}

// P key: raise the input for typing if it isn't already, otherwise hide it.
function togglePrompt() {
  if (!promptVisible || promptDocked) openPrompt()
  else closePrompt()
}

// ── Keyboard Controls ─────────────────────────────────────────────────────────

const sketchByName = (keyword) => sketches.findIndex(s => s.includes(keyword))

let numBuffer  = ''
let numTimeout = null

function commitNumber() {
  const i = parseInt(numBuffer, 10)
  numBuffer = ''
  if (!isNaN(i) && i < sketches.length) loadSketch(i)
}

export function initKeyboard() {
  const input = document.getElementById('prompt-input')

  // Code editor textarea — Cmd/Ctrl+Shift+Enter evals, Escape exits edit mode
  const codeEditor = document.getElementById('code-editor')
  codeEditor?.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault()
      evalAndSave()
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); exitEditMode(); return }
    e.stopPropagation()
  })

  // Liturgy text input — Enter sends to banner, Escape closes
  const liturgyInput = document.getElementById('liturgy-input-field')
  liturgyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeLiturgyInput(); e.stopPropagation(); return }
    if (e.key === 'Enter') {
      const text = liturgyInput.value.trim()
      if (text) {
        window.dispatchEvent(new CustomEvent('liturgy-custom', { detail: { text } }))
        liturgyInput.value = ''
      }
      closeLiturgyInput()
      e.stopPropagation(); return
    }
    e.stopPropagation()
  })

  // Prompt input — capture ↑↓ for history, Enter to send, Escape to close
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePrompt(); e.stopPropagation(); return }
    if (e.key === 'Enter')  {
      const prompt = input.value.trim()
      if (prompt) {
        promptHistory.unshift(prompt)
        promptHistoryIdx = -1
        sendPrompt(prompt)
        dockPrompt()   // drop to the bottom so the crystallization is unobstructed
      }
      e.stopPropagation(); return
    }
    if (e.key === 'ArrowUp') {
      if (promptHistory.length) {
        promptHistoryIdx = Math.min(promptHistoryIdx + 1, promptHistory.length - 1)
        input.value = promptHistory[promptHistoryIdx] ?? ''
      }
      e.preventDefault(); e.stopPropagation(); return
    }
    if (e.key === 'ArrowDown') {
      promptHistoryIdx = Math.max(promptHistoryIdx - 1, -1)
      input.value = promptHistoryIdx >= 0 ? (promptHistory[promptHistoryIdx] ?? '') : ''
      e.preventDefault(); e.stopPropagation(); return
    }
    e.stopPropagation()
  })

  document.addEventListener('keydown', (e) => {
    // Suspend global keys while typing in any text input overlay
    if (document.activeElement === input) return
    if (document.activeElement === liturgyInput) return
    if (document.activeElement === codeEditor) return

    if (e.key === 'Escape') {
      if (liturgyInputVisible) { closeLiturgyInput(); return }
      if (promptVisible) closePrompt()
      return
    }

    if (e.key >= '0' && e.key <= '9') {
      numBuffer += e.key
      clearTimeout(numTimeout)
      numTimeout = setTimeout(commitNumber, 600)
      return
    }

    if (e.key === 'Tab') { e.preventDefault(); switchLibrary(); return }

    switch (e.key) {
      case 'ArrowRight':   nextSketch(); break
      case 'ArrowLeft':    prevSketch(); break
      case ' ':            e.preventDefault(); loadSketch(currentIndex); break
      case 'Enter':        clearTimeout(numTimeout); commitNumber(); break
      case 'b': case 'B':  try { hush() } catch (_) {} break
      case 'h': case 'H':  toggleOverlay(); break
      case 'k': case 'K':  toggleCodeOverlay(); break
      case 'e': case 'E':  if (codeOverlayVisible) { editMode ? exitEditMode() : enterEditMode() } break
      case 'j': case 'J':  cycleCodeColor(); break
      case 'w': case 'W':  if (codeOverlayVisible) toggleCodeWarp(); break
      case 'l': case 'L':  toggleScanlines(); break
      case 'p': case 'P':  togglePrompt(); break
      case 'i': case 'I':  toggleImgImg(); break
      case 'ArrowUp':   window.dispatchEvent(new CustomEvent('star-z-shift', { detail: { dir:  1 } })); e.preventDefault(); break
      case 'ArrowDown': window.dispatchEvent(new CustomEvent('star-z-shift', { detail: { dir: -1 } })); e.preventDefault(); break
      case 'g': case 'G':  window.dispatchEvent(new Event('toggle-stars')); break
      case 'r': case 'R':  window.dispatchEvent(new Event('toggle-form-rotate')); break
      case 't': case 'T':  window.dispatchEvent(new Event('toggle-flat-mode')); break
      case 'a': case 'A':  window.dispatchEvent(new Event('toggle-size-attenuation')); break
      case '*':            window.dispatchEvent(new Event('toggle-bloom')); break   // Shift+8 — bloom on/off
      case 'm': case 'M':
        if (e.shiftKey) openLiturgyInput()
        else window.dispatchEvent(new Event('toggle-liturgy'))
        break
      case 'n': case 'N':  window.dispatchEvent(new Event('next-liturgy')); break
      case 'c': case 'C':  { const i = sketchByName('webcam'); if (i >= 0) loadSketch(i); break }
      case 's': case 'S':  { const i = sketchByName('screen'); if (i >= 0) loadSketch(i); break }
      case 'v': case 'V':  { const i = sketchByName('video');  if (i >= 0) loadSketch(i); break }
    }
  })
}

// ── Prompt dispatch (Phase 2) ─────────────────────────────────────────────────

async function sendPrompt(prompt) {
  const status = document.getElementById('prompt-status')
  if (status) status.textContent = imgImgMode ? 'evolving…' : 'summoning…'
  try {
    await fetch('/prompt', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, imgImg: imgImgMode }),
    })
  } catch (_) {
    if (status) status.textContent = 'bridge offline'
  }
}

// ── Console globals ───────────────────────────────────────────────────────────
window.nextSketch = nextSketch
window.prevSketch = prevSketch
window.loadSketch = loadSketch

// ── Boot ──────────────────────────────────────────────────────────────────────

export async function init() {
  await fetchSketchList()
  if (sketches.length > 0) loadSketch(0)
  connectWatcher()
  initKeyboard()
  updateOverlay()
}
