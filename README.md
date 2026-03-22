# vis4D — 3D–100D projection playground

Static page that projects points in **ℝ³, ℝ⁴, ℝ¹⁰**, or **ℝ¹⁰⁰** onto a **2D view plane** (orthonormal **u**, **v**). Rotate the plane with the sidebar **−** / **+** controls (hold for continuous steps), or use **Random view**, **PCA view** (three random non-origin points → 2D PCA alignment), and **Reset**. **Projection zoom** (− / 1× / +) scales the plot only.

**Live demo:** https://liusida.github.io/4D-Space-Explorer/

**Scenes:** unit axes (+ origin), **hypercube** {0,1}ᵈ (up to **10D**), or **random cloud** in **[−1,1]ᵈ**. **100D** exposes **six sampled** coordinate planes (out of 4 950); full knob grids are kept for lower dimensions.

**Run locally:** open `index.html`, or serve the folder (`python -m http.server`).

**Stack:** HTML, CSS, Canvas 2D, vanilla JS — no build.

## URL state arguments

You can set (and share) an exact explorer state via query params:

- `m`: dimension mode (`3`, `4`, `10`, `100`)
- `s`: scene (`axes`, `cube`, `cloud`)
- `e`: wireframe edges toggle (`1` or `0`)
- `h`: rotation-plane hint toggle (`1` or `0`)
- `c`: projection coordinates toggle (`1` or `0`)
- `z`: projection zoom (number)
- `u`: comma-separated `u` vector components (must match active dimension)
- `v`: comma-separated `v` vector components (must match active dimension)

Example:

`?m=4&s=cube&e=1&h=0&c=1&z=1.2&u=1,0,0,0&v=0,1,0,0`

When you interact with controls, the URL is updated with the current state (`history.replaceState`) so edge cases can be copied/reopened exactly.

**Hack on it:** Fork this repo, clone it locally, and open the folder in **Cursor** (or any editor with Copilot, Codeium, etc.). There’s no bundler—just `index.html`, `app.js`, and `styles.css`—so describing a change in chat is usually enough to iterate quickly.
