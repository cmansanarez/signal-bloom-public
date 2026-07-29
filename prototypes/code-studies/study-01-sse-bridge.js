/**
 * Signal Bloom — SSE Bridge Server
 * study-01-sse-bridge.js
 *
 * Extends NoirMak's watcher.js with:
 *   POST /prompt  → dispatches to ComfyUI, streams step previews back via SSE
 *   GET  /events  → SSE stream (sketch-changed, step-preview, image-ready)
 *
 * Run: node bridge.js
 * Port: 3001 (same as NoirMak watcher.js)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildTxt2ImgWorkflow, streamGenerationSteps, dispatchWorkflow } =
  require('./study-02-comfyui-websocket');

const PORT = 3001;
const GENERATED_DIR = path.join(__dirname, '..', 'generated');
const SKETCHES_DIR = path.join(__dirname, '..', 'sketches');

// ─── SSE Client Pool ───────────────────────────────────────────────────────

const clients = new Set();

function broadcast(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) { clients.delete(res); }
  }
}

// ─── File Watcher (from NoirMak watcher.js) ────────────────────────────────

let sketchList = [];

function loadSketchList() {
  try {
    sketchList = fs.readdirSync(SKETCHES_DIR)
      .filter(f => f.endsWith('.js'))
      .sort();
  } catch (_) { sketchList = []; }
}

loadSketchList();

fs.watch(SKETCHES_DIR, { persistent: true }, debounce((eventType, filename) => {
  const prevList = [...sketchList];
  loadSketchList();

  const listChanged = JSON.stringify(prevList) !== JSON.stringify(sketchList);

  if (listChanged) {
    broadcast('list-changed', { sketches: sketchList });
  } else if (filename) {
    broadcast('sketch-changed', { file: filename, ts: Date.now() });
  }
}, 80));

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ─── ComfyUI Bridge ────────────────────────────────────────────────────────

async function runGeneration(prompt) {
  broadcast('generation-start', { prompt });

  const workflow = buildTxt2ImgWorkflow(prompt, { steps: 8 });
  const promptId = await dispatchWorkflow(workflow);

  await streamGenerationSteps(promptId, {
    onStep: ({ step, total, preview }) => {
      broadcast('step-preview', { step, total, preview: preview || null });
    },
    onComplete: async () => {
      const outputPath = await fetchOutputPath(promptId);
      if (outputPath) {
        const dest = path.join(GENERATED_DIR, 'latest.png');
        fs.copyFileSync(outputPath, dest);

        const timestamp = Date.now();
        const archive = path.join(GENERATED_DIR, 'archive', `${timestamp}.png`);
        fs.mkdirSync(path.dirname(archive), { recursive: true });
        fs.copyFileSync(outputPath, archive);
      }
      broadcast('image-ready', { src: '/generated/latest.png', prompt });
      broadcast('generation-done', { prompt, promptId });
    },
  });
}

async function fetchOutputPath(promptId) {
  const res = await fetch(`http://localhost:8188/history/${promptId}`);
  const history = await res.json();
  const outputs = history[promptId]?.outputs;
  if (!outputs) return null;

  for (const nodeOutputs of Object.values(outputs)) {
    if (nodeOutputs.images?.[0]) {
      const { filename, subfolder } = nodeOutputs.images[0];
      return path.join(
        process.env.COMFYUI_OUTPUT_DIR || path.join(process.env.HOME, 'ComfyUI', 'output'),
        subfolder,
        filename
      );
    }
  }
  return null;
}

// ─── HTTP Server ───────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.mp4':  'video/mp4',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // SSE endpoint
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ sketches: sketchList })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // POST /prompt
  if (req.method === 'POST' && url.pathname === '/prompt') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      let prompt;
      try { ({ prompt } = JSON.parse(body)); } catch (_) {
        res.writeHead(400); res.end('invalid JSON'); return;
      }
      if (!prompt?.trim()) {
        res.writeHead(422); res.end('prompt required'); return;
      }
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'queued', prompt }));
      runGeneration(prompt.trim()).catch(err =>
        broadcast('generation-error', { message: err.message })
      );
    });
    return;
  }

  // Static file serving
  const ROOT = path.join(__dirname, '..');
  const filePath = path.normalize(
    path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname)
  );

  // Reject anything that resolves outside ROOT. path.relative returns '' or a
  // sub-path when filePath is inside ROOT; a leading '..' (or an absolute path)
  // means it escaped — unlike startsWith(), this can't be fooled by a sibling
  // directory that merely shares ROOT's name as a prefix (e.g. `<root>-evil`).
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, 'localhost', () => {
  console.log(`Signal Bloom bridge running at http://localhost:${PORT}`);
  console.log(`ComfyUI expected at http://localhost:8188`);
});
