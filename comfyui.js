// comfyui.js — Signal Bloom ↔ ComfyUI client (server-side, CommonJS)
//
// Required by watcher.js. Talks to ComfyUI over HTTP + WebSocket, streams one
// latent preview per denoising step, and returns the final PNG bytes.
//
// Uses Node-native fetch + WebSocket (Node 22+) so the performance system needs
// no extra npm install and stays offline-safe — ComfyUI itself is the only
// external process, reached on localhost.
//
// ComfyUI API surface used:
//   POST /prompt        → queue a workflow graph, returns { prompt_id }
//   GET  /history/:id   → completed node outputs (filename/subfolder/type)
//   GET  /view?...      → raw image bytes for a given output
//   WS   /ws?clientId=  → progress events + binary latent previews

const fs   = require('fs')
const path = require('path')

const HOST       = process.env.COMFYUI_HOST || 'localhost:8188'
const CLIENT_ID  = 'signal-bloom-bridge'
const WORKFLOWS  = path.join(__dirname, 'workflows')
const JOB_TIMEOUT_MS = 600_000  // 10 min: Flux cold-start loads 12GB; warm generations are ~15-30s

function randSeed() { return Math.floor(Math.random() * 2 ** 32) }

// Read + parse fresh on every call so the performer can edit the JSON between
// generations without restarting the bridge. Parsing yields a clean clone.
function loadWorkflow(name) {
  const file = path.join(WORKFLOWS, `${name}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// config.json holds the baked-in style prompt and img2img settings.
// Read fresh every generation so the performer can tweak it between sets.
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))
  } catch (_) {
    return { stylePrompt: '', imgImgDenoise: 0.65 }
  }
}

// Returns { clean, modifierKey, modifier } — strips @modifier prefix if present,
// falls back to config.activeModifier, or no modifier if neither is set.
function parsePrompt(text, config) {
  const match = text.match(/^@(\w+)\s+([\s\S]*)$/)
  const key   = match ? match[1] : (config.activeModifier || null)
  const clean = match ? match[2].trim() : text
  const mod   = (key && config.styleModifiers?.[key]) || ''
  return { clean, modifierKey: key || null, modifier: mod }
}

function fullPrompt(text, config) {
  const { clean, modifier } = parsePrompt(text, config)
  // Flux reads prompts through a T5 encoder as natural-language sequence — the
  // SD-era (subject:weight) attention syntax doesn't apply and can mis-tokenize.
  // The NoirmakStyle LoRA was trained with its trigger leading each caption, so
  // we lead with it (config.stylePrompt) and follow with the subject in plain text.
  return [config.stylePrompt, modifier, clean].filter(Boolean).join(', ')
}

// Splices a LoraLoaderModelOnly node between the model source and the KSampler
// — but only when config.json names one. The base workflow JSON wires the
// KSampler straight to the checkpoint/UNet loader, so public workflows (no
// loraName set) run with no LoRA and no ComfyUI node-not-found error. The node
// id is generated fresh so it can't collide with the workflow file's own numbering.
function applyStyleLora(graph, config, kSamplerId) {
  if (!config.loraName) return graph
  const maxId = Math.max(0, ...Object.keys(graph).map(Number))
  const loraId = String(maxId + 1)
  graph[loraId] = {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model:          graph[kSamplerId].inputs.model,
      lora_name:      config.loraName,
      strength_model: config.styleLoraStrength ?? 1.0,
    },
  }
  graph[kSamplerId].inputs.model = [loraId, 0]
  return graph
}

function buildTxt2Img(promptText, { steps = 4, width, height, seed } = {}) {
  const graph  = loadWorkflow('txt2img')
  const config = loadConfig()
  graph['5'].inputs.text  = fullPrompt(promptText, config)
  graph['8'].inputs.steps = steps
  graph['8'].inputs.seed  = (seed == null || seed < 0) ? randSeed() : seed
  if (width)  graph['6'].inputs.width  = width
  if (height) graph['6'].inputs.height = height
  applyStyleLora(graph, config, '8')
  return graph
}

// Upload a PNG buffer to ComfyUI's input directory via the REST API.
// Returns the filename ComfyUI assigned (use it in LoadImage node).
async function uploadImage(pngBuffer) {
  const form = new FormData()
  form.append('image', new Blob([pngBuffer], { type: 'image/png' }), 'signal-source.png')
  form.append('overwrite', 'true')
  const res = await fetch(`http://${HOST}/upload/image`, { method: 'POST', body: form })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ComfyUI image upload failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  const { name } = await res.json()
  return name
}

// img2img: start from an uploaded source image instead of noise.
// imageName must be the filename returned by uploadImage().
// denoise 0.0 = keep source exactly, 1.0 = pure txt2img — 0.65 is a good default.
function buildImg2Img(promptText, imageName, { steps = 4, seed, denoise } = {}) {
  const graph  = loadWorkflow('img2img')
  const config = loadConfig()
  graph['7'].inputs.image   = imageName
  graph['5'].inputs.text    = fullPrompt(promptText, config)
  graph['9'].inputs.steps   = steps
  graph['9'].inputs.seed    = (seed == null || seed < 0) ? randSeed() : seed
  graph['9'].inputs.denoise = denoise ?? config.imgImgDenoise ?? 0.65
  applyStyleLora(graph, config, '9')
  return graph
}

async function dispatchWorkflow(graph) {
  const res = await fetch(`http://${HOST}/prompt`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt: graph, client_id: CLIENT_ID }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ComfyUI rejected workflow (${res.status}): ${detail.slice(0, 300)}`)
  }
  const { prompt_id } = await res.json()
  return prompt_id
}

// Opens the WS first, then dispatches on open so we never miss the early
// progress/preview events. Resolves { promptId } when this prompt finishes.
// onStep receives { step, total } for the progress counter and { preview }
// (a data: URL) for each latent frame.
function streamGeneration(graph, { onStep = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let ws
    try {
      ws = new WebSocket(`ws://${HOST}/ws?clientId=${CLIENT_ID}`)
    } catch (err) {
      reject(new Error(`Could not open ComfyUI websocket on ${HOST} — is ComfyUI running? (${err.message})`))
      return
    }
    ws.binaryType = 'arraybuffer'

    let promptId = null
    let settled  = false
    const timer  = setTimeout(
      () => finish(reject, new Error(`ComfyUI generation timed out after ${JOB_TIMEOUT_MS / 1000}s`)),
      JOB_TIMEOUT_MS,
    )

    function finish(fn, arg) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch (_) {}
      fn(arg)
    }

    ws.addEventListener('open', async () => {
      try { promptId = await dispatchWorkflow(graph) }
      catch (err) { finish(reject, err) }
    })

    ws.addEventListener('error', () =>
      finish(reject, new Error(`ComfyUI websocket error on ${HOST} — is it running on :8188?`)))

    ws.addEventListener('message', (event) => {
      const data = event.data

      // Binary frame = latent preview. ComfyUI prefixes 8 bytes:
      // [0:4] event type, [4:8] image format (1 = JPEG, 2 = PNG). Strip it,
      // or the leading header corrupts the decoded image.
      if (typeof data !== 'string') {
        const buf = Buffer.from(data)
        if (buf.length <= 8) return
        const mime = buf.readUInt32BE(4) === 2 ? 'image/png' : 'image/jpeg'
        const b64  = buf.subarray(8).toString('base64')
        onStep({ preview: `data:${mime};base64,${b64}` })
        return
      }

      let msg
      try { msg = JSON.parse(data) } catch (_) { return }
      const d = msg.data || {}

      switch (msg.type) {
        case 'progress':
          onStep({ step: d.value, total: d.max })
          break
        case 'executing':
          // node === null marks the whole prompt complete
          if (d.node === null && (d.prompt_id === promptId || promptId == null)) {
            finish(resolve, { promptId: d.prompt_id || promptId })
          }
          break
        case 'execution_error':
          finish(reject, new Error(d.exception_message || 'ComfyUI execution error'))
          break
      }
    })
  })
}

// Pull the finished image bytes via /view so we never have to guess ComfyUI's
// output directory. Returns a Buffer, or null if no image surfaced.
async function fetchOutput(promptId) {
  const res = await fetch(`http://${HOST}/history/${promptId}`)
  if (!res.ok) return null
  const history = await res.json()
  const outputs = history[promptId]?.outputs || {}

  for (const nodeOutput of Object.values(outputs)) {
    const img = nodeOutput.images?.[0]
    if (!img) continue
    const qs = new URLSearchParams({
      filename:  img.filename,
      subfolder: img.subfolder || '',
      type:      img.type || 'output',
    })
    const imgRes = await fetch(`http://${HOST}/view?${qs}`)
    if (!imgRes.ok) return null
    return Buffer.from(await imgRes.arrayBuffer())
  }
  return null
}

module.exports = { buildTxt2Img, buildImg2Img, uploadImage, streamGeneration, fetchOutput, loadWorkflow, loadConfig, parsePrompt }
