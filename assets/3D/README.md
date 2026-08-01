# assets/3D/

*New here? Get Signal Bloom running first via the main
[README.md](../../README.md)'s Quickstart — this page assumes that's done.*

`src/PrimitiveLayer.js` loads seven `.glb` files (a common 3D model file
format, short for "glTF Binary") from this folder and floats them through
the tunnel (`G` to toggle visible, `R` to toggle rotation). This is an
example of dropping 3D geometry into the tunnel as a decorative layer —
swap these for whatever fits the piece you're building. Customizing this
means editing a few specific values in a JavaScript file — you don't need
to be a programmer to follow the steps below, just comfortable finding and
changing the lines described.

Filenames (must match `GLB_PATHS` in `src/PrimitiveLayer.js`):

```
signal-bloom-primitive-01.glb
signal-bloom-primitive-02.glb
signal-bloom-primitive-03.glb
signal-bloom-primitive-04.glb
signal-bloom-primitive-05.glb
signal-bloom-primitive-06.glb
signal-bloom-primitive-07.glb
```

Any low-poly geometry works — they're recolored per-primitive at runtime
(`EMISSIVE` in `PrimitiveLayer.js`) and don't need to ship with materials.

**Size note:** these seven files are ~242 MB combined (11.8–63.4 MB each) —
noticeably larger than "low-poly" implies, which makes this folder most of
what you're downloading when you clone this repository. If you're
replacing them with your own models, keeping individual files small (well
under 50 MB apiece) makes the repo faster for the next person to download.
Tools like `gltf-transform` can shrink `.glb` files considerably by
compressing the geometry (Draco or meshopt compression) and/or reducing
texture resolution, if that's ever worth doing here.

If one of the seven fails to load (missing file, bad path),
`PrimitiveLayer.js` logs a console warning and skips it — the rest still
load and `G` shows however many did load. It degrades per-file, not
all-or-nothing.

## Using your own models

**Same count (7 files):** drop your `.glb` files in here with the same
filenames above (or different filenames, if you also update `GLB_PATHS` in
`src/PrimitiveLayer.js` to match) and restart `npm run dev`. If they render
too large or too small on first load, adjust `BASE_SCALE` near the top of
`PrimitiveLayer.js` — GLBs exported from different tools are often authored
at different real-world unit scales.

**Fewer than 7:** just shorten `GLB_PATHS` in `PrimitiveLayer.js` to match
how many files you have. `REST` (positions) and `EMISSIVE` (colors) can
stay at 7 entries — extra entries are simply unused, no error.

**More than 7:** you also have to add a matching entry to both `REST` and
`EMISSIVE` in `PrimitiveLayer.js` for each new model — the load loop
indexes all three arrays together (`REST[i]`, `EMISSIVE[i]`), so a
`GLB_PATHS` entry past the end of either array throws at load time, not a
graceful skip. `REST` positions are hand-placed around the tunnel's inner
ring; see `MIN_XY_SEP` in `PrimitiveLayer.js` for the spacing they were
tuned against.

Any mesh geometry works — no rigging, animation, or specific material setup
required, since materials get replaced at runtime (see above).
