const DIMENSIONS = 4;
const ROTATION_STEP = 0.16;

const POINTS = [
  { label: "O", vector: [0, 0, 0, 0], color: "#101820" },
  { label: "e1", vector: [1, 0, 0, 0], color: "#e0562a" },
  { label: "e2", vector: [0, 1, 0, 0], color: "#179c8f" },
  { label: "e3", vector: [0, 0, 1, 0], color: "#5876ff" },
  { label: "e4", vector: [0, 0, 0, 1], color: "#cc4bc2" },
];

const canvas = document.getElementById("projectionCanvas");
const ctx = canvas.getContext("2d");
const knobGrid = document.getElementById("knobGrid");
const uVectorEl = document.getElementById("uVector");
const vVectorEl = document.getElementById("vVector");
const legendEl = document.getElementById("legend");
const resetButton = document.getElementById("resetButton");

const basis = Array.from({ length: DIMENSIONS }, (_, index) =>
  Array.from({ length: DIMENSIONS }, (_, entryIndex) => (index === entryIndex ? 1 : 0))
);

let viewPlane = defaultPlane();

function defaultPlane() {
  return {
    u: [1, 0, 0, 0],
    v: [0, 1, 0, 0],
  };
}

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

function rotatePlane(dimensionIndex, direction) {
  const axis = basis[dimensionIndex];
  const candidateU = add(viewPlane.u, scale(axis, direction * ROTATION_STEP));
  const candidateV = add(viewPlane.v, scale(axis, direction * ROTATION_STEP * 0.55));
  viewPlane = orthonormalize(candidateU, candidateV);
  render();
}

function projectPoint(point) {
  return {
    x: dot(point, viewPlane.u),
    y: dot(point, viewPlane.v),
  };
}

function drawGrid(width, height, centerX, centerY, scaleFactor) {
  ctx.save();
  ctx.strokeStyle = "rgba(24, 34, 24, 0.08)";
  ctx.lineWidth = 1;

  for (let value = -2; value <= 2; value += 0.5) {
    const offset = value * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(0, centerY + offset);
    ctx.lineTo(width, centerY + offset);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + offset, 0);
    ctx.lineTo(centerX + offset, height);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(24, 34, 24, 0.22)";
  ctx.lineWidth = 1.6;

  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();
  ctx.restore();
}

function drawPoints(width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const scaleFactor = Math.min(width, height) * 0.28;

  drawGrid(width, height, centerX, centerY, scaleFactor);

  POINTS.forEach((point) => {
    const projected = projectPoint(point.vector);
    const x = centerX + projected.x * scaleFactor;
    const y = centerY - projected.y * scaleFactor;

    ctx.beginPath();
    ctx.fillStyle = point.color;
    ctx.arc(x, y, point.label === "O" ? 8 : 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '15px "IBM Plex Mono", monospace';
    ctx.fillStyle = "#182218";
    ctx.fillText(`${point.label} (${projected.x.toFixed(2)}, ${projected.y.toFixed(2)})`, x + 16, y - 14);
  });
}

function render() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  drawPoints(width, height);

  uVectorEl.textContent = formatVector(viewPlane.u);
  vVectorEl.textContent = formatVector(viewPlane.v);
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
  basis.forEach((_, index) => {
    const row = document.createElement("div");
    row.className = "knob-row";

    const label = document.createElement("strong");
    label.textContent = `Dimension ${index + 1}`;

    const pair = document.createElement("div");
    pair.className = "knob-pair";

    const minusButton = document.createElement("button");
    minusButton.className = "knob";
    minusButton.type = "button";
    minusButton.textContent = "−";
    minusButton.addEventListener("click", () => rotatePlane(index, -1));

    const plusButton = document.createElement("button");
    plusButton.className = "knob";
    plusButton.type = "button";
    plusButton.textContent = "+";
    plusButton.addEventListener("click", () => rotatePlane(index, 1));

    pair.append(minusButton, plusButton);
    row.append(label, pair);
    knobGrid.appendChild(row);
  });
}

function buildLegend() {
  POINTS.forEach((point) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = point.color;

    const text = document.createElement("span");
    text.textContent =
      point.label === "O" ? "O = origin (0, 0, 0, 0)" : `${point.label} = ${formatVector(point.vector)}`;

    item.append(swatch, text);
    legendEl.appendChild(item);
  });
}

resetButton.addEventListener("click", () => {
  viewPlane = defaultPlane();
  render();
});

buildControls();
buildLegend();
render();
