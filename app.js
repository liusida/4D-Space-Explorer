const ROTATION_STEP = 0.08;
const HOLD_REPEAT_MS = 70;

const PROJECTION_ZOOM_MIN = 0.35;
const PROJECTION_ZOOM_MAX = 3.5;
const PROJECTION_ZOOM_FACTOR = 1.18;

/** 2ᵈ vertices; hypercube scene is only offered up to this D (10 → 1 024 verts). */
const MAX_HYPERCUBE_DIM = 10;

/** Clamp half-range for signed depth n₁·p on unit axes: |eᵢ·n₁| ≤ 1. Hypercube / cloud use √(dim) in sceneDepthRefNorm(). */
const DEPTH_RADIUS_REF_NORM = 1;

/** Dot radius multiplier: far (max ‖n·p‖ / out-of-plane) → min, near → max. */
const DEPTH_DOT_MULT_MIN = 0.32;
const DEPTH_DOT_MULT_MAX = 1;

const AXIS_PALETTE = [
  "#e0562a",
  "#179c8f",
  "#5876ff",
  "#cc4bc2",
  "#c9a227",
  "#2d9f6b",
  "#b84d9d",
  "#3d7ab8",
  "#d4743b",
  "#5c6b7a",
];

function standardBasisVector(dim, axisIndex) {
  return Array.from({ length: dim }, (_, j) => (j === axisIndex ? 1 : 0));
}

function buildRotationPlanesForDim(n) {
  const planes = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      planes.push({ label: `x${i + 1}-x${j + 1}`, axes: [i, j] });
    }
  }
  return planes;
}

/** Map linear index in lex order (x1-x2, x1-x3, …, x99-x100) to one plane. */
function rotationPlaneAtLinearIndex(n, k) {
  const max = (n * (n - 1)) / 2;
  if (k < 0 || k >= max) {
    return null;
  }
  let i = 0;
  let rem = k;
  while (i < n) {
    const rowLen = n - i - 1;
    if (rem < rowLen) {
      const j = i + 1 + rem;
      return { label: `x${i + 1}-x${j + 1}`, axes: [i, j] };
    }
    rem -= rowLen;
    i += 1;
  }
  return null;
}

/** A small random subset of coordinate planes (no full C(n,2) list). */
function sampleRotationPlanesForHighDim(n, count, seed) {
  const max = (n * (n - 1)) / 2;
  if (max <= count) {
    return buildRotationPlanesForDim(n);
  }
  const rand = mulberry32(seed >>> 0);
  const seen = new Set();
  const picked = [];
  let guard = 0;
  while (picked.length < count && guard < count * 80) {
    guard += 1;
    const k = Math.floor(rand() * max);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    const plane = rotationPlaneAtLinearIndex(n, k);
    if (plane) {
      picked.push(plane);
    }
  }
  return picked.sort((a, b) => a.label.localeCompare(b.label));
}

function buildAxisPointsForDim(n) {
  const points = [{ label: "O", vector: Array(n).fill(0), color: "#101820" }];
  for (let i = 0; i < n; i += 1) {
    points.push({
      label: `e${i + 1}`,
      vector: standardBasisVector(n, i),
      color: AXIS_PALETTE[i % AXIS_PALETTE.length],
    });
  }
  return points;
}

function defaultPlaneXY(n) {
  return {
    u: standardBasisVector(n, 0),
    v: standardBasisVector(n, 1),
  };
}

function popcount(mask) {
  let n = 0;
  let m = mask >>> 0;
  while (m) {
    n += m & 1;
    m >>>= 1;
  }
  return n;
}

/** All 2ᵈ vertices of the unit hypercube in ℝᵈ (coordinates 0 or 1). */
function hypercubeScenePoints(dim) {
  const nVerts = 1 << dim;
  const pts = [];
  for (let mask = 0; mask < nVerts; mask += 1) {
    const vector = Array.from({ length: dim }, (_, k) => (mask >> k) & 1);
    const label =
      dim <= 4
        ? Array.from({ length: dim }, (_, k) => String((mask >> k) & 1)).join("")
        : String(mask);
    pts.push({
      label,
      vector,
      color: AXIS_PALETTE[popcount(mask) % AXIS_PALETTE.length],
    });
  }
  return pts;
}

function hypercubeEdgeIndexPairs(dim) {
  const n = 1 << dim;
  const pairs = [];
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < dim; k += 1) {
      const j = i ^ (1 << k);
      if (j > i) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

/** "axes" | "cube" | "cloud" — which point set is projected. */
let scenePointMode = "axes";
let cloudCacheDim = -1;
let cloudCachePoints = null;

function dimensionsAllowHypercube(dim) {
  return dim <= MAX_HYPERCUBE_DIM;
}

function scenePoints() {
  if (scenePointMode === "cube") {
    if (!dimensionsAllowHypercube(cfg().dimensions)) {
      return cfg().points;
    }
    return hypercubeScenePoints(cfg().dimensions);
  }
  if (scenePointMode === "cloud") {
    return getCloudPoints();
  }
  return cfg().points;
}

function sceneEdgePairs(points) {
  if (scenePointMode === "cloud") {
    return [];
  }
  const dim = cfg().dimensions;
  if (scenePointMode === "cube" && dimensionsAllowHypercube(dim) && points.length === 1 << dim) {
    return hypercubeEdgeIndexPairs(dim);
  }
  return frameEdgeIndexPairs(points.length);
}

function sceneDepthRefNorm() {
  const dim = cfg().dimensions;
  if (scenePointMode === "cube" || scenePointMode === "cloud") {
    return Math.sqrt(dim);
  }
  return DEPTH_RADIUS_REF_NORM;
}

const DEMO_MODES = {
  "3": {
    dimensions: 3,
    createDefaultPlane: () => defaultPlaneXY(3),
    points: buildAxisPointsForDim(3),
    rotationPlanes: buildRotationPlanesForDim(3),
    originLegend: "O = origin (0, 0, 0)",
    eyebrow: "3D projection playground",
    title: "Rotate a 2D viewing plane through 3D space.",
    intro: "",
    controlsHeading: "Rotate in 3D planes",
    controlsCopy: "",
    canvasAria: "3D projection canvas",
    docTitle: "3D Rotation Explorer",
  },
  "4": {
    dimensions: 4,
    createDefaultPlane: () => defaultPlaneXY(4),
    points: buildAxisPointsForDim(4),
    rotationPlanes: buildRotationPlanesForDim(4),
    originLegend: "O = origin (0, 0, 0, 0)",
    eyebrow: "4D projection playground",
    title: "Rotate a 2D viewing plane through 4D space.",
    intro: "",
    controlsHeading: "Rotate in 4D planes",
    controlsCopy: "",
    canvasAria: "4D projection canvas",
    docTitle: "4D Rotation Explorer",
  },
  "10": {
    dimensions: 10,
    createDefaultPlane: () => defaultPlaneXY(10),
    points: buildAxisPointsForDim(10),
    rotationPlanes: buildRotationPlanesForDim(10),
    originLegend: "O = origin (0 in each of 10 coordinates)",
    eyebrow: "10D projection playground",
    title: "Rotate a 2D viewing plane through 10D space.",
    intro: "",
    controlsHeading: "Rotate in 10D planes",
    controlsCopy: "",
    canvasAria: "10D projection canvas",
    docTitle: "10D Rotation Explorer",
  },
  "100": {
    dimensions: 100,
    createDefaultPlane: () => defaultPlaneXY(100),
    points: buildAxisPointsForDim(100),
    rotationPlanes: sampleRotationPlanesForHighDim(100, 6, 0x9e3779b1),
    originLegend: "O = origin (0 in each of 100 coordinates)",
    eyebrow: "100D projection playground",
    title: "Rotate a 2D viewing plane through 100-dimensional space.",
    intro: "",
    controlsHeading: "100D view",
    controlsCopy:
      "Six coordinate planes are sampled (out of 4 950 in ℝ¹⁰⁰) for ± rotation; Reset, Random view, and PCA view still apply. Try Unit axes or Random cloud.",
    canvasAria: "100D projection canvas",
    docTitle: "100D Rotation Explorer",
  },
};

const canvas = document.getElementById("projectionCanvas");
const ctx = canvas.getContext("2d");
const primaryCanvasWrap = document.getElementById("primaryCanvasWrap");
const canvasStack = document.getElementById("canvasStack");
const primaryCanvasCaption = document.getElementById("primaryCanvasCaption");
const knobGrid = document.getElementById("knobGrid");
const uVectorEl = document.getElementById("uVector");
const vVectorEl = document.getElementById("vVector");
const angleStateEl = document.getElementById("angleState");
const legendEl = document.getElementById("legend");
const resetButton = document.getElementById("resetButton");
const randomViewButton = document.getElementById("randomViewButton");
const pcaViewButton = document.getElementById("pcaViewButton");
const heroEyebrow = document.getElementById("heroEyebrow");
const heroTitle = document.getElementById("heroTitle");
const heroIntro = document.getElementById("heroIntro");
const controlsHeading = document.getElementById("controlsHeading");
const controlsCopy = document.getElementById("controlsCopy");
const tab3d = document.getElementById("tab3d");
const tab4d = document.getElementById("tab4d");
const tab10d = document.getElementById("tab10d");
const tab100d = document.getElementById("tab100d");
const edgeToggle = document.getElementById("edgeToggle");
const axisHintToggle = document.getElementById("axisHintToggle");
const coordsToggle = document.getElementById("coordsToggle");
const tabSceneAxes = document.getElementById("tabSceneAxes");
const tabSceneCube = document.getElementById("tabSceneCube");
const tabSceneCloud = document.getElementById("tabSceneCloud");
const legendSummaryEl = document.getElementById("legendSummary");
const projectionZoomInBtn = document.getElementById("projectionZoomIn");
const projectionZoomOutBtn = document.getElementById("projectionZoomOut");
const projectionZoomResetBtn = document.getElementById("projectionZoomReset");

let activeMode = "3";
let showFrameEdges = true;
let showRotationAxisHint = false;
let showProjectionCoords = false;

/** Multiplier on projection scale (grid, points, edges); 1 = default framing. */
let projectionZoom = 1;
let enableUrlStateSync = false;
let pendingUrlStateSyncRaf = 0;

const URL_STATE_KEYS = {
  mode: "m",
  scene: "s",
  edges: "e",
  axisHint: "h",
  coords: "c",
  zoom: "z",
  u: "u",
  v: "v",
};

function cfg() {
  return DEMO_MODES[activeMode];
}

function parseBooleanParam(raw, fallback) {
  if (raw == null) {
    return fallback;
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") {
    return true;
  }
  if (v === "0" || v === "false" || v === "off" || v === "no") {
    return false;
  }
  return fallback;
}

function parseModeParam(raw) {
  const mode = String(raw ?? "").trim();
  return Object.prototype.hasOwnProperty.call(DEMO_MODES, mode) ? mode : null;
}

function parseSceneParam(raw) {
  const scene = String(raw ?? "").trim();
  return scene === "axes" || scene === "cube" || scene === "cloud" ? scene : null;
}

function parseNumberListParam(raw, expectedLength) {
  if (raw == null) {
    return null;
  }
  const parts = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== expectedLength) {
    return null;
  }
  const values = parts.map((p) => Number(p));
  if (values.some((n) => !Number.isFinite(n))) {
    return null;
  }
  return values;
}

function serializeNumberList(values) {
  return values.map((v) => (Math.abs(v) < 1e-8 ? "0" : Number(v.toFixed(6)).toString())).join(",");
}

function buildUrlStateParams() {
  const params = new URLSearchParams(window.location.search);
  params.set(URL_STATE_KEYS.mode, activeMode);
  params.set(URL_STATE_KEYS.scene, scenePointMode);
  params.set(URL_STATE_KEYS.edges, showFrameEdges ? "1" : "0");
  params.set(URL_STATE_KEYS.axisHint, showRotationAxisHint ? "1" : "0");
  params.set(URL_STATE_KEYS.coords, showProjectionCoords ? "1" : "0");
  params.set(URL_STATE_KEYS.zoom, Number(projectionZoom.toFixed(4)).toString());
  params.set(URL_STATE_KEYS.u, serializeNumberList(viewPlane.u));
  params.set(URL_STATE_KEYS.v, serializeNumberList(viewPlane.v));
  return params;
}

function replaceUrlWithCurrentState() {
  if (!enableUrlStateSync) {
    return;
  }
  const params = buildUrlStateParams();
  const nextSearch = params.toString();
  const currentSearch = window.location.search.replace(/^\?/, "");
  if (nextSearch === currentSearch) {
    return;
  }
  const hash = window.location.hash || "";
  const nextUrl = `${window.location.pathname}?${nextSearch}${hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function scheduleUrlStateSync() {
  if (!enableUrlStateSync || pendingUrlStateSyncRaf) {
    return;
  }
  pendingUrlStateSyncRaf = window.requestAnimationFrame(() => {
    pendingUrlStateSyncRaf = 0;
    replaceUrlWithCurrentState();
  });
}

function activateUrlStateSync() {
  enableUrlStateSync = true;
  scheduleUrlStateSync();
}

function applyUrlStateFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const keys = Object.values(URL_STATE_KEYS);
  const hasAnyKnownState = keys.some((k) => params.has(k));
  if (!hasAnyKnownState) {
    return false;
  }

  const parsedMode = parseModeParam(params.get(URL_STATE_KEYS.mode)) ?? activeMode;
  activeMode = parsedMode;
  basis = makeBasis(cfg().dimensions);
  rotationAngles = Object.fromEntries(cfg().rotationPlanes.map((plane) => [plane.label, 0]));
  viewPlane = freshDefaultPlane();
  clearPcaTripleHighlight();
  projectionZoom = 1;
  lastDepthNormal = null;

  const parsedScene = parseSceneParam(params.get(URL_STATE_KEYS.scene));
  if (parsedScene && !(parsedScene === "cube" && !dimensionsAllowHypercube(cfg().dimensions))) {
    scenePointMode = parsedScene;
  } else if (scenePointMode === "cube" && !dimensionsAllowHypercube(cfg().dimensions)) {
    scenePointMode = "axes";
  }

  showFrameEdges = parseBooleanParam(params.get(URL_STATE_KEYS.edges), showFrameEdges);
  showRotationAxisHint = parseBooleanParam(params.get(URL_STATE_KEYS.axisHint), showRotationAxisHint);
  showProjectionCoords = parseBooleanParam(params.get(URL_STATE_KEYS.coords), showProjectionCoords);

  const parsedZoom = Number(params.get(URL_STATE_KEYS.zoom));
  if (Number.isFinite(parsedZoom)) {
    projectionZoom = clampProjectionZoom(parsedZoom);
  }

  const parsedU = parseNumberListParam(params.get(URL_STATE_KEYS.u), cfg().dimensions);
  const parsedV = parseNumberListParam(params.get(URL_STATE_KEYS.v), cfg().dimensions);
  if (parsedU && parsedV) {
    viewPlane = orthonormalize(parsedU, parsedV);
    lastDepthNormal = null;
  }

  if (scenePointMode === "cloud") {
    invalidateCloudCache();
  }

  enableUrlStateSync = true;
  return true;
}

function makeBasis(dimensions) {
  return Array.from({ length: dimensions }, (_, index) =>
    Array.from({ length: dimensions }, (_, entryIndex) => (index === entryIndex ? 1 : 0))
  );
}

function freshDefaultPlane() {
  const p = cfg().createDefaultPlane();
  return { u: [...p.u], v: [...p.v] };
}

let basis = makeBasis(cfg().dimensions);
let viewPlane = freshDefaultPlane();
let rotationAngles = Object.fromEntries(cfg().rotationPlanes.map((plane) => [plane.label, 0]));

/** Labels of the three scene points last used for PCA view (pick order), or null if none / fallback random. */
let pcaTripleLabels = null;

const pcaTripleReadoutEl = document.getElementById("pcaTripleReadout");

let activeHold = null;

/**
 * Continuity anchor for "signed depth" (n₁·p). The complement basis is recomputed each render and can
 * legitimately pick n₁ or −n₁ (or reorder normals) near degenerate configurations; we align it to the
 * previous frame to prevent visual/readout flips under tiny rotations.
 */
let lastDepthNormal = null;

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function magnitude(vector) {
  return Math.sqrt(dot(vector, vector));
}

function scale(vector, scalar) {
  return vector.map((value) => value * scalar);
}

function add(a, b) {
  return a.map((value, index) => value + b[index]);
}

function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

function normalize(vector, fallback) {
  const length = magnitude(vector);
  if (length < 1e-9) {
    return [...fallback];
  }
  return scale(vector, 1 / length);
}

function standardAxes(dim) {
  return Array.from({ length: dim }, (_, k) => standardBasisVector(dim, k));
}

/**
 * Orthonormal basis of the orthogonal complement of span{u,v} (length dim−2).
 * Same Gram–Schmidt-from-standard-basis construction for every dimension (including ℝ³), so n₁ and
 * signed depth behave identically in 3D and 4D+ for testing intuition.
 */
function complementFromViewPlane() {
  const dim = cfg().dimensions;
  const u = viewPlane.u;
  const v = viewPlane.v;
  const axes = standardAxes(dim);
  const found = [];
  const need = dim - 2;

  for (let k = 0; k < dim && found.length < need; k += 1) {
    let w = [...axes[k]];
    w = subtract(w, scale(u, dot(w, u)));
    w = subtract(w, scale(v, dot(w, v)));
    for (const q of found) {
      w = subtract(w, scale(q, dot(w, q)));
    }
    const len = magnitude(w);
    if (len > 1e-6) {
      found.push(scale(w, 1 / len));
    }
  }

  while (found.length < need) {
    let progressed = false;
    for (const ax of axes) {
      if (found.length >= need) {
        break;
      }
      let w = [...ax];
      w = subtract(w, scale(u, dot(w, u)));
      w = subtract(w, scale(v, dot(w, v)));
      for (const q of found) {
        w = subtract(w, scale(q, dot(w, q)));
      }
      const len = magnitude(w);
      if (len > 1e-6) {
        found.push(scale(w, 1 / len));
        progressed = true;
        break;
      }
    }
    if (!progressed) {
      break;
    }
  }

  return { dim, normals: found };
}

function alignComplementForDepthContinuity(comp) {
  const normals = comp?.normals ?? [];
  if (!normals.length) {
    lastDepthNormal = null;
    return comp;
  }
  if (!lastDepthNormal || lastDepthNormal.length !== comp.dim) {
    lastDepthNormal = [...normals[0]];
    return comp;
  }

  let bestIdx = 0;
  let bestAbs = Math.abs(dot(normals[0], lastDepthNormal));
  for (let i = 1; i < normals.length; i += 1) {
    const a = Math.abs(dot(normals[i], lastDepthNormal));
    if (a > bestAbs) {
      bestAbs = a;
      bestIdx = i;
    }
  }

  if (bestIdx !== 0) {
    const t = normals[0];
    normals[0] = normals[bestIdx];
    normals[bestIdx] = t;
  }

  if (dot(normals[0], lastDepthNormal) < 0) {
    normals[0] = scale(normals[0], -1);
  }

  lastDepthNormal = [...normals[0]];
  return comp;
}

/**
 * Signed depth along the first complement normal n₁ (same Gram–Schmidt basis as complementFromViewPlane, all D).
 * Clamp n₁·p to ±refAbs (scene-dependent: 1 for unit axes, √d for {0,1}ᵈ hypercube and [−1,1]ᵈ cloud).
 * Map: most negative → largest / most opaque; most positive → smallest / faintest.
 */
function depthRadiusScaleSignedAlongFirstNormal(vector, nUnit, refAbs) {
  const ref = Math.max(refAbs, 1e-12);
  const raw = dot(vector, nUnit);
  const d = Math.max(-ref, Math.min(ref, raw));
  const t = (d / ref + 1) / 2;
  return DEPTH_DOT_MULT_MIN + (DEPTH_DOT_MULT_MAX - DEPTH_DOT_MULT_MIN) * (1 - t);
}

/** Third number next to (x,y): signed n₁·p (same convention as dot size / opacity). */
function depthForCoordLabel(vector, comp) {
  if (!comp.normals.length) {
    return 0;
  }
  return dot(vector, comp.normals[0]);
}

function depthDotRadiusMultiplier(vector, comp, depthRefNorm) {
  if (!comp.normals.length) {
    return DEPTH_DOT_MULT_MAX;
  }
  return depthRadiusScaleSignedAlongFirstNormal(vector, comp.normals[0], depthRefNorm);
}

const DEPTH_DOT_ALPHA_MIN = 0.2;
const DEPTH_DOT_ALPHA_MAX = 1;

/** Same depth multiplier as radius: smaller mult (more positive n₁·p) → lower opacity. */
function depthFillAlpha(mult, useDepth) {
  if (!useDepth) {
    return DEPTH_DOT_ALPHA_MAX;
  }
  const span = 1 - DEPTH_DOT_MULT_MIN;
  const t = Math.max(0, Math.min(1, (mult - DEPTH_DOT_MULT_MIN) / span));
  return DEPTH_DOT_ALPHA_MIN + (DEPTH_DOT_ALPHA_MAX - DEPTH_DOT_ALPHA_MIN) * t;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6 || Number.isNaN(parseInt(h.slice(0, 2), 16))) {
    return `rgba(24,34,24,${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 32-bit seeded PRNG (Mulberry32); seed with e.g. `Date.now()` for a fresh stream per click. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rand) {
  const u1 = Math.max(1e-12, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomViewPlaneFromSeed(seed) {
  const dim = cfg().dimensions;
  const rand = mulberry32(seed);
  const uCandidate = Array.from({ length: dim }, () => randNormal(rand));
  const vCandidate = Array.from({ length: dim }, () => randNormal(rand));
  return orthonormalize(uCandidate, vCandidate);
}

/** Fisher–Yates: first three entries are a uniform random 3-subset of [0..n−1]. */
function pickThreeDistinctIndices(n, rand) {
  if (n < 3) {
    return null;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < 3; i += 1) {
    const j = i + Math.floor(rand() * (n - i));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  return [idx[0], idx[1], idx[2]];
}

/** Fisher–Yates on a list of allowed indices (e.g. exclude origin). */
function pickThreeDistinctFromPool(pool, rand) {
  const n = pool.length;
  if (n < 3) {
    return null;
  }
  const idx = [...pool];
  for (let i = 0; i < 3; i += 1) {
    const j = i + Math.floor(rand() * (n - i));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  return [idx[0], idx[1], idx[2]];
}

function isExcludedFromPcaPick(point) {
  if (point.label === "O") {
    return true;
  }
  return magnitude(point.vector) < 1e-10;
}

/**
 * View plane (u, v) from PCA of three points in ℝᵈ: u along PC1, v along PC2 in their affine hull,
 * so the triangle projects with maximal spread in the plane.
 */
function viewPlaneFromThreePointPCA(p0, p1, p2) {
  const m = scale(add(add(p0, p1), p2), 1 / 3);
  const c0 = subtract(p0, m);
  const c1 = subtract(p1, m);
  const c2 = subtract(p2, m);

  let e1Raw = c0;
  if (magnitude(e1Raw) < 1e-10) {
    e1Raw = c1;
  }
  if (magnitude(e1Raw) < 1e-10) {
    e1Raw = c2;
  }
  if (magnitude(e1Raw) < 1e-10) {
    return null;
  }

  const e1 = normalize(e1Raw, basis[0]);
  let bestRes = subtract(c0, scale(e1, dot(c0, e1)));
  let bestMag = magnitude(bestRes);
  for (const ck of [c1, c2]) {
    const res = subtract(ck, scale(e1, dot(ck, e1)));
    const len = magnitude(res);
    if (len > bestMag) {
      bestMag = len;
      bestRes = res;
    }
  }

  let e2;
  if (bestMag < 1e-10) {
    const aux = basis.find((ax) => Math.abs(dot(ax, e1)) < 0.9) ?? basis[1];
    e2 = normalize(subtract(aux, scale(e1, dot(aux, e1))), basis[1]);
  } else {
    e2 = normalize(bestRes, basis[1]);
  }

  const q = [c0, c1, c2].map((c) => ({
    x: dot(c, e1),
    y: dot(c, e2),
  }));

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of q) {
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
  }
  const invN = 1 / 3;
  sxx *= invN;
  sxy *= invN;
  syy *= invN;

  const halfTrace = (sxx + syy) / 2;
  const disc = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const lambda1 = halfTrace + disc;

  let wx;
  let wy;
  if (Math.abs(sxy) < 1e-14) {
    if (sxx >= syy) {
      wx = 1;
      wy = 0;
    } else {
      wx = 0;
      wy = 1;
    }
  } else {
    wx = sxy;
    wy = lambda1 - sxx;
    const wlen = Math.hypot(wx, wy);
    if (wlen < 1e-14) {
      wx = lambda1 - syy;
      wy = sxy;
    }
    const len2 = Math.hypot(wx, wy);
    wx /= len2;
    wy /= len2;
  }

  const vx = -wy;
  const vy = wx;

  const uCand = add(scale(e1, wx), scale(e2, wy));
  const vCand = add(scale(e1, vx), scale(e2, vy));
  return orthonormalize(uCand, vCand);
}

function applyPcaViewFromRandomTriple(seed) {
  const rand = mulberry32(seed >>> 0);
  const points = scenePoints();
  const eligible = points.map((p, i) => i).filter((i) => !isExcludedFromPcaPick(points[i]));
  const picked = pickThreeDistinctFromPool(eligible, rand);
  if (!picked) {
    return { plane: randomViewPlaneFromSeed(seed), labels: null };
  }
  const [i0, i1, i2] = picked;
  const p0 = points[i0].vector;
  const p1 = points[i1].vector;
  const p2 = points[i2].vector;
  const labels = [points[i0].label, points[i1].label, points[i2].label];
  const plane = viewPlaneFromThreePointPCA(p0, p1, p2);
  if (!plane) {
    return { plane: randomViewPlaneFromSeed(seed), labels: null };
  }
  return { plane, labels };
}

function clearPcaTripleHighlight() {
  pcaTripleLabels = null;
}

function syncPcaTripleReadout() {
  if (!pcaTripleReadoutEl) {
    return;
  }
  if (pcaTripleLabels && pcaTripleLabels.length === 3) {
    pcaTripleReadoutEl.hidden = false;
    pcaTripleReadoutEl.textContent = `PCA used these three points (in pick order): ${pcaTripleLabels.join(" → ")}. They are outlined on the plot and linked by a dashed triangle.`;
  } else {
    pcaTripleReadoutEl.hidden = true;
    pcaTripleReadoutEl.textContent = "";
  }
}

function cloudPointCount(dim) {
  return Math.min(320, Math.max(48, 28 * dim + 32));
}

function buildRandomCloudPoints(dim, seed) {
  const rand = mulberry32(seed >>> 0);
  const n = cloudPointCount(dim);
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const vector = Array.from({ length: dim }, () => rand() * 2 - 1);
    points.push({
      label: String(i + 1),
      vector,
      color: AXIS_PALETTE[i % AXIS_PALETTE.length],
    });
  }
  return points;
}

function invalidateCloudCache() {
  cloudCacheDim = -1;
  cloudCachePoints = null;
}

function getCloudPoints() {
  const dim = cfg().dimensions;
  if (cloudCachePoints && cloudCacheDim === dim) {
    return cloudCachePoints;
  }
  cloudCachePoints = buildRandomCloudPoints(dim, Date.now() >>> 0);
  cloudCacheDim = dim;
  return cloudCachePoints;
}

function orthonormalize(candidateU, candidateV) {
  const normalizedU = normalize(candidateU, basis[0]);
  const projectedV = subtract(candidateV, scale(normalizedU, dot(candidateV, normalizedU)));

  let normalizedV = normalize(projectedV, basis[1]);
  if (Math.abs(dot(normalizedU, normalizedV)) > 1e-6) {
    const fallback = basis.find((axis) => Math.abs(dot(axis, normalizedU)) < 0.9) || basis[1];
    normalizedV = normalize(
      subtract(fallback, scale(normalizedU, dot(fallback, normalizedU))),
      basis[1]
    );
  }

  return { u: normalizedU, v: normalizedV };
}

function applyPlaneRotation(vector, axisA, axisB, angle) {
  const rotated = [...vector];
  const a = vector[axisA];
  const b = vector[axisB];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  rotated[axisA] = a * cosine - b * sine;
  rotated[axisB] = a * sine + b * cosine;
  return rotated;
}

function wrapAngle(angle) {
  const fullTurn = Math.PI * 2;
  let wrapped = angle % fullTurn;
  if (wrapped > Math.PI) {
    wrapped -= fullTurn;
  }
  if (wrapped < -Math.PI) {
    wrapped += fullTurn;
  }
  return wrapped;
}

function rotateInPlane(planeLabel, direction) {
  const plane = cfg().rotationPlanes.find((p) => p.label === planeLabel);
  if (!plane) {
    return;
  }
  const delta = direction * ROTATION_STEP;
  rotationAngles[planeLabel] = wrapAngle((rotationAngles[planeLabel] ?? 0) + delta);
  const [axisA, axisB] = plane.axes;
  viewPlane = orthonormalize(
    applyPlaneRotation(viewPlane.u, axisA, axisB, delta),
    applyPlaneRotation(viewPlane.v, axisA, axisB, delta)
  );
  activateUrlStateSync();
  render();
}

function stopActiveHold() {
  if (!activeHold) {
    return;
  }

  clearInterval(activeHold.intervalId);
  activeHold.button.releasePointerCapture?.(activeHold.pointerId);
  activeHold = null;
  render();
}

function startContinuousRotation(button, planeLabel, direction, pointerId) {
  stopActiveHold();

  activeHold = {
    button,
    pointerId,
    planeLabel,
    intervalId: window.setInterval(() => {
      rotateInPlane(planeLabel, direction);
    }, HOLD_REPEAT_MS),
  };

  button.setPointerCapture?.(pointerId);
  rotateInPlane(planeLabel, direction);
}

function projectOnPlane(vector, planeU, planeV) {
  return {
    x: dot(vector, planeU),
    y: dot(vector, planeV),
  };
}

function screenFromVector(vector, centerX, centerY, scaleFactor, planeU, planeV) {
  const p = projectOnPlane(vector, planeU, planeV);
  return {
    x: centerX + p.x * scaleFactor,
    y: centerY - p.y * scaleFactor,
  };
}

function frameEdgeIndexPairs(pointCount) {
  const axisCount = pointCount - 1;
  const pairs = [];
  for (let j = 1; j <= axisCount; j += 1) {
    pairs.push([0, j]);
  }
  for (let i = 1; i <= axisCount; i += 1) {
    for (let j = i + 1; j <= axisCount; j += 1) {
      pairs.push([i, j]);
    }
  }
  return pairs;
}

function drawFrameEdgesCanvas(c, centerX, centerY, scaleFactor, points, planeU, planeV, edgePairs) {
  if (!showFrameEdges) {
    return;
  }

  const pairs = edgePairs ?? frameEdgeIndexPairs(points.length);
  const edgeCount = pairs.length;
  const lineScale =
    edgeCount > 400 ? 0.0035 : edgeCount > 120 ? 0.0055 : edgeCount > 40 ? 0.0075 : 0.0095;
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = Math.max(0.35, Math.min(1.15, scaleFactor * lineScale));

  pairs.forEach(([i, j]) => {
    const a = screenFromVector(points[i].vector, centerX, centerY, scaleFactor, planeU, planeV);
    const b = screenFromVector(points[j].vector, centerX, centerY, scaleFactor, planeU, planeV);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) {
      return;
    }

    c.beginPath();
    c.strokeStyle = "rgba(24, 34, 24, 0.38)";
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  });

  c.restore();
}

function drawActiveRotationHintCanvas(c, centerX, centerY, width, height, planeU, planeV) {
  if (!showRotationAxisHint || !activeHold?.planeLabel) {
    return;
  }

  const plane = cfg().rotationPlanes.find((p) => p.label === activeHold.planeLabel);
  if (!plane) {
    return;
  }

  const half = Math.min(width, height) * 0.44;
  const axisIndices = plane.axes;
  const points = cfg().points;

  c.save();
  c.setLineDash([7, 6]);
  c.lineWidth = 2.4;
  c.lineCap = "round";
  c.lineJoin = "round";

  axisIndices.forEach((axisIndex) => {
    const pr = projectOnPlane(basis[axisIndex], planeU, planeV);
    const sx = pr.x;
    const sy = -pr.y;
    const len = Math.hypot(sx, sy);
    if (len < 1e-8) {
      return;
    }

    const nx = sx / len;
    const ny = sy / len;
    const color = points[axisIndex + 1].color;
    const name = `x${axisIndex + 1}`;

    c.strokeStyle = color;
    c.globalAlpha = 0.88;

    const xA = centerX - nx * half;
    const yA = centerY - ny * half;
    const xB = centerX + nx * half;
    const yB = centerY + ny * half;

    c.beginPath();
    c.moveTo(xA, yA);
    c.lineTo(xB, yB);
    c.stroke();

    const tipX = xB;
    const tipY = yB;
    const ah = Math.min(14, half * 0.06);
    const wing = ah * 0.55;
    const bx = tipX - nx * ah;
    const by = tipY - ny * ah;
    const px = -ny;
    const py = nx;

    c.setLineDash([]);
    c.beginPath();
    c.moveTo(tipX, tipY);
    c.lineTo(bx + px * wing, by + py * wing);
    c.lineTo(bx - px * wing, by - py * wing);
    c.closePath();
    c.fillStyle = color;
    c.globalAlpha = 0.92;
    c.fill();

    const labelOffset = ah + 10;
    const lx = tipX + nx * labelOffset;
    const ly = tipY + ny * labelOffset;
    const fontSize = Math.round(Math.max(11, Math.min(15, Math.min(width, height) * 0.02)));
    c.font = `600 ${fontSize}px "IBM Plex Mono", monospace`;
    c.fillStyle = color;
    c.globalAlpha = 1;
    c.textAlign = nx >= 0 ? "left" : "right";
    c.textBaseline = "middle";
    c.fillText(name, lx, ly);
  });

  c.restore();
}

function drawGridCanvas(c, width, height, centerX, centerY, scaleFactor) {
  c.save();
  c.strokeStyle = "rgba(24, 34, 24, 0.08)";
  c.lineWidth = 1;

  for (let value = -2; value <= 2; value += 0.5) {
    const offset = value * scaleFactor;
    c.beginPath();
    c.moveTo(0, centerY + offset);
    c.lineTo(width, centerY + offset);
    c.stroke();

    c.beginPath();
    c.moveTo(centerX + offset, 0);
    c.lineTo(centerX + offset, height);
    c.stroke();
  }

  c.strokeStyle = "rgba(24, 34, 24, 0.22)";
  c.lineWidth = 1.6;

  c.beginPath();
  c.moveTo(0, centerY);
  c.lineTo(width, centerY);
  c.stroke();

  c.beginPath();
  c.moveTo(centerX, 0);
  c.lineTo(centerX, height);
  c.stroke();
  c.restore();
}

function drawPcaTriangleOutline(c, centerX, centerY, scaleFactor, planeU, planeV, orderedLabels, pointList) {
  if (!orderedLabels || orderedLabels.length !== 3) {
    return;
  }
  const proj = orderedLabels.map((lab) => {
    const pt = pointList.find((p) => p.label === lab);
    if (!pt) {
      return null;
    }
    const p = projectOnPlane(pt.vector, planeU, planeV);
    return { x: centerX + p.x * scaleFactor, y: centerY - p.y * scaleFactor };
  });
  if (proj.some((q) => !q)) {
    return;
  }

  c.save();
  c.strokeStyle = "rgba(201, 162, 39, 0.9)";
  c.lineWidth = 2;
  c.setLineDash([6, 5]);
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(proj[0].x, proj[0].y);
  c.lineTo(proj[1].x, proj[1].y);
  c.lineTo(proj[2].x, proj[2].y);
  c.closePath();
  c.stroke();
  c.restore();
}

function drawProjectionScene(c, width, height, planeU, planeV, sceneOptions) {
  const {
    points,
    edgePairs,
    scaleDotsByDepth,
    depthRefNorm,
    complement,
    drawRotationHint,
    drawEdges,
    showCoords,
    pcaHighlightLabels,
    projectionZoomScale = 1,
  } = sceneOptions;
  const centerX = width / 2;
  const centerY = height / 2;
  const scaleFactor = Math.min(width, height) * 0.28 * projectionZoomScale;
  const crowdedDots = points.length > 24;
  const pcaSet =
    pcaHighlightLabels && pcaHighlightLabels.length === 3 ? new Set(pcaHighlightLabels) : null;

  drawGridCanvas(c, width, height, centerX, centerY, scaleFactor);
  if (drawRotationHint) {
    drawActiveRotationHintCanvas(c, centerX, centerY, width, height, planeU, planeV);
  }
  if (drawEdges) {
    drawFrameEdgesCanvas(c, centerX, centerY, scaleFactor, points, planeU, planeV, edgePairs);
  }

  points.forEach((point) => {
    const projected = projectOnPlane(point.vector, planeU, planeV);
    const x = centerX + projected.x * scaleFactor;
    const y = centerY - projected.y * scaleFactor;
    const mult = scaleDotsByDepth ? depthDotRadiusMultiplier(point.vector, complement, depthRefNorm) : 1;
    let baseR = 10;
    if (point.label === "O") {
      baseR = 8;
    }
    if (crowdedDots) {
      baseR = Math.min(baseR, 4.2);
    }
    const isPca = pcaSet?.has(point.label) ?? false;
    const r = Math.max(2.2, baseR * mult);
    const fillAlpha = depthFillAlpha(mult, scaleDotsByDepth);

    c.beginPath();
    c.fillStyle = hexToRgba(point.color, fillAlpha);
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();

    const drawLabel = showCoords || !crowdedDots || isPca;
    if (!drawLabel) {
      return;
    }

    const fontSize = Math.round(Math.max(12, Math.min(17, Math.min(width, height) * 0.022)));
    c.font = `${fontSize}px "IBM Plex Mono", monospace`;
    c.fillStyle = isPca ? "#8a6a0a" : "#182218";
    const labelText = showCoords
      ? `${point.label} (${projected.x.toFixed(2)}, ${projected.y.toFixed(2)}, ${depthForCoordLabel(
          point.vector,
          complement
        ).toFixed(2)})`
      : point.label;
    c.fillText(labelText, x + 16, y - 14);

    if (isPca) {
      c.save();
      c.strokeStyle = "rgba(201, 162, 39, 0.95)";
      c.lineWidth = Math.max(2, Math.min(3.2, r * 0.35));
      c.setLineDash([]);
      c.beginPath();
      c.arc(x, y, r + Math.max(4, r * 0.45), 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  });

  if (pcaHighlightLabels && pcaHighlightLabels.length === 3) {
    drawPcaTriangleOutline(c, centerX, centerY, scaleFactor, planeU, planeV, pcaHighlightLabels, points);
  }
}

function getCanvasLogicalSizeFor(canv) {
  const dpr = window.devicePixelRatio || 1;
  return {
    width: canv.width / dpr,
    height: canv.height / dpr,
    dpr,
  };
}

function measureProjectionCanvasCssSize(wrap, canv) {
  let w = Math.round(canv.clientWidth);
  let h = Math.round(canv.clientHeight);
  if (w >= 2 && h >= 2) {
    return { w, h };
  }
  const br = canv.getBoundingClientRect();
  w = Math.round(br.width);
  h = Math.round(br.height);
  if (w >= 2 && h >= 2) {
    return { w, h };
  }
  /* Content box inside padded .canvas-wrap (padding = projection inset) */
  if (wrap && wrap.clientWidth >= 2 && wrap.clientHeight >= 2) {
    const cs = getComputedStyle(wrap);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const innerW = Math.round(wrap.clientWidth - pl - pr);
    const innerH = Math.round(wrap.clientHeight - pt - pb);
    if (innerW >= 2 && innerH >= 2) {
      return { w: innerW, h: innerH };
    }
  }
  return null;
}

function applyCanvasPixelSize(wrap, canv) {
  if (!wrap || !canv) {
    return false;
  }
  const measured = measureProjectionCanvasCssSize(wrap, canv);
  if (!measured) {
    return false;
  }
  const { w, h } = measured;
  const dpr = window.devicePixelRatio || 1;
  const nextW = Math.round(w * dpr);
  const nextH = Math.round(h * dpr);
  if (canv.width !== nextW || canv.height !== nextH) {
    canv.width = nextW;
    canv.height = nextH;
    canv.style.width = `${w}px`;
    canv.style.height = `${h}px`;
  }
  return true;
}

function resizeAllCanvases() {
  applyCanvasPixelSize(primaryCanvasWrap, canvas);
  render();
  /* Firefox: flex + aspect-ratio can settle one frame late */
  requestAnimationFrame(() => {
    if (applyCanvasPixelSize(primaryCanvasWrap, canvas)) {
      render();
    }
  });
}

function updatePanelCaptions() {
  const z = Math.abs(projectionZoom - 1) < 0.01 ? "1×" : `${projectionZoom.toFixed(2)}×`;
  primaryCanvasCaption.textContent = `View plane (u, v) — zoom ${z} — dot size/opacity = depth`;
}

function clampProjectionZoom(value) {
  return Math.min(PROJECTION_ZOOM_MAX, Math.max(PROJECTION_ZOOM_MIN, value));
}

function setProjectionZoom(next) {
  projectionZoom = clampProjectionZoom(next);
  activateUrlStateSync();
  render();
}

function resetProjectionZoom() {
  projectionZoom = 1;
  activateUrlStateSync();
  render();
}

function syncCanvasAriaLabels() {
  const base = cfg().canvasAria;
  const d = cfg().dimensions;
  const depthHint =
    "signed n₁·p along the first normal of the complement of span{u,v} (−ref large/opaque, +ref small/faint)";
  canvas.setAttribute("aria-label", `${base}; dot size and opacity ∝ ${depthHint}`);
}

function render() {
  const comp = alignComplementForDepthContinuity(complementFromViewPlane());
  updatePanelCaptions();
  syncCanvasAriaLabels();
  syncPcaTripleReadout();

  const points = scenePoints();
  const edgePairs = sceneEdgePairs(points);
  const depthRefNorm = sceneDepthRefNorm();

  if (canvas.width && canvas.height) {
    const { width, height, dpr } = getCanvasLogicalSizeFor(canvas);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawProjectionScene(ctx, width, height, viewPlane.u, viewPlane.v, {
      points,
      edgePairs,
      scaleDotsByDepth: true,
      depthRefNorm,
      complement: comp,
      drawRotationHint: showRotationAxisHint,
      drawEdges: showFrameEdges,
      showCoords: showProjectionCoords,
      pcaHighlightLabels: pcaTripleLabels,
      projectionZoomScale: projectionZoom,
    });
  }

  uVectorEl.textContent = formatVector(viewPlane.u);
  vVectorEl.textContent = formatVector(viewPlane.v);
  angleStateEl.textContent = cfg()
    .rotationPlanes.map((plane) => {
      const radians = rotationAngles[plane.label] ?? 0;
      const degrees = (radians * 180) / Math.PI;
      return `${plane.label}: ${degrees.toFixed(1)}°`;
    })
    .join("\n");
  scheduleUrlStateSync();
}

function formatVector(vector) {
  return `[${vector
    .map((value) => {
      const cleanValue = Math.abs(value) < 1e-7 ? 0 : value;
      return cleanValue.toFixed(3);
    })
    .join(", ")}]`;
}

function buildControls() {
  knobGrid.classList.toggle("knob-grid--many", cfg().rotationPlanes.length > 12);
  cfg().rotationPlanes.forEach((plane) => {
    const row = document.createElement("div");
    row.className = "knob-row";

    const label = document.createElement("strong");
    label.textContent = plane.label;

    const pair = document.createElement("div");
    pair.className = "knob-pair";

    const minusButton = document.createElement("button");
    minusButton.className = "knob";
    minusButton.type = "button";
    minusButton.textContent = "−";
    attachContinuousRotation(minusButton, plane.label, -1);

    const plusButton = document.createElement("button");
    plusButton.className = "knob";
    plusButton.type = "button";
    plusButton.textContent = "+";
    attachContinuousRotation(plusButton, plane.label, 1);

    pair.append(minusButton, plusButton);
    row.append(label, pair);
    knobGrid.appendChild(row);
  });
}

function attachContinuousRotation(button, planeLabel, direction) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    startContinuousRotation(button, planeLabel, direction, event.pointerId);
  });

  button.addEventListener("pointerup", stopActiveHold);
  button.addEventListener("pointercancel", stopActiveHold);
  button.addEventListener("lostpointercapture", stopActiveHold);
  button.addEventListener("pointerleave", (event) => {
    if ((event.buttons & 1) === 0) {
      stopActiveHold();
    }
  });
}

function buildLegend() {
  legendEl.replaceChildren();

  if (legendSummaryEl) {
    if (scenePointMode === "cube") {
      legendSummaryEl.textContent = "Hypercube info";
    } else if (scenePointMode === "cloud") {
      legendSummaryEl.textContent = "Random cloud info";
    } else {
      legendSummaryEl.textContent = "Axis definitions";
    }
  }

  if (scenePointMode === "cloud") {
    const dim = cfg().dimensions;
    const pts = getCloudPoints();
    legendEl.classList.remove("legend--many");

    const summary = document.createElement("div");
    summary.className = "legend-item";
    const sw0 = document.createElement("span");
    sw0.className = "legend-swatch";
    sw0.style.backgroundColor = AXIS_PALETTE[3];
    const tx0 = document.createElement("span");
    tx0.textContent = `${pts.length.toLocaleString()} points, each coordinate uniform in [−1, 1] (ℝ${dim}). New sample when you open this tab or click Random view.`;
    summary.append(sw0, tx0);
    legendEl.appendChild(summary);
    return;
  }

  if (scenePointMode === "cube") {
    const dim = cfg().dimensions;
    const nVert = 1 << dim;
    const nEdge = dim * (1 << (dim - 1));
    legendEl.classList.toggle("legend--many", dim > 4);

    const summary = document.createElement("div");
    summary.className = "legend-item";
    const sw0 = document.createElement("span");
    sw0.className = "legend-swatch";
    sw0.style.backgroundColor = AXIS_PALETTE[0];
    const tx0 = document.createElement("span");
    tx0.textContent = `${nVert.toLocaleString()} vertices in {0,1}^${dim} ⊂ ℝ${dim}; ${nEdge.toLocaleString()} edges join corners differing in one coordinate. Dot color ∝ count of 1s.`;
    summary.append(sw0, tx0);
    legendEl.appendChild(summary);

    if (dim <= 4) {
      hypercubeScenePoints(dim).forEach((point) => {
        const item = document.createElement("div");
        item.className = "legend-item";
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.backgroundColor = point.color;
        const text = document.createElement("span");
        text.textContent = `${point.label} = ${formatVector(point.vector)}`;
        item.append(swatch, text);
        legendEl.appendChild(item);
      });
    }
    return;
  }

  const dim = cfg().dimensions;
  const axisPoints = cfg().points;
  legendEl.classList.toggle("legend--many", axisPoints.length > 7);

  if (dim > 10) {
    const nEdge = (dim * (dim + 1)) / 2;
    const summary = document.createElement("div");
    summary.className = "legend-item";
    const sw0 = document.createElement("span");
    sw0.className = "legend-swatch";
    sw0.style.backgroundColor = AXIS_PALETTE[0];
    const tx0 = document.createElement("span");
    tx0.textContent = `${cfg().originLegend}; e1…e${dim} are the standard basis in ℝ${dim}. Wireframe uses ${nEdge.toLocaleString()} edges (origin to each axis tip, plus every pair of tips).`;
    summary.append(sw0, tx0);
    legendEl.appendChild(summary);
    return;
  }

  axisPoints.forEach((point) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = point.color;

    const text = document.createElement("span");
    text.textContent =
      point.label === "O" ? cfg().originLegend : `${point.label} = ${formatVector(point.vector)}`;

    item.append(swatch, text);
    legendEl.appendChild(item);
  });
}

function syncDomCopy() {
  const c = cfg();
  heroEyebrow.textContent = c.eyebrow;
  heroTitle.textContent = c.title;
  heroIntro.textContent = c.intro || "";
  heroIntro.toggleAttribute("hidden", !String(c.intro || "").trim());
  controlsHeading.textContent = c.controlsHeading;
  controlsCopy.textContent = c.controlsCopy || "";
  controlsCopy.toggleAttribute("hidden", !String(c.controlsCopy || "").trim());
  document.title = c.docTitle;
  syncCanvasAriaLabels();
}

function updateTabs() {
  const mode = activeMode;
  tab3d.classList.toggle("is-active", mode === "3");
  tab4d.classList.toggle("is-active", mode === "4");
  tab10d.classList.toggle("is-active", mode === "10");
  tab100d?.classList.toggle("is-active", mode === "100");
  tab3d.setAttribute("aria-selected", String(mode === "3"));
  tab4d.setAttribute("aria-selected", String(mode === "4"));
  tab10d.setAttribute("aria-selected", String(mode === "10"));
  tab100d?.setAttribute("aria-selected", String(mode === "100"));
  const labelId =
    mode === "3" ? "tab3d" : mode === "4" ? "tab4d" : mode === "10" ? "tab10d" : "tab100d";
  document.getElementById("workspace").setAttribute("aria-labelledby", labelId);
}

function applyMode(nextMode) {
  if (nextMode === activeMode) {
    return;
  }

  stopActiveHold();
  activeMode = nextMode;
  basis = makeBasis(cfg().dimensions);
  rotationAngles = Object.fromEntries(cfg().rotationPlanes.map((plane) => [plane.label, 0]));
  viewPlane = freshDefaultPlane();
  clearPcaTripleHighlight();
  projectionZoom = 1;
  lastDepthNormal = null;

  if (scenePointMode === "cube" && !dimensionsAllowHypercube(cfg().dimensions)) {
    scenePointMode = "axes";
  }

  invalidateCloudCache();

  syncDomCopy();
  knobGrid.replaceChildren();
  buildControls();
  buildLegend();
  updateTabs();
  updateSceneTabs();
  activateUrlStateSync();
  resizeAllCanvases();
}

tab3d.addEventListener("click", () => applyMode("3"));
tab4d.addEventListener("click", () => applyMode("4"));
tab10d.addEventListener("click", () => applyMode("10"));
tab100d?.addEventListener("click", () => applyMode("100"));

function setShowFrameEdges(on, syncUrl = true) {
  showFrameEdges = on;
  edgeToggle.classList.toggle("is-on", on);
  edgeToggle.setAttribute("aria-checked", String(on));
  if (syncUrl) {
    activateUrlStateSync();
  }
  render();
}

edgeToggle.addEventListener("click", () => setShowFrameEdges(!showFrameEdges));

function setShowRotationAxisHint(on, syncUrl = true) {
  showRotationAxisHint = on;
  axisHintToggle.classList.toggle("is-on", on);
  axisHintToggle.setAttribute("aria-checked", String(on));
  if (syncUrl) {
    activateUrlStateSync();
  }
  render();
}

axisHintToggle.addEventListener("click", () => setShowRotationAxisHint(!showRotationAxisHint));

function setShowProjectionCoords(on, syncUrl = true) {
  showProjectionCoords = on;
  coordsToggle.classList.toggle("is-on", on);
  coordsToggle.setAttribute("aria-checked", String(on));
  if (syncUrl) {
    activateUrlStateSync();
  }
  render();
}

coordsToggle.addEventListener("click", () => setShowProjectionCoords(!showProjectionCoords));

function updateSceneTabs() {
  if (!tabSceneAxes || !tabSceneCube || !tabSceneCloud) {
    return;
  }
  tabSceneAxes.classList.toggle("is-active", scenePointMode === "axes");
  tabSceneCube.classList.toggle("is-active", scenePointMode === "cube");
  tabSceneCloud.classList.toggle("is-active", scenePointMode === "cloud");
  tabSceneAxes.setAttribute("aria-selected", String(scenePointMode === "axes"));
  tabSceneCube.setAttribute("aria-selected", String(scenePointMode === "cube"));
  tabSceneCloud.setAttribute("aria-selected", String(scenePointMode === "cloud"));

  const cubeOk = dimensionsAllowHypercube(cfg().dimensions);
  tabSceneCube.disabled = !cubeOk;
  tabSceneCube.setAttribute("aria-disabled", String(!cubeOk));
  if (!cubeOk) {
    tabSceneCube.title = `Hypercube needs 2ᵈ vertices (only available up to ${MAX_HYPERCUBE_DIM}D here).`;
  } else {
    tabSceneCube.removeAttribute("title");
  }
}

function setScenePointMode(mode) {
  if (mode !== "axes" && mode !== "cube" && mode !== "cloud") {
    return;
  }
  if (mode === "cube" && !dimensionsAllowHypercube(cfg().dimensions)) {
    return;
  }
  scenePointMode = mode;
  clearPcaTripleHighlight();
  if (mode === "cloud") {
    invalidateCloudCache();
  }
  updateSceneTabs();
  buildLegend();
  activateUrlStateSync();
  render();
}

tabSceneAxes?.addEventListener("click", () => setScenePointMode("axes"));
tabSceneCube?.addEventListener("click", () => setScenePointMode("cube"));
tabSceneCloud?.addEventListener("click", () => setScenePointMode("cloud"));

resetButton.addEventListener("click", () => {
  stopActiveHold();
  rotationAngles = Object.fromEntries(cfg().rotationPlanes.map((plane) => [plane.label, 0]));
  viewPlane = freshDefaultPlane();
  clearPcaTripleHighlight();
  projectionZoom = 1;
  lastDepthNormal = null;
  activateUrlStateSync();
  render();
});

randomViewButton.addEventListener("click", () => {
  stopActiveHold();
  rotationAngles = Object.fromEntries(cfg().rotationPlanes.map((plane) => [plane.label, 0]));
  clearPcaTripleHighlight();
  if (scenePointMode === "cloud") {
    invalidateCloudCache();
  }
  viewPlane = randomViewPlaneFromSeed(Date.now());
  lastDepthNormal = null;
  activateUrlStateSync();
  render();
});

pcaViewButton?.addEventListener("click", () => {
  stopActiveHold();
  rotationAngles = Object.fromEntries(cfg().rotationPlanes.map((plane) => [plane.label, 0]));
  const { plane, labels } = applyPcaViewFromRandomTriple(Date.now());
  viewPlane = plane;
  pcaTripleLabels = labels;
  lastDepthNormal = null;
  activateUrlStateSync();
  render();
});

projectionZoomInBtn?.addEventListener("click", () => {
  setProjectionZoom(projectionZoom * PROJECTION_ZOOM_FACTOR);
});

projectionZoomOutBtn?.addEventListener("click", () => {
  setProjectionZoom(projectionZoom / PROJECTION_ZOOM_FACTOR);
});

projectionZoomResetBtn?.addEventListener("click", () => {
  resetProjectionZoom();
});

window.addEventListener("pointerup", stopActiveHold);
window.addEventListener("blur", stopActiveHold);

applyUrlStateFromLocation();
syncDomCopy();
buildControls();
buildLegend();
updateTabs();
updateSceneTabs();
setShowFrameEdges(showFrameEdges, false);
setShowRotationAxisHint(showRotationAxisHint, false);
setShowProjectionCoords(showProjectionCoords, false);

if (canvasStack || primaryCanvasWrap) {
  const ro = new ResizeObserver(() => resizeAllCanvases());
  if (canvasStack) {
    ro.observe(canvasStack);
  }
  if (primaryCanvasWrap) {
    ro.observe(primaryCanvasWrap);
  }
}
window.addEventListener("resize", resizeAllCanvases);
requestAnimationFrame(resizeAllCanvases);
