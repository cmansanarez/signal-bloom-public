# assets/3D/

`src/StarLayer.js` loads seven `.glb` models here to render the star
polyhedra in the tunnel (`G` to toggle visible, `R` to toggle rotation). The
originals were personal models and aren't part of this public release —
these are generic replacements added 2026-07-29.

Filenames (must match `GLB_PATHS` in `src/StarLayer.js`):

```
signal-bloom-primitive-01.glb
signal-bloom-primitive-02.glb
signal-bloom-primitive-03.glb
signal-bloom-primitive-04.glb
signal-bloom-primitive-05.glb
signal-bloom-primitive-06.glb
signal-bloom-primitive-07.glb
```

Any low-poly geometry works — they're recolored per-star at runtime
(`EMISSIVE` in `StarLayer.js`) and don't need to ship with materials.

**Size note:** these seven files are ~242 MB combined (11.8–63.4 MB each) —
noticeably larger than "low-poly" implies and larger than the personal
originals they replaced (~110 MB). Committing them as-is reintroduces the
repo-weight problem the fresh-history repo was built to avoid (884 MB → a
few hundred KB). Worth compressing (`gltf-transform` / Draco or meshopt,
or a texture-resolution pass) before this ships.

If any one of the seven is missing, `StarLayer.load()` hangs rather than
degrading gracefully — `loader.load()` has no `onError` callback, so a 404
never resolves its promise, and `G` silently does nothing. That's an
existing gap in `StarLayer.js`, not specific to these files.
