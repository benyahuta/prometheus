/* Shared helpers for the deep-dive chapter pages */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const C = {
  blue: "#58c4dd", red: "#fc6255", yellow: "#f4d345", green: "#83c167",
  teal: "#5cd0b3", purple: "#9a72ac", gold: "#f0ac5f",
  ink: "#e8eaf0", muted: "#8b93a7", faint: "#5c6478",
  grid: "#1a2233", axis: "#39435c", bg: "#0b0e14", panel2: "#151b28",
};

function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* diverging heat: blue (negative) ↔ dark neutral ↔ red (positive) */
function heat(v, max = 1) {
  const t = Math.max(-1, Math.min(1, v / max));
  const mid = [40, 46, 61];
  const pole = t < 0 ? [88, 196, 221] : [252, 98, 85];
  const s = Math.abs(t);
  const c = mid.map((m, i) => Math.round(m + (pole[i] - m) * s));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/* sequential heat for probabilities: dark → blue */
function heatSeq(p) {
  const from = [21, 27, 40], to = [88, 196, 221];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * p));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (text != null) el.textContent = text;
  return el;
}

function softmaxArr(zs, T = 1) {
  const m = Math.max(...zs);
  const exps = zs.map((z) => Math.exp((z - m) / T));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function matmul(A, B) {
  return A.map((row) =>
    B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0))
  );
}
function transpose(M) { return M[0].map((_, j) => M.map((r) => r[j])); }

/* Render a matrix as a heat grid.
   opts: rows (row labels), cols (col labels), max (heat scale),
   colorFn (v,i,j → css color), fmt (v → text), cellW, cellH, onRowClick */
function matrixEl(container, M, opts = {}) {
  const el = typeof container === "string" ? $(container) : container;
  el.innerHTML = "";
  const nc = M[0].length;
  const hasRows = !!opts.rows, hasCols = !!opts.cols;
  el.style.gridTemplateColumns = `repeat(${nc + (hasRows ? 1 : 0)}, auto)`;
  const cw = opts.cellW || 44, ch = opts.cellH || 32;
  const mk = (cls, text) => {
    const d = document.createElement("div");
    d.className = "mcell " + cls;
    d.style.width = cw + "px"; d.style.height = ch + "px";
    if (text != null) d.textContent = text;
    el.appendChild(d);
    return d;
  };
  if (hasCols) {
    if (hasRows) mk("colhead", "");
    opts.cols.forEach((c) => mk("colhead", c));
  }
  M.forEach((row, i) => {
    if (hasRows) mk("rowhead", opts.rows[i]);
    row.forEach((v, j) => {
      const cell = mk("", opts.fmt ? opts.fmt(v, i, j) : (Math.round(v * 100) / 100).toFixed(2));
      cell.style.background = opts.colorFn ? opts.colorFn(v, i, j) : heat(v, opts.max || 1);
      if (opts.onRowClick) {
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => opts.onRowClick(i));
      }
      if (opts.cellRef) opts.cellRef(cell, i, j);
    });
  });
  return el;
}
