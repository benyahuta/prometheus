/* Shared helpers for the deep-dive chapter pages */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const C = {
  blue: "#58c4dd", red: "#fc6255", yellow: "#f4d345", green: "#83c167",
  teal: "#5cd0b3", purple: "#9a72ac", gold: "#f0ac5f",
  ink: "#eceee8", muted: "#9aa79c", faint: "#7b8578",
  grid: "#1c251d", axis: "#3c473d", bg: "#0d120e", panel2: "#171e18",
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
  // token-labeled rows with no column heads are a stack of individual
  // per-token vectors, not one entangled matrix — let the rows breathe
  el.classList.toggle("vec-rows", hasRows && !hasCols);
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

/* ============================================================
   Scroll-triggered matrix-multiplication animation
   Renders  A × B = C  and fills C cell by cell, highlighting the
   row of A and column of B being combined, with the arithmetic
   spelled out below. Starts when scrolled into view (once).
   ============================================================ */
function onScrollOnce(el, fn) {
  /* fire only once the element has risen to roughly mid-screen:
     shrink the observer's viewport by 45% from the bottom, so the
     figure must cross into the top 55% of the screen to trigger */
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { obs.disconnect(); fn(); }
    });
  }, { rootMargin: "0px 0px -45% 0px", threshold: 0.01 });
  obs.observe(el);
}

function matMulAnim(host, cfg) {
  host = typeof host === "string" ? $(host) : host;
  host.innerHTML = "";
  const row = document.createElement("div");
  row.className = "mat-row";
  const mkFig = (label, sub) => {
    const f = document.createElement("div");
    f.className = "mat-fig";
    f.innerHTML = `<div class="mat-label">${label}</div><div class="matrix"></div>` +
      (sub ? `<div class="mat-sub">${sub}</div>` : "");
    row.appendChild(f);
    return f.querySelector(".matrix");
  };
  const elA = mkFig(cfg.aLabel, cfg.aSub);
  const op1 = document.createElement("div"); op1.className = "mat-op"; op1.textContent = "×"; row.appendChild(op1);
  const elB = mkFig(cfg.bLabel, cfg.bSub);
  const op2 = document.createElement("div"); op2.className = "mat-op"; op2.textContent = "="; row.appendChild(op2);
  const elC = mkFig(cfg.cLabel, cfg.cSub);
  host.appendChild(row);
  const read = document.createElement("div");
  read.className = "mm-read";
  read.innerHTML = cfg.idleText || "&nbsp;";
  host.appendChild(read);
  const replay = document.createElement("button");
  replay.className = "link-btn";
  replay.textContent = "replay ▶";
  replay.style.display = "none";
  host.appendChild(replay);

  const A = cfg.A, B = cfg.B;
  const Craw = matmul(A, B);
  const Cm = cfg.scaleC ? Craw.map((r) => r.map(cfg.scaleC)) : Craw;
  const cw = cfg.cellW || 44, chh = cfg.cellH || 30;
  const aCells = [], bCells = [], cCells = [];
  matrixEl(elA, A, { rows: cfg.aRows, max: cfg.maxA || 1, cellW: cw, cellH: chh,
    fmt: (v) => v.toFixed(2), cellRef: (c, i, j) => { (aCells[i] ??= [])[j] = c; }, ...(cfg.optsA || {}) });
  matrixEl(elB, B, { cols: cfg.bCols, max: cfg.maxB || 1, cellW: cw, cellH: chh,
    fmt: (v) => v.toFixed(2), cellRef: (c, i, j) => { (bCells[i] ??= [])[j] = c; }, ...(cfg.optsB || {}) });
  matrixEl(elC, Cm, { rows: cfg.aRows, cols: cfg.bCols, cellW: cw, cellH: chh,
    fmt: () => "", colorFn: () => "transparent", cellRef: (c, i, j) => { (cCells[i] ??= [])[j] = c; } });
  cCells.flat().forEach((c) => c.classList.add("mm-empty"));

  let gen = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtC = cfg.fmtC || ((v) => v.toFixed(2));
  const colorC = cfg.colorC || ((v) => heat(v, cfg.maxC || 1));

  async function run(fast) {
    const myGen = ++gen;
    cCells.flat().forEach((c) => {
      c.textContent = ""; c.style.background = "transparent"; c.classList.add("mm-empty");
    });
    const stepMs = fast ? 100 : (cfg.stepMs || 320);
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B[0].length; j++) {
        if (myGen !== gen) return;
        aCells.flat().forEach((c) => c.classList.remove("mm-hla"));
        bCells.flat().forEach((c) => c.classList.remove("mm-hlb"));
        aCells[i].forEach((c) => c.classList.add("mm-hla"));
        bCells.forEach((r) => r[j].classList.add("mm-hlb"));
        const terms = A[i].map((a, k) => a * B[k][j]);
        const sum = terms.reduce((s, t) => s + t, 0);
        read.innerHTML = cfg.termText
          ? cfg.termText(i, j, A[i], B.map((r) => r[j]), sum, Cm[i][j])
          : A[i].map((a, k) => `(${a.toFixed(2)})(${B[k][j].toFixed(2)})`).join(" + ") +
            ` = <b>${sum.toFixed(2)}</b>`;
        const cell = cCells[i][j];
        /* phase 1: point at the destination cell, so row × col → cell is unmistakable */
        cell.classList.add("mm-target");
        await sleep(stepMs * 0.45);
        if (myGen !== gen) return;
        /* phase 2: the value lands */
        cell.classList.remove("mm-empty");
        cell.classList.add("mm-fill");
        cell.textContent = fmtC(Cm[i][j]);
        cell.style.background = colorC(Cm[i][j], i, j);
        await sleep(stepMs * 0.55);
        cell.classList.remove("mm-fill", "mm-target");
      }
    }
    if (myGen !== gen) return;
    aCells.flat().forEach((c) => c.classList.remove("mm-hla"));
    bCells.flat().forEach((c) => c.classList.remove("mm-hlb"));
    read.innerHTML = cfg.doneText || "&nbsp;";
    replay.style.display = "";
    cfg.onDone?.(elC);
  }

  replay.addEventListener("click", () => run(false));
  if (cfg.autoStart !== false) onScrollOnce(host, () => run(false));
  return { run, elC, C: Cm };
}

/* Element-wise matrix addition animation: A + B = C, cell by cell.
   Same visual language as matMulAnim; scroll-triggered by default. */
function matAddAnim(host, cfg) {
  host = typeof host === "string" ? $(host) : host;
  host.innerHTML = "";
  const row = document.createElement("div");
  row.className = "mat-row";
  const mkFig = (label, sub) => {
    const f = document.createElement("div");
    f.className = "mat-fig";
    f.innerHTML = `<div class="mat-label">${label}</div><div class="matrix"></div>` +
      (sub ? `<div class="mat-sub">${sub}</div>` : "");
    row.appendChild(f);
    return f.querySelector(".matrix");
  };
  const elA = mkFig(cfg.aLabel, cfg.aSub);
  const op1 = document.createElement("div"); op1.className = "mat-op"; op1.textContent = "+"; row.appendChild(op1);
  const elB = mkFig(cfg.bLabel, cfg.bSub);
  const op2 = document.createElement("div"); op2.className = "mat-op"; op2.textContent = "="; row.appendChild(op2);
  const elC = mkFig(cfg.cLabel, cfg.cSub);
  host.appendChild(row);
  const read = document.createElement("div");
  read.className = "mm-read";
  read.innerHTML = "&nbsp;";
  host.appendChild(read);
  const replay = document.createElement("button");
  replay.className = "link-btn";
  replay.textContent = "replay ▶";
  replay.style.display = "none";
  host.appendChild(replay);

  const A = cfg.A, B = cfg.B;
  const Cm = A.map((r, i) => r.map((v, j) => v + B[i][j]));
  const cw = cfg.cellW || 44, chh = cfg.cellH || 30;
  const aCells = [], bCells = [], cCells = [];
  matrixEl(elA, A, { rows: cfg.rows, max: cfg.max || 1, cellW: cw, cellH: chh,
    fmt: (v) => v.toFixed(2), cellRef: (c, i, j) => { (aCells[i] ??= [])[j] = c; } });
  matrixEl(elB, B, { max: cfg.max || 1, cellW: cw, cellH: chh,
    fmt: (v) => v.toFixed(2), cellRef: (c, i, j) => { (bCells[i] ??= [])[j] = c; } });
  matrixEl(elC, Cm, { max: cfg.maxC || cfg.max || 1, cellW: cw, cellH: chh,
    fmt: () => "", colorFn: () => "transparent", cellRef: (c, i, j) => { (cCells[i] ??= [])[j] = c; } });
  cCells.flat().forEach((c) => c.classList.add("mm-empty"));

  let gen = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run(fast) {
    const myGen = ++gen;
    cCells.flat().forEach((c) => {
      c.textContent = ""; c.style.background = "transparent"; c.classList.add("mm-empty");
    });
    const stepMs = fast ? 90 : (cfg.stepMs || 260);
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < A[0].length; j++) {
        if (myGen !== gen) return;
        aCells.flat().forEach((c) => c.classList.remove("mm-hla"));
        bCells.flat().forEach((c) => c.classList.remove("mm-hlb"));
        aCells[i][j].classList.add("mm-hla");
        bCells[i][j].classList.add("mm-hlb");
        read.innerHTML = cfg.termText
          ? cfg.termText(i, j, A[i][j], B[i][j], Cm[i][j])
          : `${A[i][j].toFixed(2)} + ${B[i][j].toFixed(2)} = <b>${Cm[i][j].toFixed(2)}</b>`;
        const cell = cCells[i][j];
        cell.classList.add("mm-target");
        await sleep(stepMs * 0.4);
        if (myGen !== gen) return;
        cell.classList.remove("mm-empty");
        cell.classList.add("mm-fill");
        cell.textContent = Cm[i][j].toFixed(2);
        cell.style.background = heat(Cm[i][j], cfg.maxC || cfg.max || 1);
        await sleep(stepMs * 0.6);
        cell.classList.remove("mm-fill", "mm-target");
      }
    }
    if (myGen !== gen) return;
    aCells.flat().forEach((c) => c.classList.remove("mm-hla"));
    bCells.flat().forEach((c) => c.classList.remove("mm-hlb"));
    read.innerHTML = cfg.doneText || "&nbsp;";
    replay.style.display = "";
    cfg.onDone?.(elC);
  }

  replay.addEventListener("click", () => run(false));
  if (cfg.autoStart !== false) onScrollOnce(host, () => run(false));
  return { run, elC, C: Cm };
}

/* Element-wise function animation: C = f(A), cell by cell (e.g. GELU). */
function matMapAnim(host, cfg) {
  host = typeof host === "string" ? $(host) : host;
  host.innerHTML = "";
  const row = document.createElement("div");
  row.className = "mat-row";
  const mkFig = (label, sub) => {
    const f = document.createElement("div");
    f.className = "mat-fig";
    f.innerHTML = `<div class="mat-label">${label}</div><div class="matrix"></div>` +
      (sub ? `<div class="mat-sub">${sub}</div>` : "");
    row.appendChild(f);
    return f.querySelector(".matrix");
  };
  const elA = mkFig(cfg.aLabel, cfg.aSub);
  const op = document.createElement("div");
  op.className = "mat-op";
  op.innerHTML = cfg.opLabel || "→";
  op.style.fontSize = "1rem";
  row.appendChild(op);
  const elC = mkFig(cfg.cLabel, cfg.cSub);
  host.appendChild(row);
  const read = document.createElement("div");
  read.className = "mm-read";
  read.innerHTML = "&nbsp;";
  host.appendChild(read);
  const replay = document.createElement("button");
  replay.className = "link-btn";
  replay.textContent = "replay ▶";
  replay.style.display = "none";
  host.appendChild(replay);

  const A = cfg.A;
  const Cm = A.map((r) => r.map(cfg.fn));
  const cw = cfg.cellW || 44, chh = cfg.cellH || 30;
  const aCells = [], cCells = [];
  matrixEl(elA, A, { rows: cfg.rows, max: cfg.max || 1, cellW: cw, cellH: chh,
    fmt: (v) => v.toFixed(cfg.dp ?? 2), cellRef: (c, i, j) => { (aCells[i] ??= [])[j] = c; } });
  matrixEl(elC, Cm, { rows: cfg.rows, max: cfg.maxC || cfg.max || 1, cellW: cw, cellH: chh,
    fmt: () => "", colorFn: () => "transparent", cellRef: (c, i, j) => { (cCells[i] ??= [])[j] = c; } });
  cCells.flat().forEach((c) => c.classList.add("mm-empty"));

  let gen = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run(fast) {
    const myGen = ++gen;
    cCells.flat().forEach((c) => {
      c.textContent = ""; c.style.background = "transparent"; c.classList.add("mm-empty");
    });
    const stepMs = fast ? 70 : (cfg.stepMs || 220);
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < A[0].length; j++) {
        if (myGen !== gen) return;
        aCells.flat().forEach((c) => c.classList.remove("mm-hla"));
        aCells[i][j].classList.add("mm-hla");
        read.innerHTML = cfg.termText
          ? cfg.termText(i, j, A[i][j], Cm[i][j])
          : `f(${A[i][j].toFixed(2)}) = <b>${Cm[i][j].toFixed(2)}</b>`;
        const cell = cCells[i][j];
        cell.classList.add("mm-target");
        await sleep(stepMs * 0.4);
        if (myGen !== gen) return;
        cell.classList.remove("mm-empty");
        cell.classList.add("mm-fill");
        cell.textContent = Cm[i][j].toFixed(cfg.dp ?? 2);
        cell.style.background = cfg.colorC ? cfg.colorC(Cm[i][j], i, j) : heat(Cm[i][j], cfg.maxC || cfg.max || 1);
        if (cfg.cellDone) cfg.cellDone(cell, i, j, A[i][j], Cm[i][j]);
        await sleep(stepMs * 0.6);
        cell.classList.remove("mm-fill", "mm-target");
      }
    }
    if (myGen !== gen) return;
    aCells.flat().forEach((c) => c.classList.remove("mm-hla"));
    read.innerHTML = cfg.doneText || "&nbsp;";
    replay.style.display = "";
    cfg.onDone?.(elC);
  }

  replay.addEventListener("click", () => run(false));
  if (cfg.autoStart !== false) onScrollOnce(host, () => run(false));
  return { run, elC, C: Cm };
}
