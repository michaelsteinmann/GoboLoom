# GoboLoom

Source: <https://github.com/michaelsteinmann/GoboLoom> · Live: <https://michaelsteinmann.github.io/GoboLoom/>

Design multi-gobo projection installations in the browser. Upload an SVG made of solid-color
fills; GoboLoom separates it into one mask per color, simulates one gobo projector per color in a
3D room, and additively composites their projections on the designated wall.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (geometry, color parsing, project files)
npm run build    # site in dist/ (incl. sw.js and gobo-loom-offline.html)
```

Click **Sample** for an alpine sunset projected by three red, green and blue gobos (their overlaps
mix into yellow, cyan, magenta and white), **RGB demo** for three overlapping circles, or **Logo**.
You can also drop an `.svg` or a saved `.json` project onto the window.

## Offline use

- **Hosted site:** a service worker (`sw.js`, generated at build time) caches the whole app on the
  first visit. After that, normal reloads and later visits work without a network. The toolbar
  shows **Offline ready**.
- **Hard reload (Ctrl+F5 / Shift+reload):** browsers skip the service worker for hard reloads, so
  a hard reload while offline shows the browser's error page. Nothing on the site can change
  that. A hard reload while online is fine: offline use keeps working afterwards.
- **Offline copy:** clicking the **Offline ready** indicator downloads `gobo-loom-offline.html`, a single
  self-contained file (built with `vite build --mode offline`). Opened from disk it needs no
  network at all and survives any reload.

## How the projection works

All coordinates use the **surface frame**: origin at the projection-wall center, +x right, +y up,
+z into the room (the wall is the plane z = 0). Gobo positions and aim points are stored in it.

Each gobo is a virtual perspective projector (position, aim point, beam angle, roll) with a
**round aperture** (default Ø 64 mm image area, editable per gobo), so beams are cones with elliptical
footprints on the wall.
Rendering happens in two stages:

1. **Slide pass** (`slideFrag`, one 2048² render target per gobo): renders what is physically on
   the gobo. With *pre-correction* on, every slide pixel is cast through the **baked** projector
   pose onto the wall and takes the mask value of the artwork there, so the slide is
   inverse-keystoned. Without it, the raw mask is fitted into the slide. Calibration (warp,
   offset, rotation, scale, feather) is applied on top.
2. **Wall pass** (`layerFrag`, one additive mesh per gobo): samples the slide with projective
   texture coordinates from the **live** projector camera.

If the live pose equals the baked pose, the composite is geometrically exact. Move a gobo
without re-baking and you see the real-time distortion a physical rig would show. **Live**
mode re-bakes continuously. **Export slides** downloads the pre-distorted slides as PNGs for
fabrication (2048 px across the gobo diameter); **Report** downloads a CSV of placements,
incidence angles and keystone.

The **Previews** strip shows each gobo's slide live as a round disk (steel where light is blocked,
light color where it passes), with the artwork's physical size on the gobo in mm and a warning
when the round aperture clips the artwork.

Masks are rasterized with every shape painted in document order. In **Occlude** mode a layer's
shapes are white and all others black, so the masks partition the artwork. In **Mix light** mode
(auto-selected when the SVG uses `mix-blend-mode: screen`) each mask keeps its color's full shapes
so overlapping light adds up, and black shapes cut light out of every layer.

## Scope (v1)

- Flat rectangular projection wall only. The other room surfaces receive no light.
- Solid fills only. Gradients, patterns, images, strokes, filters, `<use>` and transparency
  are ignored, and a warning lists them. Black fills can't be made with light, so they stay unlit.
- SVGs are sanitized: scripts, event handlers and external references are stripped.
- Physical falloff (inverse-square × cosine) is optional and normalized at each aim point.

## Layout

| Path | Role |
| --- | --- |
| `src/lib/geometry.ts` | projector cameras, footprints, incidence/keystone metrics, beam fitting |
| `src/lib/svg.ts` | SVG validation, sanitizing, color extraction, mask rasterization |
| `src/lib/project.ts` | JSON project save/load with validation |
| `src/three/shaders.ts` | slide, projection-layer, wall and overlay GLSL |
| `src/three/SceneController.ts` | room, gobo views, beams, drag/selection, view modes |
| `src/store.ts` | Zustand state and actions |
| `src/components/` | React UI |
