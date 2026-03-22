# vis4D — 3D–100D projection playground

Static page that projects points in **ℝ³, ℝ⁴, ℝ¹⁰**, or **ℝ¹⁰⁰** onto a **2D view plane** (orthonormal **u**, **v**). Rotate the plane with the sidebar **−** / **+** controls (hold for continuous steps), or use **Random view**, **PCA view** (three random non-origin points → 2D PCA alignment), and **Reset**. **Projection zoom** (− / 1× / +) scales the plot only.

**Live demo:** https://liusida.github.io/4D-Space-Explorer/

**Scenes:** unit axes (+ origin), **hypercube** {0,1}ᵈ (up to **10D**), or **random cloud** in **[−1,1]ᵈ**. **100D** exposes **six sampled** coordinate planes (out of 4 950); full knob grids are kept for lower dimensions.

**Run locally:** open `index.html`, or serve the folder (`python -m http.server`).

**Stack:** HTML, CSS, Canvas 2D, vanilla JS — no build.

**Hack on it:** Fork this repo, clone it locally, and open the folder in **Cursor** (or any editor with Copilot, Codeium, etc.). There’s no bundler—just `index.html`, `app.js`, and `styles.css`—so describing a change in chat is usually enough to iterate quickly.
