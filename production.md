# Signal Bloom — Production Readiness & Beta Plan

*Audit date: 2026-07-18. Covers the production audit of the current codebase, recommendations
for open-source release, and the sequenced plan toward a public beta. Updated 2026-07-26 —
Step 2 complete. Updated 2026-07-27 — Cameron's call: no proprietary artistic sketches ship
publicly at all (superseding the curated-subset plan below); see `HANDOFF.md` and the current
`docs/public-sketch-list.md` for what replaced it.*

Signal Bloom is performance-proven (first live set: July 2026) and the code is in good shape.
What is **not** ready is the repository as a public artifact. The path to beta is less about
fixing code and more about packaging the instrument so a stranger can play it.

---

## 1. Audit Findings

### What's solid — don't touch

- **Bridge server** (`watcher.js`): path-traversal guards with boundary checks, single-generation
  lock, SSE client cleanup, debounced recursive file watching.
- **ComfyUI client** (`comfyui.js`): Node-native fetch/WebSocket (zero runtime npm deps for the
  bridge), 10-minute job timeout for Flux cold-start, actionable error messages.
- **Graceful degradation everywhere.** Mic denied → zero-filled FFT, boot continues. ComfyUI
  offline → status message, visuals keep running. Bad sketch → console error, interface survives.
  This is the beta on-ramp: **the system is fully usable with zero AI setup.**
- **Memory management**: `cleanupSketchMedia()` in `sketch-loader.js` tears down orphaned
  `<video>` decoders and MediaStreams on sketch switch — the fix for the runaway slowdown
  across long sets. Datamosh teardown releases VideoEncoder/Decoder pairs on reload.
- **Offline-first**: no CDN dependencies, vendored libs, localhost-only services. A performance
  needs no internet after install.

### Blockers for public release (ranked)

1. **Repo weight.** `.git` is ~884 MB — `videos/` (191 MB) and `images/` (195 MB) are tracked,
   plus history bloat from video re-compression commits. A contributor downloads ~1 GB for
   ~120 KB of source. Unfixable without history rewriting or a fresh repo → see §3.
2. ~~**No LICENSE.**~~ **Done 2026-07-27.** Releasing under **AGPL-3.0** — same license as Hydra,
   keeps derivatives open, matches the project's ethos. `LICENSE` now holds the verbatim AGPL-3.0
   text, downloaded directly from `gnu.org/licenses/agpl-3.0.txt` and diffed byte-for-byte against
   the placeholder's SPDX/copyright header — not freehand-reproduced.
3. ~~**Workflows hardcode the personal model stack.**~~ **Fixed 2026-07-26.** `comfyui.js` now
   builds the `LoraLoaderModelOnly` node into the graph only when `config.json` sets `loraName`;
   the base `workflows/*.json` wire the KSampler straight to the UNet loader. Verified both
   paths (with/without `loraName`) by dry-running `buildTxt2Img`/`buildImg2Img` against a live
   copy of `config.json`. `docs/comfyui-model-setup.md` documents the public Flux schnell
   downloads (GGUF unet, dual CLIP, VAE) with target directories and a verification checklist.
4. ~~**Network exposure.**~~ **Fixed 2026-07-18.** The bridge bound all interfaces with CORS `*`
   and a `POST /sketch/` endpoint whose payload executes in the performance browser — on venue
   Wi-Fi that was remote code execution. Now binds `127.0.0.1` only.
5. ~~**Sketch/asset coupling.**~~ **Superseded 2026-07-27.** The curated-subset plan from
   2026-07-26 (ship a handful of Cameron's actual sketches, asset-free ones only) is no longer
   the approach: Cameron's call is that none of his artistic/performance sketches ship publicly,
   full stop — being asset-free doesn't change that they're still his real creative work. All of
   `sketches/01-*.js`–`07-*.js` and `sketches/vj/` (33 files, including the rewritten `demo.js`)
   were removed from the working tree. In their place: five brand-new, generic Hydra teaching
   sketches with no connection to Cameron's show material (`sketches/01-hello-hydra.js` through
   `05-buffers-and-feedback.js`), covering the same syntax/hot-reload/audio-reactivity ground
   `demo.js` did. `docs/public-sketch-list.md` was rewritten to describe these instead.
   The `vj/26-lights-and-music.js` CC-BY-NC-SA-vs-AGPL license conflict noted below is moot as a
   result — that file no longer ships either way.
   **New, separate finding:** the curation also caught `assets/3D/polyhedron_02–08.glb` — flagged
   in `HANDOFF.md` as personal media alongside `assets/vid/` and `assets/img/`, but actually
   load-bearing (`src/StarLayer.js`'s star polyhedra, `G`/`R` keys). Cameron's call: delete them
   with the rest of `assets/` anyway; he's building 7 generic replacement `.glb` files to drop
   into `assets/3D/` (expected filenames documented in `assets/3D/README.md`) before Step 3.
   Until then `G` is a silent no-op — `StarLayer.load()`'s `Promise.all` never settles for a
   missing file (`loader.load()` has no `onError` callback) — a pre-existing gap, not something
   introduced today, worth a real fix (resolve-on-error) independent of this release prep.
6. ~~**Docs don't match the software.**~~ **Fixed 2026-07-26.** `README.md` rewritten
   quickstart-first (Tier 1 in under 5 minutes, no AI required) with the trust model and a
   Tier 2 pointer to `docs/comfyui-model-setup.md`. `CLAUDE.md`/`AGENTS.md` roadmap sections
   updated — all five phases marked complete instead of "ready to begin Phase 1", with a pointer
   to this document for current status.

### Small fixes

| Item | Status |
|---|---|
| Bridge binds `127.0.0.1` only | ✅ done 2026-07-18 |
| `package.json`: `engines >=22` (native WebSocket), `license`, `repository`, `description` | ✅ done |
| Removed unused `simplex-noise` dependency | ✅ done |
| `getSketchList().length` logged `undefined` (returns an object) | ✅ done |
| Stale root `libs/` deleted — `public/libs/` is the live copy (root `datamosh.js` predated the hardening) | ✅ done |
| `.vscode/settings.json` carries a Snyk org ID — harmless here, but exclude from the public repo | ✅ done |
| Update `CLAUDE.md`/`AGENTS.md` roadmap sections to current state | ✅ done 2026-07-26 |
| LoRA node conditional on `config.json`'s `loraName` | ✅ done 2026-07-26 |
| No proprietary sketches ship — 5 new generic teaching sketches replace the curated-subset plan | ✅ done 2026-07-27 |
| `docs/public-sketch-list.md` rewritten for the new sketch set + `docs/comfyui-model-setup.md` | ✅ done 2026-07-27 |
| `26-lights-and-music.js` license conflict (CC BY-NC-SA vs. planned AGPL) | moot — file doesn't ship |
| `assets/3D/*.glb` deleted with the rest of `assets/`; replacements pending (see §1, item 5) | ⏳ Cameron |

---

## 2. The Four Production Lenses

**Technical foundations.** Sound. One structural note to document rather than "fix": sketches
execute as trusted code (`<script>` injection, `new Function()`). That *is* the instrument —
live coding means executing code. The public README must state the trust model plainly:
*sketches are programs; only run sketches you've read.*

**UX & network conditions.** Offline-first *is* the network story — after install and model
download, the performance loop needs zero internet, which is a genuine venue-deployment
feature (venue Wi-Fi is always bad). The gap is first-run UX for strangers: a quickstart that
goes clone → visuals in under five minutes, with the AI path clearly marked optional.

**Testing & monitoring.** The thinnest area. Everything logs to the console and vanishes.
Two lightweight additions (no observability stack — this is an instrument, not a SaaS):

1. **Debug HUD** on a toggle key: FPS, generation timing, SSE connection state. Extend the
   existing audio-meter pattern.
2. **Session log**: the bridge appends JSONL events (sketch switches, generation
   start/duration/error, client connects) to `logs/session-[date].jsonl`. Turns performance
   simulations into reviewable data and gives beta testers something concrete to attach to
   bug reports.

**Performance & cost.** There are **no API costs by design** — generation is local and stays
that way. Document it as a feature: prompts never leave the machine; a 3-hour set costs
nothing. The real cost axis is compute: Flux schnell wants ~12 GB and Apple Silicon or a
decent GPU (reference rig: Mac mini M4 Pro, 24 GB — warm generations 15–30 s). Lighter
machines get no-AI mode, not cloud APIs.

---

## 3. Beta Strategy — Two Repos, One Instrument

### Private repo (this one) — the performance archive

Cameron's instrument as played: personal media, NoirMak LoRA, journals and conceptual writing,
generated archive. Never public. Artists' working files are not a distribution.

### Public repo (`signal-bloom`) — the instrument

Fresh history, a few MB to clone. Contents:

```
signal-bloom/
├── index.html
├── watcher.js  comfyui.js  config.json  vite.config.mjs  package.json
├── src/                 ← main.js, sketch-loader.js, HydraManager, MicInput, …
├── public/libs/         ← vendored hydra-synth, hydra-wrap, lib-cond, datamosh
├── sketches/            ← 5 generic teaching sketches, no proprietary content (docs/
│                          public-sketch-list.md), 01-hello-hydra.js first
│                          (comments matter: the code overlay displays them —
│                           the comments ARE the tutorial)
├── assets/3D/           ← star polyhedra .glb geometry — empty pending Cameron's generic
│                           replacements (see §1, item 5, and assets/3D/README.md)
├── workflows/           ← LoRA-optional txt2img.json / img2img.json — done
├── docs/                ← public-sketch-list.md + comfyui-model-setup.md — done;
│                           still needed: venue deployment checklist (Step 5)
├── LICENSE              ← AGPL-3.0 — verbatim text in place — done
└── README.md            ← quickstart-first rewrite — done
```

### Two beta tiers (matching the graceful degradation already in the code)

- **Tier 1 — visuals only** (everyone): clone → `npm install` → `npm run dev` → tunnel +
  Hydra + keyboard + live editing. No ComfyUI, no models, runs on old laptops. This tier
  yields most testers and most UX findings.
- **Tier 2 — full crystallization arc** (artists with capable hardware): documented
  ComfyUI + Flux schnell setup. Smaller group, deeper feedback.

### Tester recruitment

3–5 artists from the existing VJ community (Berlin circle as seed). One ask: **screen-record
your first 10 minutes.** First-run friction is the highest-value data.

---

## 4. Sequenced Production Plan

**Step 1 — Hardening (this repo, benefits live sets immediately)** ✅ *done 2026-07-18*
- [x] Loopback-only bind on the bridge
- [x] `package.json` metadata + Node 22 engines gate
- [x] Dead dependency + stale `libs/` cleanup
- [x] Sketch-count log fix
- [x] This document

**Step 2 — Public-readiness work** ✅ *done 2026-07-26, on branch `worktree-open-source-prep`*
- [x] LoRA-optional workflow builder (`comfyui.js` builds the LoRA node only when configured) —
      verified with a dry-run graph build against both a `loraName`-set and `loraName`-unset
      `config.json`, no ComfyUI required for the check
- [x] Curate/write the public demo sketch set — `docs/public-sketch-list.md`; `demo.js` rewritten
      from a stub into a real teaching sketch; two stale header comments fixed
- [x] README rewrite: quickstart first, thesis second; controls card; trust-model note
- [x] Model download doc: `docs/comfyui-model-setup.md` — exact files, target dirs, verification
      steps (repo-level references, not deep-linked URLs I couldn't verify)
- [x] Update `CLAUDE.md`/`AGENTS.md` current-state sections

This work happened in a **separate git worktree** at a sibling path outside the main project
folder (`../signal-bloom-open-source-prep`, branch `worktree-open-source-prep`) specifically so
none of it touched the files Cameron performs from — the original folder stayed on `main`,
byte-identical to what's on GitHub, for the entire duration. Merge into `main` when reviewed.

**Step 3 — Public repo assembly**
- [x] ~~Resolve the `26-lights-and-music.js` license question~~ — moot, file doesn't ship (§1,
      item 5)
- [x] Replace the `LICENSE` placeholder with the verbatim AGPL-3.0 text (§1, item 2)
- [x] Curate the working tree on `worktree-open-source-prep` (no `videos/`, `images/`, `assets/`
      personal media, journals, statement/liturgy/prompt docs, proprietary sketches) — this
      branch, done 2026-07-27
- [x] Scrub `.vscode/settings.json`'s Snyk org ID before it ships
- [ ] Cameron: drop 7 generic `.glb` replacements into `assets/3D/` (see §1, item 5)
- [ ] New folder, fresh `git init`, no shared history with `main` — see `HANDOFF.md`'s "Critical
      constraint" section for why this has to be a separate step from curating this branch
- [ ] New GitHub repo + remote (not `cmansanarez/Signal_Bloom`), push the fresh history
- [ ] Verify offline: clone on a second machine, `npm install`, full keyboard map, no-AI mode
- [ ] Tag `v0.1.0-beta`

**Step 4 — Beta**
- [ ] Recruit 3–5 testers (Tier 1), 1–2 with GPU (Tier 2)
- [ ] Collect first-10-minute recordings + session logs
- [ ] Triage into: onboarding friction / crashes / instrument-feel

**Step 5 — During beta (parallel)**
- [ ] Debug HUD (FPS, generation timing, SSE state)
- [ ] JSONL session logging in the bridge
- [ ] Venue deployment checklist → `docs/` (projector, OBS, BlackHole routing, firewall)

---

## 5. Security & Trust Model (to publish in the public docs)

- The bridge and ComfyUI listen on **loopback only**. Nothing Signal Bloom runs is reachable
  from the network. Performances are offline-safe by design.
- Sketches are **trusted code** — they execute with full page privileges. That is what a live
  coding instrument is. Read sketches before running them; treat a sketch file like a program,
  not a media file.
- Prompts, generations, and audio never leave the machine. There are no accounts, no
  telemetry, no cloud calls.
