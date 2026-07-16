/* ============================================================
   Inside the Transformer — interactive figures
   All "model" behavior is simplified but directionally honest.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* Manim palette (validated order: blue, red, yellow, green) */
const C = {
  blue: "#58c4dd",
  red: "#fc6255",
  yellow: "#f4d345",
  green: "#83c167",
  teal: "#5cd0b3",
  purple: "#9a72ac",
  gold: "#f0ac5f",
  ink: "#eceee8",
  muted: "#9aa79c",
  faint: "#7b8578",
  grid: "#1c251d",
  axis: "#3c473d",
  bg: "#0d120e",
};

function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* Deterministic hash → number in [0,1) */
function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (text != null) el.textContent = text;
  return el;
}

/* ============================================================
   CH 1 — TOKENIZATION
   ============================================================ */
(function initTokenizer() {
  const COMMON = new Set([
    "the","a","an","and","or","but","of","to","in","on","at","is","are","was",
    "were","it","its","i","you","he","she","we","they","this","that","with",
    "for","so","not","be","have","has","do","cat","dog","sat","much","very",
    "big","small","new","time","people","can","will","just","love"
  ]);
  const SUFFIXES = ["ability","ingly","ation","ment","ness","able","ible","ing","ed","ly","er","est","ism","ist","s"];

  function splitWord(word) {
    const lower = word.toLowerCase();
    if (lower.length <= 4 || COMMON.has(lower)) return [word];
    const pieces = [];
    let rest = word;
    for (const suf of SUFFIXES) {
      if (rest.length > suf.length + 2 && rest.toLowerCase().endsWith(suf)) {
        pieces.unshift(rest.slice(rest.length - suf.length));
        rest = rest.slice(0, rest.length - suf.length);
        break;
      }
    }
    const chunks = [];
    let i = 0;
    while (i < rest.length) {
      const remaining = rest.length - i;
      let size = remaining <= 5 ? remaining : 3 + Math.floor(hash01(rest, i) * 3);
      if (remaining - size === 1) size += 1;
      chunks.push(rest.slice(i, i + size));
      i += size;
    }
    return [...chunks, ...pieces];
  }

  function tokenize(text) {
    const tokens = [];
    const re = /(\s*[\p{L}\p{N}']+|\s*[\p{Emoji_Presentation}]+|\s*[^\s\p{L}\p{N}]+)/gu;
    for (const m of text.matchAll(re)) {
      const raw = m[0];
      const lead = raw.match(/^\s*/)[0];
      const core = raw.slice(lead.length);
      if (/[\p{L}\p{N}']/u.test(core)) {
        splitWord(core).forEach((p, idx) => tokens.push((idx === 0 ? lead : "") + p));
      } else {
        tokens.push(lead + core);
      }
    }
    return tokens;
  }

  const CHIP_COLORS = [C.blue, C.red, C.yellow, C.green, C.teal, C.purple, C.gold];
  const input = $("#tok-input");
  const strip = $("#token-strip");

  function render() {
    const text = input.value;
    const tokens = text.trim() ? tokenize(text) : [];
    strip.innerHTML = "";
    tokens.forEach((tok, i) => {
      const col = CHIP_COLORS[Math.floor(hash01(tok.trim().toLowerCase() || String(i)) * CHIP_COLORS.length)];
      const chip = document.createElement("span");
      chip.className = "token-chip";
      chip.style.color = col;
      chip.style.borderColor = alpha(col, 0.55);
      chip.style.background = alpha(col, 0.07);
      chip.textContent = tok;
      const id = document.createElement("span");
      id.className = "tok-id";
      id.textContent = "ID " + (1000 + Math.floor(hash01(tok.trim().toLowerCase()) * 49000));
      chip.appendChild(id);
      strip.appendChild(chip);
    });
    $("#tok-count").textContent = tokens.length;
    $("#char-count").textContent = text.length;
    $("#tok-ratio").textContent = tokens.length ? (text.length / tokens.length).toFixed(1) : "0";
  }

  input.addEventListener("input", render);
  $$("button[data-try]").forEach((b) =>
    b.addEventListener("click", () => { input.value = b.dataset.try; render(); input.focus(); })
  );
  render();
})();

/* ============================================================
   CH 2 — EMBEDDINGS
   ============================================================ */
(function initEmbeddings() {
  /* --- one token as a vector --- */
  const WORDS = ["cat", "kitten", "dog", "pizza", "moon", "algebra"];
  const FAMILY = { cat: "feline", kitten: "feline", dog: "canine", pizza: "food", moon: "space", algebra: "math" };

  function vecValue(word, dim) {
    const base = Math.sin((dim + 1) * 1.7 + hash01(FAMILY[word]) * 40) * 0.9;
    const personal = (hash01(word, dim) - 0.5) * 0.55;
    return Math.max(-1, Math.min(1, base + personal));
  }
  /* diverging blue ↔ red around a dark neutral midpoint */
  function divergingColor(v) {
    const mid = [40, 46, 61];
    const pole = v < 0 ? [88, 196, 221] : [252, 98, 85];
    const t = Math.abs(v);
    const c = mid.map((m, i) => Math.round(m + (pole[i] - m) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  let currentWord = WORDS[0];
  const picker = $("#embed-word-picker");
  WORDS.forEach((w) => {
    const b = document.createElement("button");
    b.className = "word-pill" + (w === currentWord ? " active" : "");
    b.textContent = w;
    b.addEventListener("click", () => {
      currentWord = w;
      $$(".word-pill").forEach((p) => p.classList.toggle("active", p === b));
      renderStrip();
    });
    picker.appendChild(b);
  });

  const stripEl = $("#vector-strip");
  const dimSlider = $("#dim-slider");
  function renderStrip() {
    const dims = +dimSlider.value;
    $("#dim-out").textContent = dims;
    stripEl.innerHTML = "";
    for (let d = 0; d < dims; d++) {
      const v = vecValue(currentWord, d);
      const cell = document.createElement("div");
      cell.className = "vec-cell";
      cell.style.background = divergingColor(v);
      cell.dataset.v = v.toFixed(2);
      stripEl.appendChild(cell);
    }
  }
  dimSlider.addEventListener("input", renderStrip);
  renderStrip();

  /* --- the embedding space, in 3-D ---
     Hand-rolled perspective projection onto the SVG: drag to orbit
     (yaw/pitch), hover a word for its coordinates and nearest
     neighbours by 3-D cosine similarity. */
  const W = 720, H = 520;
  const OX = 360, OY = 258;      // screen origin in px
  const U = 46;                  // px per unit at zero depth
  const F = 18;                  // perspective distance (units)
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CLUSTERS = [
    { name: "animals", color: C.blue, cx: -3.4, cy: 2.2, cz: -1.0,
      words: ["cat", "dog", "kitten", "puppy", "horse", "tiger"] },
    { name: "food", color: C.yellow, cx: 2.9, cy: 2.5, cz: 1.2,
      words: ["pizza", "apple", "cake", "sushi", "bread"] },
    { name: "feelings", color: C.red, cx: -3.5, cy: -2.4, cz: 1.4,
      words: ["happy", "sad", "angry", "calm"] },
    { name: "royalty", color: C.green, cx: 3.0, cy: -2.2, cz: -1.3,
      words: ["king", "queen", "man", "woman", "prince"] },
  ];
  /* hand-placed offsets (units) so king − man + woman lands exactly on queen */
  const OFFSETS = {
    king: [-0.9, 0.75, -0.45], queen: [0.95, 0.65, 0.45],
    man: [-1.15, -0.7, -0.55], woman: [0.7, -0.8, 0.35],
    prince: [-0.05, -0.05, 0.05],
  };

  const svg = $("#embed-map");

  /* defs: arrowheads */
  const defs = svgEl("defs");
  const mkMarker = (id, color) => {
    const m = svgEl("marker", {
      id, viewBox: "0 0 10 10", refX: 8.5, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse",
    });
    m.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
    defs.appendChild(m);
  };
  mkMarker("arr-axis", C.axis);
  mkMarker("arr-teal", C.teal);
  CLUSTERS.forEach((cl) => mkMarker("arr-" + cl.name, cl.color));
  svg.appendChild(defs);

  /* stable layers, re-projected every frame */
  const floorG = svgEl("g");
  const axisG = svgEl("g");
  const analogyG = svgEl("g");
  const vectorG = svgEl("g");
  const dotsG = svgEl("g");
  [floorG, axisG, analogyG, vectorG, dotsG].forEach((g) => svg.appendChild(g));

  /* camera */
  let yaw = -0.55, pitch = 0.38;

  function project(x, y, z) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;          // depth: larger = closer
    const k = F / (F - z2);
    return { px: OX + x1 * U * k, py: OY - y2 * U * k, depth: z2, k };
  }

  /* floor grid on the x–z plane, below the clusters */
  const FLOOR = -4.8, EXT = 6;
  const floorLines = [];
  for (let i = -EXT; i <= EXT; i += 2) {
    const a = svgEl("line", { stroke: C.grid, "stroke-width": 1 });
    const b = svgEl("line", { stroke: C.grid, "stroke-width": 1 });
    floorG.appendChild(a); floorG.appendChild(b);
    floorLines.push({ el: a, from: [i, FLOOR, -EXT], to: [i, FLOOR, EXT] });
    floorLines.push({ el: b, from: [-EXT, FLOOR, i], to: [EXT, FLOOR, i] });
  }

  /* the three axes */
  const AXES = [
    { from: [-5.4, 0, 0], to: [5.4, 0, 0], label: "dim 1" },
    { from: [0, -4.6, 0], to: [0, 4.6, 0], label: "dim 2" },
    { from: [0, 0, -5.4], to: [0, 0, 5.4], label: "dim 3" },
  ];
  AXES.forEach((ax) => {
    ax.el = svgEl("line", { stroke: C.axis, "stroke-width": 1.5, "marker-end": "url(#arr-axis)" });
    ax.labelEl = svgEl("text", { "text-anchor": "middle", fill: C.faint, "font-size": 12.5, "font-style": "italic" }, ax.label);
    axisG.appendChild(ax.el);
    axisG.appendChild(ax.labelEl);
  });

  /* words */
  const dots = []; // { word, x, y, z, g, circle, label, cluster }
  CLUSTERS.forEach((cl) => {
    cl.labelEl = svgEl("text", {
      "text-anchor": "middle", fill: alpha(cl.color, 0.5),
      "font-size": 13, "font-style": "italic",
    }, cl.name);
    cl.words.forEach((w) => {
      const off = OFFSETS[w] || [
        (hash01(w, 1) - 0.5) * 2.4,
        (hash01(w, 2) - 0.5) * 2.0,
        (hash01(w, 3) - 0.5) * 1.9,
      ];
      const g = svgEl("g", { class: "embed-dot" });
      const circle = svgEl("circle", { fill: cl.color, stroke: C.bg, "stroke-width": 1.5 });
      const label = svgEl("text", { "text-anchor": "middle", fill: C.ink }, w);
      g.appendChild(circle); g.appendChild(label);
      dots.push({ word: w, x: cl.cx + off[0], y: cl.cy + off[1], z: cl.cz + off[2], g, circle, label, cluster: cl });
    });
  });

  const readout = $("#neighbor-readout");

  function cosine(a, b) {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    const na = Math.hypot(a.x, a.y, a.z), nb = Math.hypot(b.x, b.y, b.z);
    return na && nb ? dot / (na * nb) : 0;
  }
  function neighborsOf(d) {
    return dots
      .filter((o) => o !== d)
      .map((o) => ({ d: o, sim: cosine(d, o) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
  }

  /* hover tag (HTML, so it stays crisp above the SVG) */
  const wrap = svg.closest(".plane-wrap");
  const tip = document.createElement("div");
  tip.className = "embed-tip";
  wrap.appendChild(tip);

  let hovered = null;
  function updateTip() {
    if (!hovered) { tip.classList.remove("show"); return; }
    const d = hovered;
    const p = project(d.x, d.y, d.z);
    tip.style.left = (p.px / W) * 100 + "%";
    tip.style.top = (p.py / H) * 100 + "%";
    tip.classList.toggle("below", p.py < 120);
    tip.innerHTML =
      `<b>${d.word}</b> <span class="tip-pos">(${d.x.toFixed(1)}, ${d.y.toFixed(1)}, ${d.z.toFixed(1)})</span>` +
      `<span class="tip-sim">most similar: ` +
      neighborsOf(d).map((n) =>
        `<i style="color:${n.d.cluster.color}">${n.d.word}</i> <span class="tip-cos">${n.sim.toFixed(2)}</span>`
      ).join(" · ") + `</span>`;
    tip.classList.add("show");
  }

  /* --- analogy overlay, drawn in 3-D and re-projected each frame --- */
  let prims = [];
  function clearAnalogy() { prims = []; analogyG.innerHTML = ""; }
  function addPrimLine(from, to, dash) {
    const el = svgEl("line", {
      stroke: C.teal, "stroke-width": 2.4, "stroke-linecap": "round",
      "marker-end": "url(#arr-teal)",
    });
    if (dash) el.setAttribute("stroke-dasharray", "7 6");
    analogyG.appendChild(el);
    prims.push({ type: "line", from, to, el, t0: performance.now() });
  }
  function addPrimLabel(pos, text) {
    const el = svgEl("text", {
      "text-anchor": "middle", "font-size": 13,
      "font-style": "italic", fill: C.teal,
      stroke: C.bg, "stroke-width": 3, "paint-order": "stroke",
    }, text);
    analogyG.appendChild(el);
    prims.push({ type: "label", pos, el });
  }
  function addPrimRing(pos) {
    const el = svgEl("circle", {
      fill: "none", stroke: C.teal, "stroke-width": 2, "stroke-dasharray": "4 4",
    });
    analogyG.appendChild(el);
    prims.push({ type: "ring", pos, el });
  }

  /* --- one render pass: project everything --- */
  function render() {
    floorLines.forEach(({ el, from, to }) => {
      const a = project(...from), b = project(...to);
      el.setAttribute("x1", a.px); el.setAttribute("y1", a.py);
      el.setAttribute("x2", b.px); el.setAttribute("y2", b.py);
    });

    AXES.forEach((ax) => {
      const a = project(...ax.from), b = project(...ax.to);
      ax.el.setAttribute("x1", a.px); ax.el.setAttribute("y1", a.py);
      ax.el.setAttribute("x2", b.px); ax.el.setAttribute("y2", b.py);
      const l = project(ax.to[0] * 1.13, ax.to[1] * 1.13 + (ax.to[1] ? 0 : 0.35), ax.to[2] * 1.13);
      ax.labelEl.setAttribute("x", l.px);
      ax.labelEl.setAttribute("y", l.py);
    });

    /* painter's order: far → near */
    const order = dots
      .map((d) => ({ d, p: project(d.x, d.y, d.z) }))
      .sort((a, b) => a.p.depth - b.p.depth);

    /* cluster labels first, so words always sit above them */
    CLUSTERS.forEach((cl) => {
      const p = project(cl.cx, cl.cy + 1.7, cl.cz);
      cl.labelEl.setAttribute("x", p.px);
      cl.labelEl.setAttribute("y", p.py);
      cl.labelEl.setAttribute("opacity", (0.35 + 0.4 * ((p.depth + EXT) / (2 * EXT))).toFixed(2));
      dotsG.appendChild(cl.labelEl);
    });

    order.forEach(({ d, p }) => {
      const t = Math.max(0, Math.min(1, (p.depth + EXT) / (2 * EXT))); // 0 far → 1 near
      d.fs = 14.5 * (0.75 + 0.35 * t);
      d.labelDy = 7 + 5.5 * p.k;
      d.p = p;
      d.g.setAttribute("transform", `translate(${p.px},${p.py})`);
      d.g.setAttribute("opacity", (0.45 + 0.55 * t).toFixed(2));
      d.circle.setAttribute("r", (5.5 * p.k).toFixed(1));
      d.label.setAttribute("y", (-d.labelDy).toFixed(1));
      d.label.setAttribute("font-size", d.fs.toFixed(1));
      dotsG.appendChild(d.g); // re-append in depth order
    });

    /* declutter: nearest label wins; occluded ones hide (hover still
       reveals the word in its tag) */
    const placed = [];
    const collides = (r) => placed.some((q) =>
      r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
    /* analogy captions claim their space first */
    prims.forEach((pr) => {
      if (pr.type !== "label") return;
      const p = project(...pr.pos);
      const w = pr.el.textContent.length * 13 * 0.58, h = 16;
      placed.push({ x: p.px - w / 2, y: p.py - 12 - h, w, h });
    });
    const byPriority = [...order].reverse(); // near → far
    if (hovered) byPriority.sort((a, b) => (b.d === hovered) - (a.d === hovered));
    byPriority.forEach(({ d, p }) => {
      const w = d.word.length * d.fs * 0.58, h = d.fs * 1.15;
      const r = { x: p.px - w / 2, y: p.py - d.labelDy - h, w, h };
      const hide = collides(r);
      d.label.setAttribute("opacity", hide ? 0 : 1);
      if (!hide) placed.push(r);
    });
    CLUSTERS.forEach((cl) => {
      const x = +cl.labelEl.getAttribute("x"), y = +cl.labelEl.getAttribute("y");
      const w = cl.name.length * 13 * 0.58, h = 15;
      if (collides({ x: x - w / 2, y: y - h, w, h })) cl.labelEl.setAttribute("opacity", 0);
    });

    /* vector from the origin to the hovered word */
    vectorG.innerHTML = "";
    if (hovered) {
      const o = project(0, 0, 0), p = project(hovered.x, hovered.y, hovered.z);
      vectorG.appendChild(svgEl("line", {
        x1: o.px, y1: o.py, x2: p.px, y2: p.py,
        stroke: hovered.cluster.color, "stroke-width": 2.2,
        "marker-end": `url(#arr-${hovered.cluster.name})`, opacity: 0.9,
      }));
    }

    /* analogy primitives */
    const now = performance.now();
    prims.forEach((pr) => {
      if (pr.type === "line") {
        const t = reducedMotion ? 1 : Math.min(1, (now - pr.t0) / 600);
        const e = 1 - Math.pow(1 - t, 3);
        const a = project(...pr.from);
        const b = project(
          pr.from[0] + (pr.to[0] - pr.from[0]) * e,
          pr.from[1] + (pr.to[1] - pr.from[1]) * e,
          pr.from[2] + (pr.to[2] - pr.from[2]) * e
        );
        pr.el.setAttribute("x1", a.px); pr.el.setAttribute("y1", a.py);
        pr.el.setAttribute("x2", b.px); pr.el.setAttribute("y2", b.py);
      } else if (pr.type === "label") {
        const p = project(...pr.pos);
        pr.el.setAttribute("x", p.px);
        pr.el.setAttribute("y", p.py - 12);
      } else if (pr.type === "ring") {
        const p = project(...pr.pos);
        pr.el.setAttribute("cx", p.px); pr.el.setAttribute("cy", p.py);
        pr.el.setAttribute("r", (16 * p.k).toFixed(1));
      }
    });

    updateTip();
  }

  /* --- orbit interaction --- */
  let orbiting = false, moved = false, lastPt = null, downDot = null;
  let lastInteract = 0;

  dots.forEach((d) => {
    d.g.addEventListener("pointerenter", () => { hovered = d; });
    d.g.addEventListener("pointerleave", () => { if (hovered === d) hovered = null; });
    d.g.addEventListener("pointerdown", () => { downDot = d; });
  });

  svg.addEventListener("pointerdown", (e) => {
    orbiting = true; moved = false;
    lastPt = [e.clientX, e.clientY];
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("orbiting");
    e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => {
    if (!orbiting) return;
    const dx = e.clientX - lastPt[0], dy = e.clientY - lastPt[1];
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    hovered = null;
    yaw += dx * 0.0085;
    pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * 0.0065));
    lastPt = [e.clientX, e.clientY];
    lastInteract = performance.now();
  });
  svg.addEventListener("pointerup", () => {
    if (!moved && downDot) hovered = downDot; // tap on touch = hover
    orbiting = false; downDot = null;
    lastInteract = performance.now();
    svg.classList.remove("orbiting");
  });
  svg.addEventListener("pointercancel", () => { orbiting = false; downDot = null; });
  svg.addEventListener("pointerleave", () => { if (!orbiting) hovered = null; });

  /* slow idle spin so the depth reads instantly; pauses while the
     reader is looking or dragging, and under reduced-motion */
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg);
  (function tick() {
    if (visible) {
      if (!reducedMotion && !orbiting && !hovered &&
          performance.now() - lastInteract > 2500) {
        yaw += 0.0016;
      }
      render();
    }
    requestAnimationFrame(tick);
  })();

  /* --- king − man + woman ≈ queen, in 3-D --- */
  $("#analogy-btn").addEventListener("click", () => {
    clearAnalogy();
    const get = (w) => dots.find((d) => d.word === w);
    const king = get("king"), man = get("man"), woman = get("woman"), queen = get("queen");
    const v = [woman.x - man.x, woman.y - man.y, woman.z - man.z];

    addPrimLine([man.x, man.y, man.z], [woman.x, woman.y, woman.z]);
    addPrimLabel([(man.x + woman.x) / 2, (man.y + woman.y) / 2, (man.z + woman.z) / 2], "woman − man");
    setTimeout(() => {
      addPrimLine([king.x, king.y, king.z], [king.x + v[0], king.y + v[1], king.z + v[2]], true);
      addPrimLabel([king.x + v[0] / 2, king.y + v[1] / 2, king.z + v[2] / 2], "same vector, from king");
    }, 750);
    setTimeout(() => {
      addPrimRing([queen.x, queen.y, queen.z]);
      readout.innerHTML = `<b>king − man + woman ≈ queen</b> — the same “gender” vector works anywhere in the space. Directions carry meaning.`;
    }, 1600);
    setTimeout(clearAnalogy, 6500);
  });
})();

/* ============================================================
   CH 3 — ATTENTION
   ============================================================ */
(function initAttention() {
  const BASE = ["The", "robot", "ate", "the", "apple", "because", "it", "was"];
  let variant = "hungry";
  let head = 0;
  let selected = 6; // "it"

  const MEANING_IT = {
    hungry: { 1: 0.72, 4: 0.1, 2: 0.08 },
    delicious: { 1: 0.1, 4: 0.74, 2: 0.06 },
  };
  const MEANING_OTHER = {
    2: { 1: 0.5, 4: 0.35 },
    4: { 2: 0.55, 1: 0.25 },
    8: { 6: 0.45, 1: 0.2, 4: 0.2 },
  };

  function weightsFor(i, ws) {
    const w = new Array(ws.length).fill(0);
    if (head === 0) {
      const src = i === 6 ? MEANING_IT[variant] : MEANING_OTHER[i] || null;
      if (src) for (const k in src) w[k] = src[k];
      else if (i > 0) w[i - 1] = 0.4;
    } else if (head === 1) {
      if (i > 0) w[i - 1] = 0.85;
    } else {
      w[0] = 0.8;
    }
    for (let k = 0; k < i; k++) w[k] = Math.max(w[k], 0.03);
    return w;
  }

  const svg = $("#attn-svg");
  const HEAD_COLORS = [C.blue, C.green, C.yellow];
  const words = () => [...BASE, variant + "."];

  function render() {
    const ws = words();
    svg.innerHTML = "";
    const W = 760, y = 196;
    const totalLen = ws.reduce((s, w) => s + w.length + 2.5, 0);
    let cursor = 30;
    const centers = ws.map((w) => {
      const width = ((w.length + 2.5) / totalLen) * (W - 60);
      const c = cursor + width / 2;
      cursor += width;
      return c;
    });

    const weights = weightsFor(selected, ws);
    const col = HEAD_COLORS[head];

    weights.forEach((wt, j) => {
      if (j === selected || wt <= 0.001) return;
      const x1 = centers[selected], x2 = centers[j];
      const lift = Math.min(150, Math.abs(x1 - x2) * 0.45 + 30);
      svg.appendChild(svgEl("path", {
        d: `M ${x1} ${y - 26} C ${x1} ${y - 26 - lift}, ${x2} ${y - 26 - lift}, ${x2} ${y - 26}`,
        fill: "none", stroke: col,
        "stroke-width": Math.max(1, wt * 13),
        "stroke-opacity": Math.max(0.22, wt),
        "stroke-linecap": "round",
      }));
      if (wt > 0.05) {
        svg.appendChild(svgEl("text", {
          x: x2, y: y - 38, "text-anchor": "middle",
          "font-size": 11.5, fill: col,
          stroke: C.bg, "stroke-width": 3, "paint-order": "stroke",
        }, Math.round(wt * 100) + "%"));
      }
    });

    ws.forEach((w, i) => {
      const g = svgEl("g", { class: "attn-word" });
      g.appendChild(svgEl("text", {
        x: centers[i], y, "text-anchor": "middle", "font-size": 18,
        "font-weight": i === selected ? 700 : 400,
        fill: i === selected ? col : C.ink,
      }, w));
      if (i === selected) {
        const hw = w.length * 5 + 8;
        g.appendChild(svgEl("rect", { x: centers[i] - hw, y: y + 8, width: hw * 2, height: 3, rx: 1.5, fill: col }));
      }
      const hw = w.length * 6 + 12;
      const hit = svgEl("rect", { x: centers[i] - hw, y: y - 30, width: hw * 2, height: 55, fill: "transparent" });
      g.appendChild(hit);
      g.addEventListener("click", () => { selected = i; render(); });
      svg.appendChild(g);
    });

    svg.appendChild(svgEl("text", {
      x: W / 2, y: 236, "text-anchor": "middle", "font-size": 12.5,
      "font-style": "italic", fill: C.faint,
    }, `where “${ws[selected].replace(/\.$/, "")}” is looking — click any word`));

    renderStory(ws, weights);
  }

  function renderStory(ws, weights) {
    const el = $("#attn-story");
    const name = ws[selected].replace(/\.$/, "");
    if (head === 1) {
      el.innerHTML = `This head always glances at the <b>previous word</b> — real transformers learn plenty of plain, grammatical heads like this.`;
      return;
    }
    if (head === 2) {
      el.innerHTML = `This head keeps an eye on the <b>start of the sentence</b> — a common anchor pattern in real models.`;
      return;
    }
    if (selected === 6) {
      const target = variant === "hungry" ? "robot" : "apple";
      const why = variant === "hungry" ? "robots get hungry; apples don't" : "apples are delicious; robots aren't";
      el.innerHTML = `<b>“it”</b> pulls mostly from <b>“${target}”</b>, because ${why}. Its vector — identical for every “it” ever typed — gets nudged toward <i>${target}</i>-ness, right there in the space from chapter 2. Flip the ending and the nudge flips with it.`;
    } else {
      const top = weights
        .map((w, i) => ({ w, i }))
        .filter((o) => o.i !== selected)
        .sort((a, b) => b.w - a.w)[0];
      el.innerHTML = `<b>“${name}”</b> pulls mostly from <b>“${ws[top.i].replace(/\.$/, "")}”</b> — that word's meaning flows in and refines this one's vector. Every position does this simultaneously, at every layer.`;
    }
  }

  $$("#attn-variant .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      variant = b.dataset.variant;
      $$("#attn-variant .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      render();
    })
  );
  $$("#attn-heads .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      head = +b.dataset.head;
      $$("#attn-heads .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      render();
    })
  );
  render();
})();

/* ============================================================
   CH 4 — DEPTH
   ============================================================ */
(function initBuilder() {
  const layers = $("#layers-slider"), heads = $("#heads-slider"), dmodel = $("#model-dim-slider");
  const VOCAB = 50257;
  const KNOWN = [
    { name: "GPT-2 small", p: 124e6 },
    { name: "GPT-2 XL", p: 1.5e9 },
    { name: "GPT-3", p: 175e9 },
    { name: "the largest frontier models", p: 1.8e12 },
  ];

  function fmt(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(n >= 1e13 ? 0 : 1) + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    return Math.round(n / 1e3) + "K";
  }

  function render() {
    const L = +layers.value, D = +dmodel.value;
    $("#layers-out").textContent = L;
    $("#heads-out").textContent = heads.value;
    $("#model-dim-out").textContent = D.toLocaleString();

    const params = 12 * L * D * D + VOCAB * D;
    $("#param-count").textContent = fmt(params);

    let cmp = KNOWN[0];
    for (const k of KNOWN) if (params >= k.p * 0.5) cmp = k;
    const ratio = params / cmp.p;
    const rel = ratio >= 0.85 && ratio <= 1.3
      ? `about the size of <b>${cmp.name}</b>`
      : ratio < 1
        ? `${Math.max(1, Math.round((1 / ratio) * 10) / 10)}× smaller than <b>${cmp.name}</b>`
        : `${Math.round(ratio * 10) / 10}× larger than <b>${cmp.name}</b>`;
    $("#param-compare").innerHTML = rel;

    const tower = $("#tower");
    const H = +heads.value;
    tower.innerHTML = "";
    const shown = Math.min(L, 12);
    // each block = attention row (one segment per head) over an MLP bar
    const blockH = Math.max(9, Math.floor(280 / shown) - 5);
    const attnH = Math.max(5, Math.round(blockH * 0.58));
    const mlpH = Math.max(3, blockH - attnH - 2);
    const width = Math.min(100, 38 + Math.log2(D) * 5.5) + "%";
    const segs = Math.min(H, 32);
    for (let i = 0; i < shown; i++) {
      const layer = document.createElement("div");
      layer.className = "tower-layer";
      layer.style.width = width;
      layer.style.animationDelay = i * 15 + "ms";
      const attn = document.createElement("div");
      attn.className = "attn-row";
      attn.style.height = attnH + "px";
      for (let s = 0; s < segs; s++) attn.appendChild(document.createElement("div")).className = "head-seg";
      attn.title = H + " attention heads";
      const mlp = document.createElement("div");
      mlp.className = "mlp-row";
      mlp.style.height = mlpH + "px";
      mlp.title = "feed-forward network (MLP)";
      layer.append(attn, mlp);
      tower.appendChild(layer);
    }
    if (L > shown) {
      const dots = document.createElement("div");
      dots.className = "tower-ellipsis";
      dots.textContent = "⋮";
      tower.appendChild(dots); // column-reverse → renders at the top
    }
    $("#tower-count").textContent = L + (L > shown ? ` (showing ${shown})` : "");
    const capNote = H > segs ? ` — head segments capped at ${segs} for legibility` : "";
    tower.title = `${L} blocks × (${H}-head attention + MLP)` + capNote;
  }

  [layers, heads, dmodel].forEach((s) => s.addEventListener("input", render));

  const PRESETS = {
    tiny: { l: 2, h: 2, d: 128 },
    gpt2: { l: 12, h: 12, d: 768 },
    gpt3: { l: 96, h: 96, d: 12288 },
  };
  $$("button[data-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = PRESETS[b.dataset.preset];
      layers.value = p.l; heads.value = p.h; dmodel.value = p.d;
      render();
    })
  );
  render();
})();

/* ============================================================
   CH 5 — THE OUTPUT (temperature)
   ============================================================ */
(function initPrediction() {
  const CANDIDATES = [
    { word: "mat", logit: 4.0 },
    { word: "sofa", logit: 2.9 },
    { word: "floor", logit: 2.6 },
    { word: "roof", logit: 1.7 },
    { word: "dog", logit: 0.9 },
    { word: "moon", logit: 0.1 },
    { word: "spaceship", logit: -0.9 },
  ];

  const chart = $("#prob-chart");
  const temp = $("#temp-slider");
  const slot = $("#predict-slot");
  const log = $("#sample-log");
  let lastSampled = -1;

  const rows = CANDIDATES.map((c) => {
    const row = document.createElement("div");
    row.className = "prob-row";
    row.innerHTML = `
      <div class="prob-word">${c.word}</div>
      <div class="prob-track"><div class="prob-fill" style="width:0%"></div></div>
      <div class="prob-pct">0%</div>`;
    chart.appendChild(row);
    return row;
  });

  function softmax(T) {
    const exps = CANDIDATES.map((c) => Math.exp(c.logit / T));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  function mood(T) {
    if (T < 0.35) return "near-deterministic";
    if (T < 0.8) return "conservative";
    if (T < 1.3) return "balanced";
    if (T < 1.9) return "adventurous";
    return "chaotic";
  }

  function render() {
    const T = +temp.value;
    $("#temp-out").textContent = T.toFixed(2);
    $("#temp-mood").textContent = mood(T);
    softmax(T).forEach((p, i) => {
      rows[i].querySelector(".prob-fill").style.width = (p * 100).toFixed(1) + "%";
      rows[i].querySelector(".prob-pct").textContent = (p * 100).toFixed(1) + "%";
      rows[i].classList.toggle("sampled", i === lastSampled);
    });
  }

  temp.addEventListener("input", () => { lastSampled = -1; render(); });

  $("#sample-btn").addEventListener("click", () => {
    const probs = softmax(+temp.value);
    let r = Math.random(), idx = 0;
    for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) { idx = i; break; } }
    lastSampled = idx;
    slot.textContent = CANDIDATES[idx].word;
    slot.classList.remove("pulse"); void slot.offsetWidth; slot.classList.add("pulse");
    const chip = document.createElement("span");
    chip.className = "token-chip";
    chip.style.color = C.yellow;
    chip.style.borderColor = alpha(C.yellow, 0.5);
    chip.style.background = alpha(C.yellow, 0.06);
    chip.textContent = CANDIDATES[idx].word;
    log.appendChild(chip);
    if (log.children.length > 24) log.removeChild(log.firstChild);
    render();
  });

  $("#reset-samples").addEventListener("click", () => {
    log.innerHTML = ""; slot.textContent = "___"; lastSampled = -1; render();
  });

  render();
})();

/* ============================================================
   CH 6 — LIVE INFERENCE
   The full autoregressive loop, animated: embed → blocks →
   unembed → distribution → sample → append → repeat.
   ============================================================ */
(function initInference() {
  const PROMPTS = [
    ["The", "cat", "sat", "on", "the"],
    ["Once", "upon", "a", "time"],
    ["The", "robot", "dreamed", "of"],
  ];

  /* A tiny hand-written bigram "language model": last word → weighted next words */
  const LM = {
    the: [["cat", 2.2], ["moon", 1.6], ["robot", 1.5], ["garden", 1.1], ["old", 1.0], ["apple", 0.8]],
    cat: [["sat", 2.4], ["slept", 1.6], ["purred", 1.4], ["jumped", 1.2], ["stared", 0.8]],
    sat: [["on", 2.6], ["quietly", 1.2], ["beside", 1.0]],
    on: [["the", 2.8], ["a", 1.4], ["top", 0.6]],
    a: [["soft", 1.6], ["warm", 1.5], ["little", 1.4], ["quiet", 1.2]],
    mat: [[".", 2.5], ["and", 1.4], ["near", 0.8]],
    moon: [[".", 1.8], ["rose", 1.6], ["glowed", 1.5]],
    robot: [["dreamed", 1.6], ["hummed", 1.4], ["smiled", 1.2], ["woke", 1.0]],
    of: [["electric", 1.8], ["the", 1.4], ["distant", 1.2]],
    electric: [["sheep", 2.6], ["stars", 1.2]],
    sheep: [[".", 2.2], ["and", 1.0]],
    time: [["there", 2.2], ["a", 1.0]],
    there: [["was", 2.4], ["lived", 1.6]],
    was: [["a", 2.2], ["nothing", 0.9]],
    lived: [["a", 2.4]],
    once: [["upon", 2.2]],
    upon: [["a", 2.6]],
    dreamed: [["of", 2.6], ["quietly", 0.8]],
    soft: [["mat", 1.8], ["pillow", 1.6], ["blanket", 1.2]],
    warm: [["blanket", 1.6], ["mat", 1.5], ["windowsill", 1.4]],
    little: [["cat", 1.8], ["house", 1.6], ["robot", 1.2]],
    quiet: [["garden", 1.6], ["house", 1.4], ["night", 1.4]],
    old: [["cat", 1.8], ["house", 1.5], ["robot", 1.0]],
    garden: [[".", 1.8], ["and", 1.0], ["where", 0.8]],
    slept: [["on", 1.6], ["all", 1.2], [".", 1.0]],
    purred: [["softly", 1.8], [".", 1.4]],
    softly: [[".", 2.0], ["and", 0.8]],
    jumped: [["onto", 1.8], ["over", 1.4]],
    onto: [["the", 2.6]],
    over: [["the", 2.6]],
    stared: [["at", 2.4]],
    at: [["the", 2.6]],
    top: [["of", 2.4]],
    hummed: [["softly", 1.6], ["a", 1.4]],
    smiled: [[".", 2.0]],
    woke: [["up", 2.2]],
    up: [[".", 1.6], ["slowly", 1.2]],
    slowly: [[".", 2.0]],
    rose: [["over", 1.8], [".", 1.2]],
    glowed: [["softly", 1.6], [".", 1.2]],
    beside: [["the", 2.4]],
    quietly: [[".", 1.6], ["on", 1.0]],
    and: [["the", 2.0], ["purred", 1.0], ["slept", 1.0]],
    nothing: [[".", 1.4], ["could", 1.0]],
    could: [["stop", 1.6]],
    stop: [["the", 1.6], [".", 1.0]],
    house: [[".", 1.6], ["near", 1.0]],
    near: [["the", 2.4]],
    night: [[".", 2.0]],
    pillow: [[".", 1.8], ["and", 0.8]],
    blanket: [[".", 1.8], ["and", 0.8]],
    windowsill: [[".", 2.0]],
    stars: [[".", 2.0]],
    where: [["the", 2.2]],
    all: [["day", 2.0]],
    day: [[".", 2.2]],
    apple: [["fell", 1.8], [".", 1.0]],
    fell: [[".", 1.6], ["slowly", 1.0]],
    distant: [["stars", 1.8], ["moons", 1.2]],
    moons: [[".", 2.0]],
  };
  const FALLBACK = [[".", 1.5], ["the", 1.2], ["and", 1.0]];
  const MAX_NEW = 16;

  const ctxEl = $("#inf-context");
  const distEl = $("#inf-dist");
  const statusEl = $("#inf-status");
  const playBtn = $("#inf-play");

  let promptIdx = 0;
  let ctx = [];
  let playing = false;
  let busy = false;
  let done = false;
  let run = 0; // cancellation token

  const speedOf = () => +$("#inf-speed").value;
  const tempOf = () => +$("#inf-temp").value;
  $("#inf-temp").addEventListener("input", () => ($("#inf-temp-out").textContent = tempOf().toFixed(2)));

  const sleep = (ms, myRun) =>
    new Promise((res) => setTimeout(res, ms / speedOf())).then(() => {
      if (myRun !== run) throw new Error("cancelled");
    });

  function renderCtx(freshIdx = -1) {
    ctxEl.innerHTML = "";
    ctx.forEach((w, i) => {
      const t = document.createElement("span");
      t.className = "inf-tok" + (i === freshIdx ? " fresh" : "");
      t.textContent = w;
      ctxEl.appendChild(t);
    });
  }

  function distFor(lastWord, T) {
    const cands = LM[lastWord.toLowerCase().replace(/[^a-z]/g, "")] || FALLBACK;
    const exps = cands.map(([, w]) => Math.exp(w / T));
    const sum = exps.reduce((a, b) => a + b, 0);
    return cands.map(([word], i) => ({ word, p: exps[i] / sum })).sort((a, b) => b.p - a.p);
  }

  function renderDist(dist, sampledWord = null) {
    distEl.innerHTML = "";
    dist.slice(0, 5).forEach(({ word, p }) => {
      const row = document.createElement("div");
      row.className = "prob-row" + (word === sampledWord ? " sampled" : "");
      row.innerHTML = `
        <div class="prob-word">${word === "." ? "." : word}</div>
        <div class="prob-track"><div class="prob-fill" style="width:0%"></div></div>
        <div class="prob-pct">${(p * 100).toFixed(0)}%</div>`;
      distEl.appendChild(row);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => (row.querySelector(".prob-fill").style.width = (p * 100).toFixed(1) + "%"))
      );
    });
  }

  /* ---------- the stage: words → vectors → cubes → distribution ---------- */
  const stage = $("#inf-stage");
  const MAXSHOW = 6;
  const S_TOP = 26, S_BOT = 252;
  const X_WORD = 100, X_START = 118, X_END = 700;
  const CUBE_W = 76, CUBE_D = 16, DYF = 0.7;
  const CUBES = [
    { x: 192, kind: "attn" }, { x: 322, kind: "mlp" },
    { x: 452, kind: "attn" }, { x: 582, kind: "mlp" },
  ];
  const CELLS = 5, CELL_W = 7, CELL_H = 12, STRIP_W = CELLS * (CELL_W + 1) - 1;

  /* diverging blue ↔ red cells, same language as the chapter-2 strips */
  const cellColor = (v) => {
    const mid = [40, 52, 44];
    const pole = v < 0 ? [88, 196, 221] : [252, 98, 85];
    const t = Math.min(1, Math.abs(v));
    return `rgb(${mid.map((m, i) => Math.round(m + (pole[i] - m) * t)).join(",")})`;
  };
  /* a token's vector after `phase` transformations — deterministic, so
     the same word always enters the same and leaves changed */
  const vecVal = (word, phase, k) => Math.sin(hash01(word, phase * 13 + k * 3) * 12.9);

  const laneG = svgEl("g"), cubeG = svgEl("g"), arcG = svgEl("g"),
        stripG = svgEl("g"), wordG = svgEl("g"), noteG = svgEl("g");
  [laneG, cubeG, arcG, stripG, wordG, noteG].forEach((g) => stage.appendChild(g));

  function buildCube(c, idx) {
    const col = c.kind === "attn" ? C.blue : C.gold;
    const x = c.x, y = S_TOP, w = CUBE_W, h = S_BOT - S_TOP, d = CUBE_D;
    const g = svgEl("g", { class: "inf-cube" });
    const pts = (a) => a.map((p) => p.join(",")).join(" ");
    /* side + top faces */
    g.appendChild(svgEl("polygon", {
      points: pts([[x + w, y], [x + w + d, y - d * DYF], [x + w + d, y + h - d * DYF], [x + w, y + h]]),
      fill: alpha(col, 0.05), stroke: alpha(col, 0.2), "stroke-width": 1,
    }));
    g.appendChild(svgEl("polygon", {
      points: pts([[x, y], [x + d, y - d * DYF], [x + w + d, y - d * DYF], [x + w, y]]),
      fill: alpha(col, 0.08), stroke: alpha(col, 0.2), "stroke-width": 1,
    }));
    /* depth slices, back → front: heads of an attention block,
       weight matrices of an MLP */
    const n = c.kind === "attn" ? 4 : 2;
    c.slices = [];
    for (let i = 0; i < n; i++) {
      const t = (n - i) / (n + 1);
      const s = svgEl("rect", {
        x: x + d * t, y: y - d * DYF * t, width: w, height: h, rx: 1.5,
        fill: col, "fill-opacity": 0.06,
        stroke: alpha(col, 0.3), "stroke-width": 1,
        class: "cube-slice",
      });
      s.style.setProperty("--i", i);
      g.appendChild(s);
      c.slices.push(s);
    }
    g.appendChild(svgEl("rect", {
      x, y, width: w, height: h, rx: 2, fill: "none",
      stroke: col, "stroke-opacity": 0.5, "stroke-width": 1.2, class: "cube-front",
    }));
    g.appendChild(svgEl("text", {
      x: x + w / 2 + d / 2, y: S_BOT + 17, "text-anchor": "middle",
      "font-size": 11.5, "font-style": "italic", fill: C.faint,
    }, c.kind === "attn" ? "attention" : "MLP"));
    c.el = g;
    cubeG.appendChild(g);
  }
  CUBES.forEach(buildCube);
  [0, 1].forEach((L) => {
    const cx = (CUBES[L * 2].x + CUBES[L * 2 + 1].x + CUBE_W) / 2 + CUBE_D / 2;
    cubeG.appendChild(svgEl("text", {
      x: cx, y: S_BOT + 36, "text-anchor": "middle",
      "font-size": 11, "font-style": "italic", fill: C.faint,
    }, L === 0 ? "layer 1" : "layer 2 ⋯ of many"));
  });

  let stageTokens = [], laneY = [], strips = [];

  function stageBuild() {
    stageTokens = ctx.slice(-MAXSHOW);
    const n = stageTokens.length;
    laneY = stageTokens.map((_, i) => (n === 1 ? 140 : 46 + i * (196 / (n - 1))));
    laneG.innerHTML = ""; wordG.innerHTML = ""; stripG.innerHTML = "";
    arcG.innerHTML = ""; noteG.innerHTML = "";
    strips = [];
    stageTokens.forEach((w, i) => {
      laneG.appendChild(svgEl("line", {
        x1: X_START - 6, y1: laneY[i], x2: X_END, y2: laneY[i],
        stroke: C.grid, "stroke-width": 1,
      }));
      const isLast = i === n - 1;
      wordG.appendChild(svgEl("text", {
        x: X_WORD, y: laneY[i] + 4.5, "text-anchor": "end", "font-size": 13.5,
        fill: isLast ? C.ink : C.muted, "font-weight": isLast ? 600 : 400,
      }, w));
    });
    if (ctx.length > MAXSHOW) {
      noteG.appendChild(svgEl("text", {
        x: X_WORD, y: 16, "text-anchor": "end", "font-size": 10.5,
        "font-style": "italic", fill: C.faint,
      }, `⋯ ${ctx.length - MAXSHOW} earlier tokens`));
    }
  }

  function stripColors(phase) {
    strips.forEach((g, i) => {
      [...g.querySelectorAll("rect.cell")].forEach((r, k) =>
        r.setAttribute("fill", cellColor(vecVal(stageTokens[i], phase, k))));
    });
  }

  async function glideAll(centerX, ms, myRun) {
    const dur = ms / speedOf();
    strips.forEach((g, i) => {
      g.style.transition = `transform ${dur}ms cubic-bezier(.45,.05,.3,1), opacity .3s`;
      g.style.transform = `translate(${centerX - STRIP_W / 2}px, ${laneY[i]}px)`;
    });
    await sleep(ms + 40, myRun);
  }

  async function stageEmbed(myRun) {
    stageBuild();
    stageTokens.forEach((w, i) => {
      const g = svgEl("g", { class: "inf-vec" });
      for (let k = 0; k < CELLS; k++) {
        const r = svgEl("rect", {
          x: k * (CELL_W + 1), y: -CELL_H / 2, width: CELL_W, height: CELL_H,
          rx: 1.5, fill: cellColor(vecVal(w, 0, k)), class: "cell",
        });
        r.style.transition = "fill .35s";
        g.appendChild(r);
      }
      if (i === stageTokens.length - 1) {
        g.appendChild(svgEl("rect", {
          x: -3, y: -CELL_H / 2 - 3, width: STRIP_W + 6, height: CELL_H + 6,
          rx: 3, fill: "none", stroke: alpha(C.yellow, 0.85), "stroke-width": 1,
        }));
      }
      g.style.transform = `translate(${X_START}px, ${laneY[i]}px)`;
      g.style.opacity = 0;
      stripG.appendChild(g);
      strips.push(g);
    });
    await sleep(60, myRun);
    strips.forEach((g) => { g.style.transition = "opacity .3s"; g.style.opacity = 1; });
    await sleep(400, myRun);
  }

  async function stageAttention(L, myRun) {
    const cube = CUBES[L * 2];
    cube.el.classList.add("active");
    await glideAll(cube.x + (CUBE_W + CUBE_D) / 2, 520, myRun);
    /* every token reaches back along the context */
    const axisX = cube.x + CUBE_W / 2;
    const arcs = [];
    for (let i = 1; i < stageTokens.length; i++) {
      for (let j = 0; j < i; j++) {
        const wt = 0.15 + 0.85 * hash01(stageTokens[i] + stageTokens[j], L + 3);
        const bulge = 16 + (i - j) * 9;
        const a = svgEl("path", {
          d: `M ${axisX} ${laneY[i]} C ${axisX - bulge} ${laneY[i]}, ${axisX - bulge} ${laneY[j]}, ${axisX} ${laneY[j]}`,
          fill: "none", stroke: C.blue,
          "stroke-width": (0.8 + wt * 2.4).toFixed(1),
          "stroke-linecap": "round", opacity: 0,
        });
        a.style.transition = "opacity .25s";
        arcG.appendChild(a);
        arcs.push([a, 0.14 + wt * 0.56]);
      }
    }
    await sleep(50, myRun);
    arcs.forEach(([a, o]) => (a.style.opacity = o));
    await sleep(620, myRun);
    stripColors(L * 2 + 1); /* the vectors leave changed */
    arcs.forEach(([a]) => (a.style.opacity = 0));
    await sleep(280, myRun);
    arcG.innerHTML = "";
    cube.el.classList.remove("active");
  }

  async function stageMLP(L, myRun) {
    const cube = CUBES[L * 2 + 1];
    cube.el.classList.add("active");
    await glideAll(cube.x + (CUBE_W + CUBE_D) / 2, 520, myRun);
    await sleep(430, myRun);
    stripColors(L * 2 + 2);
    await sleep(260, myRun);
    cube.el.classList.remove("active");
  }

  async function stageUnembed(myRun) {
    await glideAll(X_END - STRIP_W / 2 - 4, 480, myRun);
    strips.forEach((g, i) => { if (i < strips.length - 1) g.style.opacity = 0.22; });
    await sleep(340, myRun);
  }

  function stageCalm() {
    CUBES.forEach((c) => c.el.classList.remove("active"));
    arcG.innerHTML = "";
  }

  async function step() {
    if (busy || done) return;
    busy = true;
    const myRun = run;
    try {
      /* 1 — read the context */
      statusEl.innerHTML = "Reading the context…";
      [...ctxEl.children].forEach((c) => c.classList.add("reading"));
      await sleep(420, myRun);
      [...ctxEl.children].forEach((c) => c.classList.remove("reading"));

      /* 2 — forward pass */
      statusEl.innerHTML = "Each word becomes a vector…";
      await stageEmbed(myRun);
      for (let L = 0; L < 2; L++) {
        statusEl.innerHTML = `Layer ${L + 1} — attention: every token reaches back along the context…`;
        await stageAttention(L, myRun);
        statusEl.innerHTML = `Layer ${L + 1} — MLP: each vector refined on its own…`;
        await stageMLP(L, myRun);
      }
      statusEl.innerHTML = "The <b>last</b> vector — now carrying the whole context — is matched against every word…";
      await stageUnembed(myRun);

      /* 3 — distribution */
      const dist = distFor(ctx[ctx.length - 1], tempOf());
      statusEl.innerHTML = "Softmax → a probability for every token…";
      renderDist(dist);
      await sleep(650, myRun);

      /* 4 — sample */
      let r = Math.random(), pick = dist[0];
      for (const c of dist) { r -= c.p; if (r <= 0) { pick = c; break; } }
      renderDist(dist, pick.word);
      statusEl.innerHTML = `Sampled <b>“${pick.word}”</b> (p = ${(pick.p * 100).toFixed(0)}%) — appending it to the context.`;
      await sleep(500, myRun);

      /* 5 — append & loop */
      ctx.push(pick.word);
      renderCtx(ctx.length - 1);
      if (pick.word === "." || ctx.length - PROMPTS[promptIdx].length >= MAX_NEW) {
        done = true;
        playing = false;
        playBtn.textContent = "▶ Play";
        statusEl.innerHTML = `Generation complete: <b>“${ctx.join(" ").replace(/ \./g, ".")}”</b> — restart to run it again.`;
      }
      await sleep(320, myRun);
    } catch (e) {
      /* cancelled — a reset/new prompt took over */
    } finally {
      if (myRun === run) { stageCalm(); busy = false; }
    }
  }

  async function playLoop() {
    const myRun = run;
    while (playing && !done && myRun === run) {
      await step();
      if (myRun !== run) return;
      try { await sleep(200, myRun); } catch { return; }
    }
  }

  function reset() {
    run++;
    busy = false;
    playing = false;
    done = false;
    playBtn.textContent = "▶ Play";
    ctx = [...PROMPTS[promptIdx]];
    renderCtx();
    distEl.innerHTML = "";
    stageCalm();
    stageBuild();
    statusEl.textContent = "Press play to start generating.";
  }

  playBtn.addEventListener("click", () => {
    if (done) reset();
    playing = !playing;
    playBtn.textContent = playing ? "❚❚ Pause" : "▶ Play";
    if (playing) playLoop();
  });
  $("#inf-step").addEventListener("click", () => {
    if (done) reset();
    if (!playing) step();
  });
  $("#inf-reset").addEventListener("click", reset);
  $$("#inf-prompts .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      promptIdx = +b.dataset.prompt;
      $$("#inf-prompts .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      reset();
    })
  );

  reset();
})();

/* ============================================================
   Chapter nav highlighting
   ============================================================ */
(function initNav() {
  const links = $$("#stepnav a");
  const sections = links.map((a) => $(a.getAttribute("href")));
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const idx = sections.indexOf(e.target);
        links.forEach((l, i) => l.classList.toggle("active", i === idx));
      });
    },
    { rootMargin: "-40% 0px -50% 0px" }
  );
  sections.forEach((s) => obs.observe(s));

  // the margin numerals appear only once the hero (which carries the full
  // contents list) has left the screen
  const nav = $("#stepnav");
  const hero = document.querySelector(".hero");
  if (nav && hero) {
    new IntersectionObserver(
      ([e]) => nav.classList.toggle("shown", !e.isIntersecting),
      { threshold: 0.15 }
    ).observe(hero);
  }
})();
