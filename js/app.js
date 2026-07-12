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
  ink: "#e8eaf0",
  muted: "#8b93a7",
  faint: "#5c6478",
  grid: "#1a2233",
  axis: "#39435c",
  bg: "#0b0e14",
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

  /* --- the coordinate plane --- */
  const W = 720, H = 520;
  const OX = 360, OY = 268;      // origin in px
  const U = 50;                  // px per unit
  const toPx = (x, y) => [OX + x * U, OY - y * U];
  const toUnits = (px, py) => [(px - OX) / U, (OY - py) / U];

  const CLUSTERS = [
    { name: "animals", color: C.blue, cx: -3.5, cy: 2.3,
      words: ["cat", "dog", "kitten", "puppy", "horse", "tiger"] },
    { name: "food", color: C.yellow, cx: 2.9, cy: 2.6,
      words: ["pizza", "apple", "cake", "sushi", "bread"] },
    { name: "feelings", color: C.red, cx: -3.6, cy: -2.5,
      words: ["happy", "sad", "angry", "calm"] },
    { name: "royalty", color: C.green, cx: 3.0, cy: -2.3,
      words: ["king", "queen", "man", "woman", "prince"] },
  ];
  /* hand-placed offsets (units) so the analogy geometry works */
  const OFFSETS = {
    king: [-0.9, 0.75], queen: [0.95, 0.65], man: [-1.15, -0.7], woman: [0.7, -0.8], prince: [-0.05, -0.05],
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

  /* gridlines */
  const gridG = svgEl("g");
  for (let x = OX % U; x <= W; x += U)
    gridG.appendChild(svgEl("line", { x1: x, y1: 0, x2: x, y2: H, stroke: C.grid, "stroke-width": 1 }));
  for (let y = OY % U; y <= H; y += U)
    gridG.appendChild(svgEl("line", { x1: 0, y1: y, x2: W, y2: y, stroke: C.grid, "stroke-width": 1 }));
  svg.appendChild(gridG);

  /* axes */
  svg.appendChild(svgEl("line", { x1: 14, y1: OY, x2: W - 14, y2: OY, stroke: C.axis, "stroke-width": 1.6, "marker-end": "url(#arr-axis)", "marker-start": "url(#arr-axis)" }));
  svg.appendChild(svgEl("line", { x1: OX, y1: H - 14, x2: OX, y2: 14, stroke: C.axis, "stroke-width": 1.6, "marker-end": "url(#arr-axis)", "marker-start": "url(#arr-axis)" }));
  svg.appendChild(svgEl("text", { x: W - 18, y: OY - 10, "text-anchor": "end", fill: C.faint, "font-size": 13, "font-style": "italic" }, "dimension 1"));
  svg.appendChild(svgEl("text", { x: OX + 10, y: 26, fill: C.faint, "font-size": 13, "font-style": "italic" }, "dimension 2"));
  /* axis tick numbers */
  for (let x = -6; x <= 6; x += 2) {
    if (x === 0) continue;
    const [px] = toPx(x, 0);
    if (px < 20 || px > W - 20) continue;
    svg.appendChild(svgEl("text", { x: px, y: OY + 16, "text-anchor": "middle", fill: C.faint, "font-size": 11 }, x));
  }
  for (let y = -4; y <= 4; y += 2) {
    if (y === 0) continue;
    const [, py] = toPx(0, y);
    if (py < 20 || py > H - 20) continue;
    svg.appendChild(svgEl("text", { x: OX - 8, y: py + 4, "text-anchor": "end", fill: C.faint, "font-size": 11 }, y));
  }

  /* layers: analogy under vectors, vectors under dots */
  const analogyLayer = svgEl("g");
  const vectorLayer = svgEl("g");
  svg.appendChild(analogyLayer);
  svg.appendChild(vectorLayer);

  const dots = []; // { word, x, y (units), g, cluster }
  CLUSTERS.forEach((cl) => {
    const [lx, ly] = toPx(cl.cx, cl.cy + 1.6);
    svg.appendChild(svgEl("text", { x: lx, y: ly, "text-anchor": "middle", fill: alpha(cl.color, 0.5), "font-size": 13, "font-style": "italic" }, cl.name));
    cl.words.forEach((w) => {
      const off = OFFSETS[w] || [(hash01(w, 1) - 0.5) * 2.4, (hash01(w, 2) - 0.5) * 2.0];
      const x = cl.cx + off[0], y = cl.cy + off[1];
      const [px, py] = toPx(x, y);
      const g = svgEl("g", { class: "embed-dot", transform: `translate(${px},${py})` });
      g.appendChild(svgEl("circle", { r: 5.5, fill: cl.color, stroke: C.bg, "stroke-width": 1.5 }));
      g.appendChild(svgEl("text", { y: -11, "text-anchor": "middle", "font-size": 14.5, fill: C.ink }, w));
      svg.appendChild(g);
      dots.push({ word: w, x, y, g, cluster: cl });
    });
  });

  const readout = $("#neighbor-readout");
  let selected = null;

  function cosine(a, b) {
    const dot = a.x * b.x + a.y * b.y;
    const na = Math.hypot(a.x, a.y), nb = Math.hypot(b.x, b.y);
    return na && nb ? dot / (na * nb) : 0;
  }

  function renderVector() {
    vectorLayer.innerHTML = "";
    if (!selected) return;
    const [px, py] = toPx(selected.x, selected.y);
    vectorLayer.appendChild(svgEl("line", {
      x1: OX, y1: OY, x2: px, y2: py,
      stroke: selected.cluster.color, "stroke-width": 2.4,
      "marker-end": `url(#arr-${selected.cluster.name})`,
      opacity: 0.95,
    }));
    const neighbors = dots
      .filter((d) => d !== selected)
      .map((d) => ({ d, sim: cosine(selected, d) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
    readout.innerHTML =
      `<b>${selected.word}</b>&nbsp; = (${selected.x.toFixed(1)}, ${selected.y.toFixed(1)}) &nbsp;·&nbsp; most similar: ` +
      neighbors.map((n) => `<b>${n.d.word}</b> <span style="color:${C.faint}">cos&nbsp;=&nbsp;${n.sim.toFixed(2)}</span>`).join(", ") +
      ` <span style="color:${C.faint}">&nbsp;(1 = same direction, 0 = unrelated, −1 = opposite)</span>`;
  }

  let dragging = null;
  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  dots.forEach((dot) => {
    dot.g.addEventListener("pointerdown", (e) => {
      dragging = dot;
      selected = dot;
      dot.g.classList.add("dragging");
      renderVector();
      e.preventDefault();
    });
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = svgPoint(e);
    const [ux, uy] = toUnits(Math.max(20, Math.min(W - 20, p.x)), Math.max(28, Math.min(H - 24, p.y)));
    dragging.x = ux; dragging.y = uy;
    const [px, py] = toPx(ux, uy);
    dragging.g.setAttribute("transform", `translate(${px},${py})`);
    renderVector();
  });
  window.addEventListener("pointerup", () => {
    if (dragging) dragging.g.classList.remove("dragging");
    dragging = null;
  });

  /* --- king − man + woman ≈ queen --- */
  $("#analogy-btn").addEventListener("click", () => {
    analogyLayer.innerHTML = "";
    const get = (w) => dots.find((d) => d.word === w);
    const king = get("king"), man = get("man"), woman = get("woman"), queen = get("queen");
    const vx = woman.x - man.x, vy = woman.y - man.y;

    const animLine = (x1u, y1u, x2u, y2u, dash) => {
      const [x1, y1] = toPx(x1u, y1u);
      const [x2, y2] = toPx(x2u, y2u);
      const l = svgEl("line", {
        x1, y1, x2: x1, y2: y1,
        stroke: C.teal, "stroke-width": 2.4, "stroke-linecap": "round",
        "marker-end": "url(#arr-teal)",
      });
      if (dash) l.setAttribute("stroke-dasharray", "7 6");
      analogyLayer.appendChild(l);
      const t0 = performance.now();
      (function step(now) {
        const t = Math.min(1, (now - t0) / 600);
        const e = 1 - Math.pow(1 - t, 3);
        l.setAttribute("x2", x1 + (x2 - x1) * e);
        l.setAttribute("y2", y1 + (y2 - y1) * e);
        if (t < 1) requestAnimationFrame(step);
      })(t0);
    };
    const label = (xu, yu, txt) => {
      const [x, y] = toPx(xu, yu);
      analogyLayer.appendChild(svgEl("text", {
        x, y: y - 12, "text-anchor": "middle", "font-size": 13,
        "font-style": "italic", fill: C.teal,
      }, txt));
    };

    animLine(man.x, man.y, woman.x, woman.y);
    label((man.x + woman.x) / 2, (man.y + woman.y) / 2, "woman − man");
    setTimeout(() => {
      animLine(king.x, king.y, king.x + vx, king.y + vy, true);
      label(king.x + vx / 2, king.y + vy / 2, "same vector, from king");
    }, 750);
    setTimeout(() => {
      const [qx, qy] = toPx(queen.x, queen.y);
      analogyLayer.appendChild(svgEl("circle", {
        cx: qx, cy: qy, r: 18, fill: "none",
        stroke: C.teal, "stroke-width": 2, "stroke-dasharray": "4 4",
      }));
      readout.innerHTML = `<b>king − man + woman ≈ queen</b> — the same “gender” vector works anywhere in the space. Directions carry meaning.`;
    }, 1600);
    setTimeout(() => (analogyLayer.innerHTML = ""), 6500);
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
        style: wt > 0.3 ? `filter: drop-shadow(0 0 6px ${alpha(col, 0.5)})` : "",
      }));
      if (wt > 0.05) {
        svg.appendChild(svgEl("text", {
          x: x2, y: y - 36, "text-anchor": "middle",
          "font-size": 11.5, fill: col,
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
      el.innerHTML = `<b>“it”</b> attends mostly to <b>“${target}”</b>, because ${why}. Flip the ending and the attention flips with it — context resolving reference.`;
    } else {
      const top = weights
        .map((w, i) => ({ w, i }))
        .filter((o) => o.i !== selected)
        .sort((a, b) => b.w - a.w)[0];
      el.innerHTML = `<b>“${name}”</b> attends mostly to <b>“${ws[top.i].replace(/\.$/, "")}”</b>. Every position does this simultaneously, at every layer.`;
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
  const nodes = Object.fromEntries($$("#inf-pipeline .pipe-node").map((n) => [n.dataset.node, n]));

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

  function setHot(name, on) { nodes[name]?.classList.toggle("hot", on); }
  function clearHot() { Object.values(nodes).forEach((n) => n.classList.remove("hot")); }

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
      statusEl.innerHTML = "Embedding tokens as vectors…";
      setHot("embed", true);
      await sleep(360, myRun);
      setHot("embed", false);
      for (let b = 0; b < 4; b++) {
        statusEl.innerHTML = `Block ${b + 1}: attention + feed-forward…`;
        setHot("b" + b, true);
        await sleep(260, myRun);
        setHot("b" + b, false);
      }
      statusEl.innerHTML = "Projecting back to vocabulary scores…";
      setHot("unembed", true);
      await sleep(300, myRun);
      setHot("unembed", false);

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
      if (myRun === run) { clearHot(); busy = false; }
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
    clearHot();
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
})();
