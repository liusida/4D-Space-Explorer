# vis4D — 4D Rotation Explorer

Small static page that projects the 4D origin and unit basis vectors **e1…e4** onto a **2D viewing plane** (orthonormal **u**, **v** in ℝ⁴). Use the sidebar to rotate that plane via the six coordinate planes (x1–x2 through x3–x4); hold **−** / **+** to step continuously. **Reset** restores the default view (dimensions 1 and 2).

**Run:** open `index.html` in a browser, or serve the folder (e.g. `python -m http.server`).

**Stack:** HTML, CSS, Canvas 2D, vanilla JavaScript — no build step.
