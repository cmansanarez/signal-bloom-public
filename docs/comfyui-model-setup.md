# ComfyUI Model Setup (Tier 2 — AI generation)

Signal Bloom's tunnel, Hydra textures, and keyboard-driven performance system
(Tier 1) need **none of this**. This doc is only for the AI crystallization arc
(Tier 2): typing a prompt and watching a form resolve out of noise.

This is the more technical half of setting up Signal Bloom — it involves
installing a second program (ComfyUI, a separate open-source tool for
running AI image models) and downloading several gigabytes of model files.
If terms like "GPU" or "VRAM" below are unfamiliar: VRAM is the dedicated
memory on a graphics card, separate from your computer's regular RAM, and
it's what actually holds the AI model while it runs — this is the spec
that determines whether this tier works well on a given machine.

## Requirements

- **ComfyUI** installed and runnable locally — see the [ComfyUI repo](https://github.com/comfyanonymous/ComfyUI)
  for install instructions for your platform.
- **Apple Silicon (M-series) or an NVIDIA GPU with ~12+ GB VRAM.** Intel Macs
  and CPU-only machines can run ComfyUI but generation drops to 60–120+
  seconds per image — the live streaming arc isn't viable at that speed; see
  `AGENTS.md`'s hardware note for a fallback approach.
- **~12–15 GB free disk** for the model files below.
- The **[ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)** custom node
  (a community-made plugin that adds support for GGUF-format models —
  provides the `UnetLoaderGGUF` node `workflows/txt2img.json` and
  `workflows/img2img.json` use). Install via ComfyUI Manager, or clone it into
  `ComfyUI/custom_nodes/`. Every other node in the workflow files
  (`DualCLIPLoader`, `VAELoader`, `FluxGuidance`, `KSampler`, etc.) ships in
  current ComfyUI core, no extra install needed.

## Files to download

Signal Bloom's default workflows run **Flux.1 schnell**, an image-generation
AI model, compressed ("quantized") to the GGUF format to run faster and take
up less space, plus its text encoders and VAE (two supporting model files
Flux needs alongside the main one). Search [Hugging Face](https://huggingface.co/)
(a site that hosts AI model files for download, similar in spirit to how
GitHub hosts code) for these — repo names below, exact filenames must match
what's in `workflows/*.json` (or edit the JSON to match whatever you
download):

| Workflow field | What it is | Where to look |
|---|---|---|
| `flux1-schnell-Q4_K_S.gguf` | Quantized Flux.1 schnell UNet | [`city96/FLUX.1-schnell-gguf`](https://huggingface.co/city96/FLUX.1-schnell-gguf) on Hugging Face — pick the `Q4_K_S` quantization (~6–7 GB) for the speed/quality balance this project is tuned for. Other quantizations work too; larger = slower + better quality. |
| `clip_l.safetensors` | CLIP-L text encoder | [`comfyanonymous/flux_text_encoders`](https://huggingface.co/comfyanonymous/flux_text_encoders) (~250 MB) |
| `t5xxl_fp8_e4m3fn.safetensors` | T5-XXL text encoder (fp8) | Same repo, `comfyanonymous/flux_text_encoders` (~5 GB). The fp8 variant is the one to use — the fp16 version is ~2× the size for a marginal quality gain and isn't necessary here. |
| `ae.safetensors` | Flux VAE | Same repo, `comfyanonymous/flux_text_encoders`, or the official `black-forest-labs/FLUX.1-schnell` repo (~168 MB) |

Place each file in the ComfyUI directory its loader node expects:

```
ComfyUI/
├── models/
│   ├── unet/               ← flux1-schnell-Q4_K_S.gguf
│   ├── clip/                ← clip_l.safetensors, t5xxl_fp8_e4m3fn.safetensors
│   └── vae/                 ← ae.safetensors
```

(GGUF unet files sometimes go in `models/unet/` vs `models/diffusion_models/`
depending on your ComfyUI-GGUF version — check that node's README if
`UnetLoaderGGUF` doesn't see the file in ComfyUI's dropdown.)

## Optional: your own style LoRA

`config.json`'s `loraName` field is optional — leave it unset (or omit it) and
generation runs on base Flux schnell with no LoRA. If you train or download
your own style LoRA, drop the `.safetensors` file in `ComfyUI/models/loras/`
and set in `config.json`:

```json
"loraName": "YourLora.safetensors",
"styleLoraStrength": 0.8
```

`comfyui.js` only builds the LoRA node into the graph when `loraName` is set —
look for `LoraLoaderModelOnly` in that file if you're curious how it works.

## Verifying the setup

1. Start ComfyUI: `cd ~/ComfyUI && python main.py` (add `--use-mps-device` on
   Apple Silicon). Wait for `Starting server` on `127.0.0.1:8188`.
2. Start Signal Bloom: `npm run dev`, open `http://localhost:5173`.
3. Press `P`, type a short prompt, hit `Enter`.
4. Watch the terminal running `npm run dev` — a successful run logs
   `[bridge] txt2img: "..."` followed by `full prompt → ...`. A WebSocket
   error there means ComfyUI isn't reachable on `:8188` yet.
5. In the browser, the prompt status should read `summoning…` → `crystallizing
   N/4` → `formed`, and a shape should resolve out of noise in the tunnel.

First generation is slow (Flux cold-start loads ~12 GB into memory/VRAM).
Warm generations after that run in roughly 15–30 seconds on Apple Silicon
(reference: an M4 Pro Mac mini with 24 GB unified memory).
