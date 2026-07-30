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

If one of the seven fails to load (missing file, bad path), `StarLayer.js`
logs a console warning and skips it — the rest still load and `G` shows
however many stars did load. It degrades per-file, not all-or-nothing.

## Using your own models

**Same count (7 files):** drop your `.glb` files in here with the same
filenames above (or different filenames, if you also update `GLB_PATHS` in
`src/StarLayer.js` to match) and restart `npm run dev`. If they render too
large or too small on first load, adjust `BASE_SCALE` near the top of
`StarLayer.js` — GLBs exported from different tools are often authored at
different real-world unit scales.

**Fewer than 7:** just shorten `GLB_PATHS` in `StarLayer.js` to match how
many files you have. `REST` (positions) and `EMISSIVE` (colors) can stay at
7 entries — extra entries are simply unused, no error.

**More than 7:** you also have to add a matching entry to both `REST` and
`EMISSIVE` in `StarLayer.js` for each new model — the load loop indexes all
three arrays together (`REST[i]`, `EMISSIVE[i]`), so a `GLB_PATHS` entry
past the end of either array throws at load time, not a graceful skip.
`REST` positions are hand-placed around the tunnel's inner ring; see
`MIN_XY_SEP` in `StarLayer.js` for the spacing they were tuned against.

Any mesh geometry works — no rigging, animation, or specific material setup
required, since materials get replaced at runtime (see above).
