// watcher.js — Signal Bloom bridge server
// Extends NoirMak watcher with AI generation endpoints (Phase 2).
//
// Run with: node watcher.js  (started automatically via `npm run dev`)
// Vite proxies /events /sketches /generated /prompt → this server at port 3001
//
// Endpoints:
//   GET  /sketches       → sorted JSON array of sketch filenames
//   GET  /events         → SSE stream (sketch-changed, list-changed, step-preview, image-ready)
//   GET  /generated/*    → serve AI-generated images
//   POST /prompt         → (Phase 2) trigger ComfyUI generation

const http = require('http')
const fs   = require('fs')
const path = require('path')
const comfyui = require('./comfyui')

const PORT     = 3001
const ROOT     = __dirname
const SKETCHES = path.join(ROOT, 'sketches')
const GENERATED = path.join(ROOT, 'generated')

const clients = new Set()

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns sketches grouped into libraries: top-level .js files are the "arc"
// (the Signal Bloom narrative), each subdirectory is its own named library
// (e.g. vj/ → the ported NoirMak VJ bank). The browser keeps these separate
// and switches between them with Tab.
function getSketchList() {
  const libs = { arc: [] }
  try {
    const entries = fs.readdirSync(SKETCHES, { withFileTypes: true })
    libs.arc = entries
      .filter(e => e.isFile() && e.name.endsWith('.js'))
      .map(e => e.name).sort()
      .map(n => `./sketches/${n}`)
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const sub = fs.readdirSync(path.join(SKETCHES, e.name))
        .filter(f => f.endsWith('.js')).sort()
        .map(f => `./sketches/${e.name}/${f}`)
      if (sub.length) libs[e.name] = sub
    }
  } catch (_) {}
  return libs
}

// Flat set of every sketch path relative to SKETCHES (incl. subfolders),
// used by the watcher to detect added/removed files across all libraries.
function allSketchFiles() {
  const out = []
  try {
    const entries = fs.readdirSync(SKETCHES, { withFileTypes: true })
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.js')) out.push(e.name)
      else if (e.isDirectory()) {
        for (const f of fs.readdirSync(path.join(SKETCHES, e.name))) {
          if (f.endsWith('.js')) out.push(`${e.name}/${f}`)
        }
      }
    }
  } catch (_) {}
  return out
}

function broadcast(eventName, payload) {
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const client of clients) {
    try { client.write(msg) } catch (_) { clients.delete(client) }
  }
}

function serveFile(res, filePath, cors) {
  const ext  = path.extname(filePath).toLowerCase()
  const mime = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.js': 'application/javascript; charset=utf-8',
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', ...cors })
    res.end(data)
  })
}

// Resolve `rel` under `root`, returning the absolute path only if it stays inside
// root. Decodes percent-encoding first, then guards traversal (../, absolute paths,
// encoded dots) with a trailing-separator boundary check — so a sibling directory
// that merely shares root's name as a prefix (e.g. `<root>-evil`) can't slip past.
// Returns null when the path is unsafe.
function safeResolve(root, rel) {
  let decoded
  try { decoded = decodeURIComponent(rel) } catch (_) { return null }
  const abs = path.resolve(root, decoded)
  return abs === root || abs.startsWith(root + path.sep) ? abs : null
}

// ── ComfyUI generation (Phase 2) ────────────────────────────────────────────
// One generation at a time — the performer dispatches a single prompt and
// watches it crystallize. The latency IS the crystallization arc; we stream it,
// we don't fight it.

let generating = false

async function runGeneration(prompt, imgImg = false) {
  if (generating) { broadcast('generation-error', { message: 'busy — a form is still crystallizing' }); return }
  generating = true

  try {
    const config = comfyui.loadConfig()
    const { clean, modifierKey } = comfyui.parsePrompt(prompt, config)

    // Build graph — img2img uploads latest.png as the source latent seed.
    // Falls back to txt2img if no previous generation exists yet.
    let graph, mode
    if (imgImg && fs.existsSync(path.join(GENERATED, 'latest.png'))) {
      const imageName = await comfyui.uploadImage(fs.readFileSync(path.join(GENERATED, 'latest.png')))
      graph = comfyui.buildImg2Img(prompt, imageName, { steps: 4 })
      mode  = 'img2img'
    } else {
      graph = comfyui.buildTxt2Img(prompt, { steps: 4 })
      mode  = 'txt2img'
      if (imgImg) console.log('[bridge] img2img requested but no previous generation — using txt2img')
    }
    broadcast('generation-start', { prompt: clean, modifier: modifierKey, mode, t: Date.now() })
    console.log(`[bridge] ${mode}${modifierKey ? ` [@${modifierKey}]` : ''}: "${clean}"`)
    console.log(`[bridge] full prompt → ${graph['3'].inputs.text}`)

    const { promptId } = await comfyui.streamGeneration(graph, {
      onStep: ({ step = null, total = null, preview = null }) =>
        broadcast('step-preview', { step, total, preview }),
    })

    const png = await comfyui.fetchOutput(promptId)
    if (png) {
      fs.writeFileSync(path.join(GENERATED, 'latest.png'), png)
      const archiveDir = path.join(GENERATED, 'archive')
      fs.mkdirSync(archiveDir, { recursive: true })
      fs.writeFileSync(path.join(archiveDir, `${Date.now()}.png`), png)
    }

    broadcast('image-ready', { src: '/generated/latest.png', prompt })
    broadcast('generation-done', { prompt, promptId })
    console.log(`[bridge] done: "${prompt}"`)
  } catch (err) {
    console.error('[bridge] generation error:', err.message)
    broadcast('generation-error', { message: err.message })
  } finally {
    generating = false
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*' }

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end(); return
  }

  // GET /sketches — sorted sketch list
  if (req.method === 'GET' && req.url === '/sketches') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify(getSketchList())); return
  }

  // GET /sketches/<file>.js — serve sketch source (for the <script> loader + code overlay)
  if (req.method === 'GET' && req.url.startsWith('/sketches/')) {
    const abs = safeResolve(SKETCHES, req.url.slice('/sketches/'.length).split('?')[0])
    if (!abs || !abs.endsWith('.js')) { res.writeHead(403); res.end(); return }
    serveFile(res, abs, cors); return
  }

  // GET /events — SSE stream
  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      ...cors,
    })
    res.write('retry: 1000\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  // GET /generated/* — serve generated images
  if (req.method === 'GET' && req.url.startsWith('/generated/')) {
    const abs = safeResolve(GENERATED, req.url.slice('/generated/'.length).split('?')[0])
    if (!abs) { res.writeHead(403); res.end(); return }
    serveFile(res, abs, cors); return
  }

  // POST /prompt — trigger AI generation, stream previews back over SSE
  if (req.method === 'POST' && req.url === '/prompt') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      let prompt, imgImg = false
      try { ({ prompt, imgImg = false } = JSON.parse(body)) } catch (_) {
        res.writeHead(400, cors); res.end('Bad request'); return
      }
      if (!prompt || !prompt.trim()) {
        res.writeHead(422, cors); res.end('prompt required'); return
      }
      // Respond immediately; the actual arc plays out over the SSE stream.
      res.writeHead(202, { 'Content-Type': 'application/json', ...cors })
      res.end(JSON.stringify({ status: 'queued', prompt, imgImg: !!imgImg }))
      runGeneration(prompt.trim(), !!imgImg)
    }); return
  }

  // POST /sketch/:filename — overwrite a sketch from the browser editor; fs.watch picks it up
  if (req.method === 'POST' && req.url.startsWith('/sketch/')) {
    // Allow subfolder paths (vj/foo.js) but never escape SKETCHES.
    const abs = safeResolve(SKETCHES, req.url.slice('/sketch/'.length).split('?')[0])
    if (!abs || !abs.endsWith('.js')) { res.writeHead(403, cors); res.end('Forbidden'); return }
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      fs.writeFile(abs, body, 'utf-8', (err) => {
        if (err) { res.writeHead(500, cors); res.end(err.message); return }
        res.writeHead(204, cors); res.end()
      })
    }); return
  }

  res.writeHead(404); res.end('Not found')
})

// Ensure generated/ directory exists
if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true })

// Loopback only: this server has a write endpoint (POST /sketch/) whose payload
// executes in the performance browser — it must never be reachable from venue LANs.
server.listen(PORT, '127.0.0.1', () => {
  const libs = getSketchList()
  const count = Object.values(libs).reduce((n, l) => n + l.length, 0)
  console.log(`[watcher] ready → http://localhost:${PORT} (loopback only)`)
  console.log(`[watcher] watching  ${SKETCHES}`)
  const libNames = Object.keys(libs)
  console.log(`[watcher] ${count} sketch(es) in ${libNames.length} librar${libNames.length === 1 ? 'y' : 'ies'} (${libNames.join(', ')})`)
})

// ── File watcher ──────────────────────────────────────────────────────────────

let knownFiles = new Set(allSketchFiles())
const pending = {}

if (fs.existsSync(SKETCHES)) {
  // recursive: subfolder libraries (sketches/vj/…) hot-reload too. macOS supports
  // recursive fs.watch; filename arrives as a path relative to SKETCHES.
  fs.watch(SKETCHES, { recursive: true }, (event, filename) => {
    if (!filename || !filename.endsWith('.js')) return
    const rel = filename.split(path.sep).join('/')   // normalize for the browser
    clearTimeout(pending[rel])
    pending[rel] = setTimeout(() => {
      const currentFiles = new Set(allSketchFiles())
      const listChanged  = currentFiles.size !== knownFiles.size ||
                           [...currentFiles].some(f => !knownFiles.has(f))
      if (listChanged) {
        knownFiles = currentFiles
        broadcast('list-changed', { t: Date.now() })
        console.log(`[watcher] list changed — ${currentFiles.size} sketch(es)`)
      } else {
        broadcast('sketch-changed', { file: `./sketches/${rel}`, t: Date.now() })
        console.log(`[watcher] changed: ${rel} → ${clients.size} client(s)`)
      }
    }, 80)
  })
}
