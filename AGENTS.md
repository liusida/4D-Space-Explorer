# Agent notes — vis4D

Handoff context for future work on this repo. User-facing overview lives in **README.md**.

## What this is

Single-page **Canvas 2D** demo: project high-dimensional points onto a rotating 2D plane (**u**, **v**). **No build** — edit `index.html`, `app.js`, `styles.css` only.

## Key files

| File | Role |
|------|------|
| `app.js` | Geometry, drawing, DOM, `DEMO_MODES`, scene modes, PCA, zoom, canvas sizing |
| `styles.css` | Layout, panels, knob grid, projection area, GitHub peel, scroll-safe background |
| `index.html` | Structure, controls, scene tabs, dimension tabs |

## Canvas layout (do not regress)

- **`#projectionCanvas` is in-flow inside `.canvas-wrap`**: flex child (`flex: 1`, `min-height: 0`, `width/height: 100%`), with **padding on `.canvas-wrap`** for the plot inset (`--projection-canvas-inset`).  
  **Do not** go back to `position: absolute` + `::before` aspect-ratio on the wrap alone — **Firefox** then mis-sizes the bitmap (tiny plot, wrong fallback).
- **`applyCanvasPixelSize`** sizes the bitmap from **`canvas.clientWidth/Height`**. Fallback uses **`getComputedStyle(wrap)` padding** to derive inner size (not `min(w,h)` when height was 0).
- **`resizeAllCanvases`** calls **`requestAnimationFrame`** once more after measure/render so flex + aspect-ratio can settle (Firefox).

## Page background / scrolling

- **`html`**: use **`min-height: 100%` / `100dvh`**, not **`height: 100%` only** — tall pages used to show a broken seam.
- **`body`**: solid **`background-color`** under the layered gradients.
- **`body::before`** grid overlay: use a **vertical linear `mask-image`** (and `-webkit-mask-image`), not a **viewport-centered radial** mask — avoids a harsh band when scrolling past the cards.
- **`.layout`**: **`position: relative; z-index: 1`** so content sits above `body::before` (`z-index: 0`).

## Projection panel width

- **`.canvas-stack`** uses **negative horizontal margins** + **`calc(100% + 2 * var(--vp-pad))`** so the plot uses the full viewer card width.
- **`.canvas-caption`** needs **`padding-inline: var(--vp-pad)`** so the caption lines up with the “Projection” header (stack is full-bleed).

## Domain / product rules (app.js)

- **Dimensions**: `activeMode` keys `"3" | "4" | "10" | "100"` in **`DEMO_MODES`**.
- **Hypercube**: only when **`dimensionsAllowHypercube`** — **`MAX_HYPERCUBE_DIM = 10`** (`2^d` vertices). Disable cube tab and guard `scenePoints` / `setScenePointMode` when above that.
- **100D rotations**: **`rotationPlanes`** is **`sampleRotationPlanesForHighDim(100, 6, seed)`** — six planes only; **`buildRotationPlanesForDim(100)`** is not stored (too many).
- **PCA**: three distinct points, **`isExcludedFromPcaPick`** (origin **O** and ~zero vectors). **`pcaTripleLabels`** drives highlight + readout; clear on reset / random / dimension / scene change.
- **Zoom**: **`projectionZoom`** multiplies the draw **`scaleFactor`**; reset on dimension change and sidebar reset; not necessarily on random/PCA.
- **Mulberry32** / **`readProjectionCanvasInsetPx`** was removed; inset is padding-only — don’t reintroduce duplicate inset logic in JS without reading **`measureProjectionCanvasCssSize`**.

## UI constants (CSS `:root`)

- **`--projection-canvas-size`**: max square side (e.g. `min(1100px, 92dvh)`).
- **`--projection-canvas-inset`**: inner padding around the canvas inside the wrap.
- **`--vp-pad`**: viewer panel padding; used for bleed math and caption alignment.

## GitHub peel

Fixed corner link in **`index.html`** + **`.github-peel`** in CSS → **https://github.com/liusida/4D-Space-Explorer**

## When changing things

- Prefer **small, focused diffs**; match existing style (vanilla JS, no frameworks).
- After canvas or flex layout changes, **check Firefox** and **scroll** the full page height.
- If you add README-only user hints, **README.md** is enough; keep this file for **agent-facing** pitfalls and invariants.
