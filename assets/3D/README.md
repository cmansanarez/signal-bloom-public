# assets/3D/

`src/StarLayer.js` loads seven `.glb` models here to render the star
polyhedra in the tunnel (`G` to toggle visible, `R` to toggle rotation). The
originals were personal models and aren't part of this public release —
this directory is a placeholder until generic replacements are added.

Expected filenames (must match `GLB_PATHS` in `src/StarLayer.js`):

```
polyhedron_02.glb
polyhedron_03.glb
polyhedron_04.glb
polyhedron_05.glb
polyhedron_06.glb
polyhedron_07.glb
polyhedron_08.glb
```

Any low-poly geometry works — they're recolored per-star at runtime
(`EMISSIVE` in `StarLayer.js`) and don't need to ship with materials.

Until these exist, `StarLayer.load()` will hang waiting on the missing
files (`loader.load()` has no `onError` callback, so a 404 never resolves
its promise) — the `G` key will do nothing rather than failing loudly. That
follows from an existing StarLayer.js gap, not something specific to this
placeholder.
