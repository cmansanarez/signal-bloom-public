// hydra-datamosh — vendored from https://github.com/emptyflash/hydra-datamosh
// Adapted from codepen by Amagi: https://codepen.io/fand/pen/Vwojwqm
//
// Signal Bloom hardening (minimal, over the upstream version):
//   1. teardownDatamosh() — the upstream loop is a self-perpetuating rAF that,
//      together with its VideoEncoder/VideoDecoder, is never stopped. Editing the
//      mosh function or reloading a cache-clearing sketch (07) stacks a new loop +
//      codec pair every reload. We cancel the previous one before building the next.
//   2. Blackout re-bind — Hydra's hush() (the B key) calls source.clear() on every
//      source, nulling this one's src. The canvas + loop stay live, so on the next
//      reload we re-point the cached source at the canvas instead of returning a
//      dead source.
// Each build still creates a fresh Hydra source (matching upstream) — reusing a
// slot across rebuilds left the rebuilt pipeline black.

window.datamoshedSources = window.datamoshedSources || {}

function getKey(item) {
  if (typeof item === 'function') {
    return item.toString();
  }
  return item;
}

// Stop the active pipeline: cancel its render loop and release its codecs.
function teardownDatamosh() {
  const p = window._datamosh
  if (!p) return
  try { cancelAnimationFrame(p.raf) } catch (_) {}
  try { if (p.encoder && p.encoder.state !== 'closed') p.encoder.close() } catch (_) {}
  try { if (p.decoder && p.decoder.state !== 'closed') p.decoder.close() } catch (_) {}
  window._datamosh = null
}

export async function datamosh(inputSource, params) {
  const key = getKey(inputSource)

  // Cache hit — same mosh function still active. Re-bind if a blackout/hush()
  // nulled the source (its canvas + render loop are still live).
  const cached = window.datamoshedSources[key]
  if (cached) {
    if (!cached.src) {
      const c = document.getElementById("datamoshCanvas")
      if (c) await cached.init({ src: c })
    }
    return cached
  }

  // Cache miss — first run, edited function, or a sketch cleared the cache. Stop
  // the previous pipeline before building a new one so loops + codecs don't stack.
  teardownDatamosh()

  let source = inputSource;
  params = params || {};
  if (params.speed == null) params.speed = 2;
  const hydra = params.hydra || window.hydraSynth;

  if (typeof source === 'function') {
    if (!window.newHydra) {
      const newHydraCanvas = document.createElement("canvas");
      const newHydra = new Hydra({
        makeGlobal: false,
        autoLoop: false,
        detectAudio: false,
        canvas: newHydraCanvas,
      });
      window.newHydra = newHydra;
    }
    const datamoshSource = window.newHydra.createSource(window.newHydra.s.length);
    source(window.newHydra.synth)
    await datamoshSource.init({
      src: window.newHydra.canvas
    });
    source = datamoshSource;
  }

  const newSource = hydra.createSource(hydra.s.length);
  let canvas = document.getElementById("datamoshCanvas");
  const width = source.src?.videoWidth || source.src?.width || source.width
  const height = source.src?.videoHeight || source.src?.height || source.height
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("id", "datamoshCanvas")
  }
  await newSource.init({
    src: canvas
  })
  const ctx = canvas.getContext("2d");
  const encoder = new VideoEncoder({
    output: handleEncodedChunk,
    error: (err) => console.error("Encoder error:", err),
  });

  const decoder = new VideoDecoder({
    output: handleDecodedFrame,
    error: (err) => console.error("Decoder error:", err),
  });
  decoder.configure({
    codec: "vp8",
  });

  let lastFrame = performance.now()
  const fps = 60;
  const fpsInterval = 1000 / fps;

  // Track this build so the next rebuild can cancel exactly this loop + codecs.
  const state = { key, encoder, decoder, raf: 0 }
  window._datamosh = state

  function processFrame() {
    state.raf = requestAnimationFrame(processFrame);

    const now = performance.now();
    const dt = now - lastFrame;

    if (dt > fpsInterval) {
      if (window.newHydra) {
        window.newHydra.tick(dt);
      }
      if (source.src) {
        if (width > 0 && height > 0) {
          if (encoder.state === 'unconfigured') {
            canvas.width = width;
            canvas.height = height;
            encoder.configure({
              codec: "vp8",
              width,
              height,
              bitrate: 1_000_000,
            });
          }
          const frame = new VideoFrame(source.src, {
            timestamp: now * 1000,
          });
          encoder.encode(frame, {
            keyFrame: params.keyFrame
          });
          params.keyFrame = false;
          frame.close();
        }
      }
    }
    lastFrame = now;
  }

  function handleEncodedChunk(chunk) {
    if (chunk.type === "key") {
      decoder.decode(chunk);
    } else {
      const spd = Math.round(typeof params.speed === 'function' ? params.speed() : params.speed)
      for (let i = 0; i < spd; i++) {
        decoder.decode(chunk);
      }
    }
  }

  function handleDecodedFrame(frame) {
    ctx.drawImage(frame, 0, 0);
    frame.close();
  }

  processFrame();
  window.datamoshedSources[getKey(inputSource)] = newSource;
  return newSource;
}
