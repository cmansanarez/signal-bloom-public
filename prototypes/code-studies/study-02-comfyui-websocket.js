/**
 * Signal Bloom — ComfyUI WebSocket Integration
 * study-02-comfyui-websocket.js
 *
 * Dispatches LCM txt2img workflows to ComfyUI and streams
 * latent preview frames back per denoising step.
 *
 * ComfyUI API endpoints used:
 *   POST http://localhost:8188/prompt          → queue a workflow
 *   GET  http://localhost:8188/history/:id     → fetch completed output paths
 *   WS   ws://localhost:8188/ws?clientId=...  → receive step events + previews
 */

const WebSocket = require('ws');

const COMFYUI_HOST = 'localhost:8188';
const CLIENT_ID = 'signal-bloom-bridge';

// ─── Dispatch Workflow ─────────────────────────────────────────────────────

async function dispatchWorkflow(workflowJson) {
  const res = await fetch(`http://${COMFYUI_HOST}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflowJson, client_id: CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`ComfyUI dispatch failed: ${res.status}`);
  const { prompt_id } = await res.json();
  return prompt_id;
}

// ─── Stream Generation Steps ───────────────────────────────────────────────

function streamGenerationSteps(promptId, { onStep, onComplete }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${COMFYUI_HOST}/ws?clientId=${CLIENT_ID}`);

    ws.on('error', reject);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (_) {
        // ComfyUI sends binary latent previews — base64 encode for SSE
        if (raw instanceof Buffer) {
          const b64 = raw.toString('base64');
          onStep({ step: null, total: null, preview: b64 });
        }
        return;
      }

      switch (msg.type) {
        // Per-step progress counter
        case 'progress':
          onStep({ step: msg.data.value, total: msg.data.max, preview: null });
          break;

        // Latent preview image (JPEG bytes as base64)
        case 'b_preview':
          onStep({ step: null, total: null, preview: msg.data });
          break;

        // Execution complete for this node → if node === null, full workflow done
        case 'executing':
          if (msg.data.prompt_id === promptId && msg.data.node === null) {
            ws.close();
            onComplete({ promptId });
            resolve();
          }
          break;

        // ComfyUI error during generation
        case 'execution_error':
          ws.close();
          reject(new Error(msg.data.exception_message || 'ComfyUI execution error'));
          break;
      }
    });
  });
}

// ─── LCM txt2img Workflow Builder ──────────────────────────────────────────
//
// Minimal 7-node workflow using an LCM-compatible checkpoint.
// Node IDs are arbitrary strings — ComfyUI matches them by key.
//
// Tested with: DreamShaper-XL-v2-Turbo or any LCM LoRA + base model.
// For Apple MPS: use SD 1.5 + LCM LoRA for best speed.

function buildTxt2ImgWorkflow(promptText, { steps = 8, width = 512, height = 512, seed = -1 } = {}) {
  return {
    // Load checkpoint model
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "dreamshaper_8LCM.safetensors" }
    },
    // Empty latent image (starting noise)
    "2": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 }
    },
    // Positive text conditioning
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: promptText, clip: ["1", 1] }
    },
    // Negative text conditioning
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "blurry, low quality, distorted, watermark, text",
        clip: ["1", 1]
      }
    },
    // KSampler — LCM requires lcm sampler + lcm scheduler
    "5": {
      class_type: "KSampler",
      inputs: {
        model:        ["1", 0],
        positive:     ["3", 0],
        negative:     ["4", 0],
        latent_image: ["2", 0],
        sampler_name: "lcm",
        scheduler:    "lcm",
        steps,
        cfg:          1.5,
        denoise:      1.0,
        seed:         seed === -1 ? Math.floor(Math.random() * 2 ** 32) : seed,
      }
    },
    // Decode latent → pixel space
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] }
    },
    // Save output PNG (ComfyUI writes to its /output folder)
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "signal-bloom" }
    }
  };
}

// ─── img2img Workflow Builder (for feedback loop) ──────────────────────────
//
// Takes a base64 PNG (e.g. a Hydra canvas screenshot) and mutates it.
// denoise < 1.0 preserves more of the original structure.

function buildImg2ImgWorkflow(promptText, imageBase64, { steps = 6, denoise = 0.6 } = {}) {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "dreamshaper_8LCM.safetensors" }
    },
    // Load image from base64 string
    "2": {
      class_type: "ETN_LoadImageBase64",
      inputs: { image: imageBase64 }
    },
    // Encode loaded image into latent space
    "3": {
      class_type: "VAEEncode",
      inputs: { pixels: ["2", 0], vae: ["1", 2] }
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: promptText, clip: ["1", 1] }
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, low quality, distorted", clip: ["1", 1] }
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        model:        ["1", 0],
        positive:     ["4", 0],
        negative:     ["5", 0],
        latent_image: ["3", 0],
        sampler_name: "lcm",
        scheduler:    "lcm",
        steps,
        cfg:          1.5,
        denoise,
        seed:         Math.floor(Math.random() * 2 ** 32),
      }
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] }
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "signal-bloom-img2img" }
    }
  };
}

module.exports = { dispatchWorkflow, streamGenerationSteps, buildTxt2ImgWorkflow, buildImg2ImgWorkflow };
